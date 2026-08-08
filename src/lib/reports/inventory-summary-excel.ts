import ExcelJS from 'exceljs'
import { formatInTimeZone } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
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
  const dayStr = formatInTimeZone(d, TZ, 'd')
  const monthIdx = parseInt(formatInTimeZone(d, TZ, 'M'), 10) - 1
  const yearStr = formatInTimeZone(d, TZ, 'yyyy')
  const timeStr = formatInTimeZone(d, TZ, 'HH.mm')
  const monthName = INDO_MONTHS[monthIdx] || ''
  return `${dayStr} ${monthName} ${yearStr}, ${timeStr} WIB`
}

/**
 * Parses an ISO 8601 / TIMESTAMPTZ string to BigInt nanoseconds for sub-millisecond precision.
 */
export function parseIsoToNano(isoStr: string): bigint | null {
  const ms = Date.parse(isoStr)
  if (!Number.isFinite(ms)) return null

  const match = isoStr.match(/\.(\d+)/)
  if (!match) return BigInt(ms) * 1000000n

  const digits = match[1]!
  const secMs = BigInt(Math.floor(ms / 1000)) * 1000n
  const fracNano = BigInt(digits.slice(0, 9).padEnd(9, '0'))

  return secMs * 1000000n + fracNano
}

/**
 * Utility: Sanitizes user-input strings to prevent formula injection in Excel.
 */
export function sanitizeUserString(val: string | null | undefined): string {
  if (!val) return ''
  const trimmed = val.trim()
  if (/^[=+@-]/.test(trimmed)) {
    return `'${trimmed}`
  }
  return trimmed
}

export interface SummaryRowItem {
  id: string
  sku: string
  name: string
  categoryName: string
  baseUnitSymbol: string
  saldoAwalQty: number
  mutasiMasuk: number
  mutasiKeluar: number
  mutasiJumlah: number
  saldoAkhirQty: number
}

export interface CategorySummaryGroup {
  categoryId: string
  categoryName: string
  items: SummaryRowItem[]
}

export interface InventoryReportData {
  institutionName: string
  reportHeaderText: string
  dateFromWib: string
  dateToWib: string
  generatedAtWib: string
  categories: CategorySummaryGroup[]
}

/**
 * Compiles report data for "Laporan Rincian Barang Persediaan" (Quantity-only).
 * Uses keyset cursor pagination for categories, items, and transactions with a fixed time snapshot.
 */
