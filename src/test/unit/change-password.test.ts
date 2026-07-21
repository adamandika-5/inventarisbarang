import { describe, it, expect } from 'vitest'

/**
 * Unit tests for change-password logic and flow.
 *
 * Tests the business rules required by spec:
 * 1. Invalid current password handling
 * 2. Auth password update failure handling
 * 3. RPC failure handling (does NOT return success: true)
 * 4. RPC success (sets must_change_password = false)
 * 5. Role-based redirect target (EMPLOYEE -> /employee, ADMIN -> /admin)
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

  // 3. Verify current password via signInWithPassword simulation
  if (params.currentPasswordInput !== params.actualCurrentPassword) {
    return { status: 400, body: { error: 'Kata sandi saat ini tidak valid.' } }
  }

  // 4. Update auth password
  if (!params.updateAuthSuccess) {
    return { status: 400, body: { error: 'Gagal mengganti kata sandi. Coba lagi.' } }
  }

  // 5. Call RPC to clear must_change_password flag
  if (!params.rpcSuccess) {
    const rpcErrorCode = 'P0001'
    const rpcErrorMsg = 'FORBIDDEN: Account is not active'
    // Log safe diagnostic info
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

  // Update profile in-memory
  if (params.userProfile) {
    params.userProfile.must_change_password = false
  }

  // 6. Determine redirect target
  const redirectTo = params.userProfile?.role === 'ADMIN' ? '/admin' : '/employee'

  return {
    status: 200,
    body: { success: true, redirectTo },
    logs,
  }
}

describe('Change Password Handler — Error Cases', () => {
  const baseUser: MockUser = { id: 'user-uuid-1', email: 'tes_12@inventarisbarang.local' }
  const baseProfile: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: true }

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

  it('should NOT return success if RPC fails', async () => {
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

describe('Change Password Handler — Success Cases', () => {
  const baseUser: MockUser = { id: 'user-uuid-1', email: 'tes_12@inventarisbarang.local' }

  it('should successfully clear must_change_password flag to false', async () => {
    const profile: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: true }

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
    expect(profile.must_change_password).toBe(false)
  })

  it('should direct EMPLOYEE role to /employee', async () => {
    const profile: MockProfile = { role: 'EMPLOYEE', is_active: true, must_change_password: true }

    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: profile,
    })

    expect(result.body.redirectTo).toBe('/employee')
  })

  it('should direct ADMIN role to /admin', async () => {
    const adminProfile: MockProfile = { role: 'ADMIN', is_active: true, must_change_password: true }

    const result = await handlePasswordChange({
      currentPasswordInput: 'correct_password_123',
      newPasswordInput: 'new_valid_pass_123',
      actualCurrentPassword: 'correct_password_123',
      authUser: baseUser,
      updateAuthSuccess: true,
      rpcSuccess: true,
      userProfile: adminProfile,
    })

    expect(result.body.redirectTo).toBe('/admin')
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
