import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { buildTransactionHistoryWorkbook } from '@/lib/reports/transaction-history-excel'
import { formatInTimeZone } from 'date-fns-tz'

const TZ = 'Asia/Jakarta'

/**
 * GET /api/reports/transactions-detail?from=YYYY-MM-DD&to=YYYY-MM-DD&type=...&item=...
 * Downloads "Riwayat Transaksi" (.xlsx).
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

    const nowWib = formatInTimeZone(new Date(), TZ, 'yyyy-MM-dd')
    const thirtyDaysAgoWib = formatInTimeZone(
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
      TZ,
      'yyyy-MM-dd'
    )

    const rawFrom = searchParams.get('from') || thirtyDaysAgoWib
    const rawTo = searchParams.get('to') || nowWib
    const typeFilter = searchParams.get('type') || undefined
    const itemFilter = searchParams.get('item') || undefined

    const safeFrom = /^\d{4}-\d{2}-\d{2}$/.test(rawFrom) ? rawFrom : thirtyDaysAgoWib
    const safeTo = /^\d{4}-\d{2}-\d{2}$/.test(rawTo) ? rawTo : nowWib

    // Format dates for filename: DD-MM-YYYY
    const fromParts = safeFrom.split('-')
    const toParts = safeTo.split('-')
    const formattedFrom = `${fromParts[2]}-${fromParts[1]}-${fromParts[0]}`
    const formattedTo = `${toParts[2]}-${toParts[1]}-${toParts[0]}`

    const filename = `riwayat-transaksi-${formattedFrom}-sampai-${formattedTo}.xlsx`

    // Fetch app_settings for institution info
    const { data: settings } = await supabase
      .from('app_settings')
      .select('institution_name, report_header_text')
      .limit(1)
      .maybeSingle()

    const excelBuffer = await buildTransactionHistoryWorkbook(supabase, {
      dateFromStr: safeFrom,
      dateToStr: safeTo,
      typeFilter,
      itemFilter,
      institutionName: settings?.institution_name ?? null,
      reportHeaderText: settings?.report_header_text ?? null,
    })

    return new NextResponse(new Uint8Array(excelBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store, max-age=0',
      },
    })
  } catch (err: unknown) {
    console.error('Error generating transaction history excel:', err)
    return NextResponse.json(
      { error: 'Gagal membuat file Excel Riwayat Transaksi.' },
      { status: 500 }
    )
  }
}
