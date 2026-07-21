'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { PasswordInput } from '@/components/password-input'
import { createEmployee } from '../actions'

export default function NewEmployeeForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createEmployee(formData)
      if (result.success) {
        router.push('/admin/users?success=Pegawai berhasil ditambahkan')
      } else {
        setError(result.error ?? 'Gagal membuat pegawai.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="mx-auto max-w-md">
      {error && (
        <div role="alert" className="alert-error mb-4">{error}</div>
      )}

      <div className="card space-y-4">
        <div>
          <label htmlFor="new-user-fullname" className="label mb-1">
            Nama Lengkap <span className="text-red-500">*</span>
          </label>
          <input
            id="new-user-fullname"
            name="full_name"
            type="text"
            required
            maxLength={200}
            placeholder="Nama lengkap pegawai"
            className="input"
            autoFocus
          />
        </div>

        <div>
          <label htmlFor="new-user-username" className="label mb-1">
            Username <span className="text-red-500">*</span>
          </label>
          <input
            id="new-user-username"
            name="username"
            type="text"
            required
            minLength={3}
            maxLength={50}
            pattern="[a-z0-9._\-]+"
            placeholder="huruf kecil, angka, titik, _ atau -"
            className="input font-mono"
          />
          <p className="mt-1 text-xs text-gray-500">Huruf kecil, angka, titik, underscore, atau dash. Minimal 3 karakter.</p>
        </div>

        <div>
          <label htmlFor="new-user-password" className="label mb-1">
            Password Sementara <span className="text-red-500">*</span>
          </label>
          <PasswordInput
            id="new-user-password"
            name="password"
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={72}
            placeholder="Minimal 10 karakter"
            className="input"
          />
          <p className="mt-1 text-xs text-gray-500">Minimal 10 karakter. Pegawai harus mengganti password ini saat pertama login.</p>
        </div>

        <div className="rounded-md bg-blue-50 p-3 text-xs text-blue-700">
          Akun baru akan dibuat dengan peran <strong>Pegawai</strong>. Admin tidak dapat dibuat melalui antarmuka ini.
        </div>
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <button type="button" className="btn-secondary" onClick={() => router.back()} disabled={isPending}>
          Batal
        </button>
        <button id="btn-simpan-pegawai" type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Membuat Akun…' : 'Buat Akun Pegawai'}
        </button>
      </div>
    </form>
  )
}
