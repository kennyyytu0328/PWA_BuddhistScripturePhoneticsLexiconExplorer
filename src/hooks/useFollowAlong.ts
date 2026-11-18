import { useCallback, useEffect, useRef, useState } from 'react'
import { beatMs, startIndex, type Pace, type Timeline } from '../lib/followAlong'

interface FollowState {
  cursor: number | null
  playing: boolean
}

/**
 * Advances a cursor through the timeline, one timer per beat. The pace is read through a ref when
 * a beat is scheduled, so changing it never restarts the running beat; it applies from the next one.
 */
export function useFollowAlong(timeline: Timeline, pace: Pace) {
  const [state, setState] = useState<FollowState>({ cursor: null, playing: false })
  const paceRef = useRef(pace)
  useEffect(() => {
    paceRef.current = pace
  }, [pace])
  const { cursor, playing } = state

  useEffect(() => {
    if (!playing || cursor === null) return
    const timer = setTimeout(() => {
      setState(
        cursor + 1 < timeline.steps.length
          ? { cursor: cursor + 1, playing: true }
          : { cursor: null, playing: false },
      )
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
