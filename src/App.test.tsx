import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as loader from './lib/loadData'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const data = {
  ast: {
    id: 'x',
    title: 'x',
    segments: [
      {
        id: 's1',
        vernacular: '',
        themes: [],
        reflection: '',
        tokens: [{ t: '空', lex: '空', sense: 0, chars: [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }] }],
      },
    ],
  },
  lexicon: { source: '', license: '', attribution: '', entries: {} },
}

describe('App', () => {
  it('renders nothing while loading', () => {
    vi.spyOn(loader, 'loadReaderData').mockReturnValue(new Promise(() => {}))
    const { container } = render(<App />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the scripture with the glow layer once loaded, in zhuyin mode', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    const { container } = render(<App />)
    await waitFor(() => expect(screen.getAllByTestId('sutra-page')).toHaveLength(1))
    expect(screen.getByTestId('sutra-glow')).toBeTruthy()
    expect(container.querySelector('rt')?.textContent).toBe('ㄎㄨㄥ')
  })

  it('highlights a clicked lex token', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    render(<App />)
    const token = await screen.findByTestId('lex-token')
    fireEvent.click(token)
    expect(token.getAttribute('data-active')).toBe('true')
  })

  it('shows one failure line and a reload button, then recovers', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(loader, 'loadReaderData').mockRejectedValueOnce(new Error('x')).mockResolvedValue(data)
    render(<App />)
    const err = await screen.findByTestId('load-error')
    expect(err.textContent).toBe('經文載入失敗重新載入')
    expect(screen.queryByTestId('sutra-page')).toBeNull()
    fireEvent.click(screen.getByTestId('reload-button'))
    await waitFor(() => expect(screen.getAllByTestId('sutra-page')).toHaveLength(1))
    expect(screen.queryByTestId('load-error')).toBeNull()
  })
})
