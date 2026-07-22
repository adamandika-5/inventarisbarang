import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import UsersClient from './users-client'

export const metadata: Metadata = {
  title: 'Manajemen Pengguna — InventarisBarang Admin',
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; page?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams
  const search = params.search?.trim() ?? ''
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25

  let query = supabase
    .from('profiles')
    .select('id, username, full_name, role, is_active, must_change_password, created_at, last_sign_in_at', { count: 'exact' })
    .order('full_name')
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (search) {
    query = query.or(`username.ilike.%${search}%,full_name.ilike.%${search}%`)
  }

  const { data: users, count, error } = await query

  if (error) {
    return <div className="alert-error">Gagal memuat data pengguna.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Manajemen Pengguna</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kelola akun pegawai</p>
      </div>
      <UsersClient
        initialUsers={users ?? []}
        totalCount={count ?? 0}
        page={page}
        pageSize={pageSize}
        search={search}
      />
    </div>
  )
}
