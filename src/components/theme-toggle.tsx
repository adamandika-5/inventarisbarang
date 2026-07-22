'use client'

/**
 * ThemeToggle — toggles between Light and Dark mode.
 *
 * - Reads/writes localStorage key 'ib-theme'
 * - Adds/removes class 'dark' from <html>
 * - Starts with system preference if no saved preference
 */

import { useEffect, useState, useCallback } from 'react'

type Theme = 'light' | 'dark'

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = localStorage.getItem('ib-theme') as Theme | null
    if (stored === 'light' || stored === 'dark') return stored
    return 'light'
  } catch {
    return 'light'
  }
}

function applyTheme(theme: Theme) {
  try {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ib-theme', theme)
  } catch {
    // ignore storage errors
  }
}

interface ThemeToggleProps {
  /** Show text label next to icon */
  showLabel?: boolean
  /** Additional CSS class */
  className?: string
}

export default function ThemeToggle({ showLabel = false, className = '' }: ThemeToggleProps) {
  const [theme, setTheme] = useState<Theme>('light')
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setTheme(getInitialTheme())
    setMounted(true)

    // Listen for system preference changes
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const handler = (e: MediaQueryListEvent) => {
      const stored = localStorage.getItem('ib-theme')
      if (!stored) {
        const newTheme: Theme = e.matches ? 'dark' : 'light'
        setTheme(newTheme)
        applyTheme(newTheme)
      }
    }
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next: Theme = prev === 'light' ? 'dark' : 'light'
      applyTheme(next)
      return next
    })
  }, [])

  // Avoid hydration mismatch by not rendering until mounted
  if (!mounted) {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-md p-2 text-sm transition-colors opacity-0 ${className}`}
        aria-label="Toggle tema"
        tabIndex={-1}
      >
        <span className="h-4 w-4" />
      </button>
    )
  }

  const isDark = theme === 'dark'

  return (
    <button
      type="button"
      id="btn-theme-toggle"
      onClick={toggle}
      title={isDark ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
      aria-label={isDark ? 'Ganti ke Tema Terang' : 'Ganti ke Tema Gelap'}
      aria-pressed={isDark}
      className={`inline-flex items-center gap-1.5 rounded-md p-2 text-sm transition-all hover:opacity-80 ${className}`}
    >
      {isDark ? (
        /* Sun icon */
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="5" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
      ) : (
        /* Moon icon */
        <svg
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
      {showLabel && (
        <span className="text-xs font-medium">
          {isDark ? 'Terang' : 'Gelap'}
        </span>
      )}
    </button>
  )
}
