import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as db from './lib/db'
import { buildTimeline } from './lib/followAlong'
import * as loader from './lib/loadData'
import type { Voice } from './lib/voicePlayer'
import { fakePlayer, fakeTimings } from './test/fakeVoice'

// The real hook fetches and creates an <audio>; here the recording is a fake whose clock follows Date.now().
const voiceHolder = vi.hoisted(() => ({ voice: null as Voice | null }))
vi.mock('./hooks/useVoice', () => ({ useVoice: (enabled: boolean) => (enabled ? voiceHolder.voice : null) }))

beforeEach(() => {
  // jsdom has no scrollIntoView; follow-along turns pages with it.
  Element.prototype.scrollIntoView = vi.fn()
})

afterEach(async () => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  voiceHolder.voice = null
  await db.db.prefs.clear()
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

  it('renders nothing while only the pace is still loading', async () => {
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    const real = db.readPref
    let release: (value: string | null) => void = () => {}
    const pending = new Promise<string | null>((resolve) => (release = resolve))
    const spy = vi.spyOn(db, 'readPref').mockImplementation((key: string) => (key === 'followPace' ? pending : real(key)))
    const { container } = render(<App />)
    // Data, phonetic mode and progress all resolve; only the pace stays pending.
    await waitFor(() => expect(spy.mock.calls.map(([key]) => key)).toContain('progress'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(container.querySelector('[data-testid="sutra-page"]')).toBeNull()
    expect(container.querySelector('[data-testid="follow-toggle"]')).toBeNull()
    release(null)
    await screen.findByTestId('follow-toggle')
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

  describe('voice follow-along (聲)', () => {
    async function renderVoice() {
      const fake = fakePlayer()
      voiceHolder.voice = { player: fake.player, timings: fakeTimings(buildTimeline(data.ast.segments)) }
      await db.writePref('followPace', 'voice')
      vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
      const view = render(<App />)
      const toggle = await screen.findByTestId('follow-toggle')
      await waitFor(() => expect(screen.getByTestId('follow-pace').textContent).toBe('聲'))
      return { ...view, fake, toggle }
    }
    const press = (el: HTMLElement) => act(async () => void fireEvent.click(el))

    it('on the cover plays the title: 停, no data-follow or progress until the first character', async () => {
      const { container, fake, toggle } = await renderVoice()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
      await press(toggle)
      expect(fake.player.playAt).toHaveBeenLastCalledWith(0)
      expect(toggle.textContent).toBe('停')
      expect(container.querySelector('[data-follow]')).toBeNull()
      expect(screen.queryByTestId('follow-progress')).toBeNull()
      await act(async () => void vi.advanceTimersByTime(2000))
      expect(container.querySelector('[data-follow="current"]')).not.toBeNull()
      expect(screen.getByTestId('follow-progress')).toBeTruthy()
    })

    it('leaving voice mode while playing pauses the audio', async () => {
      const { fake, toggle } = await renderVoice()
      await press(toggle)
      expect(fake.isPlaying()).toBe(true)
      await press(screen.getByTestId('follow-pace'))
      expect(screen.getByTestId('follow-pace').textContent).toBe('中')
      expect(toggle.textContent).toBe('誦')
      expect(fake.isPlaying()).toBe(false)
    })

    it('unmounting stops the voice', async () => {
      const { fake, toggle, unmount } = await renderVoice()
      await press(toggle)
      expect(fake.isPlaying()).toBe(true)
      unmount()
      expect(fake.isPlaying()).toBe(false)
    })
  })
})
