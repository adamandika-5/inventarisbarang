import fs from 'fs'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { normalizePageNumber } from '@/lib/pagination'
import { formatAdjustmentSuccessMessage } from '@/lib/stock-adjustment'

const readSource = (relativePath: string) =>
  fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('Tahap 2 — adjustment result formatting', () => {
  it('formats positive and negative deltas without operator precedence artifacts', () => {
    expect(
      formatAdjustmentSuccessMessage({
        transactionNumber: 'TRX-ADJ-001',
        delta: 5,
        newStock: 25,
        unitSymbol: 'pcs',
      }),
    ).toBe('Penyesuaian TRX-ADJ-001 berhasil. Delta: +5 pcs · Stok baru: 25 pcs')

    const negative = formatAdjustmentSuccessMessage({
      transactionNumber: 'TRX-ADJ-002',
      delta: -5,
      newStock: 10,
      unitSymbol: 'pcs',
    })
    expect(negative).toContain('Delta: -5 pcs')
    expect(negative).not.toContain('+-5')
  })

  it('never renders the literal word undefined', () => {
    const message = formatAdjustmentSuccessMessage({ delta: -1 })
    expect(message).toContain('Stok baru: —')
    expect(message).not.toContain('undefined')
  })

  it('returns the validated physical stock from the adjustment action', () => {
    const source = readSource('src/app/admin/adjustments/actions.ts')
    expect(source).toMatch(
      /new_stock:\s*result\?\.stock_after\s*\?\?\s*parsed\.data\.physical_stock/,
    )
  })
})

describe('Tahap 2 — safe pagination', () => {
  it('accepts positive integers and rejects malformed page parameters', () => {
    expect(normalizePageNumber('3')).toBe(3)
    expect(normalizePageNumber('abc')).toBe(1)
    expect(normalizePageNumber('2.5')).toBe(1)
    expect(normalizePageNumber('0')).toBe(1)
    expect(normalizePageNumber('-4')).toBe(1)
    expect(normalizePageNumber(Number.POSITIVE_INFINITY)).toBe(1)
  })

  it('is used by both affected server pages', () => {
    for (const sourcePath of ['src/app/admin/users/page.tsx', 'src/app/admin/items/page.tsx']) {
      const source = readSource(sourcePath)
      expect(source).toContain("import { normalizePageNumber } from '@/lib/pagination'")
      expect(source).toContain('const page = normalizePageNumber(params.page)')
    }
  })

  it('preserves selected pages in both user and item pagination controls', () => {
    for (const sourcePath of [
      'src/app/admin/users/users-client.tsx',
      'src/app/admin/items/items-client.tsx',
    ]) {
      const source = readSource(sourcePath)
      expect(source).toContain('const goToPage')
      expect(source).toContain("set('page', String(targetPage))")
      expect(source).toContain('onClick={() => goToPage(page + 1)}')
    }
  })
})

describe('Tahap 2 — data consistency and removed dead fields', () => {
  it('updates name_normalized together with the unit name', () => {
    const source = readSource('src/app/admin/units/actions.ts')
    const updateFunction = source.slice(source.indexOf('export async function updateUnit'))
    expect(updateFunction).toMatch(/name_normalized:\s*parsed\.data\.name\.toLowerCase\(\)/)
  })

  it('preserves an empty notes value so an old item note can be cleared', () => {
    const source = readSource('src/app/admin/items/actions.ts')
    expect(source).toContain("const rawNotes = formData.get('notes')")
    expect(source).toContain("notes: typeof rawNotes === 'string' ? rawNotes : undefined")
    expect(source).toMatch(
      /parsed\.data\.notes !== undefined \? \{ notes: parsed\.data\.notes \|\| null \} : \{\}/,
    )
  })

  it('removes the unused employee note from scanner UI and its server action', () => {
    const scannerSource = readSource('src/app/employee/scan/scan-client.tsx')
    const actionSource = readSource('src/app/employee/actions.ts')

    expect(scannerSource).not.toContain('input-reason')
    expect(scannerSource).not.toContain("formData.set('reason'")
    expect(scannerSource).not.toContain('Catatan / Keperluan')
    expect(actionSource).not.toMatch(/^\s*reason:\s*z\.string/m)
  })

  it('matches the 32-character username limit enforced by PostgreSQL', () => {
    const actionSource = readSource('src/app/admin/users/actions.ts')
    const formSource = readSource('src/app/admin/users/new/new-employee-form.tsx')

    expect(actionSource).toContain(".max(32, 'Username maksimal 32 karakter.')")
    expect(formSource).toContain('maxLength={32}')
  })

  it('uses an in-app reset password dialog instead of window.prompt', () => {
    const source = readSource('src/app/admin/users/users-client.tsx')
    expect(source).not.toMatch(/\b(?:window\.)?prompt\s*\(/)
    expect(source).toContain('aria-labelledby="reset-password-title"')
    expect(source).toContain('<PasswordInput')
  })
})
