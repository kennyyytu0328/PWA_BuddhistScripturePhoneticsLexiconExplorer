import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { columnOffset, columnShift, slideBy, turnToPage } from './pageTurn'

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

  it('turns snapping off for the slide and back on when the newest turn ends', async () => {
    let finish: () => void = () => {}
    const finished = new Promise<void>((resolve) => (finish = resolve))
    animate.mockImplementation(() => ({ cancel: () => {}, finished }) as unknown as Animation)
    container.style.scrollSnapType = ''
    turnToPage(container, target)
    expect(container.style.scrollSnapType).toBe('none')
    finish()
    await finished
    await Promise.resolve()
    await Promise.resolve()
    expect(container.style.scrollSnapType).toBe('')
  })

  it('only scrolls, without animating, under prefers-reduced-motion', () => {
    setMotion(true)
    expect(turnToPage(container, target)).toEqual([])
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(animate).not.toHaveBeenCalled()
  })
})

describe('columnShift', () => {
  const view = { viewLeft: 0, viewRight: 400, inset: 30 }

  it('is 0 while the cell is inside the window', () => {
    expect(columnShift({ ...view, pageLeft: -500, pageRight: 400, cellLeft: 300, cellRight: 350 })).toBe(0)
  })

  it('brings a column left of the window to the right, at the same inset as the first column', () => {
    expect(columnShift({ ...view, pageLeft: -1000, pageRight: 400, cellLeft: -200, cellRight: -150 })).toBe(520)
  })

  it('stops where the page left edge meets the window left edge', () => {
    expect(columnShift({ ...view, pageLeft: -500, pageRight: 400, cellLeft: -200, cellRight: -150 })).toBe(500)
  })

  it('brings a column right of the window back to the right edge', () => {
    expect(columnShift({ ...view, pageLeft: -300, pageRight: 700, cellLeft: 500, cellRight: 550 })).toBe(-180)
  })

  it('stops where the page right edge meets the window right edge', () => {
    expect(columnShift({ ...view, pageLeft: -100, pageRight: 450, cellLeft: 405, cellRight: 440 })).toBe(-50)
  })
})

describe('columnOffset', () => {
  afterEach(() => vi.restoreAllMocks())

  it('measures layout positions, without the running slide transform, against the container', () => {
    const container = document.createElement('main')
    container.innerHTML = '<section style="transform: translateX(100px)"><span class="cell"></span><span class="cell"></span></section>'
    const page = container.firstElementChild as HTMLElement
    const [first, cell] = Array.from(page.querySelectorAll<HTMLElement>('.cell'))
    // Rects as drawn (shifted 100px by the transform), except the container.
    const rects = new Map<Element, Partial<DOMRect>>([
      [container, { left: 0, right: 400 }],
      [page, { left: -900, right: 500 }],
      [first, { left: 420, right: 470 }],
      [cell, { left: -150, right: -100 }],
    ])
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      return rects.get(this) as DOMRect
    })
    // layout: page [-1000, 400], cell [-250, -200], first column inset 30 -> (400 - 30) - (-200) = 570
    expect(columnOffset(container, page, cell)).toBe(570)
  })
})

describe('slideBy', () => {
  const animate = vi.fn(() => ({ cancel: () => {} }) as unknown as Animation)
  let container: HTMLElement
  let page: HTMLElement
  let scrollBy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    container = document.createElement('main')
    container.innerHTML = '<section></section><section></section>'
    page = container.children[0] as HTMLElement
    const lefts = [-600, -80]
    vi.spyOn(page, 'getBoundingClientRect').mockImplementation(() => ({ left: lefts.shift() ?? -80 }) as DOMRect)
    scrollBy = vi.fn()
    container.scrollBy = scrollBy as unknown as typeof container.scrollBy
    HTMLElement.prototype.animate = animate
    setMotion(false)
  })
  afterEach(() => {
    animate.mockClear()
    Reflect.deleteProperty(HTMLElement.prototype, 'animate')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('scrolls instantly so the content moves right by the offset, then slides every page in like a turn', () => {
    const animations = slideBy(container, page, 520)
    expect(scrollBy).toHaveBeenCalledWith({ left: -520, behavior: 'instant' })
    expect(animations).toHaveLength(2)
    const [keyframes, duration] = animate.mock.calls[0] as unknown as [Keyframe[], number]
    expect(keyframes[0]).toMatchObject({ transform: 'translateX(-520px)' })
    expect(keyframes[keyframes.length - 1]).toMatchObject({ transform: 'translateX(0)' })
    expect(duration).toBe(700)
    expect(container.style.scrollSnapType).toBe('none')
  })

  it('only scrolls under prefers-reduced-motion', () => {
    setMotion(true)
    expect(slideBy(container, page, 520)).toEqual([])
    expect(scrollBy).toHaveBeenCalledOnce()
    expect(animate).not.toHaveBeenCalled()
  })
})
