'use client'

/**
 * Supabase browser client for client components.
 * Uses @supabase/ssr for proper cookie-based session management.
 *
 * SECURITY:
 * - Only uses anon key (safe to expose)
 * - Session is managed via HttpOnly cookies — no localStorage fallback
 * - Service role key is NEVER imported here
 */
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from '@/types/database'

let client: ReturnType<typeof createBrowserClient<Database>> | undefined

/**
 * Get or create the singleton browser Supabase client.
 * Singleton pattern prevents multiple GoTrue clients from conflicting.
 */
export function createSupabaseBrowserClient() {
  if (client) return client

  client = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
  return client
}
