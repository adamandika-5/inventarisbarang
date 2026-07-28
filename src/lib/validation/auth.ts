/**
 * Username normalization and validation utilities.
 *
 * SECURITY: Username validation is done both client-side (UX) and server-side (trust boundary).
 */

const USERNAME_MIN_LENGTH = 3
const USERNAME_MAX_LENGTH = 32
const USERNAME_PATTERN = /^[a-z0-9._-]+$/

/**
 * Normalize username to lowercase for consistent storage and comparison.
 * Does NOT change password capitalization.
 */
export function normalizeUsername(username: string): string {
  return username.toLowerCase().trim()
}

/**
 * Validate username format.
 * Returns null if valid, error message if invalid.
 */
export function validateUsername(username: string): string | null {
  if (!username || username.length === 0) {
    return 'Username wajib diisi.'
  }

  const normalized = normalizeUsername(username)

  if (normalized.length < USERNAME_MIN_LENGTH) {
    return `Username minimal ${USERNAME_MIN_LENGTH} karakter.`
  }

  if (normalized.length > USERNAME_MAX_LENGTH) {
    return `Username maksimal ${USERNAME_MAX_LENGTH} karakter.`
  }

  if (!USERNAME_PATTERN.test(normalized)) {
    return 'Username hanya boleh mengandung huruf kecil, angka, titik, garis bawah, atau tanda hubung.'
  }

  return null
}

/**
 * Validate password strength.
 * Minimum 6 characters.
 * Returns null if valid, error message if invalid.
 *
 * TODO(security): Consider integrating leaked password detection (e.g., HaveIBeenPwned API)
 * TODO(security): Consider MFA for admin accounts
 */
export function validatePassword(password: string): string | null {
  if (!password || password.length === 0) {
    return 'Kata sandi wajib diisi.'
  }

  if (password.length < 6) {
    return 'Kata sandi minimal 6 karakter.'
  }

  if (password.length > 128) {
    return 'Kata sandi maksimal 128 karakter.'
  }

  return null
}

/**
 * Validate temporary password (same rules as regular password).
 */
export function validateTemporaryPassword(password: string): string | null {
  return validatePassword(password)
}
