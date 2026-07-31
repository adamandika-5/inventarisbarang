'use client'

/**
 * OutgoingStockCard Component
 * Client-side card component for displaying outgoing stock quantity (Barang Keluar)
 * with a period selector (Bulan Ini vs Tahun Ini).
 */

import { useState } from 'react'
import { formatNumber } from '@/lib/utils/format'

interface OutgoingStockCardProps {
  monthTotal: number
  yearTotal: number
  hasError?: boolean
}

export default function OutgoingStockCard({
  monthTotal,
  yearTotal,
  hasError = false,
}: OutgoingStockCardProps) {
  const [period, setPeriod] = useState<'month' | 'year'>('month')

  const currentTotal = period === 'month' ? monthTotal : yearTotal
  const displayValue = hasError ? '—' : `${formatNumber(currentTotal)} unit`
  const description =
    period === 'month'
      ? 'Total unit yang didistribusikan bulan ini'
      : 'Total unit yang didistribusikan tahun ini'

  return (
    <section className="card flex flex-col justify-between min-w-0 p-5" aria-label="Barang Keluar">
      <div>
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Barang Keluar
          </p>
          <select
            aria-label="Periode barang keluar"
            value={period}
            onChange={(e) => setPeriod(e.target.value as 'month' | 'year')}
            className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 dark:border-white/10 dark:bg-[#0B1220] dark:text-slate-200"
          >
            <option value="month">Bulan Ini</option>
            <option value="year">Tahun Ini</option>
          </select>
        </div>
        <div className="mt-2 flex items-start justify-between gap-3">
          <p className="text-2xl font-extrabold text-amber-600 dark:text-amber-300 sm:text-3xl">
            {displayValue}
          </p>
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300">
            {/* PackageMinus Icon */}
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
                d="M16 16h6M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14M7.5 4.27l9 5.15M3.29 7L12 12l8.71-5M12 22V12"
              />
            </svg>
          </div>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        {description}
      </p>
    </section>
  )
}
