// 原音時間碼驗證與發佈（pnpm build:voice，REQ-DAT-022）。
// 驗證 data/voice-timings.json，寫出 public/data/voice.mp3（原檔不改）與 voice-timings.json。
import { access, copyFile, mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs, readJsonFile } from './lib/io.ts'
import { SutraSchema, VoiceTimingsSchema } from './lib/schemas.ts'
import type { Sutra } from './lib/types.ts'
import type { z } from 'zod'

type VoiceTimings = z.infer<typeof VoiceTimingsSchema>

export interface VoiceBuildOptions {
  timings?: string
  sutra?: string
  out?: string
  release?: boolean
}

export interface VoiceBuildResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const charCount = (sutra: Sutra) =>
  sutra.segments.flatMap((s) => s.tokens).reduce((n, t) => (t.punct ? n : n + [...t.t].length), 0)

async function exists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function validate(t: VoiceTimings, expected: number): Promise<string[]> {
  const errors: string[] = []
  const { chars } = t
  if (chars.length !== expected) errors.push(`chars 有 ${chars.length} 筆，經文為 ${expected} 字`)
  const back = chars.findIndex((c, i) => i > 0 && !(c > chars[i - 1]))
  if (back > 0) errors.push(`chars 須嚴格遞增：chars[${back}] = ${chars[back]} 不大於 chars[${back - 1}] = ${chars[back - 1]}`)
  if (t.title.end > chars[0]) errors.push(`title.end（${t.title.end}）晚於 chars[0]（${chars[0]}）`)
  const last = chars[chars.length - 1]
  if (!(last < t.duration)) errors.push(`chars 最後一筆（${last}）須小於 duration（${t.duration}）`)
  if (!(await exists(t.audio))) errors.push(`audio 檔不存在：${t.audio}`)
  return errors
}

async function run(options: VoiceBuildOptions): Promise<VoiceBuildResult> {
  const timings = await readJsonFile(options.timings ?? 'data/voice-timings.json', VoiceTimingsSchema)
  const sutra = await readJsonFile(options.sutra ?? 'data/heart-sutra.json', SutraSchema)
  const errors = await validate(timings, charCount(sutra))
  const warnings: string[] = []
  if (timings.review.voice !== true) {
    const message = 'review.voice 為 false（時間碼尚未試聽審閱）'
    if (options.release) errors.push(message)
    else warnings.push(message)
  }
  if (errors.length > 0) return { ok: false, errors, warnings }

  const out = options.out ?? 'public/data'
  await mkdir(out, { recursive: true })
  await copyFile(timings.audio, join(out, 'voice.mp3'))
  await writeFile(join(out, 'voice-timings.json'), `${JSON.stringify({ ...timings, audio: 'voice.mp3' }, null, 2)}\n`)
  return { ok: true, errors, warnings }
}

export async function buildVoice(options: VoiceBuildOptions = {}): Promise<VoiceBuildResult> {
  try {
    return await run(options)
  } catch (error) {
    return { ok: false, errors: [(error as Error).message], warnings: [] }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const argv = process.argv.slice(2)
  const result = await buildVoice({
    ...parseArgs(argv.filter((a) => a !== '--release')),
    release: argv.includes('--release'),
  })
  for (const w of result.warnings) process.stderr.write(`WARN ${w}\n`)
  for (const e of result.errors) process.stderr.write(`${e}\n`)
  process.exit(result.ok ? 0 : 1)
}
