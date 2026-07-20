'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { validateUsername, validatePassword } from '@/lib/validation/auth'

interface FormState {
  username: string
  password: string
  errors: {
    username?: string
    password?: string
    general?: string
  }
  isSubmitting: boolean
}

export default function LoginForm() {
  const router = useRouter()
  const [state, setState] = useState<FormState>({
    username: '',
    password: '',
    errors: {},
    isSubmitting: false,
  })

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()

      // Prevent double submission
      if (state.isSubmitting) return

      // Client-side validation (UX layer)
      const usernameError = validateUsername(state.username)
      const passwordError = validatePassword(state.password)

      if (usernameError || passwordError) {
        setState((prev) => ({
          ...prev,
          errors: {
            username: usernameError ?? undefined,
            password: passwordError ?? undefined,
          },
        }))
        return
      }

      setState((prev) => ({ ...prev, isSubmitting: true, errors: {} }))

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: state.username.trim().toLowerCase(),
            password: state.password,
          }),
          credentials: 'same-origin', // include cookies
        })

        if (!response.ok) {
          // Generic error message — never reveal if username exists or not
          setState((prev) => ({
            ...prev,
            isSubmitting: false,
            errors: {
              general: 'Username atau kata sandi tidak valid. Silakan coba lagi.',
            },
          }))
          return
        }

        const data = (await response.json()) as { role?: string; mustChangePassword?: boolean }

        // Redirect based on must_change_password flag
        if (data.mustChangePassword) {
          router.push('/change-password')
          return
        }

        // Redirect to appropriate dashboard
        if (data.role === 'ADMIN') {
          router.push('/admin')
        } else {
          router.push('/employee')
        }
      } catch {
        setState((prev) => ({
          ...prev,
          isSubmitting: false,
          errors: {
            general: 'Terjadi kesalahan. Periksa koneksi internet Anda dan coba lagi.',
          },
        }))
      }
    },
    [state.username, state.password, state.isSubmitting, router],
  )

  return (
    <form onSubmit={handleSubmit} noValidate>
      {/* General error */}
      {state.errors.general && (
        <div role="alert" className="alert-error mb-4">
          {state.errors.general}
        </div>
      )}

      {/* Username field */}
      <div className="mb-4">
        <label htmlFor="username" className="label mb-1">
          Username
        </label>
        <input
          id="username"
          type="text"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={`input ${state.errors.username ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
          value={state.username}
          onChange={(e) => {
            setState((prev) => ({
              ...prev,
              username: e.target.value,
              errors: { ...prev.errors, username: undefined },
            }))
          }}
          disabled={state.isSubmitting}
          aria-describedby={state.errors.username ? 'username-error' : undefined}
          aria-invalid={!!state.errors.username}
          required
        />
        {state.errors.username && (
          <p id="username-error" className="mt-1 text-xs text-red-600" role="alert">
            {state.errors.username}
          </p>
        )}
      </div>

      {/* Password field */}
      <div className="mb-6">
        <label htmlFor="password" className="label mb-1">
          Kata Sandi
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          className={`input ${state.errors.password ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
          value={state.password}
          onChange={(e) => {
            setState((prev) => ({
              ...prev,
              password: e.target.value,
              errors: { ...prev.errors, password: undefined },
            }))
          }}
          disabled={state.isSubmitting}
          aria-describedby={state.errors.password ? 'password-error' : undefined}
          aria-invalid={!!state.errors.password}
          required
        />
        {state.errors.password && (
          <p id="password-error" className="mt-1 text-xs text-red-600" role="alert">
            {state.errors.password}
          </p>
        )}
      </div>

      {/* Submit button — disabled immediately after click to prevent double-submit */}
      <button
        id="login-submit"
        type="submit"
        className="btn-primary w-full"
        disabled={state.isSubmitting}
        aria-busy={state.isSubmitting}
      >
        {state.isSubmitting ? (
          <span className="flex items-center gap-2">
            <svg
              className="h-4 w-4 animate-spin"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Memproses...
          </span>
        ) : (
          'Masuk'
        )}
      </button>
    </form>
  )
}
