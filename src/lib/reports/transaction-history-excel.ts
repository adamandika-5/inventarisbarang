import ExcelJS from 'exceljs'
import { formatInTimeZone } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, TransactionType } from '@/types/database'
import { sanitizeUserString } from './inventory-summary-excel'
import { normalizeReportFilters } from './report-filters'

const TZ = 'Asia/Jakarta'
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

export interface LoadTransactionHistoryRowsParams {
  startUtcIso: string
  effectiveEndUtcIso: string
  typeFilter?: string
  itemFilter?: string
}

/**
 * Loads ALL transaction history rows within specified date range using keyset cursor pagination (transaction_at DESC, id DESC).
 * Uses BATCH_SIZE = 1000 with limit() instead of range().
 */
export async function loadTransactionHistoryRows(
  supabase: SupabaseClient<Database>,
  params: LoadTransactionHistoryRowsParams,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any[]> {
  const validTypes = ['IN', 'OUT', 'INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL']
  const BATCH_SIZE = 1000
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let txList: any[] = []
  let hasMore = true

  let lastTxAt: string | null = null
  let lastId: string | null = null
  let lastTxAtMs: number | null = null

  while (hasMore) {
    let queryBuilder = supabase
      .from('stock_transactions')
      .select(
        'id, transaction_number, item_id, transaction_type, input_quantity, base_quantity, quantity_delta, performed_by, transaction_at, stock_before, stock_after, reason, original_transaction_id, is_reversed, reversal_transaction_id, items!item_id(id, sku, name, category_id, categories!category_id(name)), units!unit_id(id, name, symbol), profiles!performed_by(id, full_name, username)',
      )
      .gte('transaction_at', params.startUtcIso)
      .lt('transaction_at', params.effectiveEndUtcIso)

    // Keyset cursor condition for descending order: (transaction_at, id) < (lastTxAt, lastId)
    if (lastTxAt !== null && lastId !== null) {
      queryBuilder = queryBuilder.or(
        `transaction_at.lt.${lastTxAt},and(transaction_at.eq.${lastTxAt},id.lt.${lastId})`,
      )
    }

    if (params.typeFilter === 'ADJUSTMENT') {
      queryBuilder = queryBuilder.in('transaction_type', ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
    } else if (params.typeFilter && params.typeFilter !== 'ALL' && validTypes.includes(params.typeFilter)) {
      queryBuilder = queryBuilder.eq('transaction_type', params.typeFilter as TransactionType)
    }

    if (params.itemFilter) {
      queryBuilder = queryBuilder.eq('item_id', params.itemFilter)
    }

    const { data: batchData, error: batchError } = await queryBuilder
      .order('transaction_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(BATCH_SIZE)

    if (batchError) {
      throw new Error(`Gagal mengambil data transaksi ekspor: ${batchError.message}`)
    }

    if (!batchData || batchData.length === 0) {
      break
    }

    txList = txList.concat(batchData)

    if (batchData.length < BATCH_SIZE) {
      hasMore = false
    } else {
      // Exactly BATCH_SIZE returned, more batches may exist: validate cursor for next batch
      const lastItem = batchData[batchData.length - 1]
      const nextTxAt = lastItem?.transaction_at
      const nextId = lastItem?.id

      if (typeof nextTxAt !== 'string' || typeof nextId !== 'string' || !UUID_REGEX.test(nextId)) {
        throw new Error('Cursor transaksi ekspor tidak valid.')
      }

      const nextTxAtMs = Date.parse(nextTxAt)
      if (!Number.isFinite(nextTxAtMs)) {
        throw new Error('Timestamp cursor transaksi ekspor tidak valid.')
      }

      if (lastTxAtMs !== null && lastId !== null) {
        const isDescending =
          nextTxAtMs < lastTxAtMs || (nextTxAtMs === lastTxAtMs && nextId < lastId)
        if (!isDescending) {
          throw new Error('Cursor transaksi ekspor tidak bergerak menurun.')
        }
      }

      lastTxAt = nextTxAt
      lastId = nextId
      lastTxAtMs = nextTxAtMs
    }
  }

  return txList
}

/**
 * Builds Excel Workbook for "Riwayat Transaksi" (Single Sheet, Quantity-only).
 * Uses keyset cursor pagination (transaction_at DESC, id DESC) with a fixed time snapshot to fetch all matching rows.
 */
export async function buildTransactionHistoryWorkbook(
  supabase: SupabaseClient<Database>,
  params: BuildTransactionHistoryParams,
): Promise<Buffer> {
  const { dateFromStr, dateToStr, typeFilter, itemFilter } = params

  const normalized = normalizeReportFilters({
    from: dateFromStr,
    to: dateToStr,
    type: typeFilter,
    item: itemFilter,
  })

  // Compare absolute timestamps for time snapshot
  const requestedEndMs = Date.parse(normalized.endUtcIso)
  const exportNowMs = Date.now()

  if (!Number.isFinite(requestedEndMs)) {
    throw new Error('Batas akhir laporan tidak valid.')
  }

  const effectiveEndUtcIso = new Date(Math.min(requestedEndMs, exportNowMs)).toISOString()

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
  const typeFilterLabel = getTypeFilterLabel(normalized.typeFilter)
  const generatedAtWib = formatIndonesianDateTime(new Date())
  const dateRangeDisplay = `${formatIndonesianDateStr(normalized.safeFrom)} s/d ${formatIndonesianDateStr(normalized.safeTo)}`

  // 2. Fetch ALL transactions in requested date range using extracted loader
  const txList = await loadTransactionHistoryRows(supabase, {
    startUtcIso: normalized.startUtcIso,
    effectiveEndUtcIso,
    typeFilter: normalized.typeFilter,
    itemFilter: normalized.itemFilter,
  })

  // 3. Resolve reference transaction numbers for reversals in CHUNKS of 500 IDs
  const origTxIds = Array.from(
    new Set(txList.map((t) => t.original_transaction_id).filter((id): id is string => Boolean(id))),
  )
  const refTxNoMap: Record<string, string> = {}

  if (origTxIds.length > 0) {
    const CHUNK_SIZE = 500
    for (let i = 0; i < origTxIds.length; i += CHUNK_SIZE) {
      const chunkIds = origTxIds.slice(i, i + CHUNK_SIZE)
      const { data: origTxData, error: origTxError } = await supabase
        .from('stock_transactions')
        .select('id, transaction_number')
        .in('id', chunkIds)

      if (origTxError) {
        throw new Error(`Gagal mengambil nomor transaksi referensi: ${origTxError.message}`)
      }

      if (origTxData) {
        for (const ot of origTxData) {
          refTxNoMap[ot.id] = ot.transaction_number
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

  // Column Widths (12 columns: A to L)
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
    const txType = t.transaction_type as TransactionType
    const txTypeLabel = TYPE_LABELS[txType] || t.transaction_type
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
