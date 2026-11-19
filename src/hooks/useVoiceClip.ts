import { useCallback, useEffect, useRef, useState } from 'react'
import { startVoiceClip, type Voice } from '../lib/voicePlayer'

export interface VoiceClip {
  playing: boolean
  /** Starts the clip, or stops the running one. Does nothing while the recording is not loaded. */
  toggle(range: { from: number; to: number }): void
  stop(): void
}

/** Plays one slice of the recording (REQ-RDR-043); the follow-along is not involved. */
export function useVoiceClip(voice: Voice | null): VoiceClip {
  const [playing, setPlaying] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)

  const stop = useCallback(() => {
    stopRef.current?.()
    stopRef.current = null
    setPlaying(false)
  }, [])

  const toggle = useCallback(
    (range: { from: number; to: number }) => {
      if (stopRef.current) return stop()
      if (!voice) return
      const cancel = startVoiceClip(voice, range, () => {
        stopRef.current = null
        setPlaying(false)
      })
      stopRef.current = cancel
      setPlaying(true)
    },
    [voice, stop],
  )

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') stop()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [stop])

  return { playing, toggle, stop }
}
