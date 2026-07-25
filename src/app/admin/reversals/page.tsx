import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import type { TransactionType } from '@/types/database'
import ReversalsClient from './reversals-client'

export const metadata: Metadata = {
  title: 'Koreksi Transaksi — InventarisBarang Admin',
}

interface ReversalsPageProps {
  searchParams: Promise<{
    q?: string
    type?: string
    status?: string
    from?: string
    to?: string
    page?: string
    limit?: string
  }>
}

export default async function ReversalsPage({ searchParams }: ReversalsPageProps) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams

  // 1. Parse & Validate Search Parameters
  const q = params.q?.trim() ?? ''
  const rawType = params.type?.trim() ?? ''
  const validTypes = ['IN', 'OUT', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']
  const typeFilter = validTypes.includes(rawType) ? rawType : ''

  const rawStatus = params.status?.trim() ?? ''
  const validStatuses = ['available', 'reversed', 'all']
  const statusFilter = validStatuses.includes(rawStatus) ? rawStatus : 'available'

  const rawFrom = params.from?.trim() ?? ''
  const rawTo = params.to?.trim() ?? ''
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : ''
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : ''

  const rawLimit = parseInt(params.limit ?? '10', 10)
  const limit = [10, 25, 50].includes(rawLimit) ? rawLimit : 10

  const rawPage = parseInt(params.page ?? '1', 10)
  const page = isNaN(rawPage) || rawPage < 1 ? 1 : rawPage

  // 2. Build Item ID Search (if q is provided)
  let matchedItemIds: string[] = []
  if (q) {
    const { data: itemsData } = await supabase
      .from('items')
      .select('id')
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)

    matchedItemIds = (itemsData || []).map((i) => i.id)
  }

  // 3. Build Base Stock Transactions Query
  let query = supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,reason,is_reversed,items!item_id(id,sku,barcode,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .not('transaction_type', 'eq', 'REVERSAL') // REVERSAL transactions can never be reversed again

  // Filter Status
  if (statusFilter === 'available') {
    query = query.eq('is_reversed', false)
  } else if (statusFilter === 'reversed') {
    query = query.eq('is_reversed', true)
  }

  // Filter Transaction Type
  if (typeFilter) {
    query = query.eq('transaction_type', typeFilter as TransactionType)
  }

  // Filter Date Range (WIB UTC Conversion)
  if (safeFrom) {
    query = query.gte('transaction_at', `${safeFrom}T00:00:00+07:00`)
  }
  if (safeTo) {
    query = query.lte('transaction_at', `${safeTo}T23:59:59.999+07:00`)
  }

  // Filter Search Query (q)
  if (q) {
    if (matchedItemIds.length > 0) {
      query = query.or(`transaction_number.ilike.%${q}%,item_id.in.(${matchedItemIds.join(',')})`)
    } else {
      query = query.ilike('transaction_number', `%${q}%`)
    }
  }

  // Order & Pagination
  query = query.order('transaction_at', { ascending: false })

  const offset = (page - 1) * limit
  const { data: transactions, count: totalCount, error } = await query.range(offset, offset + limit - 1)

  if (error) {
    console.error('Error fetching reversible transactions:', error)
    return <div className="alert-error">Gagal memuat transaksi. Coba muat ulang halaman.</div>
  }

  const count = totalCount ?? 0
  const totalPages = Math.ceil(count / limit)

  // Redirect to max valid page if current page exceeds total pages
  if (count > 0 && page > totalPages) {
    const searchParamsObj = new URLSearchParams()
    if (q) searchParamsObj.set('q', q)
    if (typeFilter) searchParamsObj.set('type', typeFilter)
    if (statusFilter !== 'available') searchParamsObj.set('status', statusFilter)
    if (safeFrom) searchParamsObj.set('from', safeFrom)
    if (safeTo) searchParamsObj.set('to', safeTo)
    searchParamsObj.set('page', String(totalPages))
    if (limit !== 10) searchParamsObj.set('limit', String(limit))

    redirect(`/admin/reversals?${searchParamsObj.toString()}`)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Koreksi Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Cari dan batalkan transaksi yang salah. Pembatalan akan dicatat sebagai transaksi pembalikan baru secara otomatis.
        </p>
      </div>

      <ReversalsClient
        transactions={transactions ?? []}
        totalCount={count}
        page={page}
        limit={limit}
        q={q}
        typeFilter={typeFilter}
        statusFilter={statusFilter}
        dateFrom={safeFrom}
        dateTo={safeTo}
      />
    </div>
  )
}
