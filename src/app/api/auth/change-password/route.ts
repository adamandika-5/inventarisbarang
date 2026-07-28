/**
 * Change Password API Route Handler
 *
 * SECURITY:
 * - Validates current session
 * - Verifies user active status and profile role
 * - Verifies current password using signInWithPassword (re-authentication)
 * - Validates new password strength (min 6 characters)
 * - Updates password in Supabase Auth
 * - Calls complete_forced_password_change RPC ONLY if must_change_password was previously true
 * - Returns target redirect route based on mode and user role
 * - Never logs passwords, tokens, or internal emails
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
  newPassword: z
    .string()
    .min(6, 'Kata sandi baru minimal 6 karakter.')
    .max(128, 'Kata sandi baru terlalu panjang.'),
})

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = changePasswordSchema.safeParse(body)

    if (!parsed.success) {
      const firstError =
        parsed.error.issues[0]?.message ?? 'Kata sandi tidak memenuhi persyaratan.'
      return NextResponse.json({ error: firstError }, { status: 400 })
    }

    const { currentPassword, newPassword } = parsed.data

    const supabase = await createSupabaseServerClient()

    // 1. Verify current session
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user || !user.email) {
      return NextResponse.json({ error: 'Sesi tidak valid. Silakan login kembali.' }, { status: 401 })
    }

    // 2. Fetch user profile role, active status, and must_change_password flag
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, is_active, must_change_password')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_active) {
      return NextResponse.json(
        { error: 'Akun Anda telah dinonaktifkan atau tidak ditemukan.' },
        { status: 403 },
      )
    }

    // 3. Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (signInError) {
      return NextResponse.json({ error: 'Kata sandi saat ini tidak valid.' }, { status: 400 })
    }

    // 4. Update password in Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        { error: 'Gagal mengganti kata sandi. Coba lagi.' },
        { status: 400 },
      )
    }

    // 5. Call complete_forced_password_change RPC ONLY if must_change_password was previously true
    const wasForced = profile.must_change_password
    if (wasForced) {
      const { error: rpcError } = await supabase.rpc('complete_forced_password_change')

      if (rpcError) {
        console.error(
          `complete_forced_password_change RPC failed - code: ${rpcError.code}, message: ${rpcError.message}`,
        )
        return NextResponse.json(
          {
            error:
              'Kata sandi baru telah berhasil disimpan, namun pembaruan status profil gagal. Silakan coba lagi dengan kata sandi baru Anda.',
          },
          { status: 500 },
        )
      }
    }

    // 6. Determine target redirect based on mode and role
    // Voluntary change (wasForced === false): ADMIN -> /admin/account, EMPLOYEE -> /employee
    // Forced change (wasForced === true): ADMIN -> /admin, EMPLOYEE -> /employee
    let redirectTo = '/employee'
    if (profile.role === 'ADMIN') {
      redirectTo = wasForced ? '/admin' : '/admin/account'
    }

    return NextResponse.json({ success: true, redirectTo })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
