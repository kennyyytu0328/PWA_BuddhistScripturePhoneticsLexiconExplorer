import type { Lexicon } from './types'

export type Sense = Lexicon['entries'][string]['senses'][number]

export interface OrderedSense {
  sense: Sense
  adopted: boolean
}

/** The sense the scripture uses comes first (marked adopted); the rest keep DFB order. */
export function orderSenses(senses: Sense[], adopted: number | undefined): OrderedSense[] {
  if (adopted === undefined || !senses[adopted]) return senses.map((sense) => ({ sense, adopted: false }))
  return [
    { sense: senses[adopted], adopted: true },
    ...senses.filter((_, i) => i !== adopted).map((sense) => ({ sense, adopted: false })),
  ]
}

/** Distinct cross-reference targets across all senses, in first-seen order. */
export function collectXrefs(senses: Sense[]): string[] {
  return [...new Set(senses.flatMap((s) => s.xr))]
}
