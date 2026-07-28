'use client'

import { useState, useCallback } from 'react'
import { PasswordInput } from '@/components/password-input'
import { validatePassword } from '@/lib/validation/auth'

interface FormState {
  currentPassword: string
  newPassword: string
  confirmPassword: string
  errors: {
    currentPassword?: string
    newPassword?: string
    confirmPassword?: string
    general?: string
  }
  isSubmitting: boolean
  success: boolean
}

export default function ChangePasswordForm() {
  const [state, setState] = useState<FormState>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    errors: {},
    isSubmitting: false,
    success: false,
  })

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      if (state.isSubmitting) return

      // Client-side validation
      const errors: FormState['errors'] = {}

      if (!state.currentPassword) {
        errors.currentPassword = 'Kata sandi saat ini wajib diisi.'
      }

      const newPasswordError = validatePassword(state.newPassword)
      if (newPasswordError) errors.newPassword = newPasswordError

      if (state.newPassword !== state.confirmPassword) {
        errors.confirmPassword = 'Konfirmasi kata sandi tidak cocok.'
      }

      if (state.newPassword === state.currentPassword && !newPasswordError) {
        errors.newPassword = 'Kata sandi baru harus berbeda dengan kata sandi saat ini.'
      }

      if (Object.keys(errors).length > 0) {
        setState((prev) => ({ ...prev, errors }))
        return
      }

      setState((prev) => ({ ...prev, isSubmitting: true, errors: {} }))

      try {
        const response = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            currentPassword: state.currentPassword,
            newPassword: state.newPassword,
          }),
          credentials: 'same-origin',
        })

        const data = (await response.json()) as { success?: boolean; error?: string; redirectTo?: string }

        if (!response.ok || !data.success) {
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            errors: {
              general: data.error ?? 'Gagal mengganti kata sandi. Coba lagi.',
            },
          }))
          return
        }

        setState((prev) => ({ ...prev, isSubmitting: false, success: true }))

        // Redirect using window.location.replace to clear history stack and force server reload
        const destination = data.redirectTo || '/login'
        setTimeout(() => {
          window.location.replace(destination)
        }, 1000)
      } catch {
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          errors: {
            general: 'Terjadi kesalahan. Periksa koneksi dan coba lagi.',
          },
        }))
      }
    },
    [state],
  )

  if (state.success) {
    return (
      <div className="alert-success text-center">
        <p className="font-medium">Kata sandi berhasil diubah!</p>
        <p className="mt-1 text-sm">Mengalihkan ke halaman utama...</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      {state.errors.general && (
        <div role="alert" className="alert-error mb-4">
          {state.errors.general}
        </div>
      )}

      <div className="mb-4">
        <label htmlFor="current-password" className="label mb-1">
          Kata Sandi Saat Ini
        </label>
        <PasswordInput
          id="current-password"
          autoComplete="current-password"
          className={`input ${state.errors.currentPassword ? 'border-red-500' : ''}`}
          value={state.currentPassword}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              currentPassword: e.target.value,
              errors: { ...prev.errors, currentPassword: undefined },
            }))
          }
          disabled={state.isSubmitting}
          required
        />
        {state.errors.currentPassword && (
          <p className="mt-1 text-xs text-red-600">{state.errors.currentPassword}</p>
        )}
      </div>

      <div className="mb-4">
        <label htmlFor="new-password" className="label mb-1">
          Kata Sandi Baru
        </label>
        <PasswordInput
          id="new-password"
          autoComplete="new-password"
          className={`input ${state.errors.newPassword ? 'border-red-500' : ''}`}
          value={state.newPassword}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              newPassword: e.target.value,
              errors: { ...prev.errors, newPassword: undefined },
            }))
          }
          disabled={state.isSubmitting}
          required
        />
        {state.errors.newPassword && (
          <p className="mt-1 text-xs text-red-600">{state.errors.newPassword}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">Minimal 6 karakter.</p>
      </div>

      <div className="mb-6">
        <label htmlFor="confirm-password" className="label mb-1">
          Konfirmasi Kata Sandi Baru
        </label>
        <PasswordInput
          id="confirm-password"
          autoComplete="new-password"
          className={`input ${state.errors.confirmPassword ? 'border-red-500' : ''}`}
          value={state.confirmPassword}
          onChange={(e) =>
            setState((prev) => ({
              ...prev,
              confirmPassword: e.target.value,
              errors: { ...prev.errors, confirmPassword: undefined },
            }))
          }
          disabled={state.isSubmitting}
          required
        />
        {state.errors.confirmPassword && (
          <p className="mt-1 text-xs text-red-600">{state.errors.confirmPassword}</p>
        )}
      </div>

      <button
        id="change-password-submit"
        type="submit"
        className="btn-primary w-full"
        disabled={state.isSubmitting}
      >
        {state.isSubmitting ? 'Memproses...' : 'Ganti Kata Sandi'}
      </button>
    </form>
  )
}
