/**
 * Stock and inventory calculation utilities.
 *
 * CRITICAL: All calculations use JavaScript's number type which has precision limits.
 * For production financial calculations, consider using BigInt or decimal string arithmetic.
 * Currently using number with NUMERIC(20,6) in PostgreSQL for precision.
 *
 * The server/database is the source of truth for all financial calculations.
 * Client-side calculations here are for display/simulation only.
 */
import type { StockStatus } from '@/types/database'

/**
 * Determine stock status based on current stock and minimum stock threshold.
 * Rules are mutually exclusive per spec section 5.4.
 */
export function getStockStatus(currentStock: bigint, minimumStock: bigint): StockStatus {
  if (currentStock === 0n) {
    return 'HABIS'
  }
  if (currentStock <= minimumStock) {
    return 'HAMPIR_HABIS'
  }
  return 'AMAN'
}

/**
 * Get stock status display label in Indonesian.
 */
export function getStockStatusLabel(status: StockStatus): string {
  switch (status) {
    case 'HABIS':
      return 'Habis'
    case 'HAMPIR_HABIS':
      return 'Hampir Habis'
    case 'AMAN':
      return 'Aman'
    case 'NONAKTIF':
      return 'Nonaktif'
    default:
      return 'Tidak Diketahui'
  }
}

/**
 * Calculate base quantity from input quantity and conversion factor.
 * Both quantities must be positive integers.
 */
export function calculateBaseQuantity(
  inputQuantity: bigint,
  conversionFactor: bigint,
): bigint {
  if (inputQuantity <= 0n) {
    throw new Error('Kuantitas input harus lebih besar dari 0')
  }
  if (conversionFactor <= 0n) {
    throw new Error('Faktor konversi harus lebih besar dari 0')
  }
  return inputQuantity * conversionFactor
}

/**
 * Simulate new moving average cost after a stock IN transaction.
 * This is CLIENT-SIDE SIMULATION ONLY — server recalculates with actual data.
 *
 * Formula:
 *   base_unit_cost = transaction_unit_price / conversion_factor
 *   purchase_value = input_quantity * transaction_unit_price
 *   new_inventory_value = old_inventory_value + purchase_value
 *   new_average_cost = new_inventory_value / new_stock
 */
export function simulateMovingAverage(
  currentStock: number,
  currentInventoryValue: number,
  inputQuantity: number,
  conversionFactor: number,
  transactionUnitPrice: number,
): {
  baseQuantity: number
  baseUnitCost: number
  purchaseValue: number
  newInventoryValue: number
  newStock: number
  newAverageCost: number
} {
  if (inputQuantity <= 0) throw new Error('Kuantitas input harus lebih besar dari 0')
  if (conversionFactor <= 0) throw new Error('Faktor konversi harus lebih besar dari 0')
  if (transactionUnitPrice < 0) throw new Error('Harga tidak boleh negatif')

  const baseQuantity = inputQuantity * conversionFactor
  const baseUnitCost = transactionUnitPrice / conversionFactor
  const purchaseValue = inputQuantity * transactionUnitPrice
  const newInventoryValue = currentInventoryValue + purchaseValue
  const newStock = currentStock + baseQuantity
  const newAverageCost = newStock > 0 ? newInventoryValue / newStock : 0

  return {
    baseQuantity,
    baseUnitCost,
    purchaseValue,
    newInventoryValue,
    newStock,
    newAverageCost,
  }
}

/**
 * Check if a quantity would cause stock to go negative.
 */
export function wouldCauseNegativeStock(
  currentStock: bigint,
  baseQuantityToRemove: bigint,
): boolean {
  return currentStock - baseQuantityToRemove < 0n
}

/**
 * Validate that a quantity is a positive integer.
 */
export function isValidQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
}

/**
 * Format stock number for display.
 */
export function formatStock(stock: bigint | number): string {
  return Number(stock).toLocaleString('id-ID')
}
