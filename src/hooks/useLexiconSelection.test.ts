import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReaderData } from '../lib/types'
import { useLexiconSelection } from './useLexiconSelection'

const word = { t: '空', chars: [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }], lex: '空' }
const data: ReaderData = {
  ast: {
    id: 'x',
    title: 'x',
    segments: [
      {
        id: 's1',
        vernacular: '',
        themes: [],
        reflection: '',
        tokens: [{ t: '，', punct: true }, word, { ...word, lex: undefined }],
      },
    ],
  },
  lexicon: { source: '', license: '', attribution: '', entries: {} },
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLexiconSelection', () => {
  it('selecting a lex token opens, highlights and vibrates once', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const { result } = renderHook(() => useLexiconSelection(data))
    act(() => result.current.select('s1:1'))
    expect(result.current.open).toBe(true)
    expect(result.current.activeKey).toBe('s1:1')
    expect(result.current.selection?.lex).toBe('空')
    expect(vibrate).toHaveBeenCalledTimes(1)
  })

  it('clears the highlight when the drawer closes but keeps the selection for its exit animation', () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => useLexiconSelection(data))
    act(() => result.current.select('s1:1'))
    act(() => result.current.setOpen(false))
    expect(result.current.activeKey).toBeNull()
    expect(result.current.selection).not.toBeNull()
  })

  it('ignores punctuation, tokens without lex and unknown keys', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    const { result } = renderHook(() => useLexiconSelection(data))
    for (const key of ['s1:0', 's1:2', 's9:0', 's1:7']) act(() => result.current.select(key))
    expect(result.current.open).toBe(false)
    expect(vibrate).not.toHaveBeenCalled()
  })

  it('gives each tap a new selection id', () => {
    vi.stubGlobal('navigator', {})
    const { result } = renderHook(() => useLexiconSelection(data))
    act(() => result.current.select('s1:1'))
    const first = result.current.selection!.id
    act(() => result.current.select('s1:1'))
    expect(result.current.selection!.id).toBe(first + 1)
  })
})
