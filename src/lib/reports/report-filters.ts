import { addDays, parseISO } from 'date-fns'
import { formatInTimeZone } from 'date-fns-tz'
import { normalizePageNumber } from '@/lib/pagination'

export { MAX_SAFE_PAGE, normalizePageNumber } from '@/lib/pagination'

export const REPORT_TIME_ZONE = 'Asia/Jakarta'

export interface RawReportFilterParams {
  from?: string | null
  to?: string | null
  type?: string | null
  item?: string | null
  page?: string | number | null
}

export interface NormalizedReportFilters {
  safeFrom: string            // YYYY-MM-DD in WIB
  safeTo: string              // YYYY-MM-DD in WIB
  startUtcIso: string         // ISO string for safeFrom 00:00:00+07:00
  endUtcIso: string           // ISO string for day after safeTo 00:00:00+07:00 (half-open upper bound)
  typeFilter: string          // 'ALL' | 'INITIAL' | 'IN' | 'OUT' | 'ADJUSTMENT' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'REVERSAL'
  itemFilter: string          // Valid UUID string or empty ''
  page: number                // Safe integer >= 1 and <= MAX_SAFE_PAGE
  isInvalidDateRange: boolean // True if user selected dateFrom > dateTo
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ALLOWED_TYPES = new Set([
  'ALL',
  'INITIAL',
  'IN',
  'OUT',
  'ADJUSTMENT',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'REVERSAL',
])

/**
 * Validates whether a string is a real calendar date in YYYY-MM-DD format (rejects 2026-02-31, 2026-13-01, etc.).
 * Uses UTC components to prevent local timezone shifts during date checks.
 */
export function isValidCalendarDate(dateStr?: string | null): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false
  const trimmed = dateStr.trim()
  if (!DATE_REGEX.test(trimmed)) return false
  const [yearStr, monthStr, dayStr] = trimmed.split('-')
  const year = parseInt(yearStr ?? '0', 10)
  const month = parseInt(monthStr ?? '0', 10)
  const day = parseInt(dayStr ?? '0', 10)
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31) return false
  const d = new Date(Date.UTC(year, month - 1, day))
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day
}

/**
 * Validates item ID as UUID. Returns empty string if invalid.
 */
export function normalizeItemUuid(rawItem: unknown): string {
  if (typeof rawItem !== 'string') return ''
  const trimmed = rawItem.trim()
  return UUID_REGEX.test(trimmed) ? trimmed : ''
}

/**
 * Single shared report filter normalizer for pages, RPCs, and Excel export API routes.
 */
export function normalizeReportFilters(params: RawReportFilterParams): NormalizedReportFilters {
  const now = new Date()
  const nowWibStr = formatInTimeZone(now, REPORT_TIME_ZONE, 'yyyy-MM-dd')
  const thirtyDaysAgoWibStr = formatInTimeZone(
    new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
    REPORT_TIME_ZONE,
    'yyyy-MM-dd',
  )

  const rawFrom = (params.from ?? '').trim()
  const rawTo = (params.to ?? '').trim()

  const validFrom = isValidCalendarDate(rawFrom)
  const validTo = isValidCalendarDate(rawTo)

  const isInvalidDateRange = validFrom && validTo && rawFrom > rawTo

  const candidateFrom = validFrom ? rawFrom : thirtyDaysAgoWibStr
  const candidateTo = validTo ? rawTo : nowWibStr

  let safeFrom: string
  let safeTo: string

  if (isInvalidDateRange || candidateFrom > candidateTo) {
    safeFrom = thirtyDaysAgoWibStr
    safeTo = nowWibStr
  } else {
    safeFrom = candidateFrom
    safeTo = candidateTo
  }

  const startUtcIso = `${safeFrom}T00:00:00+07:00`
  const toDateObj = parseISO(`${safeTo}T00:00:00+07:00`)
  const nextDayObj = addDays(toDateObj, 1)
  const nextDayStr = formatInTimeZone(nextDayObj, REPORT_TIME_ZONE, 'yyyy-MM-dd')
  const endUtcIso = `${nextDayStr}T00:00:00+07:00`

  let rawType = (params.type ?? '').trim().toUpperCase()
  if (!rawType || !ALLOWED_TYPES.has(rawType)) {
    rawType = 'ALL'
  }

  const typeFilter = rawType
  const itemFilter = normalizeItemUuid(params.item)
  const page = normalizePageNumber(params.page)

  return {
    safeFrom,
    safeTo,
    startUtcIso,
    endUtcIso,
    typeFilter,
    itemFilter,
    page,
    isInvalidDateRange,
  }
}

export interface ParsedReportSummary {
  totalIn: number
  totalOut: number
  totalAdjustmentIn: number
  totalAdjustmentOut: number
  totalReversal: number
  totalTransactions: number
  lowStockCount: number
  hasError: boolean
}

/**
 * Parses `get_report_summary` RPC output strictly without string coercion.
 * Every required field MUST strictly be typeof 'number', finite, and >= 0.
 */
export function parseReportSummary(data: unknown, rpcError: boolean): ParsedReportSummary {
  const fallbackErrorResult: ParsedReportSummary = {
    totalIn: 0,
    totalOut: 0,
    totalAdjustmentIn: 0,
    totalAdjustmentOut: 0,
    totalReversal: 0,
    totalTransactions: 0,
    lowStockCount: 0,
    hasError: true,
  }

  if (rpcError || data === null || typeof data !== 'object' || Array.isArray(data)) {
    return fallbackErrorResult
  }

  const obj = data as Record<string, unknown>

  const requiredFields = [
    'total_in',
    'total_out',
    'total_adjustment_in',
    'total_adjustment_out',
    'total_reversal',
    'total_transactions',
    'low_stock_count',
  ]

  for (const field of requiredFields) {
    const val = obj[field]
    // Strictly require numeric type (no string coercion), finite, non-NaN, non-negative
    if (typeof val !== 'number' || !Number.isFinite(val) || Number.isNaN(val) || val < 0) {
      return fallbackErrorResult
    }
  }

  return {
    totalIn: obj.total_in as number,
    totalOut: obj.total_out as number,
    totalAdjustmentIn: obj.total_adjustment_in as number,
    totalAdjustmentOut: obj.total_adjustment_out as number,
    totalReversal: obj.total_reversal as number,
    totalTransactions: obj.total_transactions as number,
    lowStockCount: obj.low_stock_count as number,
    hasError: false,
  }
}
