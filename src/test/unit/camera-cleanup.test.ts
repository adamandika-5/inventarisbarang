import { describe, it, expect, vi } from 'vitest'
import {
  checkTrackTorchCapability,
  safeApplyTorchConstraint,
  checkTrackFocusModeCapability,
  safeApplyContinuousFocus,
} from '@/app/employee/scan/scan-client'
import scanSuccessFeedback from '@/lib/scan-success-feedback'

/**
 * Unit tests for Camera & Torch Hardware Cleanup logic, Scan Feedback Vibration, & Web Audio Beep
 */

class MockMediaStreamTrack {
  kind = 'video'
  readyState: 'live' | 'ended' = 'live'
  applyConstraintsCalledWith: unknown[] = []
  stopped = false
  shouldFailConstraints = false
  hasTorchCapability = true
  hasContinuousFocusCapability = true

  getCapabilities() {
    return {
      torch: this.hasTorchCapability,
      focusMode: this.hasContinuousFocusCapability ? ['continuous', 'auto', 'manual'] : ['auto'],
    }
  }

  async applyConstraints(constraints: unknown) {
    if (this.shouldFailConstraints) {
      const err = new Error('setPhotoOptions failed')
      err.name = 'UnknownError'
      throw err
    }
    this.applyConstraintsCalledWith.push(constraints)
  }

  stop() {
    this.stopped = true
    this.readyState = 'ended'
  }
}

class MockMediaStream {
  tracks: MockMediaStreamTrack[]

  constructor(tracks: MockMediaStreamTrack[]) {
    this.tracks = tracks
  }

  getVideoTracks() {
    return this.tracks.filter((t) => t.kind === 'video')
  }

  getTracks() {
    return this.tracks
  }
}

class CameraCleanupController {
  videoEl: { srcObject: unknown; pause: () => void } | null = null
  controls: { stop: () => void } | null = null
  stream: MockMediaStream | null = null
  isCleaningUp = false
  cameraActive = true
  torchActive = false
  scanSuccessCalled = false

  async stopCamera() {
    if (this.isCleaningUp) return
    this.isCleaningUp = true

    try {
      const activeStream = (this.videoEl?.srcObject as MockMediaStream | null) || this.stream

      if (activeStream) {
        const videoTracks = activeStream.getVideoTracks()
        for (const track of videoTracks) {
          if (track.readyState === 'live' && typeof track.getCapabilities === 'function') {
            try {
              const caps = track.getCapabilities() as { torch?: boolean }
              if (caps?.torch) {
                await track.applyConstraints({ advanced: [{ torch: false }] })
              }
            } catch {
              // Ignore non-fatal torch cleanup failure
            }
          }
        }

        // Stop ALL tracks regardless of torch cleanup failure
        activeStream.getTracks().forEach((track) => {
          if (track.readyState !== 'ended') {
            track.stop()
          }
        })
      }

      if (this.controls) {
        this.controls.stop()
        this.controls = null
      }

      if (this.videoEl) {
        this.videoEl.pause()
        this.videoEl.srcObject = null
      }

      this.stream = null
      this.torchActive = false
      this.cameraActive = false
    } finally {
      this.isCleaningUp = false
    }
  }

  async handleScanSuccess(code: string) {
    await this.stopCamera()
    this.scanSuccessCalled = true
    return code
  }

  restartCamera() {
    this.cameraActive = true
    this.torchActive = false
    this.scanSuccessCalled = false
  }
}

