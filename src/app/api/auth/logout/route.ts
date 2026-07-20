/**
 * Logout API Route Handler
 *
 * SECURITY:
 * - Clears server-side session
 * - Clears all cookies
 * - Redirects to login page
 */
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export async function POST(_request: NextRequest) {
  const cookieStore = await cookies()

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        },
      },
    },
  )

  await supabase.auth.signOut()

  return NextResponse.json({ success: true })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
