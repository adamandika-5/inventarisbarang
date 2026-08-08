import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  mockGetUser,
  mockProfileSingle,
  mockCompileInventoryReportData,
  mockBuildInventoryReportWorkbook,
  mockBuildTransactionHistoryWorkbook,
} = vi.hoisted(() => {
  return {
    mockGetUser: vi.fn(),
    mockProfileSingle: vi.fn(),
    mockCompileInventoryReportData: vi.fn(),
    mockBuildInventoryReportWorkbook: vi.fn(),
    mockBuildTransactionHistoryWorkbook: vi.fn(),
  }
})

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn().mockImplementation(() =>
    Promise.resolve({
      auth: {
        getUser: mockGetUser,
      },
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: mockProfileSingle,
          }),
        }),
      }),
    }),
  ),
}))

vi.mock('@/lib/reports/inventory-summary-excel', () => ({
  compileInventoryReportData: mockCompileInventoryReportData,
  buildInventoryReportWorkbook: mockBuildInventoryReportWorkbook,
}))

vi.mock('@/lib/reports/transaction-history-excel', () => ({
  buildTransactionHistoryWorkbook: mockBuildTransactionHistoryWorkbook,
}))

import { GET as getInventorySummaryRoute } from '@/app/api/reports/inventory-summary/route'
import { GET as getTransactionsDetailRoute } from '@/app/api/reports/transactions-detail/route'

describe('Admin Reports API Routes Inverted Date & Error Guarding Test Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-123' } } })
    mockProfileSingle.mockResolvedValue({ data: { role: 'ADMIN', is_active: true } })
  })

  it('inventory summary route returns HTTP 400 and guards generators on inverted date range', async () => {
    const req = new NextRequest('http://localhost:3000/api/reports/inventory-summary?from=2026-08-15&to=2026-07-01')
    const res = await getInventorySummaryRoute(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir.' })
    expect(mockCompileInventoryReportData).not.toHaveBeenCalled()
    expect(mockBuildInventoryReportWorkbook).not.toHaveBeenCalled()
  })

  it('transactions detail route returns HTTP 400 and guards generator on inverted date range', async () => {
    const req = new NextRequest('http://localhost:3000/api/reports/transactions-detail?from=2026-08-15&to=2026-07-01')
    const res = await getTransactionsDetailRoute(req)

    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body).toEqual({ error: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir.' })
    expect(mockBuildTransactionHistoryWorkbook).not.toHaveBeenCalled()
  })

  it('inventory summary route returns HTTP 500 and guards workbook generator when compileInventoryReportData throws an error', async () => {
    mockCompileInventoryReportData.mockRejectedValueOnce(
      new Error('Gagal mengambil data persediaan ekspor: DB failure'),
    )

    const req = new NextRequest('http://localhost:3000/api/reports/inventory-summary?from=2026-07-01&to=2026-07-31')
    const res = await getInventorySummaryRoute(req)

    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body).toEqual({ error: 'Gagal mengambil data persediaan ekspor: DB failure' })
    expect(mockCompileInventoryReportData).toHaveBeenCalledTimes(1)
    expect(mockBuildInventoryReportWorkbook).not.toHaveBeenCalled()
  })
})
