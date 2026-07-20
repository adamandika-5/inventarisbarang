import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import StockInForm from './stock-in-form'

export const metadata: Metadata = {
  title: 'Barang Masuk — InventarisBarang Admin',
}

export default async function StockInPage({
  searchParams,
}: {
  searchParams: Promise<{ item?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams

  // Pre-select item if passed via query param
  let preselectedItem = null
  if (params.item) {
    const { data } = await supabase
      .from('items')
      .select(
        'id,sku,name,current_stock,is_active,base_unit:units!base_unit_id(id,name,symbol),item_units(id,conversion_factor,is_active,units(id,name,symbol))',
      )
      .eq('id', params.item)
      .eq('is_active', true)
      .single()
    preselectedItem = data
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Barang Masuk</h1>
        <p className="mt-1 text-sm text-gray-500">Catat pembelian atau penerimaan barang</p>
      </div>
      <StockInForm preselectedItem={preselectedItem} />
    </div>
  )
}
