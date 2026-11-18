import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildVoice } from './build-voice.ts'

let dir: string
let audio: string

const SUTRA = 'data/heart-sutra.json'
const COUNT = 260

/** 合法的時間碼：經題 0–2，之後每字 0.3 秒。 */
function validTimings(overrides: Record<string, unknown> = {}) {
  return {
    audio,
    duration: 2 + COUNT * 0.3 + 1,
    title: { start: 0, end: 2 },
    chars: Array.from({ length: COUNT }, (_, i) => 2 + i * 0.3),
    review: { voice: true },
    ...overrides,
  }
}

async function run(timings: unknown, release = false) {
  const path = join(dir, `t-${Math.random().toString(36).slice(2)}.json`)
  await writeFile(path, JSON.stringify(timings))
  const out = await mkdtemp(join(dir, 'out-'))
  return { out, result: await buildVoice({ timings: path, sutra: SUTRA, out, release }) }
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'voice-'))
  audio = join(dir, 'speech.mp3')
  await writeFile(audio, Buffer.from([0x49, 0x44, 0x33, 1, 2, 3, 250]))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('buildVoice', () => {
  it('publishes the recording byte for byte and the timings pointing at voice.mp3', async () => {
    const timings = validTimings()
    const { out, result } = await run(timings)
    expect(result).toEqual({ ok: true, errors: [], warnings: [] })
    expect(await readFile(join(out, 'voice.mp3'))).toEqual(await readFile(audio))
    expect(JSON.parse(await readFile(join(out, 'voice-timings.json'), 'utf8'))).toEqual({
      ...timings,
      audio: 'voice.mp3',
    })
  })

  it.each([
    ['the character count', { chars: validTimings().chars.slice(1) }, /260/],
    [
      'strictly increasing starts',
      { chars: validTimings().chars.map((c, i) => (i === 10 ? c - 1 : c)) },
      /increas|遞增/i,
    ],
    ['title end after the first character', { title: { start: 0, end: 2.5 } }, /title\.end/],
    ['last character at or after the duration', { duration: 2 + (COUNT - 1) * 0.3 }, /duration/],
    ['a missing recording', { audio: join(tmpdir(), 'no-such-voice.mp3') }, /no-such-voice\.mp3/],
  ])('fails on %s', async (_, overrides, message) => {
    const { out, result } = await run(validTimings(overrides))
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(message)
    await expect(readFile(join(out, 'voice-timings.json'))).rejects.toThrow()
  })

  it('fails on a malformed timings file', async () => {
    const { result } = await run({ chars: [] })
    expect(result.ok).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('warns, and still publishes, while review.voice is false', async () => {
    const { out, result } = await run(validTimings({ review: { voice: false } }))
    expect(result.ok).toBe(true)
    expect(result.warnings.join('\n')).toMatch(/review\.voice/)
    expect(await readFile(join(out, 'voice.mp3'))).toEqual(await readFile(audio))
  })

  it('fails a release build while review.voice is false', async () => {
    const { result } = await run(validTimings({ review: { voice: false } }), true)
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/review\.voice/)
  })
})
