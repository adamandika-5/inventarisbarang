import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(join(process.cwd(), path), 'utf8')
}

describe('admin table layout alignment', () => {
  it('keeps category and unit controls compact and their columns proportional', () => {
    const categoriesPage = source('src/app/admin/categories/page.tsx')
    const unitsPage = source('src/app/admin/units/page.tsx')
    const categoriesClient = source('src/app/admin/categories/categories-client.tsx')
    const unitsClient = source('src/app/admin/units/units-client.tsx')

    expect(categoriesPage).toContain('nav className="mb-4')
    expect(unitsPage).toContain('nav className="mb-4')
    expect(categoriesClient).toContain('min-w-[720px] table-fixed')
    expect(unitsClient).toContain('min-w-[720px] table-fixed')
    expect(categoriesClient.match(/<col className=/g)).toHaveLength(4)
    expect(unitsClient.match(/<col className=/g)).toHaveLength(4)
    expect(categoriesClient).toContain('text-center text-xs font-semibold uppercase')
    expect(unitsClient).toContain('text-center text-xs font-semibold uppercase')
    expect(categoriesClient).toContain('>TINDAKAN</th>')
    expect(unitsClient).toContain('>TINDAKAN</th>')
    expect(categoriesClient).toContain('inline-flex items-center justify-center gap-2')
    expect(unitsClient).toContain('inline-flex items-center justify-center gap-2')
    expect(categoriesClient).not.toContain('>AKSI</th>')
    expect(unitsClient).not.toContain('>AKSI</th>')
  })

  it('reserves enough room for every stock-out column and status badge', () => {
    const stockOutList = source('src/app/admin/stock-out/stock-out-list.tsx')

    expect(stockOutList).toContain('min-w-[1120px] table-fixed divide-y-0')
    expect(stockOutList.match(/<col className=/g)).toHaveLength(8)
    expect(stockOutList).toContain('<col className="w-[12%]" />')
    expect(stockOutList).toContain(
      'table-container border-t-0 border-slate-200/80 dark:border-white/10',
    )
    expect(stockOutList).not.toContain(
      'thead className="border-b border-slate-300 dark:border-slate-600"',
    )
    expect(stockOutList).toContain('whitespace-nowrap text-right text-sm font-medium tabular-nums')
    expect(stockOutList).toContain('whitespace-nowrap text-center">STOK SEBELUM')
    expect(stockOutList).toContain('whitespace-nowrap text-center">STOK SESUDAH')
    expect(stockOutList).toContain('badge-nonaktif inline-flex whitespace-nowrap')
    expect(stockOutList).toContain('badge-aman inline-flex whitespace-nowrap')
  })

  it('keeps report transaction badges on one line and aligns stock values', () => {
    const reportsClient = source('src/app/admin/reports/reports-client.tsx')

    expect(reportsClient).toContain('min-w-[1100px] table-fixed divide-y-0')
    expect(reportsClient).toContain('inline-flex whitespace-nowrap rounded-full')
    expect(reportsClient).toContain('min-w-[760px] table-fixed divide-y-0')
    expect(
      reportsClient.match(
        /table-container border-t-0 border-slate-200\/80 dark:border-white\/10/g,
      ),
    ).toHaveLength(2)
    expect(reportsClient).not.toContain(
      'thead className="border-b border-slate-300 dark:border-slate-600"',
    )
    expect(reportsClient).toContain('whitespace-nowrap text-center">Stok Saat Ini')
    expect(reportsClient).toContain('whitespace-nowrap text-center">Stok Minimum')
    expect(reportsClient).toContain('text-center tabular-nums font-bold')
  })
})
