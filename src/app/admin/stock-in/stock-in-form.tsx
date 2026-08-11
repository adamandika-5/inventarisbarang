'use client'

/**
 * StockInForm — form for recording stock-in transactions (quantity-only).
 *
 * Implements:
 * - Barcode/name item search
 * - Unit selection from item_units
 * - Quantity input
 * - Idempotent client_request_id generation
 * - Confirmation before submit
 *
 * Price: Not collected. System is quantity-only since migration 011.
 */

import { useState, useTransition, useMemo, useRef } from 'react'
import { processStockIn } from './actions'
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

export function getUnitsForItem(item: SelectedItem | null): UnitOption[] {
  if (!item) return []
  const baseUnit = item.base_unit
  const units: UnitOption[] = []
  const seenUnitIds = new Set<string>()

  // Base unit with factor 1
  if (baseUnit) {
    seenUnitIds.add(baseUnit.id)
    units.push({
      id: baseUnit.id,
      name: baseUnit.name,
      symbol: baseUnit.symbol,
      conversion_factor: 1,
    })
  }

  // Alternate units
  for (const itemUnit of item.item_units) {
    const unit = itemUnit.units

    if (!itemUnit.is_active || !unit || seenUnitIds.has(unit.id)) {
      continue
    }

    seenUnitIds.add(unit.id)
    units.push({
      id: unit.id,
      name: unit.name,
      symbol: unit.symbol,
      conversion_factor: Number(itemUnit.conversion_factor),
    })
  }

  return units
}

export function formatUnitOptionLabel(
  unit: UnitOption,
  baseUnit: { name: string; symbol: string } | null,
): string {
  const baseName = baseUnit?.name || baseUnit?.symbol || 'satuan dasar'
  if (unit.conversion_factor === 1) {
    return `${unit.name} (satuan dasar)`
  }
  return `${unit.name} — isi ${unit.conversion_factor.toLocaleString('id-ID')} ${baseName.toLowerCase()}`
}

function getOnlyUnit(units: readonly UnitOption[]): UnitOption | null {
  return units.length === 1 ? (units[0] ?? null) : null
}

