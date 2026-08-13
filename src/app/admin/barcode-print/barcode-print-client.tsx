'use client'

/**
 * BarcodePrintClient — UI for selecting items and printing barcode labels.
 *
 * Barcode rendering is done client-side using bwip-js (canvas-based).
 * No harga modal / cost price is shown anywhere.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { BarcodeFormat } from '@/types/database'
import { BARCODE_LABEL_WIDTH_PX, buildBarcodeRenderOptions } from '@/lib/barcode-render'

type Item = {
  id: string
  sku: string
  barcode: string
  barcode_format: BarcodeFormat
  name: string
  is_active: boolean
  base_unit: { id: string; name: string; symbol: string } | null
}

type SelectedItem = {
  item: Item
  copies: number
}

// Minimum character count required per format
const MIN_CHARS: Record<BarcodeFormat, number> = {
  EAN13: 12,
  EAN8: 7,
  UPCA: 11,
  UPCE: 6,
  CODE128: 1,
  QR: 1,
}

function isBarcodeValid(barcode: string, format: BarcodeFormat): boolean {
  if (!barcode || barcode.trim() === '') return false
  const min = MIN_CHARS[format]
  const clean = barcode.trim()
  if (['EAN13', 'EAN8', 'UPCA', 'UPCE'].includes(format)) {
    return clean.replace(/\D/g, '').length >= min
  }
  return clean.length >= min
}

// Single barcode label card with canvas rendering via bwip-js
function BarcodeLabel({ item, index }: { item: Item; index: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [renderError, setRenderError] = useState<string | null>(null)

  const renderBarcode = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    if (!isBarcodeValid(item.barcode, item.barcode_format)) {
      setRenderError('Barcode tidak valid atau kosong')
      return
    }

    // Dynamically import bwip-js browser build to avoid SSR issues
    // Use /browser subpath which exports toCanvas (HTMLCanvas-based)
    import('bwip-js/browser')
      .then((bwipjs) => {
        try {
          setRenderError(null)
          bwipjs.toCanvas(canvas, buildBarcodeRenderOptions(item.barcode, item.barcode_format))
        } catch (e) {
          setRenderError(
            'Gagal render barcode: ' + (e instanceof Error ? e.message : 'Error tidak diketahui'),
          )
        }
      })
      .catch(() => {
        setRenderError('Gagal memuat library barcode.')
      })
  }, [item.barcode, item.barcode_format])

  useEffect(() => {
    renderBarcode()
  }, [renderBarcode])

  return (
    <div
      className="barcode-label flex flex-col items-center rounded-lg border border-gray-200 bg-white p-3 text-center shadow-sm"
      data-label-index={index}
      style={{ width: BARCODE_LABEL_WIDTH_PX, minHeight: 180 }}
    >
      <p className="mb-1 w-full truncate text-xs font-semibold text-gray-800" title={item.name}>
        {item.name}
      </p>
      <p className="mb-2 text-xs text-gray-400">{item.sku}</p>
      {renderError ? (
        <div className="flex flex-1 items-center justify-center">
          <p className="text-xs text-red-500">{renderError}</p>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="block max-w-full"
          aria-label={`Barcode untuk ${item.name}`}
        />
      )}
    </div>
  )
}

interface BarcodePrintClientProps {
  items: Item[]
  defaultLabelCount?: number
}

export default function BarcodePrintClient({
  items,
  defaultLabelCount = 1,
}: BarcodePrintClientProps) {
  const [search, setSearch] = useState('')
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([])
  const [copiesInput, setCopiesInput] = useState<Record<string, string>>({})

  const filteredItems = items.filter(
    (item) =>
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.sku.toLowerCase().includes(search.toLowerCase()) ||
      item.barcode.toLowerCase().includes(search.toLowerCase()),
  )

  const isSelected = (id: string) => selectedItems.some((s) => s.item.id === id)

  const toggleItem = (item: Item) => {
    if (isSelected(item.id)) {
      setSelectedItems((prev) => prev.filter((s) => s.item.id !== item.id))
    } else {
      const initialCopies =
        defaultLabelCount >= 1 && defaultLabelCount <= 500 ? defaultLabelCount : 1
      setSelectedItems((prev) => [...prev, { item, copies: initialCopies }])
      setCopiesInput((prev) => ({ ...prev, [item.id]: String(initialCopies) }))
    }
  }

  const updateCopies = (id: string, value: string) => {
    setCopiesInput((prev) => ({ ...prev, [id]: value }))
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= 1 && num <= 100) {
      setSelectedItems((prev) => prev.map((s) => (s.item.id === id ? { ...s, copies: num } : s)))
    }
  }

  const removeItem = (id: string) => {
    setSelectedItems((prev) => prev.filter((s) => s.item.id !== id))
  }

  const handlePrint = () => {
    window.print()
  }

  // Expand selected items by copies count for the print preview area
  const printLabels = selectedItems.flatMap((s) =>
    Array.from({ length: s.copies }, (_, i) => ({ item: s.item, key: `${s.item.id}-${i}` })),
  )

  const totalLabels = printLabels.length

  return (
    <>
      {/* Print-specific styles: hide everything except barcode-print-area */}
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #barcode-print-area,
          #barcode-print-area * { visibility: visible !important; }
          #barcode-print-area {
            position: absolute !important;
            top: 0 !important;
            left: 0 !important;
            width: 100% !important;
            padding: 8mm !important;
          }
          .barcode-label {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            border: 1px solid #ddd !important;
            box-shadow: none !important;
          }
          #barcode-print-area .print-grid {
            display: flex !important;
            flex-wrap: wrap !important;
            gap: 6px !important;
          }
        }
      `}</style>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left panel: item selector */}
        <div className="card">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
            Pilih Barang
          </h2>

          <div className="mb-3">
            <input
              id="barcode-item-search"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama, SKU, atau barcode…"
              className="input"
              aria-label="Cari barang untuk dicetak barcode-nya"
            />
          </div>

          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 py-10 text-center dark:border-white/20">
              <svg
                className="mx-auto mb-2 h-10 w-10 text-slate-300 dark:text-slate-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">
                Belum ada barang aktif.
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Tambahkan barang di menu Data Barang terlebih dahulu.
              </p>
            </div>
          ) : filteredItems.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-300">
              Tidak ada barang yang cocok.
            </p>
          ) : (
            <ul
              className="max-h-96 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 dark:divide-white/10 dark:border-white/10"
              aria-label="Daftar barang"
            >
              {filteredItems.map((item) => {
                const selected = isSelected(item.id)
                const valid = isBarcodeValid(item.barcode, item.barcode_format)
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      id={`btn-select-item-${item.id}`}
                      onClick={() => toggleItem(item)}
                      disabled={!valid}
                      className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                        selected
                          ? 'bg-blue-50 text-blue-900 dark:bg-[#22D3EE]/20 dark:text-[#22D3EE]'
                          : valid
                            ? 'text-slate-800 hover:bg-slate-50 dark:text-white dark:hover:bg-[#203552]'
                            : 'cursor-not-allowed text-slate-400 opacity-60 dark:text-slate-500'
                      }`}
                      aria-pressed={selected}
                      title={
                        valid ? undefined : 'Barcode kosong atau tidak valid — tidak dapat dicetak'
                      }
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs font-bold ${
                          selected
                            ? 'border-blue-600 bg-blue-600 text-white dark:border-[#22D3EE] dark:bg-[#22D3EE] dark:text-[#0B1220]'
                            : 'border-slate-300 bg-white dark:border-white/20 dark:bg-[#0B1220]'
                        }`}
                        aria-hidden="true"
                      >
                        {selected ? '✓' : ''}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block text-xs text-slate-400 dark:text-slate-400">
                          {item.sku} · {item.barcode_format}
                          {!valid && ' · Barcode tidak valid'}
                        </span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Right panel: selected items + copy count + print button */}
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Label Dipilih
              {selectedItems.length > 0 && (
                <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">
                  ({selectedItems.length} barang, {totalLabels} label)
                </span>
              )}
            </h2>
            {selectedItems.length > 0 && (
              <button
                type="button"
                id="btn-clear-selection"
                onClick={() => setSelectedItems([])}
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
              >
                Hapus Semua
              </button>
            )}
          </div>

          {selectedItems.length === 0 ? (
            <div className="rounded-md border border-dashed border-slate-300 py-10 text-center dark:border-white/20">
              <p className="text-sm font-medium text-slate-500 dark:text-slate-300">
                Belum ada barang dipilih.
              </p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-400">
                Pilih barang dari daftar di sebelah kiri.
              </p>
            </div>
          ) : (
            <ul className="mb-4 max-h-72 space-y-2 overflow-y-auto">
              {selectedItems.map(({ item, copies }) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-[#0B1220]"
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-white">
                    {item.name}
                    <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-400">
                      {item.sku}
                    </span>
                  </span>
                  <div className="flex items-center gap-1">
                    <label htmlFor={`copies-${item.id}`} className="sr-only">
                      Jumlah salinan untuk {item.name}
                    </label>
                    <input
                      id={`copies-${item.id}`}
                      type="number"
                      min={1}
                      max={100}
                      value={copiesInput[item.id] ?? copies}
                      onChange={(e) => updateCopies(item.id, e.target.value)}
                      className="w-16 rounded border border-gray-300 px-2 py-1 text-center text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <span className="text-xs text-gray-400">×</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-gray-400 hover:text-red-500"
                    aria-label={`Hapus ${item.name} dari daftar cetak`}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            id="btn-print-barcode"
            onClick={handlePrint}
            disabled={totalLabels === 0}
            className="btn-primary w-full disabled:bg-slate-200 disabled:text-slate-400 disabled:opacity-100 dark:disabled:bg-[#203552] dark:disabled:text-[#8494ab]"
          >
            <svg
              className="mr-2 h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
              />
            </svg>
            {totalLabels > 0 ? `Cetak ${totalLabels} Label` : 'Cetak Label'}
          </button>
        </div>
      </div>

      {/* Print preview */}
      {totalLabels > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
            Preview Label ({totalLabels})
          </h2>
          <div
            id="barcode-print-area"
            className="rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-white/10 dark:bg-[#0B1220]"
          >
            <div className="print-grid flex flex-wrap gap-3">
              {printLabels.map(({ item, key }, index) => (
                <BarcodeLabel key={key} item={item} index={index} />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
