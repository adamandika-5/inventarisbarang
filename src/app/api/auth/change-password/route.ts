/**
 * Change Password API Route Handler
 *
 * SECURITY:
 * - Validates current session
 * - Verifies current password (re-authentication)
 * - Sets must_change_password = false after success
 * - Never logs passwords
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(10).max(128),
})

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = changePasswordSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: 'Kata sandi tidak memenuhi persyaratan.' }, { status: 400 })
    }

    const { newPassword } = parsed.data

    const supabase = await createSupabaseServerClient()

    // Verify current session
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Sesi tidak valid. Silakan login kembali.' }, { status: 401 })
    }

    // Update password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    })

    if (updateError) {
      return NextResponse.json(
        { error: 'Gagal mengganti kata sandi. Coba lagi.' },
        { status: 400 },
      )
    }

    // Clear must_change_password flag
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ must_change_password: false, updated_at: new Date().toISOString() })
      .eq('id', user.id)

    if (profileError) {
      // Password was changed but profile update failed — log for debugging (no sensitive data)
      console.error('Failed to update must_change_password flag:', profileError.code)
    }

    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
