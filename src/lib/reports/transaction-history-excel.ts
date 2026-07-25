import ExcelJS from 'exceljs'
import { formatInTimeZone } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TransactionType } from '@/types/database'
import { createSupabaseAdmin } from '@/lib/supabase/server'
import { sanitizeUserString } from './inventory-summary-excel'

const TZ = 'Asia/Jakarta'

const INDO_MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
]

function formatIndonesianDateStr(dateStr?: string | null): string {
  if (!dateStr) return ''
  const datePart = dateStr.split('T')[0]
  if (!datePart) return dateStr
  const parts = datePart.split('-')
  if (parts.length !== 3) return dateStr
  const monthIdx = parseInt(parts[1] ?? '0', 10) - 1
  const day = parseInt(parts[2] ?? '0', 10)
  const year = parts[0]
  if (monthIdx >= 0 && monthIdx < 12) {
    return `${day} ${INDO_MONTHS[monthIdx]} ${year}`
  }
  return dateStr
}

function formatIndonesianDateTime(d: Date): string {
  const day = d.getDate()
  const monthName = INDO_MONTHS[d.getMonth()]
  const year = d.getFullYear()
  const hours = String(d.getHours()).padStart(2, '0')
  const mins = String(d.getMinutes()).padStart(2, '0')
  return `${day} ${monthName} ${year}, ${hours}.${mins} WIB`
}

function getTypeFilterLabel(typeFilter?: string): string {
  if (!typeFilter || typeFilter === 'ALL') return 'Semua Jenis'
  if (typeFilter === 'INITIAL') return 'Stok Awal'
  if (typeFilter === 'IN') return 'Barang Masuk'
  if (typeFilter === 'OUT') return 'Barang Keluar'
  if (typeFilter === 'ADJUSTMENT') return 'Penyesuaian'
  if (typeFilter === 'ADJUSTMENT_IN') return 'Penyesuaian Masuk'
  if (typeFilter === 'ADJUSTMENT_OUT') return 'Penyesuaian Keluar'
  if (typeFilter === 'REVERSAL') return 'Koreksi'
  return typeFilter
}

export interface BuildTransactionHistoryParams {
  dateFromStr: string
  dateToStr: string
  typeFilter?: string
  itemFilter?: string
  institutionName?: string | null
  reportHeaderText?: string | null
}

const TYPE_LABELS: Record<TransactionType, string> = {
  IN: 'Barang Masuk',
  OUT: 'Barang Keluar',
  INITIAL: 'Stok Awal',
  ADJUSTMENT_IN: 'Penyesuaian Masuk',
  ADJUSTMENT_OUT: 'Penyesuaian Keluar',
  REVERSAL: 'Koreksi',
}

/**
 * Builds Excel Workbook for "Riwayat Transaksi" with 3 sheets:
 * 1. Ringkasan
 * 2. Riwayat Transaksi
 * 3. Detail Audit
 */
