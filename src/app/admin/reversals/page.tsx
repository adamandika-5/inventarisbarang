import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ReversalsClient from './reversals-client'

export const metadata: Metadata = {
  title: 'Koreksi Transaksi — InventarisBarang Admin',
}

export default async function ReversalsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; search?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const search = params.search?.trim() ?? ''
  const pageSize = 20

  // Load reversible transactions (non-REVERSAL, not already reversed)
  let query = supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,is_reversed,items!item_id(id,sku,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .not('transaction_type', 'eq', 'REVERSAL')
    .eq('is_reversed', false)
    .order('transaction_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (search) {
    query = query.ilike('transaction_number', `%${search}%`)
  }

  const { data: transactions, count, error } = await query

  if (error) {
    return <div className="alert-error">Gagal memuat transaksi. Coba muat ulang.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Koreksi Transaksi</h1>
        <p className="mt-1 text-sm text-gray-500">
          Balik transaksi yang salah. Koreksi dibuat sebagai transaksi pembalikan baru.
        </p>
      </div>
      <ReversalsClient
        transactions={transactions ?? []}
        totalCount={count ?? 0}
        page={page}
        pageSize={pageSize}
        search={search}
      />
    </div>
  )
}
