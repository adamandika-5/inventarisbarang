import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

const migration = readSource('supabase/migrations/015_login_rate_limiting.sql')
const loginRoute = readSource('src/app/api/auth/login/route.ts')
const databaseTypes = readSource('src/types/database.ts')

describe('Tahap 3 — distributed login rate limiting', () => {
  it('stores only opaque 64-character keys in a private table', () => {
    const tableDefinition = migration.match(
      /CREATE TABLE private\.login_rate_limit_buckets[\s\S]*?\);/i,
    )?.[0]

    expect(tableDefinition).toBeDefined()
    expect(tableDefinition).toContain('bucket_key')
    expect(tableDefinition).toMatch(/\^\[0-9a-f\]\{64\}\$/)
    expect(tableDefinition).not.toMatch(/username|ip_address|email/i)
    expect(migration).toContain(
      'ALTER TABLE private.login_rate_limit_buckets ENABLE ROW LEVEL SECURITY;',
    )
  })

  it('fixes all limits in the service-role-only wrapper', () => {
    expect(migration).toMatch(/'ACCOUNT_IP',\s*p_account_ip_hash,\s*5,\s*INTERVAL '15 minutes'/i)
    expect(migration).toMatch(/'ACCOUNT',\s*p_account_hash,\s*10,\s*INTERVAL '15 minutes'/i)
    expect(migration).toMatch(/'IP',\s*p_ip_hash,\s*60,\s*INTERVAL '15 minutes'/i)
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.consume_login_rate_limit\(TEXT, TEXT, TEXT\)[\s\S]*?FROM PUBLIC, anon, authenticated;/i,
    )
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.consume_login_rate_limit\(TEXT, TEXT, TEXT\)[\s\S]*?TO service_role;/i,
    )
  })

  it('serializes concurrent bucket updates and blocks only after the limit', () => {
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock')
    expect(migration).toContain('FOR UPDATE;')
    expect(migration).toMatch(/IF v_next_count > p_limit THEN/i)
  })

  it('consumes a counter before validation/lookup and returns HTTP 429 with Retry-After', () => {
    const consumeIndex = loginRoute.indexOf("'consume_login_rate_limit'")
    const validationReturnIndex = loginRoute.indexOf('if (!parsed.success)')
    const lookupIndex = loginRoute.indexOf("'lookup_login_identifier'")

    expect(consumeIndex).toBeGreaterThan(0)
    expect(validationReturnIndex).toBeGreaterThan(consumeIndex)
    expect(lookupIndex).toBeGreaterThan(validationReturnIndex)
    expect(loginRoute).toContain('jsonNoStore(RATE_LIMIT_ERROR, 429')
    expect(loginRoute).toContain("'Retry-After': String(retryAfter)")
  })

  it('uses dummy Auth calls against username enumeration and resets after success', () => {
    expect(loginRoute).toContain('DUMMY_AUTH_USER_ID')
    expect(loginRoute).toContain('DUMMY_AUTH_EMAIL')
    expect(loginRoute).toMatch(/rpc\(\s*'reset_login_rate_limit'/)
    expect(loginRoute).not.toMatch(/console\.(?:log|error).*username/i)
  })

  it('keeps generated database contracts in sync with both RPCs and the table', () => {
    expect(databaseTypes).toContain('consume_login_rate_limit:')
    expect(databaseTypes).toContain('reset_login_rate_limit:')
    expect(databaseTypes).toContain('login_rate_limit_buckets:')
  })
})
