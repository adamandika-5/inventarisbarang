'use client'

/**
 * ItemSearchInput — shared component for searching items by name, SKU, or barcode.
 * Used in stock-in, adjustments, barcode print, etc.
 *
 * SECURITY: Search is done server-side via API route. Results contain no price data.
 */

import { useState, useRef, useEffect } from 'react'

interface ItemResult {
  id: string
  sku: string
  name: string
  barcode: string
  current_stock: bigint | string | number
  is_active: boolean
  base_unit: { id: string; name: string; symbol: string } | null
  item_units: {
    id: string
    conversion_factor: bigint | string | number
    is_active: boolean
    units: { id: string; name: string; symbol: string } | null
  }[]
}

interface ItemSearchInputProps {
  onSelect: (item: ItemResult) => void
  placeholder?: string
  preselected?: { id: string; name: string; sku: string } | null
  activeOnly?: boolean
}

export default function ItemSearchInput({
  onSelect,
  placeholder = 'Cari nama, SKU, atau barcode…',
  preselected,
  activeOnly = true,
}: ItemSearchInputProps) {
  const [query, setQuery] = useState(preselected ? `${preselected.name} (${preselected.sku})` : '')
  const [results, setResults] = useState<ItemResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [showDropdown, setShowDropdown] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const search = (q: string) => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    if (q.trim().length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    searchTimeout.current = setTimeout(async () => {
      setIsLoading(true)
      try {
        const params = new URLSearchParams({ q: q.trim(), active: activeOnly ? '1' : '0' })
        const res = await fetch(`/api/items/search?${params.toString()}`)
        if (!res.ok) throw new Error('Search failed')
        const data = (await res.json()) as ItemResult[]
        setResults(data)
        setShowDropdown(true)
      } catch {
        setResults([])
      } finally {
        setIsLoading(false)
      }
    }, 300)
  }

  const handleSelect = (item: ItemResult) => {
    setQuery(`${item.name} (${item.sku})`)
    setShowDropdown(false)
    setResults([])
    onSelect(item)
  }

  const handleClear = () => {
    setQuery('')
    setResults([])
    setShowDropdown(false)
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          id="item-search-input"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            search(e.target.value)
          }}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true)
          }}
          placeholder={placeholder}
          className="input pr-10"
          autoComplete="off"
          aria-label="Cari barang"
          aria-autocomplete="list"
          aria-controls="item-search-results"
        />
        {isLoading && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500">
            Memuat…
          </span>
        )}
        {!isLoading && query && (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            onClick={handleClear}
            aria-label="Hapus pencarian"
          >
            ✕
          </button>
        )}
      </div>

      {/* Dropdown — theme-aware */}
      {showDropdown && (
        <ul
          id="item-search-results"
          role="listbox"
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-white/10 dark:bg-[#17263D] dark:shadow-black/60"
          aria-label="Hasil pencarian barang"
        >
          {results.length === 0 ? (
            <li className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Tidak ada barang ditemukan.</li>
          ) : (
            results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={false}
                  className="flex w-full flex-col px-4 py-2.5 text-left transition-colors hover:bg-blue-50 dark:hover:bg-[#203552]"
                  onClick={() => handleSelect(item)}
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{item.name}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    SKU: {item.sku} · Stok: {Number(item.current_stock).toLocaleString('id-ID')}{' '}
                    {item.base_unit?.symbol}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}
