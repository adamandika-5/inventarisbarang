import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type AuditAction = Database['public']['Enums']['audit_action']

export interface CreateAuditLogParams {
  action: AuditAction
  entity_type: string
  entity_id?: string | null
  changes_summary?: Record<string, unknown> | null
  reason?: string | null
  request_metadata?: Record<string, unknown> | null
}

/**
 * Creates an audit log entry via the SECURITY DEFINER RPC `log_audit_event`.
 * Bypasses RLS SELECT-only constraint securely on the server.
 */
export async function createAuditLog(
  supabase: SupabaseClient<Database>,
  params: CreateAuditLogParams
): Promise<void> {
  const { error } = await supabase.rpc('log_audit_event', {
    p_action: params.action,
    p_entity_type: params.entity_type,
    p_entity_id: params.entity_id ?? null,
    p_changes_summary: (params.changes_summary as Database['public']['Tables']['audit_logs']['Insert']['changes_summary']) ?? null,
    p_reason: params.reason ?? null,
    p_request_metadata: (params.request_metadata as Database['public']['Tables']['audit_logs']['Insert']['request_metadata']) ?? null,
  })

  if (error) {
    console.error('Audit log insertion failed via log_audit_event RPC:', error)
    throw new Error(`Gagal mencatat audit log: ${error.message}`)
  }
}
