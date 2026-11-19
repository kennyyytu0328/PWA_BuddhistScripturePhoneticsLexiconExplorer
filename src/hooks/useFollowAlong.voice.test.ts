import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { COVER_PAGE } from '../lib/cover'
import { buildTimeline, type FollowMode } from '../lib/followAlong'
import { fakePlayer, fakeTimings } from '../test/fakeVoice'
import { sutraSegments } from '../test/sutraFixture'
import { useFollowAlong } from './useFollowAlong'

const timeline = buildTimeline(sutraSegments)
const timings = fakeTimings(timeline)
const s2 = timeline.startOf.s2

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(mode: FollowMode = 'voice', ready = true) {
  const fake = fakePlayer()
  const voice = { player: fake.player, timings }
  const hook = renderHook(({ mode: m, voice: v }) => useFollowAlong(timeline, m, v), {
    initialProps: { mode, voice: ready ? voice : null } as { mode: FollowMode; voice: typeof voice | null },
  })
  const play = async (visible: string) => act(async () => hook.result.current.play(visible))
  const advance = async (ms: number) => act(async () => void vi.advanceTimersByTime(ms))
  return { ...hook, fake, voice, play, advance }
}

describe('useFollowAlong in voice mode', () => {
  it('moves the cursor to each character as the recording reaches its start', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    expect(fake.player.playAt).toHaveBeenLastCalledWith(timings.chars[0])
    expect(result.current).toMatchObject({ cursor: 0, playing: true })
    await advance(299)
    expect(result.current.cursor).toBe(0)
    await advance(1)
    expect(result.current.cursor).toBe(1)
    await advance(1500)
    expect(result.current.cursor).toBe(6)
  })

  it('plays the title from the cover with no cursor until the first character', async () => {
    const { result, fake, play, advance } = setup()
    await play(COVER_PAGE)
    expect(fake.player.playAt).toHaveBeenLastCalledWith(timings.title.start)
    expect(result.current).toMatchObject({ cursor: null, playing: true })
    await advance(1999)
    expect(result.current.cursor).toBeNull()
    await advance(1)
    expect(result.current.cursor).toBe(0)
  })

  it('pausing in the title and playing again replays the title', async () => {
    const { result, fake, play, advance } = setup()
    await play(COVER_PAGE)
    await advance(1000)
    act(() => result.current.pause())
    expect(fake.isPlaying()).toBe(false)
    await play(COVER_PAGE)
    expect(fake.player.playAt).toHaveBeenLastCalledWith(timings.title.start)
  })

  it('pause stops the recording and resume seeks to the cursor character', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(900)
    expect(result.current.cursor).toBe(3)
    act(() => result.current.pause())
    expect(fake.isPlaying()).toBe(false)
    expect(result.current).toMatchObject({ cursor: 3, playing: false })
    await advance(5000)
    expect(result.current.cursor).toBe(3)
    await play('s1')
    expect(fake.player.playAt).toHaveBeenLastCalledWith(timings.chars[3])
    expect(result.current).toMatchObject({ cursor: 3, playing: true })
  })

  it('resume never steps back when the seek lands just before the character', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(900)
    act(() => result.current.pause())
    fake.seekOffBy(-0.01)
    await play('s1')
    await advance(1)
    expect(result.current.cursor).toBe(3)
  })

  it('a seek that does not land pauses instead of freezing the cursor', async () => {
    const { result, fake, play, advance } = setup()
    fake.seekOffBy(-30)
    await play('s4')
    await advance(1)
    expect(result.current).toMatchObject({ cursor: timeline.startOf.s4, playing: false })
    expect(fake.isPlaying()).toBe(false)
  })

  it('a pause from outside the app pauses the follow-along', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(600)
    act(() => fake.externalPause())
    expect(result.current).toMatchObject({ cursor: 2, playing: false })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('starts at another page first character with the recording at its start', async () => {
    const { result, fake, play } = setup()
    await play('s2')
    expect(result.current.cursor).toBe(s2)
    expect(fake.player.playAt).toHaveBeenLastCalledWith(timings.chars[s2])
  })

  it('ignores play in voice mode until the voice is ready', async () => {
    const { result, rerender, voice, play } = setup('voice', false)
    await play('s1')
    expect(result.current).toMatchObject({ cursor: null, playing: false })
    rerender({ mode: 'voice', voice })
    await play('s1')
    expect(result.current.playing).toBe(true)
  })

  it('a late timer resyncs to the character at the audio position', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    fake.skip(1.5)
    await advance(300)
    // audio at 2 + 1.5 + 0.3 = 3.8 s -> character 6, not one step
    expect(result.current.cursor).toBe(6)
  })

  it('ended finishes playback and cancels the pending timer', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(100)
    act(() => fake.end())
    expect(result.current).toMatchObject({ cursor: null, playing: false })
    expect(vi.getTimerCount()).toBe(0)
    await advance(10_000)
    expect(result.current).toMatchObject({ cursor: null, playing: false })
  })

  it('a rejected play pauses and keeps the cursor', async () => {
    const { result, fake, play } = setup()
    fake.rejectPlay(true)
    await play('s2')
    expect(result.current).toMatchObject({ cursor: s2, playing: false })
  })

  it('a media error pauses and keeps the cursor', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(600)
    act(() => fake.fail())
    expect(result.current).toMatchObject({ cursor: 2, playing: false })
    expect(fake.isPlaying()).toBe(false)
  })

  it.each([
    ['voice', 225],
    [225, 'voice'],
  ] as const)('switching %s -> %s while playing pauses and keeps the cursor', async (from, to) => {
    const { result, rerender, fake, voice, play, advance } = setup(from)
    await play('s1')
    await advance(900)
    const cursor = result.current.cursor
    rerender({ mode: to, voice })
    expect(result.current).toMatchObject({ cursor, playing: false })
    expect(fake.isPlaying()).toBe(false)
    await advance(5000)
    expect(result.current.cursor).toBe(cursor)
  })

  it('end in voice mode pauses the player', async () => {
    const { result, fake, play, advance } = setup()
    await play('s1')
    await advance(1000)
    expect(fake.isPlaying()).toBe(true)
    act(() => result.current.end())
    expect(fake.isPlaying()).toBe(false)
    expect(result.current).toMatchObject({ cursor: null, playing: false })
    await advance(5000)
    expect(result.current.cursor).toBeNull()
  })

  it('end during the title pauses the player', async () => {
    const { result, fake, play, advance } = setup()
    await play(COVER_PAGE)
    await advance(500)
    expect(fake.isPlaying()).toBe(true)
    act(() => result.current.end())
    expect(fake.isPlaying()).toBe(false)
    expect(result.current).toMatchObject({ cursor: null, playing: false })
  })

  it('unmounting stops the recording and leaves no timer', async () => {
    const { fake, play, unmount } = setup()
    await play('s1')
    unmount()
    expect(fake.isPlaying()).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })
})
