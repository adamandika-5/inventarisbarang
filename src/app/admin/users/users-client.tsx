'use client'

import { useState, useTransition } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { toggleUserActive, resetUserPassword } from './actions'

interface User {
  id: string
  username: string
  full_name: string
  role: string
  is_active: boolean
  must_change_password: boolean
  created_at: string
  last_sign_in_at: string | null
}

interface UsersClientProps {
  initialUsers: User[]
  totalCount: number
  page: number
  pageSize: number
  search: string
}

const dtf = new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'Asia/Jakarta' })

export default function UsersClient({ initialUsers, totalCount, page, pageSize, search }: UsersClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const totalPages = Math.ceil(totalCount / pageSize)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const updateParam = (key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    p.set('page', '1')
    router.push(`${pathname}?${p.toString()}`)
  }

  const handleToggle = (id: string, isActive: boolean, fullName: string) => {
    const msg = isActive ? `Nonaktifkan akun ${fullName}?` : `Aktifkan kembali akun ${fullName}?`
    if (!confirm(msg)) return
    startTransition(async () => {
      const result = await toggleUserActive(id, isActive)
      if (result.success) {
        showMsg('success', `Akun ${fullName} berhasil ${isActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
        router.refresh()
      } else {
        showMsg('error', result.error ?? 'Gagal mengubah status akun.')
      }
    })
  }

  const handleResetPassword = (id: string, fullName: string) => {
    const tempPass = prompt(`Reset password ${fullName}.\n\nMasukkan password sementara (minimal 6 karakter):`)
    if (!tempPass || tempPass.length < 6) {
      if (tempPass !== null) showMsg('error', 'Password sementara minimal 6 karakter.')
      return
    }
    if (!confirm(`Anda akan mengatur ulang password ${fullName}. Lanjutkan?`)) return

    startTransition(async () => {
      const formData = new FormData()
      formData.set('user_id', id)
      formData.set('new_password', tempPass)
      const result = await resetUserPassword(formData)
      if (result.success) {
        showMsg('success', `Password ${fullName} berhasil direset. Pengguna harus mengganti password saat login.`)
      } else {
        showMsg('error', result.error ?? 'Gagal mereset password.')
      }
    })
  }

  return (
    <div>
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <input
          id="search-user"
          type="search"
          placeholder="Cari nama atau username…"
          defaultValue={search}
          className="input w-full sm:w-80 max-w-sm"
          onKeyDown={(e) => {
            if (e.key === 'Enter') updateParam('search', (e.target as HTMLInputElement).value)
          }}
        />
        <Link href="/admin/users/new" id="btn-tambah-pegawai" className="btn-primary shrink-0 self-start sm:self-auto">
          + Tambah Pegawai
        </Link>
      </div>

      {initialUsers.length === 0 ? (
        <div className="card py-12 text-center text-slate-500 dark:text-slate-400">
          <p className="text-lg font-medium">Tidak ada pengguna ditemukan</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table w-full" aria-label="Daftar pengguna">
            <thead>
              <tr>
                <th scope="col">NAMA LENGKAP</th>
                <th scope="col">USERNAME</th>
                <th scope="col">PERAN</th>
                <th scope="col">STATUS AKUN</th>
                <th scope="col">STATUS PASSWORD</th>
                <th scope="col" className="whitespace-nowrap">TERDAFTAR</th>
                <th scope="col" className="text-center w-60">TINDAKAN</th>
              </tr>
            </thead>
            <tbody>
              {initialUsers.map((user) => (
                <tr key={user.id}>
                  <td className="font-medium text-slate-900 dark:text-slate-100">{user.full_name}</td>
                  <td>
                    <code className="code-chip">{user.username}</code>
                  </td>
                  <td>
                    <span className={user.role === 'ADMIN' ? 'text-sm font-semibold text-blue-700 dark:text-blue-400' : 'text-sm text-slate-600 dark:text-slate-300'}>
                      {user.role === 'ADMIN' ? 'Admin' : 'Pegawai'}
                    </span>
                  </td>
                  <td>
                    {user.is_active ? (
                      <span className="badge-aman">Aktif</span>
                    ) : (
                      <span className="badge-nonaktif">Nonaktif</span>
                    )}
                  </td>
                  <td>
                    {user.must_change_password ? (
                      <span className="badge-hampir-habis text-xs whitespace-nowrap">Harus ganti</span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500">Normal</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap text-sm text-slate-500 dark:text-slate-400">
                    {dtf.format(new Date(user.created_at))}
                  </td>
                  <td className="text-center whitespace-nowrap">
                    {user.role !== 'ADMIN' ? (
                      <div className="inline-flex items-center justify-center gap-2">
                        <button
                          id={`btn-toggle-user-${user.id}`}
                          type="button"
                          className={
                            user.is_active
                              ? 'min-h-[36px] h-[36px] px-2.5 py-1 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center rounded-md border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'
                              : 'min-h-[36px] h-[36px] px-2.5 py-1 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors'
                          }
                          onClick={() => handleToggle(user.id, user.is_active, user.full_name)}
                          disabled={isPending}
                        >
                          {user.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                        </button>
                        <button
                          id={`btn-reset-password-${user.id}`}
                          type="button"
                          className="btn-secondary min-h-[36px] h-[36px] px-2.5 py-1 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center"
                          onClick={() => handleResetPassword(user.id, user.full_name)}
                          disabled={isPending}
                        >
                          Reset Password
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic">Akun saat ini</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-600 dark:text-slate-300">Halaman {page} dari {totalPages} ({totalCount} pengguna)</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page - 1))} disabled={page <= 1}>
              &laquo; Sebelumnya
            </button>
            <button type="button" className="btn-secondary text-sm"
              onClick={() => updateParam('page', String(page + 1))} disabled={page >= totalPages}>
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
