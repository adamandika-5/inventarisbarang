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
        <h1 className="text-2xl font-bold text-gray-900">Operasional Pegawai</h1>
        <p className="mt-1 text-sm text-gray-500">
          Kelola barang keluar, pengambilan barang, dan pemindaian barcode dengan cepat.
        </p>
      </div>

      {/* Primary Quick Actions (Scan Ambil, Barang Keluar, Cek Stok) */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          href="/employee/scan"
          className="card flex flex-col items-center justify-center p-6 text-center transition-all hover:border-primary-500 hover:shadow-md bg-primary-600 text-white"
        >
          <div className="mb-2 rounded-full bg-white/20 p-3">
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
            </svg>
          </div>
          <span className="text-lg font-bold">Scan Ambil Barang</span>
          <span className="mt-1 text-xs text-white/80">Pindai barcode kamera/manual</span>
        </Link>

        <Link
          href="/employee/stock-out"
          className="card flex flex-col items-center justify-center p-6 text-center transition-all hover:border-amber-500 hover:shadow-md bg-amber-600 text-white"
        >
          <div className="mb-2 rounded-full bg-white/20 p-3">
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 13l-5 5m0 0l-5-5m5 5V6" />
            </svg>
          </div>
          <span className="text-lg font-bold">Barang Keluar</span>
          <span className="mt-1 text-xs text-white/80">Catat pengeluaran stok</span>
        </Link>

        <Link
          href="/employee/items"
          className="card flex flex-col items-center justify-center p-6 text-center transition-all hover:border-sky-500 hover:shadow-md bg-sky-600 text-white"
        >
          <div className="mb-2 rounded-full bg-white/20 p-3">
            <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <span className="text-lg font-bold">Cek Stok</span>
          <span className="mt-1 text-xs text-white/80">Cari barang & cek ketersediaan</span>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="card">
          <div className="text-xs font-medium text-gray-500">Total Barang Aktif</div>
          <div className="mt-2 text-2xl font-bold text-gray-900">{totalItemsCount ?? 0}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-gray-500">Barang Stok Rendah</div>
          <div className="mt-2 text-2xl font-bold text-amber-600">{lowStockCount}</div>
        </div>

        <div className="card">
          <div className="text-xs font-medium text-gray-500">Total Transaksi Saya</div>
          <div className="mt-2 text-2xl font-bold text-primary-600">{myTransactionsCount ?? 0}</div>
        </div>
      </div>

      {/* Recent Activity Section */}
      <div className="card">
        <div className="flex items-center justify-between border-b border-gray-100 pb-4">
          <h2 className="text-base font-semibold text-gray-900">Riwayat Transaksi Terakhir Saya</h2>
          <Link href="/employee/history" className="text-xs font-medium text-primary-600 hover:text-primary-800">
            Lihat Semua &raquo;
          </Link>
        </div>

        {recentTransactions && recentTransactions.length > 0 ? (
          <div className="mt-4 divide-y divide-gray-100">
            {(recentTransactions as unknown as RecentTransaction[]).map((tx) => {
              const item = Array.isArray(tx.items) ? tx.items[0] : tx.items
              const unit = Array.isArray(tx.units) ? tx.units[0] : tx.units

              return (
                <div key={tx.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        KELUAR
                      </span>
                      <span className="font-mono text-xs font-medium text-gray-500">{tx.transaction_number}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-gray-900">{item?.name ?? '—'}</p>
                    <p className="text-xs text-gray-500">
                      SKU: {item?.sku ?? '—'} · {new Date(tx.transaction_at).toLocaleString('id-ID')}
                    </p>
                  </div>

                  <div className="text-right">
                    <span className="text-sm font-bold text-amber-600">
                      -{String(tx.input_quantity)} {unit?.symbol ?? ''}
                    </span>
                    <p className="text-xs text-gray-500">Stok sesudah: {String(tx.stock_after)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="py-8 text-center text-sm text-gray-500">
            Belum ada transaksi yang Anda catat.
          </div>
        )}
      </div>
    </div>
  )
}
