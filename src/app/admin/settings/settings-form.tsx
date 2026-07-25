'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { saveSettings } from './actions'

interface AppSettings {
  id?: string
  institution_name?: string | null
  report_header_text?: string | null
  default_barcode_label_count?: number | null
  barcode_label_layout?: string | null
}

export default function SettingsForm({ settings }: { settings: AppSettings | null }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Controlled form state to preserve typed values if submission fails
  const [institutionName, setInstitutionName] = useState(settings?.institution_name ?? '')
  const [reportHeaderText, setReportHeaderText] = useState(settings?.report_header_text ?? '')
  const [defaultBarcodeLabelCount, setDefaultBarcodeLabelCount] = useState(
    String(settings?.default_barcode_label_count ?? 1),
  )

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setMessage(null)

    const formData = new FormData()
    formData.set('institution_name', institutionName)
    formData.set('report_header_text', reportHeaderText)
    formData.set('default_barcode_label_count', defaultBarcodeLabelCount)

    startTransition(async () => {
      const result = await saveSettings(formData)
      if (result.success) {
        setMessage({ type: 'success', text: 'Pengaturan berhasil disimpan.' })
        router.refresh()
        setTimeout(() => setMessage(null), 4000)
      } else {
        setMessage({ type: 'error', text: result.error ?? 'Gagal menyimpan pengaturan.' })
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl">
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <div className="card space-y-5">
        <div>
          <label htmlFor="institution-name" className="label mb-1">
            Nama Instansi
          </label>
          <input
            id="institution-name"
            name="institution_name"
            type="text"
            maxLength={200}
            value={institutionName}
            onChange={(e) => setInstitutionName(e.target.value)}
            className="input w-full"
            placeholder="Contoh: Universitas Pesantren Tinggi Darul Ulum Jombang"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ditampilkan di header laporan.</p>
        </div>

        <div>
          <label htmlFor="report-header" className="label mb-1">
            Teks Header Laporan
          </label>
          <textarea
            id="report-header"
            name="report_header_text"
            rows={3}
            maxLength={500}
            value={reportHeaderText}
            onChange={(e) => setReportHeaderText(e.target.value)}
            className="input w-full"
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
            value={defaultBarcodeLabelCount}
            onChange={(e) => setDefaultBarcodeLabelCount(e.target.value)}
            className="input w-32"
          />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Nilai default saat mencetak label barcode (1–500).
          </p>
        </div>

        <hr className="border-slate-100 dark:border-white/10" />

        <div className="rounded-md bg-slate-50 border border-slate-200 dark:bg-[#0B1220] dark:border-white/10 p-3 text-sm text-slate-600 dark:text-slate-300">
          <p className="font-medium text-slate-700 dark:text-white">Nilai Tetap (Tidak Dapat Diubah)</p>
          <ul className="mt-2 space-y-1 text-xs">
            <li>
              Nama Aplikasi: <strong>InventarisBarang</strong>
            </li>
            <li>
              Zona Waktu: <strong>Asia/Jakarta (WIB)</strong>
            </li>
            <li>
              Mata Uang: <strong>IDR (Rupiah)</strong>
            </li>
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

