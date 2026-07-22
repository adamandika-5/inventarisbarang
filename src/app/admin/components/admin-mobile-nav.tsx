'use client'

/**
 * AdminMobileNav — Mobile header with hamburger menu drawer.
 */

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import ThemeToggle from '@/components/theme-toggle'

interface AdminMobileNavProps {
  fullName: string
}

const navItems = [
  { label: 'Dashboard', href: '/admin', exact: true },
  { label: 'Data Barang', href: '/admin/items' },
  { label: 'Kategori & Satuan', href: '/admin/categories' },
  { label: 'Barang Masuk', href: '/admin/stock-in' },
  { label: 'Riwayat Keluar', href: '/admin/stock-out' },
  { label: 'Penyesuaian Stok', href: '/admin/adjustments' },
  { label: 'Koreksi Transaksi', href: '/admin/reversals' },
  { label: 'Cetak Barcode', href: '/admin/barcode-print' },
  { label: 'Impor Excel', href: '/admin/import' },
  { label: 'Laporan', href: '/admin/reports' },
  { label: 'Pengguna', href: '/admin/users' },
  { label: 'Audit Log', href: '/admin/audit-log' },
  { label: 'Pengaturan', href: '/admin/settings' },
]

export default function AdminMobileNav({ fullName }: AdminMobileNavProps) {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    if (href === '/admin/categories') {
      return pathname.startsWith('/admin/categories') || pathname.startsWith('/admin/units')
    }
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    if (isLoggingOut) return
    setIsLoggingOut(true)
    setErrorMsg(null)

    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' })
      if (!res.ok) {
        throw new Error('Gagal keluar dari akun. Silakan coba lagi.')
      }
      const data = (await res.json()) as { success?: boolean; error?: string }
      if (!data.success) {
        throw new Error(data.error || 'Gagal keluar dari akun. Silakan coba lagi.')
      }
      router.replace('/login')
      router.refresh()
    } catch (err: unknown) {
      setIsLoggingOut(false)
      const msg = err instanceof Error ? err.message : 'Gagal keluar dari akun.'
      setErrorMsg(msg)
    }
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 shadow-sm lg:hidden">
        <div className="flex items-center">
          <button
            type="button"
            id="btn-mobile-menu"
            onClick={() => setIsOpen(true)}
            className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-white"
            aria-label="Buka menu"
            aria-expanded={isOpen}
            aria-controls="mobile-menu"
          >
            <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="ml-3 text-lg font-bold text-slate-900 dark:text-white">InventarisBarang</span>
        </div>
        <ThemeToggle className="text-slate-600 dark:text-slate-300" />
      </header>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        id="mobile-menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white dark:bg-slate-800 shadow-xl transition-transform duration-200 lg:hidden ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        aria-label="Menu mobile admin"
      >
        <div className="flex h-14 items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4">
          <span className="text-lg font-bold text-slate-900 dark:text-white">Menu Admin</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
            aria-label="Tutup menu"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <ul className="overflow-y-auto px-3 py-4">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={`flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${isActive(item.href, item.exact)
                    ? 'bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-slate-200 dark:border-slate-700 p-4">
          <p className="mb-3 text-sm font-medium text-slate-900 dark:text-white">{fullName}</p>
          {errorMsg && (
            <p className="mb-2 text-xs text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
          )}
          <div className="flex gap-2">
            <Link
              href="/admin/account"
              onClick={() => setIsOpen(false)}
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-600 px-3 py-2 text-center text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700"
            >
              Akun
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 rounded-md bg-red-50 dark:bg-red-900/20 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 disabled:opacity-50"
            >
              {isLoggingOut ? 'Keluar…' : 'Keluar'}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
