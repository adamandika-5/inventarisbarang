import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LoginForm from '@/app/login/login-form'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

describe('LoginForm rate-limit feedback', () => {
  beforeEach(() => {
    mocks.push.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows a dedicated temporary-block message for HTTP 429', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 429 })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username'), 'pegawai1')
    await user.type(screen.getByLabelText('Kata Sandi'), 'salah123')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Terlalu banyak percobaan masuk. Tunggu beberapa menit lalu coba lagi.',
    )
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps authentication failures generic for non-429 responses', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401 })
    vi.stubGlobal('fetch', fetchMock)
    const user = userEvent.setup()

    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username'), 'tidakada')
    await user.type(screen.getByLabelText('Kata Sandi'), 'salah123')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Username atau kata sandi tidak valid. Silakan coba lagi.',
    )
    expect(screen.queryByText(/terdaftar/i)).not.toBeInTheDocument()
  })
})
