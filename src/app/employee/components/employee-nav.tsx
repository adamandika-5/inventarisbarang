'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface EmployeeNavProps {
  fullName: string
}

export default function EmployeeNav({ fullName }: EmployeeNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  const navLinks = [
    { href: '/employee', label: 'Beranda' },
    { href: '/employee/scan', label: 'Scan Ambil' },
    { href: '/employee/stock-out', label: 'Barang Keluar' },
    { href: '/employee/items', label: 'Cek Stok' },
    { href: '/employee/history', label: 'Riwayat Saya' },
  ]

  const isActive = (href: string) => {
    if (href === '/employee') return pathname === '/employee'
    return pathname.startsWith(href)
  }

  return (
    <header className="sticky top-0 z-30 border-b border-gray-200 bg-white shadow-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-600 font-bold text-white shadow">
              IB
            </div>
            <Link href="/employee" className="text-lg font-bold text-gray-900 hover:text-primary-600">
              InventarisBarang
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex md:items-center md:gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  isActive(link.href)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side: User name & Logout */}
          <div className="hidden md:flex md:items-center md:gap-4">
            <span className="text-sm font-medium text-gray-700">{fullName}</span>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Keluar
              </button>
            </form>
          </div>

          {/* Mobile hamburger button */}
          <div className="flex md:hidden">
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={mobileMenuOpen}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus:outline-none"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile navigation menu dropdown */}
      {mobileMenuOpen && (
        <div className="border-t border-gray-200 bg-white px-4 pb-3 pt-2 md:hidden">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block rounded-md px-3 py-2 text-base font-medium ${
                  isActive(link.href)
                    ? 'bg-primary-50 text-primary-700'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-200 pt-3">
            <div className="px-3 text-sm font-medium text-gray-700 mb-2">Halo, {fullName}</div>
            <form action="/api/auth/logout" method="POST">
              <button
                type="submit"
                className="w-full rounded-md bg-gray-100 px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Keluar dari Akun
              </button>
            </form>
          </div>
        </div>
      )}
    </header>
  )
}
