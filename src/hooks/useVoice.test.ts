import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { VOICE_TIMINGS_URL, VOICE_URL } from '../lib/voice'
import { useVoice } from './useVoice'

const timings = { audio: 'voice.mp3', duration: 9, title: { start: 0, end: 1 }, chars: [1, 2], review: { voice: true } }

let createObjectURL: ReturnType<typeof vi.fn>

beforeEach(() => {
  // jsdom has no object URLs
  createObjectURL = vi.fn(() => 'blob:voice')
  Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
})
afterEach(() => vi.restoreAllMocks())

/** fetch answers per URL; each call gets a fresh Response (a body is read once). */
function respond(routes: Record<string, { body: BodyInit; status?: number }>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const route = routes[String(input)]
    return route ? new Response(route.body, { status: route.status ?? 200 }) : new Response('', { status: 404 })
  })
}

const ok = () =>
  respond({
    [VOICE_TIMINGS_URL]: { body: JSON.stringify(timings) },
    [VOICE_URL]: { body: new Uint8Array([1, 2, 3]) },
  })

describe('useVoice', () => {
  it('loads nothing until enabled', async () => {
    const fetch = ok()
    const { result } = renderHook(() => useVoice(false))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(result.current).toBeNull()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('loads the timings and the recording once, when first enabled, and keeps the same voice', async () => {
    const fetch = ok()
    const { result, rerender } = renderHook(({ on }) => useVoice(on), { initialProps: { on: true } })
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(fetch.mock.calls.map(([url]) => url).sort()).toEqual([VOICE_URL, VOICE_TIMINGS_URL].sort())
    expect(result.current?.timings).toEqual(timings)
    expect(result.current?.player.time()).toBe(0)
    const first = result.current
    rerender({ on: false })
    rerender({ on: true })
    expect(result.current).toBe(first)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('plays the recording from an object URL of the fetched file, so it stays seekable under the service worker', async () => {
    ok()
    const { result } = renderHook(() => useVoice(true))
    await waitFor(() => expect(result.current).not.toBeNull())
    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0][0] as Blob
    expect(blob.size).toBe(3)
  })

  it('stays null and warns when the timings cannot be loaded', async () => {
    respond({ [VOICE_URL]: { body: new Uint8Array([1]) } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useVoice(true))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('stays null when the timings are malformed', async () => {
    respond({ [VOICE_TIMINGS_URL]: { body: JSON.stringify({ chars: 'x' }) }, [VOICE_URL]: { body: new Uint8Array([1]) } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result } = renderHook(() => useVoice(true))
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
  })

  it('stays null when the recording cannot be loaded, and tries again on the next enable', async () => {
    const fetch = respond({ [VOICE_TIMINGS_URL]: { body: JSON.stringify(timings) } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { result, rerender } = renderHook(({ on }) => useVoice(on), { initialProps: { on: true } })
    await waitFor(() => expect(warn).toHaveBeenCalled())
    expect(result.current).toBeNull()
    rerender({ on: false })
    rerender({ on: true })
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(4))
  })
})
