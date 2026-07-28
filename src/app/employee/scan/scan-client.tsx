'use client'

import { useState, useEffect, useRef, useTransition, useCallback } from 'react'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { searchItemByCode, processEmployeeStockOut } from '../actions'
import scanSuccessFeedback from '@/lib/scan-success-feedback'

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

/**
 * Safely check if a MediaStreamTrack supports continuous focusMode
 */
export function checkTrackFocusModeCapability(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || track.readyState !== 'live') return false
  if (typeof track.getCapabilities !== 'function') return false
  try {
    const caps = track.getCapabilities() as { focusMode?: string[] }
    return Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')
  } catch {
    return false
  }
}

/**
 * Safely apply continuous focusMode constraint wrapped in try/catch to ensure camera scanning stability
 */
export async function safeApplyContinuousFocus(
  stream: MediaStream | null
): Promise<boolean> {
  if (!stream) return false
  const videoTracks = stream.getVideoTracks()
  let success = false

  for (const track of videoTracks) {
    if (track.readyState === 'live' && typeof track.getCapabilities === 'function') {
      try {
        const caps = track.getCapabilities() as { focusMode?: string[] }
        if (Array.isArray(caps?.focusMode) && caps.focusMode.includes('continuous')) {
          await track.applyConstraints({
            advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet],
          })
          success = true
        }
      } catch (err) {
        console.warn('Focus mode constraint application failed non-fatally:', err)
        success = false
      }
    }
  }

  return success
}

/**
 * Safely check if a MediaStreamTrack supports torch/flash
 */
export function checkTrackTorchCapability(track: MediaStreamTrack | null | undefined): boolean {
  if (!track || track.readyState !== 'live') return false
  if (typeof track.getCapabilities !== 'function') return false
  try {
    const caps = track.getCapabilities() as { torch?: boolean }
    return !!caps?.torch
  } catch {
    return false
  }
}

/**
 * Safely apply torch constraint wrapped in try/catch to catch UnknownError "setPhotoOptions failed"
 */
export async function safeApplyTorchConstraint(
  stream: MediaStream | null,
  enable: boolean
): Promise<boolean> {
  if (!stream) return false
  const videoTracks = stream.getVideoTracks()
  let success = false

  for (const track of videoTracks) {
    if (track.readyState === 'live' && typeof track.getCapabilities === 'function') {
      try {
        const caps = track.getCapabilities() as { torch?: boolean }
        if (caps?.torch) {
          await track.applyConstraints({
            advanced: [{ torch: enable } as MediaTrackConstraintSet],
          })
          success = true
        }
      } catch (err) {
        console.warn('Torch constraint application failed non-fatally:', err)
        success = false
      }
    }
  }

  return success
}

export type CameraStatus = 'idle' | 'starting' | 'running' | 'error'

