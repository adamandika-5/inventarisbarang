import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  buildDailyTransactionSeries,
  buildMonthlyTransactionSeries,
  buildWeeklyTransactionSeries,
  getActivityPeriodLabel,
  getJakartaActivityRange,
  getJakartaDashboardRange,
  getJakartaOutgoingRanges,
  JAKARTA_TIME_ZONE,
  normalizeDashboardActivityPeriod,
  normalizeDashboardStockFilter,
  sanitizeDashboardSearch,
  summarizeOutgoingStock,
  summarizeTotalStock,
} from '@/lib/dashboard/admin-dashboard'
import { formatDateTime, formatNumber } from '@/lib/utils/format'
import type { StockStatus, TransactionType } from '@/types/database'
import OutgoingStockCard from './components/outgoing-stock-card'

export const metadata: Metadata = {
  title: 'Dashboard Admin — Inventaris Barang',
  description: 'Ringkasan kondisi persediaan dan aktivitas operasional',
}

interface DashboardItemRow {
  id: string
  sku: string
  name: string
  category_name: string
  base_unit_symbol: string
  current_stock: number
  minimum_stock: number
  stock_status: StockStatus
}

interface RecentTransactionRow {
  id: string
  transaction_number: string
  transaction_type: TransactionType
  input_quantity: bigint | number | string
  quantity_delta: bigint | number | string
  transaction_at: string
  is_reversed: boolean
  items:
    | { id: string; name: string; sku: string }
    | Array<{ id: string; name: string; sku: string }>
    | null
  units: { symbol: string } | Array<{ symbol: string }> | null
  profiles:
    { full_name: string; username: string } | Array<{ full_name: string; username: string }> | null
}

type MetricTone = 'blue' | 'amber' | 'red' | 'green' | 'slate'

const metricToneClasses: Record<MetricTone, { icon: string; value: string }> = {
  blue: {
    icon: 'bg-blue-50 text-blue-600 dark:bg-[#22D3EE]/10 dark:text-[#22D3EE]',
    value: 'text-blue-700 dark:text-[#22D3EE]',
  },
  amber: {
    icon: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300',
    value: 'text-amber-600 dark:text-amber-300',
  },
  red: {
    icon: 'bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300',
    value: 'text-red-600 dark:text-red-300',
  },
  green: {
    icon: 'bg-green-50 text-green-600 dark:bg-green-950/50 dark:text-green-300',
    value: 'text-green-700 dark:text-green-300',
  },
  slate: {
    icon: 'bg-slate-100 text-slate-600 dark:bg-[#203552] dark:text-slate-300',
    value: 'text-slate-900 dark:text-white',
  },
}

function MetricCard({
  label,
  value,
  description,
  tone,
  icon,
  compact = false,
}: {
  label: string
  value: string
  description: string
  tone: MetricTone
  icon: ReactNode
  compact?: boolean
}) {
  const classes = metricToneClasses[tone]

  return (
    <section className="card min-w-0 p-5" aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p
            className={`mt-2 truncate font-extrabold leading-tight ${classes.value} ${
              compact ? 'text-xl 2xl:text-2xl' : 'text-3xl'
            }`}
            title={value}
          >
            {value}
          </p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${classes.icon}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{description}</p>
    </section>
  )
}

function StockStatusBadge({ status }: { status: StockStatus }) {
  if (status === 'HABIS') {
    return <span className="badge-habis">Habis</span>
  }
  if (status === 'HAMPIR_HABIS') {
    return <span className="badge-hampir-habis">Hampir Habis</span>
  }
  if (status === 'NONAKTIF') {
    return <span className="badge-nonaktif">Nonaktif</span>
  }
  return <span className="badge-aman">Aman</span>
}

