/**
 * Stock-In Server Actions
 * Records purchase/incoming stock transactions.
 *
 * SECURITY: Admin only, all calculations done server-side.
 */
'use server'

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const stockInSchema = z.object({
  client_request_id: z.string().uuid('client_request_id tidak valid.'),
  item_id: z.string().uuid('ID barang tidak valid.'),
  unit_id: z.string().uuid('ID satuan tidak valid.'),
  input_quantity: z
    .string()
    .regex(/^[1-9]\d*$/, 'Jumlah harus bilangan bulat positif.')
    .transform((v) => parseInt(v, 10)),
  transaction_unit_price: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'Harga tidak valid.')
    .transform(Number),
})

export interface ActionResult {
  success: boolean
  error?: string
  data?: {
    transaction_number?: string
    new_stock?: number
  }
}

async function verifyAdmin() {
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, isAdmin: false }
  const { data: profile } = await supabase
    .from('profiles').select('role,is_active').eq('id', user.id).single()
  return { supabase, isAdmin: !!(profile?.is_active && profile.role === 'ADMIN') }
}

/**
 * Process a stock-in transaction.
 * Calls the process_stock_in RPC which handles atomicity and moving average.
 */
export async function processStockIn(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, isAdmin } = await verifyAdmin()
    if (!isAdmin) return { success: false, error: 'Akses ditolak.' }

    const rawData = {
      client_request_id: formData.get('client_request_id') as string,
      item_id: formData.get('item_id') as string,
      unit_id: formData.get('unit_id') as string,
      input_quantity: formData.get('input_quantity') as string,
      transaction_unit_price: formData.get('transaction_unit_price') as string,
    }

    const parsed = stockInSchema.safeParse(rawData)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map(i => i.message).join(' ') }
    }

    const { data, error } = await supabase.rpc('process_stock_in', {
      p_client_request_id: parsed.data.client_request_id,
      p_item_id: parsed.data.item_id,
      p_unit_id: parsed.data.unit_id,
      p_input_quantity: parsed.data.input_quantity,
      p_transaction_unit_price: parsed.data.transaction_unit_price.toString(),
    })

    if (error) {
      // Translate known RPC errors
      if (error.message.includes('already processed')) {
        return { success: false, error: 'Transaksi ini sudah pernah diproses (duplikat).' }
      }
      if (error.message.includes('not found') || error.message.includes('inactive')) {
        return { success: false, error: 'Barang tidak ditemukan atau tidak aktif.' }
      }
      return { success: false, error: 'Gagal mencatat barang masuk.' }
    }

    revalidatePath('/admin/stock-in')
    revalidatePath('/admin/items')

    const result = data as { transaction_number: string; stock_after: number } | null
    return {
      success: true,
      data: {
        transaction_number: result?.transaction_number,
        new_stock: result?.stock_after ?? 0,
      },
    }
  } catch {
    return { success: false, error: 'Terjadi kesalahan pada server.' }
  }
}
