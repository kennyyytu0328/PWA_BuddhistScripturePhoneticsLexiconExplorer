import { useCallback, useEffect, useRef, useState } from 'react'
import { beatMs, startIndex, type Pace, type Timeline } from '../lib/followAlong'

interface FollowState {
  cursor: number | null
  playing: boolean
}

const IDLE: FollowState = { cursor: null, playing: false }

/**
 * `timeline` must be stable (memoized): a new identity restarts the running beat.
 * Advances a cursor through the timeline, one timer per beat. The pace is read through a ref when
 * a beat is scheduled, so changing it never restarts the running beat; it applies from the next one.
 */
export function useFollowAlong(timeline: Timeline, pace: Pace) {
  const [state, setState] = useState<FollowState>(IDLE)
  const paceRef = useRef(pace)
  useEffect(() => {
    paceRef.current = pace
  }, [pace])
  const { cursor, playing } = state
  // A shorter timeline arrived while the cursor was past its end: go idle (adjusting state during render).
  if (cursor !== null && cursor >= timeline.steps.length) setState(IDLE)

  // The beats chain themselves from the timer callback instead of waiting for a render per beat, so a long
  // stretch of elapsed time (a throttled tab, a fake clock jumping ahead) still moves the cursor the right distance.
  const cursorRef = useRef(cursor)
  useEffect(() => {
    cursorRef.current = cursor
  }, [cursor])

  useEffect(() => {
    if (!playing || cursorRef.current === null) return
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
      }, beatMs(paceRef.current) * timeline.steps[index].beats)
    }
    schedule(cursorRef.current)
    return () => clearTimeout(timer)
  }, [playing, timeline])

  const play = useCallback(
    (visible: string) =>
      setState((current) => ({ cursor: startIndex(timeline, visible, current.cursor), playing: true })),
    [timeline],
  )

  const pause = useCallback(() => setState((current) => ({ ...current, playing: false })), [])

  useEffect(() => {
    if (!playing) return
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') pause()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [playing, pause])

  return { cursor, playing, play, pause }
}
