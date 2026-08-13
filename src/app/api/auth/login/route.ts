import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { createLoginRateLimitKeys, getClientAddress } from '@/lib/security/login-rate-limit'
import { createSupabaseAdmin, createSupabaseServerClient } from '@/lib/supabase/server'
import { normalizeUsername } from '@/lib/validation/auth'

const loginSchema = z.object({
  username: z.preprocess(
    (value) => (typeof value === 'string' ? normalizeUsername(value) : value),
    z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-z0-9._-]+$/),
  ),
  password: z.string().min(1, 'Kata sandi wajib diisi.').max(128),
})

const GENERIC_AUTH_ERROR = {
  error: 'Username atau kata sandi tidak valid. Silakan coba lagi.',
}

const RATE_LIMIT_ERROR = {
  error: 'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
}

const SERVER_ERROR = {
  error: 'Terjadi kesalahan pada server.',
}

const DUMMY_AUTH_USER_ID = '00000000-0000-0000-0000-000000000000'
const DUMMY_AUTH_EMAIL = 'invalid-login@inventarisbarang.invalid'

type LoginIdentifierRow = {
  auth_user_id: string
}

type RateLimitDecisionRow = {
  allowed: boolean
  retry_after_seconds: number
}

function jsonNoStore(
  body: Record<string, unknown>,
  status: number,
  additionalHeaders: Record<string, string> = {},
) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      ...additionalHeaders,
    },
  })
}

function usernameForRateLimit(body: unknown): string {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return ''

  const username = (body as Record<string, unknown>).username
  return typeof username === 'string' ? username.slice(0, 256) : ''
}

function safeRetryAfter(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.ceil(value) : 15 * 60
}

export async function POST(request: NextRequest) {
  try {
    let body: unknown = {}

    try {
      body = await request.json()
    } catch {
      // Malformed JSON still consumes an opaque invalid-account bucket below.
    }

    const parsed = loginSchema.safeParse(body)
    const rateLimitUsername = parsed.success ? parsed.data.username : usernameForRateLimit(body)

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const rateLimitSecret = process.env.LOGIN_RATE_LIMIT_SECRET

    if (!supabaseUrl || !anonKey || !serviceRoleKey || !rateLimitSecret) {
      console.error('LOGIN_CONFIG_MISSING')
      return jsonNoStore(SERVER_ERROR, 500)
    }

    const rateLimitKeys = createLoginRateLimitKeys(
      rateLimitUsername,
      getClientAddress(request.headers),
      rateLimitSecret,
    )
    const adminClient = createSupabaseAdmin()

    const { data: rateLimitData, error: rateLimitError } = await adminClient.rpc(
      'consume_login_rate_limit',
      {
        p_account_hash: rateLimitKeys.accountHash,
        p_ip_hash: rateLimitKeys.ipHash,
        p_account_ip_hash: rateLimitKeys.accountIpHash,
      },
    )

    const rateLimitDecision = (rateLimitData as RateLimitDecisionRow[] | null)?.[0]

    if (rateLimitError || !rateLimitDecision) {
      console.error('LOGIN_RATE_LIMIT_FAILED', {
        code: rateLimitError?.code,
      })
      return jsonNoStore(SERVER_ERROR, 500)
    }

    if (!rateLimitDecision.allowed) {
      const retryAfter = safeRetryAfter(rateLimitDecision.retry_after_seconds)

      return jsonNoStore(RATE_LIMIT_ERROR, 429, {
        'Retry-After': String(retryAfter),
      })
    }

    if (!parsed.success) {
      return jsonNoStore(GENERIC_AUTH_ERROR, 401)
    }

    // Username sudah dinormalisasi oleh loginSchema.
    // Password tidak diubah kapitalisasinya.
    const usernameNormalized = parsed.data.username
    const password = parsed.data.password

    /*
     * Jangan mengakses schema private secara langsung. Gunakan RPC
     * SECURITY DEFINER yang hanya dapat dipanggil oleh service_role.
     */
    const { data: lookupData, error: lookupError } = await adminClient.rpc(
      'lookup_login_identifier',
      {
        p_username_normalized: usernameNormalized,
      },
    )

    if (lookupError) {
      console.error('LOGIN_LOOKUP_FAILED', {
        code: lookupError.code,
      })

      return jsonNoStore(SERVER_ERROR, 500)
    }

    const loginIdentifier = (lookupData as LoginIdentifierRow[] | null)?.[0]
    const authUserId = loginIdentifier?.auth_user_id ?? DUMMY_AUTH_USER_ID

    // Continue through the same remote Auth calls for known and unknown
    // usernames to reduce timing differences that could aid enumeration.
    const { data: authUser, error: userError } =
      await adminClient.auth.admin.getUserById(authUserId)

    if (userError && loginIdentifier) {
      console.error('LOGIN_AUTH_USER_LOOKUP_FAILED', {
        status: userError.status,
      })
    }

    const email =
      loginIdentifier && !userError && authUser.user?.email ? authUser.user.email : DUMMY_AUTH_EMAIL
    const supabase = await createSupabaseServerClient()

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!loginIdentifier || userError || !authUser.user?.email || signInError || !signInData.user) {
      if (signInData.user) {
        await supabase.auth.signOut()
      }

      return jsonNoStore(GENERIC_AUTH_ERROR, 401)
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

      return jsonNoStore(GENERIC_AUTH_ERROR, 401)
    }

    const { error: resetError } = await adminClient.rpc('reset_login_rate_limit', {
      p_account_hash: rateLimitKeys.accountHash,
      p_account_ip_hash: rateLimitKeys.accountIpHash,
    })

    if (resetError) {
      // Do not fail a valid login; leaving counters in place is fail-safe.
      console.error('LOGIN_RATE_LIMIT_RESET_FAILED', {
        code: resetError.code,
      })
    }

    return jsonNoStore(
      {
        role: profile.role,
        mustChangePassword: profile.must_change_password,
      },
      200,
    )
  } catch (error) {
    console.error('LOGIN_UNEXPECTED_ERROR', error instanceof Error ? error.name : 'UnknownError')

    return jsonNoStore(SERVER_ERROR, 500)
  }
}

export async function GET() {
  return jsonNoStore({ error: 'Method not allowed.' }, 405, {
    Allow: 'POST',
  })
}
