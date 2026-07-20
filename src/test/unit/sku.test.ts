import { describe, it, expect } from 'vitest'
import { validateSkuFormat, formatSku, parseSkuSequence } from '@/lib/validation/sku'

describe('formatSku', () => {
  it('formats single digit with padding', () => {
    expect(formatSku(1)).toBe('ATK-0001')
  })

  it('formats 4-digit number', () => {
    expect(formatSku(1000)).toBe('ATK-1000')
  })

  it('formats more than 4 digits without truncation', () => {
    expect(formatSku(10000)).toBe('ATK-10000')
  })

  it('throws for zero or negative input', () => {
    expect(() => formatSku(0)).toThrow()
    expect(() => formatSku(-1)).toThrow()
  })
})

describe('validateSkuFormat', () => {
  it('returns null for valid SKU', () => {
    expect(validateSkuFormat('ATK-0001')).toBeNull()
    expect(validateSkuFormat('ATK-1234')).toBeNull()
    expect(validateSkuFormat('ATK-10000')).toBeNull()
  })

  it('returns error for empty SKU', () => {
    expect(validateSkuFormat('')).not.toBeNull()
  })

  it('returns error for wrong prefix', () => {
    expect(validateSkuFormat('BRG-0001')).not.toBeNull()
    expect(validateSkuFormat('atk-0001')).toBeNull() // case-insensitive check normalizes to ATK-
  })

  it('returns error for fewer than 4 digits', () => {
    expect(validateSkuFormat('ATK-001')).not.toBeNull()
    expect(validateSkuFormat('ATK-12')).not.toBeNull()
  })

  it('returns null for exactly 4 digits', () => {
    expect(validateSkuFormat('ATK-0001')).toBeNull()
  })
})

describe('parseSkuSequence', () => {
  it('parses valid SKU', () => {
    expect(parseSkuSequence('ATK-0001')).toBe(1)
    expect(parseSkuSequence('ATK-1234')).toBe(1234)
    expect(parseSkuSequence('ATK-10000')).toBe(10000)
  })

  it('returns null for invalid SKU', () => {
    expect(parseSkuSequence('INVALID')).toBeNull()
    expect(parseSkuSequence('ATK-')).toBeNull()
    expect(parseSkuSequence('ATK-abc')).toBeNull()
  })
})
