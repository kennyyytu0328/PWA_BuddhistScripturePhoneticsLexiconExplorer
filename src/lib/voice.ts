import { z } from 'zod'

// 原音隨誦（REQ-RDR-038）：錄音與逐字起始時間（秒，REQ-DAT-022）。相對路徑，不寫死 `/`（CLAUDE.md §5）。
export const VOICE_URL = 'data/voice.mp3'
export const VOICE_TIMINGS_URL = 'data/voice-timings.json'

const seconds = z.number().nonnegative()

export const voiceTimingsSchema = z.looseObject({
  audio: z.string(),
  duration: z.number().positive(),
  title: z.object({ start: seconds, end: seconds }),
  chars: z.array(seconds).min(1),
  review: z.looseObject({ voice: z.boolean() }),
})

export type VoiceTimings = z.infer<typeof voiceTimingsSchema>

/** The character being spoken at `seconds`: the last i with chars[i] ≤ seconds; null before the first. */
export function charIndexAt(chars: readonly number[], seconds: number): number | null {
  let lo = 0
  let hi = chars.length - 1
  if (hi < 0 || seconds < chars[0]) return null
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (chars[mid] <= seconds) lo = mid
    else hi = mid - 1
  }
  return lo
}
