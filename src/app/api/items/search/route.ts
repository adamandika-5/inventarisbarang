/**
 * GET /api/items/search — server-side item search.
 *
 * SECURITY:
 * - Requires authenticated session
 * - Returns NO price data (safe for both admin and employee)
 * - Input sanitized — no SQL concatenation, uses Supabase parameterized queries
 * - Rate limiting: TODO(security) — implement per-user rate limiting using shared store (not in-memory)
 */
import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const MAX_RESULTS = 10
const MIN_QUERY_LENGTH = 2
const MAX_QUERY_LENGTH = 100

export async function GET(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    // Require authentication
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })
    }

    // Verify active profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_active')
      .eq('id', user.id)
      .single()
    if (!profile?.is_active) {
      return NextResponse.json({ error: 'Akun tidak aktif.' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const q = searchParams.get('q')?.trim() ?? ''
    const activeOnly = searchParams.get('active') !== '0'

    // Validate query
    if (q.length < MIN_QUERY_LENGTH) {
      return NextResponse.json([], { status: 200 })
    }
    if (q.length > MAX_QUERY_LENGTH) {
      return NextResponse.json({ error: 'Query terlalu panjang.' }, { status: 400 })
    }

    // Sanitize: reject query containing SQL-injection-style patterns
    // (defense-in-depth — Supabase uses parameterized queries anyway)
    if (/['";\\]/.test(q)) {
      return NextResponse.json([], { status: 200 })
    }

    let query = supabase
      .from('items')
      .select(
        'id,sku,barcode,name,current_stock,is_active,base_unit:units!base_unit_id(id,name,symbol),item_units(id,conversion_factor,is_active,units(id,name,symbol))',
      )
      .or(`name.ilike.%${q}%,sku.ilike.%${q}%,barcode.ilike.%${q}%`)
      .order('name')
      .limit(MAX_RESULTS)

    if (activeOnly) {
      query = query.eq('is_active', true)
    }

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: 'Gagal mencari barang.' }, { status: 500 })
    }

    // Response headers to prevent caching of sensitive search results
    return NextResponse.json(data ?? [], {
      headers: {
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
