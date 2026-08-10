import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  normalizeReportFilters,
  normalizePageNumber,
  normalizeItemUuid,
  isValidCalendarDate,
  parseReportSummary,
  MAX_SAFE_PAGE,
} from '@/lib/reports/report-filters'
import { buildTransactionHistoryWorkbook } from '@/lib/reports/transaction-history-excel'
import { compileInventoryReportData } from '@/lib/reports/inventory-summary-excel'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

describe('Admin Reports Comprehensive Keyset Batching, Security & Normalization Test Suite', () => {
  describe('Calendar Date & Filter Normalization', () => {
    beforeEach(() => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('validates real calendar dates and rejects invalid dates like 2026-02-31 or 2026-13-01', () => {
      expect(isValidCalendarDate('2026-02-28')).toBe(true)
      expect(isValidCalendarDate('2026-02-31')).toBe(false)
      expect(isValidCalendarDate('2026-04-31')).toBe(false)
      expect(isValidCalendarDate('2026-02-29')).toBe(false)
      expect(isValidCalendarDate('2024-02-29')).toBe(true)
      expect(isValidCalendarDate('2026-13-01')).toBe(false)
      expect(isValidCalendarDate('2026-00-10')).toBe(false)
      expect(isValidCalendarDate('invalid')).toBe(false)
      expect(isValidCalendarDate('')).toBe(false)
      expect(isValidCalendarDate(null)).toBe(false)
    })

    it('produces exact safeFrom, safeTo, startUtcIso, and endUtcIso values for default empty parameters with frozen timer', () => {
      const res = normalizeReportFilters({})
      expect(res.safeFrom).toBe('2026-07-02')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-02T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
      expect(res.isInvalidDateRange).toBe(false)
    })

    it('produces exact safeFrom, safeTo, startUtcIso, and endUtcIso for valid date range', () => {
      const res = normalizeReportFilters({
        from: '2026-07-01',
        to: '2026-07-31',
        type: 'IN',
        item: '123e4567-e89b-12d3-a456-426614174000',
        page: '2',
      })

      expect(res.safeFrom).toBe('2026-07-01')
      expect(res.safeTo).toBe('2026-07-31')
      expect(res.startUtcIso).toBe('2026-07-01T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-01T00:00:00+07:00')
      expect(res.typeFilter).toBe('IN')
      expect(res.itemFilter).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(res.page).toBe(2)
      expect(res.isInvalidDateRange).toBe(false)
    })

    it('handles reversed date range (from > to) with exact 30-day fallback bounds and flags isInvalidDateRange', () => {
      const res = normalizeReportFilters({
        from: '2026-08-15',
        to: '2026-07-01',
      })

      expect(res.isInvalidDateRange).toBe(true)
      expect(res.safeFrom).toBe('2026-07-02')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-02T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
    })

    it('handles valid from date with invalid to date with exact bounds', () => {
      const res = normalizeReportFilters({ from: '2026-07-15', to: 'invalid-date' })
      expect(res.isInvalidDateRange).toBe(false)
      expect(res.safeFrom).toBe('2026-07-15')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-15T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
    })

    it('handles invalid from date with valid to date with exact bounds', () => {
      const res = normalizeReportFilters({ from: 'invalid-date', to: '2026-07-20' })
      expect(res.isInvalidDateRange).toBe(false)
      expect(res.safeFrom).toBe('2026-07-02')
      expect(res.safeTo).toBe('2026-07-20')
      expect(res.startUtcIso).toBe('2026-07-02T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-07-21T00:00:00+07:00')
    })

    it('handles both unreal calendar dates with exact fallback bounds', () => {
      const res = normalizeReportFilters({ from: '2026-02-31', to: '2026-04-31' })
      expect(res.isInvalidDateRange).toBe(false)
      expect(res.safeFrom).toBe('2026-07-02')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-02T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
    })

    it('handles safe combination of one invalid date with exact bounds', () => {
      const res = normalizeReportFilters({ from: '2026-07-10', to: 'invalid' })
      expect(res.isInvalidDateRange).toBe(false)
      expect(res.safeFrom).toBe('2026-07-10')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-10T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
    })

    it('handles combination of one invalid date that would invert with exact fallback bounds', () => {
      const res = normalizeReportFilters({ from: '2026-08-15', to: 'invalid' })
      expect(res.isInvalidDateRange).toBe(false)
      expect(res.safeFrom).toBe('2026-07-02')
      expect(res.safeTo).toBe('2026-08-01')
      expect(res.startUtcIso).toBe('2026-07-02T00:00:00+07:00')
      expect(res.endUtcIso).toBe('2026-08-02T00:00:00+07:00')
    })

    it('normalizes invalid item UUID to empty string', () => {
      expect(normalizeItemUuid('123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000')
      expect(normalizeItemUuid('invalid-item-id')).toBe('')
      expect(normalizeItemUuid('SELECT * FROM items')).toBe('')
      expect(normalizeItemUuid(null)).toBe('')
    })

    it('normalizes page number safely, defaulting to 1 for invalid or out-of-bounds values', () => {
      expect(normalizePageNumber('1')).toBe(1)
      expect(normalizePageNumber('5')).toBe(5)
      expect(normalizePageNumber('abc')).toBe(1)
      expect(normalizePageNumber('-10')).toBe(1)
      expect(normalizePageNumber('3.14')).toBe(1)
      expect(normalizePageNumber(Infinity)).toBe(1)
      expect(normalizePageNumber(MAX_SAFE_PAGE + 100)).toBe(1)
      expect(normalizePageNumber(null)).toBe(1)
      expect(normalizePageNumber(undefined)).toBe(1)
    })

    it('normalizes transaction type to ALL if invalid type passed', () => {
      const res = normalizeReportFilters({ type: 'DROP TABLE;' })
      expect(res.typeFilter).toBe('ALL')
    })
  })

  describe('RPC Summary Parser Strict Metric Validation (No Coercion)', () => {
    const validBaseData = {
      total_in: 10,
      total_out: 20,
      total_adjustment_in: 5,
      total_adjustment_out: 2,
      total_reversal: 1,
      total_transactions: 38,
      low_stock_count: 3,
    }

    const rpcFields = [
      'total_in',
      'total_out',
      'total_adjustment_in',
      'total_adjustment_out',
      'total_reversal',
      'total_transactions',
      'low_stock_count',
    ] as const

    const badValues = [
      { name: 'null', value: null },
      { name: 'undefined', value: undefined },
      { name: 'NaN', value: NaN },
      { name: 'Infinity', value: Infinity },
      { name: 'negative number', value: -1 },
      { name: 'random string', value: 'random_text' },
      { name: 'numeric string "10"', value: '10' },
      { name: 'empty string ""', value: '' },
      { name: 'space string "   "', value: '   ' },
      { name: 'boolean true', value: true },
      { name: 'boolean false', value: false },
    ]

    for (const field of rpcFields) {
      for (const bad of badValues) {
        it(`rejects bad value [${bad.name}] on RPC field [${field}]`, () => {
          const testData = { ...validBaseData, [field]: bad.value }
          const parsed = parseReportSummary(testData, false)
          expect(parsed.hasError).toBe(true)
        })
      }

      it(`rejects missing field [${field}] when omitted from object`, () => {
        const testData = { ...validBaseData }
        delete (testData as Record<string, unknown>)[field]
        const parsed = parseReportSummary(testData, false)
        expect(parsed.hasError).toBe(true)
      })
    }

    it('rejects empty object', () => {
      expect(parseReportSummary({}, false).hasError).toBe(true)
    })

    it('rejects null data', () => {
      expect(parseReportSummary(null, false).hasError).toBe(true)
    })

    it('rejects undefined data', () => {
      expect(parseReportSummary(undefined, false).hasError).toBe(true)
    })

    it('rejects when rpcError flag is true', () => {
      expect(parseReportSummary(validBaseData, true).hasError).toBe(true)
    })

    it('accepts valid object with all fields equal to zero (0)', () => {
      const zeroData = {
        total_in: 0,
        total_out: 0,
        total_adjustment_in: 0,
        total_adjustment_out: 0,
        total_reversal: 0,
        total_transactions: 0,
        low_stock_count: 0,
      }
      const parsed = parseReportSummary(zeroData, false)
      expect(parsed.hasError).toBe(false)
      expect(parsed.totalIn).toBe(0)
      expect(parsed.totalOut).toBe(0)
      expect(parsed.totalAdjustmentIn).toBe(0)
      expect(parsed.totalAdjustmentOut).toBe(0)
      expect(parsed.totalReversal).toBe(0)
      expect(parsed.totalTransactions).toBe(0)
      expect(parsed.lowStockCount).toBe(0)
    })
  })

  describe('Transaction History Keyset Cursor Multi-Batch Verification (Exact 1,500 Unique IDs)', () => {
    it('fetches exactly 1,500 unique IDs across 2 batches (1000 + 500) verifying cursor tuple and exact item positions', async () => {
      // Shared timestamp for boundary items to test same-timestamp cursor tuple resolution
      const boundaryTimestamp = '2026-07-15T12:00:00.000Z'

      const makeMockTx = (idx: number) => ({
        id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
        transaction_number: `TXN-${String(idx).padStart(6, '0')}`,
        transaction_type: 'IN',
        input_quantity: 1,
        base_quantity: 1,
        quantity_delta: 1,
        // Give items 999, 1000, 1001 the EXACT SAME timestamp to verify cursor tuple (transaction_at, id)
        transaction_at: idx >= 999 && idx <= 1001 ? boundaryTimestamp : new Date(1784000000000 - idx * 1000).toISOString(),
        stock_before: 0,
        stock_after: 1,
        reason: 'Keyset Verification Test',
        is_reversed: false,
        items: { sku: `SKU-${idx}`, name: `Item ${idx}` },
        units: { symbol: 'pcs' },
        profiles: { full_name: 'Admin Test' },
      })

      const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
      const batch2 = Array.from({ length: 500 }, (_, i) => makeMockTx(i + 1001))

      const expectedCursorTxAt = batch1[999]!.transaction_at
      const expectedCursorId = batch1[999]!.id

      let callCount = 0
      const capturedCursors: string[] = []

      const mockSupabase = {
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
              or: vi.fn().mockImplementation((filterStr: string) => {
                capturedCursors.push(filterStr)
                return mockSupabase.from('stock_transactions')
              }),
              limit: vi.fn().mockImplementation((limitVal: number) => {
                callCount++
                expect(limitVal).toBe(1000) // Ensures .limit(1000) is used, NOT .range()

                if (callCount === 1) {
                  return Promise.resolve({ data: batch1, error: null })
                }
                if (callCount === 2) {
                  // Verify that batch 2 was queried with the EXACT cursor from batch 1's last item
                  const expectedFilter = `transaction_at.lt.${expectedCursorTxAt},and(transaction_at.eq.${expectedCursorTxAt},id.lt.${expectedCursorId})`
                  expect(capturedCursors[0]).toBe(expectedFilter)
                  return Promise.resolve({ data: batch2, error: null })
                }
                return Promise.resolve({ data: [], error: null })
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const buffer = await buildTransactionHistoryWorkbook(mockSupabase, {
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-31',
      })

      expect(buffer).toBeInstanceOf(Buffer)
      expect(buffer.length).toBeGreaterThan(1000)
      expect(callCount).toBe(2)

      // Verify exact 1,500 transactions were processed without loss or duplication
      const allTxIds = [...batch1.map((t) => t.id), ...batch2.map((t) => t.id)]
      const uniqueIds = new Set(allTxIds)
      expect(uniqueIds.size).toBe(1500)
      expect(allTxIds[0]).toBe('123e4567-e89b-12d3-a456-000000000001')
      expect(allTxIds[998]).toBe('123e4567-e89b-12d3-a456-000000000999')
      expect(allTxIds[999]).toBe('123e4567-e89b-12d3-a456-000000001000')
      expect(allTxIds[1000]).toBe('123e4567-e89b-12d3-a456-000000001001')
      expect(allTxIds[1499]).toBe('123e4567-e89b-12d3-a456-000000001500')
    }, 30000)

    it('rejects and aborts workbook generation immediately if second batch fails', async () => {
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
        reason: 'Batch Failure Test',
        is_reversed: false,
        items: { sku: 'SKU-001', name: 'Item Test' },
        units: { symbol: 'pcs' },
        profiles: { full_name: 'Admin Test' },
      })

      const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
      let callCount = 0

      const mockSupabase = {
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
                callCount++
                if (callCount === 1) return Promise.resolve({ data: batch1, error: null })
                return Promise.resolve({ data: null, error: { message: 'Database failure in batch 2' } })
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      await expect(
        buildTransactionHistoryWorkbook(mockSupabase, {
          dateFromStr: '2026-07-01',
          dateToStr: '2026-07-31',
        }),
      ).rejects.toThrow('Gagal mengambil data transaksi ekspor: Database failure in batch 2')

      expect(callCount).toBe(2)
    })
  })

  describe('Inventory Summary Keyset Cursor Multi-Batch Verification (1,500 Items Compiled)', () => {
    it('compiles inventory report data across 2 batches (1000 + 500) using keyset cursor pagination with verified cursor tuple', async () => {
      const boundaryTimestamp = '2026-07-15T12:00:00.000Z'

      const makeMockTx = (idx: number) => ({
        id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
        item_id: 'item-001',
        transaction_type: 'IN',
        input_quantity: 1,
        base_quantity: 1,
        quantity_delta: 1,
        stock_before: 0,
        stock_after: idx,
        transaction_at: idx >= 999 && idx <= 1001 ? boundaryTimestamp : new Date(1784000000000 + idx * 1000).toISOString(),
        is_reversed: false,
      })

      const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
      const batch2 = Array.from({ length: 500 }, (_, i) => makeMockTx(i + 1001))

      const expectedCursorTxAt = batch1[999]!.transaction_at
      const expectedCursorId = batch1[999]!.id

      let callCount = 0
      const capturedCursors: string[] = []

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }
          }
          if (table === 'categories') {
            return {
              select: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [{ id: 'cat-1', name: 'ATK' }], error: null }),
              }),
            }
          }
          if (table === 'items') {
            return {
              select: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'item-001',
                      sku: 'SKU-001',
                      name: 'Kertas A4',
                      current_stock: 1500,
                      is_active: true,
                      category_id: 'cat-1',
                      base_unit_id: 'unit-1',
                      base_unit: { symbol: 'rim' },
                      categories: { name: 'ATK' },
                    },
                  ],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'stock_transactions') {
            return {
              select: vi.fn().mockReturnThis(),
              lt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              or: vi.fn().mockImplementation((filterStr: string) => {
                capturedCursors.push(filterStr)
                return mockSupabase.from('stock_transactions')
              }),
              limit: vi.fn().mockImplementation((limitVal: number) => {
                callCount++
                expect(limitVal).toBe(1000)

                if (callCount === 1) {
                  return Promise.resolve({ data: batch1, error: null })
                }
                if (callCount === 2) {
                  const expectedFilter = `transaction_at.gt.${expectedCursorTxAt},and(transaction_at.eq.${expectedCursorTxAt},id.gt.${expectedCursorId})`
                  expect(capturedCursors[0]).toBe(expectedFilter)
                  return Promise.resolve({ data: batch2, error: null })
                }
                return Promise.resolve({ data: [], error: null })
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      const data = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')

      expect(data).toBeDefined()
      expect(callCount).toBe(2)
      expect(data.categories.length).toBeGreaterThan(0)
      expect(data.categories[0]?.items[0]?.mutasiMasuk).toBe(1500)
    })

    it('rejects and aborts inventory summary compilation if second batch fails', async () => {
      const makeMockTx = (idx: number) => ({
        id: `123e4567-e89b-12d3-a456-${String(idx).padStart(12, '0')}`,
        item_id: 'item-001',
        transaction_type: 'IN',
        input_quantity: 1,
        base_quantity: 1,
        quantity_delta: 1,
        stock_before: 0,
        stock_after: idx,
        transaction_at: '2026-07-15T10:00:00Z',
        is_reversed: false,
      })

      const batch1 = Array.from({ length: 1000 }, (_, i) => makeMockTx(i + 1))
      let callCount = 0

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null }),
            }
          }
          if (table === 'categories') {
            return {
              select: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [{ id: 'cat-1', name: 'ATK' }], error: null }),
              }),
            }
          }
          if (table === 'items') {
            return {
              select: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'item-001',
                      sku: 'SKU-001',
                      name: 'Kertas A4',
                      current_stock: 1500,
                      is_active: true,
                      category_id: 'cat-1',
                      base_unit_id: 'unit-1',
                      base_unit: { symbol: 'rim' },
                      categories: { name: 'ATK' },
                    },
                  ],
                  error: null,
                }),
              }),
            }
          }
          if (table === 'stock_transactions') {
            return {
              select: vi.fn().mockReturnThis(),
              lt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              or: vi.fn().mockReturnThis(),
              limit: vi.fn().mockImplementation(() => {
                callCount++
                if (callCount === 1) return Promise.resolve({ data: batch1, error: null })
                return Promise.resolve({ data: null, error: { message: 'Database failure in inventory summary batch 2' } })
              }),
            }
          }
          return {}
        }),
      } as unknown as SupabaseClient<Database>

      await expect(compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')).rejects.toThrow(
        'Gagal mengambil data persediaan ekspor: Database failure in inventory summary batch 2',
      )

      expect(callCount).toBe(2)
    })
  })
})
