import { describe, expect, it } from 'vitest'
import type { Sutra } from './types.ts'
import { buildTimings, findPauses, parseSrt, phrasesOf, spread, voicedEnd, voicedStart } from './voice-timings.ts'

const FRAME = 0.01

/** 依 [起, 迄, 音量] 區段組出 10 ms 能量包絡，其餘為 0。 */
function envelope(totalSec: number, loud: [number, number][]): Float32Array {
  const env = new Float32Array(Math.round(totalSec / FRAME))
  for (const [from, to] of loud) {
    for (let i = Math.round(from / FRAME); i < Math.round(to / FRAME); i++) env[i] = 1
  }
  return env
}

describe('parseSrt', () => {
  it('reads cue times in seconds and the cue text', () => {
    const srt = '1\r\n00:00:00,000 --> 00:00:02,320\r\n般若\r\n\r\n2\n00:01:02,520 --> 00:01:04,000\n觀自在\n'
    expect(parseSrt(srt)).toEqual([
      { start: 0, end: 2.32, text: '般若' },
      { start: 62.52, end: 64, text: '觀自在' },
    ])
  })
})

describe('spread', () => {
  it('places count evenly spaced starts from start, before end', () => {
    expect(spread(10, 11, 4)).toEqual([10, 10.25, 10.5, 10.75])
  })
})

describe('voicedEnd and findPauses', () => {
  const env = envelope(2, [
    [0, 1],
    [1.3, 2],
  ])

  it('finds where the voice stops inside a range', () => {
    expect(voicedEnd(env, FRAME, 0, 1.2, 0.5)).toBeCloseTo(1.0, 5)
  })

  it('returns the range end when the range has no voice', () => {
    expect(voicedEnd(env, FRAME, 1.05, 1.25, 0.5)).toBeCloseTo(1.25, 5)
  })

  it('finds where the voice starts inside a range', () => {
    expect(voicedStart(env, FRAME, 1.05, 2, 0.5)).toBeCloseTo(1.3, 5)
    expect(voicedStart(env, FRAME, 0.5, 2, 0.5)).toBeCloseTo(0.5, 5)
  })

  it('returns the range start when the range has no voice', () => {
    expect(voicedStart(env, FRAME, 1.05, 1.25, 0.5)).toBeCloseTo(1.05, 5)
  })

  it('finds a silence between two voiced stretches', () => {
    const pauses = findPauses(env, FRAME, 0, 2, 0.5, 0.12)
    expect(pauses).toHaveLength(1)
    expect(pauses[0].start).toBeCloseTo(1.0, 5)
    expect(pauses[0].end).toBeCloseTo(1.3, 5)
  })

  it('ignores silences shorter than the minimum and trailing silence', () => {
    const gappy = envelope(3, [
      [0, 1],
      [1.05, 2],
    ])
    expect(findPauses(gappy, FRAME, 0, 3, 0.5, 0.12)).toEqual([])
  })
})

describe('phrasesOf', () => {
  it('splits characters at punctuation tokens, across segments', () => {
    const sutra = {
      segments: [
        { id: 's1', tokens: [{ t: '觀自在' }, { t: '，', punct: true }, { t: '行' }] },
        { id: 's2', tokens: [{ t: '深' }, { t: '。', punct: true }] },
      ],
    } as unknown as Sutra
    expect(phrasesOf(sutra)).toEqual([
      ['觀', '自', '在'],
      ['行', '深'],
    ])
  })
})

describe('buildTimings', () => {
  // 經題 0–1；第一句 1–2（發聲到 1.8）；咒語兩句 2–4，中間停頓 2.8–3.2，結尾靜音 3.8–4
  const env = envelope(4, [
    [0, 0.9],
    [1, 1.8],
    [2, 2.8],
    [3.2, 3.8],
  ])
  const cues = [
    { start: 0, end: 1, text: '心經' },
    { start: 1, end: 2, text: '觀自在' },
    { start: 2, end: 4, text: '揭諦揭諦' },
  ]
  const phrases = [['觀', '自', '在'], ['揭', '諦'], ['揭', '諦']]
  const base = { cues, phrases, envelope: env, frameSec: FRAME, duration: 4, threshold: 0.5, mantraPhrases: 2 }

  it('times the title, spreads each phrase over its voiced span, and splits the mantra at pauses', () => {
    const t = buildTimings(base)
    expect(t.title).toEqual({ start: 0, end: 1 })
    expect(t.duration).toBe(4)
    expect(t.review).toEqual({ voice: false })
    expect(t.chars).toHaveLength(7)
    const expected = [1, 1.2667, 1.5333, 2, 2.4, 3.2, 3.5]
    t.chars.forEach((c, i) => expect(c).toBeCloseTo(expected[i], 3))
    for (let i = 1; i < t.chars.length; i++) expect(t.chars[i]).toBeGreaterThan(t.chars[i - 1])
  })

  it('starts a phrase at the voice onset when its cue begins in silence', () => {
    const late = envelope(4, [
      [0, 0.9],
      [1.4, 1.8],
      [2, 2.8],
      [3.2, 3.8],
    ])
    const t = buildTimings({ ...base, envelope: late })
    t.chars.slice(0, 3).forEach((c, i) => expect(c).toBeCloseTo([1.4, 1.5333, 1.6667][i], 3))
  })

  it('throws when a cue has a different character count from its phrase', () => {
    const bad = [cues[0], { ...cues[1], text: '觀自' }, cues[2]]
    expect(() => buildTimings({ ...base, cues: bad })).toThrow(/觀自/)
  })

  it('throws when the mantra pause count is wrong and there is no override', () => {
    const flat = envelope(4, [
      [0, 0.9],
      [1, 1.8],
      [2, 3.8],
    ])
    expect(() => buildTimings({ ...base, envelope: flat })).toThrow(/pause/i)
  })

  it('uses the mantra override when given', () => {
    const t = buildTimings({ ...base, mantraOverride: [2.1, 2.3, 3.3, 3.6] })
    expect(t.chars.slice(3)).toEqual([2.1, 2.3, 3.3, 3.6])
  })

  it('throws when the mantra override has the wrong length', () => {
    expect(() => buildTimings({ ...base, mantraOverride: [2.1] })).toThrow(/override/i)
  })
})
