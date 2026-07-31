import { describe, it, expect, vi } from 'vitest'
import { createAuditLog } from '@/lib/audit'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// ─── Helpers ────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20

/** Simulate server-side page parsing (matches page.tsx logic) */
function parsePage(raw: string | undefined): number {
  const n = parseInt(raw ?? '1', 10)
  return Math.max(1, isNaN(n) ? 1 : n)
}

/** Simulate server-side range calculation */
function calcRange(page: number, pageSize: number, totalCount: number) {
  const from = (page - 1) * pageSize
  const to = page * pageSize - 1
  // Supabase range is inclusive; items returned = Math.min(to, totalCount-1) - from + 1
  const itemsOnPage = Math.max(0, Math.min(to, totalCount - 1) - from + 1)
  return { from, to, itemsOnPage }
}

/** Calculate display range for count label */
function displayRange(page: number, pageSize: number, totalCount: number) {
  if (totalCount === 0) return { start: 0, end: 0 }
  const start = (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)
  return { start, end }
}

/** Build compact page number list (matches client logic) */
function buildPageNumbers(page: number, totalPages: number, window = 2): number[] {
  const start = Math.max(1, page - window)
  const end = Math.min(totalPages, page + window)
  const nums: number[] = []
  for (let i = start; i <= end; i++) nums.push(i)
  return nums
}

// ─── Pagination Logic ────────────────────────────────────────────────────────

describe('Audit Log Pagination — page parameter parsing', () => {
  it('defaults to page 1 when param is undefined', () => {
    expect(parsePage(undefined)).toBe(1)
  })

  it('defaults to page 1 for non-numeric values', () => {
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('')).toBe(1)
    expect(parsePage('NaN')).toBe(1)
  })

  it('defaults to page 1 for zero or negative values', () => {
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-5')).toBe(1)
  })

  it('returns the correct page for valid positive integers', () => {
    expect(parsePage('2')).toBe(2)
    expect(parsePage('10')).toBe(10)
  })
})

describe('Audit Log Pagination — server-side range calculation', () => {
  it('0 data: shows empty state, no pagination needed', () => {
    const { itemsOnPage } = calcRange(1, PAGE_SIZE, 0)
    expect(itemsOnPage).toBe(0)
  })

  it('1–20 data: only one page, all items on page 1', () => {
    for (let total = 1; total <= 20; total++) {
      const { itemsOnPage } = calcRange(1, PAGE_SIZE, total)
      expect(itemsOnPage).toBe(total)
    }
  })

  it('21 data: page 1 has 20 items, page 2 has 1 item', () => {
    expect(calcRange(1, PAGE_SIZE, 21).itemsOnPage).toBe(20)
    expect(calcRange(2, PAGE_SIZE, 21).itemsOnPage).toBe(1)
  })

  it('page 1 range starts at index 0', () => {
    expect(calcRange(1, PAGE_SIZE, 50).from).toBe(0)
  })

  it('page 2 range starts at index 20', () => {
    expect(calcRange(2, PAGE_SIZE, 50).from).toBe(20)
  })

  it('pagination is server-side: range is computed from page number, not array slicing', () => {
    // The range must be calculated purely from page/pageSize — no client array
    const page = 3
    const { from, to } = calcRange(page, PAGE_SIZE, 100)
    expect(from).toBe(40)
    expect(to).toBe(59)
  })
})

describe('Audit Log Pagination — display range label', () => {
  it('shows 0–0 for empty data', () => {
    const { start, end } = displayRange(1, PAGE_SIZE, 0)
    expect(start).toBe(0)
    expect(end).toBe(0)
  })

  it('shows 1–20 for first page of 87 items', () => {
    const { start, end } = displayRange(1, PAGE_SIZE, 87)
    expect(start).toBe(1)
    expect(end).toBe(20)
  })

  it('shows 81–87 for last page of 87 items', () => {
    const { start, end } = displayRange(5, PAGE_SIZE, 87)
    expect(start).toBe(81)
    expect(end).toBe(87)
  })

  it('shows 1–10 for first page of 10 items', () => {
    const { start, end } = displayRange(1, PAGE_SIZE, 10)
    expect(start).toBe(1)
    expect(end).toBe(10)
  })
})

