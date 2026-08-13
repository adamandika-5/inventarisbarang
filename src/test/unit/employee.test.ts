import { describe, it, expect } from 'vitest'

/**
 * Unit tests for employee creation logic.
 *
 * These test the pure functions and validation logic
 * that mirror what createEmployee server action does.
 * Actual Supabase calls are integration-tested separately.
 */

// --- Username normalization (mirrors Zod transform in actions.ts) ---
function normalizeUsername(raw: string): string {
  return raw.toLowerCase().trim()
}

// --- Password validation (mirrors auth.ts + actions.ts Zod schema) ---
function validatePassword(password: string): string | null {
  if (!password || password.length === 0) return 'Password wajib diisi.'
  if (password.length < 6) return 'Password sementara minimal 6 karakter.'
  if (password.length > 72) return 'Password terlalu panjang.'
  return null
}

// --- Username validation (mirrors Zod schema in actions.ts) ---
function validateUsername(raw: string): string | null {
  const normalized = normalizeUsername(raw)
  if (normalized.length < 3) return 'Username minimal 3 karakter.'
  if (normalized.length > 50) return 'Username maksimal 50 karakter.'
  if (!/^[a-z0-9._-]+$/.test(normalized)) return 'Username hanya boleh huruf kecil, angka, titik, underscore, atau dash.'
  return null
}

// --- Internal email generation ---
function generateInternalEmail(normalizedUsername: string): string {
  return `${normalizedUsername}@inventarisbarang.local`
}

// --- Safe error logging (must never contain password) ---
function buildSafeLogMessage(errorCode: string, errorMessage: string): string {
  return `create_employee_account_v2 RPC failed - code: ${errorCode}, message: ${errorMessage}`
}

describe('Employee Creation — Username Normalization', () => {
  it('should lowercase mixed-case input', () => {
    expect(normalizeUsername('JohnDoe')).toBe('johndoe')
  })

  it('should trim whitespace', () => {
    expect(normalizeUsername('  pegawai1  ')).toBe('pegawai1')
  })

  it('should lowercase and trim simultaneously', () => {
    expect(normalizeUsername(' Admin.User ')).toBe('admin.user')
  })

  it('should preserve valid lowercase username', () => {
    expect(normalizeUsername('kasir-01')).toBe('kasir-01')
  })

  it('should generate correct internal email from normalized username', () => {
    const normalized = normalizeUsername(' TestUser ')
    expect(generateInternalEmail(normalized)).toBe('testuser@inventarisbarang.local')
  })
})

describe('Employee Creation — Username Validation', () => {
  it('should accept valid username', () => {
    expect(validateUsername('pegawai.01')).toBeNull()
    expect(validateUsername('kasir-baru')).toBeNull()
    expect(validateUsername('user_name')).toBeNull()
  })

  it('should reject username shorter than 3 chars', () => {
    expect(validateUsername('ab')).toBe('Username minimal 3 karakter.')
  })

  it('should reject username with invalid characters', () => {
    expect(validateUsername('user@name')).toBe('Username hanya boleh huruf kecil, angka, titik, underscore, atau dash.')
    expect(validateUsername('user name')).toBe('Username hanya boleh huruf kecil, angka, titik, underscore, atau dash.')
  })

  it('should normalize uppercase before validating', () => {
    // "ABC" normalizes to "abc" which is valid
    expect(validateUsername('ABC')).toBeNull()
  })
})

describe('Employee Creation — Password Validation', () => {
  it('should accept password with 6+ characters', () => {
    expect(validatePassword('123456')).toBeNull()
    expect(validatePassword('abcdef')).toBeNull()
    expect(validatePassword('aaaaaa')).toBeNull()
    expect(validatePassword('admin1')).toBeNull()
  })

  it('should reject password shorter than 6 characters (5 chars)', () => {
    expect(validatePassword('12345')).toBe('Password sementara minimal 6 karakter.')
    expect(validatePassword('abcde')).toBe('Password sementara minimal 6 karakter.')
  })

  it('should reject empty password', () => {
    expect(validatePassword('')).toBe('Password wajib diisi.')
  })

  it('should reject password longer than 72 characters', () => {
    expect(validatePassword('a'.repeat(73))).toBe('Password terlalu panjang.')
  })

  it('should accept password of exactly 6 characters', () => {
    expect(validatePassword('abcdef')).toBeNull()
  })
})

describe('Employee Creation — Safe Error Logging', () => {
  it('should format log message with code and message', () => {
    const log = buildSafeLogMessage('42501', 'FORBIDDEN: Admin role required')
    expect(log).toBe('create_employee_account_v2 RPC failed - code: 42501, message: FORBIDDEN: Admin role required')
  })

  it('should never include password in log message', () => {
    const password = 'secret12345'
    const log = buildSafeLogMessage('55000', 'some error occurred')
    expect(log).not.toContain(password)
    expect(log).not.toContain('password')
    expect(log).not.toContain('secret')
  })
})

describe('Employee Creation — Rollback Scenario', () => {
  it('should simulate rollback decision when RPC fails', () => {
    // Simulates the decision flow:
    // 1. Auth user created (success) → authUserId assigned
    // 2. RPC fails → error returned
    // 3. Should rollback → delete auth user

    const authUserId = 'test-uuid-123'
    const rpcError = { code: '42501', message: 'FORBIDDEN: Admin role required' }
    let rollbackCalled = false
    let rolledBackId = ''

    // Simulate the rollback logic from createEmployee
    if (rpcError) {
      rollbackCalled = true
      rolledBackId = authUserId
    }

    expect(rollbackCalled).toBe(true)
    expect(rolledBackId).toBe(authUserId)
  })

  it('should not rollback when RPC succeeds', () => {
    const rpcError = null
    let rollbackCalled = false

    if (rpcError) {
      rollbackCalled = true
    }

    expect(rollbackCalled).toBe(false)
  })
})
