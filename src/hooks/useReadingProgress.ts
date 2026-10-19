import { useCallback, useEffect, useState } from 'react'
import { readPref, writePref } from '../lib/db'

const KEY = 'progress'

/** `loaded` flips once the stored segment id has been read; `initial` is null on first use. */
export function useReadingProgress() {
  const [state, setState] = useState<{ loaded: boolean; initial: string | null }>({ loaded: false, initial: null })

  useEffect(() => {
    let cancelled = false
    readPref(KEY).then((initial) => {
      if (!cancelled) setState({ loaded: true, initial })
    })
    return () => {
      cancelled = true
    }
  }, [])

  const save = useCallback((segmentId: string) => void writePref(KEY, segmentId), [])

  return { ...state, save }
}
