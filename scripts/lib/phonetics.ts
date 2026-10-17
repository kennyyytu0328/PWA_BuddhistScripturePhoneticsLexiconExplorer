import { pinyin } from 'pinyin-pro'
import type { Char, SutraSegment } from './types.ts'
import { toZhuyin } from './zhuyin.ts'

export interface SegmentReadings {
  /** 與 segment.tokens 對齊；標點為 null */
  tokens: (Char[] | null)[]
  errors: string[]
}

function readingForToken(
  segId: string,
  t: string,
  override: string | undefined,
  generated: string[],
): { chars: Char[] | null; error?: string } {
  const glyphs = [...t]
  const syllables = override ? override.trim().split(/\s+/) : generated
  if (syllables.length !== glyphs.length) {
    return {
      chars: null,
      error: `${segId}：「${t}」${glyphs.length} 字，但 py 有 ${syllables.length} 個音節（${override ?? ''}）`,
    }
  }
  try {
    return { chars: glyphs.map((c, i) => ({ c, py: syllables[i], zy: toZhuyin(syllables[i]) })) }
  } catch (error) {
    return { chars: null, error: `${segId}：「${t}」${(error as Error).message}` }
  }
}

/** 對整段文字呼叫 pinyin-pro 取得上下文讀音，再依 token 字數切分；py 覆寫優先。 */
export function buildSegmentReadings(segment: SutraSegment): SegmentReadings {
  const all = pinyin(segment.tokens.map((k) => k.t).join(''), { type: 'array', toneSandhi: false })
  return splitReadings(segment, all)
}

/** 依 token 字數切分整段音節；音節數須與段落字數相同，否則切分會錯位。 */
export function splitReadings(segment: SutraSegment, all: string[]): SegmentReadings {
  const chars = segment.tokens.reduce((n, k) => n + [...k.t].length, 0)
  if (all.length !== chars) {
    return {
      tokens: segment.tokens.map(() => null),
      errors: [`${segment.id}：pinyin-pro 回傳 ${all.length} 個音節，但段落有 ${chars} 字`],
    }
  }
  const errors: string[] = []
  let offset = 0
  const tokens = segment.tokens.map((token) => {
    const length = [...token.t].length
    const generated = all.slice(offset, offset + length)
    offset += length
    if (token.punct) return null
    const r = readingForToken(segment.id, token.t, token.py, generated)
    if (r.error) errors.push(r.error)
    return r.chars
  })
  return { tokens, errors }
}

export const joinPinyin = (chars: Char[]): string => chars.map((c) => c.py).join(' ')
