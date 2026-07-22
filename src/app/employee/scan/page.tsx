import type { Metadata } from 'next'
import ScanClient from './scan-client'

export const metadata: Metadata = {
  title: 'Scan Ambil Barang — InventarisBarang',
  description: 'Pemindaian barcode untuk pengambilan barang',
}

export default function ScanPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Scan Ambil Barang</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pindai barcode barang menggunakan kamera, scanner USB, atau cari secara manual.
        </p>
      </div>

      <ScanClient />
    </div>
  )
}
