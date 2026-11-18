import { prefersReducedMotion, zenEasing } from './motion'

const TURN_MS = 700

// The newest turn per container: only it may give scroll snapping back.
const latestTurn = new WeakMap<HTMLElement, Animation[]>()

/**
 * Scroll to `target` at once, then slide every page from where it was back to 0 (a transform, so scroll position
 * and snap stay exact). Reduced motion only scrolls. Returns the running animations so the caller can cancel them.
 */
export function turnToPage(container: HTMLElement, target: HTMLElement): Animation[] {
  const before = target.getBoundingClientRect().left
  target.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' })
  if (prefersReducedMotion()) return []
  const shift = before - target.getBoundingClientRect().left
  if (shift === 0) return []
  const easing = zenEasing()
  const keyframes: Keyframe[] = [{ transform: `translateX(${shift}px)`, easing }, { transform: 'translateX(0)' }]
  // Snap areas follow transforms, so the slide would make mandatory snapping drag the scroll position to another page.
  // Snapping is switched off while the slide runs; the scroll is already exact, so nothing moves when it returns.
  container.style.scrollSnapType = 'none'
  const animations = (Array.from(container.children) as HTMLElement[]).map((page) => page.animate(keyframes, TURN_MS))
  latestTurn.set(container, animations)
  const restore = () => {
    if (latestTurn.get(container) !== animations) return
    latestTurn.delete(container)
    container.style.scrollSnapType = ''
  }
  void Promise.allSettled(animations.map((a) => a.finished)).then(restore)
  return animations
}
