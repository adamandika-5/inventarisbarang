'use client'

import { useRouter } from 'next/navigation'

interface TransactionRow {
  id: string
  transaction_number: string
  transaction_type: string
  input_quantity: bigint | string | number
  base_quantity: bigint | string | number
  stock_before: bigint | string | number
  stock_after: bigint | string | number
  transaction_at: string
  reason: string | null
  items: { name: string; sku: string } | Array<{ name: string; sku: string }> | null
  units: { symbol: string } | Array<{ symbol: string }> | null
}

export default function EmployeeHistoryClient({
  transactions,
  currentPage,
  totalPages,
  totalCount,
}: {
  transactions: TransactionRow[]
  currentPage: number
  totalPages: number
  totalCount: number
}) {
  const router = useRouter()

  const handlePageChange = (page: number) => {
    const params = new URLSearchParams()
    params.set('page', String(page))
    router.push(`/employee/history?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Total Count Header Banner */}
      <div className="card flex items-center justify-between py-3">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Total Pengambilan Barang</span>
        <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 dark:bg-blue-900/50 dark:text-blue-300">
          {totalCount} Transaksi
        </span>
      </div>

      {/* History List Table */}
      {transactions.length > 0 ? (
        <div className="card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead
                className="text-xs font-semibold uppercase"
                style={{ backgroundColor: 'var(--bg-table-head)', color: 'var(--text-muted)' }}
              >
                <tr>
                  <th className="px-4 py-3">No. Transaksi</th>
                  <th className="px-4 py-3">Jenis</th>
                  <th className="px-4 py-3">Barang</th>
                  <th className="px-4 py-3 text-right">Jumlah</th>
                  <th className="px-4 py-3 text-right">Stok Sebelum / Sesudah</th>
                  <th className="px-4 py-3">Waktu</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => {
                  const item = Array.isArray(tx.items) ? tx.items[0] : tx.items
                  const unit = Array.isArray(tx.units) ? tx.units[0] : tx.units

                  return (
                    <tr
                      key={tx.id}
                      className="transition-colors"
                      style={{ backgroundColor: 'var(--bg-table-row)' }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row-hover)'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLElement).style.backgroundColor = 'var(--bg-table-row)'
                      }}
                    >
                      <td className="px-4 py-3">
                        <code
                          className="rounded px-1.5 py-0.5 font-mono text-xs font-medium"
                          style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                        >
                          {tx.transaction_number}
                        </code>
                      </td>
                      <td className="px-4 py-3">
                        <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                          PENGAMBILAN
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900 dark:text-slate-100">{item?.name ?? '—'}</p>
                        <p className="font-mono text-xs text-slate-500 dark:text-slate-400">SKU: {item?.sku ?? '—'}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600 dark:text-amber-400">
                        -{String(tx.input_quantity)} {unit?.symbol ?? ''}
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-600 dark:text-slate-300">
                        {String(tx.stock_before)} &rarr; <strong className="text-slate-900 dark:text-slate-100">{String(tx.stock_after)}</strong>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                        {new Date(tx.transaction_at).toLocaleString('id-ID')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{ borderTop: '1px solid var(--border-muted)' }}
            >
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Halaman {currentPage} dari {totalPages}
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage <= 1}
                  className="btn-secondary text-xs"
                >
                  &laquo; Sebelum
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage >= totalPages}
                  className="btn-secondary text-xs"
                >
                  Sesudah &raquo;
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="card py-12 text-center text-sm text-slate-500 dark:text-slate-400">
          Belum ada riwayat pengambilan barang yang ditemukan.
        </div>
      )}
    </div>
  )
}
