import { COVER_PAGE } from './cover'
import { isPunct, type Segment } from './types'

export const PACES = [150, 225, 300] as const
export type Pace = (typeof PACES)[number]
export const DEFAULT_PACE: Pace = 225

/** A timed pace, or 'voice': the cursor follows the recording (REQ-RDR-038). */
export type FollowMode = Pace | 'voice'

const MODES: readonly FollowMode[] = [...PACES, 'voice']

export const MODE_LABEL: Record<FollowMode, string> = { 150: '慢', 225: '中', 300: '快', voice: '聲' }

const NEXT_MODE: Record<FollowMode, FollowMode> = { 225: 300, 300: 150, 150: 'voice', voice: 225 }

/** Order used by the pace button: 225 -> 300 -> 150 -> 'voice' -> 225 (REQ-RDR-032). */
export const nextMode = (mode: FollowMode): FollowMode => NEXT_MODE[mode]

export const isFollowMode = (value: string | null): boolean => MODES.some((mode) => String(mode) === value)

/** Stored preference string -> mode; call only after isFollowMode. */
export const parseFollowMode = (value: string): FollowMode => (value === 'voice' ? 'voice' : (Number(value) as Pace))

/** Extra beats the cursor rests on the character before a punctuation mark. */
const PAUSE_BEATS: Record<string, number> = { '，': 1, '：': 1, '。': 2, '；': 2, '！': 2 }

export interface FollowStep {
  segmentId: string
  beats: number
}

export interface Timeline {
  steps: FollowStep[]
  /** Index of each segment's first step. */
  startOf: Record<string, number>
  /** Number of steps (characters) in each segment. */
  countOf: Record<string, number>
}

/** One step per character; the beat count includes the pause of the punctuation that follows it. */
export function buildTimeline(segments: Segment[]): Timeline {
  const steps: FollowStep[] = []
  const startOf: Record<string, number> = {}
  const countOf: Record<string, number> = {}

  for (const segment of segments) {
    startOf[segment.id] = steps.length
    for (const token of segment.tokens) {
      if (isPunct(token)) {
        const last = steps.length - 1
        if (last >= startOf[segment.id]) {
          steps[last] = { ...steps[last], beats: steps[last].beats + (PAUSE_BEATS[token.t] ?? 0) }
        }
        continue
      }
      for (let i = 0; i < token.chars.length; i++) steps.push({ segmentId: segment.id, beats: 1 })
    }
    countOf[segment.id] = steps.length - startOf[segment.id]
  }
  return { steps, startOf, countOf }
}

export const beatMs = (pace: Pace): number => 60000 / pace

export type FollowMark = 'read' | 'current' | 'ahead'

export function followMark(localIndex: number, cursorLocal: number): FollowMark {
  if (localIndex < cursorLocal) return 'read'
  return localIndex === cursorLocal ? 'current' : 'ahead'
}

/** Cursor as a position inside one page, clamped to [-1, countOf[id]] so far-away pages keep stable props. */
export function localCursor(timeline: Timeline, segmentId: string, cursor: number): number {
  if (!(segmentId in timeline.startOf)) return -1
  const local = cursor - timeline.startOf[segmentId]
  return Math.max(-1, Math.min(timeline.countOf[segmentId], local))
}

/** Where pressing play begins: the cover starts at 0; otherwise resume the cursor if it is on the visible page. */
export function startIndex(timeline: Timeline, visible: string, cursor: number | null): number {
  if (visible === COVER_PAGE) return 0
  if (!(visible in timeline.startOf)) return 0
  const start = timeline.startOf[visible]
  if (cursor !== null && cursor >= start && cursor < start + timeline.countOf[visible]) return cursor
  return start
}

/** Global character index of a token's first character and its length; punctuation is not counted, as in buildTimeline. */
export function tokenChars(segments: Segment[], key: string): { index: number; count: number } | null {
  const [segmentId, rawIndex] = key.split(':')
  const tokenIndex = Number(rawIndex)
  let index = 0
  for (const segment of segments) {
    for (let i = 0; i < segment.tokens.length; i++) {
      const token = segment.tokens[i]
      if (isPunct(token)) continue
      if (segment.id === segmentId && i === tokenIndex) return { index, count: token.chars.length }
      index += token.chars.length
    }
  }
  return null
}
