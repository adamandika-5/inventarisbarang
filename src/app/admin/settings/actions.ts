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

export interface ActionResult { success: boolean; error?: string }

export async function saveSettings(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi.' }

    const { data: profile } = await supabase
      .from('profiles').select('role,is_active').eq('id', user.id).single()
    if (!profile?.is_active || profile.role !== 'ADMIN') return { success: false, error: 'Akses ditolak.' }

    const parsed = settingsSchema.safeParse({
      institution_name: (formData.get('institution_name') as string) || undefined,
      report_header_text: (formData.get('report_header_text') as string) || undefined,
      default_barcode_label_count: (formData.get('default_barcode_label_count') as string) || undefined,
    })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }

    // Upsert settings (singleton row)
    const { error } = await supabase.from('app_settings').upsert({
      id: '00000000-0000-0000-0000-000000000001',
      ...parsed.data,
      updated_by: user.id,
    })
    if (error) return { success: false, error: 'Gagal menyimpan pengaturan.' }

    revalidatePath('/admin/settings')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan server.' }
  }
}
