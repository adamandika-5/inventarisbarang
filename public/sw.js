/**
 * Service Worker for InventarisBarang PWA
 *
 * SECURITY & DESIGN PRINCIPLES:
 * - Cache ONLY application shell and static assets
 * - NEVER cache:
 *   - Supabase API responses
 *   - Authentication data
 *   - Stock/transaction/price data
 *   - User profile data
 *   - Any HTML pages with dynamic content
 * - Mutation endpoints use network-only strategy
 * - No offline transaction queuing
 * - When offline: show clear indicator, disable transaction buttons
 */

// Bump the cache whenever manifest/icons change so installed PWAs do not keep
// an outdated splash screen.
const CACHE_NAME = 'inventarisbarang-shell-v2'

// Only cache the application shell and static assets
const SHELL_ASSETS = [
  '/_next/static/',
  '/icons/',
  '/manifest.json',
]

// URLs that should NEVER be cached
const NO_CACHE_PATTERNS = [
  /supabase\.co/,        // Supabase API
  /\/api\//,             // Next.js API routes
  /\/admin\//,           // Admin pages (dynamic)
  /\/employee\//,        // Employee pages (dynamic)
  /\/login/,             // Auth pages (dynamic)
]

self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Take control of all clients immediately
      self.clients.claim(),
      // Clean up old caches
      caches.keys().then((cacheNames) =>
        Promise.all(
          cacheNames
            .filter((name) => name !== CACHE_NAME)
            .map((name) => caches.delete(name))
        )
      ),
    ])
  )
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Never cache non-GET requests
  if (event.request.method !== 'GET') {
    return // Use network directly (no caching)
  }

  // Never cache URLs matching no-cache patterns
  if (NO_CACHE_PATTERNS.some((pattern) => pattern.test(url.href))) {
    return // Network-only for sensitive data
  }

  // For static assets (_next/static, icons, manifest), use cache-first
  const isStaticAsset = SHELL_ASSETS.some((pattern) => url.pathname.startsWith(pattern))

  if (isStaticAsset) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached

        return fetch(event.request).then((response) => {
          if (response.ok) {
            const responseClone = response.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone)
            })
          }
          return response
        })
      })
    )
  }
  // All other requests: network-only (no caching)
})
