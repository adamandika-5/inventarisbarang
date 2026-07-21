import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * GET /api/import/template
 * Download Excel template for batch item import.
 * Admin-only route.
 */
export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Tidak terautentikasi.' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,is_active')
    .eq('id', user.id)
    .single()
  if (!profile?.is_active || profile.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Akses ditolak.' }, { status: 403 })
  }

  try {
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'InventarisBarang'
    workbook.created = new Date()

    const ws = workbook.addWorksheet('Template Impor')

    // Define columns with explicit widths
    ws.columns = [
      { header: 'nama barang', key: 'nama barang', width: 30 },
      { header: 'kategori', key: 'kategori', width: 20 },
      { header: 'satuan', key: 'satuan', width: 15 },
      { header: 'barcode', key: 'barcode', width: 20 },
      { header: 'format barcode', key: 'format barcode', width: 16 },
      { header: 'stok minimum', key: 'stok minimum', width: 14 },
      { header: 'stok awal', key: 'stok awal', width: 12 },
      { header: 'keterangan', key: 'keterangan', width: 30 },
      { header: 'aktif', key: 'aktif', width: 10 },
      { header: 'sku', key: 'sku', width: 12 },
    ]

    // Style header row
    const headerRow = ws.getRow(1)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2563EB' },
    }
    headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
    headerRow.height = 22

    // Add example rows
    ws.addRow([
      'Pulpen Hitam',
      'Alat Tulis',
      'Pcs',
      '1234567890123',
      'EAN13',
      5,
      10,
      'Pulpen tinta hitam',
      'ya',
      '',
    ])
    ws.addRow([
      'Buku Folio',
      'Kertas',
      'Rim',
      'CODE128-BUKU01',
      'CODE128',
      2,
      5,
      '',
      'ya',
      '',
    ])

    // Style example rows
    ;[2, 3].forEach((rowNum) => {
      const row = ws.getRow(rowNum)
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFF0F9FF' },
      }
    })

    // Add instruction sheet
    const infoWs = workbook.addWorksheet('Petunjuk')
    infoWs.getColumn(1).width = 80
    const instructions = [
      ['PETUNJUK PENGISIAN TEMPLATE IMPOR BARANG'],
      [''],
      ['Kolom wajib:'],
      ['  - nama barang   : nama lengkap barang (wajib)'],
      ['  - kategori      : nama kategori yang SUDAH ADA di sistem (wajib)'],
      ['  - satuan        : nama satuan dasar yang SUDAH ADA di sistem (wajib)'],
      ['  - barcode       : kode barcode unik (wajib)'],
      [''],
      ['Kolom opsional:'],
      ['  - format barcode: EAN13, EAN8, UPCA, UPCE, CODE128, QR (default: CODE128)'],
      ['  - stok minimum  : jumlah stok minimum (default: 0)'],
      ['  - stok awal     : jumlah stok awal (default: 0)'],
      ['  - keterangan    : catatan tambahan'],
      ['  - aktif         : ya/tidak (default: ya)'],
      ['  - sku           : SKU manual format ATK-0001 (dikosongkan = auto-generate)'],
      [''],
      ['Catatan:'],
      ['  - Baris yang benar-benar kosong akan diabaikan.'],
      ['  - Barcode harus unik dan belum ada di database.'],
      ['  - SKU jika diisi harus format ATK-XXXX dan belum ada di database.'],
      ['  - Maksimum 500 baris per file, ukuran file maks 6 MB.'],
    ]
    instructions.forEach((row, i) => {
      const wsRow = infoWs.getRow(i + 1)
      wsRow.getCell(1).value = row[0] ?? ''
      if (i === 0) wsRow.getCell(1).font = { bold: true, size: 13 }
    })

    const excelBuffer = await workbook.xlsx.writeBuffer()

    return new NextResponse(excelBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="template-impor-barang.xlsx"',
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    console.error('IMPORT_TEMPLATE_ERROR', err)
    return NextResponse.json({ error: 'Gagal membuat template.' }, { status: 500 })
  }
}
