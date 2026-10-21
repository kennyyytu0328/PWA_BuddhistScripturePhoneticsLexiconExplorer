import type { WordToken } from './types'

// Every character gets a cell whose length along the column fits the longest of its three annotations,
// so the text lays out identically in every phonetic mode (Q-RDR-022). Lengths come from the data with
// fixed per-glyph rules instead of measuring the font at runtime: measuring depends on when the web font
// finishes loading and would shift the text (CLS) once it does. The rules are deliberately a bit generous.

/** Scripture font size: one glyph is this long along the column. */
export const GLYPH_LENGTH = 20
/** Natural length of one scripture character: 20px glyph + 0.5em letter-spacing (Q-RDR-036). */
export const BASE_LENGTH = 30
const RT_SIZE = 10
/** An annotation is centred on its cell, so this much extra cell length keeps neighbouring `<rt>` 6px apart (Q-RDR-037). */
export const RT_GAP = 6
const WIDE_LATIN = /[mwMW]/
const WIDE = 9.5
const NORMAL = 6

const TONES = 'ˊˇˋ'
export const LIGHT_TONE = '˙'

export interface ZhuyinParts {
  /** ˙ sits above the symbols. */
  light: boolean
  symbols: string
  /** ˊ ˇ ˋ sits to the right of the last symbol. */
  tone: string
}

export function zhuyinParts(zy: string): ZhuyinParts {
  const light = zy.startsWith(LIGHT_TONE)
  const rest = light ? zy.slice(1) : zy
  const last = rest.slice(-1)
  const hasTone = rest.length > 1 && TONES.includes(last)
  return { light, symbols: hasTone ? rest.slice(0, -1) : rest, tone: hasTone ? last : '' }
}

export function zhuyinLength(zy: string): number {
  const { light, symbols } = zhuyinParts(zy)
  return ((light ? 1 : 0) + [...symbols].length) * RT_SIZE + RT_GAP
}

/** Sideways Latin text (pinyin, IAST): estimated advance of 10px Noto Sans. */
export function latinLength(text: string): number {
  return [...text].reduce((sum, ch) => sum + (WIDE_LATIN.test(ch) ? WIDE : NORMAL), 0) + RT_GAP
}

/** A name-term token is a touch target: its length along the column is at least this (REQ-RDR-005). */
export const MIN_TOUCH_LENGTH = 44

/** Neighbouring glyphs' hit boxes can overlap a cell by a fraction of a pixel, so pad past the minimum. */
export const TOUCH_MARGIN = 2

const spread = (lengths: number[], shortfall: number): number[] =>
  shortfall <= 0 ? lengths : lengths.map((length) => length + Math.ceil(shortfall / lengths.length))

/**
 * Whole-pixel cell length for each character of the token. IAST annotates the whole token and a name-term
 * token must be a 44px target, so any shortfall is spread evenly over the token's cells.
 */
export function cellLengths(token: WordToken): number[] {
  const own = token.chars.map((ch) => Math.ceil(Math.max(BASE_LENGTH, zhuyinLength(ch.zy), latinLength(ch.py))))
  if (own.length === 0) return own
  const total = (lengths: number[]) => lengths.reduce((a, b) => a + b, 0)
  const withIast = token.iast ? spread(own, latinLength(token.iast) - total(own)) : own
  return token.lex ? spread(withIast, MIN_TOUCH_LENGTH + TOUCH_MARGIN - total(withIast)) : withIast
}
