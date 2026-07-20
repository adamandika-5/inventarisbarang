'use client'

/**
 * NewItemForm — client form to create a new item.
 * SECURITY: createItem() server action validates all inputs.
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createItem } from '../actions'

interface SelectOption {
  id: string
  name: string
  symbol?: string
}

interface NewItemFormProps {
  categories: SelectOption[]
  units: SelectOption[]
}

const BARCODE_FORMATS = [
  { value: 'CODE128', label: 'Code 128 (disarankan)' },
  { value: 'EAN13', label: 'EAN-13' },
  { value: 'EAN8', label: 'EAN-8' },
  { value: 'UPCA', label: 'UPC-A' },
  { value: 'UPCE', label: 'UPC-E' },
  { value: 'QR', label: 'QR Code' },
]

export default function NewItemForm({ categories, units }: NewItemFormProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [customSku, setCustomSku] = useState(false)
  const [barcodeFormat, setBarcodeFormat] = useState('CODE128')
  const [baseUnitId, setBaseUnitId] = useState('')

  const handleSubmit = (formData: FormData) => {
    setError(null)
    startTransition(async () => {
      const result = await createItem(formData)
      if (result.success) {
        router.push(`/admin/items?success=Barang ${result.data?.sku ?? ''} berhasil ditambahkan`)
      } else {
        setError(result.error ?? 'Gagal membuat barang.')
      }
    })
  }

  return (
    <form action={handleSubmit} className="mx-auto max-w-2xl">
      {error && (
        <div role="alert" className="alert-error mb-6">
          {error}
        </div>
      )}

      <div className="card space-y-6">
        {/* Basic info */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold text-gray-900">Informasi Dasar</legend>
          <div className="space-y-4">
            <div>
              <label htmlFor="item-name" className="label mb-1">
                Nama Barang <span className="text-red-500">*</span>
              </label>
              <input
                id="item-name"
                name="name"
                type="text"
                required
                maxLength={200}
                placeholder="Contoh: Pensil 2B"
                className="input"
                autoFocus
              />
            </div>

            <div>
              <label htmlFor="item-category" className="label mb-1">
                Kategori <span className="text-red-500">*</span>
              </label>
              <select id="item-category" name="category_id" required className="input">
                <option value="">— Pilih Kategori —</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <p className="mt-1 text-xs text-yellow-600">
                  Belum ada kategori aktif.{' '}
                  <a href="/admin/categories" className="underline">
                    Tambah kategori
                  </a>{' '}
                  terlebih dahulu.
                </p>
              )}
            </div>

            <div>
              <label htmlFor="item-base-unit" className="label mb-1">
                Satuan Dasar <span className="text-red-500">*</span>
              </label>
              <select
                id="item-base-unit"
                name="base_unit_id"
                required
                className="input"
                value={baseUnitId}
                onChange={(e) => setBaseUnitId(e.target.value)}
              >
                <option value="">— Pilih Satuan Dasar —</option>
                {units.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.symbol})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Satuan dasar tidak dapat diubah setelah barang memiliki transaksi.
              </p>
            </div>

            <div>
              <label htmlFor="item-min-stock" className="label mb-1">
                Batas Minimum Stok
              </label>
              <input
                id="item-min-stock"
                name="minimum_stock"
                type="number"
                min={0}
                step={1}
                defaultValue={0}
                className="input"
              />
              <p className="mt-1 text-xs text-gray-500">
                Stok di bawah atau sama dengan nilai ini berstatus &ldquo;Hampir Habis&rdquo;.
              </p>
            </div>
          </div>
        </fieldset>

        {/* SKU */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold text-gray-900">SKU</legend>
          <div className="flex items-start gap-3">
            <input
              type="checkbox"
              id="custom-sku-toggle"
              className="mt-1"
              checked={customSku}
              onChange={(e) => setCustomSku(e.target.checked)}
            />
            <label htmlFor="custom-sku-toggle" className="label cursor-pointer">
              Input SKU kustom (biarkan kosong untuk auto-generate)
            </label>
          </div>
          {customSku && (
            <div className="mt-3">
              <label htmlFor="item-sku" className="label mb-1">
                SKU
              </label>
              <input
                id="item-sku"
                name="sku"
                type="text"
                pattern="ATK-\d{4,}"
                placeholder="ATK-0001"
                maxLength={20}
                className="input max-w-xs font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">
                Format: ATK- diikuti minimal 4 digit. Contoh: ATK-0001
              </p>
            </div>
          )}
          {!customSku && <input type="hidden" name="sku" value="" />}
        </fieldset>

        {/* Barcode */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold text-gray-900">Barcode</legend>
          <div className="space-y-4">
            <div>
              <label htmlFor="item-barcode-format" className="label mb-1">
                Format Barcode <span className="text-red-500">*</span>
              </label>
              <select
                id="item-barcode-format"
                name="barcode_format"
                required
                className="input"
                value={barcodeFormat}
                onChange={(e) => setBarcodeFormat(e.target.value)}
              >
                {BARCODE_FORMATS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="item-barcode" className="label mb-1">
                Nilai Barcode <span className="text-red-500">*</span>
              </label>
              <input
                id="item-barcode"
                name="barcode"
                type="text"
                required
                maxLength={256}
                placeholder={barcodeFormat === 'EAN13' ? '1234567890123' : 'Nilai barcode'}
                className="input font-mono"
              />
              <p className="mt-1 text-xs text-gray-500">
                {barcodeFormat === 'EAN13' && 'Harus 13 digit angka dengan checksum yang valid.'}
                {barcodeFormat === 'EAN8' && 'Harus 8 digit angka dengan checksum yang valid.'}
                {barcodeFormat === 'UPCA' && 'Harus 12 digit angka.'}
                {barcodeFormat === 'CODE128' && 'Dapat berisi huruf, angka, dan karakter khusus.'}
                {barcodeFormat === 'QR' && 'Diperlakukan sebagai teks persis, tidak membuka URL.'}
                Whitespace di awal/akhir akan dihapus. Barang tanpa barcode pabrikan: gunakan SKU sebagai nilai.
              </p>
            </div>
          </div>
        </fieldset>

        {/* Notes */}
        <fieldset>
          <legend className="mb-4 text-base font-semibold text-gray-900">Keterangan</legend>
          <textarea
            id="item-notes"
            name="notes"
            rows={3}
            maxLength={500}
            placeholder="Keterangan tambahan (opsional)"
            className="input"
          />
        </fieldset>
      </div>

      {/* Actions */}
      <div className="mt-6 flex justify-end gap-3">
        <button
          type="button"
          className="btn-secondary"
          onClick={() => router.back()}
          disabled={isPending}
        >
          Batal
        </button>
        <button
          id="btn-simpan-barang"
          type="submit"
          className="btn-primary"
          disabled={isPending || categories.length === 0 || units.length === 0}
        >
          {isPending ? 'Menyimpan…' : 'Simpan Barang'}
        </button>
      </div>
    </form>
  )
}
