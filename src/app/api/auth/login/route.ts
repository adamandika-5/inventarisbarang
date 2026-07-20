import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeUsername } from '@/lib/validation/auth'

const loginSchema = z.object({
  username: z.preprocess(
    (value) =>
      typeof value === 'string' ? normalizeUsername(value) : value,
    z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9._-]+$/),
  ),
  password: z.string().min(10).max(128),
})

const GENERIC_AUTH_ERROR = {
  error: 'Username atau kata sandi tidak valid. Silakan coba lagi.',
}

const SERVER_ERROR = {
  error: 'Terjadi kesalahan pada server.',
}

type LoginIdentifierRow = {
  auth_user_id: string
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    // Username sudah dinormalisasi oleh loginSchema.
    // Password tidak diubah kapitalisasinya.
    const usernameNormalized = parsed.data.username
    const password = parsed.data.password

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('LOGIN_CONFIG_MISSING')
      return NextResponse.json(SERVER_ERROR, { status: 500 })
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    /*
     * Jangan mengakses schema private melalui:
     * adminClient.schema('private')
     *
     * Gunakan RPC SECURITY DEFINER yang sudah dibuat pada migration 004.
     */
    const { data: lookupData, error: lookupError } =
      await adminClient.rpc('lookup_login_identifier', {
        p_username_normalized: usernameNormalized,
      })

    if (lookupError) {
      console.error('LOGIN_LOOKUP_FAILED', {
        code: lookupError.code,
      })

      return NextResponse.json(SERVER_ERROR, { status: 500 })
    }

    const loginIdentifier = (
      lookupData as LoginIdentifierRow[] | null
    )?.[0]

    if (!loginIdentifier?.auth_user_id) {
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    const { data: authUser, error: userError } =
      await adminClient.auth.admin.getUserById(
        loginIdentifier.auth_user_id,
      )

    if (userError || !authUser.user?.email) {
      if (userError) {
        console.error('LOGIN_AUTH_USER_LOOKUP_FAILED', {
          status: userError.status,
        })
      }

      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    const supabase = await createSupabaseServerClient()

    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: authUser.user.email,
        password,
      })

    if (signInError || !signInData.user) {
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_active,must_change_password')
      .eq('id', signInData.user.id)
      .single()

    if (profileError || !profile || !profile.is_active) {
      if (profileError) {
        console.error('LOGIN_PROFILE_LOOKUP_FAILED', {
          code: profileError.code,
        })
      }

      await supabase.auth.signOut()

      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    return NextResponse.json({
      role: profile.role,
      mustChangePassword: profile.must_change_password,
    })
  } catch (error) {
    console.error(
      'LOGIN_UNEXPECTED_ERROR',
      error instanceof Error ? error.name : 'UnknownError',
    )

    return NextResponse.json(SERVER_ERROR, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed.' },
    {
      status: 405,
      headers: {
        Allow: 'POST',
      },
    },
  )
}