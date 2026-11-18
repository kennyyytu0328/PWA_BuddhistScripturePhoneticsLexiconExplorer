import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db, readPref, writePref } from '../lib/db'
import { useFollowPace } from './useFollowPace'

afterEach(() => db.prefs.clear())

describe('useFollowPace', () => {
  it('is null while loading, then defaults to 100', async () => {
    const { result } = renderHook(() => useFollowPace())
    expect(result.current.pace).toBeNull()
    act(() => result.current.cycle()) // ignored while loading
    await waitFor(() => expect(result.current.pace).toBe(100))
  })

  it('restores a stored pace', async () => {
    await writePref('followPace', '60')
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(60))
  })

  it('falls back to 100 for an invalid stored value', async () => {
    await writePref('followPace', '80')
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(100))
  })

  it('cycles 100 -> 150 -> 60 -> 100 and persists each value', async () => {
    const { result } = renderHook(() => useFollowPace())
    await waitFor(() => expect(result.current.pace).toBe(100))
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(150)
    await waitFor(async () => expect(await readPref('followPace')).toBe('150'))
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(60)
    act(() => result.current.cycle())
    expect(result.current.pace).toBe(100)
    await waitFor(async () => expect(await readPref('followPace')).toBe('100'))
  })
})
