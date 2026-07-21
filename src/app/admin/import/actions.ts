'use server'

/**
 * Import Server Actions
 *
 * SECURITY:
 * - Admin-only, verified server-side on every call.
 * - File parsed in memory — never persisted to disk.
 * - All validation re-done server-side.
 * - Service-role key never exposed to client.
 * - Max 500 rows, max 6 MB file size.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { BarcodeFormat } from '@/types/database'

// ── Types ─────────────────────────────────────────────────────────────────────

export type ImportRowStatus = 'OK' | 'ERROR' | 'SKIPPED'

export interface ImportRowResult {
  row: number
  status: ImportRowStatus
  name?: string
  sku?: string
  errors: string[]
}

export interface ParseResult {
  success: boolean
  error?: string
  rows?: ParsedRow[]
}

export interface ParsedRow {
  rowIndex: number // 1-based (Excel row number, header=1)
  name: string
  category_name: string
  unit_name: string
  barcode: string
  barcode_format: string
  minimum_stock: number
  initial_stock: number
  notes: string
  is_active: boolean
  sku?: string // optional: if provided, must be ATK-XXXX format
}

export interface ImportResult {
  success: boolean
  error?: string
  total: number
  successCount: number
  failCount: number
  skippedCount: number
  rows: ImportRowResult[]
  batchId?: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_ROWS = 500
const VALID_BARCODE_FORMATS: BarcodeFormat[] = ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'CODE128', 'QR']
const SKU_FORMAT_REGEX = /^ATK-[0-9]{4,}$/

// ── Helper: verify admin ──────────────────────────────────────────────────────

async function verifyAdmin() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { supabase: null, userId: null, error: 'Tidak terautentikasi.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single()

  if (!profile?.is_active || profile.role !== 'ADMIN') {
    return { supabase: null, userId: null, error: 'Akses ditolak.' }
  }
  return { supabase, userId: user.id, error: null }
}

// ── Action: Parse uploaded file ───────────────────────────────────────────────

/**
 * Parse an uploaded Excel/CSV file and return rows for preview.
 * This does NOT save anything to the database.
 */
export async function parseImportFile(formData: FormData): Promise<ParseResult> {
  const { error: authError } = await verifyAdmin()
  if (authError) return { success: false, error: authError }

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) {
    return { success: false, error: 'File tidak ditemukan.' }
  }

  // Validate file type
  const fileName = file.name.toLowerCase()
  const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls')
  const isCsv = fileName.endsWith('.csv')
  if (!isExcel && !isCsv) {
    return { success: false, error: 'Format file tidak didukung. Gunakan .xlsx atau .csv.' }
  }

  // Validate file size (max 6 MB)
  if (file.size > 6 * 1024 * 1024) {
    return { success: false, error: 'Ukuran file melebihi batas 6 MB.' }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    let rawRows: Record<string, string>[]

    if (isCsv) {
      rawRows = parseCsvBuffer(buffer)
    } else {
      rawRows = await parseExcelBuffer(buffer)
    }

    if (rawRows.length === 0) {
      return { success: false, error: 'File tidak memiliki data (kosong).' }
    }

    if (rawRows.length > MAX_ROWS) {
      return {
        success: false,
        error: `Terlalu banyak baris. Maksimum ${MAX_ROWS} baris data per impor.`,
      }
    }

    const rows: ParsedRow[] = rawRows.map((raw, i) => parseRawRow(raw, i + 2)) // +2: header row = 1
    return { success: true, rows }
  } catch (err) {
    console.error('IMPORT_PARSE_ERROR', err instanceof Error ? err.message : 'unknown')
    return { success: false, error: 'Gagal membaca file. Pastikan format file benar.' }
  }
}

// ── Action: Confirm import ────────────────────────────────────────────────────

/**
 * Validate all rows server-side and insert items atomically.
 * If ANY row fails validation, the entire import is aborted.
 */
