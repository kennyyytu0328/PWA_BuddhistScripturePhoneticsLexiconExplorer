import { useEffect, useLayoutEffect, useRef } from 'react'
import type { PhoneticMode, Segment } from '../lib/types'
import { SutraPage } from './SutraPage'

const SETTLE_MS = 120

interface Props {
  segments: Segment[]
  mode: PhoneticMode
  activeKey: string | null
  onSelect: (key: string) => void
  /** Segment to show on mount; null starts at the head of the sutra. */
  initialSegment?: string | null
  /** Called with the segment id once scrolling has settled on a different page. */
  onPageChange?: (segmentId: string) => void
  /** Opens the 白話參考 panel of a page. */
  onOpenVernacular?: (segment: Segment) => void
}

const supportsScrollEnd = () => 'onscrollend' in window

const pagesOf =(container: HTMLElement) => Array.from(container.children) as HTMLElement[]

// The container is rtl, so a page is "current" when its right edge sits closest to the container's.
function currentSegment(container: HTMLElement): string | null {
  const right = container.getBoundingClientRect().right
  const [nearest] = pagesOf(container).sort(
    (a, b) => Math.abs(a.getBoundingClientRect().right - right) - Math.abs(b.getBoundingClientRect().right - right),
  )
  return nearest?.dataset.segment ?? null
}

export function SutraViewport({ segments, mode, activeKey, onSelect, initialSegment = null, onPageChange, onOpenVernacular }: Props) {
  const ref = useRef<HTMLElement>(null)
  const lastSegment = useRef(initialSegment ?? segments[0]?.id ?? null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // Restore the saved page once, on mount (empty deps on purpose): later prop changes must not scroll the reader.
  useLayoutEffect(() => {
    const target = pagesOf(ref.current!).find((page) => page.dataset.segment === initialSegment)
    target?.scrollIntoView?.({ inline: 'start', block: 'nearest', behavior: 'instant' })
  }, [])

  useEffect(() => () => clearTimeout(timer.current), [])

  const settle = () => {
    const id = currentSegment(ref.current!)
    if (!id || id === lastSegment.current) return
    lastSegment.current = id
    onPageChange?.(id)
  }

  // scrollend fires once the snap has finished; without it, a pause of SETTLE_MS stands in for the snap.
  const handleScroll = () => {
    if (supportsScrollEnd()) return
    clearTimeout(timer.current)
    timer.current = setTimeout(settle, SETTLE_MS)
  }

  return (
    <main
      className="sutra-viewport"
      data-testid="sutra-viewport"
      ref={ref}
      onScroll={handleScroll}
      onScrollEnd={supportsScrollEnd() ? settle : undefined}
    >
      {segments.map((segment) => (
        <SutraPage key={segment.id} segment={segment} mode={mode} activeKey={activeKey} onSelect={onSelect}>
          <button
            type="button"
            className="vernacular-toggle"
            data-testid="vernacular-toggle"
            onClick={() => onOpenVernacular?.(segment)}
          >
            白話參考
          </button>
        </SutraPage>
      ))}
    </main>
  )
}
