import type { Metadata } from 'next'
import LoginForm from './login-form'
import ThemeToggle from '@/components/theme-toggle'

export const metadata: Metadata = {
  title: 'Login — InventarisBarang',
  description: 'Masuk ke sistem InventarisBarang',
}

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B1220] px-4 py-12 text-slate-900 dark:text-white transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="text-slate-600 dark:text-slate-300" />
      </div>
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 dark:bg-[#22D3EE] shadow-lg">
            {/* Barcode icon SVG */}
            <svg
              className="h-9 w-9 text-white dark:text-[#0B1220]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 5v14M7 5v14M11 5v14M15 5v9M19 5v9M15 17h5M17 15l2 2-2 2" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">InventarisBarang</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sistem Pengelolaan Persediaan ATK</p>
        </div>

        {/* Login Card */}
        <div className="card bg-white dark:bg-[#17263D] border border-slate-200 dark:border-white/10 shadow-md">
          <h2 className="mb-6 text-center text-lg font-semibold text-slate-800 dark:text-white">Masuk ke Akun</h2>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-400">
          © 2026 FK Saintek 12 UNIPDU x BPS Kota Mojokerto.
        </p>
      </div>
    </main>
  )
}
