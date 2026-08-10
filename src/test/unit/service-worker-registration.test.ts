import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createElement } from 'react'
import { render } from '@testing-library/react'

describe('ServiceWorkerRegistration', () => {
  let registerMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    registerMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register: registerMock },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    vi.resetModules()
    vi.unstubAllEnvs()
  })

  it('does NOT register service worker in development/test', async () => {
    // NODE_ENV is 'test' by default in vitest — no stub needed
    const { ServiceWorkerRegistration } = await import(
      '@/components/service-worker-registration'
    )
    render(createElement(ServiceWorkerRegistration))

    await vi.waitFor(() => {
      expect(registerMock).not.toHaveBeenCalled()
    })
  })

  it('registers service worker in production with correct config', async () => {
    vi.stubEnv('NODE_ENV', 'production')

    const { ServiceWorkerRegistration } = await import(
      '@/components/service-worker-registration'
    )
    render(createElement(ServiceWorkerRegistration))

    await vi.waitFor(() => {
      expect(registerMock).toHaveBeenCalledWith('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
    })
  })
})
