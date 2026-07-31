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
 * Builds Excel Workbook for "Riwayat Transaksi" (Single Sheet, Quantity-only).
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

  // 3. Column Widths (12 columns: A to L)
  worksheet.columns = [
    { width: 6 },  // A: No.
    { width: 22 }, // B: Tanggal dan Waktu (WIB)
    { width: 22 }, // C: Nomor Transaksi
    { width: 18 }, // D: Jenis Transaksi
    { width: 16 }, // E: Kode Barang
    { width: 30 }, // F: Nama Barang
    { width: 18 }, // G: Kategori
    { width: 16 }, // H: Jumlah Mutasi
    { width: 12 }, // I: Satuan
    { width: 14 }, // J: Stok Setelah
    { width: 20 }, // K: Petugas
    { width: 35 }, // L: Keterangan
  ]

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  }

  const qtyFormat = '#,##0;(#,##0);0'

  // Header Block (Rows 1-3 merged A1:L3)
  worksheet.mergeCells('A1:L1')
  const r1 = worksheet.getRow(1)
  r1.height = 24
  r1.getCell(1).value = instNameDisplay
  r1.getCell(1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  worksheet.mergeCells('A2:L2')
  const r2 = worksheet.getRow(2)
  r2.height = 20
  r2.getCell(1).value = headerTextDisplay
  r2.getCell(1).font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FF334155' } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  worksheet.mergeCells('A3:L3')
  const r3 = worksheet.getRow(3)
  r3.height = 18
  r3.getCell(1).value = `Periode: ${dateRangeDisplay}   |   Jenis: ${typeFilterLabel}   |   Diunduh: ${generatedAtWib}`
  r3.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }

  // Spacer Row 4
  const r4 = worksheet.getRow(4)
  r4.height = 8

  // Column Headers Row 5 (A5:L5)
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

  // Set AutoFilter on A5:L5
  worksheet.autoFilter = 'A5:L5'

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

    // Determine Qty Mutasi
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

    // Col 8: Jumlah Mutasi
    const c8 = row.getCell(8)
    c8.value = qtyMutasi
    c8.numFmt = qtyFormat

    // Col 9: Satuan
    row.getCell(9).value = unitSymbolDisplay

    // Col 10: Stok Setelah
    const c10 = row.getCell(10)
    c10.value = stokSetelah
    c10.numFmt = '#,##0'

    // Col 11: Petugas
    row.getCell(11).value = profileDisplay

    // Col 12: Keterangan
    row.getCell(12).value = notesDisplay

    // Alignments and borders for data row
    for (let c = 1; c <= 12; c++) {
      const cell = row.getCell(c)
      cell.border = thinBorder
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
      if (!cell.font) {
        cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }
      }

      if ([1, 2, 3, 4, 5, 9].includes(c)) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      } else if ([8, 10].includes(c)) {
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
