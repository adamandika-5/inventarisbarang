/**
 * Admin Dashboard loading state — responsive skeleton UI.
 */

import type React from 'react'

export default function AdminDashboardLoading() {
  const SkeletonBlock = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
    <div
      className={`animate-pulse rounded bg-slate-200 dark:bg-slate-700 ${className ?? ''}`}
      style={style}
      aria-hidden="true"
    />
  )

  return (
    <div className="space-y-6">
      {/* Page header skeleton */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div className="space-y-2">
          <SkeletonBlock className="h-8 w-56" />
          <SkeletonBlock className="h-4 w-80" />
        </div>
        <SkeletonBlock className="h-9 w-48 rounded-lg" />
      </div>

      {/* Metric cards skeleton */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="card min-w-0 p-5"
            aria-busy="true"
            aria-label="Memuat metrik..."
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <SkeletonBlock className="h-3 w-20" />
                <SkeletonBlock className="h-8 w-16" />
              </div>
              <SkeletonBlock className="h-11 w-11 shrink-0 rounded-lg" />
            </div>
            <SkeletonBlock className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>

      {/* Chart + stock summary row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
        {/* Chart skeleton */}
        <div className="card min-w-0 p-0" aria-busy="true" aria-label="Memuat grafik...">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <SkeletonBlock className="h-5 w-48" />
            <SkeletonBlock className="mt-2 h-3 w-64" />
          </div>
          <div className="px-6 pb-5 pt-6">
            <div className="grid grid-cols-7 gap-3">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <SkeletonBlock
                    className="w-full rounded-sm"
                    style={{ height: `${32 + Math.random() * 80}px` } as React.CSSProperties}
                  />
                  <SkeletonBlock className="h-3 w-6" />
                  <SkeletonBlock className="h-3 w-10" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Quick info skeletons */}
        <div className="space-y-6">
          <div className="card p-5" aria-busy="true">
            <SkeletonBlock className="h-5 w-32" />
            <SkeletonBlock className="mt-1 h-3 w-40" />
            <SkeletonBlock className="mt-5 h-3 w-full rounded-full" />
            <div className="mt-5 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <SkeletonBlock className="h-4 w-24" />
                  <SkeletonBlock className="h-4 w-8" />
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5" aria-busy="true">
            <SkeletonBlock className="h-5 w-24" />
            <div className="mt-4 grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-20 rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Table + recent tx row */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
        <div className="card min-w-0 p-0" aria-busy="true">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <SkeletonBlock className="h-5 w-40" />
            <SkeletonBlock className="mt-4 h-9 w-full rounded-md" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-3">
                <div className="flex-1 space-y-1">
                  <SkeletonBlock className="h-4 w-40" />
                  <SkeletonBlock className="h-3 w-20" />
                </div>
                <SkeletonBlock className="h-4 w-16" />
                <SkeletonBlock className="h-4 w-12" />
                <SkeletonBlock className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </div>

        <div className="card min-w-0 p-0" aria-busy="true">
          <div className="border-b border-slate-200 p-5 dark:border-white/10">
            <SkeletonBlock className="h-5 w-36" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-white/10">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between gap-3 p-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <SkeletonBlock className="h-4 w-16 rounded-full" />
                  <SkeletonBlock className="h-4 w-32" />
                  <SkeletonBlock className="h-3 w-24" />
                </div>
                <SkeletonBlock className="h-5 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
