import { createHmac } from 'node:crypto'
import { isIP } from 'node:net'

const MIN_SECRET_LENGTH = 32
const UNKNOWN_CLIENT_ADDRESS = 'unknown'
const INVALID_ACCOUNT_IDENTITY = '<invalid-username>'

export type LoginRateLimitKeys = {
  accountHash: string
  ipHash: string
  accountIpHash: string
}

function firstValidAddress(value: string | null): string | null {
  if (!value) return null

  for (const candidate of value.split(',')) {
    const address = candidate.trim()

    if (isIP(address) !== 0) {
      return address.toLowerCase()
    }
  }

  return null
}

/**
 * Resolve the client address supplied by Vercel's trusted proxy layer.
 * Invalid values are ignored instead of becoming attacker-controlled keys.
 */
export function getClientAddress(headers: Headers): string {
  return (
    firstValidAddress(headers.get('x-real-ip')) ??
    firstValidAddress(headers.get('x-forwarded-for')) ??
    UNKNOWN_CLIENT_ADDRESS
  )
}

function hashIdentity(secret: string, scope: string, value: string): string {
  return createHmac('sha256', secret).update(scope).update('\0').update(value).digest('hex')
}

/**
 * Build opaque database keys. Raw usernames and addresses never enter the
 * rate-limit table, logs, or RPC parameters.
 */
export function createLoginRateLimitKeys(
  username: string,
  clientAddress: string,
  secret: string,
): LoginRateLimitKeys {
  if (secret.length < MIN_SECRET_LENGTH) {
    throw new Error('LOGIN_RATE_LIMIT_SECRET must contain at least 32 characters')
  }

  const accountIdentity = username.trim().toLowerCase() || INVALID_ACCOUNT_IDENTITY
  const addressIdentity =
    clientAddress === UNKNOWN_CLIENT_ADDRESS || isIP(clientAddress) !== 0
      ? clientAddress.toLowerCase()
      : UNKNOWN_CLIENT_ADDRESS

  return {
    accountHash: hashIdentity(secret, 'account', accountIdentity),
    ipHash: hashIdentity(secret, 'ip', addressIdentity),
    accountIpHash: hashIdentity(secret, 'account-ip', `${accountIdentity}\0${addressIdentity}`),
  }
}

export const loginRateLimitDefaults = Object.freeze({
  accountIpAttempts: 5,
  accountAttempts: 10,
  ipAttempts: 60,
  windowSeconds: 15 * 60,
  blockSeconds: 15 * 60,
})
