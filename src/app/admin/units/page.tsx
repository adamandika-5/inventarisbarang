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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Kategori &amp; Satuan</h1>
        <p className="mt-1 text-sm text-gray-500">Kelola kategori barang dan satuan yang digunakan</p>
      </div>

      {/* Tab navigation */}
      <nav className="mb-6 flex gap-1 rounded-lg bg-gray-100 p-1" aria-label="Tab kategori dan satuan">
        <Link
          href="/admin/categories"
          className="flex-1 rounded-md px-4 py-2 text-center text-sm font-medium text-gray-600 hover:bg-white hover:text-gray-900"
        >
          Kategori
        </Link>
        <Link
          href="/admin/units"
          className="flex-1 rounded-md bg-white px-4 py-2 text-center text-sm font-medium text-blue-700 shadow-sm"
          aria-current="page"
        >
          Satuan
        </Link>
      </nav>

      <UnitsClient initialUnits={units ?? []} />
    </div>
  )
}
