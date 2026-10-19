import { useCallback } from 'react'

const TAP_MS = 12

export function useHaptics() {
  return useCallback(() => {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(TAP_MS)
  }, [])
}