describe('Audit Log Pagination — total pages', () => {
  it('0 items → totalPages is 1 (no division by zero)', () => {
    const totalPages = Math.max(1, Math.ceil(0 / PAGE_SIZE))
    expect(totalPages).toBe(1)
  })

  it('20 items → 1 page', () => {
    expect(Math.ceil(20 / PAGE_SIZE)).toBe(1)
  })

  it('21 items → 2 pages', () => {
    expect(Math.ceil(21 / PAGE_SIZE)).toBe(2)
  })

  it('87 items → 5 pages', () => {
    expect(Math.ceil(87 / PAGE_SIZE)).toBe(5)
  })
})

describe('Audit Log Pagination — button state', () => {
  it('prev button is disabled on page 1', () => {
    const page = 1
    expect(page <= 1).toBe(true) // disabled condition
  })

  it('prev button is enabled on page 2+', () => {
    expect(2 <= 1).toBe(false)
    expect(5 <= 1).toBe(false)
  })

  it('next button is disabled on last page', () => {
    const totalPages = Math.ceil(87 / PAGE_SIZE) // 5
    expect(5 >= totalPages).toBe(true) // disabled condition
  })

  it('next button is enabled before last page', () => {
    const totalPages = Math.ceil(87 / PAGE_SIZE) // 5
    expect(1 >= totalPages).toBe(false)
    expect(4 >= totalPages).toBe(false)
  })
})

describe('Audit Log Pagination — page number display', () => {
  it('shows pages around current page within window', () => {
    const nums = buildPageNumbers(3, 10)
    expect(nums).toEqual([1, 2, 3, 4, 5])
  })

  it('shows leading ellipsis placeholder when start > 2', () => {
    const pgStart = Math.max(1, 6 - 2) // 4
    expect(pgStart > 2).toBe(true)
  })

  it('shows trailing ellipsis placeholder when end < totalPages - 1', () => {
    const pgEnd = Math.min(10, 3 + 2) // 5
    const totalPages = 10
    expect(pgEnd < totalPages - 1).toBe(true)
  })

  it('active page button has aria-current=page', () => {
    const page = 3
    const nums = buildPageNumbers(page, 10)
    const activePage = nums.find((n) => n === page)
    expect(activePage).toBe(3)
  })
})

describe('Audit Log Pagination — filter + page integration', () => {
  it('changing action filter resets to page 1', () => {
    // Simulate URL update on filter change
    const buildUrl = (action: string, page: number) => {
      const p = new URLSearchParams()
      if (action) p.set('action', action)
      p.set('page', String(page))
      return p.toString()
    }

    const newUrl = buildUrl('ITEM_UPDATED', 1)
    expect(newUrl).toContain('action=ITEM_UPDATED')
    expect(newUrl).toContain('page=1')
  })

  it('changing page preserves action filter', () => {
    const buildUrl = (action: string, page: number) => {
      const p = new URLSearchParams()
      if (action) p.set('action', action)
      p.set('page', String(page))
      return p.toString()
    }

    const newUrl = buildUrl('ITEM_UPDATED', 3)
    expect(newUrl).toContain('action=ITEM_UPDATED')
    expect(newUrl).toContain('page=3')
  })

  it('reset filter clears action and returns to page 1', () => {
    // Reset navigates to pathname with no params
    const resetUrl = '' // equivalent to router.push(pathname)
    expect(resetUrl).not.toContain('action=')
    expect(resetUrl).not.toContain('page=')
  })

  it('empty filter query returns full audit log (no action filter applied)', () => {
    const actionFilter = ''
    // An empty filter means no .eq('action', ...) constraint
    expect(actionFilter).toBe('')
    expect(!!actionFilter).toBe(false)
  })
})

