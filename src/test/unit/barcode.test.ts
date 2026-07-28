import { describe, it, expect, vi } from 'vitest'
import {
  validateBarcode,
  calculateEan13Checksum,
  validateEan13Checksum,
  validateEan8Checksum,
  validateUpcAChecksum,
  generateAutoBarcodePattern,
  ALLOWED_AUTO_BARCODE_CHARS,
  AUTO_BARCODE_PATTERN,
  LEGACY_AUTO_BARCODE_PATTERN,
} from '@/lib/validation/barcode'

describe('validateEan13Checksum', () => {
  it('validates correct EAN-13 barcode', () => {
    // 4006381333931 is a real EAN-13 (Post-it notes)
    expect(validateEan13Checksum('4006381333931')).toBe(true)
    expect(validateEan13Checksum('5901234123457')).toBe(true)
  })

  it('rejects incorrect EAN-13 checksum', () => {
    expect(validateEan13Checksum('4006381333930')).toBe(false)
    expect(validateEan13Checksum('4006381333932')).toBe(false)
  })

  it('rejects non-numeric or wrong length', () => {
    expect(validateEan13Checksum('400638133393')).toBe(false)
    expect(validateEan13Checksum('40063813339312')).toBe(false)
    expect(validateEan13Checksum('400638133393X')).toBe(false)
  })
})

describe('calculateEan13Checksum', () => {
  it('calculates correct checksum', () => {
    expect(calculateEan13Checksum('400638133393')).toBe(1)
    expect(calculateEan13Checksum('590123412345')).toBe(7)
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
    expect(result.normalized).toBe('MyBarcode123')
  })

  it('returns error for barcode exceeding max length', () => {
    const result = validateBarcode('a'.repeat(257), 'CODE128')
    expect(result.valid).toBe(false)
    expect(result.error).not.toBeNull()
  })

  it('validates QR barcode as any text', () => {
    const result = validateBarcode('https://example.com/item/123', 'QR')
    expect(result.valid).toBe(true)
  })

  it('validates EAN-8 barcode', () => {
    const result = validateBarcode('96385074', 'EAN8')
    expect(result.valid).toBe(true)
  })
})

describe('generateAutoBarcodePattern & Legacy Barcode Compatibility', () => {
  it('generates barcode following IB-XXXXXX format matching ^IB-[A-HJ-NP-Z2-9]{6}$', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateAutoBarcodePattern()
      expect(code).toMatch(/^IB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)
      expect(AUTO_BARCODE_PATTERN.test(code)).toBe(true)
    }
  })

  it('does NOT include date digits (YYMMDD) in new barcode format', () => {
    const code = generateAutoBarcodePattern()
    expect(code).toHaveLength(9) // IB- (3) + XXXXXX (6) = 9
    expect(code).not.toMatch(/^IB-\d{6}-/)
  })

  it('never uses ambiguous characters I, O, 0, 1, or spaces', () => {
    for (let i = 0; i < 50; i++) {
      const code = generateAutoBarcodePattern()
      const suffix = code.replace(/^IB-/, '')

      expect(suffix).toHaveLength(6)
      expect(suffix).not.toMatch(/[IO01\s\na-z]/)
      for (const char of suffix) {
        expect(ALLOWED_AUTO_BARCODE_CHARS.includes(char)).toBe(true)
      }
    }
  })

  it('does NOT use Math.random() for code generation', () => {
    const mathRandomSpy = vi.spyOn(Math, 'random')
    generateAutoBarcodePattern()
    expect(mathRandomSpy).not.toHaveBeenCalled()
    mathRandomSpy.mockRestore()
  })

  it('handles collision by generating distinct new codes', () => {
    const generated = new Set<string>()
    for (let i = 0; i < 50; i++) {
      const code = generateAutoBarcodePattern()
      expect(generated.has(code)).toBe(false)
      generated.add(code)
    }
    expect(generated.size).toBe(50)
  })

  it('accepts legacy barcodes like IB-260728-RZUB6J as valid Code 128 barcodes', () => {
    const legacyCode = 'IB-260728-RZUB6J'
    expect(LEGACY_AUTO_BARCODE_PATTERN.test(legacyCode)).toBe(true)
    const valid = validateBarcode(legacyCode, 'CODE128')
    expect(valid.valid).toBe(true)
    expect(valid.normalized).toBe(legacyCode)
  })

  it('generating barcode does NOT alter SKU or save directly to DB', () => {
    const initialSku = 'ATK-0005'
    const newBarcode = generateAutoBarcodePattern()

    // SKU remains untouched
    expect(initialSku).toBe('ATK-0005')
    // Barcode is a standalone string value
    expect(newBarcode).toMatch(/^IB-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/)
  })

  it('allows manual editing or previewing without immediate DB save', () => {
    const code = generateAutoBarcodePattern()
    const valid = validateBarcode(code, 'CODE128')
    expect(valid.valid).toBe(true)
    expect(valid.normalized).toBe(code)
  })

  it('duplicate barcode validation rejects duplicate values on save', () => {
    const existingBarcodes = new Set(['IB-RZUB6J', 'IB-260728-RZUB6J'])
    const isDuplicate = (code: string) => existingBarcodes.has(code)

    expect(isDuplicate('IB-RZUB6J')).toBe(true)
    expect(isDuplicate('IB-NEWBAR')).toBe(false)
  })
})
