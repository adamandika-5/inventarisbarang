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
        <h1 className="text-2xl font-bold">Kategori &amp; Satuan</h1>
        <p className="mt-1 text-sm">Kelola kategori barang dan satuan yang digunakan</p>
      </div>

      {/* Tab navigation */}
      <nav className="tab-nav mb-6" aria-label="Tab kategori dan satuan">
        <Link
          href="/admin/categories"
          className="tab-nav-item"
        >
          Kategori
        </Link>
        <Link
          href="/admin/units"
          className="tab-nav-item active"
          aria-current="page"
        >
          Satuan
        </Link>
      </nav>

      <UnitsClient initialUnits={units ?? []} />
    </div>
  )
}
