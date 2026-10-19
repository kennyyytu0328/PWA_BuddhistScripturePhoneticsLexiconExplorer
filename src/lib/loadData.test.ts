import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadReaderData } from './loadData'

const ast = {
  id: 'heart-sutra',
  title: '般若波羅蜜多心經',
  segments: [
    {
      id: 's1',
      vernacular: 'v',
      themes: ['t'],
      reflection: 'r',
      tokens: [
        { t: '空', lex: '空', sense: 0, chars: [{ c: '空', py: 'kōng', zy: 'ㄎㄨㄥ' }] },
        { t: '，', punct: true },
      ],
    },
  ],
}
const lexicon = {
  source: 's',
  license: 'l',
  attribution: 'a',
  entries: { 空: { senses: [{ usg: null, def: ['釋義', { g: 'DF-1' }], xr: [] }] } },
}

const respond = (body: unknown, init?: ResponseInit) =>
  Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), init))

function stubFetch(handler: (url: string) => Promise<Response>) {
  const spy = vi.fn((url: string) => handler(url))
  vi.stubGlobal('fetch', spy)
  return spy
}

afterEach(() => vi.unstubAllGlobals())

describe('loadReaderData', () => {
  it('fetches both files relative to the base and returns parsed data', async () => {
    const spy = stubFetch((url) => respond(url.includes('heart-sutra') ? ast : lexicon))
    const data = await loadReaderData()
    expect(spy.mock.calls.map(([url]) => url).sort()).toEqual(['data/heart-sutra.ast.json', 'data/lexicon.dfb.json'])
    expect(data.ast.segments[0].tokens).toHaveLength(2)
    expect(data.lexicon.attribution).toBe('a')
  })

  it('rejects on a non-2xx response', async () => {
    stubFetch((url) => (url.includes('heart-sutra') ? respond('boom', { status: 500 }) : respond(lexicon)))
    await expect(loadReaderData()).rejects.toThrow()
  })

  it('rejects on malformed JSON', async () => {
    stubFetch((url) => (url.includes('lexicon') ? respond('{"entries": [') : respond(ast)))
    await expect(loadReaderData()).rejects.toThrow()
  })

  it('rejects on a network error', async () => {
    stubFetch(() => Promise.reject(new TypeError('failed')))
    await expect(loadReaderData()).rejects.toThrow()
  })

  it('rejects when the JSON does not have the expected shape', async () => {
    stubFetch((url) => respond(url.includes('heart-sutra') ? { segments: 'nope' } : lexicon))
    await expect(loadReaderData()).rejects.toThrow()
  })
})
