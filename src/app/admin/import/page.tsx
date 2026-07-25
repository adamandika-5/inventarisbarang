import type { Metadata } from 'next'
import ImportClient from './import-client'

export const metadata: Metadata = {
  title: 'Impor Excel — InventarisBarang Admin',
}

export default function ImportPage() {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Impor Data Barang</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Impor data barang secara massal dari file Excel (.xlsx) atau CSV (.csv).
          Unduh template terlebih dahulu untuk memastikan format kolom yang benar.
        </p>
      </div>

      {/* Info box */}
      <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50/70 p-4 text-slate-800 dark:border-[#22D3EE]/30 dark:bg-[#0B1220] dark:text-white shadow-sm">
        <p className="font-semibold text-blue-900 dark:text-[#22D3EE]">Sebelum mengimpor:</p>
        <ul className="mt-1.5 list-inside list-disc space-y-1 text-xs text-slate-700 dark:text-slate-200">
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
