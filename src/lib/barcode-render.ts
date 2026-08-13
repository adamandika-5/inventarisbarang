import type { BarcodeFormat } from '@/types/database'

// 300 px content + 24 px padding + 2 px border (Tailwind uses border-box sizing).
export const BARCODE_LABEL_WIDTH_PX = 326
export const BARCODE_LABEL_CONTENT_WIDTH_PX = 300

const BCID_MAP: Record<BarcodeFormat, string> = {
  EAN13: 'ean13',
  EAN8: 'ean8',
  UPCA: 'upca',
  UPCE: 'upce',
  CODE128: 'code128',
  QR: 'qrcode',
}

/**
 * Build high-contrast barcode options that preserve whole-pixel bar widths.
 *
 * Code 128 is denser than EAN/UPC. A horizontal scale of 2 keeps each narrow
 * module at two pixels while the explicit white padding supplies the quiet
 * zone required by a camera decoder. The resulting nine-character automatic
 * inventory barcode fits the 300 px label content area without CSS shrinking.
 */
export function buildBarcodeRenderOptions(barcode: string, format: BarcodeFormat) {
  const isQr = format === 'QR'
  const isCode128 = format === 'CODE128'

  return {
    bcid: BCID_MAP[format],
    text: barcode.trim(),
    scaleX: isCode128 ? 2 : 3,
    scaleY: 3,
    height: isQr ? 20 : 14,
    includetext: !isQr,
    textxalign: 'center' as const,
    paddingwidth: isCode128 ? 8 : 2,
    paddingheight: 2,
    backgroundcolor: 'FFFFFF',
    barcolor: '000000',
    textcolor: '000000',
    monochrome: true,
  }
}
