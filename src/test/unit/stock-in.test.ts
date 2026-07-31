import { describe, it, expect } from 'vitest'

describe('Stock-In Quantity-Only Logic', () => {

  function calculateStockInQuantityOnly(params: {
    inputQuantity: number
    conversionFactor: number
    currentStock: number
  }) {
    const baseQuantity = params.inputQuantity * params.conversionFactor
    const newStock = params.currentStock + baseQuantity
    return { baseQuantity, newStock }
  }

  it('should use conversion_factor = 1 for base unit and update stock without price', () => {
    const result = calculateStockInQuantityOnly({
      inputQuantity: 120,
      conversionFactor: 1, // base unit (e.g., pcs)
      currentStock: 50,
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.newStock).toBe(170)
  })

  it('should multiply by conversion_factor for derived unit without price', () => {
    const result = calculateStockInQuantityOnly({
      inputQuantity: 10,
      conversionFactor: 12, // e.g., 1 lusin = 12 pcs
      currentStock: 0,
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.newStock).toBe(120)
  })

  it('should handle large conversion factors', () => {
    const result = calculateStockInQuantityOnly({
      inputQuantity: 5,
      conversionFactor: 24, // e.g., 1 box = 24 pcs
      currentStock: 100,
    })
    expect(result.baseQuantity).toBe(120)
    expect(result.newStock).toBe(220)
  })

  it('should return 0 base quantity for 0 input', () => {
    const result = calculateStockInQuantityOnly({
      inputQuantity: 0,
      conversionFactor: 1,
      currentStock: 50,
    })
    expect(result.baseQuantity).toBe(0)
    expect(result.newStock).toBe(50)
  })

  it('should not include price properties in RPC payload', () => {
    const rpcPayload = {
      p_client_request_id: '123e4567-e89b-12d3-a456-426614174000',
      p_item_id: 'item-uuid',
      p_input_quantity: 10,
      p_unit_id: 'unit-uuid',
    }
    expect('p_unit_price' in rpcPayload).toBe(false)
  })
})
