#!/usr/bin/env tsx
/**
 * Admin Bootstrap Script
 *
 * Creates the first admin user or additional admin users.
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts
 *   or with env vars:
 *   ADMIN_USERNAME=admin ADMIN_FULLNAME="Admin Utama" ADMIN_PASSWORD=securepass tsx scripts/create-admin.ts
 *
 * SECURITY:
 *   - Reads credentials from environment variables or prompts securely
 *   - Never prints password or service-role key to console/logs
 *   - Rolls back on partial failure
 *   - Creates auth user, private login mapping, and profile atomically
 */

import * as readline from 'readline/promises'
import { createClient } from '@supabase/supabase-js'

// ============================================================
// SECURITY: Validate required env vars before anything else
// ============================================================

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    'ERROR: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.',
  )
  console.error('Copy .env.example to .env.local and fill in the values.')
  process.exit(1)
}

// ============================================================
// Input helpers
// ============================================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

async function prompt(question: string): Promise<string> {
  const answer = await rl.question(question)
  return answer.trim()
}

// Secure password prompt (input not displayed)
async function promptPassword(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin
    const stdout = process.stdout

    stdout.write(question)
    stdin.setRawMode?.(true)
    stdin.resume()
    stdin.setEncoding('utf8')

    let password = ''
    stdin.on('data', (char: string) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode?.(false)
        stdin.pause()
        stdout.write('\n')
        resolve(password)
      } else if (char === '\u007F' || char === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1)
          stdout.write('\b \b')
        }
      } else {
        password += char
        stdout.write('*')
      }
    })
  })
}

// ============================================================
// Validation
// ============================================================

function validateUsername(username: string): string | null {
  if (username.length < 3 || username.length > 32) {
    return 'Username must be 3–32 characters.'
  }
  if (!/^[a-z0-9._-]+$/.test(username)) {
    return 'Username must contain only lowercase letters, numbers, dots, underscores, or hyphens.'
  }
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < 10) {
    return 'Password must be at least 10 characters.'
  }
  if (password.length > 128) {
    return 'Password must not exceed 128 characters.'
  }
  return null
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('=== InventarisBarang — Create Admin ===\n')

  // Get inputs
  let username =
    process.env['ADMIN_USERNAME'] || (await prompt('Admin username (3-32 chars, lowercase): '))
  username = username.toLowerCase()

  const fullName = process.env['ADMIN_FULLNAME'] || (await prompt('Full name: '))

  // Validate inputs
  const usernameError = validateUsername(username)
  if (usernameError) {
    console.error(`ERROR: ${usernameError}`)
    rl.close()
    process.exit(1)
  }

  if (!fullName || fullName.trim().length === 0) {
    console.error('ERROR: Full name is required.')
    rl.close()
    process.exit(1)
  }

  // Get password securely
  let password: string
  if (process.env['ADMIN_PASSWORD']) {
    password = process.env['ADMIN_PASSWORD']
    console.log('(Using ADMIN_PASSWORD from environment)')
  } else {
    password = await promptPassword('Password (min 10 chars): ')
    const confirmPassword = await promptPassword('Confirm password: ')
    if (password !== confirmPassword) {
      console.error('ERROR: Passwords do not match.')
      rl.close()
      process.exit(1)
    }
  }

  rl.close()

  const passwordError = validatePassword(password)
  if (passwordError) {
    console.error(`ERROR: ${passwordError}`)
    process.exit(1)
  }

  // Create admin client
  const adminClient = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // Internal email — never shown to users
  const internalEmail = `admin_${username}@internal.inventarisbarang.local`

  console.log(`\nCreating admin account for: ${username}`)

  // ============================================================
  // Step 1: Create auth user
  // ============================================================
  let authUserId: string | null = null

  console.log('  Step 1: Creating auth user...')
  const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
    email: internalEmail,
    password,
    email_confirm: true, // auto-confirm — no email sent
    user_metadata: { role: 'ADMIN', full_name: fullName },
  })

  if (createError || !newUser.user) {
    console.error('ERROR: Failed to create auth user:', createError?.message)
    process.exit(1)
  }

  authUserId = newUser.user.id
  console.log('  ✓ Auth user created')

  // ============================================================
  // Step 2: Create private login mapping
  // ============================================================
  try {
    console.log('  Step 2: Creating login mapping...')

    // Use raw SQL via RPC or direct insert
    // NOTE: private schema is not accessible via regular client
    // Using service role to bypass RLS for this admin operation
    const { error: mappingError } = await adminClient.rpc('create_admin_login_mapping', {
      p_username_normalized: username,
      p_auth_user_id: authUserId,
    })

    if (mappingError) {
      // Fallback: try direct insert via raw query
      // (requires explicit grant for service role on private schema)
      throw new Error(mappingError.message)
    }

    console.log('  ✓ Login mapping created')
  } catch (error) {
    // Rollback: delete the auth user
    console.error('ERROR: Failed to create login mapping. Rolling back...')
    await adminClient.auth.admin.deleteUser(authUserId!)
    console.error('  ✓ Rolled back auth user')
    console.error('ERROR details:', error instanceof Error ? error.message : error)
    console.error('\nNOTE: Ensure migration 004_admin_bootstrap_function.sql has been run.')
    process.exit(1)
  }

  // ============================================================
  // Step 3: Create profile
  // ============================================================
  try {
    console.log('  Step 3: Creating profile...')
    const { error: profileError } = await adminClient.from('profiles').insert({
      id: authUserId,
      username: username,
      username_normalized: username,
      full_name: fullName.trim(),
      role: 'ADMIN',
      is_active: true,
      must_change_password: false,
    })

    if (profileError) {
      throw new Error(profileError.message)
    }

    console.log('  ✓ Profile created')
  } catch (error) {
    // Rollback
    console.error('ERROR: Failed to create profile. Rolling back...')
    await adminClient.auth.admin.deleteUser(authUserId!)
    console.error('  ✓ Rolled back auth user')
    console.error('ERROR details:', error instanceof Error ? error.message : error)
    process.exit(1)
  }

  // Success
  console.log('\n✅ Admin account created successfully!')
  console.log(`   Username: ${username}`)
  console.log(`   Full name: ${fullName}`)
  console.log(`   Role: ADMIN`)
  console.log('\n⚠️  Keep credentials secure. Do not store password in logs or version control.')
  // SECURITY: Never print password to console
}

main().catch((error) => {
  console.error('Unexpected error:', error instanceof Error ? error.message : error)
  process.exit(1)
})
