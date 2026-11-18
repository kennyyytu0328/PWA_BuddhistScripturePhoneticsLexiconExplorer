import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VOICE_TIMINGS_URL } from '../lib/voice'
import { useVoice } from './useVoice'

const timings = { audio: 'voice.mp3', duration: 9, title: { start: 0, end: 1 }, chars: [1, 2], review: { voice: true } }

afterEach(() => vi.restoreAllMocks())

const respond = (body: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }))

describe('useVoice', () => {
  it('loads nothing until enabled', async () => {
    const fetch = respond(timings)
    const { result } = renderHook(() => useVoice(false))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads the timings once, when first enabled, and keeps the same voice', async () => {
    const fetch = respond(timings)
    const { result, rerender } = renderHook(({ on }) => useVoice(on), { initialProps: { on: true } })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledWith(VOICE_TIMINGS_URL)
    expect(result.current?.timings).toEqual(timings)
    expect(result.current?.player.time()).toBe(0)
    const first = result.current
    rerender({ on: false })
    rerender({ on: true })
    expect(result.current).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('stays null and warns when the timings cannot be loaded', async () => {
    respond({}, 404)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useVoice(true))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('stays null when the timings are malformed', async () => {
    respond({ chars: 'x' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useVoice(true))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })
})
