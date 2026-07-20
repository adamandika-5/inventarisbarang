/**
 * Barcode validation utilities.
 *
 * Supported formats: EAN-13, EAN-8, UPC-A, UPC-E, Code 128, QR
 *
 * SECURITY: Barcode values are treated as text. No URL auto-opening.
 */
import type { BarcodeFormat } from '@/types/database'

const BARCODE_MAX_LENGTH = 256

/**
 * Validate barcode value.
 * - Trim whitespace from start/end
 * - Preserve original case (do not change capitalization)
 * - Validate checksum for EAN/UPC if format is known
 */
export function validateBarcode(
  value: string,
  format?: BarcodeFormat,
): { valid: boolean; error: string | null; normalized: string } {
  if (!value || value.trim().length === 0) {
    return { valid: false, error: 'Barcode wajib diisi.', normalized: '' }
  }

  const normalized = value.trim() // trim whitespace only, preserve case

  if (normalized.length > BARCODE_MAX_LENGTH) {
    return {
      valid: false,
      error: `Barcode maksimal ${BARCODE_MAX_LENGTH} karakter.`,
      normalized: '',
    }
  }

  // Validate checksum for EAN/UPC formats
  if (format === 'EAN13') {
    if (!/^\d{13}$/.test(normalized)) {
      return { valid: false, error: 'EAN-13 harus terdiri dari 13 digit angka.', normalized: '' }
    }
    if (!validateEan13Checksum(normalized)) {
      return { valid: false, error: 'Checksum EAN-13 tidak valid.', normalized: '' }
    }
  } else if (format === 'EAN8') {
    if (!/^\d{8}$/.test(normalized)) {
      return { valid: false, error: 'EAN-8 harus terdiri dari 8 digit angka.', normalized: '' }
    }
    if (!validateEan8Checksum(normalized)) {
      return { valid: false, error: 'Checksum EAN-8 tidak valid.', normalized: '' }
    }
  } else if (format === 'UPCA') {
    if (!/^\d{12}$/.test(normalized)) {
      return { valid: false, error: 'UPC-A harus terdiri dari 12 digit angka.', normalized: '' }
    }
    if (!validateUpcAChecksum(normalized)) {
      return { valid: false, error: 'Checksum UPC-A tidak valid.', normalized: '' }
    }
  } else if (format === 'UPCE') {
    if (!/^\d{8}$/.test(normalized)) {
      return { valid: false, error: 'UPC-E harus terdiri dari 8 digit angka.', normalized: '' }
    }
  }
  // CODE128 and QR: any non-empty string up to max length is valid

  return { valid: true, error: null, normalized }
}

/**
 * Calculate EAN-13 checksum digit.
 * EAN-13: Alternating multiply by 1 and 3 on first 12 digits.
 */
export function calculateEan13Checksum(digits12: string): number {
  let sum = 0
  for (let i = 0; i < 12; i++) {
    const digit = parseInt(digits12[i]!, 10)
    sum += i % 2 === 0 ? digit : digit * 3
  }
  return (10 - (sum % 10)) % 10
}

/**
 * Validate EAN-13 checksum.
 */
export function validateEan13Checksum(barcode: string): boolean {
  if (barcode.length !== 13 || !/^\d+$/.test(barcode)) return false
  const expected = calculateEan13Checksum(barcode.substring(0, 12))
  return parseInt(barcode[12]!, 10) === expected
}

/**
 * Validate EAN-8 checksum.
 */
export function validateEan8Checksum(barcode: string): boolean {
  if (barcode.length !== 8 || !/^\d+$/.test(barcode)) return false
  let sum = 0
  for (let i = 0; i < 7; i++) {
    const digit = parseInt(barcode[i]!, 10)
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return parseInt(barcode[7]!, 10) === checkDigit
}

/**
 * Validate UPC-A checksum.
 */
export function validateUpcAChecksum(barcode: string): boolean {
  if (barcode.length !== 12 || !/^\d+$/.test(barcode)) return false
  let sum = 0
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(barcode[i]!, 10)
    sum += i % 2 === 0 ? digit * 3 : digit
  }
  const checkDigit = (10 - (sum % 10)) % 10
  return parseInt(barcode[11]!, 10) === checkDigit
}
/**
 * Alias for validateBarcode — used in server actions.
 * Returns { valid, error } without the normalized value.
 */
export function validateBarcodeFormat(
  value: string,
  format: BarcodeFormat,
): { valid: boolean; error: string | null } {
  const result = validateBarcode(value, format)
  return { valid: result.valid, error: result.error }
}
