import { describe, expect, it, vi } from 'vitest'
import { createVoicePlayer } from './voicePlayer'

function fakeAudio() {
  const target = new EventTarget()
  const calls: string[] = []
  let current = 0
  // defineProperties, not Object.assign: assign would copy the getter's value and drop the setter
  const audio = Object.defineProperties(target, {
    currentTime: {
      get: () => current,
      set: (v: number) => {
        calls.push(`seek ${v}`)
        current = v
      },
    },
    play: {
      value: vi.fn(() => {
        calls.push('play')
        return Promise.resolve()
      }),
    },
    pause: { value: vi.fn(() => calls.push('pause')) },
  })
  return { audio: audio as unknown as HTMLMediaElement, calls }
}

describe('createVoicePlayer', () => {
  it('seeks before playing', async () => {
    const { audio, calls } = fakeAudio()
    await createVoicePlayer(audio).playAt(12.5)
    expect(calls).toEqual(['seek 12.5', 'play'])
  })

  it('rejects when playback cannot start', async () => {
    const { audio } = fakeAudio()
    vi.mocked(audio.play).mockRejectedValueOnce(new DOMException('no', 'NotAllowedError'))
    await expect(createVoicePlayer(audio).playAt(1)).rejects.toThrow()
  })

  it('reports time and pauses', () => {
    const { audio, calls } = fakeAudio()
    const player = createVoicePlayer(audio)
    audio.currentTime = 3.25
    expect(player.time()).toBe(3.25)
    player.pause()
    expect(calls).toContain('pause')
  })

  it('notifies ended and error listeners until unsubscribed', () => {
    const { audio } = fakeAudio()
    const player = createVoicePlayer(audio)
    const onEnded = vi.fn()
    const onError = vi.fn()
    const offEnded = player.onEnded(onEnded)
    const offError = player.onError(onError)
    audio.dispatchEvent(new Event('ended'))
    audio.dispatchEvent(new Event('error'))
    offEnded()
    offError()
    audio.dispatchEvent(new Event('ended'))
    audio.dispatchEvent(new Event('error'))
    expect(onEnded).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledTimes(1)
  })
})
