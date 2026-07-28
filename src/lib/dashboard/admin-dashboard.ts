/**
 * Admin Dashboard helpers.
 *
 * Provides:
 *  - JAKARTA_TIME_ZONE constant
 *  - normalizeDashboardStockFilter   — sanitise & validate stock filter param
 *  - normalizeDashboardActivityPeriod — sanitise & validate activityPeriod param
 *  - sanitizeDashboardSearch         — clean free-text search to prevent PostgREST injection
 *  - getJakartaDashboardRange        — compute ISO-8601 date bounds in WIB
 *  - getJakartaActivityRange         — compute activity chart query bounds by period
 *  - buildDailyTransactionSeries     — bucket raw transaction rows by WIB day (7 days)
 *  - buildWeeklyTransactionSeries    — bucket raw transaction rows by week within the current month
 *  - buildMonthlyTransactionSeries   — bucket raw transaction rows by calendar month (year view)
 *  - summarizeInventoryValue         — sum valid inventory_value fields
 *  - summarizeTotalStock             — sum current_stock from active items
 *
 * No side effects; all functions are pure / deterministic.
 */

import { formatInTimeZone, toZonedTime } from 'date-fns-tz'
import {
  startOfMonth,
  subDays,
  startOfDay,
  startOfYear,
  getDaysInMonth,
} from 'date-fns'

// ── Constants ──────────────────────────────────────────────────────────────────

export const JAKARTA_TIME_ZONE = 'Asia/Jakarta'

// ── Types ──────────────────────────────────────────────────────────────────────

/**
 * Valid stock filter values accepted by the dashboard.
 * - ATTENTION : perlu perhatian (HABIS + HAMPIR_HABIS) — default
 * - ALL       : all statuses
 * - AMAN      : safe stock
 * - HAMPIR_HABIS : low stock
 * - HABIS     : out of stock
 */
export type DashboardStockFilter = 'ATTENTION' | 'ALL' | 'AMAN' | 'HAMPIR_HABIS' | 'HABIS'

/**
 * Activity period values for the chart segmented control.
 * - week  : 7 calendar days ending today (default)
 * - month : 1st of current month to today, grouped by week
 * - year  : 1 January to today, grouped by month
 */
export type DashboardActivityPeriod = 'week' | 'month' | 'year'

const VALID_STOCK_FILTERS: ReadonlySet<string> = new Set<DashboardStockFilter>([
  'ATTENTION',
  'ALL',
  'AMAN',
  'HAMPIR_HABIS',
  'HABIS',
])

const VALID_ACTIVITY_PERIODS: ReadonlySet<string> = new Set<DashboardActivityPeriod>([
  'week',
  'month',
  'year',
])

export interface DailyTransactionPoint {
  dateKey: string  // YYYY-MM-DD in WIB
  label: string    // human-readable label (e.g. "Sel 28 Jul" or "Minggu 1" or "Jan")
  incoming: number // count of positive quantity_delta rows
  outgoing: number // count of negative quantity_delta rows
  total: number    // incoming + outgoing
}

export interface InventoryValueSummary {
  total: number
  validRows: number
  invalidRows: number
}

export interface DashboardRange {
  /** ISO string for first moment of this calendar month in WIB (UTC-stored) */
  monthStartIso: string
  /** ISO string for start of the 7-day chart window in WIB */
  chartStartIso: string
  /** ISO string representing the reference time */
  nowIso: string
}

export interface ActivityRange {
  /** ISO string for the start of the query window */
  startIso: string
  /** ISO string for the end of the query window (now) */
  endIso: string
}

// ── normalizeDashboardStockFilter ──────────────────────────────────────────────

/**
 * Validate and return a canonical DashboardStockFilter.
 * Falls back to 'ATTENTION' for any unknown / empty value.
 */
export function normalizeDashboardStockFilter(
  raw: string | undefined | null,
): DashboardStockFilter {
  if (raw && VALID_STOCK_FILTERS.has(raw)) {
    return raw as DashboardStockFilter
  }
  return 'ATTENTION'
}

// ── normalizeDashboardActivityPeriod ──────────────────────────────────────────

/**
 * Validate and return a canonical DashboardActivityPeriod.
 * Falls back to 'week' for any unknown / empty value.
 */
export function normalizeDashboardActivityPeriod(
  raw: string | undefined | null,
): DashboardActivityPeriod {
  if (raw && VALID_ACTIVITY_PERIODS.has(raw)) {
    return raw as DashboardActivityPeriod
  }
  return 'week'
}

// ── sanitizeDashboardSearch ────────────────────────────────────────────────────

