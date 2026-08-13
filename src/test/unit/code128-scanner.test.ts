import bwipjs from 'bwip-js/node'
import { BarcodeFormat, DecodeHintType } from '@zxing/library'
import { describe, expect, it } from 'vitest'
import {
  BARCODE_LABEL_CONTENT_WIDTH_PX,
  BARCODE_LABEL_WIDTH_PX,
  buildBarcodeRenderOptions,
} from '@/lib/barcode-render'
import { CAMERA_SCAN_DELAY_MS, createScannerDecodeHints } from '@/app/employee/scan/scan-client'

describe('Code 128 camera scanner regression', () => {
  it('explicitly enables Code 128 and accuracy-oriented decoding', () => {
    const hints = createScannerDecodeHints()
    const formats = hints.get(DecodeHintType.POSSIBLE_FORMATS)

    expect(formats).toContain(BarcodeFormat.CODE_128)
    expect(formats).toContain(BarcodeFormat.EAN_13)
    expect(hints.get(DecodeHintType.TRY_HARDER)).toBe(true)
    expect(CAMERA_SCAN_DELAY_MS).toBeLessThanOrEqual(250)
  })

  it('adds a white quiet zone and preserves two-pixel Code 128 modules', () => {
    const options = buildBarcodeRenderOptions('IB-UVMFRN', 'CODE128')

    expect(options.scaleX).toBe(2)
    expect(options.paddingwidth).toBeGreaterThanOrEqual(8)
    expect(options.backgroundcolor).toBe('FFFFFF')
    expect(options.barcolor).toBe('000000')
    expect(options.height).toBeGreaterThanOrEqual(14)
  })

  it('does not shrink an automatic Code 128 barcode inside the label', () => {
    const svg = bwipjs.toSVG(buildBarcodeRenderOptions('IB-UVMFRN', 'CODE128'))
    const viewBox = svg.match(/viewBox="0 0 (\d+) (\d+)"/)

    expect(viewBox).not.toBeNull()
    expect(Number(viewBox?.[1])).toBeLessThanOrEqual(BARCODE_LABEL_CONTENT_WIDTH_PX)
    expect(BARCODE_LABEL_WIDTH_PX).toBeGreaterThan(BARCODE_LABEL_CONTENT_WIDTH_PX)
  })
})
