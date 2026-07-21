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
        <h1 className="text-2xl font-bold text-gray-900">Scan Ambil Barang</h1>
        <p className="mt-1 text-sm text-gray-500">
          Pindai barcode barang menggunakan kamera, scanner USB, atau cari secara manual.
        </p>
      </div>

      <ScanClient />
    </div>
  )
}
