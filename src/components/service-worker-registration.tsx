'use client'

import { useEffect } from 'react'

/**
 * Registers the service worker only in production.
 * Fails silently to avoid crashing the page if registration is unsupported or fails.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker
      .register('/sw.js', {
        scope: '/',
        updateViaCache: 'none',
      })
      .catch(() => {
        // Registration failed — silently ignore to avoid page crash
      })
  }, [])

  return null
}
