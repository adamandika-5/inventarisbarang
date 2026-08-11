import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import ExcelJS from 'exceljs'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  loadTransactionHistoryRows,
  buildTransactionHistoryWorkbook,
} from '@/lib/reports/transaction-history-excel'

describe('Transaction History Keyset & Workbook Comprehensive Test Suite', () => {
  // ── Helper to build pre-sorted master dataset of 1,500 transactions ──────────
  function generateMasterDataset() {
    const boundaryTimestamp = '2026-07-15T12:00:00.000Z'

    const rawList = Array.from({ length: 1500 }, (_, idx) => {
      const idNum = idx + 1
      let txAt: string
      if (idNum >= 999 && idNum <= 1001) {
        // Items 999, 1000, 1001 share the exact same timestamp to test boundary tuple resolution
        txAt = boundaryTimestamp
      } else if (idNum < 999) {
        // Timestamps on 2026-07-20 (well within 2026-07-01 to 2026-08-01 range)
        txAt = new Date(Date.parse('2026-07-20T12:00:00.000Z') - idNum * 1000).toISOString()
      } else {
        // Timestamps on 2026-07-15 earlier than 12:00:00
        txAt = new Date(Date.parse('2026-07-15T11:59:59.000Z') - (idNum - 1001) * 1000).toISOString()
      }

      return {
        id: `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`,
        transaction_number: `TXN-${String(idNum).padStart(6, '0')}`,
        item_id: '123e4567-e89b-12d3-a456-426614174000',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        performed_by: 'user-001',
        transaction_at: txAt,
        stock_before: 0,
        stock_after: 10,
        reason: 'Keyset Test',
        original_transaction_id: null,
        is_reversed: false,
        reversal_transaction_id: null,
        items: {
          id: '123e4567-e89b-12d3-a456-426614174000',
          sku: `SKU-${idNum}`,
          name: `Item ${idNum}`,
          category_id: 'cat-001',
          categories: { name: 'ATK' },
        },
        units: { id: 'unit-001', name: 'Pcs', symbol: 'pcs' },
        profiles: { id: 'user-001', full_name: 'Admin Test', username: 'admintest' },
      }
    })

    // Sort strictly by transaction_at DESC, then id DESC
    return rawList.sort((a, b) => {
      const timeDiff = Date.parse(b.transaction_at) - Date.parse(a.transaction_at)
      if (timeDiff !== 0) return timeDiff
      return b.id.localeCompare(a.id)
    })
  }

  const masterDataset = generateMasterDataset()

  // ── Mock Supabase Client evaluating ACTUAL cursor predicates & filter args ──
  function createCursorPredicateMockSupabase(
    onQueryExecuted?: (info: {
      callIndex: number
      limitVal: number
      returnedCount: number
      orFilterStr: string | null
      ltFilterStr: string | null
      eqFilters: Record<string, string>
      inFilters: Record<string, string[]>
    }) => void,
    badLastItem?: { transaction_at?: string; id?: string },
  ) {
    let callIndex = 0

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { institution_name: 'INSTANSI TEST', report_header_text: 'HEADER TEST' },
            }),
          }
        }

        if (table === 'stock_transactions') {
          let gteVal: string | null = null
          let ltVal: string | null = null
          let orFilterStr: string | null = null
          const eqFilters: Record<string, string> = {}
          const inFilters: Record<string, string[]> = {}
          let rangeCalled = false

          const builder = {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'transaction_at') gteVal = val
              return builder
            }),
            lt: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'transaction_at') ltVal = val
              return builder
            }),
            or: vi.fn().mockImplementation((str: string) => {
              orFilterStr = str
              return builder
            }),
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              eqFilters[col] = val
              return builder
            }),
            in: vi.fn().mockImplementation((col: string, vals: string[]) => {
              inFilters[col] = vals
              if (col === 'id') {
                return Promise.resolve({ data: [], error: null })
              }
              return builder
            }),
            order: vi.fn().mockReturnThis(),
            range: vi.fn().mockImplementation(() => {
              rangeCalled = true
              return builder
            }),
            limit: vi.fn().mockImplementation((limitVal: number) => {
              callIndex++

              if (rangeCalled) {
                throw new Error('FORBIDDEN: .range() was called instead of .limit()!')
              }

              // Evaluate cursor predicate against master dataset
              let filtered = [...masterDataset]

              // Filter gte
              if (gteVal) {
                const gteMs = Date.parse(gteVal)
                filtered = filtered.filter((t) => Date.parse(t.transaction_at) >= gteMs)
              }

              // Filter lt
              if (ltVal) {
                const ltMs = Date.parse(ltVal)
                filtered = filtered.filter((t) => Date.parse(t.transaction_at) < ltMs)
              }

              // Filter cursor predicate `transaction_at.lt.${lastTxAt},and(transaction_at.eq.${lastTxAt},id.lt.${lastId})`
              if (orFilterStr) {
                const match = orFilterStr.match(
                  /transaction_at\.lt\.(.+?),and\(transaction_at\.eq\.(.+?),id\.lt\.(.+?)\)/,
                )
                if (!match) {
                  throw new Error(`Invalid cursor predicate format: ${orFilterStr}`)
                }
                const [, ltTimestamp, eqTimestamp, cursorId] = match
                const batch1LastItem = masterDataset[999]!

                if (
                  ltTimestamp !== batch1LastItem.transaction_at ||
                  eqTimestamp !== batch1LastItem.transaction_at ||
                  cursorId !== batch1LastItem.id
                ) {
                  throw new Error('Cursor for second batch did NOT come from last item of batch 1!')
                }

                const cursorTxAtMs = Date.parse(eqTimestamp!)

                filtered = filtered.filter((t) => {
                  const tMs = Date.parse(t.transaction_at)
                  if (tMs < cursorTxAtMs) return true
                  if (tMs === cursorTxAtMs && t.id < cursorId) return true
                  return false
                })
              }

              let resultBatch = filtered.slice(0, limitVal)

              if (badLastItem && callIndex === 1 && resultBatch.length === 1000) {
                resultBatch = [...resultBatch]
                const lastIdx = resultBatch.length - 1
                resultBatch[lastIdx] = {
                  ...resultBatch[lastIdx],
                  ...badLastItem,
                } as (typeof masterDataset)[0]
              }

              if (onQueryExecuted) {
                onQueryExecuted({
                  callIndex,
                  limitVal,
                  returnedCount: resultBatch.length,
                  orFilterStr,
                  ltFilterStr: ltVal,
                  eqFilters: { ...eqFilters },
                  inFilters: { ...inFilters },
                })
              }

              return Promise.resolve({ data: resultBatch, error: null })
            }),
          }

          return builder
        }

        return {}
      }),
    } as unknown as SupabaseClient<Database>
  }

  it('fetches exactly 1,500 unique IDs across 2 batches ([1000, 500]) matching master dataset exactly in order without range()', async () => {
    const executedQueries: Array<{
      callIndex: number
      limitVal: number
      returnedCount: number
      orFilterStr: string | null
    }> = []

    const mockSupabase = createCursorPredicateMockSupabase((info) => executedQueries.push(info))

    const rows = await loadTransactionHistoryRows(mockSupabase, {
      startUtcIso: '2026-07-01T00:00:00+07:00',
      effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
    })

    // Batch count and exact returned row counts: [1000, 500]
    expect(executedQueries.length).toBe(2)
    expect(executedQueries.map((q) => q.returnedCount)).toEqual([1000, 500])
    expect(executedQueries[0]?.limitVal).toBe(1000)
    expect(executedQueries[1]?.limitVal).toBe(1000)

    // Complete exact match of .or() cursor string in 2nd query
    const lastItemBatch1 = masterDataset[999]!
    const expectedOrFilter = `transaction_at.lt.${lastItemBatch1.transaction_at},and(transaction_at.eq.${lastItemBatch1.transaction_at},id.lt.${lastItemBatch1.id})`
    expect(executedQueries[1]?.orFilterStr).toBe(expectedOrFilter)

    // Complete array equality of 1,500 IDs against master dataset
    const fetchedIds = rows.map((r) => r.id)
    const masterIds = masterDataset.map((m) => m.id)
    expect(fetchedIds).toEqual(masterIds)

    // Set size uniqueness
    expect(new Set(fetchedIds).size).toBe(1500)

    // Exact position verification
    expect(rows[0]?.id).toBe(masterDataset[0]?.id)
    expect(rows[749]?.id).toBe(masterDataset[749]?.id)
    expect(rows[998]?.id).toBe(masterDataset[998]?.id)
    expect(rows[999]?.id).toBe(masterDataset[999]?.id)
    expect(rows[1000]?.id).toBe(masterDataset[1000]?.id)
    expect(rows[1499]?.id).toBe(masterDataset[1499]?.id)

    // Verify all 2nd batch items satisfy tuple condition < cursor
    const batch2Rows = rows.slice(1000)
    const cursorTxAtMs = Date.parse(lastItemBatch1.transaction_at)
    for (const r of batch2Rows) {
      const rMs = Date.parse(r.transaction_at)
      const satisfyTuple = rMs < cursorTxAtMs || (rMs === cursorTxAtMs && r.id < lastItemBatch1.id)
      expect(satisfyTuple).toBe(true)
    }
  })

  it('rejects immediately after batch 1 if cursor UUID is invalid, preventing query 2', async () => {
    const executedQueries: Array<{ callIndex: number }> = []
    const mockSupabase = createCursorPredicateMockSupabase(
      (info) => executedQueries.push(info),
      { id: 'not-a-valid-uuid' },
    )

    await expect(
      loadTransactionHistoryRows(mockSupabase, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
      }),
    ).rejects.toThrow('Cursor transaksi ekspor tidak valid.')

    expect(executedQueries.length).toBe(1)
  })

  it('rejects immediately after batch 1 if cursor timestamp is invalid, preventing query 2', async () => {
    const executedQueries: Array<{ callIndex: number }> = []
    const mockSupabase = createCursorPredicateMockSupabase(
      (info) => executedQueries.push(info),
      { transaction_at: 'invalid-date-string' },
    )

    await expect(
      loadTransactionHistoryRows(mockSupabase, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
      }),
    ).rejects.toThrow('Timestamp cursor transaksi ekspor tidak valid.')

    expect(executedQueries.length).toBe(1)
  })

  it('rejects immediately if cursor does not move downwards in batch 2, preventing query 3', async () => {
    let callCount = 0
    const executedQueries: Array<{ callIndex: number }> = []

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'stock_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            gte: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              callCount++
              executedQueries.push({ callIndex: callCount })

              if (callCount === 1) {
                // Batch 1 returns 1,000 items
                const batch1 = masterDataset.slice(0, 1000)
                return Promise.resolve({ data: batch1, error: null })
              }
              if (callCount === 2) {
                // Batch 2 returns 1,000 items, BUT last item has non-descending tuple equal to batch 1 cursor
                const batch2 = Array.from({ length: 1000 }, () => ({
                  ...masterDataset[999]!, // same timestamp and id as batch 1 cursor!
                }))
                return Promise.resolve({ data: batch2, error: null })
              }
              return Promise.resolve({ data: [], error: null })
            }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    await expect(
      loadTransactionHistoryRows(mockSupabase, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
      }),
    ).rejects.toThrow('Cursor transaksi ekspor tidak bergerak menurun.')

    expect(executedQueries.length).toBe(2)
  })

  it('renders actual Excel workbook with ALL 1,500 transaction numbers verified in worksheet cells via ExcelJS and matches HEAD format', async () => {
    const mockSupabase = createCursorPredicateMockSupabase()

    const buffer = await buildTransactionHistoryWorkbook(mockSupabase, {
      dateFromStr: '2026-07-01',
      dateToStr: '2026-07-31',
    })

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(0)

    const workbook = new ExcelJS.Workbook()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await workbook.xlsx.load(buffer as any)

    // HEAD Regression Check 1: Sheet list & name
    const sheetNames = workbook.worksheets.map((w) => w.name)
    expect(sheetNames).toEqual(['Riwayat Transaksi'])
    const worksheet = workbook.getWorksheet('Riwayat Transaksi')
    expect(worksheet).toBeDefined()

    // HEAD Regression Check 2: Total columns & header row structure & labels (Row 5)
    expect(worksheet?.columns.length).toBe(11)
    const headerRow = worksheet?.getRow(5)
    expect(headerRow).toBeDefined()
    expect(headerRow?.number).toBe(5)

    const expectedHeaders = [
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
    ]

    expectedHeaders.forEach((expectedLabel, idx) => {
      const cellValue = headerRow?.getCell(idx + 1).value
      expect(cellValue).toBe(expectedLabel)
    })

    // HEAD Regression Check 3: Extract ALL 1,500 transaction numbers and verify cell positions
    const txnNumbersInSheet: string[] = []
    worksheet?.eachRow((row, rowNumber) => {
      if (rowNumber >= 6) {
        const val = row.getCell(3).value
        if (val) txnNumbersInSheet.push(String(val))
      }
    })

    const masterTxNumbers = masterDataset.map((m) => m.transaction_number)
    expect(txnNumbersInSheet).toEqual(masterTxNumbers)
    expect(new Set(txnNumbersInSheet).size).toBe(1500)

    // HEAD Regression Check 4: Specific column cell positions for row 6 (first data row)
    const firstDataRow = worksheet?.getRow(6)
    expect(firstDataRow?.getCell(3).value).toBe(masterDataset[0]?.transaction_number) // Nomor Transaksi in Col 3
    expect(firstDataRow?.getCell(5).value).toBe(masterDataset[0]?.items.sku) // Kode Barang in Col 5
    expect(firstDataRow?.getCell(10).value).toBe(masterDataset[0]?.stock_after) // Stok Setelah in Col 10
    expect(firstDataRow?.getCell(2).value).toBe('20/07/2026 18:59') // WIB formatted date matching HEAD format
  })

  describe('Query Filter Arguments Verification across ALL Batches', () => {
    it('verifies exact IN type filter across ALL batches', async () => {
      const executedIn: Array<{ eqFilters: Record<string, string>; inFilters: Record<string, string[]> }> = []
      const mockSupabaseIn = createCursorPredicateMockSupabase((info) => executedIn.push(info))

      await loadTransactionHistoryRows(mockSupabaseIn, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
        typeFilter: 'IN',
      })

      expect(executedIn.length).toBe(2)
      expect(executedIn[0]?.eqFilters['transaction_type']).toBe('IN')
      expect(executedIn[1]?.eqFilters['transaction_type']).toBe('IN')
    })

    it('verifies exact ADJUSTMENT type filter across ALL batches', async () => {
      const executedAdj: Array<{ inFilters: Record<string, string[]> }> = []
      const mockSupabaseAdj = createCursorPredicateMockSupabase((info) => executedAdj.push(info))

      await loadTransactionHistoryRows(mockSupabaseAdj, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
        typeFilter: 'ADJUSTMENT',
      })

      expect(executedAdj.length).toBe(2)
      expect(executedAdj[0]?.inFilters['transaction_type']).toEqual(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
      expect(executedAdj[1]?.inFilters['transaction_type']).toEqual(['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
    })

    it('verifies exact item UUID filter across ALL batches', async () => {
      const executedItem: Array<{ eqFilters: Record<string, string> }> = []
      const mockSupabaseItem = createCursorPredicateMockSupabase((info) => executedItem.push(info))
      const targetItemUuid = '123e4567-e89b-12d3-a456-426614174000'

      await loadTransactionHistoryRows(mockSupabaseItem, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
        itemFilter: targetItemUuid,
      })

      expect(executedItem.length).toBe(2)
      expect(executedItem[0]?.eqFilters['item_id']).toBe(targetItemUuid)
      expect(executedItem[1]?.eqFilters['item_id']).toBe(targetItemUuid)
    })

    it('verifies ALL type filter omits transaction_type filter across ALL batches', async () => {
      const executedAll: Array<{ eqFilters: Record<string, string>; inFilters: Record<string, string[]> }> = []
      const mockSupabaseAll = createCursorPredicateMockSupabase((info) => executedAll.push(info))

      await loadTransactionHistoryRows(mockSupabaseAll, {
        startUtcIso: '2026-07-01T00:00:00+07:00',
        effectiveEndUtcIso: '2026-08-01T00:00:00+07:00',
        typeFilter: 'ALL',
      })

      expect(executedAll.length).toBe(2)
      expect(executedAll[0]?.eqFilters['transaction_type']).toBeUndefined()
      expect(executedAll[0]?.inFilters['transaction_type']).toBeUndefined()
      expect(executedAll[1]?.eqFilters['transaction_type']).toBeUndefined()
      expect(executedAll[1]?.inFilters['transaction_type']).toBeUndefined()
    })
  })

  describe('Time Snapshot Cutoff & Timezone Verification via buildTransactionHistoryWorkbook()', () => {
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] })
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('truncates future requested end date to current export execution time across ALL batches', async () => {
      vi.setSystemTime(new Date('2026-08-01T12:00:00.000Z'))
      const dateNowSpy = vi.spyOn(Date, 'now')
      const executedQueries: Array<{ ltFilterStr: string | null }> = []

      const mockSupabase = createCursorPredicateMockSupabase((info) => {
        executedQueries.push({ ltFilterStr: info.ltFilterStr })
      })

      // dateToStr in future: 2026-12-31
      await buildTransactionHistoryWorkbook(mockSupabase, {
        dateFromStr: '2026-07-02',
        dateToStr: '2026-12-31',
      })

      const expectedExportTimeIso = '2026-08-01T12:00:00.000Z'

      // Prove Date.now() was invoked EXACTLY 1 time inside production code
      expect(dateNowSpy).toHaveBeenCalledTimes(1)
      dateNowSpy.mockRestore()

      expect(executedQueries.length).toBe(2)
      // Both batches receive identical effectiveEndUtcIso string equal to export time
      expect(executedQueries[0]?.ltFilterStr).toBe(expectedExportTimeIso)
      expect(executedQueries[1]?.ltFilterStr).toBe(expectedExportTimeIso)
    })

    it('preserves past requested end date even when timezone string looks lexicographically larger than export now', async () => {
      // Timezone Trap setup:
      // export now = 2026-07-31T18:00:00.000Z
      // requested end string for dateToStr 2026-07-31 = 2026-08-01T00:00:00+07:00
      // Lexicographically: "2026-08-01T00:00:00+07:00" > "2026-07-31T18:00:00.000Z" (string comparison WRONG!)
      // Millisecond comparison: Date.parse("2026-08-01T00:00:00+07:00") = 1785507600000 (2026-07-31T17:00:00.000Z)
      // Math.min(1785507600000, 1785511200000) = 1785507600000 -> "2026-07-31T17:00:00.000Z"
      vi.setSystemTime(new Date('2026-07-31T18:00:00.000Z'))
      const dateNowSpy = vi.spyOn(Date, 'now')
      const executedQueries: Array<{ ltFilterStr: string | null }> = []

      const mockSupabase = createCursorPredicateMockSupabase((info) => {
        executedQueries.push({ ltFilterStr: info.ltFilterStr })
      })

      await buildTransactionHistoryWorkbook(mockSupabase, {
        dateFromStr: '2026-07-01',
        dateToStr: '2026-07-31',
      })

      expect(dateNowSpy).toHaveBeenCalledTimes(1)
      dateNowSpy.mockRestore()

      const expectedCutoffIso = '2026-07-31T17:00:00.000Z'

      expect(executedQueries.length).toBe(2)
      expect(executedQueries[0]?.ltFilterStr).toBe(expectedCutoffIso)
      expect(executedQueries[1]?.ltFilterStr).toBe(expectedCutoffIso)
    })
  })
})
