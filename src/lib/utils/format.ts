/**
 * Date/time utilities for Asia/Jakarta timezone.
 *
 * Per spec:
 * - Display uses Asia/Jakarta timezone
 * - Storage uses UTC (timestamptz)
 * - Date range queries use half-open intervals: >= start AND < end+1day
 */

const JAKARTA_TZ = 'Asia/Jakarta'

/**
 * Format a date/time string for display in Indonesian locale, Asia/Jakarta timezone.
 */
export function formatDateTime(
  dateString: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!dateString) return '-'

  try {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: JAKARTA_TZ,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      ...options,
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Format a date string (date only) for display in Indonesian locale.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'

  try {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: JAKARTA_TZ,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date)
  } catch {
    return '-'
  }
}

/**
 * Convert a Jakarta date range to UTC bounds for database queries.
 * Uses half-open interval: >= startUTC AND < endUTC
 *
 * Example: Jakarta "2024-01-01" to "2024-01-31" becomes:
 *   start: 2023-12-31T17:00:00Z (midnight Jan 1 Jakarta = 5pm Dec 31 UTC)
 *   end: 2024-01-31T17:00:00Z (midnight Feb 1 Jakarta = 5pm Jan 31 UTC)
 */
export function jakartaDateRangeToUTC(
  startDateJakarta: string, // YYYY-MM-DD
  endDateJakarta: string, // YYYY-MM-DD (inclusive)
): { startUTC: Date; endUTC: Date } {
  // Parse as Jakarta midnight
  const startUTC = new Date(`${startDateJakarta}T00:00:00+07:00`)
  const endDayAfter = new Date(`${endDateJakarta}T00:00:00+07:00`)
  endDayAfter.setDate(endDayAfter.getDate() + 1) // exclusive upper bound

  return { startUTC, endUTC: endDayAfter }
}

/**
 * Convert year+month selection to UTC range for database queries.
 * Jakarta month range: first day 00:00 to last day 23:59:59.999
 */
export function jakartaMonthToUTC(year: number, month: number): { startUTC: Date; endUTC: Date } {
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`

  // Calculate last day of month
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  return jakartaDateRangeToUTC(startDate, endDate)
}

/**
 * Get current date in YYYY-MM-DD format in Jakarta timezone.
 */
export function getTodayJakarta(): string {
  return new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
    .format(new Date())
    .split('/')
    .reverse()
    .join('-')
}

/**
 * Format currency in IDR (Indonesian Rupiah).
 * Typically no decimal places for display.
 */
export function formatRupiah(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(num)) return 'Rp -'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(num)
}

/**
 * Format a number in Indonesian locale.
 */
export function formatNumber(value: number | bigint): string {
  return new Intl.NumberFormat('id-ID').format(value)
}
