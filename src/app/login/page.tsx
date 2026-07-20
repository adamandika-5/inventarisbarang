import type { Metadata } from 'next'
import LoginForm from './login-form'

export const metadata: Metadata = {
  title: 'Login — InventarisBarang',
  description: 'Masuk ke sistem InventarisBarang',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo/Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-600">
            {/* Barcode icon SVG */}
            <svg
              className="h-9 w-9 text-white"
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
          <h1 className="text-2xl font-bold text-gray-900">InventarisBarang</h1>
          <p className="mt-1 text-sm text-gray-500">Sistem Pengelolaan Persediaan ATK</p>
        </div>

        {/* Login Card */}
        <div className="card">
          <h2 className="mb-6 text-center text-lg font-semibold text-gray-800">Masuk ke Akun</h2>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Tidak dapat masuk? Hubungi administrator.
        </p>
      </div>
    </main>
  )
}
