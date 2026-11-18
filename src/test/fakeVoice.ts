import { vi } from 'vitest'
import type { Timeline } from '../lib/followAlong'
import type { VoiceTimings } from '../lib/voice'
import type { VoicePlayer } from '../lib/voicePlayer'

/** Title 0–2 s, then one character every 0.3 s. */
export function fakeTimings(timeline: Timeline): VoiceTimings {
  const count = timeline.steps.length
  return {
    audio: 'voice.mp3',
    duration: 2 + count * 0.3 + 1,
    title: { start: 0, end: 2 },
    chars: Array.from({ length: count }, (_, i) => Math.round((2 + i * 0.3) * 1000) / 1000),
    review: { voice: true },
  }
}

/** A VoicePlayer whose position follows Date.now() (vi fake timers) while playing. */
export function fakePlayer() {
  let pos = 0
  let startedAt = 0
  let playing = false
  let reject = false
  let seekError = 0
  const ended = new Set<() => void>()
  const errors = new Set<() => void>()
  const time = () => (playing ? pos + (Date.now() - startedAt) / 1000 : pos)
  const player = {
    playAt: vi.fn(async (seconds: number) => {
      if (reject) throw new DOMException('blocked', 'NotAllowedError')
      pos = seconds + seekError
      startedAt = Date.now()
      playing = true
    }),
    pause: vi.fn(() => {
      pos = time()
      playing = false
    }),
    time,
    onEnded: (listener: () => void) => {
      ended.add(listener)
      return () => void ended.delete(listener)
    },
    onError: (listener: () => void) => {
      errors.add(listener)
      return () => void errors.delete(listener)
    },
  } satisfies VoicePlayer
  return {
    player,
    isPlaying: () => playing,
    /** Jump the audio ahead without firing timers, as a throttled tab would see it. */
    skip: (seconds: number) => void (pos += seconds),
    rejectPlay: (on: boolean) => void (reject = on),
    /** Land seeks this many seconds off target (MP3 seek granularity). */
    seekOffBy: (seconds: number) => void (seekError = seconds),
    end: () => {
      playing = false
      ended.forEach((l) => l())
    },
    fail: () => errors.forEach((l) => l()),
  }
}
