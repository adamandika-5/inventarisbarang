import ExcelJS from 'exceljs'
import { formatInTimeZone } from 'date-fns-tz'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { createSupabaseAdmin } from '@/lib/supabase/server'

const TZ = 'Asia/Jakarta'

export interface SummaryRowItem {
  id: string
  sku: string
  name: string
  categoryName: string
  baseUnitSymbol: string
  saldoAwalQty: number
  nilaiAwal: number
  mutasiMasuk: number
  mutasiKeluar: number
  mutasiJumlah: number
  saldoAkhirQty: number
  nilaiAkhir: number
}

export interface CategorySummaryGroup {
  categoryId: string
  categoryName: string
  items: SummaryRowItem[]
  subtotalNilaiAwal: number
  subtotalNilaiAkhir: number
}

export interface InventoryReportData {
  institutionName: string
  reportHeaderText: string
  dateFromWib: string
  dateToWib: string
  generatedAtWib: string
  categories: CategorySummaryGroup[]
  grandTotalNilaiAwal: number
  grandTotalNilaiAkhir: number
}

export function sanitizeUserString(val: string | null | undefined): string {
  if (!val) return ''
  const str = String(val)
  if (/^[=+\-@]/.test(str)) {
    return `'${str}`
  }
  return str
}

/**
 * Compiles historical inventory summary report data for a given WIB date range.
 */
