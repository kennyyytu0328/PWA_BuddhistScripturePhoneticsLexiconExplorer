import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildTimeline } from './followAlong'
import { startVoiceClip } from './voicePlayer'
import { fakePlayer, fakeTimings } from '../test/fakeVoice'
import { sutraSegments } from '../test/sutraFixture'

const timings = fakeTimings(buildTimeline(sutraSegments))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function setup(range = { from: 3, to: 4 }) {
  const fake = fakePlayer()
  const onDone = vi.fn()
  const stop = startVoiceClip({ player: fake.player, timings }, range, onDone)
  const advance = async (ms: number) => vi.advanceTimersByTimeAsync(ms)
  return { fake, onDone, stop, advance }
}

describe('startVoiceClip', () => {
  it('a clip stops at its end and reports done once', async () => {
    const { fake, onDone, advance } = setup()
    await advance(0)
    expect(fake.player.playAt).toHaveBeenCalledWith(3)
    await advance(990)
    expect(onDone).not.toHaveBeenCalled()
    expect(fake.isPlaying()).toBe(true)
    await advance(20)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(fake.isPlaying()).toBe(false)
    expect(fake.player.time()).toBeGreaterThanOrEqual(4)
    expect(fake.player.time()).toBeLessThanOrEqual(4.1)
    await advance(5000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a late timer still stops the clip', async () => {
    const { fake, onDone, advance } = setup()
    await advance(0)
    fake.skip(5) // a throttled tab: the audio ran past the end before the timer fired
    await advance(1000)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(fake.isPlaying()).toBe(false)
  })

  it('a clip to the end of the recording finishes on ended', async () => {
    const { fake, onDone, advance } = setup({ from: 3, to: timings.duration })
    await advance(500)
    fake.end()
    expect(onDone).toHaveBeenCalledTimes(1)
    await advance(60000)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('rejected play reports done', async () => {
    const fake = fakePlayer()
    fake.rejectPlay(true)
    const onDone = vi.fn()
    startVoiceClip({ player: fake.player, timings }, { from: 3, to: 4 }, onDone)
    await vi.advanceTimersByTimeAsync(0)
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('a seek that did not land reports done', async () => {
    const fake = fakePlayer()
    fake.seekOffBy(2)
    const onDone = vi.fn()
    startVoiceClip({ player: fake.player, timings }, { from: 3, to: 4 }, onDone)
    await vi.advanceTimersByTimeAsync(0)
    expect(onDone).toHaveBeenCalledTimes(1)
    expect(fake.isPlaying()).toBe(false)
  })

  it('an error reports done', async () => {
    const { fake, onDone, advance } = setup()
    await advance(100)
    fake.fail()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('an external pause reports done', async () => {
    const { fake, onDone, advance } = setup()
    await advance(100)
    fake.externalPause()
    expect(onDone).toHaveBeenCalledTimes(1)
  })

  it('after stop, a pending clip timer does nothing', async () => {
    const { fake, onDone, stop, advance } = setup()
    await advance(100)
    stop()
    const pauses = fake.player.pause.mock.calls.length
    await fake.player.playAt(10) // someone else (e.g. 聲) starts the recording
    await advance(5000)
    expect(onDone).not.toHaveBeenCalled()
    expect(fake.player.pause.mock.calls.length).toBe(pauses)
    expect(fake.isPlaying()).toBe(true)
  })
})
