import type { Metadata } from 'next'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import BarcodePrintClient from './barcode-print-client'

export const metadata: Metadata = {
  title: 'Cetak Barcode — InventarisBarang Admin',
}

export default async function BarcodePrintPage() {
  const supabase = await createSupabaseServerClient()

  const { data: items, error } = await supabase
    .from('items')
    .select('id,sku,barcode,barcode_format,name,is_active,base_unit:units!base_unit_id(id,name,symbol)')
    .eq('is_active', true)
    .order('name')

  if (error) {
    return (
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cetak Barcode</h1>
        </div>
        <div className="alert-error">Gagal memuat data barang. Coba muat ulang halaman.</div>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Cetak Barcode</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pilih barang, tentukan jumlah salinan, lalu cetak label barcode.
        </p>
      </div>
      <BarcodePrintClient items={items ?? []} />
    </div>
  )
}
