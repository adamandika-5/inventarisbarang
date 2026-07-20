/**
 * Units Server Actions
 *
 * SECURITY:
 * - All mutations verify admin role server-side
 * - Input validated with Zod before processing
 */
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const unitSchema = z.object({
  name: z
    .string()
    .min(1, 'Nama satuan wajib diisi.')
    .max(50, 'Nama satuan maksimal 50 karakter.')
    .trim(),
  symbol: z
    .string()
    .min(1, 'Simbol satuan wajib diisi.')
    .max(20, 'Simbol satuan maksimal 20 karakter.')
    .trim(),
})

export interface ActionResult {
  success: boolean
  error?: string
  data?: unknown
}

async function verifyAdmin() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isAdmin: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single()

  return {
    supabase,
    user,
    isAdmin: !!(profile?.is_active && profile.role === 'ADMIN'),
  }
}

/**
 * Create a new unit (admin only)
 */
export async function createUnit(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    const parsed = unitSchema.safeParse({
      name: formData.get('name'),
      symbol: formData.get('symbol'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }
    }

    const { error } = await supabase.from('units').insert({
      name: parsed.data.name,
      name_normalized: parsed.data.name.toLowerCase(),
      symbol: parsed.data.symbol,
      is_active: true,
    })

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Satuan dengan nama atau simbol tersebut sudah ada.' }
      }
      return { success: false, error: 'Gagal membuat satuan.' }
    }

    revalidatePath('/admin/units')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}

/**
 * Update unit (admin only)
 */
export async function updateUnit(id: string, formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    const parsed = unitSchema.safeParse({
      name: formData.get('name'),
      symbol: formData.get('symbol'),
    })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }
    }

    const { error } = await supabase
      .from('units')
      .update({ name: parsed.data.name, symbol: parsed.data.symbol })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Satuan dengan nama atau simbol tersebut sudah ada.' }
      }
      return { success: false, error: 'Gagal memperbarui satuan.' }
    }

    revalidatePath('/admin/units')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}

/**
 * Toggle unit active status (admin only)
 * Cannot deactivate a unit that's in use
 */
export async function toggleUnitActive(id: string, currentIsActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    if (currentIsActive) {
      // Check if used as base unit in items
      const { count: itemCount } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('base_unit_id', id)

      if (itemCount && itemCount > 0) {
        return {
          success: false,
          error: `Satuan masih digunakan sebagai satuan dasar oleh ${itemCount} barang.`,
        }
      }

      // Check if used in item_units
      const { count: iuCount } = await supabase
        .from('item_units')
        .select('id', { count: 'exact', head: true })
        .eq('unit_id', id)
        .eq('is_active', true)

      if (iuCount && iuCount > 0) {
        return {
          success: false,
          error: `Satuan masih digunakan oleh konfigurasi satuan barang.`,
        }
      }
    }

    const { error } = await supabase
      .from('units')
      .update({ is_active: !currentIsActive })
      .eq('id', id)

    if (error) {
      return { success: false, error: 'Gagal mengubah status satuan.' }
    }

    revalidatePath('/admin/units')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}
