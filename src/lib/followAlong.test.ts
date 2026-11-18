import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { COVER_PAGE } from './cover'
import {
  beatMs,
  buildTimeline,
  followMark,
  isPace,
  localCursor,
  nextPace,
  PACE_LABEL,
  startIndex,
} from './followAlong'
import { astSchema, isPunct } from './types'

const ast = astSchema.parse(JSON.parse(readFileSync('public/data/heart-sutra.ast.json', 'utf8')))
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
    expect(timeline.steps.some((s) => s.beats === 1)).toBe(true)
    expect(timeline.steps[timeline.steps.length - 1].beats).toBe(3)
  })

  it('does not mutate its input', () => {
    const copy = JSON.stringify(ast.segments)
    buildTimeline(ast.segments)
    expect(JSON.stringify(ast.segments)).toBe(copy)
  })
})

describe('pace helpers', () => {
  it('cycles 100 -> 150 -> 60 -> 100', () => {
    expect(nextPace(100)).toBe(150)
    expect(nextPace(150)).toBe(60)
    expect(nextPace(60)).toBe(100)
  })
  it('validates stored values', () => {
    expect(isPace('100')).toBe(true)
    expect(isPace('80')).toBe(false)
    expect(isPace(null)).toBe(false)
  })
  it('labels and converts', () => {
    expect(PACE_LABEL).toEqual({ 60: '慢', 100: '中', 150: '快' })
    expect(beatMs(60)).toBe(1000)
    expect(beatMs(150)).toBe(400)
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
})
