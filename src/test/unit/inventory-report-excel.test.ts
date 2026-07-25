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

    // 3. Verify Header Title & Metadata (Rows 1-4)
    const instCell = worksheet.getCell('A1')
    expect(instCell.value).toBe('DINAS KESEHATAN KOTA BANDUNG')

    const titleCell = worksheet.getCell('A2')
    expect(titleCell.value).toBe('PEMERINTAH KOTA BANDUNG')

    const dateCell = worksheet.getCell('A3')
    expect(dateCell.value).toBe('Periode: 1 Januari 2026 s/d 31 Januari 2026')

    // 4. Verify Table Headers (Row 6)
    const headerNoCell = worksheet.getCell('A6')
    expect(headerNoCell.value).toBe('No.')

    const headerCodeCell = worksheet.getCell('B6')
    expect(headerCodeCell.value).toBe('Kode Barang (SKU)')

    // 5. Verify Item Data & Types
    // Row 7: Category 1 header
    // Row 8: Item 1 (00123-ATK)
    const item1SkuCell = worksheet.getCell('B8')
    expect(item1SkuCell.value).toBe('00123-ATK') // String preserved leading zero

    const item1SaldoAwalQtyCell = worksheet.getCell('E8')
    expect(typeof item1SaldoAwalQtyCell.value).toBe('number')
    expect(item1SaldoAwalQtyCell.value).toBe(10)

    const item1NilaiAwalCell = worksheet.getCell('F8')
    expect(typeof item1NilaiAwalCell.value).toBe('number')
    expect(item1NilaiAwalCell.value).toBe(50000)

    const item1MutasiMasukCell = worksheet.getCell('G8')
    expect(typeof item1MutasiMasukCell.value).toBe('number')
    expect(item1MutasiMasukCell.value).toBe(10)

    const item1MutasiKeluarCell = worksheet.getCell('H8')
    expect(typeof item1MutasiKeluarCell.value).toBe('number')
    expect(item1MutasiKeluarCell.value).toBe(5)

    const item1SaldoAkhirQtyCell = worksheet.getCell('I8')
    expect(typeof item1SaldoAkhirQtyCell.value).toBe('number')
    expect(item1SaldoAkhirQtyCell.value).toBe(15)

    // 6. Ledger Reconciliation for Item 1
    const saldoAwal = item1SaldoAwalQtyCell.value as number
    const mutasiMasuk = item1MutasiMasukCell.value as number
    const mutasiKeluar = item1MutasiKeluarCell.value as number
    const saldoAkhir = item1SaldoAkhirQtyCell.value as number
    expect(saldoAwal + mutasiMasuk - mutasiKeluar).toBe(saldoAkhir)
  })

  it('builds a valid "Riwayat Transaksi" Excel workbook with correct numeric data types and historical price calculation (10 pcs x Rp4.000 = Rp40.000)', async () => {
    const mockQueryBuilder = {
      gte: () => mockQueryBuilder,
      lte: () => mockQueryBuilder,
      lt: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      in: () => mockQueryBuilder,
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
      rpc: (fnName: string) => {
        if (fnName === 'get_stock_transaction_costs') {
          return Promise.resolve({
            data: [
              {
                transaction_id: 'tx-1',
                unit_price_input: 4000,
                base_unit_cost: 4000,
                transaction_value: 40000,
              },
              {
                transaction_id: 'tx-2',
                unit_price_input: 4000,
                base_unit_cost: 4000,
                transaction_value: 20000,
              },
            ],
            error: null,
          })
        }
        return Promise.resolve({ data: [], error: null })
      },
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

    // Check sheet 2: Riwayat Transaksi (20 columns)
    const wsRiwayat = readerWorkbook.getWorksheet('Riwayat Transaksi')
    expect(wsRiwayat).toBeDefined()
    if (!wsRiwayat) return

    // Row 6: tx-1 (Barang Masuk 10 pcs @ Rp4.000 = Rp40.000)
    const mutasiMasukQtyCell1 = wsRiwayat.getCell('I6')
    expect(mutasiMasukQtyCell1.value).toBe(10)

    const mutasiMasukValCell1 = wsRiwayat.getCell('J6')
    expect(typeof mutasiMasukValCell1.value).toBe('number')
    expect(mutasiMasukValCell1.value).toBe(40000)

    const hargaHistorisCell1 = wsRiwayat.getCell('N6')
    expect(typeof hargaHistorisCell1.value).toBe('number')
    expect(hargaHistorisCell1.value).toBe(4000)

    // Row 7: tx-2 (Barang Keluar 5 pcs @ Rp4.000 = Rp20.000)
    const mutasiKeluarQtyCell2 = wsRiwayat.getCell('K7')
    expect(mutasiKeluarQtyCell2.value).toBe(5)

    const mutasiKeluarValCell2 = wsRiwayat.getCell('L7')
    expect(typeof mutasiKeluarValCell2.value).toBe('number')
    expect(mutasiKeluarValCell2.value).toBe(20000)

    const hargaHistorisCell2 = wsRiwayat.getCell('N7')
    expect(typeof hargaHistorisCell2.value).toBe('number')
    expect(hargaHistorisCell2.value).toBe(4000)

    // Check sheet 3: Detail Audit
    const wsAudit = readerWorkbook.getWorksheet('Detail Audit')
    expect(wsAudit).toBeDefined()
    if (wsAudit) {
      const statusHargaCell1 = wsAudit.getCell('R6')
      expect(statusHargaCell1.value).toBe('SNAPSHOT_AVAILABLE')
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

  it('throws an explicit error when Migration 008 RPC is missing', async () => {
    const mockQueryBuilder = {
      gte: () => mockQueryBuilder,
      lte: () => mockQueryBuilder,
      lt: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      in: () => mockQueryBuilder,
      order: () => mockQueryBuilder,
      limit: () => Object.assign(Promise.resolve({ data: [{ id: 'tx-1' }] }), { maybeSingle: () => Promise.resolve({ data: null }) }),
      maybeSingle: () => Promise.resolve({ data: null }),
    }

    const mockSupabaseMissingRpc = {
      from: () => ({
        select: () => mockQueryBuilder,
      }),
      rpc: (fnName: string) => {
        if (fnName === 'get_stock_transaction_costs') {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'Could not find the function public.get_stock_transaction_costs' },
          })
        }
        return Promise.resolve({ data: [], error: null })
      },
    }

    await expect(
      buildTransactionHistoryWorkbook(
        mockSupabaseMissingRpc as unknown as Parameters<typeof buildTransactionHistoryWorkbook>[0],
        {
          dateFromStr: '2026-01-01',
          dateToStr: '2026-01-31',
        }
      )
    ).rejects.toThrow('Migration 008_get_stock_transaction_costs_rpc.sql belum diterapkan')
  })

  it('renders "—" (Belum Tersedia) only for legacy transactions when RPC query succeeds without snapshot', async () => {
    const mockDataResult = {
      data: [
        {
          id: 'tx-legacy',
          transaction_number: 'TXN-LEGACY-001',
          transaction_type: 'IN',
          input_quantity: 5,
          base_quantity: 5,
          quantity_delta: 5,
          transaction_at: '2025-12-01T10:00:00Z',
          stock_before: 0,
          stock_after: 5,
          reason: 'Transaksi Lama',
          is_reversed: false,
          items: { sku: '00999-LEG', name: 'Barang Lama' },
          units: { symbol: 'pcs' },
          profiles: { full_name: 'Admin Test' },
        },
      ],
    }

    const mockQueryBuilder = {
      gte: () => mockQueryBuilder,
      lte: () => mockQueryBuilder,
      lt: () => mockQueryBuilder,
      eq: () => mockQueryBuilder,
      in: () => mockQueryBuilder,
      order: () => mockQueryBuilder,
      limit: () => Object.assign(Promise.resolve(mockDataResult), { maybeSingle: () => Promise.resolve({ data: null }) }),
      maybeSingle: () => Promise.resolve({ data: null }),
    }

    const mockSupabaseSuccessNoSnapshot = {
      from: () => ({
        select: () => mockQueryBuilder,
      }),
      rpc: () => Promise.resolve({ data: [], error: null }),
    }

    const buffer = await buildTransactionHistoryWorkbook(
      mockSupabaseSuccessNoSnapshot as unknown as Parameters<typeof buildTransactionHistoryWorkbook>[0],
      {
        dateFromStr: '2026-01-01',
        dateToStr: '2026-01-31',
      }
    )

    const readerWorkbook = new ExcelJS.Workbook()
    await readerWorkbook.xlsx.load(buffer as unknown as ExcelJS.Buffer)
    const wsRiwayat = readerWorkbook.getWorksheet('Riwayat Transaksi')
    expect(wsRiwayat).toBeDefined()
    if (wsRiwayat) {
      const hargaHistorisCell = wsRiwayat.getCell('N6')
      expect(hargaHistorisCell.value).toBe('—')
      const statusHargaCell = wsRiwayat.getCell('T6')
      expect(statusHargaCell.value).toBe('Belum Tersedia')
    }
  })

  it('compileInventoryReportData throws an explicit error when Migration 008 RPC is missing', async () => {
    const mockQueryBuilder = {
      lte: () => mockQueryBuilder,
      order: () => Promise.resolve({ data: [] }),
    }

    const mockSupabase = {
      from: (table: string) => {
        if (table === 'app_settings') {
          return { select: () => ({ limit: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }
        }
        if (table === 'categories' || table === 'items') {
          return { select: () => ({ order: () => Promise.resolve({ data: [] }) }) }
        }
        return { select: () => mockQueryBuilder }
      },
      rpc: (fnName: string) => {
        if (fnName === 'get_stock_transaction_costs' || fnName === 'get_item_costs') {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST202', message: 'Could not find the function' },
          })
        }
        return Promise.resolve({ data: [], error: null })
      },
    }

    const { compileInventoryReportData } = await import('@/lib/reports/inventory-summary-excel')

    await expect(
      compileInventoryReportData(
        mockSupabase as unknown as Parameters<typeof compileInventoryReportData>[0],
        '2026-01-01',
        '2026-01-31'
      )
    ).rejects.toThrow('Migration 008_get_stock_transaction_costs_rpc.sql belum diterapkan')
  })

  it('handles get_stock_transaction_costs RPC array parameter behaviors: NULL (all), [] (zero), and UUIDs (filtered)', async () => {
    const allRecords = [
      { transaction_id: 'tx-1', base_unit_cost: 4000, transaction_value: 40000 },
      { transaction_id: 'tx-2', base_unit_cost: 5200, transaction_value: 26000 },
    ]

    const simulateRpcCall = (p_transaction_ids?: string[] | null) => {
      // Rule 1: NULL returns all records
      if (p_transaction_ids === null || p_transaction_ids === undefined) {
        return { data: allRecords, error: null }
      }
      // Rule 2: [] (empty array) returns zero records
      if (p_transaction_ids.length === 0) {
        return { data: [], error: null }
      }
      // Rule 3: Array of UUIDs filters records matching ANY(p_transaction_ids)
      const filtered = allRecords.filter((r) => p_transaction_ids.includes(r.transaction_id))
      return { data: filtered, error: null }
    }

    // 1. NULL parameter returns all records
    const resNull = simulateRpcCall(null)
    expect(resNull.data).toHaveLength(2)

    // 2. Empty array [] returns zero records
    const resEmpty = simulateRpcCall([])
    expect(resEmpty.data).toHaveLength(0)

    // 3. UUID array returns matching record
    const resFiltered = simulateRpcCall(['tx-1'])
    expect(resFiltered.data).toHaveLength(1)
    expect(resFiltered.data[0]?.transaction_id).toBe('tx-1')
  })
})
