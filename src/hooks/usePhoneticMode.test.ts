import 'fake-indexeddb/auto'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { db, readPref, writePref } from '../lib/db'
import { nextMode, usePhoneticMode } from './usePhoneticMode'

afterEach(() => db.prefs.clear())

describe('nextMode', () => {
  it('cycles zhuyin, pinyin, iast, none, zhuyin', () => {
    expect(nextMode('zhuyin')).toBe('pinyin')
    expect(nextMode('pinyin')).toBe('iast')
    expect(nextMode('iast')).toBe('none')
    expect(nextMode('none')).toBe('zhuyin')
  })
})

describe('usePhoneticMode', () => {
  it('is null while loading, then defaults to zhuyin on first use', async () => {
    const { result } = renderHook(() => usePhoneticMode())
    expect(result.current.mode).toBeNull()
    act(() => result.current.cycle()) // ignored while loading
    await waitFor(() => expect(result.current.mode).toBe('zhuyin'))
  })

  it('restores the stored mode', async () => {
    await writePref('phoneticMode', 'iast')
    const { result } = renderHook(() => usePhoneticMode())
    await waitFor(() => expect(result.current.mode).toBe('iast'))
  })

  it('ignores an invalid stored value', async () => {
    await writePref('phoneticMode', 'bogus')
    const { result } = renderHook(() => usePhoneticMode())
    await waitFor(() => expect(result.current.mode).toBe('zhuyin'))
  })

  it('cycles and persists', async () => {
    const { result } = renderHook(() => usePhoneticMode())
    await waitFor(() => expect(result.current.mode).toBe('zhuyin'))
    act(() => result.current.cycle())
    expect(result.current.mode).toBe('pinyin')
    await waitFor(async () => expect(await readPref('phoneticMode')).toBe('pinyin'))
  })
})
