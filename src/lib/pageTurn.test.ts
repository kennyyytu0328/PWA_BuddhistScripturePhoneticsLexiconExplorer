import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { turnToPage } from './pageTurn'

const setMotion = (reduce: boolean) =>
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce') }))

describe('turnToPage', () => {
  const animate = vi.fn(() => ({ cancel: () => {} }) as unknown as Animation)
  let container: HTMLElement
  let target: HTMLElement
  let lefts: number[]
  let scrollIntoView: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('main')
    container.innerHTML = '<section></section><section></section>'
    target = container.children[1] as HTMLElement
    // Left edge of the target before, then after, the instant scroll.
    lefts = [-300, 100]
    scrollIntoView = vi.fn()
    target.scrollIntoView = scrollIntoView as unknown as typeof target.scrollIntoView
    vi.spyOn(target, 'getBoundingClientRect').mockImplementation(() => ({ left: lefts.shift() ?? 100 }) as DOMRect)
    HTMLElement.prototype.animate = animate
    setMotion(false)
  })
  afterEach(() => {
    animate.mockClear()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('scrolls instantly once, then slides every page from its offset back to 0 over 700ms with the zen easing', () => {
    const animations = turnToPage(container, target)
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'start', block: 'nearest', behavior: 'instant' })
    expect(animate).toHaveBeenCalledTimes(2)
    expect(animations).toHaveLength(2)
    const [keyframes, duration] = animate.mock.calls[0] as unknown as [Keyframe[], number]
    expect(keyframes[0]).toMatchObject({ transform: 'translateX(-400px)' })
    expect(keyframes[keyframes.length - 1]).toMatchObject({ transform: 'translateX(0)' })
    expect(duration).toBe(700)
    expect(keyframes[0].easing).toBe('cubic-bezier(0.19, 1, 0.22, 1)')
  })

  it('only scrolls, without animating, under prefers-reduced-motion', () => {
    setMotion(true)
    expect(turnToPage(container, target)).toEqual([])
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(animate).not.toHaveBeenCalled()
  })
})
