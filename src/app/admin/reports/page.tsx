import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ReportsClient from './reports-client'
import {
  normalizeReportFilters,
  parseReportSummary,
} from '@/lib/reports/report-filters'

export const metadata: Metadata = {
  title: 'Laporan — InventarisBarang Admin',
}

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

  const {
    safeFrom,
    safeTo,
    startUtcIso,
    endUtcIso,
    typeFilter,
    itemFilter,
    page,
    isInvalidDateRange,
  } = normalizeReportFilters(params)

  const pageSize = 25

  // ── Helper to apply transaction type filter ──────────────────────────────
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

  // ── Transactions table query (Server-side paginated, stable sort) ─────────
  let txQuery = supabase
    .from('stock_transactions')
    .select(
      'id,transaction_number,transaction_type,input_quantity,base_quantity,quantity_delta,transaction_at,stock_before,stock_after,reason,is_reversed,items!item_id(id,sku,name),units!unit_id(id,name,symbol),profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .gte('transaction_at', startUtcIso)
    .lt('transaction_at', endUtcIso)
    .order('transaction_at', { ascending: false })
    .order('id', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  txQuery = applyTypeFilter(txQuery, typeFilter)

  if (itemFilter) {
    txQuery = txQuery.eq('item_id', itemFilter)
  }

  // ── Low stock items query (Server-side filtered via view) ──────────────
  const lowStockQuery = supabase
    .from('employee_items_view')
    .select('id,sku,name,current_stock,minimum_stock,base_unit_symbol')
    .in('stock_status', ['HABIS', 'HAMPIR_HABIS'])
    .order('current_stock', { ascending: true })
    .limit(20)

  const reportsStart = performance.now()

  // ── Parallel execution of summary RPC, transactions page, and low stock ──
  const [
    summaryRpcResult,
    { data: transactions, count: txCount, error: txError },
    { data: rawLowStockData, error: lowStockError },
  ] = await Promise.all([
    supabase.rpc('get_report_summary', {
      p_from_at: startUtcIso,
      p_to_at: endUtcIso,
      p_type: typeFilter === 'ALL' ? null : typeFilter,
      p_item_id: itemFilter || null,
    }),
    txQuery,
    lowStockQuery,
  ])

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(`[PERF] ReportsPage parallel data queries: ${(performance.now() - reportsStart).toFixed(2)}ms`)
  }

  const parsedSummary = parseReportSummary(summaryRpcResult.data, !!summaryRpcResult.error)

  type ViewLowStockItem = {
    id: string
    sku: string
    name: string
    current_stock: number
    minimum_stock: number
    base_unit_symbol: string
  }

  const lowStockItems = ((rawLowStockData ?? []) as ViewLowStockItem[]).map((item) => ({
    id: item.id,
    sku: item.sku,
    name: item.name,
    current_stock: item.current_stock,
    minimum_stock: item.minimum_stock,
    base_unit: {
      id: '',
      name: '',
      symbol: item.base_unit_symbol,
    },
  }))

  const hasError = parsedSummary.hasError || !!txError

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Laporan Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Ringkasan dan riwayat lengkap transaksi stok.
        </p>
      </div>

      {isInvalidDateRange && (
        <div className="alert-error mb-4" role="alert">
          Tanggal awal (Dari Tanggal) tidak boleh lebih besar dari tanggal akhir (Sampai Tanggal).
        </div>
      )}

      {hasError && (
        <div className="alert-error mb-4" role="alert">
          Gagal memuat sebagian data laporan. Coba muat ulang halaman.
        </div>
      )}

      <ReportsClient
        dateFrom={safeFrom}
        dateTo={safeTo}
        typeFilter={typeFilter}
        itemFilter={itemFilter}
        summary={{
          totalIn: parsedSummary.totalIn,
          totalOut: parsedSummary.totalOut,
          totalAdjustmentIn: parsedSummary.totalAdjustmentIn,
          totalAdjustmentOut: parsedSummary.totalAdjustmentOut,
          totalReversal: parsedSummary.totalReversal,
          totalTransactions: parsedSummary.totalTransactions,
          lowStockCount: parsedSummary.lowStockCount,
        }}
        summaryError={parsedSummary.hasError}
        transactions={transactions ?? []}
        totalCount={txCount ?? 0}
        page={page}
        pageSize={pageSize}
        lowStockItems={lowStockItems}
        lowStockError={!!lowStockError}
      />
    </div>
  )
}
