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
  })

  it('returns error for password shorter than 10 chars', () => {
    expect(validatePassword('short')).not.toBeNull()
    expect(validatePassword('123456789')).not.toBeNull() // 9 chars
  })

  it('returns null for exactly 10 chars', () => {
    expect(validatePassword('1234567890')).toBeNull()
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
