import { prefersReducedMotion, zenEasing } from './motion'

const TURN_MS = 700

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
  return (Array.from(container.children) as HTMLElement[]).map((page) => page.animate(keyframes, TURN_MS))
}
