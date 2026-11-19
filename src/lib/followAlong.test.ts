import { describe, expect, it } from 'vitest'
import { COVER_PAGE } from './cover'
import {
  beatMs,
  buildTimeline,
  followMark,
  isFollowMode,
  localCursor,
  MODE_LABEL,
  nextMode,
  startIndex,
  tokenChars,
} from './followAlong'
import { sutraSegments } from '../test/sutraFixture'
import { isPunct } from './types'

const ast = { segments: sutraSegments }
const timeline = buildTimeline(ast.segments)

/** Beats of the first character of s1 that is directly followed by the given punctuation. */
function beatsBefore(punct: string): number[] {
  const out: number[] = []
  const tokens = ast.segments.flatMap((s) => s.tokens.map((t) => ({ s: s.id, t })))
  let step = 0
  tokens.forEach(({ t }, i) => {
    if (isPunct(t)) return
    step += t.chars.length
    const next = tokens[i + 1]?.t
    if (next && isPunct(next) && next.t === punct) out.push(timeline.steps[step - 1].beats)
  })
  return out
}

/** Beats of every character that is not directly followed by punctuation. */
function beatsWithoutPunct(): number[] {
  const out: number[] = []
  const tokens = ast.segments.flatMap((s) => s.tokens)
  let step = 0
  tokens.forEach((t, i) => {
    if (isPunct(t)) return
    step += t.chars.length
    const next = tokens[i + 1]
    const followed = next !== undefined && isPunct(next)
    for (let k = 0; k < t.chars.length; k++) {
      if (k < t.chars.length - 1 || !followed) out.push(timeline.steps[step - t.chars.length + k].beats)
    }
  })
  return out
}

describe('buildTimeline', () => {
  it('has one step per character across all segments', () => {
    expect(timeline.steps).toHaveLength(260)
    expect(timeline.startOf.s1).toBe(0)
    expect(Object.values(timeline.countOf).reduce((a, b) => a + b, 0)).toBe(260)
  })

  it('adds pause beats after punctuation', () => {
    expect(new Set(beatsBefore('，'))).toEqual(new Set([2]))
    expect(new Set(beatsBefore('。'))).toEqual(new Set([3]))
    expect(new Set(beatsBefore('：'))).toEqual(new Set([2]))
    expect(new Set(beatsBefore('；'))).toEqual(new Set([3]))
    expect(new Set(beatsBefore('！'))).toEqual(new Set([3]))
    expect(beatsWithoutPunct().length).toBeGreaterThan(0)
    expect(new Set(beatsWithoutPunct())).toEqual(new Set([1]))
    expect(timeline.steps[timeline.steps.length - 1].beats).toBe(3)
  })

  it('does not mutate its input', () => {
    const copy = JSON.stringify(ast.segments)
    buildTimeline(ast.segments)
    expect(JSON.stringify(ast.segments)).toBe(copy)
  })
})

describe('mode helpers', () => {
  it("cycles 225 -> 300 -> 150 -> 'voice' -> 225", () => {
    expect(nextMode(225)).toBe(300)
    expect(nextMode(300)).toBe(150)
    expect(nextMode(150)).toBe('voice')
    expect(nextMode('voice')).toBe(225)
  })
  it('validates stored values', () => {
    expect(isFollowMode('225')).toBe(true)
    expect(isFollowMode('voice')).toBe(true)
    expect(isFollowMode('60')).toBe(false)
    expect(isFollowMode('100')).toBe(false)
    expect(isFollowMode('80')).toBe(false)
    expect(isFollowMode(null)).toBe(false)
  })
  it('labels and converts', () => {
    expect(MODE_LABEL).toEqual({ 150: '慢', 225: '中', 300: '快', voice: '聲' })
    expect(beatMs(150)).toBe(400)
    expect(beatMs(300)).toBe(200)
  })
})

describe('followMark', () => {
  it('classifies relative to the cursor', () => {
    expect(followMark(2, 3)).toBe('read')
    expect(followMark(3, 3)).toBe('current')
    expect(followMark(4, 3)).toBe('ahead')
  })
})

describe('localCursor', () => {
  it('clamps to [-1, count] for pages away from the cursor', () => {
    const cursor = timeline.startOf.s3 + 2
    expect(localCursor(timeline, 's1', cursor)).toBe(timeline.countOf.s1)
    expect(localCursor(timeline, 's5', cursor)).toBe(-1)
    expect(localCursor(timeline, 's3', cursor)).toBe(2)
  })
  it('returns -1 for an unknown segment', () => {
    expect(localCursor(timeline, 'nope', 5)).toBe(-1)
  })
})

describe('startIndex', () => {
  it('starts at the beginning on the cover', () => {
    expect(startIndex(timeline, COVER_PAGE, null)).toBe(0)
  })
  it('starts at the visible page without a cursor', () => {
    expect(startIndex(timeline, 's4', null)).toBe(timeline.startOf.s4)
  })
  it('resumes the cursor when it lies in the visible page', () => {
    const cursor = timeline.startOf.s4 + 2
    expect(startIndex(timeline, 's4', cursor)).toBe(cursor)
    expect(startIndex(timeline, 's2', cursor)).toBe(timeline.startOf.s2)
  })
  it('falls back to 0 for an unknown page', () => {
    expect(startIndex(timeline, 'nope', null)).toBe(0)
    expect(startIndex(timeline, 'nope', 7)).toBe(0)
  })
})

describe('tokenChars', () => {
  const tokenKeys = ast.segments.flatMap((s) => s.tokens.map((t, i) => ({ key: `${s.id}:${i}`, token: t, segment: s.id })))
  const words = tokenKeys.filter(({ token }) => !isPunct(token))

  it('puts the first token of s1 at character 0', () => {
    const first = words[0]
    expect(tokenChars(ast.segments, first.key)).toEqual({
      index: 0,
      count: isPunct(first.token) ? 0 : first.token.chars.length,
    })
  })

  it('does not count punctuation', () => {
    const at = tokenKeys.findIndex(({ token }, i) => isPunct(token) && i > 0 && !isPunct(tokenKeys[i + 1].token))
    const target = tokenKeys[at + 1]
    const before = tokenKeys
      .slice(0, at + 1)
      .reduce((sum, { token }) => sum + (isPunct(token) ? 0 : token.chars.length), 0)
    expect(tokenChars(ast.segments, target.key)?.index).toBe(before)
  })

  it('gives a repeated term a larger index the second time', () => {
    const repeated = words.find(({ token }, i) => words.slice(i + 1).some((w) => w.token.t === token.t))!
    const second = words.slice(words.indexOf(repeated) + 1).find((w) => w.token.t === repeated.token.t)!
    const a = tokenChars(ast.segments, repeated.key)!
    const b = tokenChars(ast.segments, second.key)!
    expect(b.index).toBeGreaterThan(a.index)
    expect(b.count).toBe(a.count)
  })

  it('counts characters like buildTimeline', () => {
    const last = words[words.length - 1]
    const range = tokenChars(ast.segments, last.key)!
    expect(range.index + range.count).toBe(timeline.steps.length)
  })

  it('is null for a punctuation key and for an unknown key', () => {
    const punct = tokenKeys.find(({ token }) => isPunct(token))!
    expect(tokenChars(ast.segments, punct.key)).toBeNull()
    expect(tokenChars(ast.segments, 'nope:0')).toBeNull()
    expect(tokenChars(ast.segments, 's1:9999')).toBeNull()
  })
})
