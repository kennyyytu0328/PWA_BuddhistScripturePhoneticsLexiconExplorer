import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
    render(<SutraViewport segments={ast.segments} mode="zhuyin" activeKey={null} onSelect={() => {}} />)
    expect(screen.getByTestId('sutra-viewport')).toBeTruthy()
    const pages = screen.getAllByTestId('sutra-page')
    expect(pages.map((p) => p.getAttribute('data-segment'))).toEqual(['s1', 's2'])
    expect(pages[0].querySelectorAll('[data-testid="lex-token"], [data-testid="token"], [data-testid="punct"]')).toHaveLength(3)
    expect(pages[1].textContent).toContain('空')
  })

  it('puts one 白話參考 button on each page and reports the page segment on click', () => {
    const onOpenVernacular = vi.fn()
    render(<SutraViewport segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onOpenVernacular={onOpenVernacular} />)
    const buttons = screen.getAllByTestId('vernacular-toggle')
    expect(buttons.map((b) => b.textContent)).toEqual(['白話參考', '白話參考'])
    fireEvent.click(buttons[1])
    expect(onOpenVernacular).toHaveBeenCalledWith(ast.segments[1])
  })

  it('highlights only the token whose key is active and reports key plus lex on click', () => {
    const onSelect = vi.fn()
    render(<SutraViewport segments={ast.segments} mode="none" activeKey="s2:0" onSelect={onSelect} />)
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
        return rect(this.dataset.segment ? rights[this.dataset.segment] : 400)
      })
    }

    describe('without scrollend', () => {
      const original = Object.getOwnPropertyDescriptor(window, 'onscrollend')
      beforeEach(() => Reflect.deleteProperty(window, 'onscrollend'))
      afterEach(() => original && Object.defineProperty(window, 'onscrollend', original))

      it('reports the page aligned to the right edge once scrolling settles', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
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
        render(<SutraViewport segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
        mockRights({ s1: 400, s2: 0 })
        fireEvent.scroll(screen.getByTestId('sutra-viewport'))
        act(() => vi.advanceTimersByTime(200))
        expect(onPageChange).not.toHaveBeenCalled()
      })
    })

    describe('with scrollend', () => {
      it('reports on scrollend, not after a pause mid-scroll', () => {
        const onPageChange = vi.fn()
        render(<SutraViewport segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} onPageChange={onPageChange} />)
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
      render(<SutraViewport segments={ast.segments} mode="none" activeKey={null} onSelect={() => {}} initialSegment="s2" />)
      expect(scrollIntoView).toHaveBeenCalledOnce()
      expect(scrollIntoView.mock.contexts[0]).toBe(screen.getAllByTestId('sutra-page')[1])
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView')
    })
  })
})
