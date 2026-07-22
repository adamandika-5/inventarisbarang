'use client'

/**
 * AdjustmentForm — physical stock count adjustment UI.
 * Follows the exact flow from spec section 13.
 */

import { useState, useTransition, useRef } from 'react'
import ItemSearchInput from '@/components/item-search-input'
import { processAdjustment } from './actions'

interface AdjTx {
  id: string
  transaction_number: string
  transaction_type: string
  input_quantity: bigint | string | number
  quantity_delta: bigint | string | number
  transaction_at: string
  stock_before: bigint | string | number
  stock_after: bigint | string | number
  reason: string | null
  items: { id: string; sku: string; name: string } | null
  units: { id: string; name: string; symbol: string } | null
  profiles: { id: string; full_name: string; username: string } | null
}

interface SelectedItem {
  id: string
  sku: string
  name: string
  current_stock: bigint | string | number
  base_unit: { id: string; name: string; symbol: string } | null
  item_units: never[]
}

const dtf = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' })

export default function AdjustmentForm({ recentAdjustments }: { recentAdjustments: AdjTx[] }) {
  const [selectedItem, setSelectedItem] = useState<SelectedItem | null>(null)
  const [physicalStock, setPhysicalStock] = useState('')
  const [reason, setReason] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const requestIdRef = useRef(crypto.randomUUID())

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }

  const currentStock = selectedItem ? Number(selectedItem.current_stock) : null
  const physicalNum = physicalStock !== '' ? parseInt(physicalStock, 10) : null
  const delta = physicalNum !== null && currentStock !== null ? physicalNum - currentStock : null

  const handleConfirm = () => {
    setShowConfirm(false)
    if (!selectedItem || physicalNum === null || !reason.trim()) return
    if (delta === 0) {
      showMsg('error', 'Stok fisik sama dengan stok sistem. Tidak ada penyesuaian yang dibuat.')
      return
    }

    const formData = new FormData()
    formData.set('client_request_id', requestIdRef.current)
    formData.set('item_id', selectedItem.id)
    formData.set('physical_stock', String(physicalNum))
    formData.set('reason', reason)

    startTransition(async () => {
      const result = await processAdjustment(formData)
      if (result.success) {
        showMsg(
          'success',
          `Penyesuaian ${result.data?.transaction_number ?? ''} berhasil. Delta: ${result.data?.delta ?? 0 > 0 ? '+' : ''}${result.data?.delta} · Stok baru: ${result.data?.new_stock?.toLocaleString('id-ID')} ${selectedItem.base_unit?.symbol}`,
        )
        setSelectedItem(null)
        setPhysicalStock('')
        setReason('')
        requestIdRef.current = crypto.randomUUID()
      } else {
        showMsg('error', result.error ?? 'Gagal melakukan penyesuaian.')
      }
    })
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Form */}
      <div>
        {message && (
          <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
            {message.text}
          </div>
        )}

        <div className="card space-y-4">
          {/* Item selection */}
          <div>
            <label className="label mb-1">Barang <span className="text-red-500">*</span></label>
            <ItemSearchInput
              onSelect={(item) => {
                setSelectedItem(item as unknown as SelectedItem)
                setPhysicalStock('')
                requestIdRef.current = crypto.randomUUID()
              }}
              placeholder="Cari barang aktif…"
              preselected={selectedItem ? { id: selectedItem.id, name: selectedItem.name, sku: selectedItem.sku } : null}
            />
          </div>

          {selectedItem && (
            <>
              <div className="rounded-md bg-blue-50 p-3 text-sm">
                <p className="font-medium text-blue-800">{selectedItem.name}</p>
                <p className="text-blue-600">
                  Stok sistem: <strong>{Number(selectedItem.current_stock).toLocaleString('id-ID')}</strong>{' '}
                  {selectedItem.base_unit?.symbol}
                </p>
              </div>

              <div>
                <label htmlFor="adj-physical-stock" className="label mb-1">
                  Stok Fisik ({selectedItem.base_unit?.symbol}) <span className="text-red-500">*</span>
                </label>
                <input
                  id="adj-physical-stock"
                  type="number"
                  min={0}
                  step={1}
                  value={physicalStock}
                  onChange={(e) => setPhysicalStock(e.target.value)}
                  className="input"
                  placeholder="Masukkan jumlah stok fisik"
                />
              </div>

              {delta !== null && physicalStock !== '' && (
                <div className={`rounded-md p-3 text-sm ${
                  delta === 0
                    ? 'bg-slate-50 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                    : delta > 0
                      ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                      : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                }`}>
                  Selisih: {delta > 0 ? '+' : ''}{delta.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}
                  {delta === 0 && ' — tidak ada perubahan'}
                  {delta > 0 && ' — akan membuat ADJUSTMENT_IN'}
                  {delta < 0 && ' — akan membuat ADJUSTMENT_OUT'}
                </div>
              )}

              <div>
                <label htmlFor="adj-reason" className="label mb-1">
                  Alasan <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="adj-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Hasil opname fisik tanggal 20 Juli 2026"
                  className="input"
                />
              </div>

              <button
                id="btn-konfirmasi-penyesuaian"
                type="button"
                className="btn-primary w-full"
                disabled={isPending || !physicalStock || !reason.trim() || delta === 0}
                onClick={() => setShowConfirm(true)}
              >
                {isPending ? 'Memproses…' : 'Konfirmasi Penyesuaian'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Recent adjustments */}
      <div>
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Penyesuaian Terbaru</h2>
        {recentAdjustments.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada penyesuaian.</p>
        ) : (
          <div className="space-y-2">
            {recentAdjustments.map((adj) => {
              const delta = Number(adj.quantity_delta)
              return (
                <div key={adj.id} className="card text-sm">
                  <div className="flex items-start justify-between">
                    <div>
                      <code className="code-chip">{adj.transaction_number}</code>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{adj.items?.name ?? '—'}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{adj.reason ?? '—'}</p>
                    </div>
                    <div className="text-right">
                      <span className={delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>
                        {delta >= 0 ? '+' : ''}{delta.toLocaleString('id-ID')}
                      </span>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{dtf.format(new Date(adj.transaction_at))}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {showConfirm && selectedItem && delta !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true">
          <div className="mx-4 w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-slate-800">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Konfirmasi Penyesuaian</h2>
            <div className="mt-3 space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p><span className="font-medium">Barang:</span> {selectedItem.name}</p>
              <p><span className="font-medium">Stok sistem:</span> {Number(selectedItem.current_stock).toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              <p><span className="font-medium">Stok fisik:</span> {physicalNum?.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              <p><span className="font-medium">Selisih:</span> <span className={delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}>{delta >= 0 ? '+' : ''}{delta.toLocaleString('id-ID')}</span></p>
              <p><span className="font-medium">Alasan:</span> {reason}</p>
            </div>
            <div className="mt-5 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setShowConfirm(false)} disabled={isPending}>Batal</button>
              <button id="btn-konfirmasi-ok" type="button" className="btn-primary" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Menyimpan…' : 'Ya, Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
