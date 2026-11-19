import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVER_PAGE } from '../lib/cover'
import { beatMs, buildTimeline, type Pace } from '../lib/followAlong'
import { sutraSegments } from '../test/sutraFixture'
import { useFollowAlong } from './useFollowAlong'

const ast = { segments: sutraSegments }
const timeline = buildTimeline(ast.segments)
const ms = (pace: Pace, index: number) => beatMs(pace) * timeline.steps[index].beats

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const setup = (pace: Pace = 225) =>
  renderHook(({ pace: p }) => useFollowAlong(timeline, p), { initialProps: { pace } })

describe('useFollowAlong', () => {
  it('starts at the first character from the cover and advances after its beats', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    expect(result.current.cursor).toBe(0)
    expect(result.current.playing).toBe(true)
    act(() => void vi.advanceTimersByTime(ms(225, 0) - 1))
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.cursor).toBe(1)
  })

  it('one long jump of time advances through every beat that elapsed', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    const total = [0, 1, 2, 3, 4].reduce((sum, i) => sum + ms(225, i), 0)
    act(() => void vi.advanceTimersByTime(total))
    expect(result.current.cursor).toBe(5)
  })

  it('a beat firing in the same batch as a pause does not desync the resume', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => {
      result.current.pause()
      vi.advanceTimersByTime(ms(225, 0))
    })
    expect(result.current.cursor).toBe(0)
    act(() => result.current.play('s1'))
    act(() => void vi.advanceTimersByTime(beatMs(225) * 10))
    expect(result.current.cursor).toBeGreaterThan(0)
  })

  it('pause keeps the cursor and resumes from it', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(ms(225, 0)))
    act(() => result.current.pause())
    expect(result.current.playing).toBe(false)
    act(() => void vi.advanceTimersByTime(beatMs(225) * 10))
    expect(result.current.cursor).toBe(1)
    act(() => result.current.play('s1'))
    expect(result.current.cursor).toBe(1)
    expect(result.current.playing).toBe(true)
  })

  it('resuming mid-beat keeps the cursor and advances within one beat', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(ms(225, 0) / 2))
    act(() => result.current.pause())
    act(() => result.current.play('s1'))
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(ms(225, 0)))
    expect(result.current.cursor).toBe(1)
  })

  it('play from a restored page starts at that page', () => {
    const { result } = setup()
    act(() => result.current.play('s4'))
    expect(result.current.cursor).toBe(timeline.startOf.s4)
  })

  it('pace change applies from the next beat with a single timer', () => {
    const { result, rerender } = setup(225)
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(40))
    rerender({ pace: 300 })
    expect(vi.getTimerCount()).toBe(1)
    act(() => void vi.advanceTimersByTime(205)) // t = 245
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(35)) // t = 280: old beat (266.67ms) completes
    expect(result.current.cursor).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    const second = ms(300, 1)
    act(() => void vi.advanceTimersByTime(second - 60)) // t = 420, beat 2 ends at ~467
    expect(result.current.cursor).toBe(1)
    act(() => void vi.advanceTimersByTime(60)) // t = 480
    expect(result.current.cursor).toBe(2)
  })

  it('rapid toggling never advances more than once per beat', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => result.current.pause())
    act(() => result.current.play(COVER_PAGE))
    act(() => result.current.pause())
    act(() => result.current.play(COVER_PAGE))
    expect(vi.getTimerCount()).toBe(1)
    act(() => void vi.advanceTimersByTime(ms(225, 0)))
    expect(result.current.cursor).toBe(1)
  })

  it('a late timer does not override a pause queued in the same batch', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => {
      result.current.pause()
      vi.advanceTimersByTime(ms(225, 0))
    })
    expect(result.current.playing).toBe(false)
    expect(result.current.cursor).toBe(0)
  })

  it('goes idle when a shorter timeline leaves the cursor past its end', () => {
    const short = buildTimeline(sutraSegments.slice(0, 1))
    const seen: Array<number | null> = []
    const { result, rerender } = renderHook(
      ({ t }) => {
        const r = useFollowAlong(t, 225)
        seen.push(r.cursor)
        return r
      },
      { initialProps: { t: timeline } },
    )
    act(() => result.current.play('s9'))
    seen.length = 0
    rerender({ t: short })
    // no render, including the one that detects the overrun, returns an out-of-range cursor
    expect(seen.every((c) => c === null || c < short.steps.length)).toBe(true)
    expect(seen[0]).toBeNull()
    expect(result.current.cursor).toBeNull()
    expect(result.current.playing).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pause while idle keeps the same state (no re-render)', () => {
    let renders = 0
    const { result } = renderHook(() => {
      renders++
      return useFollowAlong(timeline, 225)
    })
    const before = renders
    act(() => result.current.pause())
    expect(renders).toBe(before)
    expect(result.current.playing).toBe(false)
  })

  it('under StrictMode keeps a single timer and advances once per beat', () => {
    const { result } = renderHook(() => useFollowAlong(timeline, 225), { reactStrictMode: true })
    act(() => result.current.play(COVER_PAGE))
    expect(vi.getTimerCount()).toBe(1)
    act(() => void vi.advanceTimersByTime(ms(225, 0)))
    expect(result.current.cursor).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
  })

  it('ends with a null cursor after the last step beats elapse', () => {
    const { result } = setup()
    const last = timeline.steps.length - 1
    expect(timeline.steps[0].beats).toBe(1)
    const lastSegment = timeline.steps[last].segmentId
    act(() => result.current.play(lastSegment))
    for (let i = timeline.startOf[lastSegment]; i <= last; i++) act(() => void vi.advanceTimersByTime(ms(225, i)))
    expect(result.current.cursor).toBeNull()
    expect(result.current.playing).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('pauses when the page becomes hidden', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.playing).toBe(false)
    expect(result.current.cursor).toBe(0)
  })

  it('end while playing clears the cursor and stops the beats', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(ms(225, 0)))
    act(() => result.current.end())
    expect(result.current).toMatchObject({ cursor: null, playing: false })
    act(() => void vi.advanceTimersByTime(beatMs(225) * 20))
    expect(result.current.cursor).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('end while paused clears the cursor', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => result.current.pause())
    expect(result.current.cursor).toBe(0)
    act(() => result.current.end())
    expect(result.current).toMatchObject({ cursor: null, playing: false })
  })

  it('end when idle changes nothing', () => {
    const { result } = setup()
    const before = result.current
    act(() => result.current.end())
    expect(result.current).toMatchObject({ cursor: null, playing: false })
    expect(result.current.play).toBe(before.play)
  })

  it('leaves no timer behind after unmount', () => {
    const { result, unmount } = setup()
    act(() => result.current.play(COVER_PAGE))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