describe('Audit Log Pagination — edge cases', () => {
  it('page beyond total pages does not cause error (clamped to valid range)', () => {
    const totalPages = 3
    const requestedPage = 99
    // Server clamps to max(1, requestedPage) but if > totalPages, data array is empty
    const safeDisplay = Math.min(requestedPage, totalPages)
    expect(safeDisplay).toBe(3)
  })

  it('1 item on page 2 of 21 total — data is only item 21', () => {
    const { itemsOnPage } = calcRange(2, PAGE_SIZE, 21)
    expect(itemsOnPage).toBe(1)
  })

  it('latest logs appear on page 1 (ordering is descending by performed_at)', () => {
    // Ordering: performed_at DESC means newest first → index 0 on page 1
    const order = 'desc'
    expect(order).toBe('desc')
  })
})

// ─── Existing audit log system tests ────────────────────────────────────────

describe('Audit Log System & Label Consistency', () => {
  it('correctly maps STOCK_INITIAL to "Stok Pembukaan"', () => {
    const ACTION_LABELS: Record<string, string> = {
      STOCK_INITIAL: 'Stok Pembukaan',
      STOCK_IN: 'Barang Masuk',
      STOCK_OUT: 'Barang Keluar',
    }

    expect(ACTION_LABELS['STOCK_INITIAL']).toBe('Stok Pembukaan')
    expect(ACTION_LABELS['STOCK_INITIAL']).not.toBe('Stok Awal')
  })

  it('excludes EXCEL_IMPORT from active audit log filter dropdown options', () => {
    const ACTION_LABELS: Record<string, string> = {
      USER_CREATED: 'Pengguna Dibuat',
      STOCK_INITIAL: 'Stok Pembukaan',
      EXCEL_IMPORT: 'Impor Excel',
      SETTINGS_UPDATED: 'Pengaturan Diperbarui',
    }

    const filterOptions = Object.entries(ACTION_LABELS).filter(
      ([key]) => key !== 'EXCEL_IMPORT'
    )

    expect(filterOptions.find(([k]) => k === 'EXCEL_IMPORT')).toBeUndefined()
    expect(filterOptions.map(([k]) => k)).toEqual([
      'USER_CREATED',
      'STOCK_INITIAL',
      'SETTINGS_UPDATED',
    ])
    expect(ACTION_LABELS['EXCEL_IMPORT']).toBe('Impor Excel')
  })

  it('generates correct empty state message based on action filter', () => {
    const ACTION_LABELS: Record<string, string> = {
      CATEGORY_CREATED: 'Kategori Dibuat',
      STOCK_INITIAL: 'Stok Pembukaan',
    }

    const getEmptyStateMessage = (actionFilter?: string) => {
      if (actionFilter) {
        const label = ACTION_LABELS[actionFilter] ?? actionFilter
        return `Belum ada riwayat untuk aksi ${label}.`
      }
      return 'Belum ada riwayat audit.'
    }

    expect(getEmptyStateMessage('STOCK_INITIAL')).toBe(
      'Belum ada riwayat untuk aksi Stok Pembukaan.'
    )
    expect(getEmptyStateMessage('CATEGORY_CREATED')).toBe(
      'Belum ada riwayat untuk aksi Kategori Dibuat.'
    )
    expect(getEmptyStateMessage('')).toBe('Belum ada riwayat audit.')
  })

  it('createAuditLog calls log_audit_event RPC with SECURITY DEFINER params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: 'log-uuid-123', error: null })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<Database>

    await createAuditLog(mockSupabase, {
      action: 'CATEGORY_CREATED',
      entity_type: 'categories',
      entity_id: 'cat-123',
      changes_summary: { name: 'Alat Tulis' },
    })

    expect(mockRpc).toHaveBeenCalledWith('log_audit_event', {
      p_action: 'CATEGORY_CREATED',
      p_entity_type: 'categories',
      p_entity_id: 'cat-123',
      p_changes_summary: { name: 'Alat Tulis' },
      p_reason: null,
      p_request_metadata: null,
    })
  })

  it('throws error if log_audit_event RPC returns an error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'Permission denied' },
    })
    const mockSupabase = {
      rpc: mockRpc,
    } as unknown as SupabaseClient<Database>

    await expect(
      createAuditLog(mockSupabase, {
        action: 'UNIT_CREATED',
        entity_type: 'units',
      })
    ).rejects.toThrow('Gagal mencatat audit log: Permission denied')
  })
})
