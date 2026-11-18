import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVER_PAGE } from '../lib/cover'
import { beatMs, buildTimeline, type Pace } from '../lib/followAlong'
import { sutraSegments } from '../lib/sutraFixture'
import { useFollowAlong } from './useFollowAlong'

const ast = { segments: sutraSegments }
const timeline = buildTimeline(ast.segments)
const ms = (pace: Pace, index: number) => beatMs(pace) * timeline.steps[index].beats

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

const setup = (pace: Pace = 100) =>
  renderHook(({ pace: p }) => useFollowAlong(timeline, p), { initialProps: { pace } })

describe('useFollowAlong', () => {
  it('starts at the first character from the cover and advances after its beats', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    expect(result.current.cursor).toBe(0)
    expect(result.current.playing).toBe(true)
    act(() => void vi.advanceTimersByTime(ms(100, 0) - 1))
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(1))
    expect(result.current.cursor).toBe(1)
  })

  it('pause keeps the cursor and resumes from it', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(ms(100, 0)))
    act(() => result.current.pause())
    expect(result.current.playing).toBe(false)
    act(() => void vi.advanceTimersByTime(beatMs(100) * 10))
    expect(result.current.cursor).toBe(1)
    act(() => result.current.play('s1'))
    expect(result.current.cursor).toBe(1)
    expect(result.current.playing).toBe(true)
  })

  it('resuming mid-beat keeps the cursor and advances within one beat', () => {
    const { result } = setup()
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(ms(100, 0) / 2))
    act(() => result.current.pause())
    act(() => result.current.play('s1'))
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(ms(100, 0)))
    expect(result.current.cursor).toBe(1)
  })

  it('play from a restored page starts at that page', () => {
    const { result } = setup()
    act(() => result.current.play('s4'))
    expect(result.current.cursor).toBe(timeline.startOf.s4)
  })

  it('pace change applies from the next beat with a single timer', () => {
    const { result, rerender } = setup(100)
    act(() => result.current.play(COVER_PAGE))
    act(() => void vi.advanceTimersByTime(300))
    rerender({ pace: 150 })
    expect(vi.getTimerCount()).toBe(1)
    act(() => void vi.advanceTimersByTime(250)) // t = 550
    expect(result.current.cursor).toBe(0)
    act(() => void vi.advanceTimersByTime(50)) // t = 600: old beat completes
    expect(result.current.cursor).toBe(1)
    expect(vi.getTimerCount()).toBe(1)
    const second = ms(150, 1)
    act(() => void vi.advanceTimersByTime(second - 1))
    expect(result.current.cursor).toBe(1)
    act(() => void vi.advanceTimersByTime(1))
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
    act(() => void vi.advanceTimersByTime(ms(100, 0)))
    expect(result.current.cursor).toBe(1)
  })

  it('ends with a null cursor after the last step beats elapse', () => {
    const { result } = setup()
    const last = timeline.steps.length - 1
    const lastSegment = timeline.steps[last].segmentId
    act(() => result.current.play(lastSegment))
    for (let i = timeline.startOf[lastSegment]; i <= last; i++) act(() => void vi.advanceTimersByTime(ms(100, i)))
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

  it('leaves no timer behind after unmount', () => {
    const { result, unmount } = setup()
    act(() => result.current.play(COVER_PAGE))
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })
})
