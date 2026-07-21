'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ItemRow {
  id: string
  sku: string
  barcode: string
  name: string
  current_stock: bigint | string | number
  minimum_stock: bigint | string | number
  is_active: boolean
  base_unit: { name: string; symbol: string } | null
  categories: { name: string } | null
}

export default function EmployeeItemsClient({
  initialItems,
  initialQuery,
}: {
  initialItems: ItemRow[]
  initialQuery: string
}) {
  const router = useRouter()
  const [query, setQuery] = useState(initialQuery)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (query.trim()) params.set('q', query.trim())
    router.push(`/employee/items?${params.toString()}`)
  }

  return (
    <div className="space-y-6">
      {/* Search Input */}
      <form onSubmit={handleSearch} className="card flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Cari berdasarkan nama, SKU, atau barcode…"
          className="input flex-1"
        />
        <button id="btn-search-stock" type="submit" className="btn-primary">
          Cari
        </button>
      </form>

      {/* Items Grid / List */}
      {initialItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {initialItems.map((item) => {
            const stock = Number(item.current_stock)
            const minStock = Number(item.minimum_stock)
            const isLow = stock <= minStock

            return (
              <div key={item.id} className="card flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span className="inline-block rounded bg-gray-100 px-2 py-0.5 text-xs font-semibold text-gray-700">
                      {item.categories?.name ?? 'Tanpa Kategori'}
                    </span>
                    {isLow && (
                      <span className="inline-block rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                        Stok Rendah
                      </span>
                    )}
                  </div>
                  <h3 className="mt-2 text-base font-bold text-gray-900">{item.name}</h3>
                  <p className="font-mono text-xs text-gray-500">
                    SKU: {item.sku} · Barcode: {item.barcode}
                  </p>
                </div>

                <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">Stok Tersedia:</span>
                  <span className={`text-base font-bold ${isLow ? 'text-amber-600' : 'text-gray-900'}`}>
                    {stock.toLocaleString('id-ID')} {item.base_unit?.symbol ?? ''}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="card py-12 text-center text-sm text-gray-500">
          Tidak ada barang yang cocok dengan pencarian &quot;{query}&quot;.
        </div>
      )}
    </div>
  )
}