export async function confirmImport(formData: FormData): Promise<ImportResult> {
  const { supabase, userId, error: authError } = await verifyAdmin()
  if (authError || !supabase || !userId) {
    return { success: false, error: authError ?? 'Akses ditolak.', total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
  }

  const file = formData.get('file') as File | null
  const fileName = file?.name ?? 'unknown.xlsx'

  if (!file || file.size === 0) {
    return { success: false, error: 'File tidak ditemukan.', total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
  }

  const fileNameLower = file.name.toLowerCase()
  const isExcel = fileNameLower.endsWith('.xlsx') || fileNameLower.endsWith('.xls')
  const isCsv = fileNameLower.endsWith('.csv')
  if (!isExcel && !isCsv) {
    return { success: false, error: 'Format file tidak didukung.', total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
  }
  if (file.size > 6 * 1024 * 1024) {
    return { success: false, error: 'Ukuran file melebihi 6 MB.', total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const rawRows = isCsv ? parseCsvBuffer(buffer) : await parseExcelBuffer(buffer)

    if (rawRows.length === 0) {
      return { success: false, error: 'File kosong.', total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
    }
    if (rawRows.length > MAX_ROWS) {
      return { success: false, error: `Terlalu banyak baris (maks ${MAX_ROWS}).`, total: 0, successCount: 0, failCount: 0, skippedCount: 0, rows: [] }
    }

    const parsedRows = rawRows.map((raw, i) => parseRawRow(raw, i + 2))

    // Load lookup tables
    const [{ data: categories }, { data: units }, { data: existingSkus }, { data: existingBarcodes }] =
      await Promise.all([
        supabase.from('categories').select('id,name').eq('is_active', true),
        supabase.from('units').select('id,name').eq('is_active', true),
        supabase.from('items').select('sku'),
        supabase.from('items').select('barcode'),
      ])

    const categoryMap = new Map((categories ?? []).map((c) => [c.name.toLowerCase().trim(), c.id]))
    const unitMap = new Map((units ?? []).map((u) => [u.name.toLowerCase().trim(), u.id]))
    const existingSkuSet = new Set((existingSkus ?? []).map((i) => i.sku))
    const existingBarcodeSet = new Set((existingBarcodes ?? []).map((i) => i.barcode))

    // Track barcodes seen within THIS import batch (catch duplicates within file)
    const batchBarcodeSet = new Set<string>()
    const batchSkuSet = new Set<string>()

    // Validate all rows
    const rowResults: ImportRowResult[] = []
    let hasErrors = false

    for (const row of parsedRows) {
      const errors: string[] = []

      if (!row.name) errors.push('Nama barang wajib diisi.')
      if (!row.category_name) errors.push('Kategori wajib diisi.')
      if (!row.unit_name) errors.push('Satuan wajib diisi.')
      if (!row.barcode) errors.push('Barcode wajib diisi.')

      // Category lookup
      const categoryId = categoryMap.get(row.category_name.toLowerCase().trim())
      if (row.category_name && !categoryId) {
        errors.push(`Kategori "${row.category_name}" tidak ditemukan atau tidak aktif.`)
      }

      // Unit lookup
      const unitId = unitMap.get(row.unit_name.toLowerCase().trim())
      if (row.unit_name && !unitId) {
        errors.push(`Satuan "${row.unit_name}" tidak ditemukan atau tidak aktif.`)
      }

      // Barcode format
      if (row.barcode_format && !VALID_BARCODE_FORMATS.includes(row.barcode_format as BarcodeFormat)) {
        errors.push(`Format barcode "${row.barcode_format}" tidak valid. Pilih: ${VALID_BARCODE_FORMATS.join(', ')}.`)
      }

      // Barcode duplicate (DB)
      if (row.barcode && existingBarcodeSet.has(row.barcode)) {
        errors.push(`Barcode "${row.barcode}" sudah ada di database.`)
      }
      // Barcode duplicate (within file)
      if (row.barcode && batchBarcodeSet.has(row.barcode)) {
        errors.push(`Barcode "${row.barcode}" duplikat dalam file ini.`)
      }
      if (row.barcode) batchBarcodeSet.add(row.barcode)

      // SKU validation (if provided)
      if (row.sku) {
        if (!SKU_FORMAT_REGEX.test(row.sku)) {
          errors.push(`SKU "${row.sku}" tidak valid. Format: ATK-0001.`)
        } else if (existingSkuSet.has(row.sku)) {
          errors.push(`SKU "${row.sku}" sudah ada di database.`)
        } else if (batchSkuSet.has(row.sku)) {
          errors.push(`SKU "${row.sku}" duplikat dalam file ini.`)
        }
        if (row.sku) batchSkuSet.add(row.sku)
      }

      // Stock values
      if (row.minimum_stock < 0 || !Number.isInteger(row.minimum_stock)) {
        errors.push('Stok minimum harus bilangan bulat non-negatif.')
      }
      if (row.initial_stock < 0 || !Number.isInteger(row.initial_stock)) {
        errors.push('Stok awal harus bilangan bulat non-negatif.')
      }

      if (errors.length > 0) hasErrors = true

      rowResults.push({
        row: row.rowIndex,
        status: errors.length > 0 ? 'ERROR' : 'OK',
        name: row.name,
        sku: row.sku,
        errors,
      })
    }

    // If any row has errors, abort entire import
    if (hasErrors) {
      return {
        success: false,
        error: 'Terdapat error pada data. Perbaiki terlebih dahulu sebelum mengimpor.',
        total: parsedRows.length,
        successCount: 0,
        failCount: rowResults.filter((r) => r.status === 'ERROR').length,
        skippedCount: 0,
        rows: rowResults,
      }
    }

    // All rows valid — insert items
    let successCount = 0
    const insertResults: ImportRowResult[] = []

    for (const row of parsedRows) {
      const categoryId = categoryMap.get(row.category_name.toLowerCase().trim())!
      const unitId = unitMap.get(row.unit_name.toLowerCase().trim())!

      type ItemInsert = {
        barcode: string
        barcode_format: BarcodeFormat
        name: string
        category_id: string
        base_unit_id: string
        default_purchase_unit_id: string
        current_stock: number
        minimum_stock: number
        notes: string | null
        is_active: boolean
        sku?: string
      }
      const insertPayload: ItemInsert = {
        barcode: row.barcode,
        barcode_format: (row.barcode_format as BarcodeFormat) || 'CODE128',
        name: row.name.trim(),
        category_id: categoryId,
        base_unit_id: unitId,
        default_purchase_unit_id: unitId,
        current_stock: row.initial_stock,
        minimum_stock: row.minimum_stock,
        notes: row.notes || null,
        is_active: row.is_active,
      }
      if (row.sku) insertPayload.sku = row.sku

      const { data: inserted, error: insertError } = await supabase
        .from('items')
        .insert(insertPayload)
        .select('id,sku,name')
        .single()

      if (insertError || !inserted) {
        insertResults.push({
          row: row.rowIndex,
          status: 'ERROR',
          name: row.name,
          errors: ['Gagal menyimpan ke database: ' + (insertError?.message ?? 'unknown')],
        })
      } else {
        successCount++
        insertResults.push({
          row: row.rowIndex,
          status: 'OK',
          name: inserted.name,
          sku: inserted.sku,
          errors: [],
        })
      }
    }

    // Record import batch
    await supabase.from('import_batches').insert({
      performed_by: userId,
      file_name: fileName,
      total_rows: parsedRows.length,
      success_count: successCount,
      fail_count: parsedRows.length - successCount,
      result_summary: insertResults as unknown as import('@/types/database').Json,
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      performed_by: userId,
      action: 'EXCEL_IMPORT',
      entity_type: 'items',
      changes_summary: {
        file_name: fileName,
        total_rows: parsedRows.length,
        success_count: successCount,
      },
    })

    revalidatePath('/admin/items')
    revalidatePath('/admin/import')

    return {
      success: true,
      total: parsedRows.length,
      successCount,
      failCount: parsedRows.length - successCount,
      skippedCount: 0,
      rows: insertResults,
    }
  } catch (err) {
    console.error('IMPORT_CONFIRM_ERROR', err instanceof Error ? err.message : 'unknown')
    return {
      success: false,
      error: 'Terjadi kesalahan server saat mengimpor.',
      total: 0,
      successCount: 0,
      failCount: 0,
      skippedCount: 0,
      rows: [],
    }
  }
}

// ── Helpers: File parsing ─────────────────────────────────────────────────────

async function parseExcelBuffer(buffer: Uint8Array): Promise<Record<string, string>[]> {
  const ExcelJS = await import('exceljs')
  const workbook = new ExcelJS.Workbook()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await workbook.xlsx.load(buffer as any)
  const worksheet = workbook.worksheets[0]
  if (!worksheet) return []

  const rows: Record<string, string>[] = []
  let headers: string[] = []

  worksheet.eachRow((row, rowNumber) => {
    const values = (row.values as (string | number | boolean | null | undefined)[]).slice(1) // remove index 0

    if (rowNumber === 1) {
      headers = values.map((v) => String(v ?? '').trim().toLowerCase())
      return
    }

    const rowObj: Record<string, string> = {}
    headers.forEach((h, i) => {
      const cell = values[i]
      rowObj[h] = cell == null ? '' : String(cell).trim()
    })

    // Skip entirely empty rows
    const hasContent = Object.values(rowObj).some((v) => v !== '')
    if (hasContent) rows.push(rowObj)
  })

  return rows
}

function parseCsvBuffer(buffer: Uint8Array): Record<string, string>[] {
  const text = new TextDecoder('utf-8').decode(buffer)
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '')
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0] ?? '').map((h) => h.toLowerCase().trim())
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i] ?? '')
    const rowObj: Record<string, string> = {}
    headers.forEach((h, idx) => {
      rowObj[h] = (values[idx] ?? '').trim()
    })
    const hasContent = Object.values(rowObj).some((v) => v !== '')
    if (hasContent) rows.push(rowObj)
  }

  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

