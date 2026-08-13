'use client'

import { useEffect, useState } from 'react'
import { BrandedLoader } from '@/components/branded-loader'

type StartupPhase = 'visible' | 'leaving' | 'hidden'

type StandaloneNavigator = Navigator & {
  standalone?: boolean
}

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'portrait-primary') => Promise<void>
}

function isStandalonePwa() {
  return (
    (typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    (window.navigator as StandaloneNavigator).standalone === true
  )
}

function lockPortraitBestEffort() {
  const orientation = window.screen.orientation as LockableOrientation | undefined

  if (!orientation?.lock) return

  try {
    void orientation.lock('portrait-primary').catch(() => {
      // Some browsers enforce the manifest orientation but reject the runtime API.
    })
  } catch {
    // Keep the manifest lock as the fallback when the API throws synchronously.
  }
}

/**
 * Covers the short hand-off between Android's static splash and the first app
 * paint. It is CSS-hidden in ordinary browser tabs and never delays routing.
 */
export function PwaStartupScreen() {
  const [phase, setPhase] = useState<StartupPhase>('visible')

  useEffect(() => {
    if (!isStandalonePwa()) {
      setPhase('hidden')
      return
    }

    lockPortraitBestEffort()

    const startLeaving = window.setTimeout(() => setPhase('leaving'), 450)
    const finishLeaving = window.setTimeout(() => setPhase('hidden'), 700)

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') lockPortraitBestEffort()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.clearTimeout(startLeaving)
      window.clearTimeout(finishLeaving)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  if (phase === 'hidden') return null

  return (
    <div
      className="pwa-startup-screen"
      data-phase={phase}
      role="status"
      aria-live="polite"
      aria-label="Menyiapkan aplikasi Inventaris Barang"
    >
      <BrandedLoader title="Inventaris Barang" message="Menyiapkan aplikasi dengan aman..." />
    </div>
  )
}
