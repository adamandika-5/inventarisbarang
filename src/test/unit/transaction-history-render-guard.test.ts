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

import {
  loadTransactionHistoryRows,
  buildTransactionHistoryWorkbook,
} from '@/lib/reports/transaction-history-excel'

describe('Transaction History Render Guard on Batch Failure', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('proves workbook constructor, addWorksheet, and writeBuffer are NEVER called when batch 2 fails', async () => {
    const makeMockTx = (idx: number) => ({
      id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
      transaction_number: `TXN-${idx}`,
      transaction_type: 'IN',
      input_quantity: 1,
      base_quantity: 1,
      quantity_delta: 1,
      transaction_at: '2026-07-15T10:00:00Z',
      stock_before: 0,
      stock_after: 1,
      reason: 'Batch Failure Guard Test',
      is_reversed: false,
      items: { sku: 'SKU-001', name: 'Item Test' },
      units: { symbol: 'pcs' },
      profiles: { full_name: 'Admin Test' },
    })

    const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
    expect(batch1.length).toBe(1000)

    let loaderCallCount = 0
    const mockSupabaseLoader = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }
        if (table === 'stock_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              loaderCallCount++
              if (loaderCallCount === 1) return Promise.resolve({ data: batch1, error: null })
              return Promise.resolve({ data: null, error: { message: 'Fatal DB network drop in batch 2' } })
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    // 1. Direct loader test
    await expect(
      loadTransactionHistoryRows(mockSupabaseLoader, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
      }),
    ).rejects.toThrow('Gagal mengambil data transaksi ekspor: Fatal DB network drop in batch 2')

    expect(loaderCallCount).toBe(2)

    // 2. Public generator test
    let generatorCallCount = 0
    const mockSupabaseGenerator = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null }),
          }
        }
        if (table === 'stock_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              generatorCallCount++
              if (generatorCallCount === 1) return Promise.resolve({ data: batch1, error: null })
              return Promise.resolve({ data: null, error: { message: 'Fatal DB network drop in batch 2' } })
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      buildTransactionHistoryWorkbook(mockSupabaseGenerator, {
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-31',
      }),
    ).rejects.toThrow('Gagal mengambil data transaksi ekspor: Fatal DB network drop in batch 2')

    expect(generatorCallCount).toBe(2)

    // 3. Absolute proof: Workbook constructor, addWorksheet, and writeBuffer were NEVER invoked!
    expect(mockWorkbookConstructor).not.toHaveBeenCalled()
    expect(mockAddWorksheet).not.toHaveBeenCalled()
    expect(mockWriteBuffer).not.toHaveBeenCalled()
  })
})
