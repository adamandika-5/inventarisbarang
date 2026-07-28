import { describe, it, expect } from 'vitest'
import {
  normalizeUsername,
  validateUsername,
  validatePassword,
} from '@/lib/validation/auth'

describe('normalizeUsername', () => {
  it('converts to lowercase', () => {
    expect(normalizeUsername('JohnDoe')).toBe('johndoe')
  })

  it('trims whitespace', () => {
    expect(normalizeUsername('  alice  ')).toBe('alice')
  })

  it('handles already normalized username', () => {
    expect(normalizeUsername('john.doe')).toBe('john.doe')
  })

  it('does not modify numbers, dots, underscores, hyphens', () => {
    expect(normalizeUsername('user_01.test-2')).toBe('user_01.test-2')
  })
})

describe('validateUsername', () => {
  it('returns null for valid username', () => {
    expect(validateUsername('johndoe')).toBeNull()
    expect(validateUsername('user_01')).toBeNull()
    expect(validateUsername('alice.bob')).toBeNull()
    expect(validateUsername('test-user')).toBeNull()
  })

  it('returns error for empty username', () => {
    expect(validateUsername('')).not.toBeNull()
    expect(validateUsername('   ')).not.toBeNull()
  })

  it('returns error for username too short (< 3 chars)', () => {
    expect(validateUsername('ab')).not.toBeNull()
  })

  it('returns null for exactly 3 chars', () => {
    expect(validateUsername('abc')).toBeNull()
  })

  it('returns error for username too long (> 32 chars)', () => {
    expect(validateUsername('a'.repeat(33))).not.toBeNull()
  })

  it('returns null for exactly 32 chars', () => {
    expect(validateUsername('a'.repeat(32))).toBeNull()
  })

  it('returns error for invalid characters (uppercase in original)', () => {
    // Validator normalizes to lowercase first, then validates
    // So uppercase is allowed (it gets normalized)
    // But special chars like ! are not
    expect(validateUsername('user!')).not.toBeNull()
    expect(validateUsername('user space')).not.toBeNull()
  })

  it('returns error for special characters not allowed', () => {
    expect(validateUsername('user@domain')).not.toBeNull()
    expect(validateUsername('user#1')).not.toBeNull()
  })

  it('allows valid username with uppercase (normalized)', () => {
    // Validator first normalizes, so 'JohnDoe' → 'johndoe' which is valid
    expect(validateUsername('JohnDoe')).toBeNull()
  })
})

describe('validatePassword', () => {
  it('returns null for valid password', () => {
    expect(validatePassword('securepass01')).toBeNull()
    expect(validatePassword('MyP@ssw0rd!')).toBeNull()
  })

  it('returns error for empty password', () => {
    expect(validatePassword('')).not.toBeNull()
    expect(validatePassword('')).toBe('Kata sandi wajib diisi.')
  })

  it('rejects password shorter than 6 chars (5 chars rejected)', () => {
    expect(validatePassword('12345')).toBe('Kata sandi minimal 6 karakter.')
    expect(validatePassword('abcde')).toBe('Kata sandi minimal 6 karakter.')
  })

  it('accepts password of 6 chars or more', () => {
    expect(validatePassword('123456')).toBeNull()
    expect(validatePassword('abcdef')).toBeNull()
    expect(validatePassword('aaaaaa')).toBeNull()
    expect(validatePassword('admin1')).toBeNull()
  })

  it('accepts numeric-only password (e.g. 123456)', () => {
    expect(validatePassword('123456')).toBeNull()
  })

  it('accepts letters-only password (e.g. abcdef, aaaaaa)', () => {
    expect(validatePassword('abcdef')).toBeNull()
    expect(validatePassword('aaaaaa')).toBeNull()
  })

  it('accepts password without symbols (e.g. admin1)', () => {
    expect(validatePassword('admin1')).toBeNull()
  })

  it('returns error for password longer than 128 chars', () => {
    expect(validatePassword('a'.repeat(129))).not.toBeNull()
  })

  it('returns null for exactly 128 chars', () => {
    expect(validatePassword('a'.repeat(128))).toBeNull()
  })

  it('allows all character types', () => {
    expect(validatePassword('!@#$%^&*()_+')).toBeNull()
    expect(validatePassword('αβγδεζηθ12')).toBeNull() // Unicode chars
  })
})

describe('Login Form Password Validation', () => {
  // Login form client-side validation logic: only check non-empty
  function validateLoginPassword(password: string): string | null {
    return !password || password.length === 0 ? 'Kata sandi wajib diisi.' : null
  }

  it('rejects empty password on login', () => {
    expect(validateLoginPassword('')).toBe('Kata sandi wajib diisi.')
  })

  it('accepts any non-empty password regardless of complexity or length', () => {
    expect(validateLoginPassword('1')).toBeNull()
    expect(validateLoginPassword('12345')).toBeNull()
    expect(validateLoginPassword('123456')).toBeNull()
    expect(validateLoginPassword('abcdef')).toBeNull()
    expect(validateLoginPassword('aaaaaa')).toBeNull()
    expect(validateLoginPassword('admin1')).toBeNull()
  })
})
