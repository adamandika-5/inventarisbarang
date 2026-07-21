'use server'

/**
 * Employee Server Actions
 * SECURITY:
 * - Verifies user authentication and active status on every request
 * - Employees CANNOT perform stock-in or input unit prices (strictly ADMIN ONLY)
 * - Employees can only record stock-out (pengambilan barang / barang keluar)
 * - Uses session client (auth.uid() set to logged-in user)
 * - All stock mutations performed via atomic SECURITY DEFINER RPC process_stock_out
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export interface ActionResult {
  success: boolean
  error?: string
  data?: {
    transaction_number?: string
    new_stock?: number
    item_name?: string
  }
}

async function verifyActiveUser() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase, user: null, isActive: false, role: null }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active,full_name')
    .eq('id', user.id)
    .single()

  const isActive = !!(profile?.is_active)
  return { supabase, user, isActive, role: profile?.role ?? null, profile }
}

const stockOutSchema = z.object({
  client_request_id: z.string().uuid('ID transaksi tidak valid.'),
  item_id: z.string().uuid('ID barang tidak valid.'),
  unit_id: z.string().uuid('ID satuan tidak valid.'),
  input_quantity: z
    .string()
    .regex(/^[1-9]\d*$/, 'Jumlah harus berupa bilangan bulat positif.')
    .transform((v) => parseInt(v, 10)),
  reason: z.string().max(500, 'Alasan maksimal 500 karakter.').optional(),
})

/**
 * Record stock-out (barang keluar / ambil barang) for employee.
 * Strictly uses process_stock_out RPC.
 */
export async function processEmployeeStockOut(formData: FormData): Promise<ActionResult> {
  try {
    const { supabase, user, isActive } = await verifyActiveUser()
    if (!user || !isActive) {
      return { success: false, error: 'Akses ditolak atau sesi tidak aktif.' }
    }

    const rawData = {
      client_request_id: formData.get('client_request_id') as string,
      item_id: formData.get('item_id') as string,
      unit_id: formData.get('unit_id') as string,
      input_quantity: formData.get('input_quantity') as string,
      reason: (formData.get('reason') as string) || undefined,
    }

    const parsed = stockOutSchema.safeParse(rawData)
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues.map((i) => i.message).join(' ') }
    }

    const { data, error } = await supabase.rpc('process_stock_out', {
      p_client_request_id: parsed.data.client_request_id,
      p_item_id: parsed.data.item_id,
      p_input_quantity: parsed.data.input_quantity,
      p_unit_id: parsed.data.unit_id,
    })

    if (error) {
      console.error(`process_stock_out failed - code: ${error.code}, message: ${error.message}`)
      if (error.message.includes('INSUFFICIENT_STOCK')) {
        return { success: false, error: 'Stok tidak mencukupi untuk jumlah yang diminta.' }
      }
      if (error.message.includes('NOT_FOUND') || error.message.includes('not active')) {
        return { success: false, error: 'Barang tidak ditemukan atau tidak aktif.' }
      }
      return { success: false, error: 'Gagal mencatat pengeluaran barang.' }
    }

    revalidatePath('/employee')
    revalidatePath('/employee/items')
    revalidatePath('/employee/history')

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

/**
 * Search items by query (barcode, SKU, or name) for employee scanner & lookup.
 * Does NOT expose cost prices, purchase prices, or inventory values.
 */
export async function searchItemByCode(query: string) {
  try {
    const { supabase, user, isActive } = await verifyActiveUser()
    if (!user || !isActive) return null

    const cleanQuery = query.trim()
    if (!cleanQuery) return null

    // Exact match by barcode or SKU first
    const { data: exactItem } = await supabase
      .from('items')
      .select(`
        id,
        sku,
        barcode,
        barcode_format,
        name,
        current_stock,
        minimum_stock,
        is_active,
        base_unit_id,
        base_unit:units!items_base_unit_id_fkey(id, name, symbol),
        categories(id, name),
        item_units(
          id,
          unit_id,
          conversion_factor,
          is_active,
          units(id, name, symbol)
        )
      `)
      .or(`barcode.eq.${cleanQuery},sku.ilike.${cleanQuery}`)
      .eq('is_active', true)
      .maybeSingle()

    if (exactItem) return exactItem

    // Partial match by name or SKU
    const { data: matchedItems } = await supabase
      .from('items')
      .select(`
        id,
        sku,
        barcode,
        barcode_format,
        name,
        current_stock,
        minimum_stock,
        is_active,
        base_unit_id,
        base_unit:units!items_base_unit_id_fkey(id, name, symbol),
        categories(id, name),
        item_units(
          id,
          unit_id,
          conversion_factor,
          is_active,
          units(id, name, symbol)
        )
      `)
      .or(`name.ilike.%${cleanQuery}%,sku.ilike.%${cleanQuery}%`)
      .eq('is_active', true)
      .limit(5)

    return matchedItems && matchedItems.length > 0 ? matchedItems[0] : null
  } catch {
    return null
  }
}
