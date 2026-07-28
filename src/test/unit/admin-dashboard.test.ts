/**
 * Unit tests for src/lib/dashboard/admin-dashboard.ts
 *
 * Tests cover:
 *  1. normalizeDashboardStockFilter      — valid filters preserved, invalid → ATTENTION
 *  2. normalizeDashboardActivityPeriod   — valid periods preserved, invalid → week (default)
 *  3. sanitizeDashboardSearch            — dangerous chars removed, normal names intact
 *  4. getJakartaDashboardRange           — date bounds follow WIB calendar
 *  5. getJakartaActivityRange            — query bounds by period (week/month/year)
 *  6. buildDailyTransactionSeries        — IN/OUT bucketed by day, invalid rows ignored
 *  7. buildWeeklyTransactionSeries       — IN/OUT bucketed by fixed week, month boundary
 *  8. buildMonthlyTransactionSeries      — IN/OUT bucketed by month, all 12 present
 *  9. summarizeInventoryValue            — valid values summed, invalid reported & skipped
 * 10. summarizeTotalStock                — sums current_stock from active items
 */

import { describe, it, expect } from 'vitest'
import {
  normalizeDashboardStockFilter,
  normalizeDashboardActivityPeriod,
  sanitizeDashboardSearch,
  getJakartaDashboardRange,
  getJakartaActivityRange,
  buildDailyTransactionSeries,
  buildWeeklyTransactionSeries,
  buildMonthlyTransactionSeries,
  summarizeInventoryValue,
  summarizeTotalStock,
  JAKARTA_TIME_ZONE,
} from '@/lib/dashboard/admin-dashboard'

// ── normalizeDashboardStockFilter ──────────────────────────────────────────────

describe('normalizeDashboardStockFilter', () => {
  it('preserves valid filter ATTENTION', () => {
    expect(normalizeDashboardStockFilter('ATTENTION')).toBe('ATTENTION')
  })

  it('preserves valid filter ALL', () => {
    expect(normalizeDashboardStockFilter('ALL')).toBe('ALL')
  })

  it('preserves valid filter AMAN', () => {
    expect(normalizeDashboardStockFilter('AMAN')).toBe('AMAN')
  })

  it('preserves valid filter HAMPIR_HABIS', () => {
    expect(normalizeDashboardStockFilter('HAMPIR_HABIS')).toBe('HAMPIR_HABIS')
  })

  it('preserves valid filter HABIS', () => {
    expect(normalizeDashboardStockFilter('HABIS')).toBe('HABIS')
  })

  it('falls back to ATTENTION for empty string', () => {
    expect(normalizeDashboardStockFilter('')).toBe('ATTENTION')
  })

  it('falls back to ATTENTION for undefined', () => {
    expect(normalizeDashboardStockFilter(undefined)).toBe('ATTENTION')
  })

  it('falls back to ATTENTION for null', () => {
    expect(normalizeDashboardStockFilter(null)).toBe('ATTENTION')
  })

  it('falls back to ATTENTION for unknown value', () => {
    expect(normalizeDashboardStockFilter('PERLU_PERHATIAN')).toBe('ATTENTION')
  })

  it('is case-sensitive — lowercase variant falls back to ATTENTION', () => {
    expect(normalizeDashboardStockFilter('aman')).toBe('ATTENTION')
  })
})

// ── normalizeDashboardActivityPeriod ──────────────────────────────────────────

describe('normalizeDashboardActivityPeriod', () => {
  it('default period is week for empty string', () => {
    expect(normalizeDashboardActivityPeriod('')).toBe('week')
  })

  it('default period is week for undefined', () => {
    expect(normalizeDashboardActivityPeriod(undefined)).toBe('week')
  })

  it('default period is week for null', () => {
    expect(normalizeDashboardActivityPeriod(null)).toBe('week')
  })

  it('default period is week for invalid value', () => {
    expect(normalizeDashboardActivityPeriod('daily')).toBe('week')
    expect(normalizeDashboardActivityPeriod('7days')).toBe('week')
    expect(normalizeDashboardActivityPeriod('Week')).toBe('week') // case-sensitive
  })

  it('preserves valid period week', () => {
    expect(normalizeDashboardActivityPeriod('week')).toBe('week')
  })

  it('preserves valid period month', () => {
    expect(normalizeDashboardActivityPeriod('month')).toBe('month')
  })

  it('preserves valid period year', () => {
    expect(normalizeDashboardActivityPeriod('year')).toBe('year')
  })
})

