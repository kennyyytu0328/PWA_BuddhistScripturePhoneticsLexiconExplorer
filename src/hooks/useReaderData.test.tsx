import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as loader from '../lib/loadData'
import { useReaderData } from './useReaderData'

afterEach(() => vi.restoreAllMocks())

const data = { ast: { id: 'x', title: 'x', segments: [] }, lexicon: { source: '', license: '', attribution: '', entries: {} } }

describe('useReaderData', () => {
  it('starts loading and becomes ready with the data', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    const { result } = renderHook(() => useReaderData())
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(result.current.state).toEqual({ status: 'ready', data })
  })

  it('reports an error, and reload loads again', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const spy = vi.spyOn(loader, 'loadReaderData').mockRejectedValueOnce(new Error('boom')).mockResolvedValue(data)
    const { result } = renderHook(() => useReaderData())
    await waitFor(() => expect(result.current.state.status).toBe('error'))
    act(() => result.current.reload())
    expect(result.current.state.status).toBe('loading')
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('ignores a stale load that settles after a reload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    let rejectStale!: (e: Error) => void
    const fresh = { ...data, ast: { ...data.ast, id: 'fresh' } }
    vi.spyOn(loader, 'loadReaderData')
      .mockReturnValueOnce(new Promise((_, reject) => { rejectStale = reject }))
      .mockResolvedValueOnce(fresh)
    const { result } = renderHook(() => useReaderData())
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.state.status).toBe('ready'))
    await act(async () => rejectStale(new Error('late')))
    expect(result.current.state).toEqual({ status: 'ready', data: fresh })
  })
})