export async function buildTransactionHistoryWorkbook(
  supabase: SupabaseClient<Database>,
  params: BuildTransactionHistoryParams,
): Promise<Buffer> {
  const { dateFromStr, dateToStr, typeFilter, itemFilter } = params

  const startUtc = `${dateFromStr}T00:00:00+07:00`
  const endUtc = `${dateToStr}T23:59:59.999+07:00`

  // 1. Fetch app_settings if institutionName or reportHeaderText is not supplied
  let instName = params.institutionName
  let headerText = params.reportHeaderText

  if (instName === undefined || headerText === undefined) {
    const { data: settings } = await supabase
      .from('app_settings')
      .select('institution_name, report_header_text')
      .limit(1)
      .maybeSingle()
    if (instName === undefined) instName = settings?.institution_name ?? null
    if (headerText === undefined) headerText = settings?.report_header_text ?? null
  }

  const instNameDisplay =
    instName && instName.trim() !== '' ? instName.trim().toUpperCase() : 'NAMA INSTANSI BELUM DIATUR'
  const headerTextDisplay =
    headerText && headerText.trim() !== '' ? headerText.trim() : 'LAPORAN RIWAYAT TRANSAKSI STOK'
  const typeFilterLabel = getTypeFilterLabel(typeFilter)
  const generatedAtWib = formatIndonesianDateTime(new Date())
  const dateRangeDisplay = `${formatIndonesianDateStr(dateFromStr)} s/d ${formatIndonesianDateStr(dateToStr)}`

  // 2. Fetch up to 10,000 transactions
  const validTypes = ['IN', 'OUT', 'INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL']
  let query = supabase
    .from('stock_transactions')
    .select(
      'id, transaction_number, client_request_id, item_id, transaction_type, input_quantity, base_quantity, conversion_factor_snapshot, quantity_delta, performed_by, transaction_at, stock_before, stock_after, reason, original_transaction_id, is_reversed, reversal_transaction_id, items!item_id(id, sku, name), units!unit_id(id, name, symbol), profiles!performed_by(id, full_name, username)',
    )
    .gte('transaction_at', startUtc)
    .lte('transaction_at', endUtc)
    .order('transaction_at', { ascending: false })
    .limit(10000)

  if (typeFilter === 'ADJUSTMENT') {
    query = query.in('transaction_type', ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
  } else if (typeFilter && typeFilter !== 'ALL' && validTypes.includes(typeFilter)) {
    query = query.eq('transaction_type', typeFilter as TransactionType)
  }

  if (itemFilter) {
    query = query.eq('item_id', itemFilter)
  }

  const { data: transactions } = await query
  const txList = transactions || []
  const txIds = txList.map((t) => t.id)

  // Collect original_transaction_ids to resolve reference transaction numbers
  const origTxIds = Array.from(
    new Set(txList.map((t) => t.original_transaction_id).filter((id): id is string => Boolean(id))),
  )
  const refTxNoMap: Record<string, string> = {}

  if (origTxIds.length > 0) {
    const { data: origTxData } = await supabase
      .from('stock_transactions')
      .select('id, transaction_number')
      .in('id', origTxIds)

    if (origTxData) {
      for (const ot of origTxData) {
        refTxNoMap[ot.id] = ot.transaction_number
      }
    }
  }

  // 3. Fetch historical cost snapshots from private.stock_transaction_costs via admin client
  const costMap: Record<
    string,
    {
      base_unit_cost: number | null
      transaction_value: number | null
      inventory_value_before: number | null
      inventory_value_after: number | null
      has_cost: boolean
    }
  > = {}

  if (txIds.length > 0) {
    try {
      const adminSupabase = createSupabaseAdmin()
      const { data: costsData } = await adminSupabase
        .schema('private')
        .from('stock_transaction_costs')
        .select('transaction_id, base_unit_cost, transaction_value, inventory_value_before, inventory_value_after')
        .in('transaction_id', txIds)

      if (costsData) {
        for (const c of costsData) {
          const costVal =
            c.base_unit_cost !== null && c.base_unit_cost !== undefined ? parseFloat(c.base_unit_cost) : null
          const txVal =
            c.transaction_value !== null && c.transaction_value !== undefined
              ? parseFloat(c.transaction_value)
              : null
          costMap[c.transaction_id] = {
            base_unit_cost: costVal,
            transaction_value: txVal,
            inventory_value_before: c.inventory_value_before !== null ? parseFloat(c.inventory_value_before) : null,
            inventory_value_after: c.inventory_value_after !== null ? parseFloat(c.inventory_value_after) : null,
            has_cost: costVal !== null && !isNaN(costVal),
          }
        }
      }
    } catch {
      // If private schema is unavailable, fallback gracefully
    }
  }

  // 4. Calculate summary metrics
  let totalStokMasuk = 0
  let totalStokKeluar = 0
  let perubahanStokBersih = 0
  let nilaiMutasiMasuk = 0
  let nilaiMutasiKeluar = 0
  let pricedCount = 0
  let unpricedCount = 0

  const rekapMap: Record<
    TransactionType,
    {
      count: number
      stokMasuk: number
      stokKeluar: number
      perubahanBersih: number
      nilaiMutasi: number
      pricedCount: number
    }
  > = {
    INITIAL: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
    IN: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
    OUT: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
    ADJUSTMENT_IN: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
    ADJUSTMENT_OUT: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
    REVERSAL: { count: 0, stokMasuk: 0, stokKeluar: 0, perubahanBersih: 0, nilaiMutasi: 0, pricedCount: 0 },
  }

  for (const tx of txList) {
    const delta = Number(tx.quantity_delta ?? 0)
    const cost = costMap[tx.id]
    const hasCost = cost?.has_cost ?? false
    const txVal = cost?.transaction_value ?? 0

    if (delta > 0) {
      totalStokMasuk += delta
      if (hasCost) nilaiMutasiMasuk += txVal
    } else if (delta < 0) {
      totalStokKeluar += Math.abs(delta)
      if (hasCost) nilaiMutasiKeluar += Math.abs(txVal)
    }
    perubahanStokBersih += delta

    if (hasCost) {
      pricedCount++
    } else {
      unpricedCount++
    }

    const typeGroup = rekapMap[tx.transaction_type]
    if (typeGroup) {
      typeGroup.count++
      if (delta > 0) typeGroup.stokMasuk += delta
      if (delta < 0) typeGroup.stokKeluar += Math.abs(delta)
      typeGroup.perubahanBersih += delta
      if (hasCost) {
        typeGroup.nilaiMutasi += txVal
        typeGroup.pricedCount++
      }
    }
  }

  const selisihNilaiMutasi = nilaiMutasiMasuk - nilaiMutasiKeluar
  const totalTransactions = txList.length
  const allUnpriced = totalTransactions > 0 && pricedCount === 0

  // Create Workbook
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'InventarisBarang'
  workbook.created = new Date()

  // Common border definitions
  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  }

  const currencyFormat = '"Rp"#,##0;[Red]("-Rp"#,##0);"-"'

  // ============================================================================
  // SHEET 1: RINGKASAN
  // ============================================================================
  const wsRingkasan = workbook.addWorksheet('Ringkasan', {
    views: [{ state: 'normal' }],
  })
  wsRingkasan.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  }

  wsRingkasan.columns = [
    { width: 34 }, // A: Metrik / Jenis Transaksi
    { width: 22 }, // B: Nilai / Jumlah Transaksi
    { width: 22 }, // C: Total Kuantitas Masuk
    { width: 22 }, // D: Total Kuantitas Keluar
    { width: 20 }, // E: Perubahan Bersih
    { width: 26 }, // F: Nilai Mutasi
  ]

  // Header Title (Rows 1-4)
  wsRingkasan.mergeCells('A1:F1')
  const r11 = wsRingkasan.getRow(1)
  r11.getCell(1).value = instNameDisplay
  r11.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } }
  r11.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r11.height = 28

  wsRingkasan.mergeCells('A2:F2')
  const r12 = wsRingkasan.getRow(2)
  r12.getCell(1).value = headerTextDisplay
  r12.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r12.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r12.height = 22

  wsRingkasan.mergeCells('A3:F3')
  const r13 = wsRingkasan.getRow(3)
  r13.getCell(1).value = `Periode: ${dateRangeDisplay}`
  r13.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } }
  r13.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r13.height = 18

  wsRingkasan.mergeCells('A4:F4')
  const r14 = wsRingkasan.getRow(4)
  r14.getCell(1).value = `Jenis Transaksi: ${typeFilterLabel}  |  Dibuat pada: ${generatedAtWib}`
  r14.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
  r14.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r14.height = 18

  wsRingkasan.getRow(5).height = 12

  // Section 1: Summary Metrics Table
  wsRingkasan.mergeCells('A6:F6')
  const s1Header = wsRingkasan.getRow(6)
  s1Header.getCell(1).value = 'RINGKASAN METRIK TRANSAKSI'
  s1Header.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  s1Header.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  s1Header.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s1Header.height = 24

  const metricsData = [
    { label: 'Jumlah Transaksi', val: totalTransactions, isCurrency: false, unit: 'transaksi' },
    { label: 'Total Stok Masuk', val: totalStokMasuk, isCurrency: false, unit: 'unit' },
    { label: 'Total Stok Keluar', val: totalStokKeluar, isCurrency: false, unit: 'unit' },
    { label: 'Perubahan Stok Bersih', val: perubahanStokBersih, isCurrency: false, unit: 'unit' },
    { label: 'Nilai Mutasi Masuk', val: allUnpriced ? null : nilaiMutasiMasuk, isCurrency: true },
    { label: 'Nilai Mutasi Keluar', val: allUnpriced ? null : nilaiMutasiKeluar, isCurrency: true },
    { label: 'Selisih Nilai Mutasi', val: allUnpriced ? null : selisihNilaiMutasi, isCurrency: true },
    { label: 'Transaksi Tanpa Harga Historis', val: unpricedCount, isCurrency: false, unit: 'transaksi' },
  ]

  let mRowIdx = 7
  for (const m of metricsData) {
    const row = wsRingkasan.getRow(mRowIdx)
    row.height = 20

    const cellA = row.getCell(1)
    cellA.value = m.label
    cellA.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF334155' } }
    cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }
    cellA.border = thinBorder
    cellA.alignment = { vertical: 'middle', indent: 1 }

    const cellB = row.getCell(2)
    if (m.val === null) {
      cellB.value = 'Nilai mutasi belum dapat dihitung'
      cellB.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }
    } else if (m.isCurrency) {
      cellB.value = m.val
      cellB.numFmt = currencyFormat
      cellB.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      cellB.alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      cellB.value = `${m.val.toLocaleString('id-ID')} ${m.unit || ''}`.trim()
      cellB.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }
    }
    cellB.border = thinBorder

    for (let c = 3; c <= 6; c++) {
      const cellC = row.getCell(c)
      cellC.border = thinBorder
    }

    mRowIdx++
  }

  // Footnote for unpriced transactions
  const fnRow = wsRingkasan.getRow(mRowIdx)
  fnRow.height = 20
  wsRingkasan.mergeCells(`A${mRowIdx}:F${mRowIdx}`)
  const fnCell = fnRow.getCell(1)
  if (allUnpriced) {
    fnCell.value = '* Catatan: Nilai mutasi belum dapat dihitung karena seluruh transaksi tidak memiliki harga historis.'
  } else if (unpricedCount > 0) {
    fnCell.value = `* Catatan: Nilai mutasi hanya mencakup transaksi yang memiliki harga historis (${unpricedCount} transaksi belum memiliki harga).`
  } else {
    fnCell.value = '* Catatan: Seluruh transaksi memiliki catatan harga historis lengkap.'
  }
  fnCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
  fnCell.alignment = { vertical: 'middle', indent: 1 }

  mRowIdx += 2

  // Section 2: Recap Table by Transaction Type
  wsRingkasan.mergeCells(`A${mRowIdx}:F${mRowIdx}`)
  const s2Header = wsRingkasan.getRow(mRowIdx)
  s2Header.getCell(1).value = 'REKAPITULASI BERDASARKAN JENIS TRANSAKSI'
  s2Header.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  s2Header.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  s2Header.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s2Header.height = 24

  mRowIdx++

  const rekapHeaderRow = wsRingkasan.getRow(mRowIdx)
  rekapHeaderRow.height = 22
  const rekapHeaders = [
    'Jenis Transaksi',
    'Jumlah Transaksi',
    'Total Kuantitas Masuk',
    'Total Kuantitas Keluar',
    'Perubahan Bersih',
    'Nilai Mutasi',
  ]

  for (let c = 1; c <= 6; c++) {
    const cell = rekapHeaderRow.getCell(c)
    cell.value = rekapHeaders[c - 1]
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    cell.alignment = { horizontal: c === 1 ? 'left' : 'right', vertical: 'middle' }
    cell.border = thinBorder
  }

  mRowIdx++

  const typeOrder: { key: TransactionType; label: string }[] = [
    { key: 'INITIAL', label: 'Stok Awal' },
    { key: 'IN', label: 'Barang Masuk' },
    { key: 'OUT', label: 'Barang Keluar' },
    { key: 'ADJUSTMENT_IN', label: 'Penyesuaian Masuk' },
    { key: 'ADJUSTMENT_OUT', label: 'Penyesuaian Keluar' },
    { key: 'REVERSAL', label: 'Koreksi' },
  ]

  for (const t of typeOrder) {
    const grp = rekapMap[t.key]
    const row = wsRingkasan.getRow(mRowIdx)
    row.height = 20

    const isEven = mRowIdx % 2 === 0
    const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

    // Col 1: Label
    const c1 = row.getCell(1)
    c1.value = t.label
    c1.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1E293B' } }

    // Col 2: Count
    const c2 = row.getCell(2)
    c2.value = grp.count
    c2.numFmt = '#,##0'

    // Col 3: Masuk
    const c3 = row.getCell(3)
    c3.value = grp.stokMasuk
    c3.numFmt = '#,##0'

    // Col 4: Keluar
    const c4 = row.getCell(4)
    c4.value = grp.stokKeluar
    c4.numFmt = '#,##0'

    // Col 5: Perubahan Bersih
    const c5 = row.getCell(5)
    c5.value = grp.perubahanBersih
    c5.numFmt = '+#,##0;-#,##0;0'

    // Col 6: Nilai Mutasi
    const c6 = row.getCell(6)
    if (grp.count === 0 || grp.pricedCount === 0) {
      c6.value = grp.count === 0 ? 0 : '—'
      if (grp.count > 0 && grp.pricedCount === 0) {
        c6.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
      }
    } else {
      c6.value = grp.nilaiMutasi
      c6.numFmt = currencyFormat
    }

    for (let c = 1; c <= 6; c++) {
      const cell = row.getCell(c)
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      if (c > 1) cell.alignment = { horizontal: 'right', vertical: 'middle' }
      else cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    }

    mRowIdx++
  }

  // Summary Total Row
  const totalRow = wsRingkasan.getRow(mRowIdx)
  totalRow.height = 22

  totalRow.getCell(1).value = 'TOTAL'
  totalRow.getCell(2).value = totalTransactions
  totalRow.getCell(2).numFmt = '#,##0'
  totalRow.getCell(3).value = totalStokMasuk
  totalRow.getCell(3).numFmt = '#,##0'
  totalRow.getCell(4).value = totalStokKeluar
  totalRow.getCell(4).numFmt = '#,##0'
  totalRow.getCell(5).value = perubahanStokBersih
  totalRow.getCell(5).numFmt = '+#,##0;-#,##0;0'

  const totC6 = totalRow.getCell(6)
  if (allUnpriced) {
    totC6.value = '—'
  } else {
    totC6.value = selisihNilaiMutasi
    totC6.numFmt = currencyFormat
  }

  for (let c = 1; c <= 6; c++) {
    const cell = totalRow.getCell(c)
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } }
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF94A3B8' } },
      bottom: { style: 'double', color: { argb: 'FF0F172A' } },
      left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    }
    if (c > 1) cell.alignment = { horizontal: 'right', vertical: 'middle' }
    else cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  }

  // ============================================================================
  // SHEET 2: RIWAYAT TRANSAKSI
  // ============================================================================
  const wsRiwayat = workbook.addWorksheet('Riwayat Transaksi', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })
  wsRiwayat.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  }

  wsRiwayat.columns = [
    { header: 'No.', key: 'no', width: 6 },
    { header: 'Tanggal dan Waktu', key: 'txDate', width: 18 },
    { header: 'Nomor Transaksi', key: 'txNo', width: 22 },
    { header: 'Jenis Transaksi', key: 'txType', width: 24 },
    { header: 'Barang', key: 'itemDisplay', width: 36 },
    { header: 'Perubahan Stok', key: 'stokChange', width: 16 },
    { header: 'Stok Sebelum → Sesudah', key: 'stokTrans', width: 20 },
    { header: 'Harga Satuan', key: 'unitPrice', width: 18 },
    { header: 'Nilai Mutasi', key: 'txValue', width: 20 },
    { header: 'Petugas', key: 'user', width: 20 },
    { header: 'Alasan', key: 'reason', width: 32 },
  ]

  // Title Block (Rows 1-3)
  wsRiwayat.mergeCells('A1:K1')
  const r21 = wsRiwayat.getRow(1)
  r21.getCell(1).value = instNameDisplay
  r21.getCell(1).font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF1E293B' } }
  r21.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r21.height = 26

  wsRiwayat.mergeCells('A2:K2')
  const r22 = wsRiwayat.getRow(2)
  r22.getCell(1).value = headerTextDisplay
  r22.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r22.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r22.height = 20

  wsRiwayat.mergeCells('A3:K3')
  const r23 = wsRiwayat.getRow(3)
  r23.getCell(1).value = `Periode: ${dateRangeDisplay}  |  Filter: ${typeFilterLabel}`
  r23.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } }
  r23.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r23.height = 18

  wsRiwayat.getRow(4).height = 10 // Spacer

  // Table Header (Row 5)
  const hRow2 = wsRiwayat.getRow(5)
  hRow2.height = 24
  const hTitles2 = [
    'No.',
    'Tanggal dan Waktu',
    'Nomor Transaksi',
    'Jenis Transaksi',
    'Barang',
    'Perubahan Stok',
    'Stok Sebelum → Sesudah',
    'Harga Satuan',
    'Nilai Mutasi',
    'Petugas',
    'Alasan',
  ]

  for (let c = 1; c <= 11; c++) {
    const cell = hRow2.getCell(c)
    cell.value = hTitles2[c - 1]
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }

  // Rows 6+: Data Rows
  let rIdx2 = 6

  if (txList.length === 0) {
    wsRiwayat.mergeCells(`A6:K6`)
    const emptyRow = wsRiwayat.getRow(6)
    emptyRow.height = 32
    const emptyCell = emptyRow.getCell(1)
    emptyCell.value = 'Tidak ada transaksi pada periode dan filter yang dipilih'
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = 1; c <= 11; c++) {
      emptyRow.getCell(c).border = thinBorder
    }
  } else {
    for (let i = 0; i < txList.length; i++) {
      const tx = txList[i]
      if (!tx) continue
      const cost = costMap[tx.id]
      const row = wsRiwayat.getRow(rIdx2)
      row.height = 22

      const isEven = i % 2 === 0
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

      const dateStr = formatInTimeZone(new Date(tx.transaction_at), TZ, 'dd/MM/yyyy HH:mm')
      const symbol = tx.units?.symbol || 'pcs'
      const itemName = tx.items?.name || 'Barang'
      const itemSku = tx.items?.sku || ''
      const itemFormatted = sanitizeUserString(itemSku ? `${itemName} (${itemSku})` : itemName)

      const delta = tx.quantity_delta
      const deltaFormatted = delta > 0 ? `+${delta} ${symbol}` : `${delta} ${symbol}`
      const stockTransition = `${tx.stock_before ?? 0} → ${tx.stock_after ?? 0}`
      const userName = sanitizeUserString(tx.profiles?.full_name || tx.profiles?.username || 'System')
      const reasonFormatted = sanitizeUserString(tx.reason || '—')

      let typeLabel = TYPE_LABELS[tx.transaction_type] || tx.transaction_type
      if (tx.transaction_type === 'REVERSAL') {
        typeLabel = 'Koreksi – Pembatalan Transaksi'
      }

      // Col 1: No.
      const c1 = row.getCell(1)
      c1.value = i + 1
      c1.alignment = { horizontal: 'center', vertical: 'middle' }

      // Col 2: Tanggal dan Waktu
      const c2 = row.getCell(2)
      c2.value = dateStr
      c2.alignment = { horizontal: 'center', vertical: 'middle' }

      // Col 3: Nomor Transaksi
      const c3 = row.getCell(3)
      c3.value = tx.transaction_number
      c3.alignment = { horizontal: 'center', vertical: 'middle' }

      // Col 4: Jenis Transaksi
      const c4 = row.getCell(4)
      c4.value = typeLabel
      c4.alignment = { horizontal: 'left', vertical: 'middle' }
      if (tx.transaction_type === 'REVERSAL') {
        c4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFC2410C' } }
      } else if (tx.transaction_type === 'INITIAL') {
        c4.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF1D4ED8' } }
      }

      // Col 5: Barang
      const c5 = row.getCell(5)
      c5.value = itemFormatted
      c5.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

      // Col 6: Perubahan Stok
      const c6 = row.getCell(6)
      c6.value = deltaFormatted
      c6.alignment = { horizontal: 'right', vertical: 'middle' }
      if (delta > 0) {
        c6.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF15803D' } }
      } else if (delta < 0) {
        c6.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFB91C1C' } }
      }

      // Col 7: Stok Sebelum -> Sesudah
      const c7 = row.getCell(7)
      c7.value = stockTransition
      c7.alignment = { horizontal: 'center', vertical: 'middle' }

      // Col 8: Harga Satuan
      const c8 = row.getCell(8)
      if (cost?.has_cost && cost.base_unit_cost !== null) {
        c8.value = cost.base_unit_cost
        c8.numFmt = currencyFormat
        c8.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        c8.value = '—'
        c8.alignment = { horizontal: 'center', vertical: 'middle' }
        c8.font = { name: 'Calibri', size: 10, color: { argb: 'FF94A3B8' } }
      }

      // Col 9: Nilai Mutasi
      const c9 = row.getCell(9)
      if (cost?.has_cost && cost.transaction_value !== null) {
        c9.value = cost.transaction_value
        c9.numFmt = currencyFormat
        c9.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        c9.value = '—'
        c9.alignment = { horizontal: 'center', vertical: 'middle' }
        c9.font = { name: 'Calibri', size: 10, color: { argb: 'FF94A3B8' } }
      }

      // Col 10: Petugas
      const c10 = row.getCell(10)
      c10.value = userName
      c10.alignment = { horizontal: 'left', vertical: 'middle' }

      // Col 11: Alasan
      const c11 = row.getCell(11)
      c11.value = reasonFormatted
      c11.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }

      for (let c = 1; c <= 11; c++) {
        const cell = row.getCell(c)
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        if (!cell.font) {
          cell.font = { name: 'Calibri', size: 10, color: { argb: 'FF0F172A' } }
        }
      }

      rIdx2++
    }
  }

  // ============================================================================
  // SHEET 3: DETAIL AUDIT
  // ============================================================================
  const wsAudit = workbook.addWorksheet('Detail Audit', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })
  wsAudit.pageSetup = {
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  }

  wsAudit.columns = [
    { header: 'No.', key: 'no', width: 6 },
    { header: 'Nomor Transaksi', key: 'txNo', width: 22 },
    { header: 'Nomor Transaksi Referensi', key: 'refTxNo', width: 24 },
    { header: 'Transaction Type', key: 'type', width: 18 },
    { header: 'SKU', key: 'sku', width: 14 },
    { header: 'Nama Barang', key: 'itemName', width: 32 },
    { header: 'Quantity Input', key: 'inQty', width: 14 },
    { header: 'Satuan Input', key: 'inUnit', width: 12 },
    { header: 'Quantity Dasar', key: 'baseQty', width: 14 },
    { header: 'Satuan Dasar', key: 'baseUnit', width: 12 },
    { header: 'Quantity Delta', key: 'delta', width: 14 },
    { header: 'Stok Sebelum', key: 'sBefore', width: 12 },
    { header: 'Stok Sesudah', key: 'sAfter', width: 12 },
    { header: 'Harga Historis', key: 'cost', width: 18 },
    { header: 'Nilai Mutasi', key: 'val', width: 20 },
    { header: 'Status Harga', key: 'costStatus', width: 16 },
    { header: 'Nama Petugas', key: 'userName', width: 20 },
    { header: 'User ID', key: 'userId', width: 36 },
    { header: 'Alasan', key: 'reason', width: 30 },
    { header: 'Timestamp Lengkap', key: 'ts', width: 24 },
  ]

  // Title Block (Rows 1-3)
  wsAudit.mergeCells('A1:T1')
  const r31 = wsAudit.getRow(1)
  r31.getCell(1).value = instNameDisplay
  r31.getCell(1).font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF1E293B' } }
  r31.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r31.height = 26

  wsAudit.mergeCells('A2:T2')
  const r32 = wsAudit.getRow(2)
  r32.getCell(1).value = 'DETAIL AUDIT TRANSAKSI STOK'
  r32.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r32.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r32.height = 20

  wsAudit.mergeCells('A3:T3')
  const r33 = wsAudit.getRow(3)
  r33.getCell(1).value = `Periode: ${dateRangeDisplay}  |  Filter: ${typeFilterLabel}`
  r33.getCell(1).font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } }
  r33.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r33.height = 18

  wsAudit.getRow(4).height = 10 // Spacer

  // Table Header (Row 5)
  const hRow3 = wsAudit.getRow(5)
  hRow3.height = 24
  const hTitles3 = [
    'No.',
    'Nomor Transaksi',
    'Nomor Transaksi Referensi',
    'Transaction Type',
    'SKU',
    'Nama Barang',
    'Quantity Input',
    'Satuan Input',
    'Quantity Dasar',
    'Satuan Dasar',
    'Quantity Delta',
    'Stok Sebelum',
    'Stok Sesudah',
    'Harga Historis',
    'Nilai Mutasi',
    'Status Harga',
    'Nama Petugas',
    'User ID',
    'Alasan',
    'Timestamp Lengkap',
  ]

  for (let c = 1; c <= 20; c++) {
    const cell = hRow3.getCell(c)
    cell.value = hTitles3[c - 1]
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }

  let rIdx3 = 6

  if (txList.length === 0) {
    wsAudit.mergeCells(`A6:T6`)
    const emptyRow = wsAudit.getRow(6)
    emptyRow.height = 32
    const emptyCell = emptyRow.getCell(1)
    emptyCell.value = 'Tidak ada data audit transaksi pada periode dan filter yang dipilih'
    emptyCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF64748B' } }
    emptyCell.alignment = { horizontal: 'center', vertical: 'middle' }
    for (let c = 1; c <= 20; c++) {
      emptyRow.getCell(c).border = thinBorder
    }
  } else {
    for (let i = 0; i < txList.length; i++) {
      const tx = txList[i]
      if (!tx) continue
      const cost = costMap[tx.id]
      const row = wsAudit.getRow(rIdx3)
      row.height = 20

      const isEven = i % 2 === 0
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

      const refTxNo = tx.original_transaction_id ? refTxNoMap[tx.original_transaction_id] || tx.original_transaction_id : '—'
      const symbol = tx.units?.symbol || 'pcs'

      row.getCell(1).value = i + 1
      row.getCell(2).value = tx.transaction_number
      row.getCell(3).value = refTxNo
      row.getCell(4).value = tx.transaction_type
      row.getCell(5).value = tx.items?.sku || '—'
      row.getCell(6).value = sanitizeUserString(tx.items?.name || '—')
      row.getCell(7).value = tx.input_quantity
      row.getCell(7).numFmt = '#,##0'
      row.getCell(8).value = symbol
      row.getCell(9).value = tx.base_quantity
      row.getCell(9).numFmt = '#,##0'
      row.getCell(10).value = symbol
      row.getCell(11).value = tx.quantity_delta
      row.getCell(11).numFmt = '+#,##0;-#,##0;0'
      row.getCell(12).value = tx.stock_before
      row.getCell(12).numFmt = '#,##0'
      row.getCell(13).value = tx.stock_after
      row.getCell(13).numFmt = '#,##0'

      // Col 14 & 15: Price & Mutation values (blank if unpriced)
      const c14 = row.getCell(14)
      if (cost?.has_cost && cost.base_unit_cost !== null) {
        c14.value = cost.base_unit_cost
        c14.numFmt = currencyFormat
      } else {
        c14.value = null
      }

      const c15 = row.getCell(15)
      if (cost?.has_cost && cost.transaction_value !== null) {
        c15.value = cost.transaction_value
        c15.numFmt = currencyFormat
      } else {
        c15.value = null
      }

      // Col 16: Status Harga
      row.getCell(16).value = cost?.has_cost ? 'Tersedia' : 'Belum Tersedia'

      // Col 17: Petugas
      row.getCell(17).value = sanitizeUserString(tx.profiles?.full_name || tx.profiles?.username || 'System')

      // Col 18: User ID
      row.getCell(18).value = tx.performed_by || '—'

      // Col 19: Alasan
      row.getCell(19).value = sanitizeUserString(tx.reason || '—')

      // Col 20: Timestamp
      row.getCell(20).value = tx.transaction_at

      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c)
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }

        if ([1, 2, 3, 4, 5, 8, 10, 16, 20].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else if ([7, 9, 11, 12, 13, 14, 15].includes(c)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        }
      }

      rIdx3++
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
