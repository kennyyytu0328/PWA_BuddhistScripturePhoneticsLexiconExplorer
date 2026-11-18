import { useCallback, useEffect, useLayoutEffect, useRef } from 'react'
import { useCoverPeek } from '../hooks/useCoverPeek'
import { COVER_PAGE } from '../lib/cover'
import { localCursor, type Timeline } from '../lib/followAlong'
import { turnToPage } from '../lib/pageTurn'
import type { PhoneticMode, Segment } from '../lib/types'
import { SutraCover } from './SutraCover'
import { SutraPage } from './SutraPage'

const SETTLE_MS = 120

interface Props {
  /** Sutra title shown on the cover. */
  title: string
  segments: Segment[]
  mode: PhoneticMode
  activeKey: string | null
  onSelect: (key: string) => void
  /** Segment (or COVER_PAGE) to show on mount; null starts at the cover. */
  initialSegment?: string | null
  /** Called with the segment id (or COVER_PAGE) once scrolling has settled on a different page. */
  onPageChange?: (segmentId: string, source: 'user' | 'auto') => void
  /** Follow-along cursor; decides each page's character states. */
  follow?: { timeline: Timeline; cursor: number } | null
  /**
   * Page holding the playing cursor; when it changes to a page other than the visible one, the fold turns there.
   * A settle on this page (including the reader swiping back onto it) is reported as 'auto'; only swipes to other pages are 'user'.
   */
  followSegment?: string | null
  /** Opens the 白話參考 panel of a page. */
  onOpenVernacular?: (segment: Segment) => void
}

const supportsScrollEnd = () => 'onscrollend' in window

const pagesOf =(container: HTMLElement) => Array.from(container.children) as HTMLElement[]

/** Horizontal offset of a transform (computed `matrix(...)` or a plain `translateX(...)`); 0 for none. */
function translateX(el: HTMLElement): number {
  const transform = getComputedStyle(el).transform
  const matrix = /^matrix(?:3d)?\(([^)]*)\)$/.exec(transform)
  if (matrix) {
    const values = matrix[1].split(',').map(Number)
    return (values.length === 6 ? values[4] : values[12]) || 0
  }
  return Number.parseFloat(/translateX\(([-\d.]+)px\)/.exec(transform)?.[1] ?? '') || 0
}

// The container is rtl, so a page is "current" when its right edge sits closest to the container's.
// Transforms (the page-turn slide) are subtracted: the page counts where layout and scroll put it.
function currentSegment(container: HTMLElement): string | null {
  const right = container.getBoundingClientRect().right
  const layoutRight = (page: HTMLElement) => page.getBoundingClientRect().right - translateX(page)
  const [nearest] = pagesOf(container).sort((a, b) => Math.abs(layoutRight(a) - right) - Math.abs(layoutRight(b) - right))
  return nearest?.dataset.segment ?? null
}

export function SutraViewport({
  title,
  segments,
  mode,
  activeKey,
  onSelect,
  initialSegment = null,
  onPageChange,
  onOpenVernacular,
  follow = null,
  followSegment = null,
}: Props) {
  const ref = useRef<HTMLElement>(null)
  const lastSegment = useRef(initialSegment ?? COVER_PAGE)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const autoTarget = useRef<string | null>(null)
  const turning = useRef<Animation[]>([])
  const previousFollow = useRef(followSegment)

  // Latest callbacks behind stable wrappers, so memoised pages are not re-rendered by a parent's new closures.
  const latest = useRef({ onSelect, onOpenVernacular, segments })
  useLayoutEffect(() => {
    latest.current = { onSelect, onOpenVernacular, segments }
  })
  const select = useCallback((key: string) => latest.current.onSelect(key), [])
  const openVernacular = useCallback((id: string) => {
    const segment = latest.current.segments.find((s) => s.id === id)
    if (segment) latest.current.onOpenVernacular?.(segment)
  }, [])

  // Restore the saved page once, on mount (empty deps on purpose): later prop changes must not scroll the reader.
  useLayoutEffect(() => {
    const target = pagesOf(ref.current!).find((page) => page.dataset.segment === initialSegment)
    target?.scrollIntoView?.({ inline: 'start', block: 'nearest', behavior: 'instant' })
  }, [])

  useEffect(
    () => () => {
      clearTimeout(timer.current)
      turning.current.forEach((a) => a.cancel())
    },
    [],
  )

  // A stored segment that no longer exists leaves the reader on the cover, so it counts as opening there.
  useCoverPeek(ref, !segments.some((segment) => segment.id === initialSegment))

  const settle = () => {
    const id = currentSegment(ref.current!)
    const auto = id === autoTarget.current || id === followSegment
    autoTarget.current = null
    if (!id || id === lastSegment.current) return
    lastSegment.current = id
    onPageChange?.(id, auto ? 'auto' : 'user')
  }

  // scrollend fires once the snap has finished; without it, a pause of SETTLE_MS stands in for the snap.
  const handleScroll = () => {
    if (supportsScrollEnd()) return
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, SETTLE_MS)
  }

  // The cursor entering another page turns the fold; an earlier turn still running is cancelled first.
  useEffect(() => {
    const changed = previousFollow.current !== followSegment
    previousFollow.current = followSegment
    if (!changed || !followSegment) return
    if (followSegment === lastSegment.current && autoTarget.current === null) return
    const target = pagesOf(ref.current!).find((page) => page.dataset.segment === followSegment)
    if (!target) return
    turning.current.forEach((a) => a.cancel())
    autoTarget.current = followSegment
    turning.current = turnToPage(ref.current!, target)
    // The instant scroll has already moved layout (the slide is only a transform), so the landing can be resolved now;
    // a turn that moved nothing fires no scrollend and would otherwise leave autoTarget stale.
    settle()
    // Runs only when followSegment changes (settle reads the latest props through the render it was created in).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [followSegment])

  return (
    <main
      className="sutra-viewport"
      data-testid="sutra-viewport"
      ref={ref}
      onScroll={handleScroll}
      onScrollEnd={supportsScrollEnd() ? settle : undefined}
    >
      <SutraCover title={title} />
      {segments.map((segment) => (
        <SutraPage
          key={segment.id}
          segment={segment}
          mode={mode}
          activeKey={activeKey}
          onSelect={select}
          followAt={follow ? localCursor(follow.timeline, segment.id, follow.cursor) : null}
          onOpenVernacular={openVernacular}
        />
      ))}
    </main>
  )
}
