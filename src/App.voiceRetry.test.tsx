import 'fake-indexeddb/auto'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import * as db from './lib/db'
import * as loader from './lib/loadData'
import { VOICE_TIMINGS_URL, VOICE_URL } from './lib/voice'

// The real useVoice runs here: only fetch and the object URL are faked.
const timings = { audio: 'voice.mp3', duration: 9, title: { start: 0, end: 1 }, chars: [1], review: { voice: true } }
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

beforeEach(async () => {
  await db.writePref('peek', 'done') // the cover peek animates, which jsdom cannot
  Element.prototype.scrollIntoView = vi.fn()
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:voice'), revokeObjectURL: vi.fn() })
})
afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  await db.db.prefs.clear()
})

describe('recording load wired to the lexicon drawer', () => {
  it('a failed load is retried when a drawer opens again, and is then usable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(loader, 'loadReaderData').mockResolvedValue(data)
    let recordingFails = true
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      if (url === VOICE_TIMINGS_URL) return new Response(JSON.stringify(timings))
      if (url === VOICE_URL && !recordingFails) return new Response(new Uint8Array([1, 2, 3]))
      return new Response('', { status: 503 })
    })
    const recordingRequests = () => fetch.mock.calls.filter(([url]) => String(url) === VOICE_URL).length
    render(<App />)
    fireEvent.click(await screen.findByTestId('lex-token'))
    await waitFor(() => expect(recordingRequests()).toBe(1))
    await waitFor(() => expect(console.warn).toHaveBeenCalled())
    fireEvent.keyDown(screen.getByTestId('lexicon-drawer'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByTestId('lexicon-drawer')).toBeNull())
    recordingFails = false
    fireEvent.click(screen.getByTestId('lex-token'))
    await waitFor(() => expect(recordingRequests()).toBe(2))
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1))
  })
})
