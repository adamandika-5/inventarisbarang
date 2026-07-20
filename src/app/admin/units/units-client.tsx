'use client'

/**
 * UnitsClient — Client component for unit management.
 */

import { useState, useTransition } from 'react'
import type { Database } from '@/types/database'
import { createUnit, updateUnit, toggleUnitActive } from './actions'

type Unit = Database['public']['Tables']['units']['Row']

interface UnitsClientProps {
  initialUnits: Unit[]
}

export default function UnitsClient({ initialUnits }: UnitsClientProps) {
  const [units, setUnits] = useState<Unit[]>(initialUnits)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleAdd = (formData: FormData) => {
    startTransition(async () => {
      const result = await createUnit(formData)
      if (result.success) {
        showMessage('success', 'Satuan berhasil dibuat.')
        setShowAddForm(false)
        window.location.reload()
      } else {
        showMessage('error', result.error ?? 'Gagal membuat satuan.')
      }
    })
  }

  const handleUpdate = (id: string, formData: FormData) => {
    startTransition(async () => {
      const result = await updateUnit(id, formData)
      if (result.success) {
        showMessage('success', 'Satuan berhasil diperbarui.')
        setEditingId(null)
        window.location.reload()
      } else {
        showMessage('error', result.error ?? 'Gagal memperbarui satuan.')
      }
    })
  }

  const handleToggle = (id: string, currentIsActive: boolean) => {
    const msg = currentIsActive ? 'Nonaktifkan satuan ini?' : 'Aktifkan kembali satuan ini?'
    if (!confirm(msg)) return

    startTransition(async () => {
      const result = await toggleUnitActive(id, currentIsActive)
      if (result.success) {
        showMessage('success', `Satuan berhasil ${currentIsActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
        setUnits((prev) => prev.map((u) => (u.id === id ? { ...u, is_active: !currentIsActive } : u)))
      } else {
        showMessage('error', result.error ?? 'Gagal mengubah status satuan.')
      }
    })
  }

  const activeCount = units.filter((u) => u.is_active).length

  return (
    <div>
      {message && (
        <div role="alert" className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}>
          {message.text}
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-600">
          {activeCount} aktif &middot; {units.length - activeCount} nonaktif
        </p>
        <button
          id="btn-tambah-satuan"
          type="button"
          className="btn-primary"
          onClick={() => { setShowAddForm(!showAddForm); setEditingId(null) }}
          disabled={isPending}
        >
          {showAddForm ? 'Batal' : '+ Tambah Satuan'}
        </button>
      </div>

      {showAddForm && (
        <div className="card mb-4">
          <h2 className="mb-3 text-base font-semibold text-gray-900">Tambah Satuan</h2>
          <form action={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-36">
              <label htmlFor="add-unit-name" className="label mb-1">
                Nama Satuan <span className="text-red-500">*</span>
              </label>
              <input
                id="add-unit-name"
                name="name"
                type="text"
                required
                maxLength={50}
                placeholder="Contoh: Kotak"
                className="input"
                autoFocus
              />
            </div>
            <div className="w-32">
              <label htmlFor="add-unit-symbol" className="label mb-1">
                Simbol <span className="text-red-500">*</span>
              </label>
              <input
                id="add-unit-symbol"
                name="symbol"
                type="text"
                required
                maxLength={20}
                placeholder="Contoh: ktk"
                className="input"
              />
            </div>
            <button type="submit" className="btn-primary" disabled={isPending}>
              {isPending ? 'Menyimpan…' : 'Simpan'}
            </button>
          </form>
        </div>
      )}

      {units.length === 0 ? (
        <div className="card py-12 text-center text-gray-500">
          <p className="text-lg font-medium">Belum ada satuan</p>
          <p className="mt-1 text-sm">Klik &ldquo;Tambah Satuan&rdquo; untuk memulai.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Daftar satuan">
            <thead>
              <tr>
                <th scope="col">Nama Satuan</th>
                <th scope="col">Simbol</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {units.map((unit) => (
                <tr key={unit.id}>
                  <td>
                    {editingId === unit.id ? (
                      <form
                        action={(fd) => handleUpdate(unit.id, fd)}
                        className="flex items-center gap-2"
                      >
                        <input
                          id={`edit-unit-name-${unit.id}`}
                          name="name"
                          type="text"
                          defaultValue={unit.name}
                          required
                          maxLength={50}
                          className="input max-w-xs"
                          autoFocus
                        />
                        <input
                          id={`edit-unit-symbol-${unit.id}`}
                          name="symbol"
                          type="text"
                          defaultValue={unit.symbol}
                          required
                          maxLength={20}
                          className="input w-24"
                        />
                        <button type="submit" className="btn-primary text-sm" disabled={isPending}>
                          {isPending ? '…' : 'Simpan'}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => setEditingId(null)}
                          disabled={isPending}
                        >
                          Batal
                        </button>
                      </form>
                    ) : (
                      <span className="font-medium text-gray-900">{unit.name}</span>
                    )}
                  </td>
                  <td>
                    {editingId === unit.id ? null : (
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-sm font-mono text-gray-700">
                        {unit.symbol}
                      </code>
                    )}
                  </td>
                  <td>
                    {unit.is_active ? (
                      <span className="badge-aman">Aktif</span>
                    ) : (
                      <span className="badge-nonaktif">Nonaktif</span>
                    )}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      {editingId !== unit.id && (
                        <button
                          id={`btn-edit-satuan-${unit.id}`}
                          type="button"
                          className="btn-secondary text-sm"
                          onClick={() => { setEditingId(unit.id); setShowAddForm(false) }}
                          disabled={isPending}
                        >
                          Edit
                        </button>
                      )}
                      <button
                        id={`btn-toggle-satuan-${unit.id}`}
                        type="button"
                        className={unit.is_active ? 'btn-ghost text-sm text-red-600' : 'btn-ghost text-sm text-green-600'}
                        onClick={() => handleToggle(unit.id, unit.is_active)}
                        disabled={isPending}
                      >
                        {unit.is_active ? 'Nonaktifkan' : 'Aktifkan'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
