import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db, readPref, writePref } from '../lib/db'
import { useFollowPace } from './useFollowPace'

afterEach(() => db.prefs.clear())

describe('useFollowPace', () => {
  it('is null while loading, then defaults to 225', async () => {
    const { result } = renderHook(() => useFollowPace())
    expect(result.current.pace).toBeNull()
    act(() => result.current.cycle()) // ignored while loading
    await waitFor(() => expect(result.current.pace).toBe(225))
  })

  it('restores a stored pace', async () => {
    await writePref('followPace', '150')
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(150))
  })

  it('restores a stored voice mode', async () => {
    await writePref('followPace', 'voice')
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe('voice'))
  })

  it.each(['80', '60', '100'])('falls back to 225 for an invalid or old stored value %s', async (stored) => {
    await writePref('followPace', stored)
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(225))
  })

  it("cycles 225 -> 300 -> 150 -> 'voice' -> 225 and persists each value", async () => {
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(225))
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(300)
    await waitFor(async () => expect(await readPref('followPace')).toBe('300'))
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(150)
    act(() => result.current.cycle())
    expect(result.current.pace).toBe('voice')
    await waitFor(async () => expect(await readPref('followPace')).toBe('voice'))
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(225)
    await waitFor(async () => expect(await readPref('followPace')).toBe('225'))
  })
})
