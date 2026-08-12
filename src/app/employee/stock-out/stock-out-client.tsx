'use client'

import { useState, useTransition } from 'react'
import ItemSearchInput from '@/components/item-search-input'
import { processEmployeeStockOut } from '../actions'

interface SelectedItem {
  id: string
  name: string
  sku: string
  current_stock: bigint | string | number
  base_unit: { id: string; name: string; symbol: string } | null
  item_units: Array<{
    id: string
    conversion_factor: bigint | string | number
    units: { id: string; name: string; symbol: string } | null
  }>
}

interface UnitOption {
  id: string
  name: string
  symbol: string
  conversion_factor: number
}

export default function StockOutClient() {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null)
  const [quantity, setQuantity] = useState<string>('1')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSelectItem = (item: SelectedItem | null) => {
    setSelectedItem(item)
    if (item && item.base_unit) {
      setSelectedUnit({
        id: item.base_unit.id,
        name: item.base_unit.name,
        symbol: item.base_unit.symbol,
        conversion_factor: 1,
      })
    } else {
      setSelectedUnit(null)
    }
    setQuantity('1')
  }

  const unitOptions: UnitOption[] = selectedItem
    ? [
        ...(selectedItem.base_unit
          ? [
              {
                id: selectedItem.base_unit.id,
                name: selectedItem.base_unit.name,
                symbol: selectedItem.base_unit.symbol,
                conversion_factor: 1,
              },
            ]
          : []),
        ...(selectedItem.item_units || [])
          .filter((iu) => iu.units)
          .map((iu) => ({
            id: iu.units!.id,
            name: iu.units!.name,
            symbol: iu.units!.symbol,
            conversion_factor: Number(iu.conversion_factor),
          })),
      ]
    : []

  const parsedQty = parseInt(quantity.trim(), 10)
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0
  const conversionFactor = selectedUnit?.conversion_factor ?? 1
  const baseQuantityNeeded = (isValidQty ? parsedQty : 0) * conversionFactor
  const currentStock = selectedItem ? Number(selectedItem.current_stock) : 0
  const isStockSufficient = isValidQty && currentStock >= baseQuantityNeeded

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !selectedUnit || isPending) return

    const trimmed = quantity.trim()
    if (!trimmed) {
      setMessage({ type: 'error', text: 'Jumlah pengeluaran tidak boleh kosong.' })
      return
    }

    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num <= 0) {
      setMessage({ type: 'error', text: 'Jumlah harus berupa bilangan bulat positif.' })
      return
    }

    if (currentStock < baseQuantityNeeded) {
      setMessage({
        type: 'error',
        text: `Stok tidak mencukupi. Butuh ${baseQuantityNeeded} ${selectedItem.base_unit?.symbol}, tersedia ${currentStock}.`,
      })
      return
    }

    setMessage(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('client_request_id', crypto.randomUUID())
      formData.set('item_id', selectedItem.id)
      formData.set('unit_id', selectedUnit.id)
      formData.set('input_quantity', String(num))

      const result = await processEmployeeStockOut(formData)

      if (result.success) {
        setMessage({
          type: 'success',
          text: `Pengeluaran barang berhasil dicatat! No. Transaksi: ${result.data?.transaction_number ?? '—'} (Sisa stok: ${result.data?.new_stock ?? 0})`,
        })
        setSelectedItem(null)
        setSelectedUnit(null)
        setQuantity('1')
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Gagal mencatat pengeluaran barang.' })
      }
    })
  }

  return (
    <div className="card space-y-6">
      {message && (
        <div
          role="alert"
          className={`rounded-lg p-4 text-sm font-medium ${
            message.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
              : 'bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Select Item */}
      <div>
        <label htmlFor="search-item-stockout" className="label mb-1">
          Cari Barang <span className="text-red-500">*</span>
        </label>
        <ItemSearchInput onSelect={(item) => handleSelectItem(item ? (item as unknown as SelectedItem) : null)} />
        {selectedItem && (
          <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs text-slate-700 dark:bg-[#0B1220] dark:text-slate-300 border border-slate-200 dark:border-white/10">
            <p className="font-semibold text-slate-900 dark:text-white">{selectedItem.name}</p>
            <p>SKU: {selectedItem.sku} · Stok saat ini: {Number(selectedItem.current_stock).toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="stockout-unit" className="label mb-1">
            Satuan <span className="text-red-500">*</span>
          </label>
          <select
            id="stockout-unit"
            value={selectedUnit?.id ?? ''}
            onChange={(e) => {
              const opt = unitOptions.find((u) => u.id === e.target.value)
              if (opt) setSelectedUnit(opt)
            }}
            className="input"
            disabled={!selectedItem}
            required
          >
            {unitOptions.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} ({u.symbol})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="stockout-quantity" className="label mb-1">
            Jumlah Keluar <span className="text-red-500">*</span>
          </label>
          <input
            id="stockout-quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="input"
            disabled={!selectedItem}
            required
          />
        </div>
      </div>

      {selectedItem && !isValidQty && quantity.trim() !== '' && (
        <div role="alert" className="alert-error text-xs">
          Jumlah harus berupa bilangan bulat positif.
        </div>
      )}

      {selectedItem && isValidQty && !isStockSufficient && (
        <div role="alert" className="alert-error">
          Stok tidak mencukupi. Butuh {baseQuantityNeeded} {selectedItem.base_unit?.symbol}, tersedia {selectedItem.current_stock}.
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2">
        <button
          type="submit"
          onClick={handleSubmit}
          className="btn-primary disabled:bg-slate-200 dark:disabled:bg-[#203552] disabled:text-slate-400 dark:disabled:text-[#8494ab] disabled:opacity-100"
          disabled={!selectedItem || !isValidQty || !isStockSufficient || isPending}
        >
          {isPending ? 'Menyimpan...' : 'Catat Barang Keluar'}
        </button>
      </div>
    </div>
  )
}
