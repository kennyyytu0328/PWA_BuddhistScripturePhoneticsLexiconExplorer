import { COVER_PAGE } from './cover'
import { isPunct, type Segment } from './types'

export const PACES = [60, 100, 150] as const
export type Pace = (typeof PACES)[number]
export const DEFAULT_PACE: Pace = 100

export const PACE_LABEL: Record<Pace, string> = { 60: '慢', 100: '中', 150: '快' }

const NEXT_PACE: Record<Pace, Pace> = { 100: 150, 150: 60, 60: 100 }

/** Cycle slow -> medium -> fast order used by the pace button: 100 -> 150 -> 60 -> 100. */
export const nextPace = (pace: Pace): Pace => NEXT_PACE[pace]

export const isPace = (value: string | null): boolean => PACES.some((pace) => String(pace) === value)

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
  const local = cursor - timeline.startOf[segmentId]
  return Math.max(-1, Math.min(timeline.countOf[segmentId], local))
}

/** Where pressing play begins: the cover starts at 0; otherwise resume the cursor if it is on the visible page. */
export function startIndex(timeline: Timeline, visible: string, cursor: number | null): number {
  if (visible === COVER_PAGE) return 0
  const start = timeline.startOf[visible]
  if (cursor !== null && cursor >= start && cursor < start + timeline.countOf[visible]) return cursor
  return start
}
