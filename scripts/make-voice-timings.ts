// 一次性產生 data/voice-timings.json（pnpm make:voice）：SRT 句首 ＋ 錄音能量（REQ-DAT-022）。
// 產物須人工試聽後才把 review.voice 改為 true；重新產生會把旗標重設為 false。
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { readJsonFile } from './lib/io.ts'
import { SutraSchema } from './lib/schemas.ts'
import { buildTimings, parseSrt, phrasesOf } from './lib/voice-timings.ts'

const AUDIO = 'data-sources/voice/sutra_speech.mp3'
const SRT = 'data-sources/voice/sutra_speech.srt'
const OUT = 'data/voice-timings.json'
const FRAME_SEC = 0.01
const MIN_PAUSE_SEC = 0.12

/** 以 Chromium 的 decodeAudioData 解碼，回傳每 FRAME_SEC 的 RMS 能量與總長。 */
async function decode(path: string): Promise<{ envelope: Float32Array; duration: number }> {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    const base64 = (await readFile(path)).toString('base64')
    const result = await page.evaluate(
      async ({ base64, frameSec }) => {
        const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
        // scripts/ 的 tsconfig 沒有 DOM 型別；此函式在 Chromium 內執行
        type Decoded = { sampleRate: number; duration: number; getChannelData(channel: number): Float32Array }
        type Ctx = new (channels: number, length: number, rate: number) => {
          decodeAudioData(data: ArrayBuffer): Promise<Decoded>
        }
        const AudioCtx = (globalThis as unknown as { OfflineAudioContext: Ctx }).OfflineAudioContext
        const buffer = await new AudioCtx(1, 1, 44100).decodeAudioData(bytes.buffer as ArrayBuffer)
        const data = buffer.getChannelData(0)
        const size = Math.round(buffer.sampleRate * frameSec)
        const env: number[] = []
        for (let i = 0; i < data.length; i += size) {
          let sum = 0
          const end = Math.min(i + size, data.length)
          for (let j = i; j < end; j++) sum += data[j] * data[j]
          env.push(Math.sqrt(sum / (end - i)))
        }
        return { env, duration: buffer.duration }
      },
      { base64, frameSec: FRAME_SEC },
    )
    return { envelope: Float32Array.from(result.env), duration: result.duration }
  } finally {
    await browser.close()
  }
}

/** 門檻 = 能量第 95 百分位的 10%。 */
function pickThreshold(envelope: Float32Array): number {
  const sorted = Float32Array.from(envelope).sort()
  return sorted[Math.floor(sorted.length * 0.95)] * 0.1
}

const round = (n: number) => Math.round(n * 1000) / 1000

async function main() {
  const overrideAt = process.argv.indexOf('--mantra-override')
  const mantraOverride =
    overrideAt > 0 ? (JSON.parse(await readFile(process.argv[overrideAt + 1], 'utf8')) as number[]) : undefined
  const sutra = await readJsonFile('data/heart-sutra.json', SutraSchema)
  const { envelope, duration } = await decode(AUDIO)
  const timings = buildTimings({
    cues: parseSrt(await readFile(SRT, 'utf8')),
    phrases: phrasesOf(sutra),
    envelope,
    frameSec: FRAME_SEC,
    duration,
    threshold: pickThreshold(envelope),
    minPauseSec: MIN_PAUSE_SEC,
    mantraOverride,
    audio: AUDIO,
  })
  const rounded = {
    ...timings,
    duration: round(timings.duration),
    title: { start: round(timings.title.start), end: round(timings.title.end) },
    chars: timings.chars.map(round),
  }
  await writeFile(OUT, `${JSON.stringify(rounded, null, 2)}\n`)
  process.stdout.write(`${OUT}: ${rounded.chars.length} characters, ${rounded.duration} s\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${(error as Error).message}\n`)
  process.exit(1)
})