// ── sanitizeDashboardSearch ────────────────────────────────────────────────────

describe('sanitizeDashboardSearch', () => {
  it('returns empty string for undefined', () => {
    expect(sanitizeDashboardSearch(undefined)).toBe('')
  })

  it('returns empty string for null', () => {
    expect(sanitizeDashboardSearch(null)).toBe('')
  })

  it('strips percent sign', () => {
    expect(sanitizeDashboardSearch('Le%Mineral')).toBe('LeMineral')
    expect(sanitizeDashboardSearch('abc%def')).toBe('abcdef')
  })

  it('strips commas', () => {
    expect(sanitizeDashboardSearch('Pensil,Pena')).toBe('PensilPena')
  })

  it("strips single and double quotes", () => {
    expect(sanitizeDashboardSearch("It's")).toBe('Its')
    expect(sanitizeDashboardSearch('"quoted"')).toBe('quoted')
  })

  it('strips parentheses', () => {
    expect(sanitizeDashboardSearch('name(test)')).toBe('nametest')
  })

  it('collapses double spaces to single', () => {
    expect(sanitizeDashboardSearch('Pensil  Tes')).toBe('Pensil Tes')
  })

  it('trims leading and trailing whitespace', () => {
    expect(sanitizeDashboardSearch('  Le Mineral  ')).toBe('Le Mineral')
  })

  it('caps result at 80 characters', () => {
    const long = 'a'.repeat(100)
    expect(sanitizeDashboardSearch(long)).toHaveLength(80)
  })

  it('leaves normal item name intact', () => {
    expect(sanitizeDashboardSearch('Aqua Botol 600ml')).toBe('Aqua Botol 600ml')
  })

  it('leaves SKU intact', () => {
    expect(sanitizeDashboardSearch('ATK-0001')).toBe('ATK-0001')
  })

  it('handles combined dangerous chars', () => {
    expect(sanitizeDashboardSearch('%test(name,"foo")')).toBe('testnamefoo')
  })
})

// ── getJakartaDashboardRange ───────────────────────────────────────────────────

describe('getJakartaDashboardRange', () => {
  it('returns ISO strings for monthStartIso, chartStartIso, and nowIso', () => {
    const now = new Date('2026-07-15T05:00:00Z') // 12:00 WIB
    const range = getJakartaDashboardRange(now, 7)
    expect(range.monthStartIso).toBeDefined()
    expect(range.chartStartIso).toBeDefined()
    expect(range.nowIso).toBeDefined()
  })

  it('monthStartIso represents first day of WIB month at midnight', () => {
    const now = new Date('2026-07-15T05:00:00Z')
    const { monthStartIso } = getJakartaDashboardRange(now)
    expect(monthStartIso).toMatch(/^2026-07-01T00:00:00/)
  })

  it('chartStartIso for 7 days includes today as the 7th day', () => {
    const now = new Date('2026-07-15T05:00:00Z')
    const { chartStartIso } = getJakartaDashboardRange(now, 7)
    expect(chartStartIso).toMatch(/^2026-07-09T00:00:00/)
  })

  it('chartStartIso for 1 day = today midnight in WIB', () => {
    const now = new Date('2026-07-15T05:00:00Z')
    const { chartStartIso } = getJakartaDashboardRange(now, 1)
    expect(chartStartIso).toMatch(/^2026-07-15T00:00:00/)
  })

  it('JAKARTA_TIME_ZONE equals Asia/Jakarta', () => {
    expect(JAKARTA_TIME_ZONE).toBe('Asia/Jakarta')
  })
})

