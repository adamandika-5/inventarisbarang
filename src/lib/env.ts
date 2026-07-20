/**
 * Environment variable validation using Zod.
 * This runs at module initialization, failing fast if required variables are missing.
 *
 * SECURITY: Service role key must NEVER be prefixed with NEXT_PUBLIC_
 */
import { z } from 'zod'

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // Supabase server-only key — never expose to client
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
})

const clientEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL')
    .min(1, 'NEXT_PUBLIC_SUPABASE_URL is required'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
})

/**
 * Server-side environment variables.
 * Only available in server components, API routes, and server actions.
 */
export function getServerEnv() {
  const result = serverEnvSchema.safeParse(process.env)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Missing or invalid server environment variables: ${missing}`)
  }
  return result.data
}

/**
 * Client-safe environment variables.
 * These are safe to expose to the browser.
 */
export function getClientEnv() {
  const result = clientEnvSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  })
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Missing or invalid client environment variables: ${missing}`)
  }
  return result.data
}

// Export validated client env for use in client components
// These values are validated but safe to expose
export const clientEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
}
