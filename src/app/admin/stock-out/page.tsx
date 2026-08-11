import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import StockOutList from './stock-out-list'

export const metadata: Metadata = {
  title: 'Riwayat Barang Keluar — InventarisBarang Admin',
}

export default async function StockOutPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams
  const page = Math.max(1, isNaN(parseInt(params.page ?? '1', 10)) ? 1 : parseInt(params.page ?? '1', 10))
  const search = params.search?.trim() ?? ''
  const pageSize = 10

  let query = supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,reason,is_reversed,reversal_transaction_id,items!item_id(id,sku,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .in('transaction_type', ['OUT'])
    .order('transaction_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (search) {
    query = query.or(`transaction_number.ilike.%${search}%`)
  }

  const { data: transactions, count, error } = await query

  if (error) {
    return <div className="alert-error">Gagal memuat riwayat transaksi.</div>
  }

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Riwayat Barang Keluar</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{count ?? 0} transaksi keluar</p>
      </div>
      <StockOutList
        transactions={transactions ?? []}
        totalCount={count ?? 0}
        page={page}
        pageSize={pageSize}
        search={search}
      />
    </div>
  )
}
