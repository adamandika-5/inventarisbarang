import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const { mockWriteBuffer, mockAddWorksheet, mockWorkbookConstructor } = vi.hoisted(() => {
  const mockWriteBuffer = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
  const mockAddWorksheet = vi.fn().mockReturnValue({
    pageSetup: {},
    columns: [],
    getRow: vi.fn().mockReturnValue({
      height: 0,
      getCell: vi.fn().mockReturnValue({ font: {}, alignment: {}, border: {}, fill: {} }),
    }),
    mergeCells: vi.fn(),
    autoFilter: '',
  })
  const mockWorkbookConstructor = vi.fn().mockImplementation(() => ({
    creator: '',
    created: new Date(),
    addWorksheet: mockAddWorksheet,
    xlsx: {
      writeBuffer: mockWriteBuffer,
    },
  }))
  return { mockWriteBuffer, mockAddWorksheet, mockWorkbookConstructor }
})

vi.mock('exceljs', () => {
  return {
    default: {
      Workbook: mockWorkbookConstructor,
    },
  }
})

import { compileInventoryReportData } from '@/lib/reports/inventory-summary-excel'

describe('Inventory Report Render Guard on Compilation Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('proves workbook constructor, addWorksheet, and writeBuffer are NEVER called when compilation fails on categories batch 2', async () => {
    const makeMockCategory = (idx: number) => ({
      id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
      name: `Category ${idx}`,
    })

    const batch1Cat = Array.from({ length: 1000 }, (_, i) => makeMockCategory(i + 1))
    let catCallCount = 0

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'categories') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              catCallCount++
              if (catCallCount === 1) return Promise.resolve({ data: batch1Cat, error: null })
              return Promise.resolve({ data: null, error: { message: 'Fatal DB connection drop on categories batch 2' } })
            }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data kategori ekspor: Fatal DB connection drop on categories batch 2')

    expect(catCallCount).toBe(2)

    // Absolute proof: Workbook constructor, addWorksheet, and writeBuffer were NEVER invoked!
    expect(mockWorkbookConstructor).not.toHaveBeenCalled()
    expect(mockAddWorksheet).not.toHaveBeenCalled()
    expect(mockWriteBuffer).not.toHaveBeenCalled()
  })

  it('proves workbook constructor, addWorksheet, and writeBuffer are NEVER called when compilation fails on items batch 2', async () => {
    const makeMockItem = (idx: number) => ({
      id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
      sku: `SKU-${idx}`,
      name: `Item ${idx}`,
      current_stock: 10,
      is_active: true,
      category_id: null,
      base_unit_id: null,
    })

    const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockItem(i + 1))
    let itemCallCount = 0

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'categories') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              itemCallCount++
              if (itemCallCount === 1) return Promise.resolve({ data: batch1, error: null })
              return Promise.resolve({ data: null, error: { message: 'Fatal DB connection drop on items batch 2' } })
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data barang ekspor: Fatal DB connection drop on items batch 2')

    expect(itemCallCount).toBe(2)

    // Absolute proof: Workbook constructor, addWorksheet, and writeBuffer were NEVER invoked!
    expect(mockWorkbookConstructor).not.toHaveBeenCalled()
    expect(mockAddWorksheet).not.toHaveBeenCalled()
    expect(mockWriteBuffer).not.toHaveBeenCalled()
  })

  it('proves workbook constructor, addWorksheet, and writeBuffer are NEVER called when compilation fails on transaction batch 2', async () => {
    const makeMockTx = (idx: number) => ({
      id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
      item_id: '123e4567-e89b-12d3-a456-426614174000',
      transaction_type: 'IN',
      input_quantity: 1,
      base_quantity: 1,
      quantity_delta: 1,
      transaction_at: '2026-07-15T10:00:00Z',
      stock_before: 0,
      stock_after: 1,
      is_reversed: false,
    })

    const batch1Tx = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
    let txCallCount = 0

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }
        }
        if (table === 'categories') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
          }
        }
        if (table === 'stock_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              txCallCount++
              if (txCallCount === 1) return Promise.resolve({ data: batch1Tx, error: null })
              return Promise.resolve({ data: null, error: { message: 'Fatal DB connection drop on transaction batch 2' } })
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data persediaan ekspor: Fatal DB connection drop on transaction batch 2')

    expect(txCallCount).toBe(2)

    // Absolute proof: Workbook constructor, addWorksheet, and writeBuffer were NEVER invoked!
    expect(mockWorkbookConstructor).not.toHaveBeenCalled()
    expect(mockAddWorksheet).not.toHaveBeenCalled()
    expect(mockWriteBuffer).not.toHaveBeenCalled()
  })
})
