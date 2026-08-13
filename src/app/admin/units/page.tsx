import type { Metadata } from 'next'
import Link from 'next/link'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import UnitsClient from './units-client'

export const metadata: Metadata = {
  title: 'Satuan — InventarisBarang Admin',
}

export default async function UnitsPage() {
  const supabase = await createSupabaseServerClient()

  const { data: units, error } = await supabase.from('units').select('*').order('name')

  if (error) {
    return (
      <div>
        <div className="alert-error">Gagal memuat data satuan. Coba muat ulang halaman.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-2xl font-bold">Kategori &amp; Satuan</h1>
        <p className="mt-1 text-sm">Kelola kategori barang dan satuan yang digunakan</p>
      </div>

      {/* Tab navigation */}
      <nav className="mb-4 inline-flex w-full rounded-lg border border-slate-200/80 bg-slate-100 p-1 dark:border-white/10 dark:bg-slate-800/80 sm:w-auto" aria-label="Tab kategori dan satuan">
        <Link
          href="/admin/categories"
          className="flex-1 sm:flex-initial px-5 py-1.5 text-center text-sm font-medium rounded-md text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-all"
        >
          Kategori
        </Link>
        <Link
          href="/admin/units"
          className="flex-1 sm:flex-initial px-5 py-1.5 text-center text-sm font-semibold rounded-md bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white transition-all"
          aria-current="page"
        >
          Satuan
        </Link>
      </nav>

      <UnitsClient initialUnits={units ?? []} />
    </div>
  )
}
