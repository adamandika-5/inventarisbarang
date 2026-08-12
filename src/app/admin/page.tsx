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
  JAKARTA_TIME_ZONE,
  normalizeDashboardActivityPeriod,
  normalizeDashboardStockFilter,
  parseDashboardStats,
  sanitizeDashboardSearch,
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
}: {
  label: string
  value: string
  description: string
  tone: MetricTone
  icon: ReactNode
}) {
  const classes = metricToneClasses[tone]

  return (
    <section
      className="flex flex-col justify-between min-w-0 rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101D31] min-h-[150px]"
      aria-label={label}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {label}
        </p>
        <div className="mt-2.5 flex items-start justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-3xl truncate" title={value}>
            {value}
          </p>
          <span
            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${classes.icon}`}
          >
            {icon}
          </span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 line-clamp-1">{description}</p>
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
  const { startIso: activityStartIso, endIso: activityEndIso } = getJakartaActivityRange(activityPeriod, now)
  const periodLabel = getActivityPeriodLabel(activityPeriod)

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
    dashboardStatsResult,
    activityTransactionsResult,
    recentTransactionsResult,
    dashboardItemsResult,
  ] = await Promise.all([
    // Single RPC aggregation — replaces 7 separate card queries
    supabase.rpc('get_dashboard_stats', { p_tz: JAKARTA_TIME_ZONE }),
    // Activity chart data (needed for chart rendering, bounded by period)
    supabase
      .from('stock_transactions')
      .select('transaction_at,quantity_delta')
      .gte('transaction_at', activityStartIso)
      .lte('transaction_at', activityEndIso)
      .order('transaction_at', { ascending: true })
      .limit(500),
    // Recent transactions table (6 rows only)
    supabase
      .from('stock_transactions')
      .select(
        'id,transaction_number,transaction_type,input_quantity,quantity_delta,transaction_at,is_reversed,items!item_id(id,name,sku),units!unit_id(symbol),profiles!performed_by(full_name,username)',
      )
      .order('transaction_at', { ascending: false })
      .limit(6),
    dashboardItemsQuery,
  ])

  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(`[PERF] AdminDashboardPage parallel data queries: ${(performance.now() - dashboardStart).toFixed(2)}ms`)
  }

  // ── Error detection ──
  const statsError = !!dashboardStatsResult.error
  const transactionDataError =
    !!activityTransactionsResult.error ||
    !!recentTransactionsResult.error
  const tableDataError = !!dashboardItemsResult.error
  const hasPartialError = statsError || transactionDataError || tableDataError

  // ── Parse aggregated stats from RPC ──
  const stats = parseDashboardStats(dashboardStatsResult.data)

  const totalItems = statsError ? 0 : stats.active_items_count
  const totalStockUnits = statsError ? 0 : stats.total_stock_units
  const monthOutgoingTotal = statsError ? 0 : stats.outgoing_month_qty
  const yearOutgoingTotal = statsError ? 0 : stats.outgoing_year_qty
  const monthTransactions = statsError ? 0 : stats.month_transactions_count

  // Provided by RPC
  const lowStockCount = statsError ? 0 : stats.low_stock_count
  const outOfStockCount = statsError ? 0 : stats.out_of_stock_count
  const safeStockCount = statsError ? 0 : Math.max(0, totalItems - lowStockCount - outOfStockCount)

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

  // Compute chart max for dynamic integer Y-axis scaling (allowDecimals: false with headroom)
  const currentPeriodPoints = activityPeriod === 'week'
    ? dailySeries.flatMap((p) => [p.incoming, p.outgoing])
    : activityPeriod === 'month'
      ? weeklySeries.flatMap((p) => [p.incoming, p.outgoing])
      : monthlySeries.flatMap((p) => [p.incoming, p.outgoing])

  const peakDataValue = Math.max(0, ...currentPeriodPoints)
  const maxChartValue = peakDataValue > 0 ? peakDataValue : 1
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
        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
      />
    </svg>
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* ── Header Dashboard ── */}
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl tracking-tight">
            Dashboard
          </h1>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 sm:text-sm">
            Ringkasan kondisi persediaan dan aktivitas terbaru
          </p>
        </div>
        <div className="flex w-fit items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm dark:border-white/10 dark:bg-[#101D31] dark:text-slate-300">
          <svg
            className="h-4 w-4 text-blue-600 dark:text-cyan-400"
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

      {/* ── 4-Kolom Kartu Statistik ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* 1. Barang Aktif */}
        <MetricCard
          label="Barang Aktif"
          value={statsError ? '—' : formatNumber(totalItems)}
          description="Seluruh SKU barang aktif"
          tone="blue"
          icon={boxIcon}
        />

        {/* 2. Total Unit Stok */}
        <MetricCard
          label="Total Unit Stok"
          value={statsError ? '—' : formatNumber(totalStockUnits)}
          description="Jumlah unit stok barang aktif"
          tone="slate"
          icon={
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
                d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
              />
            </svg>
          }
        />

        {/* 3. Barang Keluar (Client Component with unit breakdown) */}
        <OutgoingStockCard
          monthTotal={monthOutgoingTotal}
          yearTotal={yearOutgoingTotal}
          hasError={statsError}
        />

        {/* 4. Transaksi Bulan Ini */}
        <MetricCard
          label="Transaksi Bulan Ini"
          value={statsError ? '—' : formatNumber(monthTransactions)}
          description={monthLabel}
          tone="slate"
          icon={
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
                d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
              />
            </svg>
          }
        />
      </div>

      {/* ── Baris 1: Grafik Aktivitas (8 Kolom) & Panel Kanan (4 Kolom: Kondisi Stok + Aksi Cepat) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 items-stretch">

        {/* Kolom Kiri (8/12): Grafik Aktivitas Transaksi */}
        <section className="lg:col-span-8 flex h-full flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101D31]">
          {/* Header Card Grafik */}
          <div className="flex flex-col gap-3 border-b border-slate-100 pb-4 dark:border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Aktivitas Stok
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {hasChartData
                  ? `${formatNumber(totalActivityTransactions)} transaksi · ${periodLabel.subtitle}`
                  : periodLabel.subtitle}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {/* Segmented Control Filter Periode */}
              <div
                className="flex rounded-lg border border-slate-200/90 p-0.5 text-xs font-semibold dark:border-white/10 bg-slate-50 dark:bg-[#0B1220]"
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
                      className={`rounded-md px-2.5 py-1 text-xs transition-colors ${
                        isActive
                          ? 'bg-white text-[#3B82F6] shadow-sm dark:bg-[#17263D] dark:text-[#60A5FA] font-bold'
                          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
                      }`}
                    >
                      {label}
                    </Link>
                  )
                })}
              </div>

              {/* Legenda */}
              <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-medium text-[#64748B] dark:text-[#94A3B8]">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#3B82F6] dark:bg-[#60A5FA]" />
                  Barang Masuk
                </span>
                <span className="flex items-center gap-1.5 font-medium text-[#64748B] dark:text-[#94A3B8]">
                  <span className="h-2.5 w-2.5 rounded-sm bg-[#F97316] dark:bg-[#FB923C]" />
                  Barang Keluar
                </span>
              </div>
            </div>
          </div>

          {/* Area Isi Grafik (Memanjang proporsional mengisi tinggi kartu) */}
          <div className="flex-1 flex flex-col justify-end pt-4">
            {activityTransactionsResult.error ? (
              <div className="flex min-h-48 items-center justify-center p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                Grafik transaksi belum dapat dimuat.
              </div>
            ) : !hasChartData ? (
              <div className="flex min-h-48 flex-col items-center justify-center p-6 text-center">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300">
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
                      d="M9 17v-6m4 6V7m4 10v-3M5 21h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </span>
                <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Belum ada transaksi
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Aktivitas pada periode ini akan tampil di sini.
                </p>
              </div>
            ) : activityPeriod === 'week' ? (
              // ── 7-Day Grouped Bar Chart (Tinggi proporsional ~200px) ──
              <div>
                <div className="grid grid-cols-7 gap-2 sm:gap-3">
                  {dailySeries.map((point) => {
                    const plotH = 180
                    const inH = point.incoming > 0 ? Math.max(18, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                    const outH = point.outgoing > 0 ? Math.max(18, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                    const [weekday, ...dateParts] = point.label.split(' ')
                    const dateStr = dateParts.join(' ')
                    return (
                      <div key={point.dateKey} className="min-w-0 text-center">
                        <div className="relative flex h-[190px] sm:h-[210px] items-end justify-center gap-1 sm:gap-1.5 border-b border-[#E2E8F0] dark:border-[#334155] pb-0.5">
                          {/* Incoming bar */}
                          {point.incoming > 0 && (
                            <div
                              className="relative z-10 flex w-3.5 sm:w-5 items-start justify-center rounded-t-[3px] bg-[#3B82F6] dark:bg-[#60A5FA] transition-all hover:opacity-90"
                              style={{ height: `${inH}px` }}
                              title={`Barang Masuk: ${point.incoming} transaksi (${point.label})`}
                              role="img"
                              aria-label={`${point.label}: ${point.incoming} masuk`}
                              tabIndex={0}
                            >
                              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold leading-none text-white">
                                {point.incoming}
                              </span>
                            </div>
                          )}
                          {/* Outgoing bar */}
                          {point.outgoing > 0 && (
                            <div
                              className="relative z-10 flex w-3.5 sm:w-5 items-start justify-center rounded-t-[3px] bg-[#F97316] dark:bg-[#FB923C] transition-all hover:opacity-90"
                              style={{ height: `${outH}px` }}
                              title={`Barang Keluar: ${point.outgoing} transaksi (${point.label})`}
                              role="img"
                              aria-label={`${point.label}: ${point.outgoing} keluar`}
                              tabIndex={0}
                            >
                              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold leading-none text-white">
                                {point.outgoing}
                              </span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">{weekday}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{dateStr}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{point.total} trx</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : activityPeriod === 'month' ? (
              // ── Weekly Grouped Bar Chart ──
              <div>
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${weeklySeries.length}, minmax(0, 1fr))` }}>
                  {weeklySeries.map((point) => {
                    const plotH = 180
                    const inH = point.incoming > 0 ? Math.max(18, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                    const outH = point.outgoing > 0 ? Math.max(18, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                    return (
                      <div key={point.weekNumber} className="min-w-0 text-center">
                        <div className="relative flex h-[190px] sm:h-[210px] items-end justify-center gap-1.5 border-b border-[#E2E8F0] dark:border-[#334155] pb-0.5">
                          {point.incoming > 0 && (
                            <div
                              className="relative z-10 flex w-4 sm:w-5 items-start justify-center rounded-t-[3px] bg-[#3B82F6] dark:bg-[#60A5FA]"
                              style={{ height: `${inH}px` }}
                              title={`Barang Masuk: ${point.incoming} transaksi`}
                              role="img"
                              aria-label={`Minggu ${point.weekNumber}: ${point.incoming} masuk`}
                              tabIndex={0}
                            >
                              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold leading-none text-white">{point.incoming}</span>
                            </div>
                          )}
                          {point.outgoing > 0 && (
                            <div
                              className="relative z-10 flex w-4 sm:w-5 items-start justify-center rounded-t-[3px] bg-[#F97316] dark:bg-[#FB923C]"
                              style={{ height: `${outH}px` }}
                              title={`Barang Keluar: ${point.outgoing} transaksi`}
                              role="img"
                              aria-label={`Minggu ${point.weekNumber}: ${point.outgoing} keluar`}
                              tabIndex={0}
                            >
                              <span className="mt-0.5 text-[9px] sm:text-[10px] font-bold leading-none text-white">{point.outgoing}</span>
                            </div>
                          )}
                        </div>
                        <p className="mt-2 text-xs font-semibold text-[#64748B] dark:text-[#94A3B8]">Minggu {point.weekNumber}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{point.label}</p>
                        <p className="mt-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{point.total} trx</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              // ── Yearly Grouped Bar Chart ──
              <div className="overflow-x-auto">
                <div className="grid min-w-[480px] grid-cols-12 gap-1.5">
                  {monthlySeries.map((point) => {
                    const plotH = 180
                    const inH = point.incoming > 0 ? Math.max(14, Math.round((point.incoming / maxChartValue) * plotH)) : 0
                    const outH = point.outgoing > 0 ? Math.max(14, Math.round((point.outgoing / maxChartValue) * plotH)) : 0
                    return (
                      <div key={point.monthIndex} className="min-w-0 text-center">
                        <div className="relative flex h-[190px] sm:h-[210px] items-end justify-center gap-0.5 border-b border-[#E2E8F0] dark:border-[#334155] pb-0.5">
                          {point.incoming > 0 && (
                            <div
                              className="relative z-10 flex w-2.5 sm:w-3 items-start justify-center rounded-t-[2px] bg-[#3B82F6] dark:bg-[#60A5FA]"
                              style={{ height: `${inH}px` }}
                              title={`Barang Masuk: ${point.incoming} transaksi`}
                              role="img"
                              aria-label={`${point.label}: ${point.incoming} masuk`}
                              tabIndex={0}
                            />
                          )}
                          {point.outgoing > 0 && (
                            <div
                              className="relative z-10 flex w-2.5 sm:w-3 items-start justify-center rounded-t-[2px] bg-[#F97316] dark:bg-[#FB923C]"
                              style={{ height: `${outH}px` }}
                              title={`Barang Keluar: ${point.outgoing} transaksi`}
                              role="img"
                              aria-label={`${point.label}: ${point.outgoing} keluar`}
                              tabIndex={0}
                            />
                          )}
                        </div>
                        <p className="mt-2 text-[11px] font-semibold text-[#64748B] dark:text-[#94A3B8]">{point.label}</p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{point.total} trx</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Kolom Kanan (4/12): Kondisi Stok + Aksi Cepat */}
        <div className="lg:col-span-4 flex flex-col justify-between gap-5 lg:gap-6">

          {/* 1. Kondisi Stok */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101D31]">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Kondisi Stok
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Berdasarkan batas minimum
                </p>
              </div>
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                {formatNumber(totalItems)} barang
              </span>
            </div>

            {statsError ? (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
                Ringkasan kondisi stok belum dapat dimuat.
              </p>
            ) : (
              <>
                {/* Segmented Progress Bar */}
                <div
                  className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-[#0B1220]"
                  aria-label={`${safeStockCount} aman, ${lowStockCount} hampir habis, ${outOfStockCount} habis`}
                >
                  <span
                    className="bg-emerald-500 transition-all duration-300"
                    style={{ width: `${percentage(safeStockCount, totalItems)}%` }}
                    title={`Aman: ${safeStockCount}`}
                  />
                  <span
                    className="bg-amber-500 transition-all duration-300"
                    style={{ width: `${percentage(lowStockCount, totalItems)}%` }}
                    title={`Hampir Habis: ${lowStockCount}`}
                  />
                  <span
                    className="bg-rose-500 transition-all duration-300"
                    style={{ width: `${percentage(outOfStockCount, totalItems)}%` }}
                    title={`Habis: ${outOfStockCount}`}
                  />
                </div>

                {/* Status Breakdown List */}
                <dl className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                      Aman
                    </dt>
                    <dd className="font-bold text-slate-900 dark:text-white">
                      {formatNumber(safeStockCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                      Hampir Habis
                    </dt>
                    <dd className="font-bold text-amber-600 dark:text-amber-400">
                      {formatNumber(lowStockCount)}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between text-xs sm:text-sm">
                    <dt className="flex items-center gap-2 text-slate-600 dark:text-slate-300 font-medium">
                      <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
                      Habis
                    </dt>
                    <dd className="font-bold text-rose-600 dark:text-rose-400">
                      {formatNumber(outOfStockCount)}
                    </dd>
                  </div>
                </dl>
              </>
            )}
          </section>

          {/* 2. Aksi Cepat (Grid 2x2, Consistent & Professional Single-Color System) */}
          <section className="rounded-xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-[#101D31]">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Aksi Cepat
            </h2>
            <div className="mt-3.5 grid grid-cols-2 gap-2.5">

              {/* 1. Tambah Barang */}
              <Link
                href="/admin/items/new"
                className="group flex min-h-[4.75rem] sm:min-h-[5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-3 text-center transition-all duration-150 hover:bg-[#F8FAFC] hover:border-[#BFDBFE] hover:-translate-y-0.5 active:translate-y-0 dark:border-white/10 dark:bg-[#101D31] dark:hover:bg-[#17263D] dark:hover:border-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950/40 dark:text-[#60A5FA] transition-colors">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                  Tambah Barang
                </span>
              </Link>

              {/* 2. Barang Masuk */}
              <Link
                href="/admin/stock-in"
                className="group flex min-h-[4.75rem] sm:min-h-[5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-3 text-center transition-all duration-150 hover:bg-[#F8FAFC] hover:border-[#BFDBFE] hover:-translate-y-0.5 active:translate-y-0 dark:border-white/10 dark:bg-[#101D31] dark:hover:bg-[#17263D] dark:hover:border-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950/40 dark:text-[#60A5FA] transition-colors">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-5 5m5-5l5 5" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                  Barang Masuk
                </span>
              </Link>

              {/* 3. Penyesuaian */}
              <Link
                href="/admin/adjustments"
                className="group flex min-h-[4.75rem] sm:min-h-[5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-3 text-center transition-all duration-150 hover:bg-[#F8FAFC] hover:border-[#BFDBFE] hover:-translate-y-0.5 active:translate-y-0 dark:border-white/10 dark:bg-[#101D31] dark:hover:bg-[#17263D] dark:hover:border-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950/40 dark:text-[#60A5FA] transition-colors">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                  Penyesuaian
                </span>
              </Link>

              {/* 4. Lihat Laporan */}
              <Link
                href="/admin/reports"
                className="group flex min-h-[4.75rem] sm:min-h-[5rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#E2E8F0] bg-white p-3 text-center transition-all duration-150 hover:bg-[#F8FAFC] hover:border-[#BFDBFE] hover:-translate-y-0.5 active:translate-y-0 dark:border-white/10 dark:bg-[#101D31] dark:hover:bg-[#17263D] dark:hover:border-blue-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 shadow-none"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] dark:bg-blue-950/40 dark:text-[#60A5FA] transition-colors">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5l5 5v11a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <span className="text-xs font-semibold text-[#0F172A] dark:text-slate-100">
                  Lihat Laporan
                </span>
              </Link>

            </div>
          </section>
        </div>
      </div>

      {/* ── Baris 2: Pantauan Stok Barang (8 Kolom) & Transaksi Terbaru (4 Kolom) ── */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6 items-start">

        {/* Kolom Kiri (8/12): Pantauan Stok Barang */}
        <section className="lg:col-span-8 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#101D31]">
          <div className="border-b border-slate-100 p-4 sm:p-5 dark:border-white/10">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                  Pantauan Stok Barang
                </h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {tableDataError
                    ? 'Data belum dapat dimuat'
                    : `${formatNumber(dashboardItemsResult.count ?? 0)} barang sesuai filter`}
                </p>
              </div>
              <Link
                href="/admin/items"
                className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-[#60A5FA] dark:hover:text-blue-300"
              >
                Buka Data Barang →
              </Link>
            </div>

            <form className="mt-3.5 flex flex-col gap-2 sm:flex-row" action="/admin" method="get">
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
                  className="input pl-9 text-xs sm:text-sm"
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
                className="input text-xs sm:text-sm sm:w-44"
              >
                <option value="ATTENTION">Perlu Perhatian</option>
                <option value="ALL">Semua Status</option>
                <option value="AMAN">Aman</option>
                <option value="HAMPIR_HABIS">Hampir Habis</option>
                <option value="HABIS">Habis</option>
              </select>
              <button type="submit" className="btn-primary whitespace-nowrap text-xs sm:text-sm">
                Terapkan
              </button>
              {(search || stockFilter !== 'ATTENTION') && (
                <Link href="/admin" className="btn-secondary whitespace-nowrap text-xs sm:text-sm">
                  Reset
                </Link>
              )}
            </form>
          </div>

          {tableDataError ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Daftar barang belum dapat dimuat.
            </div>
          ) : dashboardItems.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300">
                {boxIcon}
              </span>
              <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
                Tidak ada barang yang sesuai
              </p>
              <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                Ubah kata pencarian atau filter kondisi stok.
              </p>
            </div>
          ) : (
            <div className="w-full overflow-x-auto">
              <table className="w-full text-xs sm:text-sm">
                <thead className="bg-slate-50 dark:bg-[#0B1220] border-b border-slate-100 dark:border-white/10">
                  <tr>
                    <th className="px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Barang
                    </th>
                    <th className="px-2.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 hidden sm:table-cell">
                      Kategori
                    </th>
                    <th className="px-2.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Stok
                    </th>
                    <th className="px-2.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Minimum
                    </th>
                    <th className="px-2.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="px-3.5 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-white/10">
                  {dashboardItems.map((item) => (
                    <tr
                      key={item.id}
                      className="bg-white transition-colors hover:bg-slate-50/80 dark:bg-[#101D31] dark:hover:bg-[#17263D]"
                    >
                      <td className="px-3.5 py-2.5">
                        <p className="font-semibold text-slate-900 dark:text-white leading-tight">{item.name}</p>
                        <span className="code-chip mt-0.5 inline-block text-[10px]">{item.sku}</span>
                      </td>
                      <td className="px-2.5 py-2.5 text-slate-600 dark:text-slate-300 hidden sm:table-cell">
                        {item.category_name}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-bold text-slate-900 dark:text-white">
                        {formatNumber(item.current_stock)} {item.base_unit_symbol}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-right text-slate-500 dark:text-slate-400">
                        {formatNumber(item.minimum_stock)} {item.base_unit_symbol}
                      </td>
                      <td className="px-2.5 py-2.5">
                        <StockStatusBadge status={item.stock_status} />
                      </td>
                      <td className="px-3.5 py-2.5 text-right">
                        <Link
                          href={`/admin/items/${item.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 dark:text-[#60A5FA] dark:hover:text-blue-300 text-xs"
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

        {/* Kolom Kanan (4/12): Transaksi Terbaru */}
        <section className="lg:col-span-4 overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#101D31]">
          <div className="flex items-center justify-between border-b border-slate-100 p-4 sm:p-5 dark:border-white/10">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Transaksi Terbaru
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Aktivitas stok paling baru
              </p>
            </div>
            <Link
              href="/admin/reports"
              className="text-xs font-semibold text-blue-600 hover:text-blue-800 dark:text-[#60A5FA] dark:hover:text-blue-300"
            >
              Semua →
            </Link>
          </div>

          {recentTransactionsResult.error ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              Transaksi terbaru belum dapat dimuat.
            </div>
          ) : recentTransactions.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-300">
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
              <p className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
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
                  <article key={transaction.id} className="p-3.5 sm:p-4">
                    <div className="flex items-start justify-between gap-2.5">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                          {transaction.is_reversed && (
                            <span className="text-[10px] font-semibold text-red-600 dark:text-red-300">
                              Dikoreksi
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 truncate text-xs sm:text-[13px] font-semibold text-slate-900 dark:text-white">
                          {item?.name ?? 'Barang tidak tersedia'}
                        </p>
                        <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400 dark:text-slate-500">
                          {transaction.transaction_number}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 text-xs sm:text-sm font-bold ${
                          delta > 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : delta < 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {quantityPrefix}
                        {formatNumber(Number(transaction.input_quantity))} {unit?.symbol ?? ''}
                      </p>
                    </div>
                    <p className="mt-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                      {profile?.full_name ?? profile?.username ?? 'Pengguna'} ·{' '}
                      {formatDateTime(transaction.transaction_at, {
                        day: '2-digit',
                        month: 'short',
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
