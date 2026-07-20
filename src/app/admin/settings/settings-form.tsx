'use client'

import { useState, useTransition } from 'react'
import { saveSettings } from './actions'

interface AppSettings {
  id?: string
  institution_name?: string | null
  report_header_text?: string | null
  default_barcode_label_count?: number | null
  barcode_label_layout?: string | null
}

export default function SettingsForm({ settings }: { settings: AppSettings | null }) {
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSubmit = (formData: FormData) => {
    startTransition(async () => {
      const result = await saveSettings(formData)
      if (result.success) {
        setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan.' })
        setTimeout(() => setMessage(null), 4000)
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Gagal menyimpan.' })
      }
    })
  }

  return (
    <form action={handleSubmit} className="mx-auto max-w-xl">
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <div className="card space-y-5">
        <div>
          <label htmlFor="institution-name" className="label mb-1">Nama Instansi</label>
          <input
            id="institution-name"
            name="institution_name"
            type="text"
            maxLength={200}
            defaultValue={settings?.institution_name ?? ''}
            className="input"
            placeholder="Contoh: Dinas Pendidikan Kota Bandung"
          />
          <p className="mt-1 text-xs text-gray-500">Ditampilkan di header laporan.</p>
        </div>

        <div>
          <label htmlFor="report-header" className="label mb-1">Teks Header Laporan</label>
          <textarea
            id="report-header"
            name="report_header_text"
            rows={3}
            maxLength={500}
            defaultValue={settings?.report_header_text ?? ''}
            className="input"
            placeholder="Teks tambahan untuk header laporan (opsional)"
          />
        </div>

        <div>
          <label htmlFor="barcode-label-count" className="label mb-1">
            Jumlah Label Barcode Default
          </label>
          <input
            id="barcode-label-count"
            name="default_barcode_label_count"
            type="number"
            min={1}
            max={500}
            step={1}
            defaultValue={settings?.default_barcode_label_count ?? 1}
            className="input w-32"
          />
          <p className="mt-1 text-xs text-gray-500">Nilai default saat mencetak label barcode (1–500).</p>
        </div>

        <hr className="border-gray-100" />

        <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
          <p className="font-medium text-gray-700">Nilai Tetap (Tidak Dapat Diubah)</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>Nama Aplikasi: <strong>InventarisBarang</strong></li>
            <li>Zona Waktu: <strong>Asia/Jakarta (WIB)</strong></li>
            <li>Mata Uang: <strong>IDR (Rupiah)</strong></li>
          </ul>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button id="btn-simpan-pengaturan" type="submit" className="btn-primary" disabled={isPending}>
          {isPending ? 'Menyimpan…' : 'Simpan Pengaturan'}
        </button>
      </div>
    </form>
  )
}
