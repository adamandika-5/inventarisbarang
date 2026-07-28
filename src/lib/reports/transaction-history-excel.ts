import ExcelJS from 'exceljs'
import { formatInTimeZone } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TransactionType } from '@/types/database'
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
  if (typeFilter === 'INITIAL') return 'Stok Pembukaan'
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
  INITIAL: 'Stok Pembukaan',
  ADJUSTMENT_IN: 'Penyesuaian Masuk',
  ADJUSTMENT_OUT: 'Penyesuaian Keluar',
  REVERSAL: 'Koreksi',
}

/**
 * Builds Excel Workbook for "Riwayat Transaksi" (Single Sheet).
 */
export async function buildTransactionHistoryWorkbook(
  supabase: SupabaseClient<Database>,
  params: BuildTransactionHistoryParams,
): Promise<Buffer> {
  const { dateFromStr, dateToStr, typeFilter, itemFilter } = params

  const startUtc = `${dateFromStr}T00:00:00+07:00`
  const endUtc = `${dateToStr}T23:59:59.999+07:00`

  // 1. Fetch app_settings for institution info if not supplied
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

  // 2. Fetch transactions in requested date range
  const validTypes = ['IN', 'OUT', 'INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL']
  let query = supabase
    .from('stock_transactions')
    .select(
      'id, transaction_number, item_id, transaction_type, input_quantity, base_quantity, quantity_delta, performed_by, transaction_at, stock_before, stock_after, reason, original_transaction_id, is_reversed, reversal_transaction_id, items!item_id(id, sku, name, category_id, categories!category_id(name)), units!unit_id(id, name, symbol), profiles!performed_by(id, full_name, username)',
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

  // Collect original_transaction_ids to resolve reference transaction numbers for reversals
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

  // 3. Fetch historical cost snapshots via RPC get_stock_transaction_costs
  const costMap: Record<
    string,
    {
      base_unit_cost: number | null
      transaction_value: number | null
      has_cost: boolean
    }
  > = {}

  if (txIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: costsData, error: rpcErr } = await (supabase as any).rpc('get_stock_transaction_costs', {
      p_transaction_ids: txIds,
    })

    if (rpcErr) {
      if (rpcErr.code === 'PGRST202' || rpcErr.message?.includes('Could not find the function')) {
        throw new Error(
          'Migration 008_get_stock_transaction_costs_rpc.sql belum diterapkan. Data harga historis belum dapat diverifikasi.',
        )
      }
      throw new Error(`Gagal mengambil data harga historis: ${rpcErr.message}`)
    }

    if (costsData && Array.isArray(costsData)) {
      for (const c of costsData) {
        const costVal =
          c.base_unit_cost !== null && c.base_unit_cost !== undefined ? parseFloat(String(c.base_unit_cost)) : null
        const txVal =
          c.transaction_value !== null && c.transaction_value !== undefined
            ? parseFloat(String(c.transaction_value))
            : null

        costMap[c.transaction_id] = {
          base_unit_cost: costVal,
          transaction_value: txVal,
          has_cost: costVal !== null,
        }
      }
    }
  }

  // Create Single Sheet Workbook
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'InventarisBarang'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Riwayat Transaksi', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  }

  // 4. Column Widths (ws.columns ONLY sets column widths)
  worksheet.columns = [
    { width: 6 }, // A: No.
    { width: 22 }, // B: Tanggal dan Waktu (WIB)
    { width: 22 }, // C: Nomor Transaksi
    { width: 18 }, // D: Jenis Transaksi
    { width: 16 }, // E: Kode Barang
    { width: 30 }, // F: Nama Barang
    { width: 18 }, // G: Kategori
    { width: 16 }, // H: Jumlah Mutasi
    { width: 12 }, // I: Satuan
    { width: 14 }, // J: Stok Setelah
    { width: 18 }, // K: Harga Satuan
    { width: 20 }, // L: Nilai Mutasi
    { width: 20 }, // M: Petugas
    { width: 35 }, // N: Keterangan
  ]

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  }

  const currencyFormat = '"Rp"#,##0;("-Rp"#,##0);"Rp"0'
  const currencyNegativeFormat = '"Rp"#,##0;("-Rp"#,##0);"Rp"0'
  const qtyFormat = '#,##0;(#,##0);0'

  // Header Block (Rows 1-3 merged)
  worksheet.mergeCells('A1:N1')
  const r1 = worksheet.getRow(1)
  r1.height = 24
  r1.getCell(1).value = instNameDisplay
  r1.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  worksheet.mergeCells('A2:N2')
  const r2 = worksheet.getRow(2)
  r2.height = 20
  r2.getCell(1).value = headerTextDisplay
  r2.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF334155' } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  worksheet.mergeCells('A3:N3')
  const r3 = worksheet.getRow(3)
  r3.height = 18
  r3.getCell(1).value = `Periode: ${dateRangeDisplay}   |   Jenis: ${typeFilterLabel}   |   Diunduh: ${generatedAtWib}`
  r3.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // Spacer Row 4
  const r4 = worksheet.getRow(4)
  r4.height = 8

  // Column Headers Row 5 (UNMERGED, All A5:N5 filled with text)
  const headerRow = worksheet.getRow(5)
  headerRow.height = 28
  const headers = [
    'No.',
    'Tanggal dan Waktu (WIB)',
    'Nomor Transaksi',
    'Jenis Transaksi',
    'Kode Barang',
    'Nama Barang',
    'Kategori',
    'Jumlah Mutasi',
    'Satuan',
    'Stok Setelah',
    'Harga Satuan',
    'Nilai Mutasi',
    'Petugas',
    'Keterangan',
  ]

  headers.forEach((title, idx) => {
    const cell = headerRow.getCell(idx + 1)
    cell.value = title
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  })

  // Set AutoFilter on A5:N5
  worksheet.autoFilter = 'A5:N5'

  // Populate Data Rows (Starting Row 6)
  let rowIdx = 6
  let itemNo = 1

  for (const t of txList) {
    const row = worksheet.getRow(rowIdx)
    row.height = 20
    const isEven = rowIdx % 2 === 0
    const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

    const itemObj = t.items as { sku?: string; name?: string; categories?: { name?: string } | null } | null
    const unitObj = t.units as { symbol?: string; name?: string } | null
    const profileObj = t.profiles as { full_name?: string; username?: string } | null

    const dtWib = t.transaction_at ? formatInTimeZone(new Date(t.transaction_at), TZ, 'dd/MM/yyyy HH:mm') : ''
    const txTypeLabel = TYPE_LABELS[t.transaction_type] || t.transaction_type
    const skuDisplay = itemObj?.sku || ''
    const nameDisplay = sanitizeUserString(itemObj?.name)
    const categoryDisplay = itemObj?.categories?.name || 'Lainnya'
    const unitSymbolDisplay = unitObj?.symbol || 'pcs'
    const profileDisplay = profileObj?.full_name || profileObj?.username || 'Sistem'

    // Determine Qty Mutasi (positive for IN/INITIAL/ADJUSTMENT_IN, negative for OUT/ADJUSTMENT_OUT)
    const baseQty = Number(t.base_quantity ?? 0)
    let qtyMutasi = 0
    if (t.transaction_type === 'IN' || t.transaction_type === 'INITIAL' || t.transaction_type === 'ADJUSTMENT_IN') {
      qtyMutasi = Math.abs(baseQty)
    } else if (t.transaction_type === 'OUT' || t.transaction_type === 'ADJUSTMENT_OUT') {
      qtyMutasi = -Math.abs(baseQty)
    } else if (t.transaction_type === 'REVERSAL') {
      qtyMutasi = Number(t.quantity_delta ?? 0)
    } else {
      qtyMutasi = baseQty
    }

    const stokSetelah = Number(t.stock_after ?? 0)

    // Historical Cost & Mutasi Value
    const cSnap = costMap[t.id]
    const hasCost = cSnap ? cSnap.has_cost : false
    const baseUnitCost = cSnap?.base_unit_cost ?? null
    const txValue = cSnap?.transaction_value ?? null

    // Determine Nilai Mutasi direction
    let nilaiMutasi: number | null = null
    if (hasCost && baseUnitCost !== null) {
      if (txValue !== null) {
        if (qtyMutasi < 0) {
          nilaiMutasi = -Math.abs(txValue)
        } else {
          nilaiMutasi = Math.abs(txValue)
        }
      } else {
        nilaiMutasi = baseUnitCost * qtyMutasi
      }
    }

    // Build Notes / Keterangan with Reversal Reference if present
    let notesDisplay = sanitizeUserString(t.reason)
    if (t.transaction_type === 'REVERSAL' && t.original_transaction_id) {
      const refNo = refTxNoMap[t.original_transaction_id]
      if (refNo) {
        notesDisplay = notesDisplay
          ? `${notesDisplay} (Koreksi atas transaksi ${refNo})`
          : `Koreksi atas transaksi ${refNo}`
      }
    }

    // Cell Assignments
    row.getCell(1).value = itemNo++
    row.getCell(2).value = dtWib
    row.getCell(3).value = t.transaction_number
    row.getCell(4).value = txTypeLabel
    row.getCell(5).value = skuDisplay
    row.getCell(6).value = nameDisplay
    row.getCell(7).value = categoryDisplay

    // Col 8: Jumlah Mutasi (Number)
    const c8 = row.getCell(8)
    c8.value = qtyMutasi
    c8.numFmt = qtyFormat

    // Col 9: Satuan
    row.getCell(9).value = unitSymbolDisplay

    // Col 10: Stok Setelah (Number)
    const c10 = row.getCell(10)
    c10.value = stokSetelah
    c10.numFmt = '#,##0'

    // Col 11: Harga Satuan (Number or "—")
    const c11 = row.getCell(11)
    if (hasCost && baseUnitCost !== null) {
      c11.value = baseUnitCost
      c11.numFmt = currencyFormat
    } else {
      c11.value = '—'
      c11.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
    }

    // Col 12: Nilai Mutasi (Number or "—")
    const c12 = row.getCell(12)
    if (hasCost && nilaiMutasi !== null) {
      c12.value = nilaiMutasi
      c12.numFmt = currencyNegativeFormat
    } else {
      c12.value = '—'
      c12.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
    }

    // Col 13: Petugas
    row.getCell(13).value = profileDisplay

    // Col 14: Keterangan
    row.getCell(14).value = notesDisplay

    // Alignments and borders for data row
    for (let c = 1; c <= 14; c++) {
      const cell = row.getCell(c)
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      if (!cell.font) {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }
      }

      if ([1, 2, 3, 4, 5, 9].includes(c)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if ([8, 10, 11, 12].includes(c)) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
      }
    }

    rowIdx++
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
