import { describe, it, expect } from 'vitest'
import {
  getStockStatus,
  calculateBaseQuantity,
  simulateMovingAverage,
  wouldCauseNegativeStock,
} from '@/lib/inventory/stock'

describe('getStockStatus', () => {
  it('returns HABIS when stock is 0', () => {
    expect(getStockStatus(0n, 10n)).toBe('HABIS')
    expect(getStockStatus(0n, 0n)).toBe('HABIS')
  })

  it('returns HAMPIR_HABIS when stock > 0 and <= minimum', () => {
    expect(getStockStatus(1n, 10n)).toBe('HAMPIR_HABIS')
    expect(getStockStatus(5n, 10n)).toBe('HAMPIR_HABIS')
    expect(getStockStatus(10n, 10n)).toBe('HAMPIR_HABIS')
  })

  it('returns AMAN when stock > minimum', () => {
    expect(getStockStatus(11n, 10n)).toBe('AMAN')
    expect(getStockStatus(100n, 10n)).toBe('AMAN')
  })

  it('handles edge case where minimum is 0', () => {
    expect(getStockStatus(1n, 0n)).toBe('AMAN') // stock > 0 (minimum)
    expect(getStockStatus(0n, 0n)).toBe('HABIS') // stock = 0
  })
})

describe('calculateBaseQuantity', () => {
  it('correctly multiplies input quantity by conversion factor', () => {
    expect(calculateBaseQuantity(5n, 12n)).toBe(60n) // 5 boxes × 12 pcs = 60 pcs
    expect(calculateBaseQuantity(1n, 1n)).toBe(1n)
    expect(calculateBaseQuantity(100n, 5n)).toBe(500n)
  })

  it('throws for zero or negative input quantity', () => {
    expect(() => calculateBaseQuantity(0n, 12n)).toThrow()
    expect(() => calculateBaseQuantity(-1n, 12n)).toThrow()
  })

  it('throws for zero or negative conversion factor', () => {
    expect(() => calculateBaseQuantity(5n, 0n)).toThrow()
    expect(() => calculateBaseQuantity(5n, -1n)).toThrow()
  })
})

describe('simulateMovingAverage', () => {
  it('calculates correct moving average for stock IN', () => {
    // Scenario: 60 pcs at avg cost 500/pcs, buying 5 boxes at 6000/box (12 pcs/box)
    // current: 60 pcs, value: 30000
    // buying: 5 boxes, factor: 12, price/box: 6000
    // base qty: 5 * 12 = 60 pcs
    // base cost: 6000 / 12 = 500/pcs
    // purchase value: 5 * 6000 = 30000
    // new value: 30000 + 30000 = 60000
    // new stock: 60 + 60 = 120
    // new avg: 60000 / 120 = 500
    const result = simulateMovingAverage(60, 30000, 5, 12, 6000)
    expect(result.baseQuantity).toBe(60)
    expect(result.baseUnitCost).toBe(500)
    expect(result.purchaseValue).toBe(30000)
    expect(result.newInventoryValue).toBe(60000)
    expect(result.newStock).toBe(120)
    expect(result.newAverageCost).toBe(500)
  })

  it('calculates moving average when buying at different price', () => {
    // 10 pcs at avg 1000, buying 10 pcs at 2000/pcs (factor 1)
    // new value = 10000 + 20000 = 30000
    // new stock = 20
    // new avg = 30000 / 20 = 1500
    const result = simulateMovingAverage(10, 10000, 10, 1, 2000)
    expect(result.newAverageCost).toBe(1500)
  })

  it('handles first purchase (zero initial stock)', () => {
    const result = simulateMovingAverage(0, 0, 5, 12, 6000)
    expect(result.newStock).toBe(60)
    expect(result.newAverageCost).toBe(500)
  })

  it('throws for invalid inputs', () => {
    expect(() => simulateMovingAverage(10, 5000, 0, 12, 6000)).toThrow()
    expect(() => simulateMovingAverage(10, 5000, 5, 0, 6000)).toThrow()
    expect(() => simulateMovingAverage(10, 5000, 5, 12, -1)).toThrow()
  })
})

describe('wouldCauseNegativeStock', () => {
  it('returns false when removal would not cause negative stock', () => {
    expect(wouldCauseNegativeStock(10n, 5n)).toBe(false)
    expect(wouldCauseNegativeStock(10n, 10n)).toBe(false)
  })

  it('returns true when removal would cause negative stock', () => {
    expect(wouldCauseNegativeStock(5n, 6n)).toBe(true)
    expect(wouldCauseNegativeStock(0n, 1n)).toBe(true)
  })
})
