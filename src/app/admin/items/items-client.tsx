'use client'

/**
 * ItemsClient — list view with search/filter/pagination.
 * Navigation to item detail, add, edit via links.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useState, useCallback, useTransition } from 'react'
import { deactivateItem, activateItem } from './actions'

interface Category {
  id: string
  name: string
}

interface Item {
  id: string
  sku: string
  barcode: string
  name: string
  current_stock: bigint | string | number
  minimum_stock: bigint | string | number
  is_active: boolean
  categories: { id: string; name: string } | null
  base_unit: { id: string; name: string; symbol: string } | null
}

interface ItemsClientProps {
  initialItems: Item[]
  totalCount: number
  page: number
  pageSize: number
  categories: Category[]
  search: string
  categoryFilter: string
  activeFilter: string
  isAdmin?: boolean
}

function getStockStatus(current: bigint | string | number, minimum: bigint | string | number) {
  const c = BigInt(current.toString())
  const m = BigInt(minimum.toString())
  if (c === 0n) return 'HABIS'
  if (c <= m) return 'HAMPIR_HABIS'
  return 'AMAN'
}

function StockBadge({ status }: { status: string }) {
  if (status === 'HABIS') return <span className="badge-habis">Habis</span>
  if (status === 'HAMPIR_HABIS') return <span className="badge-hampir-habis">Hampir Habis</span>
  return <span className="badge-aman">Aman</span>
}

export default function ItemsClient({
  initialItems,
  totalCount,
  page,
  pageSize,
  categories,
  search,
  categoryFilter,
  activeFilter,
  isAdmin = false,
}: ItemsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [deactivateTarget, setDeactivateTarget] = useState<Item | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const updateFilter = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      params.set('page', '1')
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const goToPage = useCallback(
    (targetPage: number) => {
      const params = new URLSearchParams(searchParams.toString())
      params.set('page', String(targetPage))
      router.push(`${pathname}?${params.toString()}`)
    },
    [pathname, router, searchParams],
  )

  const handleConfirmDeactivate = () => {
    if (!deactivateTarget || isPending) return
    setModalError(null)

    startTransition(async () => {
      const res = await deactivateItem(deactivateTarget.id)
      if (res.success) {
        setDeactivateTarget(null)
        setToastMsg('Barang berhasil dinonaktifkan.')
        setTimeout(() => setToastMsg(null), 4000)
        router.refresh()
      } else {
        setModalError(res.error ?? 'Gagal menonaktifkan barang.')
      }
    })
  }

  const handleActivate = (item: Item) => {
    if (isPending) return
    startTransition(async () => {
      const res = await activateItem(item.id)
      if (res.success) {
        setToastMsg('Barang berhasil diaktifkan kembali.')
        setTimeout(() => setToastMsg(null), 4000)
        router.refresh()
      } else {
        setToastMsg(res.error ?? 'Gagal mengaktifkan barang.')
        setTimeout(() => setToastMsg(null), 4000)
      }
    })
  }

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div>
      {toastMsg && (
        <div role="alert" className="alert-success mb-4 text-sm">
          {toastMsg}
        </div>
      )}

      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-3">
        <input
          id="search-barang"
          type="search"
          placeholder="Cari nama, SKU, atau barcode…"
          defaultValue={search}
          className="input max-w-sm flex-1"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              updateFilter('search', (e.target as HTMLInputElement).value)
            }
          }}
          onBlur={(e) => {
            if (e.target.value !== search) {
              updateFilter('search', e.target.value)
            }
          }}
        />
        <select
          id="filter-kategori"
          value={categoryFilter}
          className="input w-48"
          onChange={(e) => updateFilter('category', e.target.value)}
          aria-label="Filter kategori"
        >
          <option value="">Semua Kategori</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          id="filter-status-aktif"
          value={activeFilter}
          className="input w-40"
          onChange={(e) => updateFilter('active', e.target.value)}
          aria-label="Filter status aktif"
        >
          <option value="true">Aktif</option>
          <option value="false">Nonaktif</option>
          <option value="">Semua</option>
        </select>
        <button
          id="btn-reset-filter"
          type="button"
          className="btn-secondary"
          onClick={() => router.push(pathname)}
        >
          Reset Filter
        </button>
      </div>

      {/* Table */}
      {initialItems.length === 0 ? (
        <div className="card py-12 text-center text-gray-500 dark:text-slate-400">
          <p className="text-lg font-medium">Tidak ada barang</p>
          <p className="mt-1 text-sm">Coba ubah filter atau tambah barang baru.</p>
        </div>
      ) : (
        <div className="table-container">
          <table className="table" aria-label="Daftar barang">
            <thead>
              <tr>
                <th scope="col">SKU</th>
                <th scope="col">Nama Barang</th>
                <th scope="col">Kategori</th>
                <th scope="col">Stok</th>
                <th scope="col">Status Stok</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-center w-52">TINDAKAN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-slate-700">
              {initialItems.map((item) => {
                const stockStatus = item.is_active
                  ? getStockStatus(item.current_stock, item.minimum_stock)
                  : 'NONAKTIF'
                const stockNum = Number(item.current_stock)
                return (
                  <tr key={item.id}>
                    <td>
                      <code className="code-chip">{item.sku}</code>
                    </td>
                    <td>
                      <span className="font-medium text-gray-900 dark:text-slate-100">{item.name}</span>
                      <div className="text-xs text-gray-500 dark:text-slate-400">{item.barcode}</div>
                    </td>
                    <td className="text-sm text-gray-600 dark:text-slate-300">{item.categories?.name ?? '—'}</td>
                    <td className="text-sm text-gray-700 dark:text-slate-200">
                      {stockNum.toLocaleString('id-ID')} {item.base_unit?.symbol ?? ''}
                    </td>
                    <td>
                      {item.is_active ? (
                        <StockBadge status={stockStatus} />
                      ) : (
                        <span className="badge-nonaktif">Nonaktif</span>
                      )}
                    </td>
                    <td>
                      {item.is_active ? (
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">Aktif</span>
                      ) : (
                        <span className="text-sm text-gray-500 dark:text-slate-400">Nonaktif</span>
                      )}
                    </td>
                    <td className="text-center whitespace-nowrap">
                      <div className="inline-flex items-center justify-center gap-2">
                        <Link
                          href={`/admin/items/${item.id}`}
                          id={`btn-detail-item-${item.id}`}
                          className="btn-secondary min-h-[38px] h-[38px] px-3 py-1.5 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center"
                        >
                          Detail
                        </Link>
                        {isAdmin && (
                          item.is_active ? (
                            <button
                              type="button"
                              id={`btn-nonaktifkan-item-${item.id}`}
                              className="min-h-[38px] h-[38px] px-3 py-1.5 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center rounded-md border border-red-200 dark:border-red-900/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              onClick={() => {
                                setDeactivateTarget(item)
                                setModalError(null)
                              }}
                            >
                              Nonaktifkan
                            </button>
                          ) : (
                            <button
                              type="button"
                              id={`btn-aktifkan-item-${item.id}`}
                              className="min-h-[38px] h-[38px] px-3 py-1.5 text-xs font-medium whitespace-nowrap inline-flex items-center justify-center rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                              onClick={() => handleActivate(item)}
                              disabled={isPending}
                            >
                              Aktifkan Kembali
                            </button>
                          )
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="mt-4 flex items-center justify-between" aria-label="Navigasi halaman">
          <p className="text-sm text-gray-600 dark:text-slate-300">
            Halaman {page} dari {totalPages} ({totalCount} barang)
          </p>
          <div className="flex gap-2">
            <button
              id="btn-prev-page"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
            >
              &laquo; Sebelumnya
            </button>
            <button
              id="btn-next-page"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
            >
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivateTarget && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-[#17263D]">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Nonaktifkan Barang
            </h3>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Nonaktifkan <strong className="text-slate-900 dark:text-white">{deactivateTarget.name}</strong> ({deactivateTarget.sku})?
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Barang tidak akan tersedia untuk transaksi baru, tetapi data dan seluruh riwayatnya tetap tersimpan.
            </p>

            {modalError && (
              <div role="alert" className="alert-error mt-4 text-xs">
                {modalError}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  setDeactivateTarget(null)
                  setModalError(null)
                }}
                disabled={isPending}
              >
                Batal
              </button>
              <button
                type="button"
                id="btn-confirm-deactivate"
                className="rounded-md bg-red-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-500 disabled:opacity-50 transition-colors"
                onClick={handleConfirmDeactivate}
                disabled={isPending}
              >
                {isPending ? 'Memproses…' : 'Nonaktifkan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
