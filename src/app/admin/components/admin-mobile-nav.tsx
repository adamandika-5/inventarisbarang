'use client'

/**
 * AdminMobileNav — Mobile header with hamburger menu drawer.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'

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
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href
    if (href === '/admin/categories') {
      return pathname.startsWith('/admin/categories') || pathname.startsWith('/admin/units')
    }
    return pathname.startsWith(href)
  }

  const handleLogout = async () => {
    setIsLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/login'
    } catch {
      window.location.href = '/login'
    }
  }

  return (
    <>
      {/* Mobile top bar */}
      <header className="flex h-14 items-center border-b border-gray-200 bg-white px-4 shadow-sm lg:hidden">
        <button
          type="button"
          id="btn-mobile-menu"
          onClick={() => setIsOpen(true)}
          className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-900"
          aria-label="Buka menu"
          aria-expanded={isOpen}
          aria-controls="mobile-menu"
        >
          <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <span className="ml-3 text-lg font-bold text-gray-900">InventarisBarang</span>
      </header>

      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          aria-hidden="true"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <nav
        id="mobile-menu"
        className={`fixed inset-y-0 left-0 z-50 w-72 transform bg-white shadow-xl transition-transform duration-200 lg:hidden ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        aria-label="Menu mobile admin"
      >
        <div className="flex h-14 items-center justify-between border-b border-gray-200 px-4">
          <span className="text-lg font-bold text-gray-900">Menu Admin</span>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
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
                className={`flex items-center rounded-md px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive(item.href, item.exact)
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-current={isActive(item.href, item.exact) ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="border-t border-gray-200 p-4">
          <p className="mb-3 text-sm font-medium text-gray-900">{fullName}</p>
          <div className="flex gap-2">
            <Link
              href="/admin/account"
              onClick={() => setIsOpen(false)}
              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-center text-sm text-gray-700 hover:bg-gray-50"
            >
              Akun
            </Link>
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="flex-1 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {isLoggingOut ? 'Keluar…' : 'Keluar'}
            </button>
          </div>
        </div>
      </nav>
    </>
  )
}
