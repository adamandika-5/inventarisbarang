/**
 * Change Password API Route Handler
 *
 * SECURITY:
 * - Validates current session
 * - Verifies current password using signInWithPassword (re-authentication)
 * - Validates new password strength (min 10 characters)
 * - Updates password in Supabase Auth
 * - Clears must_change_password flag via complete_forced_password_change RPC
 * - Does NOT return success if RPC fails
 * - Returns target redirect route based on user role (/admin or /employee)
 * - Never logs passwords, tokens, or internal emails
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Kata sandi saat ini wajib diisi.'),
  newPassword: z.string().min(10, 'Kata sandi baru minimal 10 karakter.').max(128, 'Kata sandi baru terlalu panjang.'),
})

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = changePasswordSchema.safeParse(body)

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message ?? 'Kata sandi tidak memenuhi persyaratan.'
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

    // 2. Verify current password by attempting to sign in
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPassword,
    })

    if (signInError) {
      return NextResponse.json({ error: 'Kata sandi saat ini tidak valid.' }, { status: 400 })
    }

    // 3. Update password in Supabase Auth
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        { error: 'Gagal mengganti kata sandi. Coba lagi.' },
        { status: 400 },
      )
    }

    // 4. Clear must_change_password flag via SECURITY DEFINER RPC
    const { error: rpcError } = await supabase.rpc('complete_forced_password_change')

    if (rpcError) {
      // Log only error code and message — NEVER log passwords, tokens, or emails
      console.error(`complete_forced_password_change RPC failed - code: ${rpcError.code}, message: ${rpcError.message}`)
      
      // Password was changed in Auth, but clearing profile flag failed.
      // Inform user that new password is active so they use the new password when trying again.
      return NextResponse.json(
        {
          error:
            'Kata sandi baru telah berhasil disimpan, namun pembaruan status profil gagal. Silakan coba lagi dengan kata sandi baru Anda.',
        },
        { status: 500 },
      )
    }

    // 5. Fetch user profile role to determine redirect path
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const redirectTo = profile?.role === 'ADMIN' ? '/admin' : '/employee'

    return NextResponse.json({ success: true, redirectTo })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
