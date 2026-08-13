import fs from 'node:fs'
import path from 'node:path'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import LoginForm from '@/app/login/login-form'
import { PwaStartupScreen } from '@/components/pwa-startup-screen'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}))

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('PWA startup experience', () => {
  let originalOrientationDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    mocks.push.mockReset()
    originalOrientationDescriptor = Object.getOwnPropertyDescriptor(window.screen, 'orientation')
  })

  afterEach(() => {
    if (originalOrientationDescriptor) {
      Object.defineProperty(window.screen, 'orientation', originalOrientationDescriptor)
    } else {
      Reflect.deleteProperty(window.screen, 'orientation')
    }
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses a branded portrait splash without treating a transparent icon as maskable', () => {
    const manifest = JSON.parse(readSource('public/manifest.json')) as {
      background_color: string
      theme_color: string
      orientation: string
      icons: Array<{ purpose: string }>
    }

    expect(manifest.orientation).toBe('portrait-primary')
    expect(manifest.background_color).toBe('#101d31')
    expect(manifest.theme_color).toBe('#101d31')
    expect(manifest.icons.every((icon) => icon.purpose === 'any')).toBe(true)
    const serviceWorker = readSource('public/sw.js')
    const layout = readSource('src/app/layout.tsx')
    const nextConfig = readSource('next.config.ts')

    expect(serviceWorker).toContain('inventarisbarang-shell-v3')
    expect(serviceWorker).not.toMatch(/SHELL_ASSETS\s*=\s*\[[\s\S]*?'\/manifest\.json'/)
    expect(layout).toContain("manifest: '/manifest.json?v=3'")
    expect(nextConfig).toContain("source: '/manifest.json'")
    expect(nextConfig).toContain("source: '/sw.js'")
  })

  it('shows the animated hand-off only in standalone mode and attempts a portrait lock', () => {
    vi.useFakeTimers()
    const lock = vi.fn().mockResolvedValue(undefined)

    vi.stubGlobal(
      'matchMedia',
      vi.fn().mockReturnValue({
        matches: true,
        media: '(display-mode: standalone)',
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    )
    Object.defineProperty(window.screen, 'orientation', {
      configurable: true,
      value: { lock },
    })

    render(<PwaStartupScreen />)

    expect(
      screen.getByRole('status', { name: /menyiapkan aplikasi inventaris barang/i }),
    ).toHaveAttribute('data-phase', 'visible')
    expect(screen.getByText('Menyiapkan Aplikasi')).toBeVisible()
    expect(screen.getByText('Memuat sesi dan data Anda...')).toBeVisible()
    expect(screen.getByRole('status').firstElementChild).toHaveClass('pwa-startup-screen__panel')
    expect(lock).toHaveBeenCalledWith('portrait-primary')

    act(() => vi.advanceTimersByTime(450))
    expect(screen.getByRole('status')).toHaveAttribute('data-phase', 'leaving')

    act(() => vi.advanceTimersByTime(250))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('keeps users informed while login and dashboard navigation are processing', async () => {
    let finishRequest: ((value: unknown) => void) | undefined
    const fetchPromise = new Promise((resolve) => {
      finishRequest = resolve
    })
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(fetchPromise))
    const user = userEvent.setup()

    render(<LoginForm />)

    await user.type(screen.getByLabelText('Username'), 'admin')
    await user.type(screen.getByLabelText('Kata Sandi'), 'rahasia')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))

    expect(screen.getByRole('status', { name: 'Memverifikasi akun Anda...' })).toBeVisible()

    finishRequest?.({
      ok: true,
      status: 200,
      json: async () => ({ role: 'ADMIN', mustChangePassword: false }),
    })

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/admin'))
    expect(screen.getByRole('status', { name: 'Menyiapkan halaman akun Anda...' })).toBeVisible()
  })
})
