/**
 * Login API Route Handler
 *
 * SECURITY:
 * - Receives username + password from client
 * - Looks up internal email mapping in private.auth_login_identifiers (server-only)
 * - Never returns internal email to client
 * - Generic error messages regardless of failure reason
 * - Rate limiting handled at Next.js/Supabase level
 * - CSRF: protected by same-origin + SameSite cookie policy
 *
 * NOTE: Supabase GoTrue handles the actual password verification.
 * This route acts as a BFF (Backend-for-Frontend) to translate
 * username → internal email for Supabase Auth.
 *
 * TODO(security): Add explicit rate limiting middleware for this endpoint
 * (e.g., using Upstash Redis if available, or Supabase's built-in auth rate limiting)
 */
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import type { Database } from '@/types/database'

const loginSchema = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-z0-9._-]+$/),
  password: z.string().min(10).max(128),
})

// Generic error response — never reveal whether username exists or account is inactive
const GENERIC_AUTH_ERROR = {
  error: 'Username atau kata sandi tidak valid.',
}

export async function POST(request: NextRequest) {
  try {
    const body: unknown = await request.json()
    const parsed = loginSchema.safeParse(body)

    if (!parsed.success) {
      // Return generic error — don't reveal validation details
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    const { username, password } = parsed.data
    const usernameNormalized = username.toLowerCase().trim()

    // Step 1: Look up internal email from private table (server-side only)
    // This lookup uses service role key to access private schema
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      console.error('SUPABASE_SERVICE_ROLE_KEY is not configured')
      return NextResponse.json({ error: 'Konfigurasi server tidak lengkap.' }, { status: 500 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      serviceRoleKey,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // SECURITY: Query private schema — not accessible to client-side Supabase
    const { data: loginIdentifier, error: lookupError } = await adminClient
      .schema('private')
      .from('auth_login_identifiers')
      .select('auth_user_id')
      .eq('username_normalized', usernameNormalized)
      .single()

    if (lookupError || !loginIdentifier) {
      // Return generic error — don't reveal username doesn't exist
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    // Step 2: Get internal email from auth.users using admin client
    const { data: authUser, error: userError } = await adminClient.auth.admin.getUserById(
      loginIdentifier.auth_user_id,
    )

    if (userError || !authUser.user?.email) {
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    // Step 3: Authenticate using internal email (never sent to client)
    // Create a fresh client to perform the actual sign-in
    const supabase = await createSupabaseServerClient()

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: authUser.user.email,
      password,
    })

    if (signInError || !signInData.user) {
      // Generic error — don't reveal whether it was username or password
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    // Step 4: Verify profile is active (defense in depth)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role,is_active,must_change_password')
      .eq('id', signInData.user.id)
      .single()

    if (profileError || !profile) {
      // Sign out immediately — no valid profile
      await supabase.auth.signOut()
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    if (!profile.is_active) {
      // Sign out immediately — account deactivated
      await supabase.auth.signOut()
      return NextResponse.json(GENERIC_AUTH_ERROR, { status: 401 })
    }

    // SECURITY: Never log password, token, or internal email
    // Success — return only safe non-sensitive data
    return NextResponse.json({
      role: profile.role,
      mustChangePassword: profile.must_change_password,
    })
  } catch {
    // Do not expose internal error details
    return NextResponse.json({ error: 'Terjadi kesalahan pada server.' }, { status: 500 })
  }
}

// Only allow POST
export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
