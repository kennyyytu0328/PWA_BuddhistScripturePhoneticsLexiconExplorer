import { useLayoutEffect } from 'react'
import type { RefObject } from 'react'
import { readPref, writePref } from '../lib/db'

const KEY = 'peek'
const START_DELAY_MS = 500
const DURATION_MS = 1600
const PEEK_PX = 40
/**
 * A touch anywhere (the floating capsule included) or a scroll of the folds stops the nudge, which then counts as seen.
 * Touches are caught on the document in the capture phase; `scroll` does not bubble, so it is caught on the folds.
 */
const TOUCHES = ['touchstart', 'pointerdown', 'wheel'] as const

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// --ease-zen is set inline on <html> (index.html); the fallback keeps the nudge working without it.
const zenEasing = () =>
  getComputedStyle(document.documentElement).getPropertyValue('--ease-zen').trim() || 'cubic-bezier(0.19, 1, 0.22, 1)'

/**
 * First-use nudge (REQ-RDR-031): the folds slide right by PEEK_PX to show the edge of page 1, then settle back.
 * Runs once, only when the reader opens on the cover; a transform, so the scroll position and progress are untouched.
 */
export function useCoverPeek(viewport: RefObject<HTMLElement | null>, opensOnCover: boolean) {
  // Mount only (empty deps on purpose), like the page restore in SutraViewport: it is about how the reader opened.
  // A layout effect, so the listeners are in place in the same task that first puts the pages in the DOM.
  useLayoutEffect(() => {
    const el = viewport.current
    if (!opensOnCover || !el || prefersReducedMotion()) return
    let cancelled = false
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    let animations: Animation[] = []

    const stopListening = () => {
      TOUCHES.forEach((type) => document.removeEventListener(type, interrupt, { capture: true }))
      el.removeEventListener('scroll', interrupt)
    }
    const finish = () => {
      if (done) return
      done = true
      stopListening()
      void writePref(KEY, 'done')
    }
    function interrupt() {
      clearTimeout(timer)
      animations.forEach((a) => a.cancel())
      finish()
    }

    const play = () => {
      const easing = zenEasing()
      const keyframes: Keyframe[] = [
        { transform: 'translateX(0)', easing },
        { transform: `translateX(${PEEK_PX}px)`, offset: 0.4, easing },
        { transform: 'translateX(0)' },
      ]
      animations = (Array.from(el.children) as HTMLElement[]).map((page) => page.animate(keyframes, DURATION_MS))
      animations[0]?.finished.then(finish, () => undefined)
    }

    // Listen from mount, not from when the record has been read, so an early touch is not missed.
    TOUCHES.forEach((type) => document.addEventListener(type, interrupt, { capture: true, passive: true }))
    el.addEventListener('scroll', interrupt, { passive: true })
    readPref(KEY).then((seen) => {
      if (cancelled || done) return
      if (seen !== null) {
        done = true
        stopListening()
        return
      }
      timer = setTimeout(play, START_DELAY_MS)
    })

    // Unmount is not an interruption: nothing is recorded, so the nudge can still play next time.
    return () => {
      cancelled = true
      clearTimeout(timer)
      stopListening()
      animations.forEach((a) => a.cancel())
    }
  }, [])
}
