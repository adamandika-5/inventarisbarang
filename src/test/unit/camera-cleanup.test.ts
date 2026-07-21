import { describe, it, expect, vi } from 'vitest'

/**
 * Unit tests for Camera & Torch Hardware Cleanup logic
 */

class MockMediaStreamTrack {
  kind = 'video'
  readyState: 'live' | 'ended' = 'live'
  applyConstraintsCalledWith: unknown[] = []
  stopped = false

  async applyConstraints(constraints: unknown) {
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
          if (track.readyState === 'live') {
            // 1. Torch false constraint applied before stopping track
            try {
              await track.applyConstraints({ advanced: [{ torch: false }] })
            } catch {
              // Ignore unsupported
            }
          }
        }

        // 2. Stop ALL tracks
        activeStream.getTracks().forEach((track) => {
          track.stop()
        })
      }

      // 3. Stop scanner controls
      if (this.controls) {
        this.controls.stop()
        this.controls = null
      }

      // 4. Pause video and clear srcObject
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
    // Await full cleanup BEFORE scan success processing finishes
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

    // 1. applyConstraints was called with torch: false
    expect(track.applyConstraintsCalledWith).toHaveLength(1)
    expect(track.applyConstraintsCalledWith[0]).toEqual({ advanced: [{ torch: false }] })

    // 2. Track is stopped AFTER constraints applied
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

    // Call stopCamera multiple times in parallel
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

    // Restart camera (e.g. after clicking OK on success modal)
    controller.restartCamera()

    expect(controller.cameraActive).toBe(true)
    expect(controller.torchActive).toBe(false)
    expect(controller.stream).toBeNull() // Old stream is cleared
  })
})
