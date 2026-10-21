import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../lib/db'
import type { Ast } from '../lib/types'
import { SutraViewport } from './SutraViewport'

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

    const rect = (right: number) => ({ right }) as DOMRect

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
        expect(onPageChange).toHaveBeenCalledWith('s2')
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
        expect(onPageChange).toHaveBeenCalledWith('cover')
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
        expect(onPageChange).toHaveBeenCalledWith('s2')
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
})
