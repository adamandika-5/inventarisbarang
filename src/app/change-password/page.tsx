import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ChangePasswordForm from './change-password-form'
import ThemeToggle from '@/components/theme-toggle'

export const metadata: Metadata = {
  title: 'Ganti Kata Sandi — InventarisBarang',
  description: 'Ganti kata sandi akun Anda',
}

export default async function ChangePasswordPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,must_change_password')
    .eq('id', user.id)
    .single()

  if (!profile || !profile.is_active) {
    redirect('/login')
  }

  // If user does not need to change password, redirect to appropriate dashboard
  if (!profile.must_change_password) {
    redirect(profile.role === 'ADMIN' ? '/admin' : '/employee')
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-slate-50 dark:bg-[#0B1220] px-4 py-12 text-slate-900 dark:text-white transition-colors">
      <div className="absolute top-4 right-4">
        <ThemeToggle className="text-slate-600 dark:text-slate-300" />
      </div>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 dark:bg-[#22D3EE] shadow-lg">
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
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">InventarisBarang</h1>
        </div>

        <div className="card bg-white dark:bg-[#17263D] border border-slate-200 dark:border-white/10 shadow-md">
          <h2 className="mb-2 text-center text-lg font-semibold text-slate-800 dark:text-white">
            Ganti Kata Sandi
          </h2>
          <p className="mb-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Anda harus mengganti kata sandi sebelum melanjutkan.
          </p>
          <ChangePasswordForm />
        </div>
      </div>
    </main>
  )
}
