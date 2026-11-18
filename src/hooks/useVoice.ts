import { useEffect, useRef, useState } from 'react'
import { fetchJson } from '../lib/loadData'
import { VOICE_TIMINGS_URL, VOICE_URL, voiceTimingsSchema } from '../lib/voice'
import { createVoicePlayer, type Voice } from '../lib/voicePlayer'

/**
 * The recording and its timings, loaded the first time `enabled` is true (the reader picks 聲) and kept after.
 * Null until loaded, or when loading fails (REQ-RDR-039: playing in 聲 then does nothing).
 */
export function useVoice(enabled: boolean): Voice | null {
  const [voice, setVoice] = useState<Voice | null>(null)
  const requested = useRef(false)

  useEffect(() => {
    if (!enabled || requested.current) return
    requested.current = true
    // No cancel flag: under StrictMode the first run is the one that loads; a late set after unmount is a no-op.
    fetchJson(VOICE_TIMINGS_URL, voiceTimingsSchema)
      .then((timings) => {
        const audio = new Audio(VOICE_URL)
        audio.preload = 'auto'
        setVoice({ player: createVoicePlayer(audio), timings })
      })
      .catch((error: unknown) => {
        requested.current = false // try again the next time 聲 is picked
        console.warn('Voice timings could not be loaded:', error)
      })
  }, [enabled])

  return voice
}
