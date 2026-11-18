import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as loader from './lib/loadData'

beforeEach(() => {
  // jsdom has no scrollIntoView; follow-along turns pages with it.
  Element.prototype.scrollIntoView = vi.fn()
})

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

  it('toggles follow-along, pauses on opening a term, keeps the progress line while paused', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    render(<App />)
    const toggle = await screen.findByTestId('follow-toggle')
    expect(screen.queryByTestId('follow-progress')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.textContent).toBe('停')
    expect(screen.getByTestId('follow-progress')).toBeTruthy()
    fireEvent.click(screen.getByTestId('lex-token'))
    expect(toggle.textContent).toBe('誦')
    expect(screen.getByTestId('follow-progress')).toBeTruthy()
  })

  it('pauses when 白話參考 opens', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    render(<App />)
    const toggle = await screen.findByTestId('follow-toggle')
    fireEvent.click(toggle)
    expect(toggle.textContent).toBe('停')
    fireEvent.click(screen.getByTestId('vernacular-toggle'))
    expect(toggle.textContent).toBe('誦')
  })

  it('renders nothing before the pace has loaded', () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    const { container } = render(<App />)
    expect(container.querySelector('[data-testid="follow-toggle"]')).toBeNull()
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
