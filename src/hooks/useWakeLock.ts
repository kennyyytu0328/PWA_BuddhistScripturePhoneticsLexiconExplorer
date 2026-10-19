import { useEffect } from 'react'

// CLAUDE.md §7. The system releases the lock when the page goes to the background,
// so it is requested again whenever the page becomes visible.
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        // Unmounted while the request was pending: nobody is left to release it later.
        if (cancelled) {
          lock.release()
          return
        }
        sentinel = lock
      } catch (error) {
        console.warn('Wake Lock request failed:', error)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release()
    }
  }, [active])
}
