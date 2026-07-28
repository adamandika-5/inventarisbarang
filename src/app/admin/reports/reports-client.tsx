'use client'

/**
 * ReportsClient — filter controls, summary cards, transaction table, CSV export.
 *
 * SECURITY:
 * - CSV export sanitizes values starting with =, +, -, @ to prevent formula injection.
 * - No price/cost data rendered — those are in private schema.
 * - All data comes from server-side query, filtered by authenticated session.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useCallback, useState, useEffect, useTransition } from 'react'
import { formatInTimeZone } from 'date-fns-tz'

const TZ = 'Asia/Jakarta'

// ── Types ─────────────────────────────────────────────────────────────────────

type TransactionType = 'IN' | 'OUT' | 'INITIAL' | 'ADJUSTMENT_IN' | 'ADJUSTMENT_OUT' | 'REVERSAL'

type TxItem = {
  id: string
  sku: string
  name: string
} | null

type TxUnit = {
  id: string
  name: string
  symbol: string
} | null

type TxProfile = {
  id: string
  full_name: string
  username: string
} | null

type Transaction = {
  id: string
  transaction_number: string
  transaction_type: TransactionType
  input_quantity: number
  base_quantity: number
  quantity_delta: number
  transaction_at: string
  stock_before: number
  stock_after: number
  reason: string | null
  is_reversed: boolean
  items: TxItem
  units: TxUnit
  profiles: TxProfile
}

type LowStockItem = {
  id: string
  sku: string
  name: string
  current_stock: number
  minimum_stock: number
  base_unit: { id: string; name: string; symbol: string } | null
}

type Summary = {
  totalIn: number
  totalOut: number
  totalAdjustmentIn: number
  totalAdjustmentOut: number
  totalReversal: number
  totalTransactions: number
  lowStockCount: number
}

interface ReportsClientProps {
  dateFrom: string
  dateTo: string
  typeFilter: string
  itemFilter: string
  summary: Summary
  transactions: Transaction[]
  totalCount: number
  page: number
  pageSize: number
  lowStockItems: LowStockItem[]
  lowStockError: boolean
}

// ── Type label helpers ─────────────────────────────────────────────────────────

const TYPE_LABELS: Record<TransactionType, string> = {
  IN: 'Barang Masuk',
  OUT: 'Barang Keluar',
  INITIAL: 'Stok Pembukaan',
  ADJUSTMENT_IN: 'Penyesuaian +',
  ADJUSTMENT_OUT: 'Penyesuaian −',
  REVERSAL: 'Koreksi',
}

const TYPE_CLASSES: Record<TransactionType, string> = {
  IN: 'bg-green-100 text-green-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50',
  OUT: 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 dark:border dark:border-red-700/50',
  INITIAL: 'bg-blue-100 text-blue-800 dark:bg-[#22D3EE]/20 dark:text-[#22D3EE] dark:border dark:border-[#22D3EE]/30',
  ADJUSTMENT_IN: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border dark:border-emerald-700/50',
  ADJUSTMENT_OUT: 'bg-orange-100 text-orange-800 dark:bg-amber-950/60 dark:text-amber-300 dark:border dark:border-amber-700/50',
  REVERSAL: 'bg-slate-100 text-slate-700 dark:bg-[#0B1220] dark:text-slate-300 dark:border dark:border-white/10',
}

// ── WIB formatting ─────────────────────────────────────────────────────────────────

function formatWib(isoString: string): string {
  try {
    return formatInTimeZone(new Date(isoString), TZ, 'dd/MM/yyyy HH:mm')
  } catch {
    return isoString
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ReportsClient({
  dateFrom,
  dateTo,
  typeFilter,
  summary,
  transactions,
  totalCount,
  page,
  pageSize,
  lowStockItems,
  lowStockError,
}: ReportsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()

  const [localFrom, setLocalFrom] = useState(dateFrom)
  const [localTo, setLocalTo] = useState(dateTo)
  const [localType, setLocalType] = useState(typeFilter ? typeFilter : 'ALL')

  // Sync state when props/URL parameters change
  useEffect(() => {
    setLocalFrom(dateFrom)
    setLocalTo(dateTo)
    setLocalType(typeFilter ? typeFilter : 'ALL')
  }, [dateFrom, dateTo, typeFilter])

  const hasActiveFilter = Boolean(
    searchParams.has('from') ||
      searchParams.has('to') ||
      (searchParams.has('type') && searchParams.get('type') !== 'ALL') ||
      searchParams.has('item') ||
      (typeFilter && typeFilter !== 'ALL') ||
      (localType && localType !== 'ALL'),
  )

  const handleReset = (e: React.MouseEvent) => {
    e.preventDefault()
    setLocalFrom(dateFrom)
    setLocalTo(dateTo)
    setLocalType('ALL')
    startTransition(() => {
      router.replace('/admin/reports')
    })
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  // ── Navigation helpers ────────────────────────────────────────────────────────

  const buildUrl = useCallback(
    (overrides: Record<string, string | number>) => {
      const params = new URLSearchParams(searchParams.toString())
      for (const [k, v] of Object.entries(overrides)) {
        if (v === '' || v === null || v === undefined) {
          params.delete(k)
        } else {
          params.set(k, String(v))
        }
      }
      return `${pathname}?${params.toString()}`
    },
    [pathname, searchParams],
  )

  const goToPage = (p: number) => {
    startTransition(() => {
      router.push(buildUrl({ page: p }))
    })
  }

  // ── Excel Export Handlers ───────────────────────────────────────────────────

  const [downloadingSummary, setDownloadingSummary] = useState(false)
  const [downloadingDetail, setDownloadingDetail] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  const downloadExcel = async (url: string, defaultFilename: string) => {
    try {
      setDownloadError(null)
      const res = await fetch(url)
      if (!res.ok) {
        let message = 'Gagal mengunduh file laporan.'
        try {
          const contentType = res.headers.get('content-type') ?? ''
          if (contentType.includes('application/json')) {
            const body = await res.json()
            message = body.error || body.message || message
          } else {
            const body = await res.text()
            if (body.trim()) message = body
          }
        } catch {
          // Use default fallback message
        }
        throw new Error(message)
      }

      let filename = defaultFilename
      const disposition = res.headers.get('content-disposition')
      if (disposition && disposition.includes('filename=')) {
        const match = disposition.match(/filename="?([^"]+)"?/)
        if (match?.[1]) {
          filename = match[1]
        }
      }

      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch (err: unknown) {
      console.error('Excel Download Error:', err)
      setDownloadError(err instanceof Error ? err.message : 'Terjadi kesalahan saat mengunduh laporan.')
    }
  }

  const handleExportInventorySummary = async () => {
    setDownloadingSummary(true)
    const url = `/api/reports/inventory-summary?from=${encodeURIComponent(localFrom)}&to=${encodeURIComponent(localTo)}`
    await downloadExcel(url, `laporan-rincian-persediaan-${localFrom}-sampai-${localTo}.xlsx`)
    setDownloadingSummary(false)
  }

  const handleExportTransactionsDetail = async () => {
    setDownloadingDetail(true)
    let url = `/api/reports/transactions-detail?from=${encodeURIComponent(localFrom)}&to=${encodeURIComponent(localTo)}`
    if (localType && localType !== 'ALL') url += `&type=${encodeURIComponent(localType)}`
    await downloadExcel(url, `riwayat-transaksi-${localFrom}-sampai-${localTo}.xlsx`)
    setDownloadingDetail(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Filter bar — Native GET Form */}
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Filter Laporan</h2>
        <form action="/admin/reports" method="GET" className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="filter-from" className="label mb-1">
              Dari Tanggal
            </label>
            <input
              id="filter-from"
              name="from"
              type="date"
              value={localFrom}
              onChange={(e) => setLocalFrom(e.target.value)}
              className="input w-40"
              max={localTo}
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="label mb-1">
              Sampai Tanggal
            </label>
            <input
              id="filter-to"
              name="to"
              type="date"
              value={localTo}
              onChange={(e) => setLocalTo(e.target.value)}
              className="input w-40"
              min={localFrom}
            />
          </div>
          <div>
            <label htmlFor="filter-type" className="label mb-1">
              Jenis Transaksi
            </label>
            <select
              id="filter-type"
              name="type"
              value={localType || 'ALL'}
              onChange={(e) => setLocalType(e.target.value)}
              className="input w-44"
            >
              <option value="ALL">Semua Jenis</option>
              <option value="INITIAL">Stok Pembukaan</option>
              <option value="IN">Barang Masuk</option>
              <option value="OUT">Barang Keluar</option>
              <option value="ADJUSTMENT">Penyesuaian</option>
              <option value="REVERSAL">Koreksi</option>
            </select>
          </div>
          {localType === 'INITIAL' && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Stok yang pertama kali dicatat ketika barang mulai digunakan dalam sistem.
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              id="btn-apply-filter"
              className="btn-primary"
            >
              Terapkan
            </button>
            <button
              type="button"
              id="btn-reset-filter"
              onClick={handleReset}
              disabled={!hasActiveFilter}
              className="btn-secondary flex items-center justify-center px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Reset
            </button>
          </div>
        </form>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <SummaryCard
          label="Total Masuk"
          value={summary.totalIn.toLocaleString('id-ID')}
          color="green"
          icon="↑"
        />
        <SummaryCard
          label="Total Keluar"
          value={summary.totalOut.toLocaleString('id-ID')}
          color="red"
          icon="↓"
        />
        <SummaryCard
          label="Transaksi"
          value={summary.totalTransactions.toLocaleString('id-ID')}
          color="blue"
          icon="≡"
        />
        <SummaryCard
          label="Stok Rendah"
          value={summary.lowStockCount.toLocaleString('id-ID')}
          color={summary.lowStockCount > 0 ? 'orange' : 'gray'}
          icon="⚠"
        />
      </div>

      {/* Download Error Banner if any */}
      {downloadError && (
        <div className="alert-error flex items-center justify-between">
          <span>{downloadError}</span>
          <button
            type="button"
            onClick={() => setDownloadError(null)}
            className="text-xs font-semibold underline ml-4"
          >
            Tutup
          </button>
        </div>
      )}

      {/* Transactions table */}
      <div className="card">
        <div className="mb-4 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Riwayat Transaksi
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({totalCount.toLocaleString('id-ID')} total)
            </span>
          </h2>
          <div className="grid w-full gap-2 sm:grid-cols-2 xl:w-auto">
            <button
              type="button"
              id="btn-export-inventory-summary"
              onClick={handleExportInventorySummary}
              disabled={downloadingSummary}
              className="btn-primary flex items-center justify-center w-full whitespace-nowrap text-sm font-semibold shadow-sm xl:w-auto disabled:opacity-50"
              title="Unduh Laporan Rincian Barang Persediaan dalam format Excel (Gambar 2)"
            >
              <svg className="mr-1.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {downloadingSummary ? 'Mengunduh Rincian...' : 'Export Rincian Persediaan (Excel)'}
            </button>
            <button
              type="button"
              id="btn-export-transactions-detail"
              onClick={handleExportTransactionsDetail}
              disabled={downloadingDetail}
              className="btn-secondary flex items-center justify-center w-full whitespace-nowrap text-sm font-semibold xl:w-auto disabled:opacity-50"
              title="Unduh Detail Riwayat Transaksi dalam format Excel"
            >
              <svg className="mr-1.5 h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloadingDetail ? 'Mengunduh Riwayat...' : 'Export Riwayat Transaksi (Excel)'}
            </button>
          </div>
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada transaksi dalam rentang tanggal ini.</p>
          </div>
        ) : (
          <div>
            <div className="w-full overflow-x-auto">
              <table className="table min-w-[1100px]">
                <thead>
                  <tr>
                    <th className="min-w-[180px] whitespace-nowrap">No. Transaksi</th>
                    <th>Tanggal (WIB)</th>
                    <th>Jenis</th>
                    <th>Barang</th>
                    <th className="text-right">Jumlah</th>
                    <th className="text-right">Stok Sesudah</th>
                    <th>Oleh</th>
                    <th>Alasan</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((tx) => (
                    <tr key={tx.id} className={tx.is_reversed ? 'opacity-50' : ''}>
                      <td className="min-w-[180px] whitespace-nowrap font-mono text-xs">
                        <span className="code-chip inline-block whitespace-nowrap">{tx.transaction_number}</span>
                      </td>
                      <td className="whitespace-nowrap text-xs text-slate-500 dark:text-slate-400">
                        {formatWib(tx.transaction_at)}
                      </td>
                      <td>
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASSES[tx.transaction_type] ?? 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                            }`}
                        >
                          {TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type}
                          {tx.is_reversed && ' (Dibatalkan)'}
                        </span>
                      </td>
                      <td>
                        <span className="block font-medium text-slate-900 dark:text-slate-100">
                          {tx.items?.name ?? '—'}
                        </span>
                        <span className="block text-xs text-slate-400 dark:text-slate-500">{tx.items?.sku}</span>
                      </td>
                      <td className="text-right tabular-nums">
                        <span
                          className={tx.quantity_delta >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                        >
                          {tx.quantity_delta >= 0 ? '+' : ''}
                          {tx.quantity_delta.toLocaleString('id-ID')}
                        </span>
                        <span className="ml-1 text-xs text-slate-400 dark:text-slate-500">{tx.units?.symbol}</span>
                      </td>
                      <td className="text-right tabular-nums text-slate-700 dark:text-slate-200">
                        {tx.stock_after.toLocaleString('id-ID')}
                      </td>
                      <td className="text-sm text-slate-600 dark:text-slate-300">
                        {tx.profiles?.full_name ?? tx.profiles?.username ?? '—'}
                      </td>
                      <td className="max-w-[180px] truncate text-xs text-slate-500 dark:text-slate-400" title={tx.reason ?? undefined}>
                        {tx.reason ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between text-sm text-slate-600 dark:text-slate-300">
                <span>
                  Halaman {page} dari {totalPages}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => goToPage(page - 1)}
                    disabled={page <= 1}
                    className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 disabled:opacity-40"
                  >
                    ‹ Sebelumnya
                  </button>
                  <button
                    type="button"
                    onClick={() => goToPage(page + 1)}
                    disabled={page >= totalPages}
                    className="rounded border border-slate-300 px-3 py-1 hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 disabled:opacity-40"
                  >
                    Berikutnya ›
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Low stock items */}
      {!lowStockError && (
        <div className="card">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">
            Barang Stok Rendah
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              (stok ≤ minimum, maks 20 barang)
            </span>
          </h2>
          {lowStockItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 py-8 text-center dark:border-slate-700">
              <p className="text-sm text-green-600 dark:text-green-400">✓ Semua barang memiliki stok di atas minimum.</p>
            </div>
          ) : (
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Nama Barang</th>
                    <th className="text-right">Stok Saat Ini</th>
                    <th className="text-right">Stok Minimum</th>
                    <th>Satuan</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockItems.map((item) => (
                    <tr key={item.id}>
                      <td className="font-mono text-xs text-slate-700 dark:text-slate-300">{item.sku}</td>
                      <td className="font-medium text-slate-900 dark:text-slate-100">{item.name}</td>
                      <td className="text-right tabular-nums font-bold text-red-600 dark:text-red-400">
                        {item.current_stock.toLocaleString('id-ID')}
                      </td>
                      <td className="text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {item.minimum_stock.toLocaleString('id-ID')}
                      </td>
                      <td className="text-slate-500 dark:text-slate-400">
                        {item.base_unit?.symbol ?? '—'}
                      </td>
                      <td>
                        {item.current_stock === 0 ? (
                          <span className="badge-habis">Habis</span>
                        ) : (
                          <span className="badge-hampir-habis">Hampir Habis</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Summary card sub-component ────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  color,
  icon,
}: {
  label: string
  value: string
  color: 'green' | 'red' | 'blue' | 'orange' | 'gray'
  icon: string
}) {
  const cardBorderClasses = {
    green: 'border-green-200 dark:border-emerald-800/50',
    red: 'border-red-200 dark:border-red-800/50',
    blue: 'border-blue-200 dark:border-[#22D3EE]/40',
    orange: 'border-amber-200 dark:border-amber-800/50',
    gray: 'border-slate-200 dark:border-white/10',
  }

  const iconClasses = {
    green: 'text-green-600 dark:text-emerald-400',
    red: 'text-red-600 dark:text-red-400',
    blue: 'text-blue-600 dark:text-[#22D3EE]',
    orange: 'text-amber-600 dark:text-amber-400',
    gray: 'text-slate-500 dark:text-slate-400',
  }

  return (
    <div className={`rounded-lg border bg-white dark:bg-[#17263D] p-4 shadow-sm ${cardBorderClasses[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
        <span className={`text-lg font-bold ${iconClasses[color]}`} aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tabular-nums text-slate-900 dark:text-white">{value}</p>
    </div>
  )
}
