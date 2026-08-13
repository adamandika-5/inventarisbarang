import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UsersClient from '@/app/admin/users/users-client'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  resetUserPassword: vi.fn(),
  toggleUserActive: vi.fn(),
  searchParams: new URLSearchParams('search=lama&page=1'),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  usePathname: () => '/admin/users',
  useSearchParams: () => mocks.searchParams,
}))

vi.mock('@/app/admin/users/actions', () => ({
  resetUserPassword: mocks.resetUserPassword,
  toggleUserActive: mocks.toggleUserActive,
}))

const employee = {
  id: '10000000-0000-4000-8000-000000000001',
  username: 'pegawai1',
  full_name: 'Pegawai Satu',
  role: 'EMPLOYEE',
  is_active: true,
  must_change_password: false,
  created_at: '2026-08-13T00:00:00.000Z',
  last_sign_in_at: null,
}

function renderUsers(page = 1, totalCount = 50) {
  return render(
    <UsersClient
      initialUsers={[employee]}
      totalCount={totalCount}
      page={page}
      pageSize={25}
      search="lama"
    />,
  )
}

describe('UsersClient pagination and reset-password dialog', () => {
  beforeEach(() => {
    mocks.push.mockReset()
    mocks.refresh.mockReset()
    mocks.resetUserPassword.mockReset()
    mocks.toggleUserActive.mockReset()
    mocks.searchParams = new URLSearchParams('search=lama&page=1')
  })

  it('keeps the requested next page instead of overwriting it with page 1', async () => {
    const user = userEvent.setup()
    renderUsers()

    await user.click(screen.getByRole('button', { name: /Berikutnya/i }))

    expect(mocks.push).toHaveBeenCalledWith('/admin/users?search=lama&page=2')
  })

  it('resets to page 1 only when a new search is submitted', async () => {
    const user = userEvent.setup()
    mocks.searchParams = new URLSearchParams('search=lama&page=4')
    renderUsers(4, 125)

    const searchInput = screen.getByRole('searchbox')
    await user.clear(searchInput)
    await user.type(searchInput, 'pegawai baru{Enter}')

    expect(mocks.push).toHaveBeenCalledWith('/admin/users?search=pegawai+baru&page=1')
  })

  it('resets a password through an accessible dialog without using prompt', async () => {
    const user = userEvent.setup()
    const promptSpy = vi.spyOn(window, 'prompt')
    mocks.resetUserPassword.mockResolvedValue({ success: true })
    renderUsers()

    await user.click(screen.getByRole('button', { name: 'Reset Password' }))

    const dialog = screen.getByRole('dialog', { name: 'Reset Password Pegawai' })
    const passwordInput = within(dialog).getByLabelText(/Password Sementara/i)
    await user.type(passwordInput, 'rahasia123')
    await user.click(within(dialog).getByRole('button', { name: 'Reset Password' }))

    await waitFor(() => expect(mocks.resetUserPassword).toHaveBeenCalledTimes(1))
    const submitted = mocks.resetUserPassword.mock.calls[0]?.[0] as FormData
    expect(submitted.get('user_id')).toBe(employee.id)
    expect(submitted.get('new_password')).toBe('rahasia123')
    expect(promptSpy).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('alert')).toHaveTextContent('Password Pegawai Satu berhasil direset')

    promptSpy.mockRestore()
  })
})
