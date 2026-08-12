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
      <nav className="mb-6 inline-flex w-full sm:w-auto rounded-lg bg-slate-100 dark:bg-slate-800/80 p-1 border border-slate-200/80 dark:border-white/10" aria-label="Tab kategori dan satuan">
        <Link
          href="/admin/categories"
          className="flex-1 sm:flex-initial px-5 py-1.5 text-center text-sm font-semibold rounded-md bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white transition-all"
          aria-current="page"
        >
          Kategori
        </Link>
        <Link
          href="/admin/units"
          className="flex-1 sm:flex-initial px-5 py-1.5 text-center text-sm font-medium rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all"
        >
          Satuan
        </Link>
      </nav>

      <CategoriesClient initialCategories={categories ?? []} />
    </div>
  )
}
