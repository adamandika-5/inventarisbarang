import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import {
  compileInventoryReportData,
  parseIsoToNano,
} from '@/lib/reports/inventory-summary-excel'
import { normalizeReportFilters } from '@/lib/reports/report-filters'

describe('Inventory Report Keyset Pagination & Ledger Comprehensive Test Suite', () => {
  // ── Helper to build pre-sorted master dataset of 1,500 transactions ──────────
  function generateMasterTransactions() {
    const boundaryTimestamp = '2026-07-15T12:00:00.000000Z'

    const rawList = Array.from({ length: 1500 }, (_, idx) => {
      const idNum = idx + 1
      let txAt: string
      if (idNum >= 999 && idNum <= 1001) {
        // Items 999, 1000, 1001 share exact same timestamp to test boundary tuple resolution
        txAt = boundaryTimestamp
      } else if (idNum < 999) {
        // Timestamps on 2026-07-05
        txAt = new Date(Date.parse('2026-07-05T00:00:00.000Z') + idNum * 1000).toISOString()
      } else {
        // Timestamps on 2026-07-20
        txAt = new Date(Date.parse('2026-07-20T00:00:00.000Z') + (idNum - 1001) * 1000).toISOString()
      }

      return {
        id: `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`,
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: (idNum - 1) * 10,
        stock_after: idNum * 10,
        transaction_at: txAt,
        is_reversed: false,
        original_transaction_id: null,
      }
    })

    // Sort strictly by transaction_at ASC, then id ASC
    return rawList.sort((a, b) => {
      const nanoA = parseIsoToNano(a.transaction_at) ?? 0n
      const nanoB = parseIsoToNano(b.transaction_at) ?? 0n
      if (nanoA < nanoB) return -1
      if (nanoA > nanoB) return 1
      return a.id.localeCompare(b.id)
    })
  }

  const masterTransactions = generateMasterTransactions()

  // ── Mock Supabase Client evaluating ACTUAL cursor predicates & filter args ──
  function createMockSupabase(options?: {
    itemCount?: number
    categoryCount?: number
    badItemCursor?: { id?: string }
    badCatCursor?: { id?: string }
    badTxCursor?: { transaction_at?: string; id?: string }
    stuckTxCursor?: boolean
    backwardTxCursor?: boolean
    stuckCatCursor?: boolean
    stuckItemCursor?: boolean
    customTransactions?: typeof masterTransactions
    onQueryExecuted?: (info: { table: string; callIndex: number; count: number; filter: string | null; ltFilter: string | null; batchIds?: string[] }) => void
  }) {
    const itemCount = options?.itemCount ?? 1
    const categoryCount = options?.categoryCount ?? 1

    const masterItems = Array.from({ length: itemCount }, (_, idx) => {
      const idNum = idx + 1
      return {
        id: `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`,
        sku: `SKU-${String(idNum).padStart(5, '0')}`,
        name: `Barang ${idNum}`,
        current_stock: 100,
        is_active: true,
        category_id: '123e4567-e89b-12d3-a456-111111111111',
        base_unit_id: 'unit-001',
        base_unit: { name: 'Pcs', symbol: 'pcs' },
        categories: { name: 'ATK' },
      }
    }).sort((a, b) => a.id.localeCompare(b.id))

    const masterCategories = Array.from({ length: categoryCount }, (_, idx) => {
      const idNum = idx + 1
      return {
        id: `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`,
        name: `Kategori ${idNum}`,
      }
    }).sort((a, b) => a.id.localeCompare(b.id))

    const txSource = options?.customTransactions ?? masterTransactions

    let itemCallIndex = 0
    let catCallIndex = 0
    let txCallIndex = 0

    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'app_settings') {
          return {
            select: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { institution_name: 'DINAS KESEHATAN', report_header_text: 'HEADER PERSEDIAAN' },
              error: null,
            }),
          }
        }

        if (table === 'categories') {
          let gtId: string | null = null
          const builder = {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'id') gtId = val
              return builder
            }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation((limitVal: number) => {
              catCallIndex++
              let filtered = [...masterCategories]
              if (gtId) {
                filtered = filtered.filter((c) => c.id > gtId!)
              }
              let batch = filtered.slice(0, limitVal)
              if (options?.badCatCursor && catCallIndex === 1 && batch.length === 1000) {
                batch = [...batch]
                const lastIdx = batch.length - 1
                batch[lastIdx] = { ...batch[lastIdx], ...options.badCatCursor } as (typeof masterCategories)[0]
              }
              if (options?.stuckCatCursor && catCallIndex === 2) {
                // Non-moving category cursor: return batch of 1,000 starting from index 0
                batch = masterCategories.slice(0, 1000)
              }
              if (options?.onQueryExecuted) {
                options.onQueryExecuted({ table, callIndex: catCallIndex, count: batch.length, filter: gtId, ltFilter: null })
              }
              return Promise.resolve({ data: batch, error: null })
            }),
          }
          return builder
        }

        if (table === 'items') {
          let gtId: string | null = null
          const builder = {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'id') gtId = val
              return builder
            }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation((limitVal: number) => {
              itemCallIndex++
              let filtered = [...masterItems]
              if (gtId) {
                filtered = filtered.filter((i) => i.id > gtId!)
              }
              let batch = filtered.slice(0, limitVal)
              if (options?.badItemCursor && itemCallIndex === 1 && batch.length === 1000) {
                batch = [...batch]
                const lastIdx = batch.length - 1
                batch[lastIdx] = { ...batch[lastIdx], ...options.badItemCursor } as (typeof masterItems)[0]
              }
              if (options?.stuckItemCursor && itemCallIndex === 2) {
                // Non-moving item cursor: return batch of 1,000 starting from index 0
                batch = masterItems.slice(0, 1000)
              }
              if (options?.onQueryExecuted) {
                options.onQueryExecuted({ table, callIndex: itemCallIndex, count: batch.length, filter: gtId, ltFilter: null })
              }
              return Promise.resolve({ data: batch, error: null })
            }),
          }
          return builder
        }

        if (table === 'stock_transactions') {
          let ltVal: string | null = null
          let orFilterStr: string | null = null

          const builder = {
            select: vi.fn().mockReturnThis(),
            lt: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'transaction_at') ltVal = val
              return builder
            }),
            or: vi.fn().mockImplementation((str: string) => {
              orFilterStr = str
              return builder
            }),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation((limitVal: number) => {
              txCallIndex++
              let filtered = [...txSource]

              if (ltVal) {
                const ltNano = parseIsoToNano(ltVal)
                if (ltNano !== null) {
                  filtered = filtered.filter((t) => (parseIsoToNano(t.transaction_at) ?? 0n) < ltNano)
                }
              }

              if (orFilterStr) {
                const match = orFilterStr.match(
                  /transaction_at\.gt\.(.+?),and\(transaction_at\.eq\.(.+?),id\.gt\.(.+?)\)/,
                )
                if (!match) {
                  throw new Error(`Invalid ascending cursor predicate format: ${orFilterStr}`)
                }
                const [, , eqTimestamp, cursorId] = match
                const cursorTxAtNano = parseIsoToNano(eqTimestamp!)!

                filtered = filtered.filter((t) => {
                  const tNano = parseIsoToNano(t.transaction_at)!
                  if (tNano > cursorTxAtNano) return true
                  if (tNano === cursorTxAtNano && t.id > cursorId!) return true
                  return false
                })
              }

              let batch = filtered.slice(0, limitVal)
              if (options?.badTxCursor && txCallIndex === 1 && batch.length === 1000) {
                batch = [...batch]
                const lastIdx = batch.length - 1
                batch[lastIdx] = { ...batch[lastIdx], ...options.badTxCursor } as (typeof txSource)[0]
              }
              if (options?.stuckTxCursor && txCallIndex === 2) {
                // Return batch of 1,000 items identical to batch 1
                batch = txSource.slice(0, 1000)
              }
              if (options?.backwardTxCursor && txCallIndex === 2) {
                // Return batch of 1,000 items from earlier period
                batch = txSource.slice(0, 1000).map((t) => ({ ...t, transaction_at: '2026-06-01T00:00:00.000Z' }))
              }

              if (options?.onQueryExecuted) {
                options.onQueryExecuted({
                  table,
                  callIndex: txCallIndex,
                  count: batch.length,
                  filter: orFilterStr,
                  ltFilter: ltVal,
                  batchIds: batch.map((b) => b.id),
                })
              }
              return Promise.resolve({ data: batch, error: null })
            }),
          }
          return builder
        }

        return {}
      }),
    } as unknown as SupabaseClient<Database>
  }

  it('paginates >1,000 items across 2 batches ([1000, 500]) using .gt("id", ...) cursor', async () => {
    const itemQueries: Array<{ callIndex: number; count: number; filter: string | null }> = []
    const mockSupabase = createMockSupabase({
      itemCount: 1500,
      onQueryExecuted: (info) => {
        if (info.table === 'items') itemQueries.push(info)
      },
    })

    const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')

    expect(itemQueries.length).toBe(2)
    expect(itemQueries.map((q) => q.count)).toEqual([1000, 500])
    expect(itemQueries[0]?.filter).toBeNull()
    expect(itemQueries[1]?.filter).toBe('123e4567-e89b-12d3-a456-000000001000')

    const allItems = reportData.categories.flatMap((c) => c.items)
    expect(allItems.length).toBe(1500)
    expect(new Set(allItems.map((i) => i.id)).size).toBe(1500)
  })

  it('paginates >1,000 categories across 2 batches ([1000, 500]) using .gt("id", ...) cursor', async () => {
    const catQueries: Array<{ callIndex: number; count: number; filter: string | null }> = []
    const mockSupabase = createMockSupabase({
      categoryCount: 1500,
      onQueryExecuted: (info) => {
        if (info.table === 'categories') catQueries.push(info)
      },
    })

    await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')

    expect(catQueries.length).toBe(2)
    expect(catQueries.map((q) => q.count)).toEqual([1000, 500])
    expect(catQueries[0]?.filter).toBeNull()
    expect(catQueries[1]?.filter).toBe('123e4567-e89b-12d3-a456-000000001000')
  })

  it('fetches exactly 1,500 transactions across 2 batches ([1000, 500]), verifying exact returned ID sequence (zero missing, zero duplicates) and 15,000 mutasi', async () => {
    const txQueries: Array<{ callIndex: number; count: number; filter: string | null; ltFilter: string | null; batchIds?: string[] }> = []
    const mockSupabase = createMockSupabase({
      onQueryExecuted: (info) => {
        if (info.table === 'stock_transactions') txQueries.push(info)
      },
    })

    const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')

    expect(txQueries.length).toBe(2)
    expect(txQueries.map((q) => q.count)).toEqual([1000, 500])
    expect(txQueries[0]?.filter).toBeNull()

    // Both queries receive exact same .lt() cutoff
    expect(txQueries[0]?.ltFilter).toBeDefined()
    expect(txQueries[1]?.ltFilter).toBe(txQueries[0]?.ltFilter)

    // Verify exact returned ID sequence across batches
    const fetchedIds = txQueries.flatMap((q) => q.batchIds || [])
    expect(fetchedIds.length).toBe(1500)
    expect(new Set(fetchedIds).size).toBe(1500) // Zero duplicates

    const sourceMasterIds = masterTransactions.map((t) => t.id)
    expect(fetchedIds).toEqual(sourceMasterIds) // Exact 1:1 sequence match

    const itemSum = reportData.categories[0]?.items[0]
    expect(itemSum?.mutasiMasuk).toBe(15000) // 1500 tx * 10 = 15000
  })

  it('handles microsecond boundary pagination around row 1,000 (row 1,000 has larger lexical ID, row 1,001 has smaller lexical ID) without false cursor rejection', async () => {
    // Row 1,000 (index 999): 2026-07-15T12:00:00.000001Z, ID = '...000000001000' (larger ID)
    // Row 1,001 (index 1000): 2026-07-15T12:00:00.000002Z, ID = '...000000000001' (smaller ID, but NEWER timestamp)
    const customBoundaryTxs = Array.from({ length: 1500 }, (_, idx) => {
      const idNum = idx + 1
      let txAt: string
      let idStr: string

      if (idNum === 1000) {
        txAt = '2026-07-15T12:00:00.000001Z'
        idStr = '123e4567-e89b-12d3-a456-000000001000' // Row 1000 has larger ID
      } else if (idNum === 1001) {
        txAt = '2026-07-15T12:00:00.000002Z' // Row 1001 has microsecond 2 (NEWER timestamp)
        idStr = '123e4567-e89b-12d3-a456-000000000001' // Row 1001 has smaller ID
      } else if (idNum < 1000) {
        txAt = new Date(Date.parse('2026-07-05T00:00:00.000Z') + idNum * 1000).toISOString()
        idStr = `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`
      } else {
        txAt = new Date(Date.parse('2026-07-20T00:00:00.000Z') + (idNum - 1001) * 1000).toISOString()
        idStr = `123e4567-e89b-12d3-a456-${String(idNum).padStart(12, '0')}`
      }

      return {
        id: idStr,
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 0,
        stock_after: 10,
        transaction_at: txAt,
        is_reversed: false,
        original_transaction_id: null,
      }
    }).sort((a, b) => {
      const nanoA = parseIsoToNano(a.transaction_at) ?? 0n
      const nanoB = parseIsoToNano(b.transaction_at) ?? 0n
      if (nanoA < nanoB) return -1
      if (nanoA > nanoB) return 1
      return a.id.localeCompare(b.id)
    })

    const txQueries: Array<{ callIndex: number; count: number }> = []
    const mockSupabase = createMockSupabase({
      customTransactions: customBoundaryTxs,
      onQueryExecuted: (info) => {
        if (info.table === 'stock_transactions') txQueries.push(info)
      },
    })

    const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')

    // Proves cursor was NOT falsely rejected and query advanced to batch 2!
    expect(txQueries.length).toBe(2)
    expect(txQueries.map((q) => q.count)).toEqual([1000, 500])
    expect(reportData.categories[0]?.items[0]?.mutasiMasuk).toBe(15000)
  })

  it('strictly applies [start, effectiveEnd) boundary classification and passes exact same cutoff .lt() across all batches', async () => {
    // Period requested: 2026-07-01 to 2026-07-31
    // startUtcIso = 2026-07-01T00:00:00+07:00 -> 2026-06-30T17:00:00.000000000Z
    // effectiveEndUtcIso = 2026-08-01T00:00:00+07:00 -> 2026-07-31T17:00:00.000000000Z
    const { startUtcIso, endUtcIso } = normalizeReportFilters({ from: '2026-07-01', to: '2026-07-31' })
    const startNano = parseIsoToNano(startUtcIso)!
    const endNano = parseIsoToNano(endUtcIso)!

    const boundaryTestTxs = [
      // T1: 1ns before start -> saldo awal
      {
        id: 'tx-b-1',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'INITIAL',
        input_quantity: 100,
        base_quantity: 100,
        quantity_delta: 100,
        stock_before: 0,
        stock_after: 100,
        transaction_at: '2026-06-30T16:59:59.999999999Z', // startNano - 1n
        is_reversed: false,
        original_transaction_id: null,
      },
      // T2: exactly at start -> mutasi periode
      {
        id: 'tx-b-2',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 100,
        stock_after: 110,
        transaction_at: '2026-06-30T17:00:00.000000000Z', // exactly startNano
        is_reversed: false,
        original_transaction_id: null,
      },
      // T3: 1ns after start -> mutasi periode
      {
        id: 'tx-b-3',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 110,
        stock_after: 120,
        transaction_at: '2026-06-30T17:00:00.000000001Z', // startNano + 1n
        is_reversed: false,
        original_transaction_id: null,
      },
      // T4: 1ns before cutoff -> mutasi periode
      {
        id: 'tx-b-4',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 120,
        stock_after: 130,
        transaction_at: '2026-07-31T16:59:59.999999999Z', // endNano - 1n
        is_reversed: false,
        original_transaction_id: null,
      },
      // T5: exactly at cutoff -> excluded by .lt()
      {
        id: 'tx-b-5',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 130,
        stock_after: 140,
        transaction_at: '2026-07-31T17:00:00.000000000Z', // exactly endNano
        is_reversed: false,
        original_transaction_id: null,
      },
      // T6: 1ns above cutoff -> excluded by .lt()
      {
        id: 'tx-b-6',
        item_id: '123e4567-e89b-12d3-a456-000000000001',
        transaction_type: 'IN',
        input_quantity: 10,
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 140,
        stock_after: 150,
        transaction_at: '2026-07-31T17:00:00.000000001Z', // endNano + 1n
        is_reversed: false,
        original_transaction_id: null,
      },
    ]

    const nanoT1 = parseIsoToNano(boundaryTestTxs[0]!.transaction_at)!
    const nanoT2 = parseIsoToNano(boundaryTestTxs[1]!.transaction_at)!
    const nanoT3 = parseIsoToNano(boundaryTestTxs[2]!.transaction_at)!
    const nanoT4 = parseIsoToNano(boundaryTestTxs[3]!.transaction_at)!
    const nanoT5 = parseIsoToNano(boundaryTestTxs[4]!.transaction_at)!

    expect(nanoT1 < startNano).toBe(true)
    expect(nanoT2 === startNano).toBe(true)
    expect(nanoT3 > startNano).toBe(true)
    expect(nanoT4 < endNano).toBe(true)
    expect(nanoT5 === endNano).toBe(true)

    const mockSupabase = createMockSupabase({ customTransactions: boundaryTestTxs })
    const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')
    const itemRes = reportData.categories[0]?.items[0]

    expect(itemRes?.saldoAwalQty).toBe(100) // T1 is saldo awal
    expect(itemRes?.mutasiMasuk).toBe(30) // T2, T3, T4 are mutasi periode (10 + 10 + 10 = 30)
    expect(itemRes?.saldoAkhirQty).toBe(130) // T5 & T6 excluded
  })

  it('rejects non-moving transaction cursor after batch 1 and proves query 3 is NEVER executed', async () => {
    let txQueryCount = 0
    const mockSupabase = createMockSupabase({
      stuckTxCursor: true,
      onQueryExecuted: (info) => {
        if (info.table === 'stock_transactions') txQueryCount++
      },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor transaksi ekspor tidak bergerak maju.')

    expect(txQueryCount).toBe(2) // Batch 1 succeeded, batch 2 failed, batch 3 NEVER executed
  })

  it('rejects backward-moving transaction cursor after batch 1 and proves query 3 is NEVER executed', async () => {
    let txQueryCount = 0
    const mockSupabase = createMockSupabase({
      backwardTxCursor: true,
      onQueryExecuted: (info) => {
        if (info.table === 'stock_transactions') txQueryCount++
      },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor transaksi ekspor tidak bergerak maju.')

    expect(txQueryCount).toBe(2) // Batch 1 succeeded, batch 2 failed, batch 3 NEVER executed
  })

  it('rejects non-moving category cursor after batch 1 and proves query 3 is NEVER executed', async () => {
    let catQueryCount = 0
    const mockSupabase = createMockSupabase({
      categoryCount: 1500,
      stuckCatCursor: true,
      onQueryExecuted: (info) => {
        if (info.table === 'categories') catQueryCount++
      },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor kategori ekspor tidak bergerak maju.')

    expect(catQueryCount).toBe(2)
  })

  it('rejects non-moving item cursor after batch 1 and proves query 3 is NEVER executed', async () => {
    let itemQueryCount = 0
    const mockSupabase = createMockSupabase({
      itemCount: 1500,
      stuckItemCursor: true,
      onQueryExecuted: (info) => {
        if (info.table === 'items') itemQueryCount++
      },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor barang ekspor tidak bergerak maju.')

    expect(itemQueryCount).toBe(2)
  })

  it('verifies timezone formatting via compile function under non-WIB environment (UTC) using fake timers instant 2026-01-31T20:00:00.000Z', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-31T20:00:00.000Z'))

    const mockSupabase = createMockSupabase()

    try {
      const reportData = await compileInventoryReportData(mockSupabase, '2026-01-01', '2026-01-31')

      // UTC 20:00 on Jan 31 = 03:00 WIB on Feb 1
      expect(reportData.generatedAtWib).toBe('1 Februari 2026, 03.00 WIB')
    } finally {
      vi.useRealTimers()
    }
  })

  it('accurately classifies early morning WIB transactions (UTC previous day) into period mutation instead of saldo awal', async () => {
    const mockItems = [
      {
        id: 'item-wib-1',
        sku: 'SKU-WIB-1',
        name: 'Barang Early WIB',
        current_stock: 10,
        is_active: true,
        category_id: 'cat-1',
        base_unit_id: 'unit-1',
        base_unit: { name: 'Pcs', symbol: 'pcs' },
        categories: { name: 'ATK' },
      },
    ]

    const mockTxs = [
      {
        id: 'tx-wib-early',
        item_id: 'item-wib-1',
        transaction_type: 'IN',
        base_quantity: 10,
        quantity_delta: 10,
        stock_before: 0,
        stock_after: 10,
        transaction_at: '2026-06-30T18:00:00Z', // 01:00 WIB July 1st
        is_reversed: false,
      },
    ]

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
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [{ id: 'cat-1', name: 'ATK' }], error: null }),
          }
        }
        if (table === 'items') {
          return {
            select: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
          }
        }
        if (table === 'stock_transactions') {
          return {
            select: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: mockTxs, error: null }),
          }
        }
        return {}
      }),
    } as unknown as SupabaseClient<Database>

    const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')
    const itemRes = reportData.categories[0]?.items[0]

    expect(itemRes?.saldoAwalQty).toBe(0) // Saldo awal 0
    expect(itemRes?.mutasiMasuk).toBe(10) // Period mutation receives 10
    expect(itemRes?.saldoAkhirQty).toBe(10)
  })

  it('rejects invalid cursor UUID in items batch and throws fail-closed error', async () => {
    const mockSupabase = createMockSupabase({
      itemCount: 1500,
      badItemCursor: { id: 'invalid-uuid-string' },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor barang ekspor tidak valid.')
  })

  it('rejects invalid cursor UUID in stock transactions batch and throws fail-closed error', async () => {
    const mockSupabase = createMockSupabase({
      badTxCursor: { id: 'invalid-uuid-string' },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Cursor transaksi ekspor tidak valid.')
  })

  it('rejects invalid timestamp in stock transactions cursor and throws fail-closed error', async () => {
    const mockSupabase = createMockSupabase({
      badTxCursor: { transaction_at: 'not-a-valid-date' },
    })

    await expect(
      compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Timestamp cursor transaksi ekspor tidak valid.')
  })

  it('fails closed when app_settings, categories, items, or transaction query fails', async () => {
    const makeFailingMock = (failingTable: string) => {
      return {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === failingTable) {
            return {
              select: vi.fn().mockReturnThis(),
              gt: vi.fn().mockReturnThis(),
              lt: vi.fn().mockReturnThis(),
              order: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB connection error' } }),
              then: (resolve: (val: unknown) => void) =>
                resolve({ data: null, error: { message: 'DB connection error' } }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: {}, error: null }),
            then: (resolve: (val: unknown) => void) => resolve({ data: [], error: null }),
          }
        }),
      } as unknown as SupabaseClient<Database>
    }

    await expect(
      compileInventoryReportData(makeFailingMock('app_settings'), '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data pengaturan instansi')

    await expect(
      compileInventoryReportData(makeFailingMock('categories'), '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data kategori ekspor')

    await expect(
      compileInventoryReportData(makeFailingMock('items'), '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data barang ekspor')

    await expect(
      compileInventoryReportData(makeFailingMock('stock_transactions'), '2026-07-01', '2026-07-31'),
    ).rejects.toThrow('Gagal mengambil data persediaan ekspor')
  })

  describe('Ledger Calculation & Item Filtering Verification', () => {
    it('accurately calculates saldo awal, period mutations (IN, OUT, INITIAL, ADJUSTMENT, REVERSAL), and saldo akhir', async () => {
      const mockItems = [
        {
          id: 'item-ledger-1',
          sku: 'SKU-LEDGER-1',
          name: 'Barang Ledger 1',
          current_stock: 50,
          is_active: true,
          category_id: 'cat-1',
          base_unit_id: 'unit-1',
          base_unit: { name: 'Pcs', symbol: 'pcs' },
          categories: { name: 'ATK' },
        },
      ]

      const mockTxs = [
        // Before period (startUtc = 2026-07-01T00:00:00+07:00 -> 2026-06-30T17:00:00Z)
        {
          id: 'tx-0',
          item_id: 'item-ledger-1',
          transaction_type: 'INITIAL',
          base_quantity: 100,
          quantity_delta: 100,
          stock_before: 0,
          stock_after: 100,
          transaction_at: '2026-06-15T10:00:00Z',
          is_reversed: false,
        },
        // Period (2026-07-01 to 2026-07-31)
        {
          id: 'tx-1',
          item_id: 'item-ledger-1',
          transaction_type: 'IN',
          base_quantity: 50,
          quantity_delta: 50,
          stock_before: 100,
          stock_after: 150,
          transaction_at: '2026-07-05T10:00:00Z',
          is_reversed: false,
        },
        {
          id: 'tx-2',
          item_id: 'item-ledger-1',
          transaction_type: 'OUT',
          base_quantity: 30,
          quantity_delta: -30,
          stock_before: 150,
          stock_after: 120,
          transaction_at: '2026-07-10T10:00:00Z',
          is_reversed: false,
        },
        {
          id: 'tx-3',
          item_id: 'item-ledger-1',
          transaction_type: 'ADJUSTMENT_IN',
          base_quantity: 10,
          quantity_delta: 10,
          stock_before: 120,
          stock_after: 130,
          transaction_at: '2026-07-15T10:00:00Z',
          is_reversed: false,
        },
        {
          id: 'tx-4',
          item_id: 'item-ledger-1',
          transaction_type: 'ADJUSTMENT_OUT',
          base_quantity: 5,
          quantity_delta: -5,
          stock_before: 130,
          stock_after: 125,
          transaction_at: '2026-07-20T10:00:00Z',
          is_reversed: false,
        },
        {
          id: 'tx-5',
          item_id: 'item-ledger-1',
          transaction_type: 'REVERSAL',
          base_quantity: 30,
          quantity_delta: 30, // positive reversal (canceling an OUT) -> mutasi masuk
          stock_before: 125,
          stock_after: 155,
          transaction_at: '2026-07-25T10:00:00Z',
          is_reversed: false,
        },
        {
          id: 'tx-6',
          item_id: 'item-ledger-1',
          transaction_type: 'REVERSAL',
          base_quantity: 50,
          quantity_delta: -50, // negative reversal (canceling an IN) -> mutasi keluar
          stock_before: 155,
          stock_after: 105,
          transaction_at: '2026-07-28T10:00:00Z',
          is_reversed: false,
        },
      ]

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              if (table === 'categories') return Promise.resolve({ data: [{ id: 'cat-1', name: 'ATK' }], error: null })
              if (table === 'items') return Promise.resolve({ data: mockItems, error: null })
              if (table === 'stock_transactions') return Promise.resolve({ data: mockTxs, error: null })
              return Promise.resolve({ data: [], error: null })
            }),
          }
        }),
      } as unknown as SupabaseClient<Database>

      const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')
      const itemRes = reportData.categories[0]?.items[0]

      expect(itemRes).toBeDefined()
      expect(itemRes?.saldoAwalQty).toBe(100)
      // mutasiMasuk = IN(50) + ADJUSTMENT_IN(10) + REVERSAL_POS(30) = 90
      expect(itemRes?.mutasiMasuk).toBe(90)
      // mutasiKeluar = OUT(30) + ADJUSTMENT_OUT(5) + REVERSAL_NEG(50) = 85
      expect(itemRes?.mutasiKeluar).toBe(85)
      expect(itemRes?.mutasiJumlah).toBe(5) // 90 - 85 = 5
      expect(itemRes?.saldoAkhirQty).toBe(105) // 100 + 5 = 105
    })

    it('correctly handles active item with no transactions, inactive item with activity, and null category/unit relations', async () => {
      const mockItems = [
        {
          id: 'item-active-notx',
          sku: 'SKU-ACTIVE-0',
          name: 'Barang Aktif No Tx',
          current_stock: 0,
          is_active: true,
          category_id: null,
          base_unit_id: null,
          base_unit: null,
          categories: null,
        },
        {
          id: 'item-inactive-active',
          sku: 'SKU-INACTIVE-1',
          name: 'Barang Non-Aktif Ada Tx',
          current_stock: 10,
          is_active: false,
          category_id: null,
          base_unit_id: null,
          base_unit: null,
          categories: null,
        },
        {
          id: 'item-inactive-zero',
          sku: 'SKU-INACTIVE-0',
          name: 'Barang Non-Aktif No Tx Zero',
          current_stock: 0,
          is_active: false,
          category_id: null,
          base_unit_id: null,
          base_unit: null,
          categories: null,
        },
      ]

      const mockTxs = [
        {
          id: 'tx-inact-1',
          item_id: 'item-inactive-active',
          transaction_type: 'IN',
          base_quantity: 10,
          quantity_delta: 10,
          stock_before: 0,
          stock_after: 10,
          transaction_at: '2026-07-05T10:00:00Z',
          is_reversed: false,
        },
      ]

      const mockSupabase = {
        from: vi.fn().mockImplementation((table: string) => {
          if (table === 'app_settings') {
            return {
              select: vi.fn().mockReturnThis(),
              limit: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }
          }
          return {
            select: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            lt: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockImplementation(() => {
              if (table === 'categories') return Promise.resolve({ data: [], error: null })
              if (table === 'items') return Promise.resolve({ data: mockItems, error: null })
              if (table === 'stock_transactions') return Promise.resolve({ data: mockTxs, error: null })
              return Promise.resolve({ data: [], error: null })
            }),
          }
        }),
      } as unknown as SupabaseClient<Database>

      const reportData = await compileInventoryReportData(mockSupabase, '2026-07-01', '2026-07-31')
      const allItems = reportData.categories.flatMap((c) => c.items)

      // Active item with no tx included
      expect(allItems.some((i) => i.id === 'item-active-notx')).toBe(true)
      // Inactive item with activity included
      expect(allItems.some((i) => i.id === 'item-inactive-active')).toBe(true)
      // Inactive item with zero stock & no activity excluded
      expect(allItems.some((i) => i.id === 'item-inactive-zero')).toBe(false)

      // Null category & unit fallback check
      const itemActiveNoTx = allItems.find((i) => i.id === 'item-active-notx')
      expect(itemActiveNoTx?.categoryName).toBe('Tanpa Kategori')
      expect(itemActiveNoTx?.baseUnitSymbol).toBe('unit')
    })
  })
})
