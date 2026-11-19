import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTimeline } from '../lib/followAlong'
import { fakePlayer, fakeTimings } from '../test/fakeVoice'
import { sutraSegments } from '../test/sutraFixture'
import { useVoiceClip } from './useVoiceClip'

const timings = fakeTimings(buildTimeline(sutraSegments))
const range = { from: 3, to: 4 }

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

function setup(withVoice = true) {
  const fake = fakePlayer()
  const voice = withVoice ? { player: fake.player, timings } : null
  const hook = renderHook(() => useVoiceClip(voice))
  const advance = async (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
  return { ...hook, fake, advance }
}

describe('useVoiceClip', () => {
  it('toggle plays, toggle again stops', async () => {
    const { result, fake, advance } = setup()
    act(() => result.current.toggle(range))
    await advance(0)
    expect(result.current.playing).toBe(true)
    expect(fake.isPlaying()).toBe(true)
    act(() => result.current.toggle(range))
    expect(result.current.playing).toBe(false)
    expect(fake.isPlaying()).toBe(false)
  })

  it('playing turns false when the clip ends', async () => {
    const { result, fake, advance } = setup()
    act(() => result.current.toggle(range))
    await advance(1100)
    expect(result.current.playing).toBe(false)
    expect(fake.isPlaying()).toBe(false)
  })

  it('toggling twice before play resolves leaves the player paused', async () => {
    const { result, fake, advance } = setup()
    act(() => {
      result.current.toggle(range)
      result.current.toggle(range)
    })
    await advance(2000)
    expect(result.current.playing).toBe(false)
    expect(fake.isPlaying()).toBe(false)
  })

  it('null voice: toggle does nothing', async () => {
    const { result, advance } = setup(false)
    act(() => result.current.toggle(range))
    await advance(100)
    expect(result.current.playing).toBe(false)
  })

  it('hidden stops the clip', async () => {
    const { result, fake, advance } = setup()
    act(() => result.current.toggle(range))
    await advance(100)
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current.playing).toBe(false)
    expect(fake.isPlaying()).toBe(false)
  })

  it('unmount stops the clip', async () => {
    const { result, fake, advance, unmount } = setup()
    act(() => result.current.toggle(range))
    await advance(100)
    unmount()
    expect(fake.isPlaying()).toBe(false)
  })
})
