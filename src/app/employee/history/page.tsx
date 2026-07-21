import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import EmployeeHistoryClient from './history-client'

export const metadata: Metadata = {
  title: 'Riwayat Transaksi Saya — InventarisBarang',
  description: 'Daftar pengambilan barang yang Anda lakukan.',
}

interface PageProps {
  searchParams: Promise<{
    page?: string
  }>
}

export default async function EmployeeHistoryPage({ searchParams }: PageProps) {
  const { page: pageStr = '1' } = await searchParams
  const page = Math.max(1, parseInt(pageStr, 10) || 1)
  const pageSize = 15

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Defense-in-depth: query strictly filters by performed_by = user.id AND transaction_type = 'OUT'
  const query = supabase
    .from('stock_transactions')
    .select(
      `
        id,
        transaction_number,
        transaction_type,
        input_quantity,
        base_quantity,
        stock_before,
        stock_after,
        transaction_at,
        reason,
        items(name, sku),
        units(symbol)
      `,
      { count: 'exact' }
    )
    .eq('performed_by', user.id)
    .eq('transaction_type', 'OUT')
    .order('transaction_at', { ascending: false })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const { data: transactions, count } = await query.range(from, to)

  const totalPages = Math.ceil((count ?? 0) / pageSize)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Riwayat Transaksi Saya</h1>
        <p className="mt-1 text-sm text-gray-500">
          Daftar pengambilan barang yang Anda lakukan.
        </p>
      </div>

      <EmployeeHistoryClient
        transactions={transactions || []}
        currentPage={page}
        totalPages={totalPages}
        totalCount={count ?? 0}
      />
    </div>
  )
}
