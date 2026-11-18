import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { sutraSegments } from '../test/sutraFixture'
import type { Segment, WordToken } from '../lib/types'
import { SutraPage } from './SutraPage'

afterEach(cleanup)

const noop = () => {}
const s1 = sutraSegments[0]
const marks = (container: HTMLElement) =>
  [...container.querySelectorAll('.cell, [data-testid="punct"]')].map((el) => el.getAttribute('data-follow'))
const page = (followAt: number | null, mode: 'zhuyin' | 'pinyin' | 'iast' | 'none' = 'zhuyin', segment: Segment = s1) => (
  <SutraPage segment={segment} mode={mode} activeKey={null} onSelect={noop} followAt={followAt} />
)

describe('SutraPage follow states', () => {
  it('marks cells before the cursor read, the cursor current, the rest ahead', () => {
    const { container } = render(page(2))
    const cells = [...container.querySelectorAll('.cell')].map((el) => el.getAttribute('data-follow'))
    expect(cells.slice(0, 3)).toEqual(['read', 'read', 'current'])
    expect(cells.slice(3).every((m) => m === 'ahead')).toBe(true)
  })

  it('outputs no data-follow at all when not following', () => {
    const { container } = render(page(null))
    expect(container.querySelectorAll('[data-follow]')).toHaveLength(0)
  })

  it('gives each character in an IAST group its own data-follow', () => {
    const withIast: Segment = {
      ...s1,
      tokens: s1.tokens.map((t, i) => (i === 0 && !('punct' in t) ? ({ ...(t as WordToken), iast: 'Avalokiteśvara' }) : t)),
    }
    const { container } = render(page(1, 'iast', withIast))
    const group = container.querySelector('.cell-group')
    expect(group).not.toBeNull()
    const inside = [...group!.querySelectorAll('.cell')].map((el) => el.getAttribute('data-follow'))
    expect(inside).toEqual(['read', 'current', 'ahead'])
  })

  it('punctuation is ahead when the previous character is ahead, otherwise read', () => {
    const all = [...render(page(0)).container.querySelectorAll('.cell, [data-testid="punct"]')]
    const firstPunct = all.findIndex((el) => el.getAttribute('data-testid') === 'punct')
    const charsBefore = all.slice(0, firstPunct).length
    for (const at of [charsBefore - 2, charsBefore - 1, charsBefore]) {
      cleanup()
      const { container } = render(page(at))
      const m = marks(container)
      const prev = m[firstPunct - 1]
      expect(m[firstPunct]).toBe(prev === 'ahead' ? 'ahead' : 'read')
    }
  })

  it('phonetic mode switch keeps follow states', () => {
    const { container, rerender } = render(page(4, 'zhuyin'))
    const before = marks(container)
    rerender(page(4, 'pinyin'))
    expect(marks(container)).toEqual(before)
  })
})