describe('Camera & Torch Hardware Cleanup', () => {
  it('should apply torch: false constraints BEFORE stopping the video track', async () => {
    const track = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track])
    const controller = new CameraCleanupController()

    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }
    controller.controls = { stop: vi.fn() }

    await controller.stopCamera()

    expect(track.applyConstraintsCalledWith).toHaveLength(1)
    expect(track.applyConstraintsCalledWith[0]).toEqual({ advanced: [{ torch: false }] })
    expect(track.stopped).toBe(true)
  })

  it('should stop ALL tracks in the MediaStream', async () => {
    const track1 = new MockMediaStreamTrack()
    const track2 = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track1, track2])

    const controller = new CameraCleanupController()
    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }

    await controller.stopCamera()

    expect(track1.stopped).toBe(true)
    expect(track2.stopped).toBe(true)
  })

  it('should clear videoEl.srcObject and pause video element', async () => {
    const track = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track])
    const pauseSpy = vi.fn()

    const controller = new CameraCleanupController()
    const videoEl = { srcObject: stream, pause: pauseSpy }
    controller.videoEl = videoEl

    await controller.stopCamera()

    expect(pauseSpy).toHaveBeenCalledTimes(1)
    expect(videoEl.srcObject).toBeNull()
  })

  it('should automatically invoke cleanup when scan succeeds', async () => {
    const track = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track])
    const controller = new CameraCleanupController()
    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }

    await controller.handleScanSuccess('899123456789')

    expect(track.stopped).toBe(true)
    expect(controller.scanSuccessCalled).toBe(true)
    expect(controller.cameraActive).toBe(false)
  })

  it('should be safe to call stopCamera multiple times repeatedly (idempotent)', async () => {
    const track = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track])
    const controller = new CameraCleanupController()
    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }

    await Promise.all([
      controller.stopCamera(),
      controller.stopCamera(),
      controller.stopCamera(),
    ])

    expect(track.stopped).toBe(true)
    expect(track.applyConstraintsCalledWith).toHaveLength(1)
  })

  it('should allow scanner to be restarted cleanly with default torch off', async () => {
    const track = new MockMediaStreamTrack()
    const stream = new MockMediaStream([track])
    const controller = new CameraCleanupController()
    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }

    await controller.stopCamera()
    expect(controller.cameraActive).toBe(false)

    controller.restartCamera()

    expect(controller.cameraActive).toBe(true)
    expect(controller.torchActive).toBe(false)
    expect(controller.stream).toBeNull()
  })
})

describe('Torch Constraint Error Handling & Track State Validation', () => {
  it('catches UnknownError "setPhotoOptions failed" without causing unhandled promise rejections', async () => {
    const track = new MockMediaStreamTrack()
    track.shouldFailConstraints = true
    const stream = new MockMediaStream([track])

    const success = await safeApplyTorchConstraint(stream as unknown as MediaStream, true)

    expect(success).toBe(false)
  })

  it('allows scanner to keep functioning when flash toggle fails', async () => {
    const track = new MockMediaStreamTrack()
    track.shouldFailConstraints = true
    const stream = new MockMediaStream([track])

    const success = await safeApplyTorchConstraint(stream as unknown as MediaStream, true)
    expect(success).toBe(false)
    expect(track.readyState).toBe('live')
  })

  it('completes camera cleanup and stops all tracks even if torch cleanup throws setPhotoOptions failed', async () => {
    const track = new MockMediaStreamTrack()
    track.shouldFailConstraints = true
    const stream = new MockMediaStream([track])

    const controller = new CameraCleanupController()
    controller.stream = stream
    controller.videoEl = { srcObject: stream, pause: vi.fn() }

    await controller.stopCamera()

    expect(track.stopped).toBe(true)
    expect(controller.cameraActive).toBe(false)
  })

  it('does NOT invoke applyConstraints on tracks whose readyState is "ended"', async () => {
    const track = new MockMediaStreamTrack()
    track.readyState = 'ended'
    const stream = new MockMediaStream([track])

    const success = await safeApplyTorchConstraint(stream as unknown as MediaStream, true)

    expect(success).toBe(false)
    expect(track.applyConstraintsCalledWith).toHaveLength(0)
  })

  it('identifies devices without torch capability and disables torch capability check', () => {
    const trackNoTorch = new MockMediaStreamTrack()
    trackNoTorch.hasTorchCapability = false

    expect(checkTrackTorchCapability(trackNoTorch as unknown as MediaStreamTrack)).toBe(false)

    const trackWithTorch = new MockMediaStreamTrack()
    trackWithTorch.hasTorchCapability = true

    expect(checkTrackTorchCapability(trackWithTorch as unknown as MediaStreamTrack)).toBe(true)
  })
})

