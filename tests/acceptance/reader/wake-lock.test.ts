// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useWakeLock } from '../../../src/hooks/useWakeLock'

interface Stub { request: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }

function stubWakeLock(): Stub {
  const release = vi.fn(async () => {})
  const request = vi.fn(async (_type: string) => ({ release }))
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
  return { request, release }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 0))

function setVisibility(state: 'hidden' | 'visible') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock')
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
})

describe('useWakeLock', () => {
  it('[REQ-RDR-020] requests the screen lock when active and releases the sentinel once on unmount', async () => {
    const { request, release } = stubWakeLock()
    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith('screen')
    expect(release).not.toHaveBeenCalled()
    unmount()
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('[REQ-RDR-020] does not request when active is false', async () => {
    const { request } = stubWakeLock()
    renderHook(() => useWakeLock(false))
    await flush()
    expect(request).not.toHaveBeenCalled()
  })

  it('[REQ-RDR-020] requests again when the page becomes visible, not when it goes hidden', async () => {
    const { request } = stubWakeLock()
    renderHook(() => useWakeLock(true))
    await flush()
    setVisibility('hidden')
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    setVisibility('visible')
    await flush()
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('[REQ-RDR-020] does not throw when the Wake Lock API is missing or the request is rejected', async () => {
    expect('wakeLock' in navigator).toBe(false)
    const { unmount } = renderHook(() => useWakeLock(true))
    await flush()
    expect(() => unmount()).not.toThrow()

    const request = vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError') })
    Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const hook = renderHook(() => useWakeLock(true))
    await flush()
    expect(request).toHaveBeenCalledTimes(1)
    expect(() => hook.unmount()).not.toThrow()
    warn.mockRestore()
  })
})
