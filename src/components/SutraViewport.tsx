import { useCallback, useEffect, useLayoutEffect, useRef, type TouchEvent } from 'react'
import { useCoverPeek } from '../hooks/useCoverPeek'
import { COVER_PAGE } from '../lib/cover'
import { localCursor, type Timeline } from '../lib/followAlong'
import { columnOffset, slideBy, translateX, turnToPage } from '../lib/pageTurn'
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

// The page holding the container's horizontal middle is "current", so a page wider than the window counts as long as
// it covers the window (Q-RDR-054); failing that (rtl), the page whose right edge sits closest to the container's.
// Transforms (the page-turn slide) are subtracted: the page counts where layout and scroll put it.
function currentSegment(container: HTMLElement): string | null {
  const view = container.getBoundingClientRect()
  const middle = (view.left + view.right) / 2
  const layout = (page: HTMLElement) => {
    const r = page.getBoundingClientRect()
    const t = translateX(page)
    return { left: r.left - t, right: r.right - t }
  }
  const pages = pagesOf(container)
  const holding = pages.find((page) => {
    const { left, right } = layout(page)
    return left <= middle && middle < right
  })
  const [nearest] = holding
    ? [holding]
    : pages.sort((a, b) => Math.abs(layout(a).right - view.right) - Math.abs(layout(b).right - view.right))
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
  const turning = useRef<Animation[]>([])
  const previousFollow = useRef(followSegment)
  // The reader's own gesture: a finger is down, or a touch scrolled the fold and that scroll has not settled since it lifted.
  const gesture = useRef({ down: false, moved: false })

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
    // A finger held still mid-swipe can settle the scroll; the gesture still lasts until it lifts.
    if (!gesture.current.down) gesture.current = { down: false, moved: false }
    const id = currentSegment(ref.current!)
    const auto = id === followSegment
    if (!id || id === lastSegment.current) return
    lastSegment.current = id
    onPageChange?.(id, auto ? 'auto' : 'user')
  }

  // scrollend fires once the snap has finished; without it, a pause of SETTLE_MS stands in for the snap.
  const handleScroll = () => {
    if (gesture.current.down) gesture.current = { down: true, moved: true }
    clearTimeout(timer.current)
    if (supportsScrollEnd()) return
    timer.current = setTimeout(settle, SETTLE_MS)
  }

  // A new touch keeps `moved`: a tap during the snap of a lifted swipe must not end that swipe's gesture.
  const handleTouchStart = () => {
    gesture.current = { ...gesture.current, down: true }
  }
  // The gesture ends when the last finger lifts. A swipe lifted with nothing left to scroll gets no further scroll
  // event, so a settle is scheduled here; any scroll that follows (the snap) clears it and settles by its own
  // scrollend or timer.
  const handleTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const down = event.touches.length > 0
    gesture.current = { ...gesture.current, down }
    if (down || !gesture.current.moved) return
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, SETTLE_MS)
  }

  // The cursor entering another page turns the fold; an earlier turn still running is cancelled first.
  useEffect(() => {
    const changed = previousFollow.current !== followSegment
    previousFollow.current = followSegment
    if (!changed || !followSegment) return
    if (followSegment === lastSegment.current) return
    const target = pagesOf(ref.current!).find((page) => page.dataset.segment === followSegment)
    if (!target) return
    turning.current.forEach((a) => a.cancel())
    turning.current = turnToPage(ref.current!, target)
    // The instant scroll has already moved layout (the slide is only a transform), so the landing can be resolved now;
    // a turn that moved nothing fires no scrollend, so it is settled here.
    settle()
    // Runs only when followSegment changes (settle reads the latest props through the render it was created in).
    // oxlint-disable-next-line react-hooks/exhaustive-deps
  }, [followSegment])

  // On a page wider than the window, a cursor reaching a column outside it slides that column into view (Q-RDR-054).
  // Runs after the turn effect above, so a turn has already landed the new page; never fights the reader's own swipe.
  const cursor = follow?.cursor ?? null
  useEffect(() => {
    if (gesture.current.down || gesture.current.moved) return
    if (!followSegment || followSegment !== lastSegment.current || cursor === null) return
    const page = pagesOf(ref.current!).find((p) => p.dataset.segment === followSegment)
    const cell = page?.querySelector<HTMLElement>('[data-follow="current"]')
    if (!page || !cell) return
    const offset = columnOffset(ref.current!, page, cell)
    if (offset === 0) return
    turning.current.forEach((a) => a.cancel())
    turning.current = slideBy(ref.current!, page, offset)
  }, [cursor, followSegment])

  return (
    <main
      className="sutra-viewport"
      data-testid="sutra-viewport"
      ref={ref}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
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
