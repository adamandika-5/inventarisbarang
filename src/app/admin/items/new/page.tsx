import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import NewItemForm from './new-item-form'

export const metadata: Metadata = {
  title: 'Tambah Barang — InventarisBarang Admin',
}

export default async function NewItemPage() {
  const supabase = await createSupabaseServerClient()

  const [{ data: categories }, { data: units }] = await Promise.all([
    supabase.from('categories').select('id, name').eq('is_active', true).order('name'),
    supabase.from('units').select('id, name, symbol').eq('is_active', true).order('name'),
  ])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tambah Barang</h1>
        <p className="mt-1 text-sm text-gray-500">Daftarkan barang baru ke sistem inventaris</p>
      </div>
      <NewItemForm categories={categories ?? []} units={units ?? []} />
    </div>
  )
}
