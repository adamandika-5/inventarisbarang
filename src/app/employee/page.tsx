import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const metadata: Metadata = {
  title: 'Beranda — InventarisBarang',
  description: 'Dashboard operasional pegawai',
}

interface RecentTransaction {
  id: string
  transaction_number: string
  transaction_type: string
  input_quantity: bigint | string | number
  base_quantity: bigint | string | number
  stock_before: bigint | string | number
  stock_after: bigint | string | number
  transaction_at: string
  items: { name: string; sku: string } | Array<{ name: string; sku: string }> | null
  units: { symbol: string } | Array<{ symbol: string }> | null
}

export default async function EmployeeDashboardPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Fetch summary stats in parallel
  const [
    { count: totalItemsCount },
    { count: myTransactionsCount },
    { data: lowStockItems },
    { data: recentTransactions },
  ] = await Promise.all([
    supabase.from('items').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('stock_transactions').select('id', { count: 'exact', head: true }).eq('performed_by', user.id),
    supabase.from('items').select('id, current_stock, minimum_stock').eq('is_active', true),
    supabase
      .from('stock_transactions')
      .select(`
        id,
        transaction_number,
        transaction_type,
        input_quantity,
        base_quantity,
        stock_before,
        stock_after,
        transaction_at,
        items(name, sku),
        units(symbol)
      `)
      .eq('performed_by', user.id)
      .order('transaction_at', { ascending: false })
      .limit(5),
  ])

  const lowStockCount = (lowStockItems || []).filter(
    (item) => Number(item.current_stock) <= Number(item.minimum_stock)
  ).length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Operasional Pegawai</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
          Kelola barang keluar, pengambilan barang, dan pemindaian barcode dengan cepat.
        </p>
      </div>

      {/* Primary Quick Actions */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Scan Ambil Barang */}
        <Link
          href="/employee/scan"
          className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950/50 dark:group-hover:text-blue-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <span className="text-base font-bold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
            Scan Ambil Barang
          </span>
          <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">Pindai barcode kamera/manual</span>
        </Link>

        {/* Barang Keluar */}
        <Link
          href="/employee/stock-out"
          className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950/50 dark:group-hover:text-blue-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
            </svg>
          </div>
          <span className="text-base font-bold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
            Barang Keluar
          </span>
          <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">Catat pengeluaran stok</span>
        </Link>

        {/* Cek Stok */}
        <Link
          href="/employee/items"
          className="group flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm transition-colors hover:border-blue-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600 dark:hover:bg-slate-800"
        >
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600 dark:bg-slate-800 dark:text-slate-300 dark:group-hover:bg-blue-950/50 dark:group-hover:text-blue-400">
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-base font-bold text-slate-800 transition-colors group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
            Cek Stok
          </span>
          <span className="mt-1 text-xs text-slate-500 dark:text-slate-400">Cari barang &amp; cek ketersediaan</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-300">Total Barang Aktif</div>
          <div className="mt-2 text-3xl font-extrabold text-slate-900 dark:text-white">{totalItemsCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-300">Barang Stok Rendah</div>
          <div className="mt-2 text-3xl font-extrabold text-amber-600 dark:text-amber-400">{lowStockCount}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-300">Total Transaksi Saya</div>
          <div className="mt-2 text-3xl font-extrabold text-blue-600 dark:text-[#22D3EE]">{myTransactionsCount ?? 0}</div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-white/10">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Riwayat Transaksi Terakhir Saya</h2>
          <Link href="/employee/history" className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-[#22D3EE] dark:hover:text-[#22D3EE]/80">
            Lihat Semua &raquo;
          </Link>
        </div>

        {recentTransactions && recentTransactions.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-200 dark:divide-white/10">
            {(recentTransactions as unknown as RecentTransaction[]).map((tx) => {
              const item = Array.isArray(tx.items) ? tx.items[0] : tx.items
              const unit = Array.isArray(tx.units) ? tx.units[0] : tx.units

              return (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                        KELUAR
                      </span>
                      <span className="font-mono text-xs font-medium text-slate-500 dark:text-slate-400">{tx.transaction_number}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{item?.name ?? '—'}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      SKU: {item?.sku ?? '—'} · {new Date(tx.transaction_at).toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-amber-600 dark:text-amber-400">
                      -{String(tx.input_quantity)} {unit?.symbol ?? ''}
                    </span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Stok sesudah: {String(tx.stock_after)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Belum ada transaksi yang Anda catat.
          </div>
        )}
      </div>
    </div>
  )
}
