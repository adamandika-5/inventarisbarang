import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ItemDetailClient from './item-detail-client'

export const metadata: Metadata = {
  title: 'Detail Barang — InventarisBarang Admin',
}

export default async function ItemDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()

  const { data: item, error } = await supabase
    .from('items')
    .select(
      'id,sku,barcode,barcode_format,name,current_stock,minimum_stock,is_active,notes,created_at,updated_at,categories!category_id(id,name),base_unit:units!base_unit_id(id,name,symbol),item_units(id,conversion_factor,is_active,units(id,name,symbol))',
    )
    .eq('id', id)
    .single()

  if (error || !item) {
    redirect('/admin/items')
  }

  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('units').select('id, name, symbol').eq('is_active', true).order('name'),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Detail Barang</h1>
        <p className="mt-1 text-sm text-gray-500">
          <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{item.sku}</code>
        </p>
      </div>
      <ItemDetailClient
        item={item}
        categories={categories ?? []}
        allUnits={units ?? []}
      />
    </div>
  )
}
