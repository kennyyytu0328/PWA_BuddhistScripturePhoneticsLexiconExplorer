import type { Sutra } from './types.ts'

// 原音逐字時間碼（REQ-DAT-022）：SRT 句首時間 ＋ 句內依發聲區段平均分配；咒語以錄音停頓切句。

export interface Cue {
  start: number
  end: number
  text: string
}

export interface VoiceTimings {
  audio: string
  duration: number
  title: { start: number; end: number }
  chars: number[]
  review: { voice: boolean }
}

export interface Span {
  start: number
  end: number
}

/** 咒語「揭諦揭諦，波羅揭諦，波羅僧揭諦，菩提薩婆訶」的句數；SRT 在咒語處切在句中，改以停頓切句。 */
export const MANTRA_PHRASES = 4

const TIME = /(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)/
const NON_CHAR = /[\s，。！；：、,.!?;:]/gu

function seconds(h: string, m: string, s: string, ms: string): number {
  return Number(h) * 3600 + Number(m) * 60 + Number(s) + Number(ms) / 1000
}

export function parseSrt(text: string): Cue[] {
  const cues: Cue[] = []
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n\s*\n/)) {
    const lines = block.trim().split('\n')
    const index = lines.findIndex((line) => TIME.test(line))
    if (index < 0) continue
    const m = TIME.exec(lines[index])!
    cues.push({
      start: seconds(m[1], m[2], m[3], m[4]),
      end: seconds(m[5], m[6], m[7], m[8]),
      text: lines.slice(index + 1).join(''),
    })
  }
  return cues
}

/** 以標點 token 切句的逐字清單，依閱讀順序。 */
export function phrasesOf(sutra: Sutra): string[][] {
  const phrases: string[][] = []
  let current: string[] = []
  for (const segment of sutra.segments) {
    for (const token of segment.tokens) {
      if (token.punct) {
        if (current.length > 0) phrases.push(current)
        current = []
      } else {
        current.push(...token.t)
      }
    }
  }
  if (current.length > 0) phrases.push(current)
  return phrases
}

const frameAt = (sec: number, frameSec: number) => Math.round(sec / frameSec)

/** [from, to) 內第一個能量 ≥ threshold 的音框的起始時間；整段無聲時回傳 from。 */
export function voicedStart(envelope: Float32Array, frameSec: number, from: number, to: number, threshold: number): number {
  const last = Math.min(frameAt(to, frameSec), envelope.length)
  for (let i = frameAt(from, frameSec); i < last; i++) {
    if (envelope[i] >= threshold) return Math.max(i * frameSec, from)
  }
  return from
}

/** [from, to) 內最後一個能量 ≥ threshold 的音框的結束時間；整段無聲時回傳 to。 */
export function voicedEnd(envelope: Float32Array, frameSec: number, from: number, to: number, threshold: number): number {
  const first = frameAt(from, frameSec)
  for (let i = Math.min(frameAt(to, frameSec), envelope.length) - 1; i >= first; i--) {
    if (envelope[i] >= threshold) return Math.min((i + 1) * frameSec, to)
  }
  return to
}

/** [from, to) 內前後皆有發聲、長度 ≥ minPauseSec 的靜音區段。 */
export function findPauses(
  envelope: Float32Array,
  frameSec: number,
  from: number,
  to: number,
  threshold: number,
  minPauseSec: number,
): Span[] {
  const pauses: Span[] = []
  const last = Math.min(frameAt(to, frameSec), envelope.length)
  let heardVoice = false
  let silentFrom = -1
  for (let i = frameAt(from, frameSec); i < last; i++) {
    if (envelope[i] < threshold) {
      if (heardVoice && silentFrom < 0) silentFrom = i
      continue
    }
    if (silentFrom >= 0 && (i - silentFrom) * frameSec >= minPauseSec - 1e-9) {
      pauses.push({ start: silentFrom * frameSec, end: i * frameSec })
    }
    heardVoice = true
    silentFrom = -1
  }
  return pauses
}

export function spread(start: number, end: number, count: number): number[] {
  return Array.from({ length: count }, (_, i) => start + ((end - start) * i) / count)
}

export interface TimingInput {
  cues: Cue[]
  phrases: string[][]
  envelope: Float32Array
  frameSec: number
  duration: number
  threshold: number
  minPauseSec?: number
  mantraPhrases?: number
  mantraOverride?: number[]
  audio?: string
}

const charCount = (text: string) => [...text.replace(NON_CHAR, '')].length

function mantraStarts(input: TimingInput, phrases: string[][], from: number): number[] {
  const total = phrases.reduce((n, p) => n + p.length, 0)
  if (input.mantraOverride) {
    if (input.mantraOverride.length !== total) {
      throw new Error(`mantra override has ${input.mantraOverride.length} starts, expected ${total}`)
    }
    return input.mantraOverride
  }
  const { envelope, frameSec, duration, threshold } = input
  const pauses = findPauses(envelope, frameSec, from, duration, threshold, input.minPauseSec ?? 0.12)
  if (pauses.length !== phrases.length - 1) {
    throw new Error(`mantra has ${pauses.length} pauses, expected ${phrases.length - 1}; pass a mantra override`)
  }
  return phrases.flatMap((phrase, i) => {
    const start = i === 0 ? from : pauses[i - 1].end
    const end = i < pauses.length ? pauses[i].start : voicedEnd(envelope, frameSec, start, duration, threshold)
    return spread(start, end, phrase.length)
  })
}

export function buildTimings(input: TimingInput): VoiceTimings {
  const { cues, phrases, envelope, frameSec, threshold } = input
  const mantraCount = input.mantraPhrases ?? MANTRA_PHRASES
  const spoken = phrases.length - mantraCount
  if (cues.length < spoken + 2) throw new Error(`SRT has ${cues.length} cues, expected at least ${spoken + 2}`)

  const chars: number[] = []
  for (let k = 0; k < spoken; k++) {
    const cue = cues[k + 1]
    if (charCount(cue.text) !== phrases[k].length) {
      throw new Error(`cue ${k + 2}「${cue.text}」has ${charCount(cue.text)} characters; phrase「${phrases[k].join('')}」has ${phrases[k].length}`)
    }
    // 段落之間的 SRT 句首含前一段結束後的靜音，改從發聲處起算
    const start = voicedStart(envelope, frameSec, cue.start, cue.end, threshold)
    chars.push(...spread(start, voicedEnd(envelope, frameSec, start, cue.end, threshold), phrases[k].length))
  }
  chars.push(...mantraStarts(input, phrases.slice(spoken), cues[spoken + 1].start))

  for (let i = 1; i < chars.length; i++) {
    if (!(chars[i] > chars[i - 1])) throw new Error(`character ${i} starts at ${chars[i]}, not after ${chars[i - 1]}`)
  }
  return {
    audio: input.audio ?? 'data-sources/voice/sutra_speech.mp3',
    duration: input.duration,
    title: { start: cues[0].start, end: cues[0].end },
    chars,
    review: { voice: false },
  }
}
