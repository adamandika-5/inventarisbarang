import type { Metadata } from 'next'
import ImportClient from './import-client'

export const metadata: Metadata = {
  title: 'Impor Excel — InventarisBarang Admin',
}

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Impor Data Barang</h1>
        <p className="mt-1 text-sm text-gray-500">
          Impor data barang secara massal dari file Excel (.xlsx) atau CSV (.csv).
          Unduh template terlebih dahulu untuk memastikan format kolom yang benar.
        </p>
      </div>

      {/* Info box */}
      <div className="alert-info mb-6">
        <p className="font-medium">Sebelum mengimpor:</p>
        <ul className="mt-1 list-inside list-disc space-y-0.5 text-xs">
          <li>Pastikan kategori dan satuan barang sudah dibuat di sistem.</li>
          <li>Barcode harus unik dan belum ada di database.</li>
          <li>SKU biarkan kosong untuk di-generate otomatis (format ATK-XXXX).</li>
          <li>Impor bersifat all-or-nothing: satu error akan membatalkan seluruh batch.</li>
        </ul>
      </div>

      <ImportClient />
    </div>
  )
}
