import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import EmployeeItemsClient from './items-client'

export const metadata: Metadata = {
  title: 'Cek Stok Barang — InventarisBarang',
  description: 'Pencarian dan ketersediaan stok barang',
}

interface PageProps {
  searchParams: Promise<{
    q?: string
  }>
}

export default async function EmployeeItemsPage({ searchParams }: PageProps) {
  const { q = '' } = await searchParams
  const supabase = await createSupabaseServerClient()

  let query = supabase
    .from('items')
    .select(`
      id,
      sku,
      barcode,
      name,
      current_stock,
      minimum_stock,
      is_active,
      base_unit:units!items_base_unit_id_fkey(name, symbol),
      categories(name)
    `)
    .eq('is_active', true)
    .order('name', { ascending: true })

  if (q.trim()) {
    const term = `%${q.trim()}%`
    query = query.or(`name.ilike.${term},sku.ilike.${term},barcode.ilike.${term}`)
  }

  const { data: items } = await query.limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cek Stok Barang</h1>
        <p className="mt-1 text-sm text-gray-500">
          Cari barang dan periksa ketersediaan stok secara real-time.
        </p>
      </div>

      <EmployeeItemsClient initialItems={items || []} initialQuery={q} />
    </div>
  )
}
