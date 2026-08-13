import { describe, expect, it } from 'vitest'

import {
  createLoginRateLimitKeys,
  getClientAddress,
  loginRateLimitDefaults,
} from '@/lib/security/login-rate-limit'

const SECRET = 'test-only-secret-with-at-least-32-characters'

describe('login rate-limit identity protection', () => {
  it('uses Vercel client headers and ignores malformed addresses', () => {
    expect(
      getClientAddress(
        new Headers({
          'x-real-ip': '203.0.113.8',
          'x-forwarded-for': '198.51.100.2, 192.0.2.4',
        }),
      ),
    ).toBe('203.0.113.8')

    expect(
      getClientAddress(
        new Headers({
          'x-real-ip': 'not-an-address',
          'x-forwarded-for': 'also-invalid, 2001:db8::5',
        }),
      ),
    ).toBe('2001:db8::5')

    expect(getClientAddress(new Headers())).toBe('unknown')
  })

  it('creates stable, scoped HMAC keys without exposing raw identities', () => {
    const first = createLoginRateLimitKeys('  Pegawai.Satu  ', '203.0.113.8', SECRET)
    const repeated = createLoginRateLimitKeys('pegawai.satu', '203.0.113.8', SECRET)

    expect(first).toEqual(repeated)

    for (const value of Object.values(first)) {
      expect(value).toMatch(/^[0-9a-f]{64}$/)
      expect(value).not.toContain('pegawai')
      expect(value).not.toContain('203.0.113.8')
    }

    expect(new Set(Object.values(first)).size).toBe(3)
  })

  it('separates account-wide, network-wide, and combined counters', () => {
    const baseline = createLoginRateLimitKeys('pegawai', '203.0.113.8', SECRET)
    const otherNetwork = createLoginRateLimitKeys('pegawai', '203.0.113.9', SECRET)
    const otherAccount = createLoginRateLimitKeys('pegawai-lain', '203.0.113.8', SECRET)

    expect(otherNetwork.accountHash).toBe(baseline.accountHash)
    expect(otherNetwork.ipHash).not.toBe(baseline.ipHash)
    expect(otherNetwork.accountIpHash).not.toBe(baseline.accountIpHash)

    expect(otherAccount.accountHash).not.toBe(baseline.accountHash)
    expect(otherAccount.ipHash).toBe(baseline.ipHash)
    expect(otherAccount.accountIpHash).not.toBe(baseline.accountIpHash)
  })

  it('rejects weak secrets and preserves the agreed mixed-network policy', () => {
    expect(() => createLoginRateLimitKeys('pegawai', '203.0.113.8', 'too-short')).toThrow(
      /at least 32 characters/,
    )

    expect(loginRateLimitDefaults).toEqual({
      accountIpAttempts: 5,
      accountAttempts: 10,
      ipAttempts: 60,
      windowSeconds: 900,
      blockSeconds: 900,
    })
  })
})
