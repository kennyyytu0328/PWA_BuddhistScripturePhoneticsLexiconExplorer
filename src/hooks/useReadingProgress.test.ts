import 'fake-indexeddb/auto'
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db, readPref, writePref } from '../lib/db'
import { useReadingProgress } from './useReadingProgress'

afterEach(() => db.prefs.clear())

describe('useReadingProgress', () => {
  it('reports loaded with null initial on first use', async () => {
    const { result } = renderHook(() => useReadingProgress())
    expect(result.current.loaded).toBe(false)
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.initial).toBeNull()
  })

  it('restores the stored segment and saves new ones', async () => {
    await writePref('progress', 's4')
    const { result } = renderHook(() => useReadingProgress())
    await waitFor(() => expect(result.current.initial).toBe('s4'))
    result.current.save('s5')
    await waitFor(async () => expect(await readPref('progress')).toBe('s5'))
  })
})
