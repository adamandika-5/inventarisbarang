'use server'

/**
 * Users admin server actions.
 * SECURITY:
 * - Only admin can manage users
 * - Cannot create or promote admin accounts
 * - Cannot deactivate self
 * - Uses admin Supabase client for auth.admin operations
 */

import { createSupabaseServerClient, createSupabaseAdmin } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export interface ActionResult { success: boolean; error?: string }

async function verifyAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, adminClient: null, user: null, isAdmin: false }

  const { data: profile } = await supabase
    .from('profiles').select('role,is_active').eq('id', user.id).single()
  const isAdmin = !!(profile?.is_active && profile.role === 'ADMIN')
  return { supabase, user, isAdmin }
}

/**
 * Toggle employee active status (cannot toggle admins)
 */
export async function toggleUserActive(userId: string, currentIsActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, user, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    // Prevent self-deactivation
    if (user?.id === userId && currentIsActive) {
      return { success: false, error: 'Tidak dapat menonaktifkan akun sendiri.' }
    }

    // Fetch target profile — prevent managing admins
    const { data: targetProfile } = await supabase
      .from('profiles').select('role').eq('id', userId).single()
    if (!targetProfile) return { success: false, error: 'Pengguna tidak ditemukan.' }
    if (targetProfile.role === 'ADMIN') {
      return { success: false, error: 'Admin tidak dapat dikelola melalui antarmuka ini.' }
    }

    const { error } = await supabase
      .from('profiles').update({ is_active: !currentIsActive }).eq('id', userId)
    if (error) return { success: false, error: 'Gagal mengubah status pengguna.' }

    revalidatePath('/admin/users')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan server.' }
  }
}

/**
 * Reset employee password (admin only)
 * Sets must_change_password = true
 */
export async function resetUserPassword(formData: FormData): Promise<ActionResult> {
  try {
    const schema = z.object({
      user_id: z.string().uuid(),
      new_password: z.string().min(8, 'Password minimal 8 karakter.').max(72),
    })

    const parsed = schema.safeParse({
      user_id: formData.get('user_id'),
      new_password: formData.get('new_password'),
    })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }

    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    // Verify target is not admin
    const { data: targetProfile } = await supabase
      .from('profiles').select('role').eq('id', parsed.data.user_id).single()
    if (!targetProfile) return { success: false, error: 'Pengguna tidak ditemukan.' }
    if (targetProfile.role === 'ADMIN') {
      return { success: false, error: 'Password admin tidak dapat direset melalui antarmuka ini.' }
    }

    // Use admin client to update auth password
    const adminClient = createSupabaseAdmin()
    const { error: authError } = await adminClient.auth.admin.updateUserById(parsed.data.user_id, {
      password: parsed.data.new_password,
    })
    if (authError) return { success: false, error: 'Gagal mereset password di sistem autentikasi.' }

    // Set must_change_password flag
    const { error: profileError } = await supabase
      .from('profiles').update({ must_change_password: true }).eq('id', parsed.data.user_id)
    if (profileError) return { success: false, error: 'Password direset tapi gagal menandai harus ganti.' }

    revalidatePath('/admin/users')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan server.' }
  }
}

/**
 * Create a new employee account (admin only)
 * Cannot create admin accounts
 */
export async function createEmployee(formData: FormData): Promise<ActionResult> {
  try {
    const schema = z.object({
      username: z.string().min(3).max(50).regex(/^[a-z0-9._-]+$/, 'Username hanya boleh huruf kecil, angka, titik, underscore, atau dash.').trim(),
      full_name: z.string().min(1, 'Nama lengkap wajib diisi.').max(200).trim(),
      password: z.string().min(8, 'Password minimal 8 karakter.').max(72),
    })

    const parsed = schema.safeParse({
      username: formData.get('username'),
      full_name: formData.get('full_name'),
      password: formData.get('password'),
    })
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Input tidak valid.' }

    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    // Check username uniqueness
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('username_normalized', parsed.data.username.toLowerCase())
    if (count && count > 0) return { success: false, error: 'Username sudah digunakan.' }

    // Create auth user using admin client
    const adminClient = createSupabaseAdmin()
    const email = `${parsed.data.username}@inventarisbarang.local`
    const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
      email,
      password: parsed.data.password,
      email_confirm: true, // Skip email verification
    })
    if (authError || !authUser.user) {
      return { success: false, error: 'Gagal membuat akun autentikasi.' }
    }

    // Create profile
    const { error: profileError } = await supabase.from('profiles').insert({
      id: authUser.user.id,
      username: parsed.data.username,
      username_normalized: parsed.data.username.toLowerCase(),
      full_name: parsed.data.full_name,
      role: 'EMPLOYEE',
      is_active: true,
      must_change_password: true,
    })

    if (profileError) {
      // Rollback auth user
      await adminClient.auth.admin.deleteUser(authUser.user.id)
      return { success: false, error: 'Gagal membuat profil pengguna.' }
    }

    revalidatePath('/admin/users')
    return { success: true }
  } catch {
    return { success: false, error: 'Terjadi kesalahan server.' }
  }
}