// ── getJakartaActivityRange ────────────────────────────────────────────────────

describe('getJakartaActivityRange', () => {
  // Reference: 2026-07-15 12:00 WIB
  const referenceDate = new Date('2026-07-15T05:00:00Z')

  it('week period: start is today minus 6 days at midnight WIB', () => {
    const { startIso } = getJakartaActivityRange('week', referenceDate)
    expect(startIso).toMatch(/^2026-07-09T00:00:00/)
  })

  it('month period: start is 1st of current WIB month at midnight', () => {
    const { startIso } = getJakartaActivityRange('month', referenceDate)
    expect(startIso).toMatch(/^2026-07-01T00:00:00/)
  })

  it('year period: start is 1 January of current WIB year at midnight', () => {
    const { startIso } = getJakartaActivityRange('year', referenceDate)
    expect(startIso).toMatch(/^2026-01-01T00:00:00/)
  })

  it('endIso is always the reference date', () => {
    const { endIso: weekEnd } = getJakartaActivityRange('week', referenceDate)
    const { endIso: monthEnd } = getJakartaActivityRange('month', referenceDate)
    const { endIso: yearEnd } = getJakartaActivityRange('year', referenceDate)
    expect(weekEnd).toMatch(/^2026-07-15/)
    expect(monthEnd).toMatch(/^2026-07-15/)
    expect(yearEnd).toMatch(/^2026-07-15/)
  })

  it('week period on the 1st of a month starts the previous month', () => {
    const firstOfMonth = new Date('2026-07-01T05:00:00Z') // 12:00 WIB on July 1
    const { startIso } = getJakartaActivityRange('week', firstOfMonth)
    expect(startIso).toMatch(/^2026-06-25T00:00:00/)
  })
})

// ── buildDailyTransactionSeries ────────────────────────────────────────────────

