import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ReportsClient from './reports-client'
import { formatInTimeZone } from 'date-fns-tz'

export const metadata: Metadata = {
  title: 'Laporan — InventarisBarang Admin',
}

const TZ = 'Asia/Jakarta'

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    from?: string
    to?: string
    type?: string
    page?: string
    item?: string
  }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams

  // Default date range: last 30 days in WIB
  const nowWib = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
  const thirtyDaysAgoWib = formatInTimeZone(
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    TZ,
    'yyyy-MM-dd',
  )

  const dateFrom = params.from ?? thirtyDaysAgoWib
  const dateTo = params.to ?? nowWib
  const rawType = (params.type ?? '').trim().toUpperCase()
  const typeFilter = rawType === 'ALL' ? '' : rawType
  const itemFilter = (params.item ?? '').trim()
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25

  // Validate dates — if invalid, use defaults
  const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(dateFrom) ? dateFrom : thirtyDaysAgoWib
  const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(dateTo) ? dateTo : nowWib

  // Convert WIB dates to UTC range for DB queries
  const fromUtc = `${safeFrom}T00:00:00+07:00`
  const toUtc = `${safeTo}T23:59:59+07:00`

  // Helper to apply type filter to query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyTypeFilter = (queryBuilder: any, type?: string) => {
    if (!type || type === 'ALL') return queryBuilder
    if (type === 'ADJUSTMENT') {
      return queryBuilder.in('transaction_type', ['ADJUSTMENT_IN', 'ADJUSTMENT_OUT'])
    }
    if (['IN', 'OUT', 'INITIAL', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT', 'REVERSAL'].includes(type)) {
      return queryBuilder.eq('transaction_type', type)
    }
    return queryBuilder
  }

  // ── Summary stats ────────────────────────────────────────────────────────────

  let summaryQuery = supabase
    .from('stock_transactions')
    .select('transaction_type,base_quantity,quantity_delta')
    .gte('transaction_at', fromUtc)
    .lte('transaction_at', toUtc)

  summaryQuery = applyTypeFilter(summaryQuery, typeFilter)

  if (itemFilter) {
    summaryQuery = summaryQuery.eq('item_id', itemFilter)
  }

  const { data: summaryData, error: summaryError } = await summaryQuery

  // ── Transactions table ───────────────────────────────────────────────────────

  let txQuery = supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,reason,is_reversed,items!item_id(id,sku,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .gte('transaction_at', fromUtc)
    .lte('transaction_at', toUtc)
    .order('transaction_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  txQuery = applyTypeFilter(txQuery, typeFilter)

  if (itemFilter) {
    txQuery = txQuery.eq('item_id', itemFilter)
  }

  const { data: transactions, count: txCount, error: txError } = await txQuery

  // ── Low stock items ──────────────────────────────────────────────────────────

  const { data: allActiveItems, error: lowStockError } = await supabase
    .from('items')
    .select('id,sku,name,current_stock,minimum_stock,base_unit:units!base_unit_id(id,name,symbol)')
    .eq('is_active', true)
    .order('current_stock', { ascending: true })

  const lowStockItems = (allActiveItems ?? [])
    .filter((item) => Number(item.current_stock) <= Number(item.minimum_stock))
    .slice(0, 20)

  // Compute summary (totalIn = sum of positive deltas, totalOut = sum of negative deltas as abs)
  const summary = {
    totalIn: 0,
    totalOut: 0,
    totalAdjustmentIn: 0,
    totalAdjustmentOut: 0,
    totalReversal: 0,
    totalTransactions: (summaryData ?? []).length,
    lowStockCount: (lowStockItems ?? []).length,
  }

  for (const tx of summaryData ?? []) {
    const delta = Number(tx.quantity_delta ?? 0)
    if (delta > 0) {
      summary.totalIn += delta
    } else if (delta < 0) {
      summary.totalOut += Math.abs(delta)
    }

    if (tx.transaction_type === 'ADJUSTMENT_IN') {
      summary.totalAdjustmentIn += delta
    } else if (tx.transaction_type === 'ADJUSTMENT_OUT') {
      summary.totalAdjustmentOut += Math.abs(delta)
    } else if (tx.transaction_type === 'REVERSAL') {
      summary.totalReversal++
    }
  }

  const hasError = !!summaryError || !!txError

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Laporan Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ringkasan dan riwayat lengkap transaksi stok.
        </p>
      </div>

      {hasError && (
        <div className="alert-error mb-4">Gagal memuat sebagian data laporan. Coba muat ulang halaman.</div>
      )}

      <ReportsClient
        dateFrom={safeFrom}
        dateTo={safeTo}
        typeFilter={typeFilter}
        itemFilter={itemFilter}
        summary={summary}
        transactions={transactions ?? []}
        totalCount={txCount ?? 0}
        page={page}
        pageSize={pageSize}
        lowStockItems={lowStockItems ?? []}
        lowStockError={!!lowStockError}
      />
    </div>
  )
}