// TODO(security): Consider adding CSRF token for this form
export default function StockInForm({ preselectedItem }: StockInFormProps) {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(preselectedItem)
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(() => {
    if (!preselectedItem) return null
    const units = getUnitsForItem(preselectedItem)
    return getOnlyUnit(units)
  })
  const [quantity, setQuantity] = useState<string>('1')
  const [quantityError, setQuantityError] = useState<string | null>(null)
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const clientRequestIdRef = useRef(crypto.randomUUID())
  const formRef = useRef<HTMLFormElement>(null)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  const availableUnits = useMemo(() => {
    return getUnitsForItem(selectedItem)
  }, [selectedItem])

  const handleItemSelect = (item: SelectedItem) => {
    setSelectedItem(item)
    const units = getUnitsForItem(item)
    // Auto-select if only 1 unit exists
    setSelectedUnit(getOnlyUnit(units))
    setQuantity('1')
    setQuantityError(null)
    setShowConfirm(false)
    clientRequestIdRef.current = crypto.randomUUID()
  }

  const handleUnitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const units = getUnitsForItem(selectedItem)
    const unit = units.find((u) => u.id === e.target.value)
    setSelectedUnit(unit ?? null)
    clientRequestIdRef.current = crypto.randomUUID() // reset idempotency key on unit change
  }

  const parsedQty = Number(quantity)
  const isQtyValid = quantity !== '' && Number.isInteger(parsedQty) && parsedQty >= 1
  const baseQuantity = selectedUnit && isQtyValid ? parsedQty * selectedUnit.conversion_factor : 0
  const baseUnitLabel = (
    selectedItem?.base_unit?.name ||
    selectedItem?.base_unit?.symbol ||
    ''
  ).toLowerCase()

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
        setQuantity('1')
        setQuantityError(null)
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
        <div
          role="alert"
          className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}
        >
          {message.text}
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={(e) => {
          e.preventDefault()
          const pQty = Number(quantity)
          if (quantity === '' || !Number.isInteger(pQty) || pQty < 1) {
            setQuantityError('Jumlah barang minimal 1.')
            showMsg('error', 'Jumlah barang minimal 1.')
            return
          }
          setQuantityError(null)
          setShowConfirm(true)
        }}
      >
        {/* Hidden fields */}
        <input type="hidden" name="client_request_id" value={clientRequestIdRef.current} />
        <input type="hidden" name="item_id" value={selectedItem?.id ?? ''} />
        <input type="hidden" name="unit_id" value={selectedUnit?.id ?? ''} />

        <div className="card space-y-5">
          {/* Item search */}
          <div>
            <label className="label mb-1">
              Barang <span className="text-red-500">*</span>
            </label>
            <ItemSearchInput
              onSelect={handleItemSelect}
              placeholder="Cari nama, SKU, atau barcode…"
              preselected={
                selectedItem
                  ? {
                      id: selectedItem.id,
                      name: selectedItem.name,
                      sku: selectedItem.sku,
                    }
                  : null
              }
            />
          </div>

          {selectedItem && (
            <>
              <div className="rounded-md bg-blue-50 dark:bg-[#22D3EE]/10 border border-blue-200 dark:border-[#22D3EE]/30 p-3 text-sm text-blue-700 dark:text-[#22D3EE]">
                <p className="font-medium">{selectedItem.name}</p>
                <p className="text-xs">
                  SKU: {selectedItem.sku} · Stok saat ini:{' '}
                  {Number(selectedItem.current_stock).toLocaleString('id-ID')}{' '}
                  {selectedItem.base_unit?.symbol}
                </p>
              </div>

              {/* Unit selection */}
              <div>
                <label htmlFor="stock-in-unit" className="label mb-1">
                  Satuan <span className="text-red-500">*</span>
                </label>
                <select
                  id="stock-in-unit"
                  name="unit_display"
                  required
                  className="input"
                  onChange={handleUnitChange}
                  value={selectedUnit?.id ?? ''}
                >
                  <option value="">Pilih Satuan</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {formatUnitOptionLabel(u, selectedItem.base_unit)}
                    </option>
                  ))}
                </select>
                {selectedUnit && (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {selectedUnit.conversion_factor === 1
                      ? `1 ${selectedUnit.name.toLowerCase()} menambah 1 ${baseUnitLabel} pada stok.`
                      : `1 ${selectedUnit.name.toLowerCase()} menambah ${selectedUnit.conversion_factor.toLocaleString('id-ID')} ${baseUnitLabel} pada stok.`}
                  </p>
                )}
              </div>

              {/* Quantity */}
              <div>
                <label htmlFor="stock-in-qty" className="label mb-1">
                  Jumlah <span className="text-red-500">*</span>
                </label>
                <input
                  id="stock-in-qty"
                  name="input_quantity"
                  type="number"
                  min={1}
                  step={1}
                  required
                  value={quantity}
                  onChange={(e) => {
                    const val = e.target.value
                    if (val === '' || /^\d+$/.test(val)) {
                      setQuantity(val)
                      if (val !== '' && Number(val) >= 1 && Number.isInteger(Number(val))) {
                        setQuantityError(null)
                      }
                    }
                  }}
                  onBlur={() => {
                    const pQty = Number(quantity)
                    if (quantity === '' || !Number.isInteger(pQty) || pQty < 1) {
                      setQuantityError('Jumlah barang minimal 1.')
                    } else {
                      setQuantityError(null)
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                      e.preventDefault()
                    }
                  }}
                  onWheel={(e) => e.currentTarget.blur()}
                  className={`input ${quantityError ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                />
                {quantityError && (
                  <p className="mt-1 text-xs text-red-600 dark:text-red-400">{quantityError}</p>
                )}
                {selectedUnit && isQtyValid && (
                  <div className="mt-2.5 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-900 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-200">
                    <p className="font-medium">
                      {parsedQty} {selectedUnit.name.toLowerCase()} ={' '}
                      {baseQuantity.toLocaleString('id-ID')} {baseUnitLabel} yang ditambahkan ke
                      stok
                    </p>
                  </div>
                )}
              </div>

              {/* Quantity summary */}
              {selectedUnit && isQtyValid && (
                <div className="rounded-md bg-slate-50 dark:bg-[#0B1220] border border-slate-200 dark:border-white/10 p-3 text-sm">
                  <p className="font-medium text-slate-700 dark:text-white">Ringkasan Transaksi</p>
                  <div className="mt-2 space-y-1 text-slate-600 dark:text-slate-300">
                    <div className="flex justify-between">
                      <span>Jumlah (satuan dasar)</span>
                      <span>
                        {baseQuantity.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Perkiraan stok baru</span>
                      <span className="font-medium text-slate-900 dark:text-white">
                        {(Number(selectedItem.current_stock) + baseQuantity).toLocaleString(
                          'id-ID',
                        )}{' '}
                        {selectedItem.base_unit?.symbol}
                      </span>
                    </div>
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
            onClick={() => {
              setSelectedItem(null)
              setSelectedUnit(null)
              setQuantity('1')
              setQuantityError(null)
            }}
            disabled={isPending}
          >
            Reset
          </button>
          <button
            id="btn-konfirmasi-barang-masuk"
            type="submit"
            className="btn-primary"
            disabled={isPending || !selectedItem || !selectedUnit || !isQtyValid}
          >
            {isPending ? 'Memproses…' : 'Konfirmasi Barang Masuk'}
          </button>
        </div>
      </form>

      {/* Confirm dialog */}
      {showConfirm && selectedItem && selectedUnit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
        >
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-[#17263D] border border-slate-200 dark:border-white/10">
            <h2 id="confirm-title" className="text-lg font-semibold text-slate-900 dark:text-white">
              Konfirmasi Barang Masuk
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p>
                <span className="font-medium">Barang:</span> {selectedItem.name}
              </p>
              <p>
                <span className="font-medium">Jumlah:</span> {parsedQty} {selectedUnit.name}{' '}
                {selectedUnit.conversion_factor > 1 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    ({baseQuantity.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol})
                  </span>
                )}
              </p>
              <p>
                <span className="font-medium">Stok sekarang:</span>{' '}
                {Number(selectedItem.current_stock).toLocaleString('id-ID')}{' '}
                {selectedItem.base_unit?.symbol}
              </p>
              <p>
                <span className="font-medium">Stok setelah:</span>{' '}
                {(Number(selectedItem.current_stock) + baseQuantity).toLocaleString('id-ID')}{' '}
                {selectedItem.base_unit?.symbol}
              </p>
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
                className="btn-primary disabled:bg-slate-200 dark:disabled:bg-[#203552] disabled:text-slate-400 dark:disabled:text-[#8494ab] disabled:opacity-100"
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