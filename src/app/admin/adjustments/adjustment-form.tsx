'use client'

/**
 * AdjustmentForm — physical stock count adjustment UI.
 * Redesigned with responsive desktop grid, unified card, and compact recent history.
 */

import { useState, useTransition, useRef } from 'react'
import Link from 'next/link'
import ItemSearchInput from '@/components/item-search-input'
import { formatAdjustmentSuccessMessage } from '@/lib/stock-adjustment'
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

const dtf = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

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
          formatAdjustmentSuccessMessage({
            transactionNumber: result.data?.transaction_number,
            delta: result.data?.delta,
            newStock: result.data?.new_stock,
            unitSymbol: selectedItem.base_unit?.symbol,
          }),
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
    <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,420px)] xl:items-start">
      {/* Column 1: Main Adjustment Form Card */}
      <div className="min-w-0 space-y-4">
        {message && (
          <div role="alert" className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
            {message.text}
          </div>
        )}

        <div className="card p-6 space-y-6 min-w-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 border-b border-slate-200 dark:border-white/10 pb-3">
            Formulir Penyesuaian Stok
          </h2>

          {/* Item selection */}
          <div className="min-w-0">
            <label className="label mb-1.5">
              Barang <span className="text-red-500">*</span>
            </label>
            <ItemSearchInput
              onSelect={(item) => {
                setSelectedItem(item as unknown as SelectedItem)
                setPhysicalStock('')
                requestIdRef.current = crypto.randomUUID()
              }}
              placeholder="Cari barang aktif berdasarkan nama, SKU, atau barcode…"
              preselected={selectedItem ? { id: selectedItem.id, name: selectedItem.name, sku: selectedItem.sku } : null}
            />
          </div>

          {selectedItem && (
            <>
              {/* Selected Item Details */}
              <div className="rounded-lg bg-blue-50 dark:bg-[#22D3EE]/10 border border-blue-200 dark:border-[#22D3EE]/30 p-4 space-y-1.5 min-w-0">
                <p className="text-base font-semibold text-blue-900 dark:text-[#22D3EE] break-words">{selectedItem.name}</p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-700 dark:text-[#22D3EE]/90">
                  <span className="break-all">SKU: <code className="font-mono">{selectedItem.sku}</code></span>
                  <span>Stok sistem: <strong className="font-bold">{Number(selectedItem.current_stock).toLocaleString('id-ID')}</strong> {selectedItem.base_unit?.symbol}</span>
                </div>
              </div>

              {/* Physical Stock Input */}
              <div className="min-w-0">
                <label htmlFor="adj-physical-stock" className="label mb-1.5">
                  Stok Fisik ({selectedItem.base_unit?.symbol}) <span className="text-red-500">*</span>
                </label>
                <input
                  id="adj-physical-stock"
                  type="number"
                  min={0}
                  step={1}
                  value={physicalStock}
                  onChange={(e) => setPhysicalStock(e.target.value)}
                  className="input w-full"
                  placeholder="Masukkan jumlah stok fisik hasil opname"
                />
              </div>

              {/* Delta Summary Box */}
              {delta !== null && physicalStock !== '' && (
                <div
                  className={`rounded-lg p-4 text-sm border font-medium transition-colors min-w-0 break-words ${
                    delta === 0
                      ? 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-[#0B1220] dark:text-slate-300 dark:border-white/10'
                      : delta > 0
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50'
                        : 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50'
                  }`}
                >
                  <p className="font-bold text-base mb-0.5">
                    Selisih: {delta > 0 ? '+' : ''}{delta.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}
                  </p>
                  <p className="text-xs font-normal opacity-90">
                    {delta === 0 && 'Stok fisik sama dengan stok sistem. Tidak ada perubahan yang dibuat.'}
                    {delta > 0 && 'Stok fisik lebih banyak. Sistem akan mencatat transaksi Penyesuaian Masuk (ADJUSTMENT_IN).'}
                    {delta < 0 && 'Stok fisik lebih sedikit. Sistem akan mencatat transaksi Penyesuaian Keluar (ADJUSTMENT_OUT).'}
                  </p>
                </div>
              )}

              {/* Reason Input */}
              <div className="min-w-0">
                <label htmlFor="adj-reason" className="label mb-1.5">
                  Alasan Penyesuaian <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="adj-reason"
                  rows={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Contoh: Hasil stok opname bulanan atau koreksi barang rusak..."
                  className="input w-full"
                />
              </div>

              {/* Submit Button */}
              <button
                id="btn-konfirmasi-penyesuaian"
                type="button"
                className="btn-primary w-full disabled:bg-slate-200 dark:disabled:bg-[#203552] disabled:text-slate-400 dark:disabled:text-[#8494ab] disabled:opacity-100"
                disabled={isPending || !physicalStock || !reason.trim() || delta === 0}
                onClick={() => setShowConfirm(true)}
              >
                {isPending ? 'Memproses…' : 'Konfirmasi Penyesuaian'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Column 2: Side Column — Penyesuaian Terbaru (Max 5 items, max-w 420px) */}
      <div className="min-w-0">
        <div className="card p-6 space-y-4 min-w-0">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-white/10 pb-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Penyesuaian Terbaru
            </h2>
            <Link
              href="/admin/reports?type=ADJUSTMENT"
              className="text-xs font-medium text-blue-600 dark:text-[#22D3EE] hover:underline"
            >
              Lihat semua →
            </Link>
          </div>

          {recentAdjustments.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
              Belum ada penyesuaian stok.
            </p>
          ) : (
            <div className="space-y-3">
              {recentAdjustments.slice(0, 5).map((adj) => {
                const qDelta = Number(adj.quantity_delta)
                return (
                  <div
                    key={adj.id}
                    className="rounded-lg border border-slate-200 dark:border-white/10 p-3.5 text-sm bg-slate-50/50 dark:bg-[#0B1220]/50 hover:bg-slate-100/50 dark:hover:bg-[#203552]/30 transition-colors min-w-0"
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0">
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <code className="code-chip text-[11px]">{adj.transaction_number}</code>
                        </div>
                        <p className="font-semibold text-slate-900 dark:text-slate-100 break-words">
                          {adj.items?.name ?? '—'}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 break-words">
                          {adj.reason ?? '—'}
                        </p>
                      </div>

                      <div className="shrink-0 text-right space-y-1">
                        <span
                          className={`inline-flex rounded-md px-2 py-0.5 text-xs font-bold whitespace-nowrap ${
                            qDelta >= 0
                              ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                          }`}
                        >
                          {qDelta >= 0 ? '+' : ''}{qDelta.toLocaleString('id-ID')} {adj.units?.symbol}
                        </span>
                        <p className="text-[11px] text-slate-400 dark:text-slate-500 whitespace-nowrap">
                          {dtf.format(new Date(adj.transaction_at))}
                        </p>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Confirm modal dialog */}
      {showConfirm && selectedItem && delta !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl dark:bg-[#17263D] border border-slate-200 dark:border-white/10 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Konfirmasi Penyesuaian Stok
            </h2>
            <div className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
              <p><span className="font-medium text-slate-900 dark:text-white">Barang:</span> <span className="break-words">{selectedItem.name}</span></p>
              <p><span className="font-medium text-slate-900 dark:text-white">Stok sistem:</span> {Number(selectedItem.current_stock).toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              <p><span className="font-medium text-slate-900 dark:text-white">Stok fisik:</span> {physicalNum?.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}</p>
              <p>
                <span className="font-medium text-slate-900 dark:text-white">Selisih:</span>{' '}
                <strong className={delta >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-bold' : 'text-red-600 dark:text-red-400 font-bold'}>
                  {delta >= 0 ? '+' : ''}{delta.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol}
                </strong>
              </p>
              <p><span className="font-medium text-slate-900 dark:text-white">Alasan:</span> <span className="break-words">{reason}</span></p>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => setShowConfirm(false)}
                disabled={isPending}
              >
                Batal
              </button>
              <button
                id="btn-konfirmasi-ok"
                type="button"
                className="btn-primary text-sm"
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
