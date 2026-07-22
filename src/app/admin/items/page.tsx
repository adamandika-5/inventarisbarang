import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import ItemsClient from './items-client'

export const metadata: Metadata = {
  title: 'Data Barang — InventarisBarang Admin',
}

export default async function ItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; category?: string; status?: string; active?: string; page?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  const params = await searchParams

  const search = params.search?.trim() ?? ''
  const categoryFilter = params.category ?? ''
  const activeFilter = params.active ?? 'true' // default: show active items
  const page = Math.max(1, parseInt(params.page ?? '1', 10))
  const pageSize = 25
  const offset = (page - 1) * pageSize

  // Build query
  let query = supabase
    .from('items')
    .select(
      'id,sku,barcode,barcode_format,name,current_stock,minimum_stock,is_active,notes,categories!category_id(id,name),base_unit:units!base_unit_id(id,name,symbol)',
      { count: 'exact' },
    )

  if (search) {
    query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%,barcode.ilike.%${search}%`)
  }
  if (categoryFilter) {
    query = query.eq('category_id', categoryFilter)
  }
  if (activeFilter === 'true') {
    query = query.eq('is_active', true)
  } else if (activeFilter === 'false') {
    query = query.eq('is_active', false)
  }

  query = query.order('name').range(offset, offset + pageSize - 1)

  const { data: items, count, error } = await query

  // Load categories for filter dropdown
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name')
    .eq('is_active', true)
    .order('name')

  if (error) {
    return (
      <div>
        <div className="alert-error">Gagal memuat data barang. Coba muat ulang halaman.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-slate-100">Data Barang</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
            {count ?? 0} barang ditemukan
          </p>
        </div>
        <Link href="/admin/items/new" id="btn-tambah-barang" className="btn-primary">
          + Tambah Barang
        </Link>
      </div>

      <ItemsClient
        initialItems={items ?? []}
        totalCount={count ?? 0}
        page={page}
        pageSize={pageSize}
        categories={categories ?? []}
        search={search}
        categoryFilter={categoryFilter}
        activeFilter={activeFilter}
      />
    </div>
  )
}
