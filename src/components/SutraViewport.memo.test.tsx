import 'fake-indexeddb/auto'
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildTimeline } from '../lib/followAlong'
import type { Segment } from '../lib/types'
import { SutraViewport } from './SutraViewport'

const renders = new Map<string, number>()
vi.mock('./Token', async (importOriginal) => {
  const original = await importOriginal<typeof import('./Token')>()
  return {
    Token: (props: Parameters<typeof original.Token>[0]) => {
      renders.set(props.token.t, (renders.get(props.token.t) ?? 0) + 1)
      return original.Token(props)
    },
  }
})

afterEach(() => {
  cleanup()
  renders.clear()
})

const char = (c: string) => ({ c, py: 'x', zy: 'ㄅ' })
const segment = (id: string, text: string): Segment => ({
  id,
  vernacular: '',
  themes: [],
  reflection: '',
  tokens: [{ t: text, chars: [...text].map(char) }],
})
const segments = [segment('s1', '甲乙丙'), segment('s2', '丁'), segment('s3', '戊己庚')]
const timeline = buildTimeline(segments)

describe('SutraViewport page memo', () => {
  it('a cursor move inside one page, with fresh parent callbacks, re-renders only that page', () => {
    const base = { title: 't', segments, mode: 'none' as const, activeKey: null }
    const { rerender } = render(
      <SutraViewport {...base} onSelect={() => {}} onOpenVernacular={() => {}} follow={{ timeline, cursor: timeline.startOf.s3 }} />,
    )
    renders.clear()
    rerender(
      <SutraViewport {...base} onSelect={() => {}} onOpenVernacular={() => {}} follow={{ timeline, cursor: timeline.startOf.s3 + 1 }} />,
    )
    expect(renders.get('戊己庚')).toBe(1)
    expect(renders.get('甲乙丙')).toBeUndefined()
    expect(renders.get('丁')).toBeUndefined()
  })
})
