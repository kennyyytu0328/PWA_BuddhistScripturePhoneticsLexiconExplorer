import { describe, expect, it } from 'vitest'
import {
  BASE_LENGTH,
  MIN_TOUCH_LENGTH,
  RT_GAP,
  TOUCH_MARGIN,
  cellLengths,
  latinLength,
  zhuyinLength,
  zhuyinParts,
} from './rubyLayout'
import type { WordToken } from './types'

describe('zhuyinParts', () => {
  it('splits a trailing tone mark off the symbols', () => {
    expect(zhuyinParts('ㄗㄞˋ')).toEqual({ light: false, symbols: 'ㄗㄞ', tone: 'ˋ' })
    expect(zhuyinParts('ㄍㄨㄢ')).toEqual({ light: false, symbols: 'ㄍㄨㄢ', tone: '' })
  })

  it('recognises the light tone dot above the symbols', () => {
    expect(zhuyinParts('˙ㄉㄜ')).toEqual({ light: true, symbols: 'ㄉㄜ', tone: '' })
  })

  it('keeps a lone tone-like symbol as a symbol', () => {
    expect(zhuyinParts('ˋ')).toEqual({ light: false, symbols: 'ˋ', tone: '' })
  })
})

describe('lengths', () => {
  it('stacks symbols at 10px each, tone excluded, plus the gap to the next annotation', () => {
    expect(RT_GAP).toBe(6)
    expect(zhuyinLength('ㄍㄨㄢ')).toBe(36)
    expect(zhuyinLength('ㄗㄞˋ')).toBe(26)
    expect(zhuyinLength('˙ㄉㄜ')).toBe(36)
  })

  it('estimates Latin text wider for m and w', () => {
    expect(latinLength('ab')).toBeLessThan(latinLength('mw'))
  })
})

const token = (chars: { c: string; py: string; zy: string }[], iast?: string): WordToken => ({
  t: chars.map((c) => c.c).join(''),
  chars,
  iast,
})

describe('cellLengths', () => {
  it('uses the longest annotation but never less than the base length', () => {
    const [short, long] = cellLengths(token([{ c: '一', py: 'yī', zy: 'ㄧ' }, { c: '觀', py: 'guān', zy: 'ㄍㄨㄢ' }]))
    expect(short).toBe(Math.ceil(BASE_LENGTH))
    expect(long).toBe(Math.ceil(Math.max(zhuyinLength('ㄍㄨㄢ'), latinLength('guān'))))
  })

  it('spreads an IAST shortfall evenly over the token, in every mode', () => {
    const chars = [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }, { c: '色', py: 'sè', zy: 'ㄙㄜˋ' }]
    const without = cellLengths(token(chars))
    const withIast = cellLengths(token(chars, 'śūnyatā-śūnyatā-śūnyatā'))
    const need = latinLength('śūnyatā-śūnyatā-śūnyatā')
    expect(withIast[0] + withIast[1]).toBeGreaterThanOrEqual(need)
    expect(withIast[0] - without[0]).toBe(withIast[1] - without[1])
  })

  it('leaves the cells alone when IAST already fits', () => {
    const chars = [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }]
    expect(cellLengths(token(chars, 'a'))).toEqual(cellLengths(token(chars)))
  })

  it('handles a token without chars', () => {
    expect(cellLengths(token([], 'x'))).toEqual([])
  })

  it('stretches a short name-term token past the 44px touch target by the margin, and leaves other tokens alone', () => {
    const chars = [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }]
    const plain = token(chars)
    const lex = { ...plain, lex: '空' }
    expect(TOUCH_MARGIN).toBeGreaterThanOrEqual(2)
    expect(cellLengths(plain)[0]).toBeLessThan(MIN_TOUCH_LENGTH)
    expect(cellLengths(lex)[0]).toBeGreaterThanOrEqual(MIN_TOUCH_LENGTH + TOUCH_MARGIN)
  })

  it('spreads the touch margin over a two-character name term', () => {
    const chars = [1, 2].map(() => ({ c: '色', py: 'sè', zy: 'ㄙㄜˋ' }))
    const lengths = cellLengths({ ...token(chars), lex: 'x' })
    expect(lengths.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(MIN_TOUCH_LENGTH + TOUCH_MARGIN)
    expect(lengths[0]).toBe(lengths[1])
  })

  it('does not stretch a name-term token that is already long enough', () => {
    const chars = [1, 2, 3].map(() => ({ c: '觀', py: 'guān', zy: 'ㄍㄨㄢ' }))
    expect(cellLengths({ ...token(chars), lex: 'x' })).toEqual(cellLengths(token(chars)))
  })
})
