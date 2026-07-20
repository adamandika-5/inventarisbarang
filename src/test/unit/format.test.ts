import { describe, it, expect } from 'vitest'
import {
  jakartaDateRangeToUTC,
  jakartaMonthToUTC,
  formatRupiah,
} from '@/lib/utils/format'

describe('jakartaDateRangeToUTC', () => {
  it('converts Jakarta date range to UTC correctly', () => {
    // Jakarta is UTC+7
    // Midnight Jan 1 Jakarta = Dec 31, 17:00 UTC
    const { startUTC, endUTC } = jakartaDateRangeToUTC('2024-01-01', '2024-01-31')
    
    expect(startUTC.toISOString()).toBe('2023-12-31T17:00:00.000Z')
    // endUTC = Feb 1 00:00 Jakarta = Jan 31 17:00 UTC
    expect(endUTC.toISOString()).toBe('2024-01-31T17:00:00.000Z')
  })

  it('correctly handles same-day range', () => {
    const { startUTC, endUTC } = jakartaDateRangeToUTC('2024-03-15', '2024-03-15')
    // startUTC: March 15 00:00 Jakarta = March 14 17:00 UTC
    expect(startUTC.toISOString()).toBe('2024-03-14T17:00:00.000Z')
    // endUTC: March 16 00:00 Jakarta = March 15 17:00 UTC
    expect(endUTC.toISOString()).toBe('2024-03-15T17:00:00.000Z')
  })
})

describe('jakartaMonthToUTC', () => {
  it('converts January 2024 Jakarta month to UTC range', () => {
    const { startUTC, endUTC } = jakartaMonthToUTC(2024, 1)
    expect(startUTC.toISOString()).toBe('2023-12-31T17:00:00.000Z')
    expect(endUTC.toISOString()).toBe('2024-01-31T17:00:00.000Z')
  })

  it('correctly handles February in non-leap year', () => {
    const { startUTC, endUTC } = jakartaMonthToUTC(2023, 2)
    // Feb 1 Jakarta = Jan 31 17:00 UTC
    expect(startUTC.toISOString()).toBe('2023-01-31T17:00:00.000Z')
    // Mar 1 Jakarta (exclusive) = Feb 28 17:00 UTC
    expect(endUTC.toISOString()).toBe('2023-02-28T17:00:00.000Z')
  })

  it('correctly handles February in leap year', () => {
    const { startUTC, endUTC } = jakartaMonthToUTC(2024, 2)
    expect(startUTC.toISOString()).toBe('2024-01-31T17:00:00.000Z')
    // 2024 is leap year, Feb has 29 days
    expect(endUTC.toISOString()).toBe('2024-02-29T17:00:00.000Z')
  })
})

describe('formatRupiah', () => {
  it('formats currency in IDR', () => {
    const result = formatRupiah(50000)
    expect(result).toContain('50.000') // Indonesian number format
    expect(result).toContain('Rp') // or IDR symbol
  })

  it('handles zero', () => {
    const result = formatRupiah(0)
    expect(result).toContain('0')
  })

  it('handles string input', () => {
    const result = formatRupiah('75000.50')
    expect(result).toContain('75.001') // rounded to 0 decimal places
  })

  it('handles invalid input gracefully', () => {
    const result = formatRupiah('invalid')
    expect(result).toContain('Rp -')
  })
})
