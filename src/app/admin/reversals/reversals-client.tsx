'use client'

import { useState, useEffect, useCallback, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'

interface Transaction {
  id: string
  transaction_number: string
  transaction_type: string
  input_quantity: bigint | string | number
  base_quantity: bigint | string | number
  quantity_delta: bigint | string | number
  transaction_at: string
  stock_before: bigint | string | number
  stock_after: bigint | string | number
  reason: string | null
  is_reversed: boolean
  items: { id: string; sku: string; barcode?: string; name: string } | null
  units: { id: string; name: string; symbol: string } | null
  profiles: { id: string; full_name: string; username: string } | null
}

interface ReversalsClientProps {
  transactions: Transaction[]
  totalCount: number
  page: number
  limit: number
  q: string
  typeFilter: string
  statusFilter: string
  dateFrom: string
  dateTo: string
}

const dtf = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

const TYPE_LABELS: Record<string, string> = {
  IN: 'Barang Masuk',
  OUT: 'Barang Keluar',
  ADJUSTMENT_IN: 'Penyesuaian +',
  ADJUSTMENT_OUT: 'Penyesuaian −',
  INITIAL: 'Stok Pembukaan',
}

const TYPE_CLASSES: Record<string, string> = {
  IN: 'bg-green-100 text-green-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  OUT: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  INITIAL: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
  ADJUSTMENT_IN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  ADJUSTMENT_OUT: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
}

export default function ReversalsClient({
  transactions,
  totalCount,
  page,
  limit,
  q,
  typeFilter,
  statusFilter,
  dateFrom,
  dateTo,
}: ReversalsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [localQ, setLocalQ] = useState(q)
  const [reversing, setReversing] = useState<string | null>(null)
  const [reason, setReason] = useState('')
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMsg = useCallback((type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 6000)
  }, [])

  const totalPages = Math.ceil(totalCount / limit)

  // Keep localQ in sync when URL parameter q changes
  useEffect(() => {
    setLocalQ(q)
  }, [q])

  const updateFilters = useCallback(
    (newParams: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString())

      Object.entries(newParams).forEach(([key, val]) => {
        if (val === null || val === '') {
          params.delete(key)
        } else {
          params.set(key, val)
        }
      })

      // Clean up defaults
      if (params.get('status') === 'available') params.delete('status')
      if (params.get('limit') === '10') params.delete('limit')

      const queryStr = params.toString()
      const targetUrl = queryStr ? `${pathname}?${queryStr}` : pathname
      router.push(targetUrl)
    },
    [pathname, router, searchParams],
  )

  // Debounce search query by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localQ !== q) {
        updateFilters({ q: localQ, page: '1' })
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [localQ, q, updateFilters])

  const handleResetFilter = () => {
    setLocalQ('')
    router.push(pathname)
  }

  const handlePageChange = (newPage: number) => {
    updateFilters({ page: String(newPage) })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleReversal = (txId: string) => {
    if (!reason.trim() || reason.trim().length < 3) {
      showMsg('error', 'Alasan pembatalan minimal 3 karakter.')
      return
    }

    startTransition(async () => {
      const formData = new FormData()
      formData.set('client_request_id', crypto.randomUUID())
      formData.set('original_transaction_id', txId)
      formData.set('reason', reason.trim())

      const res = await fetch('/api/transactions/reversal', {
        method: 'POST',
        body: formData,
      })
      const result = (await res.json()) as {
        success: boolean
        error?: string
        data?: { transaction_number?: string }
      }

      if (result.success) {
        showMsg('success', `Pembatalan ${result.data?.transaction_number ?? ''} berhasil dicatat.`)
        setReversing(null)
        setReason('')
        router.refresh()
      } else {
        showMsg('error', result.error ?? 'Gagal membatalkan transaksi.')
      }
    })
  }

  // Calculate pagination page numbers with ellipsis
  const getPageNumbers = () => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1)
    }
    const pages: (number | string)[] = []
    if (page <= 4) {
      pages.push(1, 2, 3, 4, 5, '...', totalPages)
    } else if (page >= totalPages - 3) {
      pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages)
    } else {
      pages.push(1, '...', page - 1, page, page + 1, '...', totalPages)
    }
    return pages
  }

  const fromIndex = totalCount === 0 ? 0 : (page - 1) * limit + 1
  const toIndex = Math.min(page * limit, totalCount)

  return (
    <div className="space-y-6">
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success' : 'alert-error'}>
          {message.text}
        </div>
      )}

      {/* Filter Panel */}
      <div className="card space-y-4">
        {/* Row 1: Search */}
        <div>
          <label htmlFor="search-q" className="label mb-1">
            Pencarian
          </label>
          <div className="relative">
            <input
              id="search-q"
              type="search"
              placeholder="Cari nomor transaksi, nama barang, SKU, atau barcode…"
              value={localQ}
              onChange={(e) => setLocalQ(e.target.value)}
              className="input pr-8"
            />
            {localQ && (
              <button
                type="button"
                onClick={() => {
                  setLocalQ('')
                  updateFilters({ q: null, page: '1' })
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                title="Hapus pencarian"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Type, Status, Date From, Date To, Reset */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end">
          <div>
            <label htmlFor="filter-type" className="label mb-1">
              Jenis Transaksi
            </label>
            <select
              id="filter-type"
              value={typeFilter}
              onChange={(e) => updateFilters({ type: e.target.value || null, page: '1' })}
              className="input"
            >
              <option value="">Semua Jenis</option>
              <option value="IN">Barang Masuk (IN)</option>
              <option value="OUT">Barang Keluar (OUT)</option>
              <option value="ADJUSTMENT_IN">Penyesuaian Masuk (+)</option>
              <option value="ADJUSTMENT_OUT">Penyesuaian Keluar (−)</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-status" className="label mb-1">
              Status Pembatalan
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => updateFilters({ status: e.target.value, page: '1' })}
              className="input"
            >
              <option value="available">Dapat Dibatalkan</option>
              <option value="reversed">Sudah Dibatalkan</option>
              <option value="all">Semua Status</option>
            </select>
          </div>

          <div>
            <label htmlFor="filter-from" className="label mb-1">
              Dari Tanggal
            </label>
            <input
              id="filter-from"
              type="date"
              value={dateFrom}
              onChange={(e) => updateFilters({ from: e.target.value || null, page: '1' })}
              className="input"
              max={dateTo || undefined}
            />
          </div>

          <div>
            <label htmlFor="filter-to" className="label mb-1">
              Sampai Tanggal
            </label>
            <input
              id="filter-to"
              type="date"
              value={dateTo}
              onChange={(e) => updateFilters({ to: e.target.value || null, page: '1' })}
              className="input"
              min={dateFrom || undefined}
            />
          </div>

          <div>
            <button
              type="button"
              id="btn-reset-filters"
              onClick={handleResetFilter}
              className="btn-secondary w-full"
            >
              Reset Filter
            </button>
          </div>
        </div>
      </div>

      {/* Header Summary & Limit Selector */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-sm text-slate-600 dark:text-slate-300">
        <div>
          {totalCount > 0 ? (
            <span>
              Menampilkan <strong className="font-semibold text-slate-900 dark:text-slate-100">{fromIndex}–{toIndex}</strong> dari <strong className="font-semibold text-slate-900 dark:text-slate-100">{totalCount.toLocaleString('id-ID')}</strong> transaksi
            </span>
          ) : (
            <span>Tidak ada data transaksi</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="select-limit" className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
            Tampilkan per halaman:
          </label>
          <select
            id="select-limit"
            value={limit}
            onChange={(e) => updateFilters({ limit: e.target.value, page: '1' })}
            className="input w-24 py-1 text-xs"
          >
            <option value="10">10</option>
            <option value="25">25</option>
            <option value="50">50</option>
          </select>
        </div>
      </div>

      {/* Transactions List / Empty State */}
      {transactions.length === 0 ? (
        <div className="card py-12 text-center text-slate-500 dark:text-slate-400 space-y-3">
          <p className="text-base font-medium">Tidak ada transaksi yang sesuai dengan filter.</p>
          <button type="button" onClick={handleResetFilter} className="btn-secondary text-sm">
            Reset Filter
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {transactions.map((tx) => {
            const isReversed = tx.is_reversed
            return (
              <div key={tx.id} className="card">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <code className="code-chip">{tx.transaction_number}</code>
                      <span
                        className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          TYPE_CLASSES[tx.transaction_type] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
                      </span>
                      {isReversed ? (
                        <span className="inline-flex items-center rounded-full bg-red-100 dark:bg-red-900/40 px-2.5 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                          Sudah Dibatalkan
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          Dapat Dibatalkan
                        </span>
                      )}
                    </div>

                    <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
                      {tx.items?.name ?? '—'}
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      SKU: <span className="font-mono">{tx.items?.sku ?? '—'}</span>
                      {tx.items?.barcode && ` · Barcode: ${tx.items.barcode}`}
                      {' · '}Jumlah: <strong className="font-semibold text-slate-700 dark:text-slate-200">{Number(tx.input_quantity).toLocaleString('id-ID')} {tx.units?.symbol}</strong>
                    </p>

                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Oleh: {tx.profiles?.full_name ?? tx.profiles?.username ?? '—'} · Waktu: {dtf.format(new Date(tx.transaction_at))}
                    </p>

                    {tx.reason && (
                      <p className="text-xs italic text-slate-500 dark:text-slate-400">
                        Alasan asal: &ldquo;{tx.reason}&rdquo;
                      </p>
                    )}
                  </div>

                  <div>
                    {isReversed ? (
                      <button
                        type="button"
                        disabled
                        className="btn-secondary text-xs px-3 py-1.5 cursor-not-allowed opacity-60"
                        title="Transaksi ini sudah dibatalkan."
                      >
                        Sudah Dibatalkan
                      </button>
                    ) : (
                      <button
                        id={`btn-balik-${tx.id}`}
                        type="button"
                        className="btn-danger text-xs px-3 py-1.5 whitespace-nowrap"
                        onClick={() => {
                          setReversing(tx.id)
                          setReason('')
                        }}
                        disabled={isPending || reversing === tx.id}
                      >
                        Batalkan Transaksi
                      </button>
                    )}
                  </div>
                </div>

                {/* Inline Reversal Confirmation Form */}
                {reversing === tx.id && !isReversed && (
                  <div className="mt-4 rounded-md bg-red-50/50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/40 p-4 space-y-3">
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                      Konfirmasi Pembatalan Transaksi
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-300">
                      Pembatalan akan mengembalikan perubahan stok dari transaksi ini. Transaksi asli tetap tersimpan dalam riwayat sebagai bagian dari catatan audit.
                    </p>
                    <div>
                      <label htmlFor={`reason-${tx.id}`} className="label mb-1">
                        Alasan Pembatalan <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        id={`reason-${tx.id}`}
                        rows={2}
                        maxLength={500}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Contoh: Salah jumlah stok atau kesalahan input..."
                        className="input"
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        id={`btn-konfirmasi-balik-${tx.id}`}
                        type="button"
                        className="btn-danger text-xs"
                        onClick={() => handleReversal(tx.id)}
                        disabled={isPending || !reason.trim() || reason.trim().length < 3}
                      >
                        {isPending ? 'Memproses…' : 'Konfirmasi Pembatalan Transaksi'}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() => {
                          setReversing(null)
                          setReason('')
                        }}
                        disabled={isPending}
                      >
                        Batal
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination Nav */}
      {totalPages > 1 && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-t border-slate-200 dark:border-slate-800 pt-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Halaman <strong className="font-semibold text-slate-800 dark:text-slate-200">{page}</strong> dari <strong className="font-semibold text-slate-800 dark:text-slate-200">{totalPages}</strong>
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {/* Previously button */}
            <button
              type="button"
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
              className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40"
            >
              &laquo; Sebelumnya
            </button>

            {/* Page numbers with ellipsis */}
            {getPageNumbers().map((pNum, idx) => {
              if (pNum === '...') {
                return (
                  <span key={`ellipsis-${idx}`} className="px-2 text-xs text-slate-400 dark:text-slate-500">
                    ...
                  </span>
                )
              }

              const isCurrent = pNum === page
              return (
                <button
                  key={`page-${pNum}`}
                  type="button"
                  onClick={() => handlePageChange(pNum as number)}
                  className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                    isCurrent
                      ? 'bg-blue-600 text-white dark:bg-[#22D3EE] dark:text-slate-900 font-bold'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                  }`}
                >
                  {pNum}
                </button>
              )
            })}

            {/* Next button */}
            <button
              type="button"
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
              className="btn-secondary text-xs px-2.5 py-1 disabled:opacity-40"
            >
              Berikutnya &raquo;
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
