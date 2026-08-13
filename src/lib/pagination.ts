export const MAX_SAFE_PAGE = 1_000_000

/**
 * Normalize an untrusted page query parameter.
 * Returns page 1 for empty, non-numeric, decimal, negative, unsafe, or
 * unreasonably large values.
 */
export function normalizePageNumber(rawPage: unknown): number {
  if (rawPage === null || rawPage === undefined) return 1

  const value = String(rawPage).trim()
  if (!/^\d+$/.test(value)) return 1

  const page = Number(value)
  if (!Number.isSafeInteger(page) || page < 1 || page > MAX_SAFE_PAGE) return 1

  return page
}
