import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from './useWakeLock'

afterEach(() => Reflect.deleteProperty(navigator, 'wakeLock'))

describe('useWakeLock', () => {
  it('releases a lock that is granted after unmount (Q-RDR-035)', async () => {
    const release = vi.fn().mockResolvedValue(undefined)
    let grant!: (s: { release: typeof release }) => void
    const request = vi.fn(() => new Promise((resolve) => { grant = resolve }))
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })

    const { unmount } = renderHook(() => useWakeLock(true))
    unmount()
    expect(release).not.toHaveBeenCalled()
    grant({ release })
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce())
  })
})
