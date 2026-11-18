import { prefersReducedMotion, zenEasing } from './motion'

const TURN_MS = 700

// The newest turn per container: only it may give scroll snapping back.
const latestTurn = new WeakMap<HTMLElement, Animation[]>()

/** Horizontal offset of a transform (computed `matrix(...)` or a plain `translateX(...)`); 0 for none. */
export function translateX(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform
  const matrix = /^matrix(?:3d)?\(([^)]*)\)$/.exec(transform)
  if (matrix) {
    const values = matrix[1].split(',').map(Number)
    return (values.length === 6 ? values[4] : values[12]) || 0
  }
  return Number.parseFloat(/translateX\(([-\d.]+)px\)/.exec(transform)?.[1] ?? '') || 0
}

/**
 * Run `move` (an instant scroll), then slide every page from where `ref` was back to 0 (a transform, so scroll
 * position and snap stay exact). Reduced motion only scrolls. Returns the running animations so the caller can cancel them.
 */
function slide(container: HTMLElement, ref: HTMLElement, move: () => void): Animation[] {
  const before = ref.getBoundingClientRect().left
  move()
  if (prefersReducedMotion()) return []
  const shift = before - ref.getBoundingClientRect().left
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

/** Turn the fold to `target`: scroll it to the window's right edge at once, then slide it in. */
export function turnToPage(container: HTMLElement, target: HTMLElement): Animation[] {
  return slide(container, target, () => target.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' }))
}

export interface ColumnGeometry {
  viewLeft: number
  viewRight: number
  pageLeft: number
  pageRight: number
  cellLeft: number
  cellRight: number
  /** Distance from the page's right edge to the right edge of its first column. */
  inset: number
}

/**
 * How far the content must move right (negative: left) to bring a cell outside the window into view, as the
 * rightmost column at the first column's inset, without moving the page off any part of the window (Q-RDR-054).
 * 0 while the cell is inside the window.
 */
export function columnShift(g: ColumnGeometry): number {
  if (g.cellLeft >= g.viewLeft - 0.5 && g.cellRight <= g.viewRight + 0.5) return 0
  const wanted = g.viewRight - g.inset - g.cellRight
  return Math.min(g.viewLeft - g.pageLeft, Math.max(g.viewRight - g.pageRight, wanted))
}

/** columnShift for a cell of `page`, measured where layout and scroll put it (a running slide's transform is removed). */
export function columnOffset(container: HTMLElement, page: HTMLElement, cell: HTMLElement): number {
  const t = translateX(page)
  const view = container.getBoundingClientRect()
  const p = page.getBoundingClientRect()
  const c = cell.getBoundingClientRect()
  const first = page.querySelector('.cell')?.getBoundingClientRect() ?? c
  return columnShift({
    viewLeft: view.left,
    viewRight: view.right,
    pageLeft: p.left - t,
    pageRight: p.right - t,
    cellLeft: c.left - t,
    cellRight: c.right - t,
    inset: p.right - first.right,
  })
}

/** Move the content right by `offset` px (the rtl fold scrolls left) at once, then slide it in like a turn. */
export function slideBy(container: HTMLElement, page: HTMLElement, offset: number): Animation[] {
  return slide(container, page, () => container.scrollBy({ left: -offset, behavior: 'instant' }))
}
