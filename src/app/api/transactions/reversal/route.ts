/**
 * POST /api/transactions/reversal — process a transaction reversal.
 * Admin only. Calls process_reversal RPC.
 *
 * SECURITY:
 * - Requires authenticated admin session
 * - Input validated server-side
 * - RPC handles idempotency, locking, and constraint checking
 */
import { type NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { z } from 'zod'

const schema = z.object({
  client_request_id: z.string().uuid(),
  original_transaction_id: z.string().uuid(),
  reason: z.string().min(3, 'Alasan minimal 3 karakter.').max(500).trim(),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createSupabaseServerClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ success: false, error: 'Tidak terautentikasi.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles').select('role,is_active').eq('id', user.id).single()
    if (!profile?.is_active || profile.role !== 'ADMIN') {
      return NextResponse.json({ success: false, error: 'Akses ditolak.' }, { status: 403 })
    }

    const formData = await request.formData()
    const parsed = schema.safeParse({
      client_request_id: formData.get('client_request_id'),
      original_transaction_id: formData.get('original_transaction_id'),
      reason: formData.get('reason'),
    })

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues.map(i => i.message).join(' ') },
        { status: 400 },
      )
    }

    const { data, error } = await supabase.rpc('process_reversal', {
      p_client_request_id: parsed.data.client_request_id,
      p_original_transaction_id: parsed.data.original_transaction_id,
      p_reason: parsed.data.reason,
    })

    if (error) {
      let msg = 'Gagal membatalkan transaksi.'
      if (error.message.includes('already reversed')) msg = 'Transaksi ini sudah dibatalkan sebelumnya.'
      if (error.message.includes('REVERSAL cannot be reversed')) msg = 'Transaksi pembatalan tidak dapat dibatalkan kembali.'
      if (error.message.includes('negative stock')) msg = 'Pembatalan akan menyebabkan stok negatif.'
      return NextResponse.json({ success: false, error: msg }, { status: 422 })
    }

    const result = data as { transaction_number: string } | null
    return NextResponse.json(
      { success: true, data: { transaction_number: result?.transaction_number } },
      {
        headers: {
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  } catch {
    return NextResponse.json({ success: false, error: 'Terjadi kesalahan server.' }, { status: 500 })
  }
}