/**
 * Strip characters that could break PostgREST ilike patterns or cause
 * unintended query behaviour:
 *   - % (PostgREST wildcard)
 *   - , (parameter separator)
 *   - ' " (string delimiters)
 *   - ( ) (function-call notation)
 *
 * After stripping, collapse repeated spaces, trim, and cap at 80 characters.
 * Normal item names and SKU codes (letters, digits, hyphens, underscores,
 * dots, spaces) are preserved as-is.
 */
export function sanitizeDashboardSearch(raw: string | undefined | null): string {
  if (!raw) return ''
  return raw
    .replace(/[%,'"()]/g, '')   // remove dangerous chars
    .replace(/\s{2,}/g, ' ')    // collapse whitespace
    .trim()
    .slice(0, 80)
}

// ── getJakartaDashboardRange ───────────────────────────────────────────────────

/**
 * Compute ISO date/time strings used for dashboard Supabase queries.
 *
 * @param referenceDate – the current moment (injectable for testing)
 * @param chartDays     – number of calendar days in the activity chart (default 7)
 *
 * Returns three ISO strings suitable for .gte() / .lte() Supabase filters.
 * All bounds are calculated in WIB (UTC+7) and converted to UTC for storage.
 */
export function getJakartaDashboardRange(
  referenceDate: Date = new Date(),
  chartDays = 7,
): DashboardRange {
  const jakartaNow = toZonedTime(referenceDate, JAKARTA_TIME_ZONE)
  const monthStartJakarta = startOfMonth(jakartaNow)
  const todayStartJakarta = startOfDay(jakartaNow)
  const chartStartJakarta = subDays(todayStartJakarta, chartDays - 1)

  const monthStartIso = formatInTimeZone(
    monthStartJakarta,
    JAKARTA_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  )
  const chartStartIso = formatInTimeZone(
    chartStartJakarta,
    JAKARTA_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  )
  const nowIso = formatInTimeZone(
    referenceDate,
    JAKARTA_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  )

  return { monthStartIso, chartStartIso, nowIso }
}

// ── getJakartaActivityRange ────────────────────────────────────────────────────

/**
 * Compute the ISO date/time query bounds for the activity chart based on period.
 *
 * - week  : today - 6 days → now
 * - month : 1st of current WIB month at 00:00 → now
 * - year  : 1 January of current WIB year at 00:00 → now
 */
export function getJakartaActivityRange(
  period: DashboardActivityPeriod,
  referenceDate: Date = new Date(),
): ActivityRange {
  const jakartaNow = toZonedTime(referenceDate, JAKARTA_TIME_ZONE)
  const todayStartJakarta = startOfDay(jakartaNow)

  let startJakarta: Date
  switch (period) {
    case 'month':
      startJakarta = startOfMonth(jakartaNow)
      break
    case 'year':
      startJakarta = startOfYear(jakartaNow)
      break
    case 'week':
    default:
      startJakarta = subDays(todayStartJakarta, 6)
      break
  }

  const startIso = formatInTimeZone(
    startJakarta,
    JAKARTA_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  )
  const endIso = formatInTimeZone(
    referenceDate,
    JAKARTA_TIME_ZONE,
    "yyyy-MM-dd'T'HH:mm:ssxxx",
  )

  return { startIso, endIso }
}

// ── Shared internal types ──────────────────────────────────────────────────────

interface RawTransactionRow {
  transaction_at: string
  quantity_delta: number | string | null | undefined
}

/**
 * Parse a raw row's transaction_at and return its WIB date string (YYYY-MM-DD),
 * or null if unparseable.
 */
function parseWibDateKey(transactionAt: string): string | null {
  if (!transactionAt) return null
  try {
    const d = new Date(transactionAt)
    if (isNaN(d.getTime())) return null
    return formatInTimeZone(d, JAKARTA_TIME_ZONE, 'yyyy-MM-dd')
  } catch {
    return null
  }
}

/**
 * Parse quantity_delta to a number, returning null if invalid or zero.
 */
function parseDelta(raw: number | string | null | undefined): number | null {
  const v = Number(raw)
  return Number.isFinite(v) && v !== 0 ? v : null
}

// ── buildDailyTransactionSeries ────────────────────────────────────────────────

/**
 * Group raw transaction rows by WIB calendar date and count incoming / outgoing.
 *
 * Rules:
 *  - quantity_delta > 0  → incoming
 *  - quantity_delta < 0  → outgoing
 *  - quantity_delta === 0 or invalid → ignored
 *  - transaction_at that cannot be parsed → row ignored
 *
 * Every calendar day in the [referenceDate - (chartDays-1), referenceDate]
 * window is guaranteed to appear in the result (with 0 values if no data).
 *
 * @param rows          – raw rows from Supabase
 * @param referenceDate – the current moment (default: new Date())
 * @param chartDays     – number of days to include (default: 7)
 */
export function buildDailyTransactionSeries(
  rows: RawTransactionRow[],
  referenceDate: Date = new Date(),
  chartDays = 7,
): DailyTransactionPoint[] {
  const jakartaNow = toZonedTime(referenceDate, JAKARTA_TIME_ZONE)
  const todayStartJakarta = startOfDay(jakartaNow)

  const dateKeys: string[] = []
  for (let i = chartDays - 1; i >= 0; i--) {
    const day = subDays(todayStartJakarta, i)
    dateKeys.push(formatInTimeZone(day, JAKARTA_TIME_ZONE, 'yyyy-MM-dd'))
  }

  const accumulator = new Map<string, { incoming: number; outgoing: number }>()
  for (const key of dateKeys) {
    accumulator.set(key, { incoming: 0, outgoing: 0 })
  }

  for (const row of rows) {
    const dateKey = parseWibDateKey(row.transaction_at)
    if (!dateKey || !accumulator.has(dateKey)) continue
    const delta = parseDelta(row.quantity_delta)
    if (delta === null) continue
    const bucket = accumulator.get(dateKey)!
    if (delta > 0) bucket.incoming++
    else bucket.outgoing++
  }

  return dateKeys.map((dateKey) => {
    const { incoming, outgoing } = accumulator.get(dateKey)!
    // Format label: weekday + short date
    const d = new Date(`${dateKey}T00:00:00+07:00`)
    const weekday = new Intl.DateTimeFormat('id-ID', {
      timeZone: JAKARTA_TIME_ZONE,
      weekday: 'short',
    }).format(d).replace('.', '')
    const dateStr = new Intl.DateTimeFormat('id-ID', {
      timeZone: JAKARTA_TIME_ZONE,
      day: '2-digit',
      month: 'short',
    }).format(d)
    return { dateKey, label: `${weekday} ${dateStr}`, incoming, outgoing, total: incoming + outgoing }
  })
}

// ── buildWeeklyTransactionSeries ───────────────────────────────────────────────

export interface WeekBucket {
  weekNumber: number  // 1-based week within month
  label: string       // e.g. "1–7", "8–14", "15–21", "22–28", "29–31"
  incoming: number
  outgoing: number
  total: number
}

/**
 * Group transactions by fixed week buckets within the current WIB month.
 *
 * Week buckets (day-of-month):
 *  1 →  1–7
 *  2 →  8–14
 *  3 → 15–21
 *  4 → 22–28
 *  5 → 29–end (only if month has days ≥ 29)
 *
 * Transactions are bucketed by their WIB calendar date.
 * Weeks without transactions still appear with value 0.
 */
export function buildWeeklyTransactionSeries(
  rows: RawTransactionRow[],
  referenceDate: Date = new Date(),
): WeekBucket[] {
  const jakartaNow = toZonedTime(referenceDate, JAKARTA_TIME_ZONE)
  const year = jakartaNow.getFullYear()
  const month = jakartaNow.getMonth() // 0-indexed
  const daysInMonth = getDaysInMonth(jakartaNow)

  // Define fixed week buckets
  const weekDefs: Array<{ weekNumber: number; start: number; end: number }> = [
    { weekNumber: 1, start: 1, end: 7 },
    { weekNumber: 2, start: 8, end: 14 },
    { weekNumber: 3, start: 15, end: 21 },
    { weekNumber: 4, start: 22, end: 28 },
  ]
  if (daysInMonth >= 29) {
    weekDefs.push({ weekNumber: 5, start: 29, end: daysInMonth })
  }

  // Build label map: weekNumber → label string
  const buckets = new Map<number, WeekBucket>()
  for (const { weekNumber, start, end } of weekDefs) {
    const displayEnd = Math.min(end, daysInMonth)
    buckets.set(weekNumber, {
      weekNumber,
      label: start === displayEnd ? `${start}` : `${start}–${displayEnd}`,
      incoming: 0,
      outgoing: 0,
      total: 0,
    })
  }

  for (const row of rows) {
    const dateKey = parseWibDateKey(row.transaction_at)
    if (!dateKey) continue
    // Parse day from dateKey (YYYY-MM-DD)
    const [rowYear, rowMonth, rowDay] = dateKey.split('-').map(Number)
    // Only include rows in this WIB month/year
    if (rowYear !== year || rowMonth !== month + 1) continue
    const delta = parseDelta(row.quantity_delta)
    if (delta === null) continue

    // Determine week number
    let weekNumber: number
    if (rowDay! <= 7) weekNumber = 1
    else if (rowDay! <= 14) weekNumber = 2
    else if (rowDay! <= 21) weekNumber = 3
    else if (rowDay! <= 28) weekNumber = 4
    else weekNumber = 5

    const bucket = buckets.get(weekNumber)
    if (!bucket) continue
    if (delta > 0) bucket.incoming++
    else bucket.outgoing++
    bucket.total++
  }

  return [...buckets.values()]
}

// ── buildMonthlyTransactionSeries ─────────────────────────────────────────────

export interface MonthBucket {
  monthIndex: number  // 0-based (Jan=0, Dec=11)
  label: string       // Indonesian short month name e.g. "Jan", "Feb"
  incoming: number
  outgoing: number
  total: number
}

const MONTH_LABELS_ID = [
  'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
  'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des',
]

/**
 * Group transactions by calendar month for the current WIB year.
 *
 * All 12 months Jan–Dec are always present (0 if no transactions).
 * Transactions are bucketed by their WIB calendar month.
 */
export function buildMonthlyTransactionSeries(
  rows: RawTransactionRow[],
  referenceDate: Date = new Date(),
): MonthBucket[] {
  const jakartaNow = toZonedTime(referenceDate, JAKARTA_TIME_ZONE)
  const year = jakartaNow.getFullYear()

  // Initialise all 12 months
  const buckets: MonthBucket[] = Array.from({ length: 12 }, (_, i) => ({
    monthIndex: i,
    label: MONTH_LABELS_ID[i]!,
    incoming: 0,
    outgoing: 0,
    total: 0,
  }))

  for (const row of rows) {
    const dateKey = parseWibDateKey(row.transaction_at)
    if (!dateKey) continue
    const [rowYear, rowMonth] = dateKey.split('-').map(Number)
    if (rowYear !== year) continue
    const delta = parseDelta(row.quantity_delta)
    if (delta === null) continue
    const monthIndex = (rowMonth! - 1) // convert 1-based to 0-based
    const bucket = buckets[monthIndex]
    if (!bucket) continue
    if (delta > 0) bucket.incoming++
    else bucket.outgoing++
    bucket.total++
  }

  return buckets
}

// ── summarizeInventoryValue ────────────────────────────────────────────────────

interface ItemCostRow {
  inventory_value?: string | number | null
  [key: string]: unknown
}

/**
 * Sum the `inventory_value` field across all rows returned by `get_item_costs`.
 *
 * Valid values: finite positive numbers (or numeric strings).
 * Negative values, NaN, null, undefined, and non-numeric strings are skipped
 * and counted as `invalidRows`.
 */
export function summarizeInventoryValue(rows: ItemCostRow[]): InventoryValueSummary {
  let total = 0
  let validRows = 0
  let invalidRows = 0

  for (const row of rows) {
    const raw = row.inventory_value
    if (raw === null || raw === undefined) {
      invalidRows++
      continue
    }
    const value = typeof raw === 'number' ? raw : parseFloat(String(raw))
    if (!Number.isFinite(value) || value < 0) {
      invalidRows++
      continue
    }
    total += value
    validRows++
  }

  return { total, validRows, invalidRows }
}

// ── summarizeTotalStock ────────────────────────────────────────────────────────

interface ActiveItemStockRow {
  current_stock?: number | string | null
  [key: string]: unknown
}

/**
 * Sum the `current_stock` field across all rows from active items.
 *
 * Only non-negative finite numeric values are counted.
 * Invalid/null rows are skipped.
 */
export function summarizeTotalStock(rows: ActiveItemStockRow[]): number {
  let total = 0
  for (const row of rows) {
    const raw = row.current_stock
    if (raw === null || raw === undefined) continue
    const v = typeof raw === 'number' ? raw : parseFloat(String(raw))
    if (!Number.isFinite(v) || v < 0) continue
    total += v
  }
  return total
}

// ── getActivityPeriodLabel ─────────────────────────────────────────────────────

/**
 * Return display strings for the activity chart based on the active period.
 */
export function getActivityPeriodLabel(period: DashboardActivityPeriod): {
  title: string
  subtitle: string
} {
  switch (period) {
    case 'month':
      return { title: 'Aktivitas Bulan Ini', subtitle: 'per minggu (WIB)' }
    case 'year':
      return { title: 'Aktivitas Tahun Ini', subtitle: 'per bulan (WIB)' }
    case 'week':
    default:
      return { title: 'Aktivitas 7 Hari Terakhir', subtitle: 'per hari (WIB)' }
  }
}
