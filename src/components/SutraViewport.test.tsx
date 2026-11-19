import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Ast } from '../lib/types'
import { buildTimeline } from '../lib/followAlong'
import { columnOffset, slideBy, turnToPage } from '../lib/pageTurn'
import { SutraViewport } from './SutraViewport'

vi.mock('../lib/pageTurn', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/pageTurn')>()),
  turnToPage: vi.fn(() => []),
  columnOffset: vi.fn(() => 0),
  slideBy: vi.fn(() => []),
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const char = (c: string) => ({ c, py: 'x', zy: 'ㄅ' })
const ast: Ast = {
  id: 'x',
  title: 'x',
  segments: [
    {
      id: 's1',
      vernacular: 'v1',
      themes: [],
      reflection: 'r1',
      tokens: [
        { t: '觀', lex: '觀', sense: 0, chars: [char('觀')] },
        { t: '，', punct: true },
        { t: '照', chars: [char('照')] },
      ],
    },
    { id: 's2', vernacular: 'v2', themes: [], reflection: 'r2', tokens: [{ t: '空', lex: '空', sense: 0, chars: [char('空')] }] },
  ],
}

describe('SutraViewport', () => {
  it('renders one page per segment in order, holding that segment tokens', () => {
    render(<SutraViewport title={ast.title} segments={ast.segments} mode="zhuyin" activeKey={null} onSelect={() => {}} />)
    expect(screen.getByTestId('sutra-viewport')).toBeTruthy()
    const pages = screen.getAllByTestId('sutra-page')
    expect(pages.map((p) => p.getAttribute('data-segment'))).toEqual(['s1', 's2'])
    expect(pages[0].querySelectorAll('[data-testid="lex-token"], [data-testid="token"], [data-testid="punct"]')).toHaveLength(3)
    expect(pages[1].textContent).toContain('空')
  })

  it('opens with the cover before the first page: title and translator, no annotations or controls', () => {
    render(<SutraViewport title="般若波羅蜜多心經" segments={ast.segments} mode="zhuyin" activeKey={null} onSelect={() => {}} />)
    const cover = screen.getByTestId('sutra-cover')
    expect(screen.getByTestId('sutra-viewport').firstElementChild).toBe(cover)
    expect(cover.getAttribute('data-segment')).toBe('cover')
    expect(screen.getByTestId('cover-title').textContent).toBe('般若波羅蜜多心經')
    expect(screen.getByTestId('cover-translator').textContent).toBe('唐　三藏法師玄奘　譯')
    expect(cover.querySelectorAll('ruby, rt, button')).toHaveLength(0)
  })

  it('puts one 白話參考 button on each page and reports the page segment on click', () => {
    const onOpenVernacular = vi.fn()
    render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onOpenVernacular={onOpenVernacular} />)
    const buttons = screen.getAllByTestId('vernacular-toggle')
    expect(buttons.map((b) => b.textContent)).toEqual(['白話參考', '白話參考'])
    fireEvent.click(buttons[1])
    expect(onOpenVernacular).toHaveBeenCalledWith(ast.segments[1])
  })

  it('highlights only the token whose key is active and reports key plus lex on click', () => {
    const onSelect = vi.fn()
    render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey="s2:0" onSelect={onSelect} />)
    const tokens = screen.getAllByTestId('lex-token')
    expect(tokens.map((t) => t.getAttribute('data-active'))).toEqual([null, 'true'])
    fireEvent.click(tokens[0])
    expect(onSelect).toHaveBeenCalledWith('s1:0')
  })

  describe('progress', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    // a window-wide fold (or the 400px window itself) ending at `right`
    const rect = (right: number) => ({ left: right - 400, right }) as DOMRect

    function mockRights(rights: Record<string, number>) {
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        // folds missing from `rights` lie far off-screen
        return rect(this.dataset.segment ? (rights[this.dataset.segment] ?? -10_000) : 400)
      })
    }

    describe('without scrollend', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'onscrollend')
      beforeEach(() => Reflect.deleteProperty(window, 'onscrollend'))
      afterEach(() => original && Object.defineProperty(window, 'onscrollend', original))

      it('reports the page aligned to the right edge once scrolling settles', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
        mockRights({ s1: 800, s2: 401 })
        const viewport = screen.getByTestId('sutra-viewport')
        fireEvent.scroll(viewport)
        fireEvent.scroll(viewport)
        expect(onPageChange).not.toHaveBeenCalled()
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledOnce()
        expect(onPageChange).toHaveBeenCalledWith('s2', 'user')
      })

      it('does not report when the page did not change', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
        mockRights({ cover: 400, s1: 0 })
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).not.toHaveBeenCalled()
      })

      it('reports the cover when scrolled back to it', () => {
        const onPageChange = vi.fn()
        render(
          <SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s1" onPageChange={onPageChange} />,
        )
        mockRights({ cover: 400, s1: 0 })
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledWith('cover', 'user')
      })

      it('a page wider than twice the window, scrolled to its last column, is still the page in view', () => {
        const onPageChange = vi.fn()
        render(
          <SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s1" onPageChange={onPageChange} />,
        )
        // Window 0..400; s1 spans 0..900 (its right edge is 500px away), s2 ends at 0 (its right edge 400px away).
        const spans: Record<string, [number, number]> = { cover: [900, 1300], s1: [0, 900], s2: [-400, 0] }
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          const [left, right] = this.dataset.segment ? spans[this.dataset.segment] : [0, 400]
          return { left, right } as DOMRect
        })
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).not.toHaveBeenCalled()
      })
    })

    describe('with scrollend', () => {
      it('reports on scrollend, not after a pause mid-scroll', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
        mockRights({ s1: 800, s2: 401 })
        const viewport = screen.getByTestId('sutra-viewport')
        fireEvent.scroll(viewport)
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).not.toHaveBeenCalled()
        fireEvent(viewport, new Event('scrollend'))
        expect(onPageChange).toHaveBeenCalledOnce()
        expect(onPageChange).toHaveBeenCalledWith('s2', 'user')
      })
    })

    it('scrolls the stored segment into view on mount', () => {
      const scrollIntoView = vi.fn()
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
      render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s2" />)
      expect(scrollIntoView).toHaveBeenCalledOnce()
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getAllByTestId('sutra-page')[1])
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    })
  })

  describe('first-use nudge (REQ-RDR-031)', () => {
    const animate = vi.fn(() => ({ cancel: () => {}, finished: new Promise(() => {}) }) as unknown as Animation)
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

    // Earlier tests scroll the viewport, which records the nudge as seen.
    beforeEach(async () => {
      await db.prefs.clear()
      HTMLElement.prototype.animate = animate
    })
    afterEach(async () => {
      animate.mockClear()
      Reflect.deleteProperty(HTMLElement.prototype, 'animate')
      await db.prefs.clear()
    })

    it('nudges when a stored segment no longer exists, since the reader stays on the cover', async () => {
      render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s99" />)
      await waitFor(() => expect(animate).toHaveBeenCalled(), { timeout: 2000 })
    })

    it('does not nudge when the reader opens on a stored page', async () => {
      render(<SutraViewport title={ast.title} segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s2" />)
      await sleep(700)
      expect(animate).not.toHaveBeenCalled()
    })
  })

  describe('follow along', () => {
    const timeline = buildTimeline(ast.segments)
    const props = { title: ast.title, segments: ast.segments, mode: 'none' as const, activeKey: null, onSelect: () => {} }
    const markOf = (page: HTMLElement) => Array.from(page.querySelectorAll('[data-follow]')).map((e) => e.getAttribute('data-follow'))

    it('marks pages from the cursor: read before, one current, ahead after', () => {
      render(<SutraViewport {...props} follow={{ timeline, cursor: timeline.startOf.s2 }} />)
      const [p1, p2] = screen.getAllByTestId('sutra-page')
      expect(new Set(markOf(p1))).toEqual(new Set(['read']))
      expect(markOf(p2).filter((m) => m === 'current')).toHaveLength(1)
    })

    describe('columns outside the window', () => {
      beforeEach(() => {
        vi.mocked(columnOffset).mockReset().mockReturnValue(0)
        vi.mocked(slideBy).mockReset().mockReturnValue([])
      })
      const at = timeline.startOf.s1 + 1

      it('slides the fold by the offset of the cursor cell while playing on the cursor page', () => {
        vi.mocked(columnOffset).mockReturnValue(120)
        render(<SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor: at }} followSegment="s1" />)
        const page = screen.getAllByTestId('sutra-page')[0]
        expect(columnOffset).toHaveBeenCalled()
        const [container, measuredPage, cell] = vi.mocked(columnOffset).mock.calls[0]
        expect(container).toBe(screen.getByTestId('sutra-viewport'))
        expect(measuredPage).toBe(page)
        expect(cell.getAttribute('data-follow')).toBe('current')
        expect(slideBy).toHaveBeenCalledWith(screen.getByTestId('sutra-viewport'), page, 120)
      })

      it('does not slide while the cursor cell is in view', () => {
        render(<SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor: at }} followSegment="s1" />)
        expect(columnOffset).toHaveBeenCalled()
        expect(slideBy).not.toHaveBeenCalled()
      })

      it('does not follow columns while paused', () => {
        vi.mocked(columnOffset).mockReturnValue(120)
        render(<SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor: at }} followSegment={null} />)
        expect(slideBy).not.toHaveBeenCalled()
      })

      it('cancels a running slide before starting the next one', () => {
        const cancel = vi.fn()
        vi.mocked(columnOffset).mockReturnValue(120)
        vi.mocked(slideBy).mockReturnValueOnce([{ cancel } as unknown as Animation])
        const { rerender } = render(<SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor: at - 1 }} followSegment="s1" />)
        rerender(<SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor: at }} followSegment="s1" />)
        expect(cancel).toHaveBeenCalled()
        expect(slideBy).toHaveBeenCalledTimes(2)
      })

      describe('while the reader touches the fold', () => {
        beforeEach(() => {
          Reflect.deleteProperty(window, 'onscrollend')
          vi.useFakeTimers()
        })
        afterEach(() => vi.useRealTimers())

        const view = (cursor: number) => (
          <SutraViewport {...props} initialSegment="s1" follow={{ timeline, cursor }} followSegment="s1" />
        )
        // The window and s1 at 0..400, every other fold far off-screen: swipes settle back on the cursor page.
        const onS1 = () =>
          vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
            const onScreen = !this.dataset.segment || this.dataset.segment === 's1'
            return { left: onScreen ? 0 : -10_000, right: onScreen ? 400 : -9_600 } as DOMRect
          })
        // s1 of the fixture has two characters, at - 1 and at; stepping between them re-runs the follow effect.
        const swipeStarted = () => {
          const rendered = render(view(at - 1))
          onS1()
          vi.mocked(columnOffset).mockReturnValue(120)
          const viewport = screen.getByTestId('sutra-viewport')
          fireEvent.touchStart(viewport)
          fireEvent.scroll(viewport)
          return { ...rendered, viewport }
        }

        it('does not slide during a swipe, and follows again once the swipe has settled', () => {
          const { rerender, viewport } = swipeStarted()
          rerender(view(at))
          fireEvent.touchEnd(viewport)
          rerender(view(at - 1))
          expect(slideBy).not.toHaveBeenCalled()
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at))
          expect(slideBy).toHaveBeenCalledOnce()
        })

        it('a finger held still mid-swipe keeps the gesture until it lifts, even when the scroll settles meanwhile', () => {
          const { rerender, viewport } = swipeStarted()
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at))
          expect(slideBy).not.toHaveBeenCalled()
          fireEvent.touchEnd(viewport)
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at - 1))
          expect(slideBy).toHaveBeenCalledOnce()
        })

        it('a tap during the snap of a lifted swipe keeps the gesture until the snap settles', () => {
          const { rerender, viewport } = swipeStarted()
          fireEvent.touchEnd(viewport)
          fireEvent.touchStart(viewport)
          fireEvent.touchEnd(viewport)
          rerender(view(at))
          expect(slideBy).not.toHaveBeenCalled()
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at - 1))
          expect(slideBy).toHaveBeenCalledOnce()
        })

        it('a second finger lifting mid-swipe keeps the gesture while the first is still down', () => {
          const { rerender, viewport } = swipeStarted()
          fireEvent.touchStart(viewport)
          fireEvent.touchEnd(viewport, { touches: [{ identifier: 0, clientX: 100, clientY: 100 }] })
          fireEvent.scroll(viewport)
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at))
          expect(slideBy).not.toHaveBeenCalled()
        })

        it('a cancelled touch ends the gesture like a lifted one', () => {
          const { rerender, viewport } = swipeStarted()
          fireEvent.touchCancel(viewport)
          act(() => vi.advanceTimersByTime(200))
          rerender(view(at))
          expect(slideBy).toHaveBeenCalledOnce()
        })

        it('with scrollend, the gesture ends at the scrollend after the finger lifts', () => {
          Object.defineProperty(window, 'onscrollend', { configurable: true, writable: true, value: null })
          try {
            const { rerender, viewport } = swipeStarted()
            fireEvent.touchEnd(viewport)
            // the snap after the lift scrolls on: the lift's fallback settle must not end the gesture mid-snap
            fireEvent.scroll(viewport)
            act(() => vi.advanceTimersByTime(200))
            rerender(view(at))
            expect(slideBy).not.toHaveBeenCalled()
            fireEvent(viewport, new Event('scrollend'))
            rerender(view(at - 1))
            expect(slideBy).toHaveBeenCalledOnce()
          } finally {
            Reflect.deleteProperty(window, 'onscrollend')
          }
        })

        it('a tap (touch without scrolling) does not stop the following', () => {
          const { rerender } = render(view(at - 1))
          vi.mocked(columnOffset).mockReturnValue(120)
          const viewport = screen.getByTestId('sutra-viewport')
          fireEvent.touchStart(viewport)
          fireEvent.touchEnd(viewport)
          rerender(view(at))
          expect(slideBy).toHaveBeenCalledOnce()
        })
      })
    })

    describe('page turn', () => {
      beforeEach(() => {
        vi.mocked(turnToPage).mockClear()
        Reflect.deleteProperty(window, 'onscrollend')
        vi.useFakeTimers()
      })
      afterEach(() => vi.useRealTimers())

      // a window-wide fold (or the 400px window itself) ending at `right`
      const rect = (right: number) => ({ left: right - 400, right }) as DOMRect
      const atS2 = () =>
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          return rect(this.dataset.segment ? (this.dataset.segment === 's2' ? 400 : 800) : 400)
        })

      it('turns once when followSegment moves to another page, and the landing is reported as auto', () => {
        const onPageChange = vi.fn()
        const { rerender } = render(<SutraViewport {...props} followSegment="s1" onPageChange={onPageChange} />)
        expect(turnToPage).not.toHaveBeenCalled()
        rerender(<SutraViewport {...props} followSegment="s2" onPageChange={onPageChange} />)
        expect(turnToPage).toHaveBeenCalledOnce()
        expect(vi.mocked(turnToPage).mock.calls[0][1]).toBe(screen.getAllByTestId('sutra-page')[1])
        atS2()
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledWith('s2', 'auto')
      })

      it('cancels the animations of the previous turn before starting a new one', () => {
        const cancel = vi.fn()
        vi.mocked(turnToPage).mockReturnValueOnce([{ cancel } as unknown as Animation])
        const { rerender } = render(<SutraViewport {...props} followSegment="s1" />)
        rerender(<SutraViewport {...props} followSegment="s2" />)
        rerender(<SutraViewport {...props} followSegment={null} />)
        rerender(<SutraViewport {...props} followSegment="s1" />)
        expect(cancel).toHaveBeenCalled()
      })

      it('attributes the settle to the follow page by layout position: transformed (old-page) rects do not hide the landing', () => {
        const onPageChange = vi.fn()
        const { rerender } = render(<SutraViewport {...props} followSegment="s1" onPageChange={onPageChange} />)
        rerender(<SutraViewport {...props} followSegment="s2" onPageChange={onPageChange} />)
        onPageChange.mockClear()
        // Mid-slide: s2 is laid out at the edge (400) but translated 400px away; s1 appears at the edge.
        const pages = screen.getAllByTestId('sutra-page')
        pages[1].style.transform = 'translateX(400px)'
        pages[0].style.transform = 'translateX(400px)'
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          const seg = this.dataset.segment
          return rect(seg === 's2' ? 800 : seg === 's1' ? 400 : seg ? -10_000 : 400)
        })
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledWith('s2', 'auto')
      })

      it('a turn that moves nothing is settled at once: a later swipe to another page is a user swipe', () => {
        const onPageChange = vi.fn()
        // layout already has the cover at the edge, so nothing moves and no scrollend would follow
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
          return rect(this.dataset.segment === 'cover' ? 400 : this.dataset.segment ? 800 : 400)
        })
        const { rerender } = render(<SutraViewport {...props} followSegment="s1" onPageChange={onPageChange} />)
        rerender(<SutraViewport {...props} followSegment="s2" onPageChange={onPageChange} />)
        rerender(<SutraViewport {...props} followSegment={null} onPageChange={onPageChange} />)
        atS2()
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledWith('s2', 'user')
      })

      it('reports a settle with no followSegment change as user', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport {...props} followSegment="s1" onPageChange={onPageChange} />)
        atS2()
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).toHaveBeenCalledWith('s2', 'user')
      })
    })
  })
})

