'use client'

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useRef } from 'react'

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
  reversal_transaction_id: string | null
  items: { id: string; sku: string; name: string } | null
  units: { id: string; name: string; symbol: string } | null
  profiles: { id: string; full_name: string; username: string } | null
}

interface StockOutListProps {
  transactions: Transaction[]
  totalCount: number
  page: number
  pageSize: number
  search: string
}

const dtf = new Intl.DateTimeFormat('id-ID', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Jakarta',
})

export default function StockOutList({
  transactions,
  totalCount,
  page,
  pageSize,
  search,
}: StockOutListProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const searchRef = useRef<HTMLInputElement>(null)

  /** Navigate to a specific page, preserving current search param */
  const goToPage = (targetPage: number) => {
    const p = new URLSearchParams(searchParams.toString())
    p.set('page', String(targetPage))
    router.push(`${pathname}?${p.toString()}`)
  }

  /** Run a new search and reset to page 1 */
  const runSearch = (value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set('search', value)
    else p.delete('search')
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  // Calculate display range for "Menampilkan X–Y dari Z transaksi"
  const rangeStart = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const rangeEnd = Math.min(page * pageSize, totalCount)

  // Build page number list (show at most 5 pages around current)
  const pageNumbers: number[] = []
  const windowSize = 2
  const start = Math.max(1, page - windowSize)
  const end = Math.min(totalPages, page + windowSize)
  for (let i = start; i <= end; i++) pageNumbers.push(i)

  return (
    <div>
      {/* Search bar */}
      <div className="mb-4">
        <input
          id="search-transaksi"
          ref={searchRef}
          type="search"
          placeholder="Cari nomor transaksi…"
          defaultValue={search}
          className="input max-w-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') runSearch((e.target as HTMLInputElement).value)
          }}
        />
      </div>

      {/* Empty state */}
      {transactions.length === 0 ? (
        <div className="card py-12 text-center text-gray-500 dark:text-slate-400">
          {search ? (
            <>
              <p className="text-base font-medium">
                Tidak ada transaksi yang cocok dengan &ldquo;{search}&rdquo;.
              </p>
              <p className="mt-1 text-sm">Coba kata kunci lain atau hapus pencarian.</p>
            </>
          ) : (
            <p className="text-lg font-medium">Belum ada transaksi keluar.</p>
          )}
        </div>
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Riwayat barang keluar">
            <thead>
              <tr>
                <th scope="col" className="whitespace-nowrap">No. Transaksi</th>
                <th scope="col">Barang</th>
                <th scope="col">Jumlah</th>
                <th scope="col">Stok Sebelum</th>
                <th scope="col">Stok Sesudah</th>
                <th scope="col">Oleh</th>
                <th scope="col" className="whitespace-nowrap">Waktu</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className={tx.is_reversed ? 'opacity-60' : ''}>
                  <td className="whitespace-nowrap">
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-[#0B1220] dark:text-[#22D3EE] dark:border dark:border-white/10 whitespace-nowrap">
                      {tx.transaction_number}
                    </code>
                  </td>
                  <td>
                    <span className="font-medium text-slate-900 dark:text-white">{tx.items?.name ?? '—'}</span>
                    <div className="text-xs text-slate-400 dark:text-slate-400">{tx.items?.sku}</div>
                  </td>
                  <td className="text-sm">
                    {Number(tx.input_quantity).toLocaleString('id-ID')} {tx.units?.symbol}
                  </td>
                  <td className="text-sm">{Number(tx.stock_before).toLocaleString('id-ID')}</td>
                  <td className="text-sm">{Number(tx.stock_after).toLocaleString('id-ID')}</td>
                  <td className="text-sm text-slate-600 dark:text-slate-300">
                    {tx.profiles?.full_name ?? tx.profiles?.username ?? '—'}
                  </td>
                  <td className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {dtf.format(new Date(tx.transaction_at))}
                  </td>
                  <td>
                    {tx.is_reversed ? (
                      <span className="badge-nonaktif text-xs">Dibatalkan</span>
                    ) : (
                      <span className="badge-aman text-xs">Valid</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination — always rendered when there is data */}
      {totalCount > 0 && (
        <nav
          className="mt-4 flex flex-wrap items-center justify-between gap-3"
          aria-label="Navigasi halaman"
        >
          {/* Count info */}
          <p className="text-sm text-slate-600 dark:text-slate-300">
            Menampilkan{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {rangeStart}–{rangeEnd}
            </span>{' '}
            dari{' '}
            <span className="font-semibold text-slate-900 dark:text-slate-100">{totalCount}</span>{' '}
            transaksi
          </p>

          {/* Page controls */}
          <div className="flex items-center gap-1">
            {/* Previous */}
            <button
              id="btn-prev-page-stockout"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              aria-label="Halaman sebelumnya"
            >
              &laquo; Sebelumnya
            </button>

            {/* Page numbers */}
            {start > 1 && (
              <>
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => goToPage(1)}
                  aria-label="Halaman 1"
                >
                  1
                </button>
                {start > 2 && (
                  <span className="px-1 text-slate-400 dark:text-slate-500 select-none">…</span>
                )}
              </>
            )}

            {pageNumbers.map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`Halaman ${n}`}
                aria-current={n === page ? 'page' : undefined}
                onClick={() => goToPage(n)}
                className={
                  n === page
                    ? 'min-w-[2rem] rounded-md px-3 py-1.5 text-sm font-bold bg-blue-600 text-white dark:bg-[#22D3EE] dark:text-slate-900 shadow-sm'
                    : 'btn-secondary text-sm min-w-[2rem]'
                }
              >
                {n}
              </button>
            ))}

            {end < totalPages && (
              <>
                {end < totalPages - 1 && (
                  <span className="px-1 text-slate-400 dark:text-slate-500 select-none">…</span>
                )}
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => goToPage(totalPages)}
                  aria-label={`Halaman ${totalPages}`}
                >
                  {totalPages}
                </button>
              </>
            )}

            {/* Next */}
            <button
              id="btn-next-page-stockout"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              aria-label="Halaman berikutnya"
            >
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
