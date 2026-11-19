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
  /** Paused before the end by something outside the app (headset button, media notification, a call). */
  onPause(listener: () => void): () => void
}

export interface Voice {
  player: VoicePlayer
  timings: VoiceTimings
}

function listen(audio: HTMLMediaElement, type: string, listener: () => void): () => void {
  audio.addEventListener(type, listener)
  return () => audio.removeEventListener(type, listener)
}

/** Within this of the duration counts as the end. */
const END_TOLERANCE_S = 0.05

const atEnd = (audio: HTMLMediaElement) =>
  audio.ended || (Number.isFinite(audio.duration) && audio.currentTime >= audio.duration - END_TOLERANCE_S)

export function createVoicePlayer(audio: HTMLMediaElement): VoicePlayer {
  // Only the app starts the recording: a play from the media notification or a headset while the
  // follow-along is paused would run the voice with no cursor, so it is paused again.
  let wanted = false
  audio.addEventListener('play', () => {
    if (!wanted) audio.pause()
  })
  return {
    playAt: async (seconds) => {
      wanted = true
      audio.currentTime = seconds
      await audio.play()
    },
    pause: () => {
      wanted = false
      audio.pause()
    },
    time: () => audio.currentTime,
    onEnded: (listener) => listen(audio, 'ended', listener),
    onError: (listener) => listen(audio, 'error', listener),
    // Reaching the end fires `pause` just before `ended`; that one is the end, not a pause.
    onPause: (listener) =>
      listen(audio, 'pause', () => {
        if (!atEnd(audio)) listener()
      }),
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
/** A resume further than this from its target did not seek (e.g. an unseekable source). */
const SEEK_TOLERANCE_S = 0.5

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
  const fail = () => {
    if (!stopped) handlers.onFail()
  }
  const offError = player.onError(fail)
  const offPause = player.onPause(fail)
  player.playAt(from).then(() => {
    if (Math.abs(player.time() - from) > SEEK_TOLERANCE_S) fail()
    else tick()
  }, fail)

  return () => {
    stopped = true
    clearTimeout(timer)
    offEnded()
    offError()
    offPause()
    player.pause()
  }
}

/**
 * Plays the recording from `range.from` and pauses it at `range.to`: one timer aimed at the end, re-synced from
 * the audio position on every tick (no rAF, no timeupdate). `onDone` runs once when the clip ends or breaks off
 * (ended, error, outside pause, rejected play, failed seek). The returned stop function pauses silently.
 */
export function startVoiceClip({ player }: Voice, range: { from: number; to: number }, onDone: () => void): () => void {
  let closed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const offs: (() => void)[] = []

  const close = () => {
    closed = true
    clearTimeout(timer)
    offs.forEach((off) => off())
    player.pause()
  }
  const finish = () => {
    if (closed) return
    close()
    onDone()
  }
  const tick = () => {
    if (closed) return
    const now = player.time()
    if (now >= range.to) return finish()
    // Ignore float noise so the timer is not a whole millisecond late.
    timer = setTimeout(tick, Math.max(MIN_DELAY_MS, Math.ceil((range.to - now) * 1000 - 1e-6)))
  }

  offs.push(player.onEnded(finish), player.onError(finish), player.onPause(finish))
  player.playAt(range.from).then(() => {
    if (closed) return
    if (Math.abs(player.time() - range.from) > SEEK_TOLERANCE_S) finish()
    else tick()
  }, finish)

  return () => {
    if (!closed) close()
  }
}
