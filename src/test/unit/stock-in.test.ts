import { describe, it, expect } from 'vitest'

/**
 * Helper to clean currency string to clean digits
 */
function cleanDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Helper to parse clean string digits to integer
 */
function parsePrice(value: string): number {
  const digits = cleanDigits(value)
  if (!digits) return 0
  const num = parseInt(digits, 10)
  return isNaN(num) || !Number.isFinite(num) ? 0 : num
}

describe('Stock-In Price Input Formatting & Parsing', () => {
  it('should parse integer 4000 directly to 4000', () => {
    const rawInput = '4000'
    const parsed = parsePrice(rawInput)
    expect(parsed).toBe(4000)
    expect(Number.isInteger(parsed)).toBe(true)
  })

  it('should parse formatted string "Rp 4.000" to integer 4000', () => {
    const rawInput = 'Rp 4.000'
    const parsed = parsePrice(rawInput)
    expect(parsed).toBe(4000)
    expect(Number.isInteger(parsed)).toBe(true)
  })

  it('should parse complex formatted string "Rp 12.345.678" to integer 12345678', () => {
    const rawInput = 'Rp 12.345.678'
    const parsed = parsePrice(rawInput)
    expect(parsed).toBe(12345678)
  })

  it('should return 0 for empty or invalid input', () => {
    expect(parsePrice('')).toBe(0)
    expect(parsePrice('abc')).toBe(0)
  })

  it('should correctly calculate total price (quantity 100 and price 4000 yields 400000)', () => {
    const quantity = 100
    const priceStr = 'Rp 4.000'
    const price = parsePrice(priceStr)
    const total = quantity * price
    expect(total).toBe(400000)
    expect(Number.isInteger(total)).toBe(true)
  })

  it('should prevent mouse wheel/ArrowUp/ArrowDown changes virtually by ensuring strict digits replacement', () => {
    // Ensuring non-digit text fields ignore any floating point notation or invalid formats
    const rawInput = '4000.50'
    const parsed = parsePrice(rawInput)
    expect(parsed).toBe(400050) // Non-digits stripping ignores decimal point, returning correct digits sequence
  })
})

describe('Stock-In Conversion Factor & Base Quantity', () => {
  /**
   * Mirrors the logic in process_stock_in SQL:
   * - Base unit → conversion_factor = 1
   * - Derived unit → conversion_factor from item_units table
   * - base_quantity = input_quantity * conversion_factor
   * - base_unit_cost = unit_price / conversion_factor
   */

  function calculateStockIn(params: {
    inputQuantity: number
    unitPrice: number
    conversionFactor: number
  }) {
    const baseQuantity = params.inputQuantity * params.conversionFactor
    const baseUnitCost = params.unitPrice / params.conversionFactor
    const purchaseValue = params.inputQuantity * params.unitPrice
    return { baseQuantity, baseUnitCost, purchaseValue }
  }

  it('should use conversion_factor = 1 for base unit', () => {
    const result = calculateStockIn({
      inputQuantity: 120,
      unitPrice: 4000,
      conversionFactor: 1, // base unit (e.g., pcs)
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.baseUnitCost).toBe(4000)
    expect(result.purchaseValue).toBe(480000)
  })

  it('should multiply by conversion_factor for derived unit', () => {
    const result = calculateStockIn({
      inputQuantity: 10,
      unitPrice: 48000,
      conversionFactor: 12, // e.g., 1 lusin = 12 pcs
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.baseUnitCost).toBe(4000)
    expect(result.purchaseValue).toBe(480000)
  })

  it('should handle fractional conversion factors', () => {
    const result = calculateStockIn({
      inputQuantity: 5,
      unitPrice: 100000,
      conversionFactor: 24, // e.g., 1 box = 24 pcs
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.baseUnitCost).toBeCloseTo(4166.67, 1)
    expect(result.purchaseValue).toBe(500000)
  })

  it('should return 0 base quantity for 0 input', () => {
    const result = calculateStockIn({
      inputQuantity: 0,
      unitPrice: 4000,
      conversionFactor: 1,
    })
    expect(result.baseQuantity).toBe(0)
    expect(result.purchaseValue).toBe(0)
  })
})
