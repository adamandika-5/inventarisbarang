import { describe, it, expect } from 'vitest'
import {
  validateBarcode,
  calculateEan13Checksum,
  validateEan13Checksum,
  validateEan8Checksum,
  validateUpcAChecksum,
} from '@/lib/validation/barcode'

describe('validateEan13Checksum', () => {
  it('validates correct EAN-13 barcode', () => {
    // 4006381333931 is a real EAN-13 (Post-it notes)
    expect(validateEan13Checksum('4006381333931')).toBe(true)
    // Another valid EAN-13
    expect(validateEan13Checksum('5901234123457')).toBe(true)
  })

  it('rejects incorrect EAN-13 checksum', () => {
    expect(validateEan13Checksum('4006381333930')).toBe(false) // wrong last digit
    expect(validateEan13Checksum('4006381333932')).toBe(false)
  })

  it('rejects non-numeric or wrong length', () => {
    expect(validateEan13Checksum('400638133393')).toBe(false) // 12 digits
    expect(validateEan13Checksum('40063813339312')).toBe(false) // 14 digits
    expect(validateEan13Checksum('400638133393X')).toBe(false) // non-numeric
  })
})

describe('calculateEan13Checksum', () => {
  it('calculates correct checksum', () => {
    expect(calculateEan13Checksum('400638133393')).toBe(1) // → 4006381333931
    expect(calculateEan13Checksum('590123412345')).toBe(7) // → 5901234123457
  })
})

describe('validateEan8Checksum', () => {
  it('validates correct EAN-8 barcode', () => {
    expect(validateEan8Checksum('96385074')).toBe(true)
  })

  it('rejects incorrect EAN-8 checksum', () => {
    expect(validateEan8Checksum('96385075')).toBe(false)
  })
})

describe('validateUpcAChecksum', () => {
  it('validates correct UPC-A barcode', () => {
    expect(validateUpcAChecksum('012345678905')).toBe(true)
  })

  it('rejects incorrect UPC-A checksum', () => {
    expect(validateUpcAChecksum('012345678900')).toBe(false)
  })
})

describe('validateBarcode', () => {
  it('validates a valid EAN-13 barcode', () => {
    const result = validateBarcode('4006381333931', 'EAN13')
    expect(result.valid).toBe(true)
    expect(result.error).toBeNull()
    expect(result.normalized).toBe('4006381333931')
  })

  it('returns error for invalid EAN-13 checksum', () => {
    const result = validateBarcode('4006381333930', 'EAN13')
    expect(result.valid).toBe(false)
    expect(result.error).not.toBeNull()
  })

  it('returns error for empty barcode', () => {
    const result = validateBarcode('', 'CODE128')
    expect(result.valid).toBe(false)
  })

  it('trims whitespace', () => {
    const result = validateBarcode('  ATK-0001  ', 'CODE128')
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe('ATK-0001')
  })

  it('preserves original case (no case change)', () => {
    const result = validateBarcode('MyBarcode123', 'CODE128')
    expect(result.valid).toBe(true)
    expect(result.normalized).toBe('MyBarcode123') // case preserved
  })

  it('returns error for barcode exceeding max length', () => {
    const result = validateBarcode('a'.repeat(257), 'CODE128')
    expect(result.valid).toBe(false)
    expect(result.error).not.toBeNull()
  })

  it('validates QR barcode as any text', () => {
    const result = validateBarcode('https://example.com/item/123', 'QR')
    expect(result.valid).toBe(true)
    // Note: QR should not auto-open URLs — this is handled in the UI layer
  })

  it('validates EAN-8 barcode', () => {
    const result = validateBarcode('96385074', 'EAN8')
    expect(result.valid).toBe(true)
  })
})
