'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import ThemeToggle from '@/components/theme-toggle'

interface EmployeeNavProps {
  fullName: string
}

export default function EmployeeNav({ fullName }: EmployeeNavProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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
    <header className="sticky top-0 z-30 border-b border-gray-200 dark:border-white/10 bg-white dark:bg-[#101D31] shadow-sm transition-colors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 dark:bg-[#22D3EE] font-bold text-white dark:text-[#0B1220] shadow">
              IB
            </div>
            <Link href="/employee" className="text-lg font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-[#22D3EE]">
              InventarisBarang
            </Link>
          </div>

          {/* Desktop Navigation Links */}
          <nav className="hidden md:flex md:items-center md:gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${isActive(link.href)
                    ? 'bg-blue-50 dark:bg-[#22D3EE]/10 text-blue-700 dark:text-[#22D3EE] font-semibold'
                    : 'text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#203552] hover:text-gray-900 dark:hover:text-white'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Right side: User name, Theme Toggle & Logout */}
          <div className="hidden md:flex md:items-center md:gap-4">
            <span className="text-sm font-medium text-gray-700 dark:text-slate-200">{fullName}</span>
            <ThemeToggle className="text-gray-600 hover:text-gray-900 dark:text-slate-300 dark:hover:text-white" />
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="rounded-lg border border-gray-300 dark:border-white/20 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#203552] focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 transition-colors"
            >
              {isLoggingOut ? 'Keluar…' : 'Keluar'}
            </button>
          </div>

          {/* Mobile hamburger button & Theme Toggle */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle className="text-gray-600 dark:text-slate-300" />
            <button
              type="button"
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label={mobileMenuOpen ? 'Tutup menu' : 'Buka menu'}
              aria-expanded={mobileMenuOpen}
              className="inline-flex items-center justify-center rounded-md p-2 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#203552] hover:text-gray-900 dark:hover:text-white focus:outline-none"
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
        <div className="border-t border-gray-200 dark:border-white/10 bg-white dark:bg-[#101D31] px-4 pb-3 pt-2 md:hidden">
          <div className="space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`block rounded-md px-3 py-2 text-base font-medium ${isActive(link.href)
                    ? 'bg-blue-50 dark:bg-[#22D3EE]/10 text-blue-700 dark:text-[#22D3EE] font-semibold'
                    : 'text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-[#203552]'
                  }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="mt-4 border-t border-gray-200 dark:border-white/10 pt-3">
            <div className="px-3 text-sm font-medium text-gray-700 dark:text-slate-200 mb-2">Halo, {fullName}</div>
            {errorMsg && (
              <p className="px-3 mb-2 text-xs text-red-600 dark:text-red-400 font-medium">{errorMsg}</p>
            )}
            <button
              type="button"
              onClick={handleLogout}
              disabled={isLoggingOut}
              className="w-full rounded-md bg-gray-100 dark:bg-[#203552] px-3 py-2 text-center text-sm font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-200 dark:hover:bg-[#203552]/80 disabled:opacity-50"
            >
              {isLoggingOut ? 'Keluar…' : 'Keluar dari Akun'}
            </button>
          </div>
        </div>
      )}
    </header>
  )
}
