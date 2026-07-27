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
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-50">Detail Barang</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          <code className="inline-block rounded bg-slate-100 px-2 py-0.5 font-mono text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:ring-1 dark:ring-slate-700">
            {item.sku}
          </code>
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
