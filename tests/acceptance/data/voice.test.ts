import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { makeTmp, readJson, ROOT, runPnpm, writeFixture } from './helpers'

// REQ-DAT-022: `pnpm build:voice [--release] [--timings <path>] [--out <dir>]`
//   --timings  input timings file (default data/voice-timings.json)
//   --out      output directory (default public/data)
//   --release  fail when review.voice is false
const TIMINGS = join(ROOT, 'data/voice-timings.json')
const SUTRA = join(ROOT, 'data/heart-sutra.json')
const SRC_MP3 = join(ROOT, 'data-sources/voice/sutra_speech.mp3')

interface Timings {
  audio: string
  duration: number
  title: { start: number; end: number }
  chars: number[]
  review: { voice: boolean }
}

const tmp = makeTmp('sutraflow-voice-')
let n = 0
const q = (p: string): string => `"${p}"`
const real = (): Timings => readJson<Timings>(TIMINGS)

function run(variant: Timings | null, extra: string[] = []) {
  const out = join(tmp, `out-${++n}`)
  const args = ['build:voice', '--out', q(out)]
  if (variant) args.push('--timings', q(writeFixture(tmp, `timings-${n}.json`, variant)))
  const r = runPnpm([...args, ...extra])
  return { ...r, out, text: `${r.stdout}\n${r.stderr}` }
}

function failing(mutate: (t: Timings) => void, ...patterns: RegExp[]): void {
  const t = structuredClone(real())
  mutate(t)
  const r = run(t)
  expect(r.status, r.text).not.toBe(0)
  for (const p of patterns) expect(r.text).toMatch(p)
}

describe('[REQ-DAT-022] 原音時間碼 build:voice', () => {
  it('[REQ-DAT-022] package.json 有 build:voice 指令，且 pnpm build 串接 build:voice --release', () => {
    const pkg = readJson<{ scripts: Record<string, string> }>(join(ROOT, 'package.json'))
    expect(pkg.scripts['build:voice']).toBeTruthy()
    expect(pkg.scripts.build).toMatch(/build:voice\s+--release/)
  })

  it('[REQ-DAT-022] 輸入檔（data/voice-timings.json）：260 字、嚴格遞增、title.end <= chars[0]、最後一字 < duration、錄音存在', () => {
    const t = real()
    const sutra = readJson<{ segments: { tokens: { t: string; punct?: boolean }[] }[] }>(SUTRA)
    const count = sutra.segments
      .flatMap((s) => s.tokens.filter((k) => !k.punct))
      .reduce((a, k) => a + [...k.t].length, 0)
    expect(count).toBe(260)
    expect(t.chars).toHaveLength(count)
    for (let i = 1; i < t.chars.length; i++) expect(t.chars[i]).toBeGreaterThan(t.chars[i - 1])
    expect(t.title.end).toBeLessThanOrEqual(t.chars[0])
    expect(t.chars[t.chars.length - 1]).toBeLessThan(t.duration)
    expect(t.review).toHaveProperty('voice')
    expect(existsSync(join(ROOT, t.audio))).toBe(true)
  })

  it('[REQ-DAT-022] 成功：exit 0，voice.mp3 與錄音位元組相同，voice-timings.json 同輸入唯 audio 為 "voice.mp3"', () => {
    const r = run(null)
    expect(r.status, r.text).toBe(0)
    expect(readFileSync(join(r.out, 'voice.mp3')).equals(readFileSync(SRC_MP3))).toBe(true)
    const out = readJson<Timings>(join(r.out, 'voice-timings.json'))
    expect(out).toEqual({ ...real(), audio: 'voice.mp3' })
  })

  it('[REQ-DAT-022] review.voice 為 false：照常產出（exit 0）並在輸出中警告 review.voice', () => {
    const t = structuredClone(real())
    t.review.voice = false
    const r = run(t)
    expect(r.status, r.text).toBe(0)
    expect(r.text).toContain('review.voice')
    expect(existsSync(join(r.out, 'voice.mp3'))).toBe(true)
    expect(readJson<Timings>(join(r.out, 'voice-timings.json')).review.voice).toBe(false)
  })

  it('[REQ-DAT-022] review.voice 為 false 加 --release：非 0 結束，錯誤訊息列出 review.voice', () => {
    const t = structuredClone(real())
    t.review.voice = false
    const r = run(t, ['--release'])
    expect(r.status, r.text).not.toBe(0)
    expect(r.text).toContain('review.voice')
  })

  it('[REQ-DAT-022] review.voice 為 true 加 --release：exit 0 且無 review.voice 警告', () => {
    const t = structuredClone(real())
    t.review.voice = true
    const r = run(t, ['--release'])
    expect(r.status, r.text).toBe(0)
    expect(r.text).not.toContain('review.voice')
  })

  it('[REQ-DAT-022] chars 少一筆（259）：非 0 結束，訊息指出 chars', () => {
    failing((t) => t.chars.pop(), /chars/)
  })

  it('[REQ-DAT-022] chars 多一筆（261）：非 0 結束，訊息指出 chars', () => {
    failing((t) => t.chars.push(t.chars[t.chars.length - 1] + 0.01), /chars/)
  })

  it('[REQ-DAT-022] chars 非嚴格遞增（相等）：非 0 結束，訊息指出 chars', () => {
    failing((t) => {
      t.chars[10] = t.chars[9]
    }, /chars/)
  })

  it('[REQ-DAT-022] chars 非嚴格遞增（倒退）：非 0 結束，訊息指出 chars', () => {
    failing((t) => {
      t.chars[20] = t.chars[19] - 0.01
    }, /chars/)
  })

  it('[REQ-DAT-022] title.end 大於 chars[0]：非 0 結束，訊息指出 title.end', () => {
    failing((t) => {
      t.title.end = t.chars[0] + 0.5
    }, /title\.end/)
  })

  it('[REQ-DAT-022] chars 最後一筆 >= duration：非 0 結束，訊息指出 duration', () => {
    failing((t) => {
      t.chars[t.chars.length - 1] = t.duration
    }, /duration/)
  })

  it('[REQ-DAT-022] audio 檔不存在：非 0 結束，訊息指出 audio', () => {
    failing((t) => {
      t.audio = 'data-sources/voice/does-not-exist.mp3'
    }, /audio/)
  })
})