describe('buildDailyTransactionSeries', () => {
  const referenceDate = new Date('2026-07-15T05:00:00Z') // 12:00 WIB

  it('returns 7 points for 7-day window', () => {
    const series = buildDailyTransactionSeries([], referenceDate, 7)
    expect(series).toHaveLength(7)
  })

  it('all points have 0 values when no rows provided', () => {
    const series = buildDailyTransactionSeries([], referenceDate, 7)
    for (const point of series) {
      expect(point.incoming).toBe(0)
      expect(point.outgoing).toBe(0)
      expect(point.total).toBe(0)
    }
  })

  it('date keys cover the expected WIB range in order', () => {
    const series = buildDailyTransactionSeries([], referenceDate, 7)
    expect(series[0]!.dateKey).toBe('2026-07-09')
    expect(series[6]!.dateKey).toBe('2026-07-15')
  })

  it('each point has a non-empty label', () => {
    const series = buildDailyTransactionSeries([], referenceDate, 7)
    for (const point of series) {
      expect(point.label.length).toBeGreaterThan(0)
    }
  })

  it('counts positive quantity_delta as incoming', () => {
    const rows = [
      { transaction_at: '2026-07-15T05:00:00Z', quantity_delta: 10 },
      { transaction_at: '2026-07-15T06:00:00Z', quantity_delta: 5 },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    const today = series.find((p) => p.dateKey === '2026-07-15')!
    expect(today.incoming).toBe(2)
    expect(today.outgoing).toBe(0)
    expect(today.total).toBe(2)
  })

  it('counts negative quantity_delta as outgoing', () => {
    const rows = [
      { transaction_at: '2026-07-14T10:00:00Z', quantity_delta: -3 },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    const point = series.find((p) => p.dateKey === '2026-07-14')!
    expect(point.incoming).toBe(0)
    expect(point.outgoing).toBe(1)
    expect(point.total).toBe(1)
  })

  it('ignores rows with quantity_delta === 0', () => {
    const rows = [
      { transaction_at: '2026-07-15T05:00:00Z', quantity_delta: 0 },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    const today = series.find((p) => p.dateKey === '2026-07-15')!
    expect(today.total).toBe(0)
  })

  it('ignores rows with invalid transaction_at', () => {
    const rows = [
      { transaction_at: 'not-a-date', quantity_delta: 5 },
      { transaction_at: '', quantity_delta: 3 },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    expect(series.reduce((s, p) => s + p.total, 0)).toBe(0)
  })

  it('ignores rows outside the date window — days without transactions remain 0', () => {
    const rows = [
      { transaction_at: '2026-07-01T05:00:00Z', quantity_delta: 10 },
      { transaction_at: '2026-07-20T05:00:00Z', quantity_delta: 5 },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    expect(series.reduce((s, p) => s + p.total, 0)).toBe(0)
  })

  it('correctly buckets transactions by WIB calendar date across midnight boundary', () => {
    const rows = [
      { transaction_at: '2026-07-09T18:00:00Z', quantity_delta: 1 }, // WIB: 2026-07-10 01:00
      { transaction_at: '2026-07-09T16:00:00Z', quantity_delta: 1 }, // WIB: 2026-07-09 23:00
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    const jul09 = series.find((p) => p.dateKey === '2026-07-09')!
    const jul10 = series.find((p) => p.dateKey === '2026-07-10')!
    expect(jul09.incoming).toBe(1)
    expect(jul10.incoming).toBe(1)
  })

  it('handles quantity_delta as string numeric', () => {
    const rows = [
      { transaction_at: '2026-07-15T05:00:00Z', quantity_delta: '7' as unknown as number },
      { transaction_at: '2026-07-15T06:00:00Z', quantity_delta: '-2' as unknown as number },
    ]
    const series = buildDailyTransactionSeries(rows, referenceDate, 7)
    const today = series.find((p) => p.dateKey === '2026-07-15')!
    expect(today.incoming).toBe(1)
    expect(today.outgoing).toBe(1)
  })
})

// ── buildWeeklyTransactionSeries ───────────────────────────────────────────────

describe('buildWeeklyTransactionSeries', () => {
  // July 2026 has 31 days → 5 week buckets
  const referenceDate = new Date('2026-07-15T05:00:00Z') // WIB: July 15

  it('returns 5 week buckets for a 31-day month', () => {
    const series = buildWeeklyTransactionSeries([], referenceDate)
    expect(series).toHaveLength(5)
  })

  it('week labels are 1–7, 8–14, 15–21, 22–28, 29–31', () => {
    const series = buildWeeklyTransactionSeries([], referenceDate)
    expect(series[0]!.label).toBe('1–7')
    expect(series[1]!.label).toBe('8–14')
    expect(series[2]!.label).toBe('15–21')
    expect(series[3]!.label).toBe('22–28')
    expect(series[4]!.label).toBe('29–31')
  })

  it('returns 4 week buckets for February (28-day month)', () => {
    // 2026-02-15 — February has 28 days
    const febRef = new Date('2026-02-15T05:00:00Z')
    const series = buildWeeklyTransactionSeries([], febRef)
    expect(series).toHaveLength(4)
    expect(series[3]!.label).toBe('22–28')
  })

  it('all buckets have 0 counts when no rows', () => {
    const series = buildWeeklyTransactionSeries([], referenceDate)
    for (const b of series) {
      expect(b.incoming).toBe(0)
      expect(b.outgoing).toBe(0)
      expect(b.total).toBe(0)
    }
  })

  it('buckets rows on day 1–7 into week 1', () => {
    const rows = [
      { transaction_at: '2026-07-03T05:00:00Z', quantity_delta: 5 }, // WIB July 3 → week 1
      { transaction_at: '2026-07-07T05:00:00Z', quantity_delta: -2 }, // WIB July 7 → week 1
    ]
    const series = buildWeeklyTransactionSeries(rows, referenceDate)
    const week1 = series.find((b) => b.weekNumber === 1)!
    expect(week1.incoming).toBe(1)
    expect(week1.outgoing).toBe(1)
    expect(week1.total).toBe(2)
  })

  it('buckets rows on day 29+ into week 5', () => {
    const rows = [
      { transaction_at: '2026-07-31T05:00:00Z', quantity_delta: 3 }, // WIB July 31 → week 5
    ]
    const series = buildWeeklyTransactionSeries(rows, referenceDate)
    const week5 = series.find((b) => b.weekNumber === 5)!
    expect(week5.incoming).toBe(1)
  })

  it('ignores rows from other months', () => {
    const rows = [
      { transaction_at: '2026-06-30T05:00:00Z', quantity_delta: 10 }, // June 30 — not July
      { transaction_at: '2026-08-01T05:00:00Z', quantity_delta: 5 },  // August 1 — not July
    ]
    const series = buildWeeklyTransactionSeries(rows, referenceDate)
    expect(series.reduce((s, b) => s + b.total, 0)).toBe(0)
  })

  it('ignores rows with invalid dates', () => {
    const rows = [
      { transaction_at: 'invalid', quantity_delta: 5 },
    ]
    const series = buildWeeklyTransactionSeries(rows, referenceDate)
    expect(series.reduce((s, b) => s + b.total, 0)).toBe(0)
  })
})

// ── buildMonthlyTransactionSeries ─────────────────────────────────────────────

describe('buildMonthlyTransactionSeries', () => {
  const referenceDate = new Date('2026-07-15T05:00:00Z') // WIB: July 2026

  it('always returns 12 month buckets', () => {
    const series = buildMonthlyTransactionSeries([], referenceDate)
    expect(series).toHaveLength(12)
  })

  it('months are labelled Jan through Des (Indonesian)', () => {
    const series = buildMonthlyTransactionSeries([], referenceDate)
    expect(series[0]!.label).toBe('Jan')
    expect(series[6]!.label).toBe('Jul')
    expect(series[11]!.label).toBe('Des')
  })

  it('all months have 0 counts when no rows', () => {
    const series = buildMonthlyTransactionSeries([], referenceDate)
    for (const b of series) {
      expect(b.incoming).toBe(0)
      expect(b.outgoing).toBe(0)
      expect(b.total).toBe(0)
    }
  })

  it('buckets transactions into correct month', () => {
    const rows = [
      { transaction_at: '2026-01-10T05:00:00Z', quantity_delta: 5 },  // Jan
      { transaction_at: '2026-03-20T05:00:00Z', quantity_delta: -2 }, // Mar
      { transaction_at: '2026-07-01T05:00:00Z', quantity_delta: 8 },  // Jul
    ]
    const series = buildMonthlyTransactionSeries(rows, referenceDate)
    expect(series[0]!.incoming).toBe(1)  // Jan
    expect(series[2]!.outgoing).toBe(1)  // Mar
    expect(series[6]!.incoming).toBe(1)  // Jul
  })

  it('months without transactions have total 0', () => {
    const rows = [
      { transaction_at: '2026-01-10T05:00:00Z', quantity_delta: 5 },
    ]
    const series = buildMonthlyTransactionSeries(rows, referenceDate)
    // All months except Jan should be 0
    for (let i = 1; i < 12; i++) {
      expect(series[i]!.total).toBe(0)
    }
  })

  it('ignores rows from other years', () => {
    const rows = [
      { transaction_at: '2025-12-31T05:00:00Z', quantity_delta: 10 },
      { transaction_at: '2027-01-01T05:00:00Z', quantity_delta: 5 },
    ]
    const series = buildMonthlyTransactionSeries(rows, referenceDate)
    expect(series.reduce((s, b) => s + b.total, 0)).toBe(0)
  })

  it('month index 0 = January, 11 = December', () => {
    const series = buildMonthlyTransactionSeries([], referenceDate)
    expect(series[0]!.monthIndex).toBe(0)
    expect(series[11]!.monthIndex).toBe(11)
  })
})

// ── summarizeInventoryValue ────────────────────────────────────────────────────

describe('summarizeInventoryValue', () => {
  it('returns 0 total and 0 rows for empty array', () => {
    const result = summarizeInventoryValue([])
    expect(result.total).toBe(0)
    expect(result.validRows).toBe(0)
    expect(result.invalidRows).toBe(0)
  })

  it('sums valid numeric values', () => {
    const result = summarizeInventoryValue([
      { inventory_value: 100000 },
      { inventory_value: 250000 },
    ])
    expect(result.total).toBe(350000)
    expect(result.validRows).toBe(2)
  })

  it('sums valid string-numeric values', () => {
    const result = summarizeInventoryValue([
      { inventory_value: '500000.50' },
      { inventory_value: '250000' },
    ])
    expect(result.total).toBeCloseTo(750000.5)
    expect(result.validRows).toBe(2)
  })

  it('skips null inventory_value and counts as invalid', () => {
    const result = summarizeInventoryValue([
      { inventory_value: null },
      { inventory_value: 100000 },
    ])
    expect(result.total).toBe(100000)
    expect(result.validRows).toBe(1)
    expect(result.invalidRows).toBe(1)
  })

  it('skips negative values and counts as invalid', () => {
    const result = summarizeInventoryValue([
      { inventory_value: -500 },
      { inventory_value: 1000 },
    ])
    expect(result.total).toBe(1000)
    expect(result.invalidRows).toBe(1)
  })

  it('skips NaN and counts as invalid', () => {
    const result = summarizeInventoryValue([
      { inventory_value: 'not-a-number' },
      { inventory_value: 2000 },
    ])
    expect(result.total).toBe(2000)
    expect(result.invalidRows).toBe(1)
  })

  it('handles mixed valid and invalid rows correctly', () => {
    const result = summarizeInventoryValue([
      { inventory_value: '1000' },
      { inventory_value: null },
      { inventory_value: -99 },
      { inventory_value: 'bad' },
      { inventory_value: 5000 },
    ])
    expect(result.total).toBe(6000)
    expect(result.validRows).toBe(2)
    expect(result.invalidRows).toBe(3)
  })
})

// ── summarizeTotalStock ────────────────────────────────────────────────────────

describe('summarizeTotalStock', () => {
  it('returns 0 for empty array', () => {
    expect(summarizeTotalStock([])).toBe(0)
  })

  it('sums numeric current_stock values', () => {
    expect(summarizeTotalStock([
      { current_stock: 100 },
      { current_stock: 50 },
      { current_stock: 25 },
    ])).toBe(175)
  })

  it('sums string-numeric current_stock values', () => {
    expect(summarizeTotalStock([
      { current_stock: '200' },
      { current_stock: '75' },
    ])).toBe(275)
  })

  it('skips null values', () => {
    expect(summarizeTotalStock([
      { current_stock: null },
      { current_stock: 50 },
    ])).toBe(50)
  })

  it('skips undefined values', () => {
    expect(summarizeTotalStock([
      { current_stock: undefined },
      { current_stock: 30 },
    ])).toBe(30)
  })

  it('skips negative values', () => {
    expect(summarizeTotalStock([
      { current_stock: -10 },
      { current_stock: 80 },
    ])).toBe(80)
  })

  it('skips NaN (non-numeric string)', () => {
    expect(summarizeTotalStock([
      { current_stock: 'bad' },
      { current_stock: 40 },
    ])).toBe(40)
  })

  it('includes zero stock items (0 is valid)', () => {
    expect(summarizeTotalStock([
      { current_stock: 0 },
      { current_stock: 50 },
    ])).toBe(50)
  })

  it('only sums from active items (caller responsibility — test verifies correct sum)', () => {
    // The function sums whatever is passed — active-only filtering is the caller's job
    expect(summarizeTotalStock([
      { current_stock: 100, is_active: true },
      { current_stock: 200, is_active: true },
    ])).toBe(300)
  })
})