export async function compileInventoryReportData(
  supabase: SupabaseClient<Database>,
  dateFromStr: string,
  dateToStr: string,
): Promise<InventoryReportData> {
  const exportNow = new Date()
  const exportNowMs = exportNow.getTime()

  const { startUtcIso, endUtcIso } = normalizeReportFilters({
    from: dateFromStr,
    to: dateToStr,
  })
  const nowWibStr = formatIndonesianDateTime(exportNow)

  const startNano = parseIsoToNano(startUtcIso)
  const requestedEndMs = Date.parse(endUtcIso)

  if (!Number.isFinite(requestedEndMs) || startNano === null) {
    throw new Error('Batas tanggal laporan tidak valid.')
  }

  const effectiveEndMs = Math.min(requestedEndMs, exportNowMs)
  const effectiveEndUtcIso = new Date(effectiveEndMs).toISOString()
  const effectiveEndNano = parseIsoToNano(effectiveEndUtcIso)

  if (effectiveEndNano === null) {
    throw new Error('Batas akhir laporan tidak valid.')
  }

  // 1. Fetch app_settings
  const { data: settings, error: settingsError } = await supabase
    .from('app_settings')
    .select('institution_name, report_header_text')
    .limit(1)
    .maybeSingle()

  if (settingsError) {
    throw new Error(`Gagal mengambil data pengaturan instansi: ${settingsError.message}`)
  }

  const institutionName = settings?.institution_name
    ? settings.institution_name.trim().toUpperCase()
    : 'NAMA INSTANSI BELUM DIATUR'
  const reportHeaderText = settings?.report_header_text
    ? settings.report_header_text.trim()
    : 'LAPORAN RINCIAN BARANG PERSEDIAAN'

  const BATCH_SIZE = 1000

  // 2. Fetch categories (Keyset cursor pagination on id ASC)
  const categoryList: Array<{ id: string; name: string }> = []
  let hasMoreCategories = true
  let lastCatId: string | null = null

  while (hasMoreCategories) {
    let catQuery = supabase
      .from('categories')
      .select('id, name')

    if (lastCatId !== null) {
      catQuery = catQuery.gt('id', lastCatId)
    }

    const { data: catBatch, error: catError } = await catQuery
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)

    if (catError) {
      throw new Error(`Gagal mengambil data kategori ekspor: ${catError.message}`)
    }

    if (!catBatch || catBatch.length === 0) {
      break
    }

    categoryList.push(...catBatch)

    if (catBatch.length < BATCH_SIZE) {
      hasMoreCategories = false
    } else {
      const lastCat = catBatch[catBatch.length - 1]
      const nextCatId = lastCat?.id

      if (typeof nextCatId !== 'string' || !UUID_REGEX.test(nextCatId)) {
        throw new Error('Cursor kategori ekspor tidak valid.')
      }

      if (lastCatId !== null && nextCatId <= lastCatId) {
        throw new Error('Cursor kategori ekspor tidak bergerak maju.')
      }

      lastCatId = nextCatId
    }
  }

  // Sort categories deterministically: name ASC, id ASC
  categoryList.sort((a, b) => {
    const nameCmp = (a.name || '').localeCompare(b.name || '')
    if (nameCmp !== 0) return nameCmp
    return a.id.localeCompare(b.id)
  })

  // 3. Fetch items with base units & category (Keyset cursor pagination on id ASC)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: any[] = []
  let hasMoreItems = true
  let lastItemId: string | null = null

  while (hasMoreItems) {
    let itemQuery = supabase
      .from('items')
      .select(
        'id, sku, name, current_stock, is_active, category_id, base_unit_id, base_unit:units!base_unit_id(name, symbol), categories!category_id(name)',
      )

    if (lastItemId !== null) {
      itemQuery = itemQuery.gt('id', lastItemId)
    }

    const { data: itemBatch, error: itemError } = await itemQuery
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)

    if (itemError) {
      throw new Error(`Gagal mengambil data barang ekspor: ${itemError.message}`)
    }

    if (!itemBatch || itemBatch.length === 0) {
      break
    }

    items.push(...itemBatch)

    if (itemBatch.length < BATCH_SIZE) {
      hasMoreItems = false
    } else {
      const lastItem = itemBatch[itemBatch.length - 1]
      const nextItemId = lastItem?.id

      if (typeof nextItemId !== 'string' || !UUID_REGEX.test(nextItemId)) {
        throw new Error('Cursor barang ekspor tidak valid.')
      }

      if (lastItemId !== null && nextItemId <= lastItemId) {
        throw new Error('Cursor barang ekspor tidak bergerak maju.')
      }

      lastItemId = nextItemId
    }
  }

  // Sort items deterministically: sku ASC, id ASC
  items.sort((a, b) => {
    const skuCmp = (a.sku || '').localeCompare(b.sku || '')
    if (skuCmp !== 0) return skuCmp
    return a.id.localeCompare(b.id)
  })

  // 4. KEYSET CURSOR PAGINATION: Batch-fetch ALL stock transactions up to effectiveEndUtcIso
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let allTransactions: any[] = []
  let hasMoreTx = true

  let lastTxAt: string | null = null
  let lastId: string | null = null
  let lastTxAtNano: bigint | null = null

  while (hasMoreTx) {
    let queryBuilder = supabase
      .from('stock_transactions')
      .select(
        'id, item_id, transaction_type, input_quantity, base_quantity, quantity_delta, stock_before, stock_after, transaction_at, is_reversed, original_transaction_id',
      )
      .lt('transaction_at', effectiveEndUtcIso)

    // Keyset cursor condition for ascending order: (transaction_at, id) > (lastTxAt, lastId)
    if (lastTxAt !== null && lastId !== null) {
      queryBuilder = queryBuilder.or(
        `transaction_at.gt.${lastTxAt},and(transaction_at.eq.${lastTxAt},id.gt.${lastId})`,
      )
    }

    const { data: batchData, error: batchError } = await queryBuilder
      .order('transaction_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(BATCH_SIZE)

    if (batchError) {
      throw new Error(`Gagal mengambil data persediaan ekspor: ${batchError.message}`)
    }

    if (!batchData || batchData.length === 0) {
      break
    }

    allTransactions = allTransactions.concat(batchData)

    if (batchData.length < BATCH_SIZE) {
      hasMoreTx = false
    } else {
      const lastItem = batchData[batchData.length - 1]
      const nextTxAt = lastItem?.transaction_at
      const nextId = lastItem?.id

      if (typeof nextTxAt !== 'string' || typeof nextId !== 'string' || !UUID_REGEX.test(nextId)) {
        throw new Error('Cursor transaksi ekspor tidak valid.')
      }

      const nextTxAtNano = parseIsoToNano(nextTxAt)
      if (nextTxAtNano === null) {
        throw new Error('Timestamp cursor transaksi ekspor tidak valid.')
      }

      if (lastTxAtNano !== null && lastId !== null) {
        const isAscending =
          nextTxAtNano > lastTxAtNano || (nextTxAtNano === lastTxAtNano && nextId > lastId)
        if (!isAscending) {
          throw new Error('Cursor transaksi ekspor tidak bergerak maju.')
        }
      }

      lastTxAt = nextTxAt
      lastId = nextId
      lastTxAtNano = nextTxAtNano
    }
  }

  // Group transactions by item_id
  const itemTxMap: Record<string, typeof allTransactions> = {}
  for (const tx of allTransactions) {
    const list = itemTxMap[tx.item_id] || []
    list.push(tx)
    itemTxMap[tx.item_id] = list
  }

  // Process per item using BigInt Nanosecond precision
  const itemSummaries: SummaryRowItem[] = []

  for (const item of items) {
    const txs = itemTxMap[item.id] || []

    const txsBefore: typeof txs = []
    const txsPeriod: typeof txs = []

    for (const tx of txs) {
      const tNano = parseIsoToNano(tx.transaction_at)
      if (tNano === null) {
        throw new Error(`Timestamp transaksi persediaan tidak valid: ${tx.transaction_at}`)
      }

      if (tNano < startNano) {
        txsBefore.push(tx)
      } else if (tNano >= startNano && tNano < effectiveEndNano) {
        txsPeriod.push(tx)
      }
    }

    // Saldo Awal Qty
    let saldoAwalQty = 0
    if (txsBefore.length > 0) {
      const lastTxBefore = txsBefore[txsBefore.length - 1]
      if (lastTxBefore) {
        saldoAwalQty = Number(lastTxBefore.stock_after ?? 0)
      }
    }

    // Mutasi Masuk & Mutasi Keluar during period
    let mutasiMasuk = 0
    let mutasiKeluar = 0

    for (const tx of txsPeriod) {
      const qty = Math.abs(Number(tx.base_quantity ?? 0))
      const type = tx.transaction_type

      if (type === 'IN' || type === 'ADJUSTMENT_IN' || type === 'INITIAL') {
        mutasiMasuk += qty
      } else if (type === 'OUT' || type === 'ADJUSTMENT_OUT') {
        mutasiKeluar += qty
      } else if (type === 'REVERSAL') {
        if (Number(tx.quantity_delta) > 0) {
          mutasiMasuk += qty
        } else {
          mutasiKeluar += qty
        }
      }
    }

    const mutasiJumlah = mutasiMasuk - mutasiKeluar
    const saldoAkhirQty = saldoAwalQty + mutasiJumlah
    const curStock = Number(item.current_stock ?? saldoAkhirQty)

    // Include item if active OR has non-zero balances/mutations
    const hasActivity =
      saldoAwalQty !== 0 ||
      mutasiMasuk !== 0 ||
      mutasiKeluar !== 0 ||
      saldoAkhirQty !== 0 ||
      curStock !== 0

    if (item.is_active || hasActivity) {
      const baseUnitObj = item.base_unit as { name?: string; symbol?: string } | null
      const catObj = item.categories as { name?: string } | null

      itemSummaries.push({
        id: item.id,
        sku: item.sku,
        name: item.name,
        categoryName: catObj?.name ?? 'Tanpa Kategori',
        baseUnitSymbol: baseUnitObj?.symbol ?? 'unit',
        saldoAwalQty,
        mutasiMasuk,
        mutasiKeluar,
        mutasiJumlah,
        saldoAkhirQty,
      })
    }
  }

  // Group by category
  const categoriesMap: Record<string, CategorySummaryGroup> = {}

  for (const cat of categoryList) {
    categoriesMap[cat.id] = {
      categoryId: cat.id,
      categoryName: cat.name,
      items: [],
    }
  }

  const uncategorizedKey = 'uncategorized'
  categoriesMap[uncategorizedKey] = {
    categoryId: uncategorizedKey,
    categoryName: 'Tanpa Kategori',
    items: [],
  }

  for (const itemSummary of itemSummaries) {
    const itemObj = items.find((i) => i.id === itemSummary.id)
    const catId = itemObj?.category_id || uncategorizedKey
    if (!categoriesMap[catId]) {
      categoriesMap[catId] = {
        categoryId: catId,
        categoryName: itemSummary.categoryName,
        items: [],
      }
    }
    const grp = categoriesMap[catId]!
    grp.items.push(itemSummary)
  }

  // Filter categories with items
  const finalCategories = Object.values(categoriesMap).filter((c) => c.items.length > 0)

  return {
    institutionName,
    reportHeaderText,
    dateFromWib: dateFromStr,
    dateToWib: dateToStr,
    generatedAtWib: nowWibStr,
    categories: finalCategories,
  }
}

