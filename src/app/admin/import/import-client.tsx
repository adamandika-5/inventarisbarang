'use client'

/**
 * ImportClient — Excel/CSV import UI with preview, validation, and confirmation.
 *
 * SECURITY:
 * - All actual validation done server-side in actions.ts.
 * - Service-role key never used client-side.
 * - File size / type check also done client-side for UX only (server rechecks).
 */

import { useRef, useState, useTransition } from 'react'
import { parseImportFile, confirmImport } from './actions'
import type { ParsedRow, ImportRowResult, ImportResult } from './actions'

const MAX_CLIENT_FILE_SIZE = 6 * 1024 * 1024 // 6 MB
const ACCEPTED_TYPES = '.xlsx,.xls,.csv'

type Step = 'upload' | 'preview' | 'result'

export default function ImportClient() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [clientError, setClientError] = useState<string | null>(null)
  const [previewRows, setPreviewRows] = useState<ParsedRow[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [isParsing, startParsing] = useTransition()
  const [isConfirming, startConfirming] = useTransition()

  // ── File selection ──────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null
    setClientError(null)
    setParseError(null)
    setPreviewRows([])
    setImportResult(null)
    setStep('upload')

    if (!file) {
      setSelectedFile(null)
      return
    }
    if (file.size > MAX_CLIENT_FILE_SIZE) {
      setClientError('Ukuran file melebihi 6 MB.')
      setSelectedFile(null)
      return
    }
    const name = file.name.toLowerCase()
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setClientError('Format file tidak didukung. Gunakan .xlsx atau .csv.')
      setSelectedFile(null)
      return
    }
    setSelectedFile(file)
  }

  // ── Parse / Preview ─────────────────────────────────────────────────────────

  const handleParse = () => {
    if (!selectedFile) return
    setParseError(null)

    const fd = new FormData()
    fd.append('file', selectedFile)

    startParsing(async () => {
      const result = await parseImportFile(fd)
      if (!result.success || !result.rows) {
        setParseError(result.error ?? 'Gagal membaca file.')
        return
      }
      setPreviewRows(result.rows)
      setStep('preview')
    })
  }

  // ── Confirm Import ──────────────────────────────────────────────────────────

  const handleConfirm = () => {
    if (!selectedFile) return

    const fd = new FormData()
    fd.append('file', selectedFile)

    startConfirming(async () => {
      const result = await confirmImport(fd)
      setImportResult(result)
      setStep('result')
    })
  }

  // ── Reset ───────────────────────────────────────────────────────────────────

  const handleReset = () => {
    setStep('upload')
    setSelectedFile(null)
    setClientError(null)
    setParseError(null)
    setPreviewRows([])
    setImportResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav aria-label="Langkah impor" className="flex items-center gap-2 text-sm">
        {(['upload', 'preview', 'result'] as Step[]).map((s, i) => {
          const labels: Record<Step, string> = {
            upload: '1. Upload File',
            preview: '2. Preview & Validasi',
            result: '3. Hasil Impor',
          }
          const isActive = step === s
          const isDone =
            (s === 'upload' && (step === 'preview' || step === 'result')) ||
            (s === 'preview' && step === 'result')
          return (
            <span key={s} className="flex items-center gap-2">
              {i > 0 && <span className="text-slate-300 dark:text-slate-600">›</span>}
              <span
                className={`rounded-full px-3 py-1 font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 dark:bg-[#22D3EE] text-white dark:text-[#0B1220] font-bold'
                    : isDone
                      ? 'bg-green-100 dark:bg-emerald-950/60 text-green-700 dark:text-emerald-300 dark:border dark:border-emerald-700/50'
                      : 'bg-slate-100 dark:bg-[#17263D] text-slate-500 dark:text-slate-300 border border-transparent dark:border-white/10'
                }`}
              >
                {labels[s]}
              </span>
            </span>
          )
        })}
      </nav>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="card space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upload File Excel atau CSV</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-300">
                Maksimum 500 baris, ukuran file maks 6 MB. Format: .xlsx atau .csv.
              </p>
            </div>
            <a
              href="/api/import/template"
              id="btn-download-template"
              className="btn-secondary flex-shrink-0 text-sm"
              download
            >
              <svg className="mr-1.5 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Unduh Template
            </a>
          </div>

          {/* Drop area */}
          <label
            htmlFor="import-file-input"
            className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed py-10 transition-colors ${
              selectedFile
                ? 'border-green-400 bg-green-50 dark:border-emerald-500/50 dark:bg-emerald-950/30'
                : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50 dark:border-[#22D3EE]/40 dark:bg-[#0B1220] dark:hover:border-[#22D3EE] dark:hover:bg-[#203552]'
            }`}
          >
            <svg
              className={`mb-3 h-10 w-10 ${selectedFile ? 'text-green-500 dark:text-emerald-400' : 'text-slate-400 dark:text-[#22D3EE]'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            {selectedFile ? (
              <div className="text-center">
                <p className="font-medium text-green-700 dark:text-emerald-300">{selectedFile.name}</p>
                <p className="mt-1 text-xs text-green-600 dark:text-emerald-400">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
            ) : (
              <div className="text-center">
                <p className="font-medium text-slate-700 dark:text-white">Klik untuk memilih file</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">atau seret dan lepas di sini</p>
              </div>
            )}
            <input
              id="import-file-input"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              onChange={handleFileChange}
              className="sr-only"
              aria-label="Pilih file Excel atau CSV untuk diimpor"
            />
          </label>

          {clientError && <div className="alert-error">{clientError}</div>}
          {parseError && <div className="alert-error">{parseError}</div>}

          <div className="flex gap-3">
            <button
              type="button"
              id="btn-parse-file"
              onClick={handleParse}
              disabled={!selectedFile || isParsing}
              className="btn-primary disabled:bg-slate-200 dark:disabled:bg-[#203552] disabled:text-slate-400 dark:disabled:text-[#8494ab] disabled:opacity-100"
            >
              {isParsing ? 'Membaca file…' : 'Baca & Preview'}
            </button>
            {selectedFile && (
              <button type="button" onClick={handleReset} className="btn-secondary">
                Batal
              </button>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Preview */}
      {step === 'preview' && (
        <div className="space-y-4">
          <div className="card">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Preview Data ({previewRows.length} baris)
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  File: <span className="font-medium">{selectedFile?.name}</span>. Periksa data
                  sebelum mengkonfirmasi impor.
                </p>
              </div>
              <button type="button" onClick={handleReset} className="btn-secondary text-sm">
                Ganti File
              </button>
            </div>

            <div className="table-container">
              <table className="table">
                <thead>
                  <tr>
                    <th>Baris</th>
                    <th>Nama Barang</th>
                    <th>Kategori</th>
                    <th>Satuan</th>
                    <th>Barcode</th>
                    <th>Format</th>
                    <th>Min Stok</th>
                    <th>Stok Awal</th>
                    <th>Aktif</th>
                    <th>SKU</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="font-mono text-xs text-slate-500 dark:text-slate-400">{row.rowIndex}</td>
                      <td className="font-medium text-slate-900 dark:text-slate-100">{row.name || <EmptyCell />}</td>
                      <td className="text-slate-700 dark:text-slate-300">{row.category_name || <EmptyCell />}</td>
                      <td className="text-slate-700 dark:text-slate-300">{row.unit_name || <EmptyCell />}</td>
                      <td className="font-mono text-xs text-slate-700 dark:text-slate-300">{row.barcode || <EmptyCell />}</td>
                      <td className="text-xs text-slate-700 dark:text-slate-300">{row.barcode_format}</td>
                      <td className="text-right text-slate-700 dark:text-slate-300">{row.minimum_stock}</td>
                      <td className="text-right text-slate-700 dark:text-slate-300">{row.initial_stock}</td>
                      <td className="text-slate-700 dark:text-slate-300">{row.is_active ? 'Ya' : 'Tidak'}</td>
                      <td className="font-mono text-xs text-slate-400 dark:text-slate-500">{row.sku || '(auto)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              id="btn-confirm-import"
              onClick={handleConfirm}
              disabled={isConfirming || previewRows.length === 0}
              className="btn-primary disabled:bg-slate-200 dark:disabled:bg-[#203552] disabled:text-slate-400 dark:disabled:text-[#8494ab] disabled:opacity-100"
            >
              {isConfirming
                ? 'Menyimpan…'
                : `Konfirmasi Impor ${previewRows.length} Barang`}
            </button>
            <button type="button" onClick={handleReset} className="btn-secondary">
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Result */}
      {step === 'result' && importResult && (
        <div className="space-y-4">
          {/* Summary card */}
          <div className={`card border-l-4 ${importResult.success ? 'border-l-green-500' : 'border-l-red-500'}`}>
                <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Hasil Impor</h2>
            {importResult.error && !importResult.rows.length && (
              <div className="alert-error mb-3">{importResult.error}</div>
            )}
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="rounded-md bg-green-50 p-3 dark:bg-green-950/30">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{importResult.successCount}</p>
                <p className="text-xs text-green-600 dark:text-green-400">Berhasil</p>
              </div>
              <div className="rounded-md bg-red-50 p-3 dark:bg-red-950/30">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{importResult.failCount}</p>
                <p className="text-xs text-red-600 dark:text-red-400">Gagal</p>
              </div>
              <div className="rounded-md bg-slate-50 p-3 dark:bg-slate-700/60">
                <p className="text-2xl font-bold text-slate-700 dark:text-slate-200">{importResult.total}</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Total Baris</p>
              </div>
            </div>
          </div>

          {/* Row detail */}
          {importResult.rows.length > 0 && (
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Detail Per Baris</h3>
              <div className="table-container">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Baris</th>
                      <th>Status</th>
                      <th>Nama Barang</th>
                      <th>SKU</th>
                      <th>Keterangan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.rows.map((row) => (
                      <tr key={row.row}>
                        <td className="font-mono text-xs">{row.row}</td>
                        <td>
                          <StatusBadge status={row.status} />
                        </td>
                        <td>{row.name}</td>
                        <td className="font-mono text-xs">{row.sku ?? '—'}</td>
                        <td className="text-xs text-red-600">
                          {row.errors.join(' ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <button type="button" id="btn-import-again" onClick={handleReset} className="btn-secondary">
            Impor File Lain
          </button>
        </div>
      )}
    </div>
  )
}

function EmptyCell() {
  return <span className="italic text-xs text-slate-300 dark:text-slate-600">kosong</span>
}

function StatusBadge({ status }: { status: ImportRowResult['status'] }) {
  if (status === 'OK') return <span className="badge-aman">✓ OK</span>
  if (status === 'ERROR') return <span className="badge-habis">✗ Error</span>
  return <span className="badge-nonaktif">– Lewati</span>
}
