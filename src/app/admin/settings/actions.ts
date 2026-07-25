'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const settingsSchema = z.object({
  institution_name: z.string().max(200).trim().optional(),
  report_header_text: z.string().max(500).trim().optional(),
  default_barcode_label_count: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => n >= 1 && n <= 500, 'Jumlah label default antara 1 dan 500.')
    .optional(),
})

export interface ActionResult {
  success: boolean
  error?: string
  supabaseError?: {
    message: string
    code: string
    details: string | null
    hint: string | null
  }
}

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi.' }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role,is_active')
      .eq('id', user.id)
      .single()

    if (!profile?.is_active || profile.role !== 'ADMIN') {
      return { success: false, error: 'Akses ditolak.' }
    }

    const rawInstName = formData.get('institution_name') as string
    const rawHeader = formData.get('report_header_text') as string
    const rawLabelCount = formData.get('default_barcode_label_count') as string

    const parsed = settingsSchema.safeParse({
      institution_name: rawInstName || undefined,
      report_header_text: rawHeader || undefined,
      default_barcode_label_count: rawLabelCount || undefined,
    })

    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }
    }

    // 1. Query existing singleton settings row ID
    const { data: existingSettings, error: fetchErr } = await supabase
      .from('app_settings')
      .select('id')
      .limit(1)
      .maybeSingle()

    if (fetchErr) {
      console.error('Supabase app_settings fetch error:', {
        message: fetchErr.message,
        code: fetchErr.code,
        details: fetchErr.details,
        hint: fetchErr.hint,
      })
    }

    const payload = {
      institution_name: parsed.data.institution_name ?? null,
      report_header_text: parsed.data.report_header_text ?? null,
      default_barcode_label_count: parsed.data.default_barcode_label_count ?? 1,
      updated_by: user.id,
      updated_at: new Date().toISOString(),
    }

    let saveErr = null
    let settingsId = existingSettings?.id

    if (existingSettings?.id) {
      // Update existing singleton row (matching RLS policy app_settings_update_admin FOR UPDATE)
      const { error: updateErr } = await supabase
        .from('app_settings')
        .update(payload)
        .eq('id', existingSettings.id)
      saveErr = updateErr
    } else {
      // Insert if singleton row does not exist
      const { data: inserted, error: insertErr } = await supabase
        .from('app_settings')
        .insert(payload)
        .select('id')
        .single()
      saveErr = insertErr
      if (inserted) settingsId = inserted.id
    }

    if (saveErr) {
      console.error('Supabase app_settings save error:', {
        message: saveErr.message,
        code: saveErr.code,
        details: saveErr.details,
        hint: saveErr.hint,
      })
      return {
        success: false,
        error: `Gagal menyimpan pengaturan: ${saveErr.message}`,
        supabaseError: {
          message: saveErr.message,
          code: saveErr.code,
          details: saveErr.details,
          hint: saveErr.hint,
        },
      }
    }

    // 2. Audit log entry
    try {
      const { error: auditErr } = await supabase.from('audit_logs').insert({
        performed_by: user.id,
        action: 'SETTINGS_UPDATED',
        entity_type: 'app_settings',
        entity_id: settingsId ?? null,
        changes_summary: payload,
      })
      if (auditErr) {
        console.warn('Audit log insert for SETTINGS_UPDATED error:', {
          message: auditErr.message,
          code: auditErr.code,
          details: auditErr.details,
          hint: auditErr.hint,
        })
      }
    } catch (auditCatch) {
      console.warn('Audit log insert exception:', auditCatch)
    }

    revalidatePath('/admin/settings')
    revalidatePath('/admin/barcode-print')
    revalidatePath('/admin/reports')
    return { success: true }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Terjadi kesalahan server.'
    console.error('saveSettings exception:', err)
    return { success: false, error: errorMsg }
  }
}

