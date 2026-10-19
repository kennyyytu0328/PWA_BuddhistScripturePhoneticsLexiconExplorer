import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHaptics } from './useHaptics'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useHaptics', () => {
  it('vibrates 12ms when supported', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    renderHook(() => useHaptics()).result.current()
    expect(vibrate).toHaveBeenCalledExactlyOnceWith(12)
  })

  it('does nothing when the Vibration API is missing', () => {
    vi.stubGlobal('navigator', {})
    expect(() => renderHook(() => useHaptics()).result.current()).not.toThrow()
  })
})
