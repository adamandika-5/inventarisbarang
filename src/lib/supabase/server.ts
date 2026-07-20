/**
 * Supabase client for server components, server actions, and API routes.
 * Uses @supabase/ssr for proper cookie-based session management.
 *
 * SECURITY:
 * - Uses HttpOnly cookies managed by Supabase SSR
 * - Service role key is only used in getSupabaseAdmin() and must be validated
 * - Never export getSupabaseAdmin() to client components
 */
import { createServerClient } from '@supabase/ssr'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

/**
 * Create a Supabase client for server use with user session from cookies.
 * Use this in Server Components, Server Actions, and Route Handlers.
 */
export async function createSupabaseServerClient(): Promise<SupabaseClient<Database>> {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: Record<string, unknown> }>) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Can be ignored in Server Components — cookies set in middleware
          }
        },
      },
    },
  ) as unknown as SupabaseClient<Database>
}

/**
 * Create a Supabase admin client using service role key.
 *
 * SECURITY CRITICAL:
 * - Only call this from server-side code
 * - Always validate user session and role BEFORE using this client
 * - This client bypasses RLS — use only for admin operations that require it
 * - Never call this in client components or expose the result to the browser
 */
export function createSupabaseAdmin() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured')
  }

  return createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
