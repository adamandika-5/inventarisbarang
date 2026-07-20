'use client'

/**
 * ItemsClient — list view with search/filter/pagination.
 * Navigation to item detail, add, edit via links.
 */

import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useCallback } from 'react'

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
}: ItemsClientProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

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

  const totalPages = Math.ceil(totalCount / pageSize)

  return (
    <div>
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
        <div className="card py-12 text-center text-gray-500">
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
                <th scope="col" className="text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 bg-white">
              {initialItems.map((item) => {
                const stockStatus = item.is_active
                  ? getStockStatus(item.current_stock, item.minimum_stock)
                  : 'NONAKTIF'
                const stockNum = Number(item.current_stock)
                return (
                  <tr key={item.id}>
                    <td>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono">{item.sku}</code>
                    </td>
                    <td>
                      <span className="font-medium text-gray-900">{item.name}</span>
                      <div className="text-xs text-gray-500">{item.barcode}</div>
                    </td>
                    <td className="text-sm text-gray-600">{item.categories?.name ?? '—'}</td>
                    <td className="text-sm">
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
                        <span className="text-sm text-green-700">Aktif</span>
                      ) : (
                        <span className="text-sm text-gray-500">Nonaktif</span>
                      )}
                    </td>
                    <td className="text-right">
                      <Link
                        href={`/admin/items/${item.id}`}
                        id={`btn-detail-item-${item.id}`}
                        className="btn-secondary text-sm"
                      >
                        Detail
                      </Link>
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
          <p className="text-sm text-gray-600">
            Halaman {page} dari {totalPages} ({totalCount} barang)
          </p>
          <div className="flex gap-2">
            <button
              id="btn-prev-page"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => updateFilter('page', String(page - 1))}
              disabled={page <= 1}
            >
              &laquo; Sebelumnya
            </button>
            <button
              id="btn-next-page"
              type="button"
              className="btn-secondary text-sm"
              onClick={() => updateFilter('page', String(page + 1))}
              disabled={page >= totalPages}
            >
              Berikutnya &raquo;
            </button>
          </div>
        </nav>
      )}
    </div>
  )
}
