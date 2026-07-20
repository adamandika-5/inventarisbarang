'use server'

/**
 * Adjustment Server Actions
 * SECURITY: Admin only. Server recalculates delta from actual stock — no client trust.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const adjustmentSchema = z.object({
  client_request_id: z.string().uuid(),
  item_id: z.string().uuid(),
  physical_stock: z.string().regex(/^\d+$/, 'Stok fisik harus bilangan bulat non-negatif.').transform((v) => parseInt(v, 10)),
  reason: z.string().min(3, 'Alasan wajib diisi minimal 3 karakter.').max(500).trim(),
})

export interface AdjustmentResult {
  success: boolean
  error?: string
  data?: { transaction_number?: string; delta?: number; new_stock?: number }
}

export async function processAdjustment(formData: FormData): Promise<AdjustmentResult> {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { success: false, error: 'Tidak terautentikasi.' }

    const { data: profile } = await supabase
      .from('profiles').select('role,is_active').eq('id', user.id).single()
    if (!profile?.is_active || profile.role !== 'ADMIN') {
      return { success: false, error: 'Akses ditolak.' }
    }

    const parsed = adjustmentSchema.safeParse({
      client_request_id: formData.get('client_request_id'),
      item_id: formData.get('item_id'),
      physical_stock: formData.get('physical_stock'),
      reason: formData.get('reason'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map(i => i.message).join(' ') }
    }

    const { data, error } = await supabase.rpc('process_stock_adjustment', {
      p_client_request_id: parsed.data.client_request_id,
      p_item_id: parsed.data.item_id,
      p_physical_stock: parsed.data.physical_stock,
      p_reason: parsed.data.reason,
    })

    if (error) {
      if (error.message.includes('no difference')) {
        return { success: false, error: 'Stok fisik sama dengan stok sistem. Tidak ada penyesuaian yang dibuat.' }
      }
      return { success: false, error: 'Gagal melakukan penyesuaian stok.' }
    }

    revalidatePath('/admin/adjustments')
    revalidatePath('/admin/items')

    const result = data as { transaction_number: string | null; quantity_delta: number } | null
    return {
      success: true,
      data: {
        transaction_number: result?.transaction_number ?? undefined,
        delta: result?.quantity_delta ?? 0,
      },
    }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}
