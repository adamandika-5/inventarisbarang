'use client'

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
  const totalPages = Math.ceil(totalCount / pageSize)

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value)
    else p.delete(key)
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  return (
    <div>
      <div className="mb-4">
        <input
          id="search-transaksi"
          type="search"
          placeholder="Cari nomor transaksi…"
          defaultValue={search}
          className="input max-w-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateParam('search', (e.target as HTMLInputElement).value)
          }}
        />
      </div>

      {transactions.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <p className="text-lg font-medium">Belum ada transaksi keluar</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Riwayat barang keluar">
            <thead>
              <tr>
                <th scope="col">No. Transaksi</th>
                <th scope="col">Barang</th>
                <th scope="col">Jumlah</th>
                <th scope="col">Stok Sebelum</th>
                <th scope="col">Stok Sesudah</th>
                <th scope="col">Oleh</th>
                <th scope="col">Waktu</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className={tx.is_reversed ? 'opacity-60' : ''}>
                  <td>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono text-slate-700 dark:bg-[#0B1220] dark:text-[#22D3EE] dark:border dark:border-white/10">
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
                  <td className="text-sm text-slate-500 dark:text-slate-400">
                    {dtf.format(new Date(tx.transaction_at))}
                  </td>
                  <td>
                    {tx.is_reversed ? (
                      <span className="badge-nonaktif text-xs">Dibalik</span>
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

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Navigasi halaman">
          <p className="text-sm text-slate-600 dark:text-slate-300">Halaman {page} dari {totalPages}</p>
          <div className="flex gap-2">
            <button
              id="btn-prev-page-stockout"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page - 1))}
              disabled={page <= 1}
            >
              &laquo; Sebelumnya
            </button>
            <button
              id="btn-next-page-stockout"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page + 1))}
              disabled={page >= totalPages}
            >
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
