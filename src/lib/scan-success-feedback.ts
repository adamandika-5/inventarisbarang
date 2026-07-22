/**
 * Scan Success Feedback Utility
 * Manages audio playback (/sounds/scan-success.mp3 + Web Audio API fallback),
 * vibration pattern ([200, 80, 200]), and audio unlocking for Chrome Android.
 */

export interface ScanFeedbackOptions {
  soundEnabled?: boolean
  vibrateDuration?: number | number[]
  audioUrl?: string
}

export class ScanSuccessFeedbackManager {
  private audioElement: HTMLAudioElement | null = null
  private audioContext: AudioContext | null = null
  private hasTriggeredInSession = false

  constructor(private defaultAudioUrl = '/sounds/scan-success.mp3') {}

  /**
   * Reset session state so subsequent scan attempts trigger feedback properly
   */
  public resetSession(): void {
    this.hasTriggeredInSession = false
  }

  /**
   * Unlock / Warm up AudioContext and HTMLAudioElement on user gesture (e.g. button click)
   */
  public prepareAudio(): void {
    if (typeof window === 'undefined') return

    try {
      if (!this.audioElement) {
        this.audioElement = new Audio(this.defaultAudioUrl)
        this.audioElement.preload = 'auto'
      }

      // Unlock AudioContext for Chrome Android autoplay policy
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (AudioCtx && !this.audioContext) {
        this.audioContext = new AudioCtx()
      }

      if (this.audioContext && this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(() => {})
      }
    } catch (err) {
      console.warn('Audio preparation failed non-fatally:', err)
    }
  }

  /**
   * Play HTMLAudioElement or fallback to Web Audio API synthesis
   */
  public async playSound(_audioUrl = this.defaultAudioUrl): Promise<void> {
    if (typeof window === 'undefined') return

    try {
      this.prepareAudio()

      if (this.audioElement) {
        this.audioElement.currentTime = 0
        const playPromise = this.audioElement.play()
        if (playPromise !== undefined) {
          await playPromise.catch(() => {
            // Fallback to Web Audio beep if HTMLAudioElement fails
            this.playFallbackBeep()
          })
        }
      } else {
        this.playFallbackBeep()
      }
    } catch {
      this.playFallbackBeep()
    }
  }

  /**
   * Fallback Web Audio API synthesizer tone (880Hz, 150ms)
   */
  public playFallbackBeep(frequency = 880, durationMs = 150): void {
    try {
      const ctx =
        this.audioContext ||
        (typeof window !== 'undefined' && (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
          ? new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
          : null)
      if (!ctx) return

      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }

      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = 'sine'
      osc.frequency.setValueAtTime(frequency, ctx.currentTime)

      gain.gain.setValueAtTime(0.15, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationMs / 1000)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + durationMs / 1000)
    } catch (err) {
      console.warn('Fallback audio playback failed non-fatally:', err)
    }
  }

  /**
   * Trigger vibration with pattern [200, 80, 200] or number
   */
  public triggerVibration(pattern: number | number[] = [200, 80, 200]): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern)
      }
    } catch {
      // Safely ignore unsupported environments (e.g. iOS Safari)
    }
  }

  /**
   * Execute full success feedback simultaneously
   */
  public triggerSuccessFeedback(options: ScanFeedbackOptions = {}): void {
    if (this.hasTriggeredInSession) return
    this.hasTriggeredInSession = true

    const { soundEnabled = true, vibrateDuration = [200, 80, 200], audioUrl } = options

    // 1. Play sound if enabled
    if (soundEnabled) {
      this.playSound(audioUrl).catch(() => {})
    }

    // 2. Trigger vibration pattern
    this.triggerVibration(vibrateDuration)
  }
}

export const scanSuccessFeedback = new ScanSuccessFeedbackManager()
export default scanSuccessFeedback