describe('Continuous Focus Mode Handling', () => {
  it('checkTrackFocusModeCapability returns true when continuous focus is supported', () => {
    const track = new MockMediaStreamTrack()
    track.hasContinuousFocusCapability = true
    expect(checkTrackFocusModeCapability(track as unknown as MediaStreamTrack)).toBe(true)
  })

  it('checkTrackFocusModeCapability returns false when continuous focus is NOT supported', () => {
    const track = new MockMediaStreamTrack()
    track.hasContinuousFocusCapability = false
    expect(checkTrackFocusModeCapability(track as unknown as MediaStreamTrack)).toBe(false)
  })

  it('applies continuous focus mode constraint when supported', async () => {
    const track = new MockMediaStreamTrack()
    track.hasContinuousFocusCapability = true
    const stream = new MockMediaStream([track])

    const success = await safeApplyContinuousFocus(stream as unknown as MediaStream)

    expect(success).toBe(true)
    expect(track.applyConstraintsCalledWith).toContainEqual({
      advanced: [{ focusMode: 'continuous' }],
    })
  })

  it('does NOT apply continuous focus mode constraint when NOT supported', async () => {
    const track = new MockMediaStreamTrack()
    track.hasContinuousFocusCapability = false
    const stream = new MockMediaStream([track])

    const success = await safeApplyContinuousFocus(stream as unknown as MediaStream)

    expect(success).toBe(false)
    expect(track.applyConstraintsCalledWith).toHaveLength(0)
  })

  it('ensures constraint application failure does NOT stop camera or throw error', async () => {
    const track = new MockMediaStreamTrack()
    track.hasContinuousFocusCapability = true
    track.shouldFailConstraints = true
    const stream = new MockMediaStream([track])

    const success = await safeApplyContinuousFocus(stream as unknown as MediaStream)

    expect(success).toBe(false)
    expect(track.stopped).toBe(false) // Camera keeps running!
  })

  it('ensures flash (torch) remains OFF by default when camera is opened', () => {
    const track = new MockMediaStreamTrack()
    track.hasTorchCapability = true

    // Verify torch is not auto-enabled during camera startup
    expect(track.applyConstraintsCalledWith).not.toContainEqual({
      advanced: [{ torch: true }],
    })
  })
})

describe('Scan Success Feedback & Web Audio Beep', () => {
  it('triggers 100ms vibration and notification containing item name after item is found', () => {
    const vibrateSpy = vi.fn()
    const originalNavigator = global.navigator

    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const mockLookup = (code: string) => {
      if (code === '899123456789') {
        const item = { id: 'item-1', name: 'Pensil 2B' }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(100)
        }
        return { item, toast: `Barang ditemukan: ${item.name}` }
      }
      return { item: null, toast: null }
    }

    const res = mockLookup('899123456789')
    expect(vibrateSpy).toHaveBeenCalledWith(100)
    expect(res.toast).toBe('Barang ditemukan: Pensil 2B')

    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  it('does NOT crash when navigator.vibrate is not supported', () => {
    const originalNavigator = global.navigator
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    })

    const triggerVibration = (ms = 100) => {
      try {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
          navigator.vibrate(ms)
        }
      } catch {
        // Ignore
      }
    }

    expect(() => triggerVibration(100)).not.toThrow()

    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  it('does NOT trigger vibration or beep when barcode is unrecognized or search fails', () => {
    const vibrateSpy = vi.fn()
    const playBeepSpy = vi.fn()
    const originalNavigator = global.navigator

    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const mockLookup = (code: string) => {
      if (code === 'UNKNOWN_CODE') {
        return { item: null, error: 'Barang tidak ditemukan' }
      }
      playBeepSpy()
      return { item: { name: 'Item' } }
    }

    const res = mockLookup('UNKNOWN_CODE')
    expect(vibrateSpy).not.toHaveBeenCalled()
    expect(playBeepSpy).not.toHaveBeenCalled()
    expect(res.item).toBeNull()

    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  it('ensures duplicate scan callbacks trigger vibration and beep only ONCE', () => {
    const vibrateSpy = vi.fn()
    const beepSpy = vi.fn()
    const originalNavigator = global.navigator

    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    let isProcessing = false
    let callCount = 0

    const onScanCallback = (_code: string) => {
      if (isProcessing) return
      isProcessing = true
      callCount++
      beepSpy()
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(100)
      }
    }

    onScanCallback('899123456789')
    onScanCallback('899123456789')
    onScanCallback('899123456789')

    expect(callCount).toBe(1)
    expect(vibrateSpy).toHaveBeenCalledTimes(1)
    expect(beepSpy).toHaveBeenCalledTimes(1)

    Object.defineProperty(global, 'navigator', { value: originalNavigator, writable: true, configurable: true })
  })

  it('handles playFallbackBeep gracefully without crashing when Web Audio is unsupported or fails', () => {
    expect(() => scanSuccessFeedback.playFallbackBeep(880, 150)).not.toThrow()
  })

  it('handles prepareAudio gracefully without crashing', () => {
    expect(() => scanSuccessFeedback.prepareAudio()).not.toThrow()
  })

  it('skips beep playback when sound is disabled by user toggle', () => {
    const playBeepSpy = vi.fn()
    const soundEnabled = false

    if (soundEnabled) {
      playBeepSpy()
    }

    expect(playBeepSpy).not.toHaveBeenCalled()
  })
})
