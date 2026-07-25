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
 * 1. Ringkasan (Valuasi & Rekonsiliasi Mutasi Persediaan)
 * 2. Riwayat Transaksi (20 Kolom Laporan User-Friendly)
 * 3. Detail Audit (20 Kolom Audit Trail Teknis)
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
      'id, transaction_number, client_request_id, item_id, transaction_type, input_quantity, base_quantity, conversion_factor_snapshot, quantity_delta, performed_by, transaction_at, stock_before, stock_after, reason, original_transaction_id, is_reversed, reversal_transaction_id, items!item_id(id, sku, name, category_id, categories!category_id(name)), units!unit_id(id, name, symbol), profiles!performed_by(id, full_name, username)',
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

  // 3. Fetch historical cost snapshots via RPC get_stock_transaction_costs
  const costMap: Record<
    string,
    {
      unit_price_input: number | null
      base_unit_cost: number | null
      average_cost_before: number | null
      average_cost_after: number | null
      inventory_value_before: number | null
      inventory_value_change: number | null
      inventory_value_after: number | null
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
        const unitPriceInputVal =
          c.unit_price_input !== null && c.unit_price_input !== undefined
            ? parseFloat(String(c.unit_price_input))
            : null

        costMap[c.transaction_id] = {
          unit_price_input: unitPriceInputVal,
          base_unit_cost: costVal,
          average_cost_before:
            c.average_cost_before !== null && c.average_cost_before !== undefined
              ? parseFloat(String(c.average_cost_before))
              : null,
          average_cost_after:
            c.average_cost_after !== null && c.average_cost_after !== undefined
              ? parseFloat(String(c.average_cost_after))
              : null,
          inventory_value_before:
            c.inventory_value_before !== null && c.inventory_value_before !== undefined
              ? parseFloat(String(c.inventory_value_before))
              : null,
          inventory_value_change:
            c.inventory_value_change !== null && c.inventory_value_change !== undefined
              ? parseFloat(String(c.inventory_value_change))
              : null,
          inventory_value_after:
            c.inventory_value_after !== null && c.inventory_value_after !== undefined
              ? parseFloat(String(c.inventory_value_after))
              : null,
          transaction_value: txVal,
          has_cost: costVal !== null && !isNaN(costVal),
        }
      }
    }
  }

  // 4. Fetch transactions before startUtc to calculate historical initial inventory value
  let nilaiStokAwal = 0
  const { data: priorTx } = await supabase
    .from('stock_transactions')
    .select('id, transaction_at')
    .lt('transaction_at', startUtc)
    .order('transaction_at', { ascending: false })
    .limit(1)

  if (priorTx && priorTx.length > 0 && priorTx[0]?.id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: priorCost } = await (supabase as any).rpc('get_stock_transaction_costs', {
      p_transaction_ids: [priorTx[0].id],
    })
    if (priorCost && Array.isArray(priorCost) && priorCost.length > 0 && priorCost[0]?.inventory_value_after) {
      nilaiStokAwal = parseFloat(String(priorCost[0].inventory_value_after))
    }
  }

  // 5. Calculate summary metrics & reconciliation values
  let totalMutasiMasukQty = 0
  let totalMutasiKeluarQty = 0
  let netMutasiQty = 0

  let mutasiMasukInVal = 0
  let mutasiMasukAdjVal = 0
  let mutasiMasukRevVal = 0

  let mutasiKeluarOutVal = 0
  let mutasiKeluarAdjVal = 0
  let mutasiKeluarRevVal = 0

  let pricedCount = 0
  let unpricedCount = 0

  const rekapMap: Record<
    TransactionType,
    {
      count: number
      masukQty: number
      masukVal: number
      keluarQty: number
      keluarVal: number
      netQty: number
      netVal: number
      pricedCount: number
    }
  > = {
    INITIAL: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
    IN: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
    OUT: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
    ADJUSTMENT_IN: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
    ADJUSTMENT_OUT: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
    REVERSAL: { count: 0, masukQty: 0, masukVal: 0, keluarQty: 0, keluarVal: 0, netQty: 0, netVal: 0, pricedCount: 0 },
  }

  for (const tx of txList) {
    if (!tx) continue
    const delta = Number(tx.quantity_delta ?? 0)
    const cost = costMap[tx.id]
    const hasCost = cost?.has_cost ?? false
    const txVal = Math.abs(cost?.transaction_value ?? 0)

    if (hasCost) {
      pricedCount++
    } else {
      unpricedCount++
    }

    const typeGroup = rekapMap[tx.transaction_type]
    if (typeGroup) {
      typeGroup.count++
      if (delta > 0) {
        typeGroup.masukQty += delta
        if (hasCost) typeGroup.masukVal += txVal
      } else if (delta < 0) {
        typeGroup.keluarQty += Math.abs(delta)
        if (hasCost) typeGroup.keluarVal += txVal
      }
      typeGroup.netQty += delta
      if (hasCost) {
        typeGroup.netVal += cost?.inventory_value_change ?? 0
        typeGroup.pricedCount++
      }
    }

    if (delta > 0) {
      totalMutasiMasukQty += delta
      if (hasCost) {
        if (tx.transaction_type === 'IN' || tx.transaction_type === 'INITIAL') {
          mutasiMasukInVal += txVal
        } else if (tx.transaction_type === 'ADJUSTMENT_IN') {
          mutasiMasukAdjVal += txVal
        } else if (tx.transaction_type === 'REVERSAL') {
          mutasiMasukRevVal += txVal
        }
      }
    } else if (delta < 0) {
      totalMutasiKeluarQty += Math.abs(delta)
      if (hasCost) {
        if (tx.transaction_type === 'OUT') {
          mutasiKeluarOutVal += txVal
        } else if (tx.transaction_type === 'ADJUSTMENT_OUT') {
          mutasiKeluarAdjVal += txVal
        } else if (tx.transaction_type === 'REVERSAL') {
          mutasiKeluarRevVal += txVal
        }
      }
    }
    netMutasiQty += delta
  }

  const totalMutasiMasukVal = mutasiMasukInVal + mutasiMasukAdjVal + mutasiMasukRevVal
  const totalMutasiKeluarVal = mutasiKeluarOutVal + mutasiKeluarAdjVal + mutasiKeluarRevVal

  // Determine Nilai Stok Akhir from last transaction in period
  let nilaiStokAkhir = 0
  const latestTx = txList[0] // Sorted descending by transaction_at
  if (latestTx && costMap[latestTx.id]?.inventory_value_after !== null && costMap[latestTx.id]?.inventory_value_after !== undefined) {
    nilaiStokAkhir = costMap[latestTx.id]!.inventory_value_after!
  } else if (nilaiStokAwal > 0 || totalMutasiMasukVal > 0 || totalMutasiKeluarVal > 0) {
    nilaiStokAkhir = nilaiStokAwal + totalMutasiMasukVal - totalMutasiKeluarVal
  }

  const selisihRekonsiliasi = nilaiStokAwal + totalMutasiMasukVal - totalMutasiKeluarVal - nilaiStokAkhir
  const statusRekonsiliasi = Math.abs(selisihRekonsiliasi) < 0.01 ? 'SEIMBANG' : 'TIDAK SEIMBANG'
  const totalTransactions = txList.length
  const allUnpriced = totalTransactions > 0 && pricedCount === 0

  // Create Workbook
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'InventarisBarang'
  workbook.created = new Date()

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
    { width: 38 }, // A: Component Label
    { width: 26 }, // B: Valuasi Rupiah / Kuantitas
    { width: 20 }, // C: Total Kuantitas Masuk
    { width: 20 }, // D: Total Kuantitas Keluar
    { width: 20 }, // E: Net Mutasi Kuantitas
    { width: 26 }, // F: Nilai Mutasi Persediaan
    { width: 26 }, // G: Status
    { width: 26 }, // H: Catatan
  ]

  // Header Title (Rows 1-4)
  wsRingkasan.mergeCells('A1:H1')
  const r11 = wsRingkasan.getRow(1)
  r11.getCell(1).value = instNameDisplay
  r11.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } }
  r11.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r11.height = 28

  wsRingkasan.mergeCells('A2:H2')
  const r12 = wsRingkasan.getRow(2)
  r12.getCell(1).value = headerTextDisplay
  r12.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r12.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r12.height = 22

  wsRingkasan.mergeCells('A3:H3')
  const r13 = wsRingkasan.getRow(3)
  r13.getCell(1).value = `Periode: ${dateRangeDisplay}`
  r13.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } }
  r13.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r13.height = 18

  wsRingkasan.mergeCells('A4:H4')
  const r14 = wsRingkasan.getRow(4)
  r14.getCell(1).value = `Jenis Transaksi: ${typeFilterLabel}  |  Dibuat pada: ${generatedAtWib}`
  r14.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
  r14.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r14.height = 18

  wsRingkasan.getRow(5).height = 12

  // Section 1: Summary Metrics & Reconciliation Table
  wsRingkasan.mergeCells('A6:H6')
  const s1Header = wsRingkasan.getRow(6)
  s1Header.getCell(1).value = 'RINGKASAN VALUASI & REKONSILIASI MUTASI PERSEDIAAN'
  s1Header.getCell(1).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  s1Header.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  s1Header.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
  s1Header.height = 24

  const reconciliationData: { label: string; val: number | string | null; isCurrency: boolean; isStatus?: boolean; highlight?: boolean }[] = [
    { label: 'Nilai Stok Awal (Sebelum Periode)', val: allUnpriced ? null : nilaiStokAwal, isCurrency: true },
    { label: 'Nilai Mutasi Masuk dari Barang Masuk', val: allUnpriced ? null : mutasiMasukInVal, isCurrency: true },
    { label: 'Nilai Mutasi Masuk dari Koreksi Tambah', val: allUnpriced ? null : mutasiMasukAdjVal, isCurrency: true },
    { label: 'Nilai Mutasi Masuk dari Reversal', val: allUnpriced ? null : mutasiMasukRevVal, isCurrency: true },
    { label: 'Total Nilai Mutasi Masuk', val: allUnpriced ? null : totalMutasiMasukVal, isCurrency: true, highlight: true },
    { label: 'Nilai Mutasi Keluar dari Barang Keluar', val: allUnpriced ? null : mutasiKeluarOutVal, isCurrency: true },
    { label: 'Nilai Mutasi Keluar dari Koreksi Kurang', val: allUnpriced ? null : mutasiKeluarAdjVal, isCurrency: true },
    { label: 'Nilai Mutasi Keluar dari Reversal', val: allUnpriced ? null : mutasiKeluarRevVal, isCurrency: true },
    { label: 'Total Nilai Mutasi Keluar', val: allUnpriced ? null : totalMutasiKeluarVal, isCurrency: true, highlight: true },
    { label: 'Nilai Stok Akhir (Akhir Periode)', val: allUnpriced ? null : nilaiStokAkhir, isCurrency: true, highlight: true },
    { label: 'Selisih Rekonsiliasi (Awal + Masuk - Keluar - Akhir)', val: allUnpriced ? null : selisihRekonsiliasi, isCurrency: true },
    { label: 'Status Rekonsiliasi Persediaan', val: allUnpriced ? 'TIDAK DAPAT DIHITUNG' : statusRekonsiliasi, isCurrency: false, isStatus: true },
    { label: 'Jumlah Transaksi Tanpa Snapshot Harga', val: `${unpricedCount} transaksi`, isCurrency: false },
  ]

  let mRowIdx = 7
  for (const m of reconciliationData) {
    const row = wsRingkasan.getRow(mRowIdx)
    row.height = 20

    const cellA = row.getCell(1)
    cellA.value = m.label
    cellA.font = { name: 'Calibri', size: 10, bold: true, color: { argb: m.highlight ? 'FF0F172A' : 'FF334155' } }
    cellA.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: m.highlight ? 'FFE2E8F0' : 'FFF8FAFC' } }
    cellA.border = thinBorder
    cellA.alignment = { vertical: 'middle', indent: 1 }

    const cellB = row.getCell(2)
    if (m.val === null) {
      cellB.value = 'Belum dapat dihitung'
      cellB.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }
    } else if (m.isStatus) {
      cellB.value = String(m.val)
      cellB.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: m.val === 'SEIMBANG' ? 'FF15803D' : 'FFB91C1C' } }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }
    } else if (m.isCurrency && typeof m.val === 'number') {
      cellB.value = m.val
      cellB.numFmt = currencyFormat
      cellB.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      cellB.alignment = { horizontal: 'right', vertical: 'middle' }
    } else {
      cellB.value = String(m.val)
      cellB.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }
    }
    cellB.border = thinBorder

    for (let c = 3; c <= 8; c++) {
      const cellC = row.getCell(c)
      cellC.border = thinBorder
    }

    mRowIdx++
  }

  // Footnote for unpriced transactions
  const fnRow = wsRingkasan.getRow(mRowIdx)
  fnRow.height = 20
  wsRingkasan.mergeCells(`A${mRowIdx}:H${mRowIdx}`)
  const fnCell = fnRow.getCell(1)
  if (allUnpriced) {
    fnCell.value = '* Catatan: Nilai persediaan belum dapat dihitung karena seluruh transaksi tidak memiliki snapshot harga historis.'
  } else if (unpricedCount > 0) {
    fnCell.value = `* Catatan: Rekonsiliasi hanya mencakup transaksi dengan harga historis (${unpricedCount} transaksi lama belum memiliki snapshot).`
  } else {
    fnCell.value = '* Catatan: Seluruh transaksi memiliki catatan snapshot harga historis dan rekonsiliasi bernilai seimbang (Selisih = Rp0).'
  }
  fnCell.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
  fnCell.alignment = { vertical: 'middle', indent: 1 }

  mRowIdx += 2

  // Section 2: Recap Table by Transaction Type
  wsRingkasan.mergeCells(`A${mRowIdx}:H${mRowIdx}`)
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
    'Jumlah Mutasi Masuk',
    'Nilai Mutasi Masuk',
    'Jumlah Mutasi Keluar',
    'Nilai Mutasi Keluar',
    'Net Mutasi Kuantitas',
    'Nilai Mutasi Persediaan',
  ]

  for (let c = 1; c <= 8; c++) {
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

    // Col 3: Masuk Qty
    const c3 = row.getCell(3)
    c3.value = grp.masukQty > 0 ? grp.masukQty : '—'
    if (typeof c3.value === 'number') c3.numFmt = '#,##0'

    // Col 4: Masuk Val
    const c4 = row.getCell(4)
    if (grp.masukQty > 0 && grp.pricedCount > 0) {
      c4.value = grp.masukVal
      c4.numFmt = currencyFormat
    } else {
      c4.value = '—'
      c4.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
    }

    // Col 5: Keluar Qty
    const c5 = row.getCell(5)
    c5.value = grp.keluarQty > 0 ? grp.keluarQty : '—'
    if (typeof c5.value === 'number') c5.numFmt = '#,##0'

    // Col 6: Keluar Val
    const c6 = row.getCell(6)
    if (grp.keluarQty > 0 && grp.pricedCount > 0) {
      c6.value = grp.keluarVal
      c6.numFmt = currencyFormat
    } else {
      c6.value = '—'
      c6.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
    }

    // Col 7: Net Qty
    const c7 = row.getCell(7)
    c7.value = grp.netQty
    c7.numFmt = '+#,##0;-#,##0;0'

    // Col 8: Net Val
    const c8 = row.getCell(8)
    if (grp.count > 0 && grp.pricedCount > 0) {
      c8.value = grp.netVal
      c8.numFmt = currencyFormat
    } else {
      c8.value = '—'
      c8.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
    }

    for (let c = 1; c <= 8; c++) {
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
  totalRow.getCell(3).value = totalMutasiMasukQty
  totalRow.getCell(3).numFmt = '#,##0'

  const totC4 = totalRow.getCell(4)
  if (!allUnpriced) {
    totC4.value = totalMutasiMasukVal
    totC4.numFmt = currencyFormat
  } else {
    totC4.value = '—'
  }

  totalRow.getCell(5).value = totalMutasiKeluarQty
  totalRow.getCell(5).numFmt = '#,##0'

  const totC6 = totalRow.getCell(6)
  if (!allUnpriced) {
    totC6.value = totalMutasiKeluarVal
    totC6.numFmt = currencyFormat
  } else {
    totC6.value = '—'
  }

  totalRow.getCell(7).value = netMutasiQty
  totalRow.getCell(7).numFmt = '+#,##0;-#,##0;0'

  const totC8 = totalRow.getCell(8)
  if (!allUnpriced) {
    totC8.value = totalMutasiMasukVal - totalMutasiKeluarVal
    totC8.numFmt = currencyFormat
  } else {
    totC8.value = '—'
  }

  for (let c = 1; c <= 8; c++) {
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
  // SHEET 2: RIWAYAT TRANSAKSI (20 KOLOM)
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
    { header: 'Tanggal dan Waktu (WIB)', key: 'txDate', width: 22 },
    { header: 'Nomor Transaksi', key: 'txNo', width: 22 },
    { header: 'Jenis Transaksi', key: 'txType', width: 24 },
    { header: 'Kode Barang', key: 'sku', width: 14 },
    { header: 'Nama Barang', key: 'itemName', width: 32 },
    { header: 'Kategori', key: 'category', width: 18 },
    { header: 'Satuan', key: 'unit', width: 12 },
    { header: 'Jumlah Mutasi Masuk', key: 'masukQty', width: 18 },
    { header: 'Nilai Mutasi Masuk', key: 'masukVal', width: 20 },
    { header: 'Jumlah Mutasi Keluar', key: 'keluarQty', width: 18 },
    { header: 'Nilai Mutasi Keluar', key: 'keluarVal', width: 20 },
    { header: 'Stok Setelah Transaksi', key: 'stokAfter', width: 18 },
    { header: 'Harga Historis Transaksi', key: 'unitCost', width: 20 },
    { header: 'Harga Rata-Rata Setelah Transaksi', key: 'avgCostAfter', width: 24 },
    { header: 'Nilai Persediaan Setelah Transaksi', key: 'invValueAfter', width: 26 },
    { header: 'Transaksi Referensi', key: 'refTxNo', width: 24 },
    { header: 'Petugas', key: 'user', width: 20 },
    { header: 'Keterangan', key: 'reason', width: 30 },
    { header: 'Status Harga', key: 'costStatus', width: 16 },
  ]

  // Title Block (Rows 1-3)
  wsRiwayat.mergeCells('A1:T1')
  const r21 = wsRiwayat.getRow(1)
  r21.getCell(1).value = instNameDisplay
  r21.getCell(1).font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FF1E293B' } }
  r21.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r21.height = 26

  wsRiwayat.mergeCells('A2:T2')
  const r22 = wsRiwayat.getRow(2)
  r22.getCell(1).value = headerTextDisplay
  r22.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r22.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r22.height = 20

  wsRiwayat.mergeCells('A3:T3')
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
    'Tanggal dan Waktu (WIB)',
    'Nomor Transaksi',
    'Jenis Transaksi',
    'Kode Barang',
    'Nama Barang',
    'Kategori',
    'Satuan',
    'Jumlah Mutasi Masuk',
    'Nilai Mutasi Masuk',
    'Jumlah Mutasi Keluar',
    'Nilai Mutasi Keluar',
    'Stok Setelah Transaksi',
    'Harga Historis Transaksi',
    'Harga Rata-Rata Setelah Transaksi',
    'Nilai Persediaan Setelah Transaksi',
    'Transaksi Referensi',
    'Petugas',
    'Keterangan',
    'Status Harga',
  ]

  for (let c = 1; c <= 20; c++) {
    const cell = hRow2.getCell(c)
    cell.value = hTitles2[c - 1]
    cell.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }

  // Rows 6+: Data Rows
  let rIdx2 = 6

  if (txList.length === 0) {
    wsRiwayat.mergeCells(`A6:T6`)
    const emptyRow = wsRiwayat.getRow(6)
    emptyRow.height = 32
    const emptyCell = emptyRow.getCell(1)
    emptyCell.value = 'Tidak ada transaksi pada periode dan filter yang dipilih'
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
      const row = wsRiwayat.getRow(rIdx2)
      row.height = 22

      const isEven = i % 2 === 0
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

      const dateStr = formatInTimeZone(new Date(tx.transaction_at), TZ, 'dd/MM/yyyy HH:mm')
      const symbol = tx.units?.symbol || 'pcs'
      const itemName = sanitizeUserString(tx.items?.name || '—')
      const itemSku = tx.items?.sku || '—'
      const categoryName = sanitizeUserString(tx.items?.categories?.name || '—')

      const delta = tx.quantity_delta
      const userName = sanitizeUserString(tx.profiles?.full_name || tx.profiles?.username || 'System')
      const reasonFormatted = sanitizeUserString(tx.reason || '—')
      const refTxNo = tx.original_transaction_id ? refTxNoMap[tx.original_transaction_id] || tx.original_transaction_id : '—'

      let typeLabel = TYPE_LABELS[tx.transaction_type] || tx.transaction_type
      if (tx.transaction_type === 'REVERSAL') {
        typeLabel = 'Koreksi – Pembatalan Transaksi'
      }

      // Col 1: No.
      row.getCell(1).value = i + 1

      // Col 2: Tanggal dan Waktu
      row.getCell(2).value = dateStr

      // Col 3: Nomor Transaksi
      row.getCell(3).value = tx.transaction_number

      // Col 4: Jenis Transaksi
      const c4 = row.getCell(4)
      c4.value = typeLabel
      if (tx.transaction_type === 'REVERSAL') {
        c4.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFC2410C' } }
      } else if (tx.transaction_type === 'INITIAL') {
        c4.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF1D4ED8' } }
      }

      // Col 5: Kode Barang (SKU)
      row.getCell(5).value = itemSku

      // Col 6: Nama Barang
      row.getCell(6).value = itemName

      // Col 7: Kategori
      row.getCell(7).value = categoryName

      // Col 8: Satuan
      row.getCell(8).value = symbol

      // Col 9 & 10: Jumlah & Nilai Mutasi Masuk
      const c9 = row.getCell(9)
      const c10 = row.getCell(10)
      if (delta > 0) {
        c9.value = delta
        c9.numFmt = '#,##0'
        c9.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FF15803D' } }

        if (cost?.has_cost && cost.transaction_value !== null) {
          c10.value = Math.abs(cost.transaction_value)
          c10.numFmt = currencyFormat
        } else {
          c10.value = '—'
          c10.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
        }
      } else {
        c9.value = '—'
        c9.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
        c10.value = '—'
        c10.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
      }

      // Col 11 & 12: Jumlah & Nilai Mutasi Keluar
      const c11 = row.getCell(11)
      const c12 = row.getCell(12)
      if (delta < 0) {
        c11.value = Math.abs(delta)
        c11.numFmt = '#,##0'
        c11.font = { name: 'Calibri', size: 9.5, bold: true, color: { argb: 'FFB91C1C' } }

        if (cost?.has_cost && cost.transaction_value !== null) {
          c12.value = Math.abs(cost.transaction_value)
          c12.numFmt = currencyFormat
        } else {
          c12.value = '—'
          c12.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
        }
      } else {
        c11.value = '—'
        c11.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
        c12.value = '—'
        c12.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
      }

      // Col 13: Stok Setelah Transaksi
      const c13 = row.getCell(13)
      c13.value = tx.stock_after ?? 0
      c13.numFmt = '#,##0'

      // Col 14: Harga Historis Transaksi
      const c14 = row.getCell(14)
      if (cost?.has_cost && cost.base_unit_cost !== null) {
        c14.value = cost.base_unit_cost
        c14.numFmt = currencyFormat
      } else {
        c14.value = '—'
        c14.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
      }

      // Col 15: Harga Rata-Rata Setelah Transaksi
      const c15 = row.getCell(15)
      if (cost?.has_cost && cost.average_cost_after !== null) {
        c15.value = cost.average_cost_after
        c15.numFmt = currencyFormat
      } else {
        c15.value = '—'
        c15.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
      }

      // Col 16: Nilai Persediaan Setelah Transaksi
      const c16 = row.getCell(16)
      if (cost?.has_cost && cost.inventory_value_after !== null) {
        c16.value = cost.inventory_value_after
        c16.numFmt = currencyFormat
      } else {
        c16.value = '—'
        c16.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF94A3B8' } }
      }

      // Col 17: Transaksi Referensi
      row.getCell(17).value = refTxNo

      // Col 18: Petugas
      row.getCell(18).value = userName

      // Col 19: Keterangan
      row.getCell(19).value = reasonFormatted

      // Col 20: Status Harga
      const c20 = row.getCell(20)
      c20.value = cost?.has_cost ? 'Tersedia' : 'Belum Tersedia'
      if (!cost?.has_cost) {
        c20.font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF94A3B8' } }
      }

      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c)
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        if (!cell.font) {
          cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }
        }
        if ([1, 2, 3, 5, 8, 17, 20].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else if ([9, 10, 11, 12, 13, 14, 15, 16].includes(c)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
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
    { header: 'Transaction ID', key: 'txId', width: 36 },
    { header: 'Transaction Type', key: 'type', width: 18 },
    { header: 'Arah Mutasi', key: 'direction', width: 14 },
    { header: 'Kode Barang (SKU)', key: 'sku', width: 14 },
    { header: 'Nama Barang', key: 'itemName', width: 32 },
    { header: 'Calculation Basis', key: 'basis', width: 22 },
    { header: 'Quantity Before', key: 'qBefore', width: 14 },
    { header: 'Quantity Delta', key: 'delta', width: 14 },
    { header: 'Quantity After', key: 'qAfter', width: 14 },
    { header: 'Average Cost Before', key: 'avgBefore', width: 20 },
    { header: 'Transaction Unit Cost', key: 'unitCost', width: 20 },
    { header: 'Nilai Mutasi Persediaan', key: 'mutasiVal', width: 22 },
    { header: 'Average Cost After', key: 'avgAfter', width: 20 },
    { header: 'Inventory Value Before', key: 'invBefore', width: 22 },
    { header: 'Inventory Value After', key: 'invAfter', width: 22 },
    { header: 'Referenced Transaction ID', key: 'refId', width: 36 },
    { header: 'Status Snapshot', key: 'snapStatus', width: 18 },
    { header: 'Petugas / User ID', key: 'user', width: 36 },
    { header: 'Alasan / Keterangan', key: 'reason', width: 30 },
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
  r32.getCell(1).value = 'DETAIL AUDIT TRAIL TRANSAKSI & VALUASI PERSEDIAAN'
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
    'Transaction ID',
    'Transaction Type',
    'Arah Mutasi',
    'Kode Barang (SKU)',
    'Nama Barang',
    'Calculation Basis',
    'Quantity Before',
    'Quantity Delta',
    'Quantity After',
    'Average Cost Before',
    'Transaction Unit Cost',
    'Nilai Mutasi Persediaan',
    'Average Cost After',
    'Inventory Value Before',
    'Inventory Value After',
    'Referenced Transaction ID',
    'Status Snapshot',
    'Petugas / User ID',
    'Alasan / Keterangan',
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

      const direction = tx.quantity_delta > 0 ? 'MASUK' : tx.quantity_delta < 0 ? 'KELUAR' : 'NEUTRAL'
      let calcBasis = 'LEGACY_UNPRICED'
      if (cost?.has_cost) {
        if (tx.transaction_type === 'IN' || tx.transaction_type === 'INITIAL') calcBasis = 'ACQUISITION_PRICE'
        else if (tx.transaction_type === 'OUT' || tx.transaction_type.startsWith('ADJUSTMENT')) calcBasis = 'MOVING_AVERAGE'
        else if (tx.transaction_type === 'REVERSAL') calcBasis = 'REFERENCE_SNAPSHOT'
      }

      row.getCell(1).value = i + 1
      row.getCell(2).value = tx.id
      row.getCell(3).value = tx.transaction_type
      row.getCell(4).value = direction
      row.getCell(5).value = tx.items?.sku || '—'
      row.getCell(6).value = sanitizeUserString(tx.items?.name || '—')
      row.getCell(7).value = calcBasis

      row.getCell(8).value = tx.stock_before
      row.getCell(8).numFmt = '#,##0'
      row.getCell(9).value = tx.quantity_delta
      row.getCell(9).numFmt = '+#,##0;-#,##0;0'
      row.getCell(10).value = tx.stock_after
      row.getCell(10).numFmt = '#,##0'

      // Col 11: Average Cost Before
      const c11 = row.getCell(11)
      if (cost?.has_cost && cost.average_cost_before !== null) {
        c11.value = cost.average_cost_before
        c11.numFmt = currencyFormat
      } else {
        c11.value = null
      }

      // Col 12: Transaction Unit Cost
      const c12 = row.getCell(12)
      if (cost?.has_cost && cost.base_unit_cost !== null) {
        c12.value = cost.base_unit_cost
        c12.numFmt = currencyFormat
      } else {
        c12.value = null
      }

      // Col 13: Nilai Mutasi Persediaan
      const c13 = row.getCell(13)
      if (cost?.has_cost && cost.transaction_value !== null) {
        c13.value = Math.abs(cost.transaction_value)
        c13.numFmt = currencyFormat
      } else {
        c13.value = null
      }

      // Col 14: Average Cost After
      const c14 = row.getCell(14)
      if (cost?.has_cost && cost.average_cost_after !== null) {
        c14.value = cost.average_cost_after
        c14.numFmt = currencyFormat
      } else {
        c14.value = null
      }

      // Col 15: Inventory Value Before
      const c15 = row.getCell(15)
      if (cost?.has_cost && cost.inventory_value_before !== null) {
        c15.value = cost.inventory_value_before
        c15.numFmt = currencyFormat
      } else {
        c15.value = null
      }

      // Col 16: Inventory Value After
      const c16 = row.getCell(16)
      if (cost?.has_cost && cost.inventory_value_after !== null) {
        c16.value = cost.inventory_value_after
        c16.numFmt = currencyFormat
      } else {
        c16.value = null
      }

      // Col 17: Referenced Transaction ID
      row.getCell(17).value = tx.original_transaction_id || '—'

      // Col 18: Status Snapshot
      row.getCell(18).value = cost?.has_cost ? 'SNAPSHOT_AVAILABLE' : 'NO_SNAPSHOT'

      // Col 19: User ID
      row.getCell(19).value = tx.performed_by || '—'

      // Col 20: Reason
      row.getCell(20).value = sanitizeUserString(tx.reason || '—')

      for (let c = 1; c <= 20; c++) {
        const cell = row.getCell(c)
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }

        if ([1, 2, 3, 4, 5, 7, 17, 18, 19].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else if ([8, 9, 10, 11, 12, 13, 14, 15, 16].includes(c)) {
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
