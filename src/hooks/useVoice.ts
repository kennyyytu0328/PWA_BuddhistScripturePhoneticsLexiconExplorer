import { useEffect, useRef, useState } from 'react'
import { fetchJson } from '../lib/loadData'
import { VOICE_TIMINGS_URL, VOICE_URL, voiceTimingsSchema } from '../lib/voice'
import { createVoicePlayer, type Voice } from '../lib/voicePlayer'

/**
 * The whole file as a Blob, played through an object URL: the service worker answers the element's Range
 * requests with a plain 200, which leaves a URL-loaded recording unseekable, so resume would restart at 0:00.
 */
async function fetchRecording(): Promise<Blob> {
  const response = await fetch(VOICE_URL)
  if (!response.ok) throw new Error(`Failed to load ${VOICE_URL}: HTTP ${response.status}`)
  return response.blob()
}

/**
 * The recording and its timings, loaded when `enabled` turns true (the reader picks 聲 or opens a name-term drawer)
 * and kept once loaded. A failed load is tried again the next time `enabled` turns true after being false.
 * Null until loaded, or when loading fails (REQ-RDR-039: playing in 聲 then does nothing).
 */
export function useVoice(enabled: boolean): Voice | null {
  const [voice, setVoice] = useState<Voice | null>(null)
  const requested = useRef(false)

  useEffect(() => {
    if (!enabled || requested.current) return
    requested.current = true
    // No cancel flag: under StrictMode the first run is the one that loads; a late set after unmount is a no-op.
    Promise.all([fetchJson(VOICE_TIMINGS_URL, voiceTimingsSchema), fetchRecording()])
      .then(([timings, recording]) => {
        const audio = new Audio(URL.createObjectURL(recording))
        audio.preload = 'auto'
        setVoice({ player: createVoicePlayer(audio), timings })
      })
      .catch((error: unknown) => {
        requested.current = false // try again the next time `enabled` goes false then true (聲 picked again, or the next drawer opening)
        console.warn('Voice recording could not be loaded:', error)
      })
  }, [enabled])

  return voice
}
