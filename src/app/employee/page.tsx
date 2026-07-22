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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Operasional Pegawai</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kelola barang keluar, pengambilan barang, dan pemindaian barcode dengan cepat.
        </p>
      </div>

      {/* Primary Quick Actions — soft tinted cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Scan Ambil Barang — blue tint */}
        <Link
          href="/employee/scan"
          className="flex flex-col items-center justify-center rounded-lg border border-blue-200 bg-blue-50 p-6 text-center transition-all hover:border-blue-300 hover:bg-blue-100 hover:shadow-md dark:border-blue-800/70 dark:bg-blue-950/40 dark:hover:bg-blue-900/45"
        >
          <div className="mb-3 rounded-full bg-blue-100 p-3 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Scan Ambil Barang</span>
          <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">Pindai barcode kamera/manual</span>
        </Link>

        {/* Barang Keluar — amber tint */}
        <Link
          href="/employee/stock-out"
          className="flex flex-col items-center justify-center rounded-lg border border-amber-200 bg-amber-50 p-6 text-center transition-all hover:border-amber-300 hover:bg-amber-100 hover:shadow-md dark:border-amber-800/70 dark:bg-amber-950/35 dark:hover:bg-amber-900/40"
        >
          <div className="mb-3 rounded-full bg-amber-100 p-3 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Barang Keluar</span>
          <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">Catat pengeluaran stok</span>
        </Link>

        {/* Cek Stok — cyan tint */}
        <Link
          href="/employee/items"
          className="flex flex-col items-center justify-center rounded-lg border border-cyan-200 bg-cyan-50 p-6 text-center transition-all hover:border-cyan-300 hover:bg-cyan-100 hover:shadow-md dark:border-cyan-800/70 dark:bg-cyan-950/35 dark:hover:bg-cyan-900/40"
        >
          <div className="mb-3 rounded-full bg-cyan-100 p-3 text-cyan-700 dark:bg-cyan-900/60 dark:text-cyan-300">
            <svg className="h-7 w-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">Cek Stok</span>
          <span className="mt-1 text-xs text-slate-600 dark:text-slate-300">Cari barang &amp; cek ketersediaan</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Barang Aktif</div>
          <div className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100">{totalItemsCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Barang Stok Rendah</div>
          <div className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400">{lowStockCount}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Transaksi Saya</div>
          <div className="mt-2 text-2xl font-bold text-blue-600 dark:text-blue-400">{myTransactionsCount ?? 0}</div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 dark:border-slate-700">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Riwayat Transaksi Terakhir Saya</h2>
          <Link href="/employee/history" className="text-xs font-medium text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
            Lihat Semua &raquo;
          </Link>
        </div>

        {recentTransactions && recentTransactions.length > 0 ? (
          <div className="mt-4 divide-y divide-slate-200 dark:divide-slate-700">
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
                    <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{item?.name ?? '—'}</p>
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
