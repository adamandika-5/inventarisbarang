'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { searchItemByCode, processEmployeeStockOut } from '../actions'

interface UnitOption {
  id: string
  name: string
  symbol: string
  conversion_factor: number
}

interface ItemData {
  id: string
  sku: string
  barcode: string
  name: string
  current_stock: number
  minimum_stock: number
  base_unit_id: string
  base_unit: { id: string; name: string; symbol: string } | null
  categories: { id: string; name: string } | null
  item_units: Array<{
    id: string
    unit_id: string
    conversion_factor: number | string | bigint
    is_active: boolean
    units: { id: string; name: string; symbol: string } | null
  }>
}

export default function ScanClient() {
  const [cameraActive, setCameraActive] = useState(true)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualQuery, setManualQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null)
  const [quantity, setQuantity] = useState<string>('1')
  const [reason, setReason] = useState('')
  const [, setTorchActive] = useState(false)

  // Modals state
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [successModalData, setSuccessModalData] = useState<{
    transactionNumber: string
    quantityText: string
    newStock: number
  } | null>(null)

  const [clientRequestId, setClientRequestId] = useState<string>('')
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isCleaningUpRef = useRef<boolean>(false)
  const isProcessingScanRef = useRef<boolean>(false)
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const okButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * Centralized Camera & Torch Cleanup Function
   */
  const stopCamera = useCallback(async () => {
    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true

    try {
      const videoEl = videoRef.current
      const stream = (videoEl?.srcObject as MediaStream | null) || streamRef.current

      if (stream) {
        const videoTracks = stream.getVideoTracks()
        for (const track of videoTracks) {
          if (track.readyState === 'live') {
            try {
              await track.applyConstraints({
                advanced: [{ torch: false } as MediaTrackConstraintSet],
              })
            } catch {
              // Ignore if torch is not supported on this device/track
            }
          }
        }

        stream.getTracks().forEach((track) => {
          try {
            track.stop()
          } catch {
            // Ignore
          }
        })
      }

      if (controlsRef.current) {
        try {
          controlsRef.current.stop()
        } catch {
          // Ignore
        }
        controlsRef.current = null
      }

      if (videoEl) {
        try {
          videoEl.pause()
        } catch {
          // Ignore
        }
        videoEl.srcObject = null
      }

      streamRef.current = null
      setTorchActive(false)
      setCameraActive(false)
    } finally {
      isCleaningUpRef.current = false
    }
  }, [])

  // Tab Visibility Change Cleanup
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && cameraActive) {
        stopCamera()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [cameraActive, stopCamera])

  // Lookup item by barcode / SKU / query
  const handleCodeLookup = useCallback(async (code: string) => {
    if (!code.trim() || searchLoading) return
    setSearchLoading(true)
    setErrorMsg(null)

    const item = await searchItemByCode(code)
    setSearchLoading(false)

    if (item) {
      setSelectedItem(item as unknown as ItemData)
      if (item.base_unit) {
        setSelectedUnit({
          id: item.base_unit.id,
          name: item.base_unit.name,
          symbol: item.base_unit.symbol,
          conversion_factor: 1,
        })
      }
      setQuantity('1')
    } else {
      setErrorMsg(`Barang dengan kode "${code}" tidak ditemukan atau tidak aktif.`)
    }
  }, [searchLoading])

  // Camera Reader Initialization
  useEffect(() => {
    let isMounted = true

    async function initCamera() {
      if (!cameraActive || selectedItem || showConfirmModal || successModalData) return

      try {
        setCameraError(null)
        const codeReader = new BrowserMultiFormatReader()

        if (!videoRef.current) return

        const controls = await codeReader.decodeFromConstraints(
          { video: { facingMode: 'environment' } },
          videoRef.current,
          async (result, error) => {
            if (result && isMounted && !isProcessingScanRef.current) {
              const code = result.getText().trim()
              const now = Date.now()

              if (
                lastScannedCodeRef.current.code === code &&
                now - lastScannedCodeRef.current.time < 2000
              ) {
                return
              }

              isProcessingScanRef.current = true
              lastScannedCodeRef.current = { code, time: now }

              // Await full camera & torch cleanup BEFORE setting selectedItem
              await stopCamera()

              await handleCodeLookup(code)
              isProcessingScanRef.current = false
            }
            if (error && !(error.name === 'NotFoundException')) {
              // Ignore standard frame decoding errors
            }
          }
        )

        if (isMounted) {
          controlsRef.current = controls
          if (videoRef.current?.srcObject) {
            streamRef.current = videoRef.current.srcObject as MediaStream
          }
        } else {
          controls.stop()
        }
      } catch {
        if (isMounted) {
          setCameraError('Kamera tidak tersedia atau izin ditolak. Silakan gunakan pencarian manual di bawah.')
          setCameraActive(false)
        }
      }
    }

    initCamera()

    return () => {
      isMounted = false
      stopCamera()
    }
  }, [cameraActive, selectedItem, showConfirmModal, successModalData, handleCodeLookup, stopCamera])

  // Focus management on modal open
  useEffect(() => {
    if (showConfirmModal && cancelButtonRef.current) {
      cancelButtonRef.current.focus()
    }
  }, [showConfirmModal])

  useEffect(() => {
    if (successModalData && okButtonRef.current) {
      okButtonRef.current.focus()
    }
  }, [successModalData])

  // Keyboard Escape listener to close confirm modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showConfirmModal && !isPending) {
        setShowConfirmModal(false)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showConfirmModal, isPending])

  // Unit Options
  const unitOptions: UnitOption[] = selectedItem
    ? [
        ...(selectedItem.base_unit
          ? [
              {
                id: selectedItem.base_unit.id,
                name: selectedItem.base_unit.name,
                symbol: selectedItem.base_unit.symbol,
                conversion_factor: 1,
              },
            ]
          : []),
        ...(selectedItem.item_units || [])
          .filter((iu) => iu.is_active && iu.units)
          .map((iu) => ({
            id: iu.units!.id,
            name: iu.units!.name,
            symbol: iu.units!.symbol,
            conversion_factor: Number(iu.conversion_factor),
          })),
      ]
    : []

  // Dynamic Quantity Parsing & Validation (String -> Number evaluation on demand)
  const parsedQty = parseInt(quantity.trim(), 10)
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0
  const conversionFactor = selectedUnit?.conversion_factor ?? 1
  const baseQuantityNeeded = (isValidQty ? parsedQty : 0) * conversionFactor
  const currentStockNum = selectedItem ? Number(selectedItem.current_stock) : 0
  const estimatedRemainingStock = currentStockNum - baseQuantityNeeded
  const isStockSufficient = isValidQty && currentStockNum >= baseQuantityNeeded

  // Open confirmation modal (does NOT call RPC; validates quantity input as string first)
  const handleOpenConfirmation = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedItem || !selectedUnit) return

    const trimmed = quantity.trim()
    if (!trimmed) {
      setErrorMsg('Jumlah pengambilan tidak boleh kosong.')
      return
    }

    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num <= 0) {
      setErrorMsg('Jumlah harus berupa bilangan bulat positif.')
      return
    }

    if (!isStockSufficient) {
      setErrorMsg(`Stok tidak mencukupi. Butuh ${baseQuantityNeeded} ${selectedItem.base_unit?.symbol}, tersedia ${currentStockNum}.`)
      return
    }

    setErrorMsg(null)
    setClientRequestId(crypto.randomUUID())
    setShowConfirmModal(true)
  }

  // Confirmed: Execute RPC
  const handleConfirmSubmit = () => {
    if (!selectedItem || !selectedUnit || isPending) return

    const trimmed = quantity.trim()
    const num = parseInt(trimmed, 10)
    if (isNaN(num) || num <= 0) {
      setErrorMsg('Jumlah harus berupa bilangan bulat positif.')
      return
    }

    setErrorMsg(null)

    startTransition(async () => {
      const formData = new FormData()
      formData.set('client_request_id', clientRequestId)
      formData.set('item_id', selectedItem.id)
      formData.set('unit_id', selectedUnit.id)
      formData.set('input_quantity', String(num))
      if (reason.trim()) formData.set('reason', reason.trim())

      const result = await processEmployeeStockOut(formData)

      if (result.success) {
        setShowConfirmModal(false)
        setSuccessModalData({
          transactionNumber: result.data?.transaction_number ?? '—',
          quantityText: `${num} ${selectedUnit.symbol}`,
          newStock: result.data?.new_stock ?? 0,
        })
      } else {
        setErrorMsg(result.error ?? 'Gagal mencatat transaksi.')
      }
    })
  }

  // Handle OK on Success Modal -> Resets form & re-enables scanner
  const handleSuccessOk = () => {
    setSuccessModalData(null)
    setSelectedItem(null)
    setSelectedUnit(null)
    setQuantity('1')
    setReason('')
    setErrorMsg(null)
    setManualQuery('')
    setCameraActive(true)
  }

  const handleToggleCamera = async () => {
    if (cameraActive) {
      await stopCamera()
    } else {
      setCameraActive(true)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Error Alert Banner */}
      {errorMsg && !showConfirmModal && (
        <div role="alert" className="alert-error mb-4">
          <p className="font-semibold">{errorMsg}</p>
        </div>
      )}

      {/* Item Not Yet Selected — Scanner & Manual Lookup */}
      {!selectedItem && (
        <div className="card space-y-6">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">Pemindai Kamera</h2>
              <button
                type="button"
                onClick={handleToggleCamera}
                className="text-xs font-medium text-primary-600 hover:underline"
              >
                {cameraActive ? 'Matikan Kamera' : 'Nyalakan Kamera'}
              </button>
            </div>

            {cameraActive ? (
              <div className="relative overflow-hidden rounded-xl bg-black shadow-inner">
                <video ref={videoRef} className="h-64 w-full object-cover" playsInline muted />
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-40 w-64 rounded-lg border-2 border-dashed border-white/80 shadow-2xl" />
                </div>
                <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
                  Arahkan barcode barang ke area bingkai
                </div>
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center rounded-xl bg-gray-100 text-xs text-gray-500">
                Kamera dinonaktifkan. Gunakan pencarian manual di bawah.
              </div>
            )}

            {cameraError && <p className="mt-2 text-xs text-amber-600">{cameraError}</p>}
          </div>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-gray-200" />
            <span className="absolute bg-white px-3 text-xs font-medium text-gray-400">atau</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleCodeLookup(manualQuery)
            }}
            className="space-y-3"
          >
            <label htmlFor="manual-barcode-input" className="label">
              Cari Berdasarkan Barcode, SKU, atau Nama
            </label>
            <div className="flex gap-2">
              <input
                id="manual-barcode-input"
                type="text"
                value={manualQuery}
                onChange={(e) => setManualQuery(e.target.value)}
                placeholder="Contoh: 899123456789 atau SKU-001"
                className="input flex-1 font-mono"
                disabled={searchLoading}
              />
              <button
                id="btn-cari-barang"
                type="submit"
                className="btn-primary whitespace-nowrap"
                disabled={searchLoading || !manualQuery.trim()}
              >
                {searchLoading ? 'Mencari…' : 'Cari'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Item Selected Form */}
      {selectedItem && (
        <form onSubmit={handleOpenConfirmation} className="card space-y-6">
          <div className="flex items-start justify-between border-b border-gray-100 pb-4">
            <div>
              <span className="inline-block rounded bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800">
                BARANG DITEMUKAN
              </span>
              <h2 className="mt-1 text-xl font-bold text-gray-900">{selectedItem.name}</h2>
              <p className="font-mono text-xs text-gray-500">
                SKU: {selectedItem.sku} · Barcode: {selectedItem.barcode}
              </p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await stopCamera()
                setSelectedItem(null)
                setSelectedUnit(null)
                setCameraActive(true)
              }}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Ganti Barang
            </button>
          </div>

          <div className="rounded-lg bg-gray-50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-500">Stok Tersedia Saat Ini:</span>
              <span className="text-lg font-bold text-gray-900">
                {currentStockNum.toLocaleString('id-ID')} {selectedItem.base_unit?.symbol ?? ''}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="select-unit" className="label mb-1">
                Satuan Pengambilan <span className="text-red-500">*</span>
              </label>
              <select
                id="select-unit"
                value={selectedUnit?.id ?? ''}
                onChange={(e) => {
                  const opt = unitOptions.find((u) => u.id === e.target.value)
                  if (opt) setSelectedUnit(opt)
                }}
                className="input"
              >
                {unitOptions.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.symbol}) {u.conversion_factor > 1 ? `[x${u.conversion_factor}]` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="input-quantity" className="label mb-1">
                Jumlah <span className="text-red-500">*</span>
              </label>
              <input
                id="input-quantity"
                type="number"
                min={1}
                step={1}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="input"
                required
              />
            </div>
          </div>

          {selectedItem && !isValidQty && quantity.trim() !== '' && (
            <div role="alert" className="alert-error text-xs">
              Jumlah harus berupa bilangan bulat positif.
            </div>
          )}

          {selectedItem && isValidQty && !isStockSufficient && (
            <div role="alert" className="alert-error">
              Stok tidak mencukupi. Butuh {baseQuantityNeeded} {selectedItem.base_unit?.symbol}, tersedia {currentStockNum}.
            </div>
          )}

          <div>
            <label htmlFor="input-reason" className="label mb-1">
              Catatan / Keperluan (Opsional)
            </label>
            <textarea
              id="input-reason"
              rows={2}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Contoh: Keperluan divisi operasional"
              className="input"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={async () => {
                await stopCamera()
                setSelectedItem(null)
                setSelectedUnit(null)
                setCameraActive(true)
              }}
              className="btn-secondary"
            >
              Batal
            </button>
            <button
              id="btn-simpan-ambil-barang"
              type="submit"
              className="btn-primary"
              disabled={!isValidQty || !isStockSufficient}
            >
              Simpan
            </button>
          </div>
        </form>
      )}

      {/* CONFIRMATION MODAL */}
      {showConfirmModal && selectedItem && selectedUnit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="confirm-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md card space-y-4 shadow-2xl">
            <h3 id="confirm-modal-title" className="text-lg font-bold text-gray-900">
              Konfirmasi Pengambilan
            </h3>

            <p className="text-sm text-gray-700">
              Yakin ingin mengambil <strong>{quantity} {selectedUnit.symbol} {selectedItem.name}</strong>?
            </p>

            <div className="rounded-lg bg-gray-50 p-3 text-xs space-y-1 text-gray-600">
              <div className="flex justify-between">
                <span>Stok saat ini:</span>
                <span className="font-semibold text-gray-900">{currentStockNum} {selectedItem.base_unit?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span>Perkiraan sisa stok:</span>
                <span className={`font-semibold ${estimatedRemainingStock < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {estimatedRemainingStock} {selectedItem.base_unit?.symbol}
                </span>
              </div>
            </div>

            {errorMsg && (
              <div role="alert" className="alert-error text-xs">
                {errorMsg}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button
                ref={cancelButtonRef}
                id="btn-batal-konfirmasi"
                type="button"
                className="btn-secondary"
                disabled={isPending}
                onClick={() => {
                  setShowConfirmModal(false)
                  setErrorMsg(null)
                }}
              >
                Batal
              </button>
              <button
                id="btn-ya-simpan"
                type="button"
                className="btn-primary"
                disabled={isPending}
                onClick={handleConfirmSubmit}
              >
                {isPending ? 'Menyimpan...' : 'Ya, Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SUCCESS NOTIFICATION MODAL */}
      {successModalData && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="success-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md card space-y-4 text-center shadow-2xl">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h3 id="success-modal-title" className="text-lg font-bold text-gray-900">
              Berhasil Disimpan
            </h3>

            <p className="text-sm text-gray-600">
              Pengambilan barang berhasil dicatat.
            </p>

            <div className="rounded-lg bg-gray-50 p-3 text-xs space-y-1 text-left text-gray-700">
              <div className="flex justify-between">
                <span>No. Transaksi:</span>
                <span className="font-mono font-bold text-gray-900">{successModalData.transactionNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Jumlah Diambil:</span>
                <span className="font-semibold text-gray-900">{successModalData.quantityText}</span>
              </div>
              <div className="flex justify-between">
                <span>Sisa Stok Terbaru:</span>
                <span className="font-bold text-emerald-700">{successModalData.newStock}</span>
              </div>
            </div>

            <div className="pt-2">
              <button
                ref={okButtonRef}
                id="btn-ok-berhasil"
                type="button"
                className="btn-primary w-full"
                onClick={handleSuccessOk}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
