/**
 * Categories Server Actions
 *
 * SECURITY:
 * - All mutations verify admin role server-side
 * - Input validated with Zod before processing
 * - No client-trusted role or status values
 */
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const categorySchema = z.object({
  name: z
    .string()
    .min(1, 'Nama kategori wajib diisi.')
    .max(100, 'Nama kategori maksimal 100 karakter.')
    .trim(),
})

export interface ActionResult {
  success: boolean
  error?: string
  data?: unknown
}

/**
 * Create a new category (admin only)
 */
export async function createCategory(formData: FormData): Promise<ActionResult> {
  try {
    const supabase = await createSupabaseServerClient()

    // Verify admin role
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

    // Validate input
    const parsed = categorySchema.safeParse({ name: formData.get('name') })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }
    }

    const nameNormalized = parsed.data.name.toLowerCase()

    // Insert
    const { error } = await supabase.from('categories').insert({
      name: parsed.data.name,
      name_normalized: nameNormalized,
      is_active: true,
    })

    if (error) {
      if (error.code === '23505') {
        // Unique violation
        return { success: false, error: 'Kategori dengan nama tersebut sudah ada.' }
      }
      return { success: false, error: 'Gagal membuat kategori.' }
    }

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}

/**
 * Update category name (admin only)
 */
export async function updateCategory(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
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

    const parsed = categorySchema.safeParse({ name: formData.get('name') })
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }
    }

    const nameNormalized = parsed.data.name.toLowerCase()

    const { error } = await supabase
      .from('categories')
      .update({
        name: parsed.data.name,
        name_normalized: nameNormalized,
      })
      .eq('id', id)

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Kategori dengan nama tersebut sudah ada.' }
      }
      return { success: false, error: 'Gagal memperbarui kategori.' }
    }

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}

/**
 * Toggle category active status (admin only)
 * Cannot deactivate a category that's in use
 */
export async function toggleCategoryActive(
  id: string,
  currentIsActive: boolean,
): Promise<ActionResult> {
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

    // If deactivating, check if category is in use
    if (currentIsActive) {
      const { count } = await supabase
        .from('items')
        .select('id', { count: 'exact', head: true })
        .eq('category_id', id)

      if (count && count > 0) {
        return {
          success: false,
          error: `Kategori masih digunakan oleh ${count} barang dan tidak dapat dinonaktifkan.`,
        }
      }
    }

    const { error } = await supabase
      .from('categories')
      .update({ is_active: !currentIsActive })
      .eq('id', id)

    if (error) {
      return { success: false, error: 'Gagal mengubah status kategori.' }
    }

    revalidatePath('/admin/categories')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}
