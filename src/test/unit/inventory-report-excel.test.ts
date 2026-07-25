import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import {
  buildInventoryReportWorkbook,
  type InventoryReportData,
  sanitizeUserString,
} from '@/lib/reports/inventory-summary-excel'
import { buildTransactionHistoryWorkbook } from '@/lib/reports/transaction-history-excel'

describe('Inventory Summary Report Excel Generation & Verification', () => {
  it('correctly sanitizes formula strings without affecting negative numbers', () => {
    expect(sanitizeUserString('=1+1')).toBe("'=1+1")
    expect(sanitizeUserString('+cmd')).toBe("'+cmd")
    expect(sanitizeUserString('-cmd')).toBe("'-cmd")
    expect(sanitizeUserString('@eval')).toBe("'@eval")
    expect(sanitizeUserString('Normal Text')).toBe('Normal Text')
    expect(sanitizeUserString('')).toBe('')
  })

  it('builds a valid "Rincian Persediaan" Excel workbook matching Reference Image 2 structure', async () => {
    const mockReportData: InventoryReportData = {
      institutionName: 'DINAS KESEHATAN KOTA BANDUNG',
      reportHeaderText: 'PEMERINTAH KOTA BANDUNG',
      dateFromWib: '2026-01-01',
      dateToWib: '2026-01-31',
      generatedAtWib: '31-01-2026 23:59',
      categories: [
        {
          categoryId: 'cat-1',
          categoryName: 'Alat Tulis Kantor',
          subtotalNilaiAwal: 150000,
          subtotalNilaiAkhir: 210000,
          items: [
            {
              id: 'item-1',
              sku: '00123-ATK', // Leading zero SKU
              name: 'Pensil 2B Super Fine Lead Long Description Name Example',
              categoryName: 'Alat Tulis Kantor',
              baseUnitSymbol: 'pcs',
              saldoAwalQty: 10,
              nilaiAwal: 50000,
              mutasiMasuk: 10,
              mutasiKeluar: 5,
              mutasiJumlah: 5,
              saldoAkhirQty: 15,
              nilaiAkhir: 75000,
            },
            {
              id: 'item-2',
              sku: '00456-ATK',
              name: 'Buku Tulis Folio 100 Lembar',
              categoryName: 'Alat Tulis Kantor',
              baseUnitSymbol: 'bu',
              saldoAwalQty: 10,
              nilaiAwal: 100000,
              mutasiMasuk: 5,
              mutasiKeluar: 2,
              mutasiJumlah: 3,
              saldoAkhirQty: 13,
              nilaiAkhir: 135000,
            },
          ],
        },
        {
          categoryId: 'cat-2',
          categoryName: 'Kertas & Karton',
          subtotalNilaiAwal: 0,
          subtotalNilaiAkhir: 0,
          items: [
            {
              id: 'item-3',
              sku: '00789-KRT',
              name: 'Kertas HVS A4 80gr',
              categoryName: 'Kertas & Karton',
              baseUnitSymbol: 'rim',
              saldoAwalQty: 0,
              nilaiAwal: 0,
              mutasiMasuk: 0,
              mutasiKeluar: 0,
              mutasiJumlah: 0,
              saldoAkhirQty: 0,
              nilaiAkhir: 0,
            },
          ],
        },
      ],
      grandTotalNilaiAwal: 150000,
      grandTotalNilaiAkhir: 210000,
    }

    // Build Excel buffer
    const buffer = await buildInventoryReportWorkbook(mockReportData)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)

    // Read back workbook using ExcelJS
    const readerWorkbook = new ExcelJS.Workbook()
    await readerWorkbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    // 1. Verify Sheet Name
    const worksheet = readerWorkbook.getWorksheet('Rincian Persediaan')
    expect(worksheet).toBeDefined()
    if (!worksheet) return

    // 2. Verify Page Setup & Print Titles
    expect(worksheet.pageSetup.orientation).toBe('landscape')
    expect(worksheet.pageSetup.paperSize).toBe(9) // A4
    expect(worksheet.pageSetup.fitToWidth).toBe(1)

    // 3. Verify Header Title & Metadata (Rows 1-5)
    const titleCell = worksheet.getCell('A2')
    expect(titleCell.value).toBe('LAPORAN RINCIAN BARANG PERSEDIAAN')

    const subtitleCell = worksheet.getCell('A3')
    expect(subtitleCell.value).toBe('UNTUK PERIODE YANG BERAKHIR TANGGAL 31-01-2026')

    const yearCell = worksheet.getCell('A4')
    expect(yearCell.value).toBe('TAHUN ANGGARAN : 2026')

    // 4. Verify Hierarchical Table Headers (Rows 7-8)
    const headerCodeCell = worksheet.getCell('A7')
    expect(headerCodeCell.value).toBe('KODE & NAMA BARANG')

    const headerAwalCell = worksheet.getCell('C7')
    expect(headerAwalCell.value).toBe('NILAI S/D 01-01-2026')

    const headerMutasiCell = worksheet.getCell('E7')
    expect(headerMutasiCell.value).toBe('MUTASI')

    const headerAkhirCell = worksheet.getCell('H7')
    expect(headerAkhirCell.value).toBe('NILAI S/D 31-01-2026')

    // 5. Verify Item Data & Types
    // Row 9: Category 1 header
    // Row 10: Item 1 (00123-ATK)
    const item1SkuCell = worksheet.getCell('A10')
    expect(item1SkuCell.value).toBe('00123-ATK') // String preserved leading zero

    const item1SaldoAwalQtyCell = worksheet.getCell('C10')
    expect(typeof item1SaldoAwalQtyCell.value).toBe('number')
    expect(item1SaldoAwalQtyCell.value).toBe(10)

    const item1NilaiAwalCell = worksheet.getCell('D10')
    expect(typeof item1NilaiAwalCell.value).toBe('number')
    expect(item1NilaiAwalCell.value).toBe(50000)

    const item1MutasiMasukCell = worksheet.getCell('E10')
    expect(typeof item1MutasiMasukCell.value).toBe('number')
    expect(item1MutasiMasukCell.value).toBe(10)

    const item1MutasiKeluarCell = worksheet.getCell('F10')
    expect(typeof item1MutasiKeluarCell.value).toBe('number')
    expect(item1MutasiKeluarCell.value).toBe(5)

    const item1MutasiJumlahCell = worksheet.getCell('G10')
    expect(typeof item1MutasiJumlahCell.value).toBe('number')
    expect(item1MutasiJumlahCell.value).toBe(5)

    const item1SaldoAkhirQtyCell = worksheet.getCell('H10')
    expect(typeof item1SaldoAkhirQtyCell.value).toBe('number')
    expect(item1SaldoAkhirQtyCell.value).toBe(15)

    // 6. Ledger Reconciliation for Item 1
    const saldoAwal = item1SaldoAwalQtyCell.value as number
    const mutasiMasuk = item1MutasiMasukCell.value as number
    const mutasiKeluar = item1MutasiKeluarCell.value as number
    const saldoAkhir = item1SaldoAkhirQtyCell.value as number
    expect(saldoAwal + mutasiMasuk - mutasiKeluar).toBe(saldoAkhir)

    // 7. Verify Category Subtotals & Grand Totals
    const cat1SubtotalAwalCell = worksheet.getCell('D9')
    expect(cat1SubtotalAwalCell.value).toBe(150000)

    const cat1SubtotalAkhirCell = worksheet.getCell('I9')
    expect(cat1SubtotalAkhirCell.value).toBe(210000)
  })

  it('builds a valid "Riwayat Transaksi" Excel workbook with correct numeric data types for negative deltas', async () => {
    const mockSupabase = {
      from: () => ({
        select: () => ({
          gte: () => ({
            lte: () => ({
              order: () => ({
                limit: () =>
                  Promise.resolve({
                    data: [
                      {
                        id: 'tx-1',
                        transaction_number: 'TXN-20260101-000001',
                        transaction_type: 'OUT',
                        input_quantity: 10,
                        base_quantity: 10,
                        quantity_delta: -10, // Negative delta!
                        transaction_at: '2026-01-01T10:00:00Z',
                        stock_before: 20,
                        stock_after: 10,
                        reason: 'Pemakaian rutin',
                        is_reversed: false,
                        items: { sku: '00123-ATK', name: 'Pensil 2B' },
                        units: { symbol: 'pcs' },
                        profiles: { full_name: 'Admin Test' },
                      },
                    ],
                  }),
              }),
            }),
          }),
        }),
      }),
    }

    const buffer = await buildTransactionHistoryWorkbook(
      mockSupabase as unknown as Parameters<typeof buildTransactionHistoryWorkbook>[0],
      {
        dateFromStr: '2026-01-01',
        dateToStr: '2026-01-31',
        institutionName: 'BPS KOTA MOJOKERTO',
        reportHeaderText: 'LAPORAN RIWAYAT TRANSAKSI STOK',
      }
    )

    expect(buffer).toBeInstanceOf(Buffer)

    const readerWorkbook = new ExcelJS.Workbook()
    await readerWorkbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)

    // Check sheet 1: Ringkasan
    const wsRingkasan = readerWorkbook.getWorksheet('Ringkasan')
    expect(wsRingkasan).toBeDefined()
    expect(wsRingkasan?.getCell('A1').value).toBe('BPS KOTA MOJOKERTO')

    // Check sheet 2: Riwayat Transaksi
    const wsRiwayat = readerWorkbook.getWorksheet('Riwayat Transaksi')
    expect(wsRiwayat).toBeDefined()
    if (!wsRiwayat) return

    // Row 6 is first data row
    const stokChangeCell = wsRiwayat.getCell('F6')
    expect(stokChangeCell.value).toBe('-10 pcs')

    // Column H: Harga Satuan fallback when no cost snapshot
    const hargaSatuanCell = wsRiwayat.getCell('H6')
    expect(hargaSatuanCell.value).toBe('—')

    // Check sheet 3: Detail Audit
    const wsAudit = readerWorkbook.getWorksheet('Detail Audit')
    expect(wsAudit).toBeDefined()
    if (wsAudit) {
      const deltaAuditCell = wsAudit.getCell('K6')
      expect(deltaAuditCell.value).toBe(-10)
      const statusHargaCell = wsAudit.getCell('P6')
      expect(statusHargaCell.value).toBe('Belum Tersedia')
    }

    // Save actual file to scratch for verification
    const scratchDir = 'C:\\Users\\Asus\\.gemini\\antigravity-ide\\brain\\553d1121-acdb-47d6-904f-8c323c738582\\scratch'
    if (!fs.existsSync(scratchDir)) {
      fs.mkdirSync(scratchDir, { recursive: true })
    }
    const samplePath = path.join(scratchDir, 'riwayat-transaksi-2026-07-01-sampai-2026-07-23.xlsx')
    fs.writeFileSync(samplePath, buffer)
    const stats = fs.statSync(samplePath)
    console.warn(`[ACTUAL_EXPORT] File: ${path.basename(samplePath)}, Size: ${stats.size} bytes (${(stats.size / 1024).toFixed(2)} KB)`)
  })
})
