import raw from '../../data/heart-sutra.json?raw'
import type { Segment } from './types'

interface SourceToken {
  t: string
  punct?: boolean
}

/** Test fixture: segments built from the tracked source data (public/data is generated and absent in CI). Only character counts matter, so readings are empty. */
export const sutraSegments: Segment[] = (JSON.parse(raw) as { segments: { id: string; tokens: SourceToken[] }[] }).segments.map(
  (segment) => ({
    id: segment.id,
    vernacular: '',
    themes: [],
    reflection: '',
    tokens: segment.tokens.map((token) =>
      token.punct
        ? { t: token.t, punct: true as const }
        : { t: token.t, chars: [...token.t].map((c) => ({ c, py: '', zy: '' })) },
    ),
  }),
)
