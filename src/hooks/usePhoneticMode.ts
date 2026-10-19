import { useCallback, useEffect, useState } from 'react'
import { readPref, writePref } from '../lib/db'
import type { PhoneticMode } from '../lib/types'

export const MODE_ORDER: readonly PhoneticMode[] = ['zhuyin', 'pinyin', 'iast', 'none']
const KEY = 'phoneticMode'
const DEFAULT_MODE: PhoneticMode = 'zhuyin'

export const nextMode = (mode: PhoneticMode): PhoneticMode =>
  MODE_ORDER[(MODE_ORDER.indexOf(mode) + 1) % MODE_ORDER.length]

const isMode = (value: string | null): value is PhoneticMode => MODE_ORDER.some((m) => m === value)

/** `mode` is null until the stored preference has been read, so the UI never flashes a wrong mode. */
export function usePhoneticMode() {
  const [mode, setMode] = useState<PhoneticMode | null>(null)

  useEffect(() => {
    let cancelled = false
    readPref(KEY).then((stored) => {
      if (!cancelled) setMode((current) => current ?? (isMode(stored) ? stored : DEFAULT_MODE))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const cycle = useCallback(() => {
    if (mode === null) return
    const next = nextMode(mode)
    setMode(next)
    void writePref(KEY, next)
  }, [mode])

  return { mode, cycle }
}