export default function ScanClient() {
  const [userCameraEnabled, setUserCameraEnabled] = useState(true)
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>('idle')
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [manualQuery, setManualQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [selectedItem, setSelectedItem] = useState<ItemData | null>(null)
  const [selectedUnit, setSelectedUnit] = useState<UnitOption | null>(null)
  const [quantity, setQuantity] = useState<string>('1')
  const [reason, setReason] = useState('')
  const [torchSupported, setTorchSupported] = useState(false)
  const [torchActive, setTorchActive] = useState(false)

  // Sound feedback toggle state
  const [soundEnabled, setSoundEnabled] = useState(true)

  // Single scan success feedback toast state
  const [scanToast, setScanToast] = useState<string | null>(null)

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
  const activeSessionIdRef = useRef<number>(0)
  const controlsRef = useRef<{ stop: () => void } | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const isCleaningUpRef = useRef<boolean>(false)
  const isTogglingTorchRef = useRef<boolean>(false)
  const isProcessingScanRef = useRef<boolean>(false)
  const lastScannedCodeRef = useRef<{ code: string; time: number }>({ code: '', time: 0 })
  const scanFeedbackRef = useRef(scanSuccessFeedback)
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const okButtonRef = useRef<HTMLButtonElement>(null)

  /**
   * Reset session helper to re-enable vibration and scan callback processing
   */
  const resetScanSession = useCallback(() => {
    scanFeedbackRef.current?.resetSession()
    isProcessingScanRef.current = false
    lastScannedCodeRef.current = { code: '', time: 0 }
  }, [])

  /**
   * Centralized Camera & Torch Cleanup Function with session token validation
   */
  const stopCamera = useCallback(async (targetSessionId?: number) => {
    if (targetSessionId !== undefined && targetSessionId !== activeSessionIdRef.current) {
      return
    }

    activeSessionIdRef.current += 1

    if (isCleaningUpRef.current) return
    isCleaningUpRef.current = true

    try {
      if (controlsRef.current) {
        try {
          controlsRef.current.stop()
        } catch {
          // Ignore
        }
        controlsRef.current = null
      }

      const videoEl = videoRef.current
      const stream = (videoEl?.srcObject as MediaStream | null) || streamRef.current

      if (stream) {
        const videoTracks = stream.getVideoTracks()
        for (const track of videoTracks) {
          if (track.readyState === 'live' && typeof track.getCapabilities === 'function') {
            try {
              const caps = track.getCapabilities() as { torch?: boolean }
              if (caps?.torch) {
                await track.applyConstraints({
                  advanced: [{ torch: false } as MediaTrackConstraintSet],
                })
              }
            } catch (err) {
              console.warn('Torch cleanup error ignored non-fatally:', err)
            }
          }
        }

        stream.getTracks().forEach((track) => {
          try {
            if (track.readyState !== 'ended') {
              track.stop()
            }
          } catch {
            // Ignore
          }
        })
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
      setTorchSupported(false)
      setCameraStatus('idle')
    } finally {
      isCleaningUpRef.current = false
    }
  }, [])

  // Lookup item by barcode / SKU / query
  const handleCodeLookup = useCallback(async (code: string) => {
    if (!code.trim() || searchLoading) return
    setSearchLoading(true)
    setErrorMsg(null)
    setScanToast(null)

    const res = await searchItemByCode(code)
    setSearchLoading(false)

    const item = res && 'item' in res ? res.item : (res as unknown as ItemData | null)
    const err = res && 'error' in res ? res.error : null

    if (err) {
      setErrorMsg(err)
      return
    }

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
      setScanToast(`Barang ditemukan: ${item.name}`)

      // Execute feedback immediately when item is found (sound + vibration [200, 80, 200] + banner)
      scanFeedbackRef.current?.triggerSuccessFeedback({
        soundEnabled,
        vibrateDuration: [200, 80, 200],
      })
    } else {
      setErrorMsg(`Barang dengan kode "${code}" tidak ditemukan atau tidak aktif.`)
    }
  }, [searchLoading, soundEnabled])

  /**
   * Unified Single-Path Camera Startup with session generation token & frame readiness verification
   */
  const startCamera = useCallback(async () => {
    activeSessionIdRef.current += 1
    const sessionId = activeSessionIdRef.current
    const t0 = performance.now()

    setCameraStatus('starting')
    setCameraError(null)

    try {
      if (!videoRef.current) {
        await new Promise((r) => requestAnimationFrame(r))
      }

      const videoEl = videoRef.current
      if (!videoEl || sessionId !== activeSessionIdRef.current) {
        if (sessionId === activeSessionIdRef.current) setCameraStatus('idle')
        return
      }

      if (controlsRef.current) {
        try {
          controlsRef.current.stop()
        } catch {
          // Ignore
        }
        controlsRef.current = null
      }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try {
            if (t.readyState !== 'ended') t.stop()
          } catch {}
        })
        streamRef.current = null
      }

      // Step A: Fast MediaStream acquisition using navigator.mediaDevices.getUserMedia
      const tGUMStart = performance.now()
      console.warn(`[CameraPerf ${tGUMStart.toFixed(1)}ms] getUserMedia() starting`)

      const constraints: MediaStreamConstraints = {
        audio: false,
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      const tGUMDone = performance.now()
      console.warn(`[CameraPerf ${tGUMDone.toFixed(1)}ms] getUserMedia() acquired in ${(tGUMDone - tGUMStart).toFixed(1)}ms`)

      if (sessionId !== activeSessionIdRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }

      streamRef.current = stream
      videoEl.srcObject = stream

      // Step B: Immediate video play & metadata readiness
      const tPlayStart = performance.now()
      if (videoEl.paused) {
        try {
          await videoEl.play()
        } catch (playErr) {
          console.warn('video.play() failed non-fatally:', playErr)
        }
      }
      const tPlayDone = performance.now()
      console.warn(`[CameraPerf ${tPlayDone.toFixed(1)}ms] video.play() finished in ${(tPlayDone - tPlayStart).toFixed(1)}ms`)

      if (sessionId !== activeSessionIdRef.current) {
        stream.getTracks().forEach((t) => t.stop())
        videoEl.srcObject = null
        return
      }

      // Step C: Apply continuous focus mode safely AFTER video starts playing & BEFORE ZXing decoder attachment
      await safeApplyContinuousFocus(stream).catch((focusErr) => {
        console.warn('Continuous focus application caught non-fatally:', focusErr)
      })

      // Step D: Set UI state to running immediately so camera preview appears in < 1-2s!
      const videoTrack = stream.getVideoTracks()[0]
      const hasTorch = checkTrackTorchCapability(videoTrack)
      setTorchSupported(hasTorch)
      setTorchActive(false)
      setCameraStatus('running')

      const tRunning = performance.now()
      console.warn(`[CameraPerf ${tRunning.toFixed(1)}ms] Camera preview LIVE in ${(tRunning - t0).toFixed(1)}ms total!`)

      // Step D: Attach ZXing decoder to already playing video element in background (non-blocking)
      const tDecoderStart = performance.now()
      const codeReader = new BrowserMultiFormatReader()

      const controls = await codeReader.decodeFromVideoElement(
        videoEl,
        async (result, error) => {
          if (result && sessionId === activeSessionIdRef.current && !isProcessingScanRef.current) {
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

            handleCodeLookup(code)
            await stopCamera(sessionId)
            isProcessingScanRef.current = false
          }
          if (error && !(error.name === 'NotFoundException')) {
            // Ignore standard frame decoding errors
          }
        }
      )

      const tDecoderDone = performance.now()
      console.warn(`[CameraPerf ${tDecoderDone.toFixed(1)}ms] ZXing decoder attached in ${(tDecoderDone - tDecoderStart).toFixed(1)}ms`)

      if (sessionId !== activeSessionIdRef.current) {
        controls.stop()
      } else {
        controlsRef.current = controls
      }
    } catch (err: unknown) {
      if (sessionId === activeSessionIdRef.current) {
        const errObj = err as Error
        console.error('Camera startup error:', errObj?.name, errObj?.message || err)
        const msg =
          errObj?.name === 'NotAllowedError' || errObj?.name === 'PermissionDeniedError'
            ? 'Izin kamera ditolak oleh pengguna/browser.'
            : errObj?.name === 'NotReadableError' || errObj?.name === 'TrackStartError'
            ? 'Kamera sedang digunakan oleh aplikasi lain atau tidak dapat diakses.'
            : 'Kamera tidak dapat diaktifkan. Silakan gunakan pencarian manual.'

        setCameraError(msg)
        setCameraStatus('error')
        await stopCamera(sessionId)
      }
    }
  }, [stopCamera, handleCodeLookup])

  // Single Reactive Camera Lifecycle Effect
  useEffect(() => {
    if (userCameraEnabled && !selectedItem && !showConfirmModal && !successModalData) {
      startCamera()
    } else {
      stopCamera()
    }

    return () => {
      stopCamera()
    }
  }, [userCameraEnabled, selectedItem, showConfirmModal, successModalData, startCamera, stopCamera])

  // Toggle Torch/Flash Handler
  const handleToggleFlash = async () => {
    scanFeedbackRef.current?.prepareAudio()
    if (isTogglingTorchRef.current || isCleaningUpRef.current || cameraStatus !== 'running' || !torchSupported) return
    isTogglingTorchRef.current = true

    try {
      const stream = streamRef.current || (videoRef.current?.srcObject as MediaStream | null)
      if (!stream) return

      const nextState = !torchActive
      const applied = await safeApplyTorchConstraint(stream, nextState)

      if (applied) {
        setTorchActive(nextState)
      } else {
        setTorchActive(false)
        setTorchSupported(false)
        setCameraError('Flash tidak tersedia pada perangkat ini')
      }
    } finally {
      isTogglingTorchRef.current = false
    }
  }

  // Tab Visibility Change Listener
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopCamera()
      } else if (document.visibilityState === 'visible' && userCameraEnabled && !selectedItem && !showConfirmModal && !successModalData) {
        startCamera()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [userCameraEnabled, selectedItem, showConfirmModal, successModalData, startCamera, stopCamera])

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

  // Dynamic Quantity Parsing & Validation
  const parsedQty = parseInt(quantity.trim(), 10)
  const isValidQty = !isNaN(parsedQty) && parsedQty > 0
  const conversionFactor = selectedUnit?.conversion_factor ?? 1
  const baseQuantityNeeded = (isValidQty ? parsedQty : 0) * conversionFactor
  const currentStockNum = selectedItem ? Number(selectedItem.current_stock) : 0
  const estimatedRemainingStock = currentStockNum - baseQuantityNeeded
  const isStockSufficient = isValidQty && currentStockNum >= baseQuantityNeeded

  // Open confirmation modal (does NOT call RPC)
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

  // Handle OK on Success Modal -> Resets form & session & re-enables scanner
  const handleSuccessOk = () => {
    resetScanSession()
    setSuccessModalData(null)
    setSelectedItem(null)
    setSelectedUnit(null)
    setQuantity('1')
    setReason('')
    setErrorMsg(null)
    setScanToast(null)
    setManualQuery('')
    setUserCameraEnabled(true)
  }

  // Reset session when "Nyalakan Kamera" or "Scan Lagi" (Ganti Barang) is clicked
  const handleResetSessionAndCamera = async () => {
    resetScanSession()
    await stopCamera()
    setSelectedItem(null)
    setSelectedUnit(null)
    setQuantity('1')
    setReason('')
    setErrorMsg(null)
    setScanToast(null)
    setManualQuery('')
    setUserCameraEnabled(true)
  }

  const handleToggleCamera = async () => {
    resetScanSession()
    if (cameraStatus === 'running' || cameraStatus === 'starting' || userCameraEnabled) {
      setUserCameraEnabled(false)
      await stopCamera()
    } else {
      setUserCameraEnabled(true)
      await startCamera()
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
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Pemindai Kamera</h2>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setSoundEnabled((prev) => !prev)}
                  className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  aria-label={soundEnabled ? 'Matikan suara feedback' : 'Aktifkan suara feedback'}
                >
                  {soundEnabled ? '🔔 Suara: Aktif' : '🔕 Suara: Nonaktif'}
                </button>

                {cameraStatus === 'running' && torchSupported && (
                  <button
                    type="button"
                    onClick={handleToggleFlash}
                    disabled={isTogglingTorchRef.current}
                    className="text-xs font-medium text-amber-600 hover:underline disabled:opacity-50"
                  >
                    {torchActive ? 'Matikan Flash' : 'Nyalakan Flash'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleToggleCamera}
                  disabled={cameraStatus === 'starting'}
                  className="text-xs font-medium text-primary-600 hover:underline disabled:opacity-50"
                >
                  {cameraStatus === 'starting'
                    ? '⏳ Menyiapkan...'
                    : cameraStatus === 'running'
                    ? 'Matikan Kamera'
                    : 'Nyalakan Kamera'}
                </button>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-xl bg-black shadow-inner min-h-[16rem]">
              <video
                ref={videoRef}
                className={`h-64 w-full object-cover ${cameraStatus === 'running' ? 'block' : 'hidden'}`}
                autoPlay
                playsInline
                muted
              />

              {cameraStatus === 'running' && (
                <>
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="h-40 w-64 rounded-lg border-2 border-dashed border-white/80 shadow-2xl" />
                  </div>
                  <div className="absolute bottom-2 left-0 right-0 text-center text-xs text-white/80">
                    Arahkan barcode barang ke area bingkai
                  </div>
                </>
              )}

              {cameraStatus === 'starting' && (
                <div className="flex h-64 items-center justify-center text-sm font-medium text-slate-300">
                  <svg className="mr-2 h-5 w-5 animate-spin text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Menyiapkan kamera...
                </div>
              )}

              {(cameraStatus === 'idle' || cameraStatus === 'error' || !userCameraEnabled) && (
                <div className="flex h-64 items-center justify-center p-4 text-center text-xs text-slate-400">
                  {cameraError ? cameraError : 'Kamera dinonaktifkan. Klik "Nyalakan Kamera" atau gunakan pencarian manual.'}
                </div>
              )}
            </div>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            <span className="absolute bg-white px-3 text-xs font-medium text-slate-400 dark:bg-slate-800 dark:text-slate-500">atau</span>
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              resetScanSession()
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
          {/* Scan Success Toast Banner */}
          {scanToast && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg bg-emerald-50 p-4 text-sm font-medium text-emerald-800 border border-emerald-200 shadow-sm"
            >
              <svg className="h-5 w-5 text-emerald-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              <span>{scanToast}</span>
            </div>
          )}

          <div className="flex items-start justify-between border-b pb-4" style={{ borderColor: 'var(--border-muted)' }}>
            <div>
              <span className="inline-block rounded bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-800">
                BARANG DITEMUKAN
              </span>
              <h2 className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{selectedItem.name}</h2>
              <p className="font-mono text-xs text-slate-500 dark:text-slate-400">
                SKU: {selectedItem.sku} · Barcode: {selectedItem.barcode}
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetSessionAndCamera}
              className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            >
              Ganti Barang
            </button>
          </div>

          <div className="rounded-lg bg-slate-50 p-4 dark:bg-slate-700/60">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Stok Tersedia Saat Ini:</span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
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

          <div className="flex justify-end gap-3 border-t pt-2" style={{ borderColor: 'var(--border-muted)' }}>
            <button
              type="button"
              onClick={handleResetSessionAndCamera}
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
            <h3 id="confirm-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Konfirmasi Pengambilan
            </h3>

            <p className="text-sm text-slate-700 dark:text-slate-300">
              Yakin ingin mengambil <strong>{quantity} {selectedUnit.symbol} {selectedItem.name}</strong>?
            </p>

            <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Stok saat ini:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{currentStockNum} {selectedItem.base_unit?.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span>Perkiraan sisa stok:</span>
                <span className={`font-semibold ${estimatedRemainingStock < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
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

            <h3 id="success-modal-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
              Berhasil Disimpan
            </h3>

            <p className="text-sm text-slate-600 dark:text-slate-300">
              Pengambilan barang berhasil dicatat.
            </p>

            <div className="rounded-lg bg-slate-50 p-3 text-xs space-y-1 text-left text-slate-700 dark:bg-slate-700/60 dark:text-slate-300">
              <div className="flex justify-between">
                <span>No. Transaksi:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{successModalData.transactionNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Jumlah Diambil:</span>
                <span className="font-semibold text-slate-900 dark:text-slate-100">{successModalData.quantityText}</span>
              </div>
              <div className="flex justify-between">
                <span>Sisa Stok Terbaru:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400">{successModalData.newStock}</span>
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
