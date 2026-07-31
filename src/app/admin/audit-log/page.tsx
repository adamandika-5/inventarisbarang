import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import AuditLogClient from './audit-log-client'

export const metadata: Metadata = {
  title: 'Audit Log — InventarisBarang Admin',
}

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; from?: string; to?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams
  const rawPage = parseInt(params.page ?? '1', 10)
  const page = Math.max(1, isNaN(rawPage) ? 1 : rawPage)
  const actionFilter = params.action ?? ''
  const pageSize = 20

  let query = supabase
    .from('audit_logs')
    .select(
      'id,performed_at,action,entity_type,entity_id,changes_summary,reason,profiles!performed_by(id,full_name,username)',
      { count: 'exact' },
    )
    .order('performed_at', { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1)

  if (actionFilter) {
    query = query.eq('action', actionFilter as import('@/types/database').AuditAction)
  }

  const { data: logs, count, error } = await query

  if (error) {
    return <div className="alert-error">Gagal memuat audit log.</div>
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Audit Log</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Riwayat lengkap tindakan admin</p>
      </div>
      <AuditLogClient
        logs={logs ?? []}
        totalCount={count ?? 0}
        page={page}
        pageSize={pageSize}
        actionFilter={actionFilter}
      />
    </div>
  )
}
