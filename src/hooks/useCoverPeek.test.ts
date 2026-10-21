import 'fake-indexeddb/auto'
import { cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, readPref, writePref } from '../lib/db'
import { useCoverPeek } from './useCoverPeek'

interface FakeAnimation {
  cancel: ReturnType<typeof vi.fn>
  finished: Promise<void>
  finish: () => void
}

let animations: FakeAnimation[] = []
let viewport: HTMLElement

// jsdom has no Web Animations: each call records a controllable stand-in.
const fakeAnimate = vi.fn(() => {
  let finish = () => {}
  const finished = new Promise<void>((resolve) => (finish = resolve))
  const animation = { cancel: vi.fn(), finished, finish }
  animations = [...animations, animation]
  return animation as unknown as Animation
})

const mount = (opensOnCover = true) => renderHook(() => useCoverPeek({ current: viewport }, opensOnCover))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const started = () => waitFor(() => expect(animations).toHaveLength(2), { timeout: 2000 })

beforeEach(() => {
  viewport = document.createElement('main')
  viewport.append(document.createElement('section'), document.createElement('section'))
  document.body.append(viewport)
  HTMLElement.prototype.animate = fakeAnimate
})

afterEach(async () => {
  cleanup()
  viewport.remove()
  animations = []
  fakeAnimate.mockClear()
  vi.unstubAllGlobals()
  await db.prefs.clear()
})

describe('useCoverPeek', () => {
  it('nudges every fold with the zen easing and records peek once it finishes', async () => {
    mount()
    await started()
    const [keyframes, duration] = fakeAnimate.mock.calls[0] as unknown as [Keyframe[], number]
    expect(keyframes[1]).toMatchObject({ transform: 'translateX(40px)', easing: 'cubic-bezier(0.19, 1, 0.22, 1)' })
    expect(duration).toBe(1600)
    expect(await readPref('peek')).toBeNull()
    animations[0].finish()
    await waitFor(async () => expect(await readPref('peek')).toBe('done'))
  })

  it('a touch stops the nudge and records peek', async () => {
    mount()
    await started()
    viewport.dispatchEvent(new Event('touchstart'))
    expect(animations.every((a) => a.cancel.mock.calls.length > 0)).toBe(true)
    await waitFor(async () => expect(await readPref('peek')).toBe('done'))
  })

  it('a touch outside the folds (the floating capsule) also stops the nudge', async () => {
    mount()
    await started()
    const capsule = document.createElement('button')
    document.body.append(capsule)
    capsule.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    capsule.remove()
    expect(animations.every((a) => a.cancel.mock.calls.length > 0)).toBe(true)
    await waitFor(async () => expect(await readPref('peek')).toBe('done'))
  })

  it('a touch before the stored record has been read still cancels the nudge', async () => {
    mount()
    document.dispatchEvent(new Event('touchstart'))
    await waitFor(async () => expect(await readPref('peek')).toBe('done'))
    await sleep(700)
    expect(fakeAnimate).not.toHaveBeenCalled()
  })

  it('a scroll before the nudge starts cancels it and records peek', async () => {
    mount()
    await sleep(100)
    viewport.dispatchEvent(new Event('scroll'))
    await waitFor(async () => expect(await readPref('peek')).toBe('done'))
    await sleep(700)
    expect(fakeAnimate).not.toHaveBeenCalled()
  })

  it('does nothing once peek is recorded', async () => {
    await writePref('peek', 'done')
    mount()
    await sleep(700)
    expect(fakeAnimate).not.toHaveBeenCalled()
  })

  it('does nothing when the reader opens off the cover or motion is reduced, and records nothing', async () => {
    mount(false)
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    mount()
    await sleep(700)
    expect(fakeAnimate).not.toHaveBeenCalled()
    expect(await readPref('peek')).toBeNull()
  })

  it('unmounting cancels the nudge without recording peek', async () => {
    const { unmount } = mount()
    await started()
    unmount()
    expect(animations.every((a) => a.cancel.mock.calls.length > 0)).toBe(true)
    expect(await readPref('peek')).toBeNull()
  })
})
