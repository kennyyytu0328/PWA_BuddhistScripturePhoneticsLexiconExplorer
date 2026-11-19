import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Lexicon, WordToken } from '../lib/types'
import { LexiconDrawer } from './LexiconDrawer'

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
    onchange: null,
  })) as typeof window.matchMedia
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

afterEach(cleanup)

const lexicon: Lexicon = {
  source: 's',
  license: 'l',
  attribution: '出處-測試',
  entries: {
    甲: {
      senses: [
        { usg: '術語', def: ['甲一'], xr: [] },
        { usg: null, def: ['甲二', { g: 'DF-1' }], xr: ['乙', '丙'] },
      ],
    },
    乙: { senses: [{ usg: null, def: ['乙義'], xr: [] }] },
  },
}
const token: WordToken = {
  t: '甲',
  lex: '甲',
  sense: 1,
  iast: 'jia',
  chars: [{ c: '甲', py: 'jiǎ', zy: 'ㄐㄧㄚˇ' }],
}

const mount = (word: WordToken = token, onOpenChange: (open: boolean) => void = () => {}) =>
  render(<LexiconDrawer open onOpenChange={onOpenChange} lexicon={lexicon} lex="甲" token={word} />)

describe('LexiconDrawer', () => {
  it('shows headword, readings, senses (adopted first), xrefs and attribution', () => {
    mount()
    expect(screen.getByTestId('lexicon-headword').tagName).toBe('H2')
    expect(screen.getByTestId('reading-zhuyin').textContent).toBe('ㄐㄧㄚˇ')
    expect(screen.getByTestId('reading-pinyin').textContent).toBe('jiǎ')
    expect(screen.getByTestId('reading-iast').textContent).toBe('jia')
    const senses = screen.getAllByTestId('lexicon-sense')
    expect(senses.map((s) => s.dataset.adopted)).toEqual(['true', undefined])
    expect(senses[0].textContent).toContain('經文採用')
    expect(screen.getAllByTestId('lexicon-usg').map((u) => u.textContent)).toEqual(['術語'])
    expect(screen.getByTestId('lexicon-attribution').textContent).toBe('出處-測試')
    expect([...document.querySelectorAll('h3')].map((h) => h.textContent)).toEqual(['讀音', '釋義', '參見'])
  })

  it('omits the iast row when the token has none', () => {
    mount({ ...token, iast: undefined })
    expect(screen.queryByTestId('reading-iast')).toBeNull()
  })

  it('collected xref targets are buttons, others plain text; no back button at the root', () => {
    mount()
    expect(screen.getAllByTestId('lexicon-xref').map((b) => b.textContent)).toEqual(['乙'])
    expect(screen.getAllByTestId('lexicon-xref-text').map((b) => b.textContent)).toEqual(['丙'])
    expect(screen.queryByTestId('lexicon-back')).toBeNull()
  })

  it('follows an xref (no readings for it) and returns', () => {
    mount()
    fireEvent.click(screen.getByTestId('lexicon-xref'))
    expect(screen.getByTestId('lexicon-headword').textContent).toBe('乙')
    expect(screen.queryByTestId('lexicon-readings')).toBeNull()
    expect(screen.getByTestId('lexicon-attribution').textContent).toBe('出處-測試')
    fireEvent.click(screen.getByTestId('lexicon-back'))
    expect(screen.getByTestId('lexicon-headword').textContent).toBe('甲')
    expect(screen.queryByTestId('lexicon-back')).toBeNull()
  })

  it('reports close requests through onOpenChange', () => {
    const calls: boolean[] = []
    mount(token, (open) => calls.push(open))
    fireEvent.keyDown(screen.getByTestId('lexicon-drawer'), { key: 'Escape' })
    expect(calls).toEqual([false])
  })

  describe('聽', () => {
    const listenProps = (playing = false) => ({ playing, toggle: vi.fn(), stop: vi.fn() })
    const mountListen = (listen = listenProps(), onOpenChange: (open: boolean) => void = () => {}) => {
      render(<LexiconDrawer open onOpenChange={onOpenChange} lexicon={lexicon} lex="甲" token={token} listen={listen} />)
      return listen
    }

    it('root entry shows 聽 with the play label', () => {
      const listen = mountListen()
      const button = screen.getByTestId('lexicon-listen')
      expect(button.closest('[data-testid="lexicon-readings"]')).not.toBeNull()
      expect(button.textContent).toBe('聽')
      expect(button.getAttribute('aria-label')).toBe('播放讀音')
      expect(button.getAttribute('aria-pressed')).toBe('false')
      fireEvent.click(button)
      expect(listen.toggle).toHaveBeenCalledTimes(1)
    })

    it('playing shows 停 with the stop label and aria-pressed', () => {
      mountListen(listenProps(true))
      const button = screen.getByTestId('lexicon-listen')
      expect(button.textContent).toBe('停')
      expect(button.getAttribute('aria-label')).toBe('停止播放')
      expect(button.getAttribute('aria-pressed')).toBe('true')
    })

    it('no 聽 on a cross-referenced entry, back again after 返回', () => {
      mountListen()
      fireEvent.click(screen.getByTestId('lexicon-xref'))
      expect(screen.queryByTestId('lexicon-listen')).toBeNull()
      fireEvent.click(screen.getByTestId('lexicon-back'))
      expect(screen.getAllByTestId('lexicon-listen')).toHaveLength(1)
    })

    it('following an xref and closing the drawer call stop', () => {
      const closes: boolean[] = []
      const listen = mountListen(listenProps(), (open) => closes.push(open))
      fireEvent.click(screen.getByTestId('lexicon-xref'))
      expect(listen.stop).toHaveBeenCalledTimes(1)
      fireEvent.keyDown(screen.getByTestId('lexicon-drawer'), { key: 'Escape' })
      expect(closes).toEqual([false])
      expect(listen.stop).toHaveBeenCalledTimes(2)
    })

    it('no listen prop: no button', () => {
      mount()
      expect(screen.queryByTestId('lexicon-listen')).toBeNull()
    })
  })
})
