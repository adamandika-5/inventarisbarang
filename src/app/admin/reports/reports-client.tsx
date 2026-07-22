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
import { useCallback, useState, useTransition } from 'react'
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
  INITIAL: 'Stok Awal',
  ADJUSTMENT_IN: 'Penyesuaian +',
  ADJUSTMENT_OUT: 'Penyesuaian −',
  REVERSAL: 'Koreksi',
}

const TYPE_CLASSES: Record<TransactionType, string> = {
  IN: 'bg-green-100 text-green-800',
  OUT: 'bg-red-100 text-red-800',
  INITIAL: 'bg-blue-100 text-blue-800',
  ADJUSTMENT_IN: 'bg-emerald-100 text-emerald-800',
  ADJUSTMENT_OUT: 'bg-orange-100 text-orange-800',
  REVERSAL: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
}

// ── CSV safety ─────────────────────────────────────────────────────────────────

function sanitizeCsvValue(value: string | number | null | undefined): string {
  const str = String(value ?? '')
  // Prevent formula injection
  if (/^[=+\-@]/.test(str)) return `'${str}`
  // Escape double quotes
  if (str.includes('"') || str.includes(',') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

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
  const [localType, setLocalType] = useState(typeFilter)
  const [filterError, setFilterError] = useState<string | null>(null)

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

  const applyFilter = () => {
    setFilterError(null)
    if (localFrom > localTo) {
      setFilterError('Tanggal awal tidak boleh lebih dari tanggal akhir.')
      return
    }
    startTransition(() => {
      router.push(buildUrl({ from: localFrom, to: localTo, type: localType, page: 1 }))
    })
  }

  const goToPage = (p: number) => {
    startTransition(() => {
      router.push(buildUrl({ page: p }))
    })
  }

  // ── CSV Export ────────────────────────────────────────────────────────────────

  const handleExportCsv = () => {
    const headers = [
      'No. Transaksi',
      'Tanggal (WIB)',
      'Jenis',
      'SKU Barang',
      'Nama Barang',
      'Jumlah Input',
      'Satuan',
      'Jumlah Dasar',
      'Delta Stok',
      'Stok Sebelum',
      'Stok Sesudah',
      'Dilakukan Oleh',
      'Alasan',
    ]

    const rows = transactions.map((tx) => [
      sanitizeCsvValue(tx.transaction_number),
      sanitizeCsvValue(formatWib(tx.transaction_at)),
      sanitizeCsvValue(TYPE_LABELS[tx.transaction_type] ?? tx.transaction_type),
      sanitizeCsvValue(tx.items?.sku),
      sanitizeCsvValue(tx.items?.name),
      sanitizeCsvValue(tx.input_quantity),
      sanitizeCsvValue(tx.units?.symbol),
      sanitizeCsvValue(tx.base_quantity),
      sanitizeCsvValue(tx.quantity_delta),
      sanitizeCsvValue(tx.stock_before),
      sanitizeCsvValue(tx.stock_after),
      sanitizeCsvValue(tx.profiles?.full_name ?? tx.profiles?.username),
      sanitizeCsvValue(tx.reason),
    ])

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `laporan-${dateFrom}-${dateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Filter bar */}
      <div className="card">
        <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Filter Laporan</h2>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="filter-from" className="label mb-1">
              Dari Tanggal
            </label>
            <input
              id="filter-from"
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
              value={localType}
              onChange={(e) => setLocalType(e.target.value)}
              className="input w-44"
            >
              <option value="">Semua Jenis</option>
              <option value="IN">Barang Masuk</option>
              <option value="OUT">Barang Keluar</option>
              <option value="INITIAL">Stok Awal</option>
              <option value="ADJUSTMENT_IN">Penyesuaian +</option>
              <option value="ADJUSTMENT_OUT">Penyesuaian −</option>
              <option value="REVERSAL">Koreksi</option>
            </select>
          </div>
          <button
            type="button"
            id="btn-apply-filter"
            onClick={applyFilter}
            className="btn-primary"
          >
            Terapkan
          </button>
          {filterError && (
            <p className="w-full text-xs text-red-600">{filterError}</p>
          )}
        </div>
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

      {/* Transactions table */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Riwayat Transaksi
            <span className="ml-2 text-sm font-normal text-slate-500 dark:text-slate-400">
              ({totalCount.toLocaleString('id-ID')} total)
            </span>
          </h2>
          <button
            type="button"
            id="btn-export-csv"
            onClick={handleExportCsv}
            disabled={transactions.length === 0}
            className="btn-secondary text-sm disabled:opacity-40"
          >
            <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Export CSV
          </button>
        </div>

        {transactions.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 py-12 text-center dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada transaksi dalam rentang tanggal ini.</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>No. Transaksi</th>
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
                      <td className="font-mono text-xs"><span className="code-chip">{tx.transaction_number}</span></td>
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
          </>
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
  const colorClasses = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    gray: 'bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-700/60 dark:text-slate-300 dark:border-slate-600',
  }
  return (
    <div className={`rounded-lg border p-4 ${colorClasses[color]}`}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        <span className="text-lg" aria-hidden="true">
          {icon}
        </span>
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  )
}
