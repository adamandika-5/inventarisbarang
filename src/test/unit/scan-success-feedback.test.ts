import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ScanSuccessFeedbackManager, scanSuccessFeedback } from '@/lib/scan-success-feedback'

describe('ScanSuccessFeedbackManager Unit Tests', () => {
  let originalNavigator: typeof global.navigator

  beforeEach(() => {
    originalNavigator = global.navigator
    scanSuccessFeedback.resetSession()
  })

  afterEach(() => {
    Object.defineProperty(global, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    })
  })

  it('triggers vibration with default pattern [200, 80, 200]', () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const manager = new ScanSuccessFeedbackManager()
    manager.triggerVibration()

    expect(vibrateSpy).toHaveBeenCalledWith([200, 80, 200])
  })

  it('allows custom vibration pattern or duration number', () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const manager = new ScanSuccessFeedbackManager()
    manager.triggerVibration(100)
    expect(vibrateSpy).toHaveBeenCalledWith(100)
  })

  it('does NOT crash when navigator.vibrate is not supported (e.g. iOS Safari)', () => {
    Object.defineProperty(global, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    })

    const manager = new ScanSuccessFeedbackManager()
    expect(() => manager.triggerVibration()).not.toThrow()
  })

  it('executes triggerSuccessFeedback with audio and vibration pattern [200, 80, 200]', () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const playSoundSpy = vi.spyOn(scanSuccessFeedback, 'playSound').mockImplementation(async () => {})

    scanSuccessFeedback.triggerSuccessFeedback({
      soundEnabled: true,
      vibrateDuration: [200, 80, 200],
    })

    expect(playSoundSpy).toHaveBeenCalled()
    expect(vibrateSpy).toHaveBeenCalledWith([200, 80, 200])

    playSoundSpy.mockRestore()
  })

  it('skips audio playback when soundEnabled is set to false', () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const playSoundSpy = vi.spyOn(scanSuccessFeedback, 'playSound').mockImplementation(async () => {})

    scanSuccessFeedback.triggerSuccessFeedback({
      soundEnabled: false,
      vibrateDuration: [200, 80, 200],
    })

    expect(playSoundSpy).not.toHaveBeenCalled()
    expect(vibrateSpy).toHaveBeenCalledWith([200, 80, 200])

    playSoundSpy.mockRestore()
  })

  it('prepares audio context without throwing errors', () => {
    const manager = new ScanSuccessFeedbackManager()
    expect(() => manager.prepareAudio()).not.toThrow()
  })

  it('triggers vibration on subsequent scans after resetSession is called', () => {
    const vibrateSpy = vi.fn()
    Object.defineProperty(global, 'navigator', {
      value: { vibrate: vibrateSpy },
      writable: true,
      configurable: true,
    })

    const manager = new ScanSuccessFeedbackManager()
    manager.triggerSuccessFeedback({ vibrateDuration: [200, 80, 200] })
    expect(vibrateSpy).toHaveBeenCalledTimes(1)

    manager.resetSession()
    manager.triggerSuccessFeedback({ vibrateDuration: [200, 80, 200] })
    expect(vibrateSpy).toHaveBeenCalledTimes(2)
  })
})