export async function compileInventoryReportData(
  supabase: SupabaseClient<Database>,
  dateFromStr: string, // YYYY-MM-DD
  dateToStr: string, // YYYY-MM-DD
): Promise<InventoryReportData> {
  const startUtcIso = `${dateFromStr}T00:00:00+07:00`
  const endUtcIso = `${dateToStr}T23:59:59.999+07:00`
  const nowWibStr = formatInTimeZone(new Date(), TZ, 'dd-MM-yyyy HH:mm')

  // Fetch app settings for institution info
  const { data: appSettings } = await supabase
    .from('app_settings')
    .select('institution_name, report_header_text')
    .limit(1)
    .maybeSingle()

  const institutionName = appSettings?.institution_name || 'PEMERINTAH KOTA / INSTANSI'
  const reportHeaderText = appSettings?.report_header_text || 'BADAN PENGELOLAAN KEUANGAN DAN ASET DAERAH'

  // Fetch all categories
  const { data: categoriesData } = await supabase
    .from('categories')
    .select('id, name')
    .order('name', { ascending: true })

  // Fetch all items created on or before endUtcIso
  const { data: itemsData } = await supabase
    .from('items')
    .select('id, sku, name, category_id, is_active, created_at, base_unit:units!base_unit_id(name, symbol)')
    .lte('created_at', endUtcIso)
    .order('sku', { ascending: true })

  const items = itemsData || []
  const categoryList = categoriesData || []

  // Fetch stock transactions up to endUtcIso
  const adminSupabase = createSupabaseAdmin()
  const { data: transactionsData } = await supabase
    .from('stock_transactions')
    .select('id, item_id, transaction_type, input_quantity, base_quantity, quantity_delta, stock_before, stock_after, transaction_at, is_reversed, original_transaction_id')
    .lte('transaction_at', endUtcIso)
    .order('transaction_at', { ascending: true })

  const allTransactions = transactionsData || []

  // Try fetching transaction costs from private schema via admin client
  const costMap: Record<string, { inventory_value_after: number }> = {}
  try {
    const { data: costsData } = await adminSupabase
      .schema('private')
      .from('stock_transaction_costs')
      .select('transaction_id, inventory_value_after')

    if (costsData) {
      for (const c of costsData) {
        costMap[c.transaction_id] = {
          inventory_value_after: parseFloat(c.inventory_value_after || '0'),
        }
      }
    }
  } catch {
    // If private schema query is not available, fallback to 0 or estimates
  }

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

    // Saldo Awal Qty & Nilai Awal
    let saldoAwalQty = 0
    let nilaiAwal = 0
    if (txsBefore.length > 0) {
      const lastTxBefore = txsBefore[txsBefore.length - 1]
      if (lastTxBefore) {
        saldoAwalQty = Number(lastTxBefore.stock_after ?? 0)
        nilaiAwal = costMap[lastTxBefore.id]?.inventory_value_after ?? 0
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
        // Reversal delta determines direction
        if (Number(tx.quantity_delta) > 0) {
          mutasiMasuk += qty
        } else {
          mutasiKeluar += qty
        }
      }
    }

    const mutasiJumlah = mutasiMasuk - mutasiKeluar
    const saldoAkhirQty = saldoAwalQty + mutasiJumlah

    // Saldo Akhir Rp (Nilai Akhir)
    let nilaiAkhir = 0
    if (txs.length > 0) {
      const lastTxAll = txs[txs.length - 1]
      if (lastTxAll) {
        nilaiAkhir = costMap[lastTxAll.id]?.inventory_value_after ?? 0
      }
    }

    // Include item if active OR has non-zero balances/mutations
    const hasActivity =
      saldoAwalQty !== 0 ||
      mutasiMasuk !== 0 ||
      mutasiKeluar !== 0 ||
      saldoAkhirQty !== 0

    if (item.is_active || hasActivity) {
      const baseUnitObj = item.base_unit as { name?: string; symbol?: string } | null
      itemSummaries.push({
        id: item.id,
        sku: item.sku,
        name: item.name,
        categoryName: baseUnitObj?.name || 'Lainnya',
        baseUnitSymbol: baseUnitObj?.symbol || 'pcs',
        saldoAwalQty,
        nilaiAwal: Math.max(0, nilaiAwal),
        mutasiMasuk,
        mutasiKeluar,
        mutasiJumlah,
        saldoAkhirQty,
        nilaiAkhir: Math.max(0, nilaiAkhir),
      })
    }
  }

  // Create Category Map
  const catMap: Record<string, CategorySummaryGroup> = {}

  // Initialize known categories
  for (const cat of categoryList) {
    catMap[cat.id] = {
      categoryId: cat.id,
      categoryName: cat.name,
      items: [],
      subtotalNilaiAwal: 0,
      subtotalNilaiAkhir: 0,
    }
  }

  // Fallback category for uncategorized
  const uncategorizedId = 'uncategorized'
  catMap[uncategorizedId] = {
    categoryId: uncategorizedId,
    categoryName: 'Tanpa Kategori',
    items: [],
    subtotalNilaiAwal: 0,
    subtotalNilaiAkhir: 0,
  }

  // Group items into categories
  for (const summary of itemSummaries) {
    const itemObj = items.find((i) => i.id === summary.id)
    const catId = itemObj?.category_id && catMap[itemObj.category_id] ? itemObj.category_id : uncategorizedId
    const targetGroup = catMap[catId]
    if (targetGroup) {
      targetGroup.items.push(summary)
      targetGroup.subtotalNilaiAwal += summary.nilaiAwal
      targetGroup.subtotalNilaiAkhir += summary.nilaiAkhir
    }
  }

  // Filter out empty categories and build ordered list
  const categoryGroups: CategorySummaryGroup[] = []
  let grandTotalNilaiAwal = 0
  let grandTotalNilaiAkhir = 0

  for (const catId of Object.keys(catMap)) {
    const group = catMap[catId]
    if (group && group.items.length > 0) {
      // Sort items by SKU
      group.items.sort((a, b) => a.sku.localeCompare(b.sku))
      categoryGroups.push(group)
      grandTotalNilaiAwal += group.subtotalNilaiAwal
      grandTotalNilaiAkhir += group.subtotalNilaiAkhir
    }
  }

  return {
    institutionName,
    reportHeaderText,
    dateFromWib: dateFromStr,
    dateToWib: dateToStr,
    generatedAtWib: nowWibStr,
    categories: categoryGroups,
    grandTotalNilaiAwal,
    grandTotalNilaiAkhir,
  }
}

