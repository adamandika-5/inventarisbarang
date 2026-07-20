/**
 * SKU generation and validation utilities.
 *
 * Format: ATK-0001, ATK-0002, ...
 *
 * NOTE: Actual unique SKU generation is handled by PostgreSQL sequence in the database
 * to ensure concurrency safety. These utilities handle client-side validation only.
 */

const SKU_PATTERN = /^ATK-\d{4,}$/

/**
 * Validate SKU format.
 * Returns null if valid, error message if invalid.
 */
export function validateSkuFormat(sku: string): string | null {
  if (!sku || sku.trim().length === 0) {
    return 'SKU wajib diisi.'
  }

  const trimmed = sku.trim().toUpperCase()

  if (!SKU_PATTERN.test(trimmed)) {
    return 'Format SKU tidak valid. Gunakan format ATK-XXXX dengan minimal 4 digit.'
  }

  return null
}

/**
 * Format a sequence number to ATK-XXXX format.
 * Minimum 4 digits, no maximum.
 */
export function formatSku(sequence: number): string {
  if (sequence <= 0) {
    throw new Error('Sequence number harus lebih besar dari 0')
  }
  const padded = sequence.toString().padStart(4, '0')
  return `ATK-${padded}`
}

/**
 * Parse SKU to extract the numeric sequence portion.
 * Returns null if SKU format is invalid.
 */
export function parseSkuSequence(sku: string): number | null {
  if (!SKU_PATTERN.test(sku.trim().toUpperCase())) {
    return null
  }
  const numPart = sku.trim().toUpperCase().replace('ATK-', '')
  const num = parseInt(numPart, 10)
  return isNaN(num) ? null : num
}
