import { describe, it, expect } from 'vitest'

/**
 * Unit tests for change-password logic and flow.
 *
 * Tests the business rules required by spec:
 * 1. Active user with must_change_password=false can open and change password voluntarily
 * 2. User with must_change_password=true follows forced change flow
 * 3. Inactive accounts (is_active=false) are rejected
 * 4. Incorrect current password is rejected
 * 5. Role-based redirect target (Voluntary ADMIN -> /admin/account, Forced ADMIN -> /admin, EMPLOYEE -> /employee)
 * 6. Safe logging (no passwords/tokens in logs)
 */

interface MockUser {
  id: string
  email: string
}

interface MockProfile {
  role: 'ADMIN' | 'EMPLOYEE'
  is_active: boolean
  must_change_password: boolean
}

// Simulated Change Password Business Handler for testing business rules
async function handlePasswordChange(params: {
  currentPasswordInput: string
  newPasswordInput: string
  actualCurrentPassword: string
  authUser: MockUser | null
  updateAuthSuccess: boolean
  rpcSuccess: boolean
  userProfile: MockProfile | null
}) {
  const logs: string[] = []

  // 1. Validation
  if (!params.currentPasswordInput || params.currentPasswordInput.length === 0) {
    return { status: 400, body: { error: 'Kata sandi saat ini wajib diisi.' } }
  }

  if (!params.newPasswordInput || params.newPasswordInput.length < 10) {
    return { status: 400, body: { error: 'Kata sandi baru minimal 10 karakter.' } }
  }

  // 2. Auth check
  if (!params.authUser) {
    return { status: 401, body: { error: 'Sesi tidak valid. Silakan login kembali.' } }
  }

  // 3. Profile & Active check
  if (!params.userProfile || !params.userProfile.is_active) {
    return { status: 403, body: { error: 'Akun Anda telah dinonaktifkan atau tidak ditemukan.' } }
  }

  // 4. Verify current password via signInWithPassword simulation
  if (params.currentPasswordInput !== params.actualCurrentPassword) {
    return { status: 400, body: { error: 'Kata sandi saat ini tidak valid.' } }
  }

  // 5. Update auth password
  if (!params.updateAuthSuccess) {
    return { status: 400, body: { error: 'Gagal mengganti kata sandi. Coba lagi.' } }
  }

  // 6. Call RPC to clear must_change_password flag ONLY if previously forced (must_change_password === true)
  const wasForced = params.userProfile.must_change_password
  if (wasForced) {
    if (!params.rpcSuccess) {
      const rpcErrorCode = 'P0001'
      const rpcErrorMsg = 'FORBIDDEN: Account is not active'
      logs.push(`complete_forced_password_change RPC failed - code: ${rpcErrorCode}, message: ${rpcErrorMsg}`)

      return {
        status: 500,
        body: {
          error:
            'Kata sandi baru telah berhasil disimpan, namun pembaruan status profil gagal. Silakan coba lagi dengan kata sandi baru Anda.',
        },
        logs,
      }
    }
    params.userProfile.must_change_password = false
  }

  // 7. Determine redirect target based on mode and role
  let redirectTo = '/employee'
  if (params.userProfile.role === 'ADMIN') {
    redirectTo = wasForced ? '/admin' : '/admin/account'
  }

  return {
    status: 200,
    body: { success: true, redirectTo },
    logs,
  }
}

describe('Change Password Handler — Error Cases', () => {
  const baseUser: MockUser = { id: 'user-uuid-1', email: 'tes_12@inventarisbarang.local' }
  const baseProfile: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: true }

  it('should reject unauthenticated requests', async () => {
    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: null,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: baseProfile,
    })

    expect(result.status).toBe(401)
    expect(result.body.error).toBe('Sesi tidak valid. Silakan login kembali.')
  })

  it('should reject inactive account (is_active = false)', async () => {
    const inactiveProfile: MockProfile = { role: 'EMPLOYEE', is_active: false, must_change_password: false }

    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: inactiveProfile,
    })

    expect(result.status).toBe(403)
    expect(result.body.error).toBe('Akun Anda telah dinonaktifkan atau tidak ditemukan.')
  })

  it('should reject invalid current password', async () => {
    const result = await handlePasswordChange({
      currentPasswordInput: 'wrong_password',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: { ...baseProfile },
    })

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('Kata sandi saat ini tidak valid.')
  })

  it('should reject when auth password update fails', async () => {
    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: false,
      rpcSuccess: true,
      userProfile: { ...baseProfile },
    })

    expect(result.status).toBe(400)
    expect(result.body.error).toBe('Gagal mengganti kata sandi. Coba lagi.')
  })

  it('should NOT return success if RPC fails during forced change', async () => {
    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: false, // RPC fails!
      userProfile: { ...baseProfile },
    })

    expect(result.status).toBe(500)
    expect('success' in result.body).toBe(false)
    expect(result.body.error).toContain('Kata sandi baru telah berhasil disimpan')
  })
})

describe('Change Password Handler — Forced vs Voluntary Modes & Redirects', () => {
  const baseUser: MockUser = { id: 'user-uuid-1', email: 'admin@inventarisbarang.local' }

  it('should allow active user with must_change_password=false to change password voluntarily and redirect ADMIN to /admin/account', async () => {
    const profile: MockProfile = { role: 'ADMIN', is_active: true, must_change_password: false }

    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: profile,
    })

    expect(result.status).toBe(200)
    expect(result.body.success).toBe(true)
    expect(result.body.redirectTo).toBe('/admin/account')
    expect(profile.must_change_password).toBe(false) // Flags remains false
  })

  it('should follow forced change flow for must_change_password=true and redirect ADMIN to /admin', async () => {
    const profile: MockProfile = { role: 'ADMIN', is_active: true, must_change_password: true }

    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: profile,
    })

    expect(result.status).toBe(200)
    expect(result.body.success).toBe(true)
    expect(result.body.redirectTo).toBe('/admin')
    expect(profile.must_change_password).toBe(false) // RPC cleared flag to false
  })

  it('should redirect EMPLOYEE role to /employee in both forced and voluntary modes', async () => {
    const forcedEmployee: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: true }
    const voluntaryEmployee: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: false }

    const forcedResult = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: forcedEmployee,
    })
    expect(forcedResult.body.redirectTo).toBe('/employee')

    const voluntaryResult = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: voluntaryEmployee,
    })
    expect(voluntaryResult.body.redirectTo).toBe('/employee')
  })
})

describe('Change Password Handler — Security & Safe Logging', () => {
  const baseUser: MockUser = { id: 'user-uuid-1', email: 'tes_12@inventarisbarang.local' }
  const currentPass = 'super_secret_current_pass_99'
  const newPass = 'super_secret_new_pass_99'

  it('should never include passwords, tokens, or internal emails in error logs', async () => {
    const result = await handlePasswordChange({
      currentPasswordInput: currentPass,
      newPasswordInput: newPass,
      actualCurrentPassword: currentPass,
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: false, // Triggers error log
      userProfile: { role: 'EMPLOYEE', is_active: true, must_change_password: true },
    })

    const logOutput = result.logs?.join('\n') ?? ''

    expect(logOutput).not.toContain(currentPass)
    expect(logOutput).not.toContain(newPass)
    expect(logOutput).not.toContain(baseUser.email)
    expect(logOutput).not.toContain('secret')
  })
})