function getTransactionMeta(transactionType: TransactionType): {
  label: string
  badgeClass: string
} {
  switch (transactionType) {
    case 'INITIAL':
      return {
        label: 'Stok Pembukaan',
        badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
      }
    case 'IN':
      return {
        label: 'Masuk',
        badgeClass: 'bg-green-100 text-green-700 dark:bg-green-950/60 dark:text-green-300',
      }
    case 'OUT':
      return {
        label: 'Keluar',
        badgeClass: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
      }
    case 'ADJUSTMENT_IN':
      return {
        label: 'Penyesuaian +',
        badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/60 dark:text-cyan-300',
      }
    case 'ADJUSTMENT_OUT':
      return {
        label: 'Penyesuaian −',
        badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300',
      }
    case 'REVERSAL':
      return {
        label: 'Koreksi',
        badgeClass: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
      }
  }
}

function unwrapRelation<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value
}

function percentage(value: number, total: number): number {
  if (total <= 0 || value <= 0) return 0
  return Math.min(100, (value / total) * 100)
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; stock?: string; activityPeriod?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams
  const now = new Date()
  const search = sanitizeDashboardSearch(params.q)
  const stockFilter = normalizeDashboardStockFilter(params.stock)
  const activityPeriod = normalizeDashboardActivityPeriod(params.activityPeriod)
  const { monthStartIso, nowIso } = getJakartaDashboardRange(now)
  const { startIso: activityStartIso } = getJakartaActivityRange(activityPeriod, now)
  const periodLabel = getActivityPeriodLabel(activityPeriod)
  const outgoingRanges = getJakartaOutgoingRanges(now)

  let dashboardItemsQuery = supabase
    .from('employee_items_view')
    .select('id,sku,name,category_name,base_unit_symbol,current_stock,minimum_stock,stock_status', {
      count: 'exact',
    })
    .order('current_stock', { ascending: true })
    .order('name', { ascending: true })
    .limit(6)

  if (stockFilter === 'ATTENTION') {
    dashboardItemsQuery = dashboardItemsQuery.in('stock_status', ['HABIS', 'HAMPIR_HABIS'])
  } else if (stockFilter !== 'ALL') {
    dashboardItemsQuery = dashboardItemsQuery.eq('stock_status', stockFilter)
  }

  if (search) {
    dashboardItemsQuery = dashboardItemsQuery.or(`name.ilike.%${search}%,sku.ilike.%${search}%`)
  }

  const dashboardStart = performance.now()
  const [
    totalItemsResult,
    lowStockResult,
    outOfStockResult,
    totalStockResult,
    monthTransactionsResult,
    activityTransactionsResult,
    recentTransactionsResult,
    dashboardItemsResult,
    monthOutgoingResult,
    yearOutgoingResult,
  ] = await Promise.all([
    supabase.from('employee_items_view').select('id', { count: 'exact', head: true }),
    supabase
      .from('employee_items_view')
      .select('id', { count: 'exact', head: true })
      .eq('stock_status', 'HAMPIR_HABIS'),
    supabase
      .from('employee_items_view')
      .select('id', { count: 'exact', head: true })
      .eq('stock_status', 'HABIS'),
    // Fetch current_stock for all active items to sum total units
    supabase
      .from('employee_items_view')
      .select('current_stock')
      .limit(10000),
    supabase
      .from('stock_transactions')
      .select('id', { count: 'exact', head: true })
      .gte('transaction_at', monthStartIso)
      .lte('transaction_at', nowIso),
    supabase
      .from('stock_transactions')
      .select('transaction_at,quantity_delta')
      .gte('transaction_at', activityStartIso)
      .lte('transaction_at', nowIso)
      .order('transaction_at', { ascending: true })
      .limit(10000),
    supabase
      .from('stock_transactions')
      .select(
        'id,transaction_number,transaction_type,input_quantity,quantity_delta,transaction_at,is_reversed,items!item_id(id,name,sku),units!unit_id(symbol),profiles!performed_by(full_name,username)',
      )
      .order('transaction_at', { ascending: false })
      .limit(6),
    dashboardItemsQuery,
    // Fetch OUT stock transactions for current WIB month
    supabase
      .from('stock_transactions')
      .select('base_quantity')
      .eq('transaction_type', 'OUT')
      .eq('is_reversed', false)
      .gte('transaction_at', outgoingRanges.monthStartIso)
      .lt('transaction_at', outgoingRanges.nextMonthStartIso)
      .limit(10000),
    // Fetch OUT stock transactions for current WIB year
    supabase
      .from('stock_transactions')
      .select('base_quantity')
      .eq('transaction_type', 'OUT')
      .eq('is_reversed', false)
      .gte('transaction_at', outgoingRanges.yearStartIso)
      .lt('transaction_at', outgoingRanges.nextYearStartIso)
      .limit(10000),
  ])

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(`[PERF] AdminDashboardPage parallel data queries: ${(performance.now() - dashboardStart).toFixed(2)}ms`)
  }

  const stockDataError =
    !!totalItemsResult.error || !!lowStockResult.error || !!outOfStockResult.error
  const transactionDataError =
    !!monthTransactionsResult.error ||
    !!activityTransactionsResult.error ||
    !!recentTransactionsResult.error
  const tableDataError = !!dashboardItemsResult.error
  const totalStockError = !!totalStockResult.error
  const outgoingDataError = !!monthOutgoingResult.error || !!yearOutgoingResult.error
  const hasPartialError =
    stockDataError || transactionDataError || tableDataError || outgoingDataError

  const totalItems = totalItemsResult.count ?? 0
  const lowStockCount = lowStockResult.count ?? 0
  const outOfStockCount = outOfStockResult.count ?? 0
  const safeStockCount = Math.max(0, totalItems - lowStockCount - outOfStockCount)
  const totalStockUnits = summarizeTotalStock(totalStockResult.data ?? [])
  const monthOutgoingTotal = summarizeOutgoingStock(monthOutgoingResult.data ?? [])
  const yearOutgoingTotal = summarizeOutgoingStock(yearOutgoingResult.data ?? [])

  // Build chart series based on period
  const activityRows = activityTransactionsResult.data ?? []
  const dailySeries = activityPeriod === 'week'
    ? buildDailyTransactionSeries(activityRows, now, 7)
    : []
  const weeklySeries = activityPeriod === 'month'
    ? buildWeeklyTransactionSeries(activityRows, now)
    : []
  const monthlySeries = activityPeriod === 'year'
    ? buildMonthlyTransactionSeries(activityRows, now)
    : []

  // Compute chart max for bar scaling
  const allSeriesPoints = [
    ...dailySeries.map((p) => Math.max(p.incoming, p.outgoing)),
    ...weeklySeries.map((p) => Math.max(p.incoming, p.outgoing)),
    ...monthlySeries.map((p) => Math.max(p.incoming, p.outgoing)),
  ]
  const maxChartValue = Math.max(1, ...allSeriesPoints)
  const totalActivityTransactions = activityRows.filter((r) => {
    const v = Number(r.quantity_delta)
    return Number.isFinite(v) && v !== 0
  }).length

  const hasChartData = totalActivityTransactions > 0

  const monthLabel = new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
    month: 'long',
    year: 'numeric',
  }).format(now)
  const headerDate = new Intl.DateTimeFormat('id-ID', {
    timeZone: JAKARTA_TIME_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(now)
  const recentTransactions = (recentTransactionsResult.data ??
    []) as unknown as RecentTransactionRow[]
  const dashboardItems = (dashboardItemsResult.data ?? []) as unknown as DashboardItemRow[]

  const boxIcon = (
    <svg
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  )

  return (
    <div className="space-y-6">
      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white sm:text-3xl">
            Dashboard Admin
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pantau kondisi persediaan dan aktivitas operasional dalam satu tampilan.
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#17263D] dark:text-slate-300">
          <svg
            className="h-4 w-4 text-blue-600 dark:text-[#22D3EE]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <span>{headerDate}</span>
        </div>
      </header>

      {hasPartialError && (
        <div className="alert-warning" role="status">
          Sebagian data dashboard belum dapat dimuat. Data lain yang tersedia tetap ditampilkan.
        </div>
      )}

      {/* 4-column metric cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Barang Aktif"
          value={stockDataError ? '—' : formatNumber(totalItems)}
          description="Seluruh SKU barang yang dapat ditransaksikan"
          tone="blue"
          icon={boxIcon}
        />
        <MetricCard
          label="Total Unit Stok"
          value={totalStockError ? '—' : formatNumber(totalStockUnits)}
          description="Jumlah unit stok seluruh barang aktif"
          tone="slate"
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          }
        />
        <OutgoingStockCard
          monthTotal={monthOutgoingTotal}
          yearTotal={yearOutgoingTotal}
          hasError={outgoingDataError}
        />
        <MetricCard
          label="Transaksi Bulan Ini"
          value={
            monthTransactionsResult.error ? '—' : formatNumber(monthTransactionsResult.count ?? 0)
          }
          description={monthLabel}
          tone="slate"
          icon={
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          }
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        <section className="card min-w-0 self-start p-0">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-5 dark:border-white/10 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {periodLabel.title}
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {hasChartData
                  ? `${formatNumber(totalActivityTransactions)} transaksi, ${periodLabel.subtitle}`
                  : periodLabel.subtitle}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-3 sm:items-end">
              {/* Segmented control — period filter */}
              <div
                className="flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold dark:border-white/10"
                role="group"
                aria-label="Pilih periode aktivitas"
              >
                {(['week', 'month', 'year'] as const).map((p) => {
                  const isActive = activityPeriod === p
                  const label = p === 'week' ? '7 Hari' : p === 'month' ? 'Bulan Ini' : 'Tahun Ini'
                  const href = `?activityPeriod=${p}${search ? `&q=${encodeURIComponent(search)}` : ''}${stockFilter !== 'ATTENTION' ? `&stock=${stockFilter}` : ''}`
                  return (
                    <Link
                      key={p}
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      className={`px-3 py-1.5 transition-colors ${
                        isActive
                          ? 'bg-blue-600 text-white dark:bg-[#22D3EE] dark:text-[#0B1220]'
                          : 'bg-white text-slate-600 hover:bg-slate-50 dark:bg-[#17263D] dark:text-slate-300 dark:hover:bg-[#203552]'
                      }`}
                    >
                      {label}
                    </Link>
                  )
                })}
              </div>
              {/* Legend */}
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-blue-600 dark:bg-[#22D3EE]" />
                  Masuk
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm bg-amber-500" />
                  Keluar
                </span>
              </div>
            </div>
          </div>

          {activityTransactionsResult.error ? (
            <div className="flex min-h-64 items-center justify-center p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Grafik transaksi belum dapat dimuat.
            </div>
          ) : !hasChartData ? (
            <div className="flex min-h-64 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-[#203552] dark:text-slate-300">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </span>
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                Belum ada transaksi
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Aktivitas pada periode ini akan tampil di sini.
              </p>
            </div>
          ) : activityPeriod === 'week' ? (
            // ── 7-day bar chart (per day) ────────────────────────────────────
            <div className="overflow-x-auto px-4 pb-5 pt-4 sm:px-6">
              <div className="grid min-w-[420px] gap-3" style={{ gridTemplateColumns: `repeat(${dailySeries.length}, minmax(0, 1fr))` }}>
                {dailySeries.map((point) => {
                  const plotH = 240 // mobile px, desktop uses sm override
                  const inH = point.incoming > 0 ? Math.max(24, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                  const outH = point.outgoing > 0 ? Math.max(24, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                  const [weekday, ...dateParts] = point.label.split(' ')
                  const dateStr = dateParts.join(' ')
                  return (
                    <div key={point.dateKey} className="min-w-0 text-center">
                      <div className="flex h-[240px] items-end justify-center gap-1.5 border-b border-slate-200 sm:h-[280px] dark:border-white/10">
                        {/* Incoming bar */}
                        {point.incoming > 0 && (
                          <div
                            className="relative flex w-5 items-start justify-center rounded-t-md bg-blue-600 dark:bg-[#22D3EE]"
                            style={{ height: `${inH}px` }}
                            title={`Masuk: ${point.incoming} transaksi`}
                            role="img"
                            aria-label={`${point.label}: ${point.incoming} masuk`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[10px] font-bold leading-none text-white">{point.incoming}</span>
                          </div>
                        )}
                        {/* Outgoing bar */}
                        {point.outgoing > 0 && (
                          <div
                            className="relative flex w-5 items-start justify-center rounded-t-md bg-amber-500"
                            style={{ height: `${outH}px` }}
                            title={`Keluar: ${point.outgoing} transaksi`}
                            role="img"
                            aria-label={`${point.label}: ${point.outgoing} keluar`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[10px] font-bold leading-none text-white">{point.outgoing}</span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">{weekday}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{dateStr}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">{point.total} trx</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : activityPeriod === 'month' ? (
            // ── Weekly bars within current month ─────────────────────────────
            <div className="overflow-x-auto px-4 pb-5 pt-4 sm:px-6">
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${weeklySeries.length}, minmax(0, 1fr))` }}>
                {weeklySeries.map((point) => {
                  const plotH = 240
                  const inH = point.incoming > 0 ? Math.max(24, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                  const outH = point.outgoing > 0 ? Math.max(24, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                  return (
                    <div key={point.weekNumber} className="min-w-0 text-center">
                      <div className="flex h-[240px] items-end justify-center gap-2 border-b border-slate-200 sm:h-[280px] dark:border-white/10">
                        {/* Incoming bar */}
                        {point.incoming > 0 && (
                          <div
                            className="relative flex w-6 items-start justify-center rounded-t-md bg-blue-600 dark:bg-[#22D3EE]"
                            style={{ height: `${inH}px` }}
                            title={`Masuk: ${point.incoming} transaksi`}
                            role="img"
                            aria-label={`Minggu ${point.weekNumber}: ${point.incoming} masuk`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[10px] font-bold leading-none text-white">{point.incoming}</span>
                          </div>
                        )}
                        {/* Outgoing bar */}
                        {point.outgoing > 0 && (
                          <div
                            className="relative flex w-6 items-start justify-center rounded-t-md bg-amber-500"
                            style={{ height: `${outH}px` }}
                            title={`Keluar: ${point.outgoing} transaksi`}
                            role="img"
                            aria-label={`Minggu ${point.weekNumber}: ${point.outgoing} keluar`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[10px] font-bold leading-none text-white">{point.outgoing}</span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">Minggu {point.weekNumber}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{point.label}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">{point.total} trx</p>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            // ── Monthly bars for the full year ───────────────────────────────
            <div className="overflow-x-auto px-4 pb-5 pt-4 sm:px-6">
              <div className="grid min-w-[560px] grid-cols-12 gap-2">
                {monthlySeries.map((point) => {
                  const plotH = 240
                  const inH = point.incoming > 0 ? Math.max(24, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                  const outH = point.outgoing > 0 ? Math.max(24, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                  return (
                    <div key={point.monthIndex} className="min-w-0 text-center">
                      <div className="flex h-[240px] items-end justify-center gap-1 border-b border-slate-200 sm:h-[280px] dark:border-white/10">
                        {/* Incoming bar */}
                        {point.incoming > 0 && (
                          <div
                            className="relative flex w-3.5 items-start justify-center rounded-t-md bg-blue-600 dark:bg-[#22D3EE]"
                            style={{ height: `${inH}px` }}
                            title={`Masuk: ${point.incoming} transaksi`}
                            role="img"
                            aria-label={`${point.label}: ${point.incoming} masuk`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[8px] font-bold leading-none text-white">{point.incoming}</span>
                          </div>
                        )}
                        {/* Outgoing bar */}
                        {point.outgoing > 0 && (
                          <div
                            className="relative flex w-3.5 items-start justify-center rounded-t-md bg-amber-500"
                            style={{ height: `${outH}px` }}
                            title={`Keluar: ${point.outgoing} transaksi`}
                            role="img"
                            aria-label={`${point.label}: ${point.outgoing} keluar`}
                            tabIndex={0}
                          >
                            <span className="mt-1 text-[8px] font-bold leading-none text-white">{point.outgoing}</span>
                          </div>
                        )}
                      </div>
                      <p className="mt-2 text-[11px] font-semibold text-slate-700 dark:text-slate-200">{point.label}</p>
                      <p className="mt-1 text-[11px] font-medium text-slate-600 dark:text-slate-300">{point.total} trx</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <div className="space-y-6">
          <section className="card p-5">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Kondisi Stok
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Barang aktif berdasarkan status
              </p>
            </div>

            {stockDataError ? (
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                Ringkasan kondisi stok belum dapat dimuat.
              </p>
            ) : (
              <>
                <div
                  className="mt-5 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-[#0B1220]"
                  aria-label={`${safeStockCount} aman, ${lowStockCount} hampir habis, ${outOfStockCount} habis`}
                >
                  <span
                    className="bg-green-500"
                    style={{ width: `${percentage(safeStockCount, totalItems)}%` }}
                  />
                  <span
                    className="bg-amber-500"
                    style={{ width: `${percentage(lowStockCount, totalItems)}%` }}
                  />
                  <span
                    className="bg-red-500"
                    style={{ width: `${percentage(outOfStockCount, totalItems)}%` }}
                  />
                </div>
                <dl className="mt-5 space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full bg-green-500" />
                      Aman
                    </dt>
                    <dd className="font-semibold text-slate-900 dark:text-white">
                      {formatNumber(safeStockCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Hampir Habis
                    </dt>
                    <dd className="font-semibold text-amber-600 dark:text-amber-300">
                      {formatNumber(lowStockCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                      <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                      Habis
                    </dt>
                    <dd className="font-semibold text-red-600 dark:text-red-300">
                      {formatNumber(outOfStockCount)}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          <section className="card p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Aksi Cepat</h2>
            <div className="mt-4 grid grid-cols-2 gap-3">

              {/* Tambah Barang */}
              <Link
                href="/admin/items/new"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Tambah Barang
              </Link>

              {/* Barang Masuk */}
              <Link
                href="/admin/stock-in"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-5 5m5-5l5 5" />
                </svg>
                Barang Masuk
              </Link>

              {/* Penyesuaian */}
              <Link
                href="/admin/adjustments"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
                Penyesuaian
              </Link>

              {/* Lihat Laporan */}
              <Link
                href="/admin/reports"
                className="flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-3 text-center text-xs font-semibold text-slate-700 transition-colors hover:border-blue-300 hover:bg-slate-50 hover:text-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z" />
                </svg>
                Lihat Laporan
              </Link>

            </div>
          </section>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <section className="card min-w-0 p-0">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  Pantauan Stok Barang
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {tableDataError
                    ? 'Data belum dapat dimuat'
                    : `${formatNumber(dashboardItemsResult.count ?? 0)} barang sesuai filter`}
                </p>
              </div>
              <Link
                href="/admin/items"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-[#22D3EE] dark:hover:text-cyan-200"
              >
                Buka Data Barang →
              </Link>
            </div>

            <form className="mt-4 flex flex-col gap-2 sm:flex-row" action="/admin" method="get">
              <label htmlFor="dashboard-item-search" className="sr-only">
                Cari nama atau SKU barang
              </label>
              <div className="relative min-w-0 flex-1">
                <svg
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-4.35-4.35m1.35-5.65a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  id="dashboard-item-search"
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder="Cari nama atau SKU..."
                  className="input pl-9"
                  maxLength={80}
                />
              </div>
              <label htmlFor="dashboard-stock-filter" className="sr-only">
                Filter kondisi stok
              </label>
              <select
                id="dashboard-stock-filter"
                name="stock"
                defaultValue={stockFilter}
                className="input sm:w-44"
              >
                <option value="ATTENTION">Perlu Perhatian</option>
                <option value="ALL">Semua Status</option>
                <option value="AMAN">Aman</option>
                <option value="HAMPIR_HABIS">Hampir Habis</option>
                <option value="HABIS">Habis</option>
              </select>
              <button type="submit" className="btn-primary whitespace-nowrap">
                Terapkan
              </button>
              {(search || stockFilter !== 'ATTENTION') && (
                <Link href="/admin" className="btn-secondary whitespace-nowrap">
                  Reset
                </Link>
              )}
            </form>
          </div>

          {tableDataError ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Daftar barang belum dapat dimuat.
            </div>
          ) : dashboardItems.length === 0 ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-[#203552] dark:text-slate-300">
                {boxIcon}
              </span>
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                Tidak ada barang yang sesuai
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Ubah kata pencarian atau filter kondisi stok.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-slate-50 dark:bg-[#0B1220]">
                  <tr className="border-b border-slate-200 dark:border-white/10">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Barang
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Kategori
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Stok
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Minimum
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {dashboardItems.map((item) => (
                    <tr
                      key={item.id}
                      className="bg-white transition-colors hover:bg-slate-50 dark:bg-[#17263D] dark:hover:bg-[#203552]"
                    >
                      <td className="px-5 py-3">
                        <p className="font-medium text-slate-900 dark:text-white">{item.name}</p>
                        <span className="code-chip mt-1 inline-block">{item.sku}</span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {item.category_name}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-semibold text-slate-900 dark:text-white">
                        {formatNumber(item.current_stock)} {item.base_unit_symbol}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right text-slate-600 dark:text-slate-300">
                        {formatNumber(item.minimum_stock)} {item.base_unit_symbol}
                      </td>
                      <td className="px-4 py-3">
                        <StockStatusBadge status={item.stock_status} />
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/admin/items/${item.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 dark:text-[#22D3EE] dark:hover:text-cyan-200"
                        >
                          Detail
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="card min-w-0 p-0">
          <div className="flex items-center justify-between border-b border-slate-200 p-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Transaksi Terbaru
              </h2>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Aktivitas stok paling baru
              </p>
            </div>
            <Link
              href="/admin/reports"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-[#22D3EE] dark:hover:text-cyan-200"
            >
              Semua →
            </Link>
          </div>

          {recentTransactionsResult.error ? (
            <div className="p-6 text-center text-sm text-slate-500 dark:text-slate-400">
              Transaksi terbaru belum dapat dimuat.
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-[#203552] dark:text-slate-300">
                <svg
                  className="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a3 3 0 006 0M9 5a3 3 0 016 0"
                  />
                </svg>
              </span>
              <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">
                Belum ada transaksi
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/10">
              {recentTransactions.map((transaction) => {
                const item = unwrapRelation(transaction.items)
                const unit = unwrapRelation(transaction.units)
                const profile = unwrapRelation(transaction.profiles)
                const meta = getTransactionMeta(transaction.transaction_type)
                const delta = Number(transaction.quantity_delta)
                const quantityPrefix = delta > 0 ? '+' : delta < 0 ? '−' : ''

                return (
                  <article key={transaction.id} className="p-4 first:pt-5 last:pb-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          {transaction.is_reversed && (
                            <span className="text-[10px] font-semibold text-red-600 dark:text-red-300">
                              Dikoreksi
                            </span>
                          )}
                        </div>
                        <p className="mt-2 truncate text-sm font-semibold text-slate-900 dark:text-white">
                          {item?.name ?? 'Barang tidak tersedia'}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                          {transaction.transaction_number}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-sm font-bold ${
                          delta > 0
                            ? 'text-green-600 dark:text-green-300'
                            : delta < 0
                              ? 'text-amber-600 dark:text-amber-300'
                              : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {quantityPrefix}
                        {formatNumber(Number(transaction.input_quantity))} {unit?.symbol ?? ''}
                      </p>
                    </div>
                    <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
                      {profile?.full_name ?? profile?.username ?? 'Pengguna'} ·{' '}
                      {formatDateTime(transaction.transaction_at, {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
