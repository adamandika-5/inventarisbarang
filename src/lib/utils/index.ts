import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Utility to merge Tailwind CSS classes with proper override handling.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}

/**
 * Generate a UUID v4 for client_request_id (idempotency keys).
 * Uses crypto.randomUUID() which is available in modern browsers and Node.js.
 */
export function generateRequestId(): string {
  return crypto.randomUUID()
}

/**
 * Sanitize a string to prevent spreadsheet formula injection.
 * Prefixes dangerous characters with a single quote.
 *
 * Characters that trigger formula: = + - @ | % (tab) (newline)
 */
export function sanitizeSpreadsheetValue(value: string): string {
  if (!value) return value
  const dangerousChars = ['=', '+', '-', '@', '|', '\t', '\r', '\n']
  const firstChar = value.charAt(0)
  if (dangerousChars.includes(firstChar)) {
    return `'${value}`
  }
  return value
}

/**
 * Truncate a string to a maximum length with ellipsis.
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return `${str.substring(0, maxLength - 3)}...`
}

/**
 * Safely parse an integer, returning null if invalid.
 */
export function safeParseInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string') {
    const parsed = parseInt(value.trim(), 10)
    return isNaN(parsed) ? null : parsed
  }
  return null
}

/**
 * Safely parse a positive integer (> 0), returning null if invalid or not positive.
 */
export function safeParsePositiveInt(value: unknown): number | null {
  const parsed = safeParseInt(value)
  return parsed !== null && parsed > 0 ? parsed : null
}