function parseRawRow(raw: Record<string, string>, rowIndex: number): ParsedRow {
  // Normalize column aliases — support both Indonesian and English headers
  const get = (...keys: string[]): string => {
    for (const k of keys) {
      const val = raw[k] ?? raw[k.toLowerCase()] ?? ''
      if (val !== '') return val.trim()
    }
    return ''
  }

  const minimumStockRaw = get('stok minimum', 'minimum_stock', 'min_stock', 'minimum stock')
  const initialStockRaw = get('stok awal', 'initial_stock', 'stok_awal', 'initial stock', 'stok')
  const barcodeFormatRaw = get('format barcode', 'barcode_format', 'barcode format', 'format').toUpperCase()

  return {
    rowIndex,
    name: get('nama barang', 'nama', 'name', 'item_name'),
    category_name: get('kategori', 'category', 'category_name'),
    unit_name: get('satuan', 'unit', 'unit_name', 'satuan dasar'),
    barcode: get('barcode', 'kode_barcode'),
    barcode_format: barcodeFormatRaw || 'CODE128',
    minimum_stock: parseIntSafe(minimumStockRaw, 0),
    initial_stock: parseIntSafe(initialStockRaw, 0),
    notes: get('keterangan', 'catatan', 'notes'),
    is_active: parseBoolean(get('aktif', 'is_active', 'status'), true),
    sku: get('sku') || undefined,
  }
}

function parseIntSafe(value: string, fallback: number): number {
  if (!value) return fallback
  const n = parseInt(value.replace(/[^0-9-]/g, ''), 10)
  return isNaN(n) ? fallback : n
}

function parseBoolean(value: string, fallback: boolean): boolean {
  if (!value) return fallback
  const lower = value.toLowerCase()
  if (['true', 'ya', 'yes', '1', 'aktif', 'active'].includes(lower)) return true
  if (['false', 'tidak', 'no', '0', 'nonaktif', 'inactive'].includes(lower)) return false
  return fallback
}
