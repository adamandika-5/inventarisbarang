'use client'

/**
 * ItemDetailClient — view/edit for a single item.
 */

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { updateItem, deactivateItem, activateItem } from '../actions'

interface Category { id: string; name: string }
interface Unit { id: string; name: string; symbol: string }
interface ItemUnit {
  id: string
  conversion_factor: bigint | string | number
  is_active: boolean
  units: Unit | null
}
interface Item {
  id: string
  sku: string
  barcode: string
  barcode_format: string
  name: string
  current_stock: bigint | string | number
  minimum_stock: bigint | string | number
  is_active: boolean
  notes: string | null
  created_at: string
  updated_at: string
  categories: Category | null
  base_unit: Unit | null
  item_units: ItemUnit[]
}

const BARCODE_FORMATS = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'QR'] as const

export default function ItemDetailClient({
  item,
  categories,
  allUnits: _allUnits,
}: {
  item: Item
  categories: Category[]
  allUnits: Unit[]
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 5000)
  }

  const stockNum = Number(item.current_stock)
  const minStock = Number(item.minimum_stock)
  const stockStatus = !item.is_active
    ? 'NONAKTIF'
    : stockNum === 0
    ? 'HABIS'
    : stockNum <= minStock
    ? 'HAMPIR_HABIS'
    : 'AMAN'

  const handleUpdate = (formData: FormData) => {
    startTransition(async () => {
      const result = await updateItem(item.id, formData)
      if (result.success) {
        showMsg('success', 'Barang berhasil diperbarui.')
        setIsEditing(false)
        setTimeout(() => window.location.reload(), 1000)
      } else {
        showMsg('error', result.error ?? 'Gagal memperbarui barang.')
      }
    })
  }

  const handleDeactivate = () => {
    if (!confirm('Nonaktifkan barang ini? Barang hanya dapat dinonaktifkan jika stok = 0.')) return
    startTransition(async () => {
      const result = await deactivateItem(item.id)
      if (result.success) {
        showMsg('success', 'Barang berhasil dinonaktifkan.')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        showMsg('error', result.error ?? 'Gagal menonaktifkan barang.')
      }
    })
  }

  const handleActivate = () => {
    startTransition(async () => {
      const result = await activateItem(item.id)
      if (result.success) {
        showMsg('success', 'Barang berhasil diaktifkan.')
        setTimeout(() => window.location.reload(), 1000)
      } else {
        showMsg('error', result.error ?? 'Gagal mengaktifkan barang.')
      }
    })
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Back link */}
      <div className="mb-4">
        <Link href="/admin/items" className="text-sm text-blue-600 hover:underline">
          &larr; Kembali ke Daftar Barang
        </Link>
      </div>

      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      {/* Status + actions */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {item.is_active ? (
            stockStatus === 'HABIS' ? (
              <span className="badge-habis">Habis</span>
            ) : stockStatus === 'HAMPIR_HABIS' ? (
              <span className="badge-hampir-habis">Hampir Habis</span>
            ) : (
              <span className="badge-aman">Aman</span>
            )
          ) : (
            <span className="badge-nonaktif">Nonaktif</span>
          )}
          <span className="text-sm text-gray-500">
            Stok: {stockNum.toLocaleString('id-ID')} {item.base_unit?.symbol ?? ''}
          </span>
        </div>
        <div className="flex gap-2">
          <Link href={`/admin/stock-in?item=${item.id}`} className="btn-secondary text-sm">
            + Barang Masuk
          </Link>
          {!isEditing && (
            <button
              type="button"
              id="btn-edit-barang"
              className="btn-primary text-sm"
              onClick={() => setIsEditing(true)}
              disabled={isPending}
            >
              Edit
            </button>
          )}
          {item.is_active && stockNum === 0 && (
            <button
              type="button"
              id="btn-nonaktif-barang"
              className="btn-danger text-sm"
              onClick={handleDeactivate}
              disabled={isPending}
            >
              Nonaktifkan
            </button>
          )}
          {!item.is_active && (
            <button
              type="button"
              id="btn-aktifkan-barang"
              className="btn-primary text-sm"
              onClick={handleActivate}
              disabled={isPending}
            >
              Aktifkan
            </button>
          )}
        </div>
      </div>

      {/* Detail / Edit */}
      {isEditing ? (
        <form action={handleUpdate} className="card space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Edit Barang</h2>

          <div>
            <label htmlFor="edit-item-name" className="label mb-1">Nama Barang</label>
            <input id="edit-item-name" name="name" type="text" required maxLength={200}
              defaultValue={item.name} className="input" />
          </div>

          <div>
            <label htmlFor="edit-item-category" className="label mb-1">Kategori</label>
            <select id="edit-item-category" name="category_id" className="input">
              {categories.map((c) => (
                <option key={c.id} value={c.id} selected={c.id === item.categories?.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-item-barcode-format" className="label mb-1">Format Barcode</label>
            <select id="edit-item-barcode-format" name="barcode_format" className="input">
              {BARCODE_FORMATS.map((f) => (
                <option key={f} value={f} selected={f === item.barcode_format}>{f}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="edit-item-barcode" className="label mb-1">Barcode</label>
            <input id="edit-item-barcode" name="barcode" type="text" required maxLength={256}
              defaultValue={item.barcode} className="input font-mono" />
          </div>

          <div>
            <label htmlFor="edit-item-min-stock" className="label mb-1">Batas Minimum Stok</label>
            <input id="edit-item-min-stock" name="minimum_stock" type="number" min={0} step={1}
              defaultValue={Number(item.minimum_stock)} className="input" />
          </div>

          <div>
            <label htmlFor="edit-item-notes" className="label mb-1">Keterangan</label>
            <textarea id="edit-item-notes" name="notes" rows={3} maxLength={500}
              defaultValue={item.notes ?? ''} className="input" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" className="btn-secondary" onClick={() => setIsEditing(false)} disabled={isPending}>
              Batal
            </button>
            <button type="submit" id="btn-simpan-edit-barang" className="btn-primary" disabled={isPending}>
              {isPending ? 'Menyimpan…' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      ) : (
        <div className="card">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[
              ['Nama Barang', item.name],
              ['SKU', item.sku],
              ['Barcode', item.barcode],
              ['Format Barcode', item.barcode_format],
              ['Kategori', item.categories?.name ?? '—'],
              ['Satuan Dasar', `${item.base_unit?.name ?? '—'} (${item.base_unit?.symbol ?? '—'})`],
              ['Stok Saat Ini', `${stockNum.toLocaleString('id-ID')} ${item.base_unit?.symbol ?? ''}`],
              ['Batas Minimum', `${Number(item.minimum_stock).toLocaleString('id-ID')} ${item.base_unit?.symbol ?? ''}`],
              ['Keterangan', item.notes ?? '—'],
              ['Dibuat', new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Jakarta' }).format(new Date(item.created_at))],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-sm font-medium text-gray-500">{label}</dt>
                <dd className="mt-1 text-sm text-gray-900">{value}</dd>
              </div>
            ))}
          </dl>

          {/* Alternate units */}
          {item.item_units.length > 0 && (
            <div className="mt-6">
              <h3 className="mb-2 text-sm font-semibold text-gray-700">Satuan Alternatif</h3>
              <div className="overflow-x-auto rounded border border-gray-200">
                <table className="table">
                  <thead>
                    <tr>
                      <th scope="col">Satuan</th>
                      <th scope="col">Simbol</th>
                      <th scope="col">Faktor Konversi</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {item.item_units.map((iu) => (
                      <tr key={iu.id}>
                        <td>{iu.units?.name ?? '—'}</td>
                        <td><code className="text-xs">{iu.units?.symbol ?? '—'}</code></td>
                        <td>{Number(iu.conversion_factor).toLocaleString('id-ID')} {item.base_unit?.symbol}/{iu.units?.symbol}</td>
                        <td>{iu.is_active ? <span className="badge-aman text-xs">Aktif</span> : <span className="badge-nonaktif text-xs">Nonaktif</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
