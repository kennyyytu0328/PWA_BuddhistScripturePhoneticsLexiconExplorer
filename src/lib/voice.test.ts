import { describe, expect, it } from 'vitest'
import { charIndexAt, clipRange, VOICE_TIMINGS_URL, VOICE_URL, voiceTimingsSchema } from './voice'

describe('charIndexAt', () => {
  const chars = [1, 2, 3]
  it('is null before the first character', () => {
    expect(charIndexAt(chars, 0.5)).toBeNull()
  })
  it('is the last character that has started', () => {
    expect(charIndexAt(chars, 1)).toBe(0)
    expect(charIndexAt(chars, 2)).toBe(1)
    expect(charIndexAt(chars, 2.99)).toBe(1)
    expect(charIndexAt(chars, 9)).toBe(2)
  })
})

describe('voice data', () => {
  it('uses relative URLs', () => {
    expect(VOICE_URL).toBe('data/voice.mp3')
    expect(VOICE_TIMINGS_URL).toBe('data/voice-timings.json')
  })
  it('parses the published timings shape and rejects a broken one', () => {
    const ok = { audio: 'voice.mp3', duration: 9, title: { start: 0, end: 1 }, chars: [1, 2], review: { voice: true } }
    expect(voiceTimingsSchema.parse(ok)).toEqual(ok)
    expect(voiceTimingsSchema.safeParse({ ...ok, chars: ['x'] }).success).toBe(false)
    expect(voiceTimingsSchema.safeParse({ ...ok, title: undefined }).success).toBe(false)
  })
})

describe('clipRange', () => {
  const timings = { audio: 'a', duration: 9, title: { start: 0, end: 1 }, chars: [1, 2, 3, 4], review: { voice: true } }
  it('runs from the first character to the start of the one after the term', () => {
    expect(clipRange(timings, 1, 2)).toEqual({ from: 2, to: 4 })
  })
  it('ends at the recording end for the last characters', () => {
    expect(clipRange(timings, 2, 2)).toEqual({ from: 3, to: 9 })
    expect(clipRange(timings, 3, 1)).toEqual({ from: 4, to: 9 })
  })
})
