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

  useEffect(() => {
    if (cursor === null) return
    if (!playing || cursor >= timeline.steps.length) return
    const timer = setTimeout(() => {
      // Only advance the state this timer was scheduled for; a queued pause()/play() wins over a late timer.
      setState((s) => {
        if (!s.playing || s.cursor !== cursor) return s
        return cursor + 1 < timeline.steps.length ? { cursor: cursor + 1, playing: true } : IDLE
      })
    }, beatMs(paceRef.current) * timeline.steps[cursor].beats)
    return () => clearTimeout(timer)
  }, [playing, cursor, timeline])

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