/**
 * Builds the Excel Workbook for "Laporan Rincian Barang Persediaan" (Gambar Referensi 2).
 */
export async function buildInventoryReportWorkbook(
  reportData: InventoryReportData
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.creator = 'InventarisBarang'
  workbook.created = new Date()

  const ws = workbook.addWorksheet('Rincian Persediaan', {
    views: [{ state: 'frozen', ySplit: 8 }],
  })

  // Explicit column widths: A=18, B=45, C-I=16
  ws.columns = [
    { key: 'colA', width: 18 },
    { key: 'colB', width: 45 },
    { key: 'colC', width: 16 },
    { key: 'colD', width: 18 },
    { key: 'colE', width: 16 },
    { key: 'colF', width: 16 },
    { key: 'colG', width: 16 },
    { key: 'colH', width: 16 },
    { key: 'colI', width: 18 },
  ]

  // Format dates for headers
  const dateFromParts = reportData.dateFromWib.split('-')
  const dateToParts = reportData.dateToWib.split('-')
  const formattedDateFrom = `${dateFromParts[2]}-${dateFromParts[1]}-${dateFromParts[0]}`
  const formattedDateTo = `${dateToParts[2]}-${dateToParts[1]}-${dateToParts[0]}`
  const yearTo = dateToParts[0]

  // ── Header Section (Rows 1-5) ─────────────────────────────────────────────
  ws.mergeCells('A1:I1')
  const row1 = ws.getRow(1)
  row1.getCell(1).value = sanitizeUserString(reportData.reportHeaderText)
  row1.getCell(1).font = { name: 'Arial', size: 10, bold: true }
  row1.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row1.height = 20

  ws.mergeCells('A2:I2')
  const row2 = ws.getRow(2)
  row2.getCell(1).value = 'LAPORAN RINCIAN BARANG PERSEDIAAN'
  row2.getCell(1).font = { name: 'Arial', size: 14, bold: true }
  row2.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row2.height = 24

  ws.mergeCells('A3:I3')
  const row3 = ws.getRow(3)
  row3.getCell(1).value = `UNTUK PERIODE YANG BERAKHIR TANGGAL ${formattedDateTo}`
  row3.getCell(1).font = { name: 'Arial', size: 10, bold: true }
  row3.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row3.height = 18

  ws.mergeCells('A4:I4')
  const row4 = ws.getRow(4)
  row4.getCell(1).value = `TAHUN ANGGARAN : ${yearTo}`
  row4.getCell(1).font = { name: 'Arial', size: 10, bold: true }
  row4.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row4.height = 18

  ws.mergeCells('A5:I5')
  const row5 = ws.getRow(5)
  row5.getCell(1).value = `${sanitizeUserString(reportData.institutionName)} · Waktu Pembuatan: ${reportData.generatedAtWib} WIB`
  row5.getCell(1).font = { name: 'Arial', size: 9, italic: true, color: { argb: 'FF4B5563' } }
  row5.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
  row5.height = 18

  ws.getRow(6).height = 10 // Empty spacer row

  // ── Table Headers (Rows 7-8) ───────────────────────────────────────────────
  // Row 7
  ws.mergeCells('A7:B8')
  ws.getCell('A7').value = 'KODE & URAIAN'
  
  ws.mergeCells('C7:D7')
  ws.getCell('C7').value = `NILAI S/D ${formattedDateFrom}`

  ws.mergeCells('E7:G7')
  ws.getCell('E7').value = 'MUTASI'

  ws.mergeCells('H7:I7')
  ws.getCell('H7').value = `NILAI S/D ${formattedDateTo}`

  // Row 8
  ws.getCell('C8').value = 'JUMLAH'
  ws.getCell('D8').value = 'RUPIAH'
  ws.getCell('E8').value = 'MASUK'
  ws.getCell('F8').value = 'KELUAR'
  ws.getCell('G8').value = 'JUMLAH'
  ws.getCell('H8').value = 'JUMLAH'
  ws.getCell('I8').value = 'RUPIAH'

  // Style header cells (Rows 7 & 8)
  const headerStyle = {
    font: { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } },
    fill: {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFE5E7EB' }, // Light gray
    },
    alignment: { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true },
    border: {
      top: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
      bottom: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
      left: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
      right: { style: 'thin' as const, color: { argb: 'FF9CA3AF' } },
    },
  }

  for (let r = 7; r <= 8; r++) {
    const row = ws.getRow(r)
    row.height = 22
    for (let c = 1; c <= 9; c++) {
      const cell = row.getCell(c)
      cell.font = headerStyle.font
      cell.fill = headerStyle.fill
      cell.alignment = headerStyle.alignment
      cell.border = headerStyle.border
    }
  }

  // Correct text for A7 after merge
  ws.getCell('A7').value = 'KODE & NAMA BARANG'

  // ── Data Rows (Category Headers, Items, Subtotals) ─────────────────────────
  let currentRowIdx = 9

  const thinBorder = {
    top: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    left: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
    right: { style: 'thin' as const, color: { argb: 'FFE5E7EB' } },
  }

  for (const catGroup of reportData.categories) {
    // Category Header Row
    ws.mergeCells(`A${currentRowIdx}:C${currentRowIdx}`)
    const catRow = ws.getRow(currentRowIdx)
    catRow.height = 22
    catRow.getCell(1).value = `KATEGORI: ${sanitizeUserString(catGroup.categoryName).toUpperCase()}`
    catRow.getCell(1).font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF1F2937' } }
    catRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' }

    // Category Subtotal Nilai Awal in Col D
    const cellSubAwal = catRow.getCell(4)
    cellSubAwal.value = Number(catGroup.subtotalNilaiAwal)
    cellSubAwal.numFmt = '#,##0'
    cellSubAwal.font = { name: 'Arial', size: 10, bold: true }
    cellSubAwal.alignment = { horizontal: 'right', vertical: 'middle' }

    // Category Subtotal Nilai Akhir in Col I
    const cellSubAkhir = catRow.getCell(9)
    cellSubAkhir.value = Number(catGroup.subtotalNilaiAkhir)
    cellSubAkhir.numFmt = '#,##0'
    cellSubAkhir.font = { name: 'Arial', size: 10, bold: true }
    cellSubAkhir.alignment = { horizontal: 'right', vertical: 'middle' }

    // Apply background & borders to category row
    for (let c = 1; c <= 9; c++) {
      const cell = catRow.getCell(c)
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF3F4F6' },
      }
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
        right: { style: 'thin', color: { argb: 'FFD1D5DB' } },
      }
    }

    currentRowIdx++

    // Items under Category
    for (const item of catGroup.items) {
      const row = ws.getRow(currentRowIdx)
      row.height = 20

      // Col A: KODE (String)
      const cellA = row.getCell(1)
      cellA.value = item.sku
      cellA.numFmt = '@'
      cellA.font = { name: 'Arial', size: 9.5 }
      cellA.alignment = { horizontal: 'left', vertical: 'middle' }

      // Col B: URAIAN (String)
      const cellB = row.getCell(2)
      cellB.value = sanitizeUserString(item.name)
      cellB.font = { name: 'Arial', size: 9.5 }
      cellB.alignment = { horizontal: 'left', vertical: 'middle' }

      // Col C: Saldo Awal JUMLAH (Number)
      const cellC = row.getCell(3)
      cellC.value = Number(item.saldoAwalQty)
      cellC.numFmt = '#,##0'
      cellC.font = { name: 'Arial', size: 9.5 }
      cellC.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col D: Saldo Awal RUPIAH (Number)
      const cellD = row.getCell(4)
      cellD.value = Number(item.nilaiAwal)
      cellD.numFmt = '#,##0'
      cellD.font = { name: 'Arial', size: 9.5 }
      cellD.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col E: Mutasi MASUK (Number)
      const cellE = row.getCell(5)
      cellE.value = Number(item.mutasiMasuk)
      cellE.numFmt = '#,##0'
      cellE.font = { name: 'Arial', size: 9.5 }
      cellE.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col F: Mutasi KELUAR (Number)
      const cellF = row.getCell(6)
      cellF.value = Number(item.mutasiKeluar)
      cellF.numFmt = '#,##0'
      cellF.font = { name: 'Arial', size: 9.5 }
      cellF.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col G: Mutasi JUMLAH (Number)
      const cellG = row.getCell(7)
      cellG.value = Number(item.mutasiJumlah)
      cellG.numFmt = '#,##0'
      cellG.font = { name: 'Arial', size: 9.5 }
      cellG.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col H: Saldo Akhir JUMLAH (Number)
      const cellH = row.getCell(8)
      cellH.value = Number(item.saldoAkhirQty)
      cellH.numFmt = '#,##0'
      cellH.font = { name: 'Arial', size: 9.5 }
      cellH.alignment = { horizontal: 'right', vertical: 'middle' }

      // Col I: Saldo Akhir RUPIAH (Number)
      const cellI = row.getCell(9)
      cellI.value = Number(item.nilaiAkhir)
      cellI.numFmt = '#,##0'
      cellI.font = { name: 'Arial', size: 9.5 }
      cellI.alignment = { horizontal: 'right', vertical: 'middle' }

      // Apply borders to item row
      for (let c = 1; c <= 9; c++) {
        row.getCell(c).border = thinBorder
      }

      currentRowIdx++
    }
  }

  // ── Grand Total Row (JUMLAH TOTAL) ─────────────────────────────────────────
  ws.mergeCells(`A${currentRowIdx}:C${currentRowIdx}`)
  const totalRow = ws.getRow(currentRowIdx)
  totalRow.height = 24

  const cellTotalTitle = totalRow.getCell(1)
  cellTotalTitle.value = 'JUMLAH TOTAL'
  cellTotalTitle.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF111827' } }
  cellTotalTitle.alignment = { horizontal: 'left', vertical: 'middle' }

  // Col D: Grand Total Nilai Awal
  const cellGrandAwal = totalRow.getCell(4)
  cellGrandAwal.value = Number(reportData.grandTotalNilaiAwal)
  cellGrandAwal.numFmt = '#,##0'
  cellGrandAwal.font = { name: 'Arial', size: 10, bold: true }
  cellGrandAwal.alignment = { horizontal: 'right', vertical: 'middle' }

  // Col I: Grand Total Nilai Akhir
  const cellGrandAkhir = totalRow.getCell(9)
  cellGrandAkhir.value = Number(reportData.grandTotalNilaiAkhir)
  cellGrandAkhir.numFmt = '#,##0'
  cellGrandAkhir.font = { name: 'Arial', size: 10, bold: true }
  cellGrandAkhir.alignment = { horizontal: 'right', vertical: 'middle' }

  // Total Row Styling
  const totalBorder = {
    top: { style: 'thin' as const, color: { argb: 'FF374151' } },
    bottom: { style: 'double' as const, color: { argb: 'FF374151' } },
    left: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
    right: { style: 'thin' as const, color: { argb: 'FFD1D5DB' } },
  }

  for (let c = 1; c <= 9; c++) {
    const cell = totalRow.getCell(c)
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE5E7EB' },
    }
    cell.border = totalBorder
  }

  // ── Page Setup & Print Formatting (Section H) ──────────────────────────────
  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: 'landscape',
    fitToWidth: 1,
    fitToHeight: 0,
    fitToPage: true,
    margins: {
      left: 0.5,
      right: 0.5,
      top: 0.75,
      bottom: 0.75,
      header: 0.3,
      footer: 0.3,
    },
    printTitlesRow: '7:8',
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(arrayBuffer)
}
