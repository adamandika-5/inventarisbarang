'use client'

/**
 * Admin Dashboard error boundary.
 * Rendered by Next.js when the admin segment throws during rendering.
 */

import { useEffect } from 'react'

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminDashboardError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log to error monitoring in production
    console.error('[AdminDashboard] Unhandled error:', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300">
        <svg
          className="h-8 w-8"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>

      <div className="max-w-md">
        <h1 className="text-xl font-bold text-slate-900 dark:text-white">
          Dashboard gagal dimuat
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Terjadi kesalahan saat memuat data dashboard. Pastikan koneksi internet Anda stabil, lalu
          coba lagi.
        </p>
        {error.digest && (
          <p className="mt-2 font-mono text-xs text-slate-400 dark:text-slate-500">
            Error ID: {error.digest}
          </p>
        )}
      </div>

      <button
        type="button"
        onClick={reset}
        className="btn-primary"
      >
        Coba Lagi
      </button>
    </div>
  )
}
