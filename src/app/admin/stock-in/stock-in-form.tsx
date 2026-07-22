'use client'

/**
 * StockInForm — form for recording stock-in transactions.
 *
 * Implements:
 * - Barcode/name item search
 * - Unit selection from item_units
 * - Quantity and price input
 * - Client-side moving average simulation (display only)
 * - idempotent client_request_id generation
 * - Confirmation before submit
 */

import { useState, useTransition, useCallback, useRef } from 'react'
import { processStockIn } from './actions'
import { simulateMovingAverage } from '@/lib/inventory/stock'
import ItemSearchInput from '@/components/item-search-input'

interface UnitOption {
  id: string
  name: string
  symbol: string
  conversion_factor: number
}

interface SelectedItem {
  id: string
  sku: string
  name: string
  current_stock: bigint | string | number
  base_unit: { id: string; name: string; symbol: string } | null
  item_units: {
    id: string
    conversion_factor: bigint | string | number
    is_active: boolean
    units: { id: string; name: string; symbol: string } | null
  }[]
}

interface StockInFormProps {
  preselectedItem: SelectedItem | null
}

// TODO(security): Consider adding CSRF token for this form
export default function StockInForm({ preselectedItem }: StockInFormProps) {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(preselectedItem)
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [price, setPrice] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const clientRequestIdRef = useRef(crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  const getAvailableUnits = useCallback((): UnitOption[] => {
    if (!selectedItem) return []
    const baseUnit = selectedItem.base_unit
    const units: UnitOption[] = []

    // Base unit with factor 1
    if (baseUnit) {
      units.push({ id: baseUnit.id, name: baseUnit.name, symbol: baseUnit.symbol, conversion_factor: 1 })
    }

    // Alternate units
    selectedItem.item_units
      .filter((iu) => iu.is_active && iu.units)
      .forEach((iu) => {
        units.push({
          id: iu.units!.id,
          name: iu.units!.name,
          symbol: iu.units!.symbol,
          conversion_factor: Number(iu.conversion_factor),
        })
      })

    return units
  }, [selectedItem])

  const handleItemSelect = (item: SelectedItem) => {
    setSelectedItem(item)
    setSelectedUnit(null)
    setQuantity(1)
    setPrice('')
    setShowConfirm(false)
    clientRequestIdRef.current = crypto.randomUUID()
  }

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const units = getAvailableUnits()
    const unit = units.find((u) => u.id === e.target.value)
    setSelectedUnit(unit ?? null)
    clientRequestIdRef.current = crypto.randomUUID() // reset idempotency key on unit change
  }

  const handlePriceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target
    const val = input.value
    const digits = val.replace(/\D/g, '')

    if (digits && parseInt(digits, 10) > 1000000000000) {
      return
    }

    const selectionStart = input.selectionStart ?? 0
    const textBeforeCursor = val.substring(0, selectionStart)
    const digitsBeforeCursor = textBeforeCursor.replace(/\D/g, '').length

    setPrice(digits)

    const formatted = digits ? new Intl.NumberFormat('id-ID').format(parseInt(digits, 10)) : ''

    setTimeout(() => {
      let newCursorPos = 0
      let digitCount = 0
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i]!)) {
          digitCount++
          if (digitCount === digitsBeforeCursor) {
            newCursorPos = i + 1
            break
          }
        }
      }
      if (newCursorPos === 0 && digitsBeforeCursor > 0) {
        newCursorPos = formatted.length
      }
      input.setSelectionRange(newCursorPos, newCursorPos)
    }, 0)
  }

  const priceNum = parseInt(price, 10) || 0
  const simulation = selectedItem && selectedUnit && quantity > 0 && priceNum > 0
    ? simulateMovingAverage(
        Number(selectedItem.current_stock),
        0, // We don't have current inventory value client-side (price is private)
        quantity,
        selectedUnit.conversion_factor,
        priceNum,
      )
    : null

  const baseQuantity = selectedUnit ? quantity * selectedUnit.conversion_factor : 0
  const totalCost = priceNum > 0 ? quantity * priceNum : 0

  const formatRp = (val: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(val)

  const handleConfirm = () => {
    setShowConfirm(false)
    if (!formRef.current) return

    const formData = new FormData(formRef.current)
    formData.set('client_request_id', clientRequestIdRef.current)

    startTransition(async () => {
      const result = await processStockIn(formData)
      if (result.success) {
        showMsg(
          'success',
          `Transaksi ${result.data?.transaction_number ?? ''} berhasil. Stok sekarang: ${result.data?.new_stock?.toLocaleString('id-ID') ?? '—'} ${selectedItem?.base_unit?.symbol ?? ''}.`,
        )
        // Reset form
        setSelectedItem(null)
        setSelectedUnit(null)
        setQuantity(1)
        setPrice('')
        formRef.current?.reset()
        clientRequestIdRef.current = crypto.randomUUID()
      } else {
        showMsg('error', result.error ?? 'Gagal mencatat barang masuk.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <form ref={formRef} onSubmit={(e) => { e.preventDefault(); setShowConfirm(true) }}>
        {/* Hidden fields */}
        <input type="hidden" name="client_request_id" value={clientRequestIdRef.current} />
        <input type="hidden" name="item_id" value={selectedItem?.id ?? ''} />
        <input type="hidden" name="unit_id" value={selectedUnit?.id ?? ''} />
        <input type="hidden" name="transaction_unit_price" value={price} />

        <div className="card space-y-5">
          {/* Item search */}
          <div>
            <label className="label mb-1">Barang <span className="text-red-500">*</span></label>
            <ItemSearchInput
              onSelect={handleItemSelect}
              placeholder="Cari nama, SKU, atau barcode…"
              preselected={selectedItem ? { id: selectedItem.id, name: selectedItem.name, sku: selectedItem.sku } : null}
            />
          </div>

          {selectedItem && (
            <>
              <div className="rounded-md bg-blue-50 p-3 text-sm text-blue-700">
                <p className="font-medium">{selectedItem.name}</p>
                <p className="text-xs">SKU: {selectedItem.sku} · Stok saat ini: {Number(selectedItem.current_stock).toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              </div>

              {/* Unit selection */}
              <div>
                <label htmlFor="stock-in-unit" className="label mb-1">Satuan <span className="text-red-500">*</span></label>
                <select
                  id="stock-in-unit"
                  name="unit_display"
                  required
                  className="input"
                  onChange={handleUnitChange}
                  value={selectedUnit?.id ?? ''}
                >
                  <option value="">— Pilih Satuan —</option>
                  {getAvailableUnits().map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.symbol}) — faktor: {u.conversion_factor}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="stock-in-qty" className="label mb-1">Jumlah <span className="text-red-500">*</span></label>
                <input
                  id="stock-in-qty"
                  name="input_quantity"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="input"
                />
                {selectedUnit && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    = {baseQuantity.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}
                  </p>
                )}
              </div>

              {/* Price */}
              <div>
                <label htmlFor="stock-in-price" className="label mb-1">
                  Harga per {selectedUnit?.symbol ?? 'satuan'} <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500 dark:text-slate-400">Rp</span>
                  <input
                    id="stock-in-price"
                    type="text"
                    inputMode="numeric"
                    required
                    value={price ? new Intl.NumberFormat('id-ID').format(parseInt(price, 10)) : ''}
                    onChange={handlePriceChange}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                        e.preventDefault()
                      }
                    }}
                    onWheel={(e) => e.currentTarget.blur()}
                    placeholder="0"
                    className="input pl-9"
                  />
                </div>
                {totalCost > 0 && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Total: {formatRp(totalCost)}
                  </p>
                )}
              </div>

              {/* Simulation summary */}
              {simulation && (
                <div className="rounded-md bg-slate-50 p-3 text-sm dark:bg-slate-700/60">
                  <p className="font-medium text-slate-700 dark:text-slate-200">Ringkasan Transaksi (Simulasi)</p>
                  <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Jumlah (satuan dasar)</span>
                      <span>{simulation.baseQuantity.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total pembelian</span>
                      <span>{formatRp(simulation.purchaseValue)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Perkiraan stok baru</span>
                      <span className="font-medium text-slate-900 dark:text-slate-100">{simulation.newStock.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</span>
                    </div>
                    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">* Harga rata-rata baru dihitung ulang oleh server.</p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => { setSelectedItem(null); setSelectedUnit(null); setQuantity(1); setPrice('') }}
            disabled={isPending}
          >
            Reset
          </button>
          <button
            id="btn-konfirmasi-barang-masuk"
            type="submit"
            className="btn-primary"
            disabled={isPending || !selectedItem || !selectedUnit || quantity < 1 || !price}
          >
            {isPending ? 'Memproses…' : 'Konfirmasi Barang Masuk'}
          </button>
        </div>
      </form>

      {/* Confirm dialog */}
      {showConfirm && selectedItem && selectedUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Konfirmasi Barang Masuk
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p><span className="font-medium">Barang:</span> {selectedItem.name}</p>
              <p><span className="font-medium">Jumlah:</span> {quantity} {selectedUnit.symbol} = {baseQuantity.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              <p><span className="font-medium">Harga per {selectedUnit.symbol}:</span> {formatRp(parseFloat(price) || 0)}</p>
              <p><span className="font-medium">Total:</span> {formatRp(totalCost)}</p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Batal
              </button>
              <button
                id="btn-confirm-stock-in"
                type="button"
                className="btn-primary"
                onClick={handleConfirm}
                disabled={isPending}
              >
                {isPending ? 'Menyimpan…' : 'Ya, Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
