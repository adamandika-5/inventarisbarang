import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import {
  compileInventoryReportData,
  buildInventoryReportWorkbook,
} from '@/lib/reports/inventory-summary-excel'
import { normalizeReportFilters } from '@/lib/reports/report-filters'

/**
 * GET /api/reports/inventory-summary?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Downloads "Laporan Rincian Barang Persediaan" (.xlsx).
 * Admin-only route.
 */
export async function GET(request: NextRequest) {
  const supabase = await createSupabaseServerClient()

  // 1. Validate Authentication & Admin Role
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const searchParams = request.nextUrl.searchParams
    const rawFrom = searchParams.get('from')
    const rawTo = searchParams.get('to')

    const normalized = normalizeReportFilters({
      from: rawFrom,
      to: rawTo,
    })

    if (normalized.isInvalidDateRange) {
      return NextResponse.json(
        { error: 'Tanggal awal tidak boleh lebih besar dari tanggal akhir.' },
        { status: 400 },
      )
    }

    // Format dates for filename: DD-MM-YYYY
    const fromParts = normalized.safeFrom.split('-')
    const toParts = normalized.safeTo.split('-')
    const formattedFrom = `${fromParts[2]}-${fromParts[1]}-${fromParts[0]}`
    const formattedTo = `${toParts[2]}-${toParts[1]}-${toParts[0]}`

    const filename = `laporan-rincian-persediaan-${formattedFrom}-sampai-${formattedTo}.xlsx`

    // Compile report data & build Excel workbook
    const reportData = await compileInventoryReportData(supabase, normalized.safeFrom, normalized.safeTo)
    const excelBuffer = await buildInventoryReportWorkbook(reportData)

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Gagal membuat file Excel Laporan Rincian Persediaan.'
    console.error('[API /api/reports/inventory-summary] Error generating inventory summary excel:', err)
    return NextResponse.json(
      { error: errorMsg },
      { status: 500 }
    )
  }
}
