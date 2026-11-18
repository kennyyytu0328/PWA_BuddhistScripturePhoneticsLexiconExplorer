import { useCallback, useEffect, useState } from 'react'
import { readPref, writePref } from '../lib/db'
import { DEFAULT_PACE, isPace, nextPace, type Pace } from '../lib/followAlong'

const KEY = 'followPace'

/** `pace` is null until the stored preference has been read, so the UI never flashes a wrong pace. */
export function useFollowPace() {
  const [pace, setPace] = useState<Pace | null>(null)

  useEffect(() => {
    let cancelled = false
    readPref(KEY).then((stored) => {
      if (!cancelled) setPace((current) => current ?? (isPace(stored) ? (Number(stored) as Pace) : DEFAULT_PACE))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const cycle = useCallback(() => {
    if (pace === null) return
    const next = nextPace(pace)
    setPace(next)
    void writePref(KEY, String(next))
  }, [pace])

  return { pace, cycle }
}
