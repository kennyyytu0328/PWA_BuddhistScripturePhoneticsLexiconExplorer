import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { WordToken } from '../lib/types'
import { Token } from './Token'

afterEach(cleanup)

const plain: WordToken = {
  t: '照見',
  chars: [
    { c: '照', py: 'zhào', zy: 'ㄓㄠˋ' },
    { c: '見', py: 'jiàn', zy: 'ㄐㄧㄢˋ' },
  ],
}
const lex: WordToken = {
  t: '觀自在',
  lex: '觀自在',
  sense: 0,
  iast: 'Avalokiteśvara',
  chars: [
    { c: '觀', py: 'guān', zy: 'ㄍㄨㄢ' },
    { c: '自', py: 'zì', zy: 'ㄗˋ' },
    { c: '在', py: 'zài', zy: 'ㄗㄞˋ' },
  ],
}
const rts = (container: HTMLElement) => [...container.querySelectorAll('rt')].map((el) => el.textContent)
const noop = () => {}

describe('Token', () => {
  it('renders punctuation as an inert zh-Hans span', () => {
    const { container } = render(<Token token={{ t: '，', punct: true }} mode="zhuyin" active={false} onSelect={noop} />)
    const el = screen.getByTestId('punct')
    expect(el.tagName).toBe('SPAN')
    expect(el.getAttribute('lang')).toBe('zh-Hans')
    expect(el.textContent).toBe('，')
    expect(container.querySelector('ruby, rt, button')).toBeNull()
  })

  it('renders a token without lex as a span, not a button', () => {
    render(<Token token={plain} mode="zhuyin" active={false} onSelect={noop} />)
    const el = screen.getByTestId('token')
    expect(el.tagName).toBe('SPAN')
    expect(el.getAttribute('tabindex')).toBeNull()
    expect(el.getAttribute('role')).toBeNull()
  })

  it('renders a token with lex as a type=button button carrying data-lex', () => {
    render(<Token token={lex} mode="zhuyin" active={false} onSelect={noop} />)
    const el = screen.getByTestId('lex-token')
    expect(el.tagName).toBe('BUTTON')
    expect(el.getAttribute('type')).toBe('button')
    expect(el.getAttribute('data-lex')).toBe('觀自在')
    expect(el.hasAttribute('data-active')).toBe(false)
  })

  it('marks the active token', () => {
    render(<Token token={lex} mode="zhuyin" active onSelect={noop} />)
    expect(screen.getByTestId('lex-token').getAttribute('data-active')).toBe('true')
  })

  it('calls onSelect with the lex when a lex token is clicked', () => {
    const onSelect = vi.fn()
    render(<Token token={lex} mode="zhuyin" active={false} onSelect={onSelect} />)
    fireEvent.click(screen.getByTestId('lex-token'))
    expect(onSelect).toHaveBeenCalledWith('觀自在')
  })

  it.each([
    ['zhuyin', ['ㄓㄠˋ', 'ㄐㄧㄢˋ']],
    ['pinyin', ['zhào', 'jiàn']],
    ['none', []],
    ['iast', []],
  ] as const)('%s mode: one ruby per char with the matching rt', (mode, expected) => {
    const { container } = render(<Token token={plain} mode={mode} active={false} onSelect={noop} />)
    expect(rts(container)).toEqual(expected)
    expect(container.querySelectorAll('ruby')).toHaveLength(mode === 'zhuyin' || mode === 'pinyin' ? 2 : 0)
  })

  it('iast mode annotates the whole token once, only when iast exists', () => {
    const { container } = render(<Token token={lex} mode="iast" active={false} onSelect={noop} />)
    expect(container.querySelectorAll('ruby')).toHaveLength(1)
    expect(rts(container)).toEqual(['Avalokiteśvara'])
    expect(container.querySelector('ruby')?.textContent?.replace('Avalokiteśvara', '')).toBe('觀自在')
  })

  it('none mode renders no rt at all', () => {
    const { container } = render(<Token token={lex} mode="none" active={false} onSelect={noop} />)
    expect(container.querySelectorAll('rt')).toHaveLength(0)
    expect(screen.getByTestId('lex-token').textContent).toBe('觀自在')
  })

  it('splits the zhuyin tone mark into its own element while rt text stays equal to zy', () => {
    const { container } = render(<Token token={lex} mode="zhuyin" active={false} onSelect={noop} />)
    expect(rts(container)).toEqual(['ㄍㄨㄢ', 'ㄗˋ', 'ㄗㄞˋ'])
    expect([...container.querySelectorAll('.zy-tone')].map((e) => e.textContent)).toEqual(['ˋ', 'ˋ'])
  })

  it('gives every mode the same cell sizes', () => {
    const heights = (mode: 'zhuyin' | 'pinyin' | 'iast' | 'none') => {
      const { container, unmount } = render(<Token token={lex} mode={mode} active={false} onSelect={noop} />)
      const list = [...container.querySelectorAll<HTMLElement>('.cell')].map((e) => e.style.paddingTop)
      unmount()
      return list
    }
    const expected = heights('zhuyin')
    expect(expected).toHaveLength(3)
    for (const mode of ['pinyin', 'iast', 'none'] as const) expect(heights(mode)).toEqual(expected)
  })

  it('renders a light-tone dot above the zhuyin symbols', () => {
    const light: WordToken = { t: '的', chars: [{ c: '的', py: 'de', zy: '˙ㄉㄜ' }] }
    const { container } = render(<Token token={light} mode="zhuyin" active={false} onSelect={noop} />)
    expect(container.querySelector('.zy-light')?.textContent).toBe('˙')
    expect(rts(container)).toEqual(['˙ㄉㄜ'])
  })
})
