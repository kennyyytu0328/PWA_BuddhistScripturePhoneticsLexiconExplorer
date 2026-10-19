import { describe, expect, it } from 'vitest'
import {
  buildCss,
  codePointsOf,
  collectStrings,
  difference,
  isBopomofo,
  isHanOrFullwidth,
  isPrivateUse,
  isRequired,
  misplacedPunct,
  toUnicodeRange,
  uiCodePointsFromSource,
  union,
} from './fonts.ts'

const cp = (s: string) => s.codePointAt(0)!

describe('character classes', () => {
  it('requires Han, full-width punctuation and Bopomofo, not Latin', () => {
    expect(isHanOrFullwidth(cp('觀'))).toBe(true)
    expect(isHanOrFullwidth(cp('，'))).toBe(true)
    expect(isHanOrFullwidth(cp('〓'))).toBe(true)
    expect(isHanOrFullwidth(cp('ś'))).toBe(false)
    expect(isBopomofo(cp('ㄍ'))).toBe(true)
    expect(isRequired(cp('ㄍ'))).toBe(true)
    expect(isRequired(cp('a'))).toBe(false)
    expect(isPrivateUse(0xee1b)).toBe(true)
    expect(isPrivateUse(cp('觀'))).toBe(false)
  })
})

describe('code point collection', () => {
  it('collects nested strings', () => {
    expect(collectStrings({ a: 'x', b: ['y', { c: 'z' }, 1, null] })).toEqual(['x', 'y', 'z'])
  })

  it('skips control characters and private-use characters', () => {
    expect(codePointsOf(['a\nb觀'])).toEqual(new Set([cp('a'), cp('b'), cp('觀')]))
  })

  it('handles set algebra', () => {
    expect(union(new Set([1]), new Set([2]))).toEqual(new Set([1, 2]))
    expect(difference(new Set([1, 2]), new Set([2]))).toEqual(new Set([1]))
  })

  it('takes only CJK text from source and ignores comments', () => {
    const src = ['const a = "返回" // 註解字', '/* 區塊註解 */ const b = "缺字"', 'const url = "http://x.y"'].join('\n')
    expect(uiCodePointsFromSource(src)).toEqual(new Set([...'返回缺字'].map(cp)))
  })
})

describe('css output', () => {
  it('compresses runs into unicode-range', () => {
    expect(toUnicodeRange(new Set([0x4e00, 0x4e01, 0x4e02, 0x4e10, 0x41]))).toBe('U+0041,U+4E00-4E02,U+4E10')
  })

  it('emits a block-display font-face per file', () => {
    const css = buildCss([{ family: 'Noto Serif TC', file: 'a.woff2', codePoints: new Set([0x4e00]) }])
    expect(css).toContain("font-family: 'Noto Serif TC'")
    expect(css).toContain("src: url('/fonts/a.woff2') format('woff2')")
    expect(css).toContain('font-display: block')
    expect(css).toContain('unicode-range: U+4E00;')
  })
})

describe('misplacedPunct', () => {
  it('accepts upper-right glyphs and reports centred ones', () => {
    expect(misplacedPunct([{ char: '，', x: 0.82, y: 0.25 }])).toEqual([])
    const bad = misplacedPunct([{ char: '。', x: 0.5, y: 0.4 }])
    expect(bad).toHaveLength(1)
    expect(bad[0]).toContain('。')
  })
})
