import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

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
 */
export async function compileInventoryReportData(
  supabase: SupabaseClient<Database>,
  dateFromStr: string,
  dateToStr: string,
): Promise<InventoryReportData> {
  const startUtcIso = `${dateFromStr}T00:00:00+07:00`
  const endUtcIso = `${dateToStr}T23:59:59.999+07:00`
  const nowWibStr = formatIndonesianDateTime(new Date())

  // 1. Fetch app_settings
  const { data: settings } = await supabase
    .from('app_settings')
    .select('institution_name, report_header_text')
    .limit(1)
    .maybeSingle()

  const institutionName = settings?.institution_name
    ? settings.institution_name.trim().toUpperCase()
    : 'NAMA INSTANSI BELUM DIATUR'
  const reportHeaderText = settings?.report_header_text
    ? settings.report_header_text.trim()
    : 'LAPORAN RINCIAN BARANG PERSEDIAAN'

  // 2. Fetch categories
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true })

  const categoryList = categoriesData || []

  // 3. Fetch items with base units & category
  const { data: itemsData } = await supabase
    .from('items')
    .select('id, sku, name, current_stock, is_active, category_id, base_unit_id, base_unit:units!base_unit_id(name, symbol), categories!category_id(name)')
    .order('sku', { ascending: true })

  const items = itemsData || []

  // 4. Fetch stock transactions up to endUtcIso
  const { data: transactionsData } = await supabase
    .from('stock_transactions')
    .select('id, item_id, transaction_type, input_quantity, base_quantity, quantity_delta, stock_before, stock_after, transaction_at, is_reversed, original_transaction_id')
    .lte('transaction_at', endUtcIso)
    .order('transaction_at', { ascending: true })

  const allTransactions = transactionsData || []

  // Group transactions by item_id
  const itemTxMap: Record<string, typeof allTransactions> = {}
  for (const tx of allTransactions) {
    const list = itemTxMap[tx.item_id] || []
    list.push(tx)
    itemTxMap[tx.item_id] = list
  }

  // Process per item
  const itemSummaries: SummaryRowItem[] = []

  for (const item of items) {
    const txs = itemTxMap[item.id] || []

    // Transactions before startUtcIso
    const txsBefore = txs.filter((t) => t.transaction_at < startUtcIso)
    // Transactions during [startUtcIso, endUtcIso]
    const txsPeriod = txs.filter(
      (t) => t.transaction_at >= startUtcIso && t.transaction_at <= endUtcIso
    )

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
    { width: 6 },  // A: No.
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
    // Category Header Row
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
