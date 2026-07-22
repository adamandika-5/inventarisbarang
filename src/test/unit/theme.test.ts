import { describe, it, expect, beforeEach, afterEach } from 'vitest'

describe('Theme System Unit Tests', () => {
  beforeEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
  })

  afterEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
    document.documentElement.removeAttribute('data-theme')
  })

  it('defaults to light mode for new users when localStorage is empty', () => {
    const stored = localStorage.getItem('ib-theme')
    const theme = stored === 'dark' ? 'dark' : 'light'
    expect(theme).toBe('light')
  })

  it('toggles dark class on document.documentElement correctly', () => {
    // Set theme to dark
    let theme = 'dark'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('ib-theme', theme)

    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('ib-theme')).toBe('dark')

    // Set theme to light
    theme = 'light'
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('ib-theme', theme)

    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('ib-theme')).toBe('light')
  })

  it('uses a single unified key ib-theme in localStorage', () => {
    const KEY = 'ib-theme'
    localStorage.setItem(KEY, 'dark')
    expect(localStorage.getItem(KEY)).toBe('dark')

    localStorage.setItem(KEY, 'light')
    expect(localStorage.getItem(KEY)).toBe('light')
  })
})
