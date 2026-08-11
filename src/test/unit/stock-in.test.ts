import { describe, it, expect } from 'vitest'
import { getUnitsForItem, formatUnitOptionLabel } from '@/app/admin/stock-in/stock-in-form'

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

describe('Stock-In Unit Dropdown UI and Formatter', () => {
  it('formats base unit with "(satuan dasar)"', () => {
    const unit = { id: 'u1', name: 'Biji', symbol: 'biji', conversion_factor: 1 }
    const baseUnit = { name: 'Biji', symbol: 'biji' }
    expect(formatUnitOptionLabel(unit, baseUnit)).toBe('Biji (satuan dasar)')
  })

  it('formats conversion unit with "— isi X <satuan_dasar>" without technical term "faktor"', () => {
    const unit = { id: 'u2', name: 'Kardus', symbol: 'kardus', conversion_factor: 24 }
    const baseUnit = { name: 'Biji', symbol: 'biji' }
    const label = formatUnitOptionLabel(unit, baseUnit)
    expect(label).toBe('Kardus — isi 24 biji')
    expect(label.toLowerCase()).not.toContain('faktor')
  })

  it('formats another conversion unit e.g. Pak isi 10 biji', () => {
    const unit = { id: 'u3', name: 'Pak', symbol: 'pak', conversion_factor: 10 }
    const baseUnit = { name: 'Biji', symbol: 'biji' }
    const label = formatUnitOptionLabel(unit, baseUnit)
    expect(label).toBe('Pak — isi 10 biji')
    expect(label.toLowerCase()).not.toContain('faktor')
  })

  it('deduplicates unit if item_units contains duplicate of base_unit', () => {
    const item = {
      id: 'item-1',
      sku: 'ATK-0001',
      name: 'Pensil 2B',
      current_stock: 10,
      base_unit: { id: 'u-base', name: 'Batang', symbol: 'btg' },
      item_units: [
        { id: 'iu-1', conversion_factor: 1, is_active: true, units: { id: 'u-base', name: 'Batang', symbol: 'btg' } },
        { id: 'iu-2', conversion_factor: 12, is_active: true, units: { id: 'u-lusin', name: 'Lusin', symbol: 'lsn' } },
      ],
    }
    const units = getUnitsForItem(item)
    expect(units.length).toBe(2)
    expect(units.map((unit) => unit.id)).toEqual(['u-base', 'u-lusin'])
  })

  it('returns single unit for item without alternate units', () => {
    const item = {
      id: 'item-2',
      sku: 'ATK-0002',
      name: 'Penghapus',
      current_stock: 5,
      base_unit: { id: 'u-pcs', name: 'Pcs', symbol: 'pcs' },
      item_units: [],
    }
    const units = getUnitsForItem(item)
    expect(units.length).toBe(1)
    const [unit] = units

    if (!unit) {
      throw new Error('Unit dasar tidak ditemukan')
    }

    expect(unit.id).toBe('u-pcs')
    expect(formatUnitOptionLabel(unit, item.base_unit)).toBe('Pcs (satuan dasar)')
  })
})
