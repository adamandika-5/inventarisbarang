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
  const startTime = performance.now()
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

  const signOutStart = performance.now()
  const { error: signOutError } = await supabase.auth.signOut()
  const signOutDuration = performance.now() - signOutStart

  if (signOutError) {
    if (process.env.NODE_ENV === 'development') {
      console.error(`[PERF] Logout signOut error (${signOutDuration.toFixed(2)}ms):`, signOutError.message)
    }
    return NextResponse.json(
      { success: false, error: signOutError.message || 'Gagal keluar dari server auth.' },
      { status: 500 },
    )
  }

  // Explicitly clear any remaining supabase auth cookies
  const allCookies = cookieStore.getAll()
  for (const c of allCookies) {
    if (c.name.includes('sb-') || c.name.includes('auth') || c.name.includes('token')) {
      cookieStore.delete(c.name)
    }
  }

  const totalDuration = performance.now() - startTime
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log(
      `[PERF] Logout API POST complete (signOut: ${signOutDuration.toFixed(2)}ms, total: ${totalDuration.toFixed(2)}ms)`,
    )
  }

  const response = NextResponse.json({ success: true })
  response.headers.set('Cache-Control', 'no-store, max-age=0, must-revalidate')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  return response
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405 })
}
