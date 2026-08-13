'use client'

/**
 * CategoriesClient — Client component for category management.
 *
 * SECURITY: All mutations go through server actions that verify admin role.
 * Input is validated on both client (UX) and server (security boundary).
 * Uses textContent / framework-native rendering — no dangerouslySetInnerHTML.
 */

import { useState, useTransition, useRef } from 'react'
import type { Database } from '@/types/database'
import { createCategory, updateCategory, toggleCategoryActive } from './actions'

type Category = Database['public']['Tables']['categories']['Row']

interface CategoriesClientProps {
  initialCategories: Category[]
}

export default function CategoriesClient({ initialCategories }: CategoriesClientProps) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isPending, startTransition] = useTransition()
  const addFormRef = useRef<HTMLFormElement>(null)
  const editFormRef = useRef<HTMLFormElement>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleAdd = (formData: FormData) => {
    startTransition(async () => {
      const result = await createCategory(formData)
      if (result.success) {
        showMessage('success', 'Kategori berhasil dibuat.')
        setShowAddForm(false)
        addFormRef.current?.reset()
        // Reload from server — page will revalidate via revalidatePath
        window.location.reload()
      } else {
        showMessage('error', result.error ?? 'Gagal membuat kategori.')
      }
    })
  }

  const handleUpdate = (id: string, formData: FormData) => {
    startTransition(async () => {
      const result = await updateCategory(id, formData)
      if (result.success) {
        showMessage('success', 'Kategori berhasil diperbarui.')
        setEditingId(null)
        window.location.reload()
      } else {
        showMessage('error', result.error ?? 'Gagal memperbarui kategori.')
      }
    })
  }

  const handleToggle = (id: string, currentIsActive: boolean) => {
    const confirmMsg = currentIsActive
      ? 'Nonaktifkan kategori ini? Kategori yang masih digunakan tidak dapat dinonaktifkan.'
      : 'Aktifkan kembali kategori ini?'
    if (!confirm(confirmMsg)) return

    startTransition(async () => {
      const result = await toggleCategoryActive(id, currentIsActive)
      if (result.success) {
        showMessage('success', `Kategori berhasil ${currentIsActive ? 'dinonaktifkan' : 'diaktifkan'}.`)
        setCategories((prev) =>
          prev.map((c) => (c.id === id ? { ...c, is_active: !currentIsActive } : c)),
        )
      } else {
        showMessage('error', result.error ?? 'Gagal mengubah status kategori.')
      }
    })
  }

  const activeCount = categories.filter((c) => c.is_active).length
  const inactiveCount = categories.length - activeCount

  return (
    <div>
      {/* Message */}
      {message && (
        <div
          role="alert"
          className={message.type === 'success' ? 'alert-success mb-4' : 'alert-error mb-4'}
        >
          {message.text}
        </div>
      )}

      {/* Header actions */}
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            {activeCount} Aktif
          </span>
          <span className="text-slate-300 dark:text-slate-600">&middot;</span>
          <span className="inline-flex items-center gap-1.5 font-medium text-slate-500 dark:text-slate-400">
            <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600"></span>
            {inactiveCount} Nonaktif
          </span>
        </div>
        <button
          id="btn-tambah-kategori"
          type="button"
          className="btn-primary h-9 min-h-[36px] px-3.5 text-xs sm:text-sm font-medium whitespace-nowrap inline-flex items-center justify-center gap-1.5"
          onClick={() => {
            setShowAddForm(!showAddForm)
            setEditingId(null)
          }}
          disabled={isPending}
        >
          {showAddForm ? 'Batal' : '+ Tambah Kategori'}
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="card mb-4">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Tambah Kategori</h2>
          <form
            ref={addFormRef}
            action={handleAdd}
            className="flex items-end gap-3"
          >
            <div className="flex-1">
              <label htmlFor="add-name" className="label mb-1">
                Nama Kategori <span className="text-red-500">*</span>
              </label>
              <input
                id="add-name"
                name="name"
                type="text"
                required
                maxLength={100}
                placeholder="Contoh: Alat Tulis"
                className="input"
                autoFocus
              />
            </div>
            <button
              id="btn-simpan-kategori"
              type="submit"
              className="btn-primary"
              disabled={isPending}
            >
              {isPending ? 'Menyimpan…' : 'Simpan'}
            </button>
          </form>
        </div>
      )}

      {/* Category table */}
      {categories.length === 0 ? (
        <div className="rounded-xl border border-slate-200/90 bg-white p-12 text-center text-slate-500 dark:border-white/10 dark:bg-[#101D31] dark:text-slate-400">
          <p className="text-lg font-medium">Belum ada kategori</p>
          <p className="mt-1 text-sm">Klik &ldquo;Tambah Kategori&rdquo; untuk memulai.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200/90 bg-white shadow-sm dark:border-white/10 dark:bg-[#101D31]">
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[720px] table-fixed text-left text-sm" aria-label="Daftar kategori">
              <colgroup>
                <col className="w-[32%]" />
                <col className="w-[16%]" />
                <col className="w-[20%]" />
                <col className="w-[32%]" />
              </colgroup>
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 dark:border-white/10 dark:bg-[#101D31]">
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Nama Kategori</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Status</th>
                  <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Dibuat</th>
                  <th scope="col" className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">TINDAKAN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-white/5">
                {categories.map((category) => (
                  <tr key={category.id} className="transition-colors hover:bg-slate-50/80 dark:hover:bg-white/[0.03]">
                    <td className="px-4 py-3">
                      {editingId === category.id ? (
                        <form
                          ref={editFormRef}
                          action={(fd) => handleUpdate(category.id, fd)}
                          className="flex items-center gap-2"
                        >
                          <input
                            id={`edit-name-${category.id}`}
                            name="name"
                            type="text"
                            defaultValue={category.name}
                            required
                            maxLength={100}
                            className="input max-w-xs"
                            autoFocus
                          />
                          <button
                            type="submit"
                            className="btn-primary text-sm"
                            disabled={isPending}
                          >
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
                        <span className="font-medium text-slate-900 dark:text-slate-100">{category.name}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {category.is_active ? (
                        <span className="badge-aman">Aktif</span>
                      ) : (
                        <span className="badge-nonaktif">Nonaktif</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Intl.DateTimeFormat('id-ID', {
                        dateStyle: 'medium',
                        timeZone: 'Asia/Jakarta',
                      }).format(new Date(category.created_at))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="inline-flex items-center justify-center gap-2">
                        {editingId !== category.id && (
                          <button
                            id={`btn-edit-kategori-${category.id}`}
                            type="button"
                            className="btn-secondary h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap"
                            onClick={() => {
                              setEditingId(category.id)
                              setShowAddForm(false)
                            }}
                            disabled={isPending}
                          >
                            Edit
                          </button>
                        )}
                        <button
                          id={`btn-toggle-kategori-${category.id}`}
                          type="button"
                          className={
                            category.is_active
                              ? 'h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap rounded-md border border-red-200 text-red-600 dark:border-red-900/40 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors'
                              : 'h-[34px] min-h-[34px] px-3 text-xs font-medium whitespace-nowrap rounded-md border border-emerald-200 text-emerald-600 dark:border-emerald-800 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors'
                          }
                          onClick={() => handleToggle(category.id, category.is_active)}
                          disabled={isPending}
                        >
                          {category.is_active ? 'Nonaktifkan' : 'Aktifkan'}
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
