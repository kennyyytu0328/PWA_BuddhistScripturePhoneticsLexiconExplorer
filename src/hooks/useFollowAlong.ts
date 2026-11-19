import { useCallback, useEffect, useRef, useState } from 'react'
import { COVER_PAGE } from '../lib/cover'
import { beatMs, DEFAULT_PACE, startIndex, type FollowMode, type Timeline } from '../lib/followAlong'
import { startVoiceClock, type Voice } from '../lib/voicePlayer'

interface FollowState {
  cursor: number | null
  playing: boolean
}

const IDLE: FollowState = { cursor: null, playing: false }

/**
 * `timeline` and `voice` must be stable (memoized): a new identity restarts the running driver.
 * Timed modes advance a cursor through the timeline, one timer per beat. The pace is read through a ref when
 * a beat is scheduled, so changing it never restarts the running beat; it applies from the next one.
 * In 'voice' the recording drives the cursor (REQ-RDR-038); pressing play on the cover plays the title first,
 * with a null cursor. Entering or leaving 'voice' while playing pauses (REQ-RDR-039).
 */
export function useFollowAlong(timeline: Timeline, mode: FollowMode, voice: Voice | null = null) {
  const [state, setState] = useState<FollowState>(IDLE)
  const isVoice = mode === 'voice'
  const paceRef = useRef(mode)
  useEffect(() => {
    paceRef.current = mode
  }, [mode])
  // Timed and voice playback run on different clocks: switching between them pauses (adjusting state during render).
  const [wasVoice, setWasVoice] = useState(isVoice)
  if (wasVoice !== isVoice) {
    setWasVoice(isVoice)
    if (state.playing) setState({ ...state, playing: false })
  }
  // A shorter timeline arrived while the cursor was past its end: go idle (adjusting state during render)
  // and hand callers an idle state in this same render, so no one indexes the timeline out of range.
  const outOfRange = state.cursor !== null && state.cursor >= timeline.steps.length
  if (outOfRange) setState(IDLE)
  const { cursor, playing } = outOfRange ? IDLE : state

  // The beats chain themselves from the timer callback instead of waiting for a render per beat, so a long
  // stretch of elapsed time (a throttled tab, a fake clock jumping ahead) still moves the cursor the right distance.
  const cursorRef = useRef(cursor)
  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    if (!playing || isVoice || cursorRef.current === null) return
    const pace = () => (paceRef.current === 'voice' ? DEFAULT_PACE : paceRef.current) // never 'voice' here
    let timer: ReturnType<typeof setTimeout> | undefined
    const schedule = (index: number) => {
      if (index >= timeline.steps.length) return
      timer = setTimeout(() => {
        const next = index + 1
        // Only advance the state this timer was scheduled for; a queued pause()/play() wins over a late timer.
        setState((s) => {
          if (!s.playing || s.cursor !== index) return s
          return next < timeline.steps.length ? { cursor: next, playing: true } : IDLE
        })
        if (next < timeline.steps.length) schedule(next)
      }, beatMs(pace()) * timeline.steps[index].beats)
    }
    schedule(cursorRef.current)
    return () => clearTimeout(timer)
  }, [playing, timeline, isVoice])

  const end = useCallback(() => setState((current) => (current === IDLE ? current : IDLE)), [])

  const pause = useCallback(() => setState((current) => (current.playing ? { ...current, playing: false } : current)), [])

  useEffect(() => {
    if (!playing || !isVoice || voice === null) return
    const cursorAtStart = cursorRef.current
    const from = cursorAtStart === null ? voice.timings.title.start : voice.timings.chars[cursorAtStart]
    return startVoiceClock(voice, from, {
      // Never step back: a seek may land a hair before the cursor character.
      onIndex: (index) =>
        setState((s) => (s.playing && (s.cursor === null || index > s.cursor) ? { cursor: index, playing: true } : s)),
      onEnded: () => setState((s) => (s.playing ? IDLE : s)),
      onFail: pause,
    })
  }, [playing, isVoice, voice, pause])

  const play = useCallback(
    (visible: string) => {
      if (isVoice && voice === null) return // not loaded yet (REQ-RDR-039)
      setState((current) => {
        if (isVoice && visible === COVER_PAGE) return { cursor: null, playing: true } // the title first
        return { cursor: startIndex(timeline, visible, current.cursor), playing: true }
      })
    },
    [timeline, isVoice, voice],
  )

  useEffect(() => {
    if (!playing) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [playing, pause])

  return { cursor, playing, play, pause, end }
}
