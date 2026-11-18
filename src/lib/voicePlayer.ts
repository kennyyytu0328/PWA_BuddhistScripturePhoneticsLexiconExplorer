import { charIndexAt, type VoiceTimings } from './voice'

/** The recording, as the follow-along cursor needs it (REQ-RDR-038). */
export interface VoicePlayer {
  /** Seek, then play; rejects when playback cannot start. */
  playAt(seconds: number): Promise<void>
  pause(): void
  /** Current position, seconds. */
  time(): number
  /** Returns an unsubscribe function. */
  onEnded(listener: () => void): () => void
  onError(listener: () => void): () => void
}

export interface Voice {
  player: VoicePlayer
  timings: VoiceTimings
}

function listen(audio: HTMLMediaElement, type: string, listener: () => void): () => void {
  audio.addEventListener(type, listener)
  return () => audio.removeEventListener(type, listener)
}

export function createVoicePlayer(audio: HTMLMediaElement): VoicePlayer {
  return {
    playAt: async (seconds) => {
      audio.currentTime = seconds
      await audio.play()
    },
    pause: () => audio.pause(),
    time: () => audio.currentTime,
    onEnded: (listener) => listen(audio, 'ended', listener),
    onError: (listener) => listen(audio, 'error', listener),
  }
}

export interface VoiceClockHandlers {
  /** The character being spoken (never called before the first character starts). */
  onIndex(index: number): void
  onEnded(): void
  /** Playback could not start or broke off. */
  onFail(): void
}

/** Floor for the next timer, so a stalled recording polls instead of spinning. */
const MIN_DELAY_MS = 10

/**
 * Plays from `from` seconds and reports each character as the recording reaches it: one timer per
 * character, aimed at its start and re-synced from the audio position on every tick (no rAF, no timeupdate).
 * Returns a stop function that pauses the recording and clears the timer.
 */
export function startVoiceClock({ player, timings }: Voice, from: number, handlers: VoiceClockHandlers): () => void {
  const { chars } = timings
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const tick = () => {
    if (stopped) return
    const now = player.time()
    const index = charIndexAt(chars, now)
    if (index !== null) handlers.onIndex(index)
    const next = index === null ? 0 : index + 1
    if (next >= chars.length) return // the last character: `ended` finishes playback
    // Ignore float noise (2.6 - 2.3 = 0.30000000000000027) so the timer is not a whole millisecond late.
    const ms = Math.ceil((chars[next] - now) * 1000 - 1e-6)
    timer = setTimeout(tick, Math.max(MIN_DELAY_MS, ms))
  }

  const offEnded = player.onEnded(() => {
    if (!stopped) handlers.onEnded()
  })
  const offError = player.onError(() => {
    if (!stopped) handlers.onFail()
  })
  player.playAt(from).then(tick, () => {
    if (!stopped) handlers.onFail()
  })

  return () => {
    stopped = true
    clearTimeout(timer)
    offEnded()
    offError()
    player.pause()
  }
}
