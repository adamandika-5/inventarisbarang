import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Akun Saya — InventarisBarang Admin',
}

export default async function AdminAccountPage() {
  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, username, role, is_active, created_at')
    .eq('id', user.id)
    .single()

  if (!profile) {
    redirect('/login')
  }

  const roleLabel = profile.role === 'ADMIN' ? 'Administrator (Admin)' : 'Karyawan (Employee)'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Akun Saya</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Informasi profil dan akun yang sedang aktif
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#111C2D] p-6 shadow-sm">
        <div className="flex items-center gap-4 pb-6 border-b border-slate-200 dark:border-white/10">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-[#22D3EE]/20 text-2xl font-bold text-blue-700 dark:text-[#22D3EE]">
            {(profile.full_name || profile.username || 'A').charAt(0).toUpperCase()}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
              {profile.full_name}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">@{profile.username}</p>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Nama Lengkap
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
              {profile.full_name}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Username
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
              {profile.username}
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Peran (Role)
            </dt>
            <dd className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
              <span className="inline-flex items-center rounded-full bg-blue-50 dark:bg-blue-900/30 px-2.5 py-0.5 text-xs font-semibold text-blue-700 dark:text-blue-300">
                {roleLabel}
              </span>
            </dd>
          </div>

          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ubah Password
            </dt>
            <dd className="mt-1 text-sm font-medium">
              <Link
                href="/change-password"
                className="text-blue-600 dark:text-[#22D3EE] hover:underline font-medium"
              >
                Ganti Kata Sandi →
              </Link>
            </dd>
          </div>
        </dl>
      </div>
    </div>
  )
}
