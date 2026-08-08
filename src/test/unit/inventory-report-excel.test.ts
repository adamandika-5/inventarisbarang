import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildInventoryReportWorkbook,
  sanitizeUserString,
  parseIsoToNano,
  type InventoryReportData,
} from '@/lib/reports/inventory-summary-excel'
import { buildTransactionHistoryWorkbook } from '@/lib/reports/transaction-history-excel'

describe('Inventory Summary Report Excel Generation & Verification (Quantity-Only)', () => {
  it('correctly sanitizes user input strings to prevent formula injection in Excel', () => {
    expect(sanitizeUserString('Normal Item Name')).toBe('Normal Item Name')
    expect(sanitizeUserString('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)")
    expect(sanitizeUserString('+12345')).toBe("'+12345")
    expect(sanitizeUserString('-54321')).toBe("'-54321")
    expect(sanitizeUserString('@EXEC')).toBe("'@EXEC")
    expect(sanitizeUserString('   =TRIM_TEST  ')).toBe("'=TRIM_TEST")
    expect(sanitizeUserString(null)).toBe('')
    expect(sanitizeUserString(undefined)).toBe('')
  })

  it('correctly parses ISO timestamptz strings to nanosecond precision using parseIsoToNano', () => {
    const t1 = parseIsoToNano('2026-07-15T12:00:00.000001Z')
    const t2 = parseIsoToNano('2026-07-15T12:00:00.000002Z')

    expect(t1).not.toBeNull()
    expect(t2).not.toBeNull()
    expect(t2! > t1!).toBe(true)
    expect(t2! - t1!).toBe(1000n) // 1 microsecond = 1000 nanoseconds

    expect(parseIsoToNano('invalid-date')).toBeNull()
  })

  it('builds a valid quantity-only "Rincian Persediaan" Excel workbook strictly matching HEAD layout and format', async () => {
    const mockReportData: InventoryReportData = {
      institutionName: 'DINAS KESEHATAN KOTA BANDUNG',
      reportHeaderText: 'PEMERINTAH KOTA BANDUNG',
      dateFromWib: '2026-01-01',
      dateToWib: '2026-01-31',
      generatedAtWib: '1 Februari 2026, 03.00 WIB',
      categories: [
        {
          categoryId: 'cat-1',
          categoryName: 'Alat Tulis Kantor',
          items: [
            {
              id: 'item-1',
              sku: '00123-ATK', // Leading zero SKU
              name: 'Pensil 2B Super Fine Lead Long Description Name Example',
              categoryName: 'Alat Tulis Kantor',
              baseUnitSymbol: 'pcs',
              saldoAwalQty: 10,
              mutasiMasuk: 10,
              mutasiKeluar: 5,
              mutasiJumlah: 5,
              saldoAkhirQty: 15,
            },
            {
              id: 'item-2',
              sku: '00456-ATK',
              name: 'Buku Tulis Folio 100 Lembar',
              categoryName: 'Alat Tulis Kantor',
              baseUnitSymbol: 'bu',
              saldoAwalQty: 10,
              mutasiMasuk: 5,
              mutasiKeluar: 2,
              mutasiJumlah: 3,
              saldoAkhirQty: 13,
            },
          ],
        },
        {
          categoryId: 'cat-2',
          categoryName: 'Kertas & Karton',
          items: [
            {
              id: 'item-3',
              sku: '00789-KRT',
              name: 'Kertas HVS A4 80gr',
              categoryName: 'Kertas & Karton',
              baseUnitSymbol: 'rim',
              saldoAwalQty: 0,
              mutasiMasuk: 0,
              mutasiKeluar: 0,
              mutasiJumlah: 0,
              saldoAkhirQty: 0,
            },
          ],
        },
      ],
    }

    // Build Excel buffer
    const buffer = await buildInventoryReportWorkbook(mockReportData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)

    // Read back workbook using ExcelJS
    const readerWorkbook = new ExcelJS.Workbook()
    await readerWorkbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    // 1. Verify Sheet Name (ONLY 1 sheet: Rincian Persediaan)
    expect(readerWorkbook.worksheets.map((w) => w.name)).toEqual(['Rincian Persediaan'])
    const worksheet = readerWorkbook.getWorksheet('Rincian Persediaan')
    expect(worksheet).toBeDefined()
    if (!worksheet) return

    // Verify Workbook Title Merges (Explicit assertion for A1:H1, A2:H2, A3:H3, A4:H4)
    const merges = (worksheet.model as { merges?: string[] }).merges || []
    expect(merges).toContain('A1:H1')
    expect(merges).toContain('A2:H2')
    expect(merges).toContain('A3:H3')
    expect(merges).toContain('A4:H4')

    // 2. Verify Page Setup & Print Titles & Freeze Pane & Column Widths
    expect(worksheet.pageSetup.orientation).toBe('landscape')
    expect(worksheet.pageSetup.paperSize).toBe(9) // A4
    expect(worksheet.pageSetup.fitToWidth).toBe(1)
    expect(worksheet.views[0]?.state).toBe('frozen')
    expect((worksheet.views[0] as ExcelJS.WorksheetViewFrozen)?.ySplit).toBe(5)

    const expectedWidths = [6, 14, 34, 18, 16, 16, 16, 18]
    for (let c = 1; c <= 8; c++) {
      expect(worksheet.getColumn(c).width).toBe(expectedWidths[c - 1])
    }

    // 3. Verify Merged Header Title Block (Rows 1-4: Merged A1:H1, A2:H2, A3:H3, A4:H4)
    const instCell = worksheet.getCell('A1')
    expect(instCell.value).toBe('DINAS KESEHATAN KOTA BANDUNG')

    const titleCell = worksheet.getCell('A2')
    expect(titleCell.value).toBe('PEMERINTAH KOTA BANDUNG')

    const dateCell = worksheet.getCell('A3')
    expect(dateCell.value).toBe('Periode: 1 Januari 2026 s/d 31 Januari 2026')

    const genCell = worksheet.getCell('A4')
    expect(genCell.value).toBe('Dibuat pada: 1 Februari 2026, 03.00 WIB')

    // 4. Verify Table Headers (Row 6 - 8 columns total)
    const headersExpected = [
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
      const headerCell = worksheet.getRow(6).getCell(c)
      expect(headerCell.value).toBe(headersExpected[c - 1])
    }

    // Explicit check for required positions
    expect(worksheet.getCell('B6').value).toBe('Kode Barang (SKU)')
    expect(worksheet.getCell('H6').value).toBe('Saldo Akhir (Qty)')

    // 5. Verify Category Header Row Styling (EXACT HEAD RECOVERY: font white, fill FF334155)
    const cat1Row = worksheet.getRow(7)
    const cat1Cell = cat1Row.getCell(1)
    expect(cat1Cell.value).toBe('KATEGORI: ALAT TULIS KANTOR')
    expect(cat1Cell.font?.color?.argb).toBe('FFFFFFFF')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((cat1Cell.fill as any)?.fgColor?.argb).toBe('FF334155')

    // 6. Verify Item Data & Types
    // Row 8: Item 1 (00123-ATK)
    const item1SkuCell = worksheet.getCell('B8')
    expect(item1SkuCell.value).toBe('00123-ATK') // String preserved leading zero

    const item1SaldoAwalQtyCell = worksheet.getCell('E8')
    expect(typeof item1SaldoAwalQtyCell.value).toBe('number')
    expect(item1SaldoAwalQtyCell.value).toBe(10)
    expect(item1SaldoAwalQtyCell.numFmt).toBe('#,##0')

    const item1MutasiMasukCell = worksheet.getCell('F8')
    expect(typeof item1MutasiMasukCell.value).toBe('number')
    expect(item1MutasiMasukCell.value).toBe(10)
    expect(item1MutasiMasukCell.numFmt).toBe('#,##0')

    const item1MutasiKeluarCell = worksheet.getCell('G8')
    expect(typeof item1MutasiKeluarCell.value).toBe('number')
    expect(item1MutasiKeluarCell.value).toBe(5)
    expect(item1MutasiKeluarCell.numFmt).toBe('#,##0')

    const item1SaldoAkhirQtyCell = worksheet.getCell('H8')
    expect(typeof item1SaldoAkhirQtyCell.value).toBe('number')
    expect(item1SaldoAkhirQtyCell.value).toBe(15)
    expect(item1SaldoAkhirQtyCell.numFmt).toBe('#,##0')

    // 7. Ledger Reconciliation for Item 1
    const saldoAwal = item1SaldoAwalQtyCell.value as number
    const mutasiMasuk = item1MutasiMasukCell.value as number
    const mutasiKeluar = item1MutasiKeluarCell.value as number
    const saldoAkhir = item1SaldoAkhirQtyCell.value as number
    expect(saldoAwal + mutasiMasuk - mutasiKeluar).toBe(saldoAkhir)
  })

  it('builds a valid quantity-only "Riwayat Transaksi" Excel workbook (12 columns, no price columns)', async () => {
    const mockQueryBuilder = {
      gte: () => mockQueryBuilder,
      lte: () => mockQueryBuilder,
      lt: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      in: () => mockQueryBuilder,
      or: () => mockQueryBuilder,
      order: () => mockQueryBuilder,
      limit: () =>
        Promise.resolve({
          data: [
            {
              id: 'tx-1',
              transaction_number: 'TXN-20260101-000001',
              transaction_type: 'IN',
              input_quantity: 10,
              base_quantity: 10,
              quantity_delta: 10,
              transaction_at: '2026-01-01T10:00:00Z',
              stock_before: 0,
              stock_after: 10,
              reason: 'Pembelian baru',
              is_reversed: false,
              items: { sku: '00123-ATK', name: 'Pensil 2B' },
              units: { symbol: 'pcs' },
              profiles: { full_name: 'Admin Test' },
            },
            {
              id: 'tx-2',
              transaction_number: 'TXN-20260101-000002',
              transaction_type: 'OUT',
              input_quantity: 5,
              base_quantity: 5,
              quantity_delta: -5,
              transaction_at: '2026-01-02T10:00:00Z',
              stock_before: 10,
              stock_after: 5,
              reason: 'Pemakaian',
              is_reversed: false,
              items: { sku: '00123-ATK', name: 'Pensil 2B' },
              units: { symbol: 'pcs' },
              profiles: { full_name: 'Admin Test' },
            },
          ],
        }),
    }

    const mockSupabase = {
      from: () => ({
        select: () => mockQueryBuilder,
      }),
    }

    const buffer = await buildTransactionHistoryWorkbook(
      mockSupabase as unknown as Parameters<typeof buildTransactionHistoryWorkbook>[0],
      {
        dateFromStr: '2026-01-01',
        dateToStr: '2026-01-31',
        institutionName: 'BPS KOTA MOJOKERTO',
        reportHeaderText: 'LAPORAN RIWAYAT TRANSAKSI STOK',
      },
    )

    expect(buffer).toBeInstanceOf(Buffer)

    const readerWorkbook = new ExcelJS.Workbook()
    await readerWorkbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    expect(readerWorkbook.worksheets.map((w) => w.name)).toEqual(['Riwayat Transaksi'])

    const wsRiwayat = readerWorkbook.getWorksheet('Riwayat Transaksi')
    expect(wsRiwayat).toBeDefined()
    if (!wsRiwayat) return

    const headersExpected = [
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

    for (let c = 1; c <= 12; c++) {
      const headerCell = wsRiwayat.getRow(5).getCell(c)
      expect(headerCell.value).toBe(headersExpected[c - 1])
    }

    const qtyMutasiCell1 = wsRiwayat.getCell('H6')
    expect(qtyMutasiCell1.value).toBe(10)

    const stokSetelahCell1 = wsRiwayat.getCell('J6')
    expect(stokSetelahCell1.value).toBe(10)

    const qtyMutasiCell2 = wsRiwayat.getCell('H7')
    expect(qtyMutasiCell2.value).toBe(-5)

    const stokSetelahCell2 = wsRiwayat.getCell('J7')
    expect(stokSetelahCell2.value).toBe(5)
  })
})
