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

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            {activeCount} Aktif
          </span>
          <span className="text-slate-300 dark:text-slate-600">&middot;</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
            {units.length - activeCount} Nonaktif
          </span>
        </div>
        <button
          id="btn-tambah-satuan"
          type="button"
          className="btn-primary h-9 min-h-[36px] px-3.5 text-xs sm:text-sm font-medium whitespace-nowrap inline-flex items-center justify-center gap-1.5"
          onClick={() => { setShowAddForm(!showAddForm); setEditingId(null) }}
          disabled={isPending}
        >
          {showAddForm ? 'Batal' : '+ Tambah Satuan'}
        </button>
      </div>

      {showAddForm && (
        <div className="card mb-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Tambah Satuan</h2>
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
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center text-slate-500 dark:border-white/10 dark:bg-[#101D31] dark:text-slate-400">
          <p className="text-lg font-medium">Belum ada satuan</p>
          <p className="mt-1 text-sm">Klik &ldquo;Tambah Satuan&rdquo; untuk memulai.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#101D31]">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm" aria-label="Daftar satuan">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-[#101D31]">
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nama Satuan</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Simbol</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                  <th scope="col" className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {units.map((unit) => (
                  <tr key={unit.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
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
                        <span className="font-medium text-slate-900 dark:text-slate-100">{unit.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {editingId === unit.id ? null : (
                        <code className="code-chip">
                          {unit.symbol}
                        </code>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {unit.is_active ? (
                        <span className="badge-aman">Aktif</span>
                      ) : (
                        <span className="badge-nonaktif">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center justify-end gap-2">
                        {editingId !== unit.id && (
                          <button
                            id={`btn-edit-satuan-${unit.id}`}
                            type="button"
                            className="btn-secondary h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap"
                            onClick={() => { setEditingId(unit.id); setShowAddForm(false) }}
                            disabled={isPending}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          id={`btn-toggle-satuan-${unit.id}`}
                          type="button"
                          className={
                            unit.is_active
                              ? 'h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap rounded-md border border-red-200 text-red-600 dark:border-red-900/40 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'
                              : 'h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap rounded-md border border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors'
                          }
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
        </div>
      )}
    </div>
  )
}