/**
 * Builds Excel workbook from InventoryReportData (Quantity-only).
 * Strictly preserves original HEAD format, headers, labels, and column layout (8 columns A-H).
 */
export async function buildInventoryReportWorkbook(
  reportData: InventoryReportData,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'InventarisBarang'
  workbook.created = new Date()

  const worksheet = workbook.addWorksheet('Rincian Persediaan', {
    views: [{ state: 'frozen', ySplit: 5 }],
  })

  worksheet.pageSetup = {
    orientation: 'landscape',
    paperSize: 9, // A4
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  }

  worksheet.columns = [
    { width: 6 }, // A: No.
    { width: 14 }, // B: Kode Barang (SKU)
    { width: 34 }, // C: Nama Barang
    { width: 18 }, // D: Satuan
    { width: 16 }, // E: Saldo Awal Qty
    { width: 16 }, // F: Mutasi Masuk Qty
    { width: 16 }, // G: Mutasi Keluar Qty
    { width: 18 }, // H: Saldo Akhir Qty
  ]

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  }

  // Header Title Block (Rows 1-4)
  worksheet.mergeCells('A1:H1')
  const r1 = worksheet.getRow(1)
  r1.getCell(1).value = reportData.institutionName
  r1.getCell(1).font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FF1E293B' } }
  r1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r1.height = 28

  worksheet.mergeCells('A2:H2')
  const r2 = worksheet.getRow(2)
  r2.getCell(1).value = reportData.reportHeaderText
  r2.getCell(1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: 'FF334155' } }
  r2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r2.height = 22

  worksheet.mergeCells('A3:H3')
  const r3 = worksheet.getRow(3)
  r3.getCell(1).value = `Periode: ${formatIndonesianDateStr(reportData.dateFromWib)} s/d ${formatIndonesianDateStr(reportData.dateToWib)}`
  r3.getCell(1).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF475569' } }
  r3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r3.height = 18

  worksheet.mergeCells('A4:H4')
  const r4 = worksheet.getRow(4)
  r4.getCell(1).value = `Dibuat pada: ${reportData.generatedAtWib}`
  r4.getCell(1).font = { name: 'Calibri', size: 9.5, italic: true, color: { argb: 'FF64748B' } }
  r4.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  r4.height = 18

  worksheet.getRow(5).height = 10

  // Table Headers (Row 6)
  const hRow = worksheet.getRow(6)
  hRow.height = 26
  const headers = [
    'No.',
    'Kode Barang (SKU)',
    'Nama Barang',
    'Satuan',
    'Saldo Awal (Qty)',
    'Mutasi Masuk (Qty)',
    'Mutasi Keluar (Qty)',
    'Saldo Akhir (Qty)',
  ]

  for (let c = 1; c <= 8; c++) {
    const cell = hRow.getCell(c)
    cell.value = headers[c - 1]
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    cell.border = thinBorder
  }

  let rowIdx = 7
  let globalItemNumber = 1

  for (const catGroup of reportData.categories) {
    // Category Header Row (RESTORED EXACT HEAD STYLING: font white, fill FF334155)
    worksheet.mergeCells(`A${rowIdx}:H${rowIdx}`)
    const catRow = worksheet.getRow(rowIdx)
    catRow.height = 22
    const catCell = catRow.getCell(1)
    catCell.value = `KATEGORI: ${catGroup.categoryName.toUpperCase()}`
    catCell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } }
    catCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }
    catCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 }
    for (let c = 1; c <= 8; c++) {
      catRow.getCell(c).border = thinBorder
    }
    rowIdx++

    // Data Rows
    for (const item of catGroup.items) {
      const row = worksheet.getRow(rowIdx)
      row.height = 20

      const isEven = rowIdx % 2 === 0
      const rowBg = isEven ? 'FFF8FAFC' : 'FFFFFFFF'

      row.getCell(1).value = globalItemNumber++
      row.getCell(2).value = item.sku
      row.getCell(3).value = sanitizeUserString(item.name)
      row.getCell(4).value = item.baseUnitSymbol

      row.getCell(5).value = item.saldoAwalQty
      row.getCell(5).numFmt = '#,##0'

      row.getCell(6).value = item.mutasiMasuk
      row.getCell(6).numFmt = '#,##0'

      row.getCell(7).value = item.mutasiKeluar
      row.getCell(7).numFmt = '#,##0'

      row.getCell(8).value = item.saldoAkhirQty
      row.getCell(8).numFmt = '#,##0'

      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c)
        cell.border = thinBorder
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } }
        if (!cell.font) {
          cell.font = { name: 'Calibri', size: 9.5, color: { argb: 'FF0F172A' } }
        }

        if ([1, 2, 4].includes(c)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' }
        } else if ([5, 6, 7, 8].includes(c)) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' }
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true }
        }
      }

      rowIdx++
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