describe('SutraViewport back to the cover', () => {
  const props = { title: ast.title, segments: ast.segments, mode: 'none' as const, activeKey: null, onSelect: () => {} }
  const rect = (right: number) => ({ left: right - 400, right }) as DOMRect

  beforeEach(() => vi.mocked(turnToPage).mockClear())

  it('shows a 回到經首 button on the last page only', () => {
    render(<SutraViewport {...props} />)
    const pages = screen.getAllByTestId('sutra-page')
    expect(pages[0].querySelector('[data-testid="back-to-cover"]')).toBeNull()
    const button = pages[1].querySelector<HTMLButtonElement>('button[data-testid="back-to-cover"]')
    expect(button?.textContent).toBe('回到經首')
    expect(screen.getAllByTestId('back-to-cover')).toHaveLength(1)
    expect(screen.getByTestId('sutra-cover').querySelector('[data-testid="back-to-cover"]')).toBeNull()
  })

  it('turns the fold to the cover and reports the landing as a user page change', () => {
    const onPageChange = vi.fn()
    render(<SutraViewport {...props} initialSegment="s2" onPageChange={onPageChange} followSegment="s2" />)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return rect(this.dataset.segment === 'cover' ? 400 : this.dataset.segment ? -400 : 400)
    })
    fireEvent.click(screen.getByTestId('back-to-cover'))
    expect(turnToPage).toHaveBeenCalledOnce()
    expect(vi.mocked(turnToPage).mock.calls[0][1]).toBe(screen.getByTestId('sutra-cover'))
    expect(onPageChange).toHaveBeenCalledWith('cover', 'user')
  })

  it('cancels a running turn before turning back', () => {
    const cancel = vi.fn()
    vi.mocked(turnToPage).mockReturnValueOnce([{ cancel } as unknown as Animation])
    const { rerender } = render(<SutraViewport {...props} followSegment="s1" />)
    rerender(<SutraViewport {...props} followSegment="s2" />)
    fireEvent.click(screen.getByTestId('back-to-cover'))
    expect(cancel).toHaveBeenCalled()
  })
})
