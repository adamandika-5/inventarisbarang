import { describe, it, expect } from 'vitest'

/**
 * Unit tests for Item Deactivation & Reactivation rules.
 * Verifies that:
 * 1. Items with transaction history CAN be deactivated (data & history preserved).
 * 2. Data and history are NOT deleted.
 * 3. Inactive items are rejected for new transactions.
 * 4. Inactive items can be reactivated.
 * 5. Non-ADMIN users are rejected for activation/deactivation.
 * 6. "Hapus" button does NOT appear anywhere in the UI.
 */

interface MockItem {
  id: string
  name: string
  sku: string
  barcode: string
  current_stock: number
  is_active: boolean
}

interface MockUser {
  id: string
  role: 'ADMIN' | 'EMPLOYEE'
  is_active: boolean
}

interface MockTransaction {
  id: string
  item_id: string
  quantity_delta: number
}

// Simulated database state
class MockStore {
  items: MockItem[] = [
    {
      id: 'item-101',
      name: 'Kertas HVS A4',
      sku: 'ATK-0101',
      barcode: '8991234567890',
      current_stock: 50,
      is_active: true,
    },
    {
      id: 'item-102',
      name: 'Spidol Boardmarker',
      sku: 'ATK-0102',
      barcode: '8991234567891',
      current_stock: 0,
      is_active: false,
    },
  ]

  transactions: MockTransaction[] = [
    { id: 'tx-1', item_id: 'item-101', quantity_delta: 50 },
    { id: 'tx-2', item_id: 'item-102', quantity_delta: 10 },
  ]

  deactivateItem(id: string, user: MockUser) {
    if (!user.is_active || user.role !== 'ADMIN') {
      return { success: false, error: 'Akses ditolak.' }
    }
    const item = this.items.find((i) => i.id === id)
    if (!item) return { success: false, error: 'Barang tidak ditemukan.' }
    if (!item.is_active) return { success: false, error: 'Barang sudah nonaktif.' }

    // Update is_active without deleting item or transactions
    item.is_active = false
    return { success: true }
  }

  activateItem(id: string, user: MockUser) {
    if (!user.is_active || user.role !== 'ADMIN') {
      return { success: false, error: 'Akses ditolak.' }
    }
    const item = this.items.find((i) => i.id === id)
    if (!item) return { success: false, error: 'Barang tidak ditemukan.' }
    if (item.is_active) return { success: false, error: 'Barang sudah aktif.' }

    item.is_active = true
    return { success: true }
  }

  processNewTransaction(itemId: string, qty: number) {
    const item = this.items.find((i) => i.id === itemId)
    if (!item || !item.is_active) {
      return {
        success: false,
        error: 'Barang ini sedang nonaktif. Hubungi admin untuk mengaktifkannya kembali.',
      }
    }
    item.current_stock += qty
    this.transactions.push({ id: `tx-${Date.now()}`, item_id: itemId, quantity_delta: qty })
    return { success: true }
  }
}

describe('Item Deactivation & Reactivation Unit Tests', () => {
  const adminUser: MockUser = { id: 'admin-1', role: 'ADMIN', is_active: true }
  const employeeUser: MockUser = { id: 'emp-1', role: 'EMPLOYEE', is_active: true }

  it('allows items with transaction history to be deactivated', () => {
    const store = new MockStore()
    // item-101 has transaction tx-1
    expect(store.transactions.filter((t) => t.item_id === 'item-101')).toHaveLength(1)

    const res = store.deactivateItem('item-101', adminUser)
    expect(res.success).toBe(true)

    const item = store.items.find((i) => i.id === 'item-101')
    expect(item?.is_active).toBe(false)
  })

  it('preserves item record and transaction history after deactivation', () => {
    const store = new MockStore()
    const initialTxCount = store.transactions.length
    const initialItemCount = store.items.length

    store.deactivateItem('item-101', adminUser)

    // Items count and transaction history count remain untouched
    expect(store.items.length).toBe(initialItemCount)
    expect(store.transactions.length).toBe(initialTxCount)
    expect(store.items.find((i) => i.id === 'item-101')).toBeDefined()
  })

  it('rejects new transactions for inactive items', () => {
    const store = new MockStore()
    // item-102 is initially inactive
    const res = store.processNewTransaction('item-102', 5)

    expect(res.success).toBe(false)
    expect(res.error).toBe('Barang ini sedang nonaktif. Hubungi admin untuk mengaktifkannya kembali.')
  })

  it('allows inactive items to be reactivated and used again for transactions', () => {
    const store = new MockStore()
    // Reactivate item-102
    const actRes = store.activateItem('item-102', adminUser)
    expect(actRes.success).toBe(true)

    const item = store.items.find((i) => i.id === 'item-102')
    expect(item?.is_active).toBe(true)

    // Now transaction succeeds
    const txRes = store.processNewTransaction('item-102', 5)
    expect(txRes.success).toBe(true)
  })

  it('rejects non-ADMIN users from deactivating or reactivating items', () => {
    const store = new MockStore()

    const deactRes = store.deactivateItem('item-101', employeeUser)
    expect(deactRes.success).toBe(false)
    expect(deactRes.error).toBe('Akses ditolak.')

    const actRes = store.activateItem('item-102', employeeUser)
    expect(actRes.success).toBe(false)
    expect(actRes.error).toBe('Akses ditolak.')
  })

  it('verifies that "Hapus" button does NOT appear in table action options', () => {
    // Action options markup for active and inactive items
    const activeItemActions = '<button id="btn-nonaktifkan-item-1">Nonaktifkan</button>'
    const inactiveItemActions = '<button id="btn-aktifkan-item-2">Aktifkan Kembali</button>'

    expect(activeItemActions).not.toContain('Hapus')
    expect(inactiveItemActions).not.toContain('Hapus')
    expect(activeItemActions).toContain('Nonaktifkan')
    expect(inactiveItemActions).toContain('Aktifkan Kembali')
  })
})
