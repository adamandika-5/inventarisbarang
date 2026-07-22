import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import CategoriesClient from './categories-client'

export const metadata: Metadata = {
  title: 'Kategori & Satuan — InventarisBarang Admin',
}

export default async function CategoriesPage() {
  const supabase = await createSupabaseServerClient()

  const { data: categories, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')

  if (error) {
    return (
      <div className="p-6">
        <div className="alert-error">Gagal memuat data kategori. Coba muat ulang halaman.</div>
      </div>
    )
  }

  return (
    <div>
      {/* Page header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Kategori &amp; Satuan</h1>
        <p className="mt-1 text-sm">Kelola kategori barang dan satuan yang digunakan</p>
      </div>

      {/* Tab navigation between categories and units */}
      <nav className="tab-nav mb-6" aria-label="Tab kategori dan satuan">
        <Link
          href="/admin/categories"
          className="tab-nav-item active"
          aria-current="page"
        >
          Kategori
        </Link>
        <Link
          href="/admin/units"
          className="tab-nav-item"
        >
          Satuan
        </Link>
      </nav>

      <CategoriesClient initialCategories={categories ?? []} />
    </div>
  )
}
