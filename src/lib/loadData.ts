import type { z } from 'zod'
import { astSchema, lexiconSchema } from './types'
import type { ReaderData } from './types'

// Relative to the document URL; the app is served from `/` (fonts and icons use absolute `/` paths, plan.md).
const AST_URL = 'data/heart-sutra.ast.json'
const LEXICON_URL = 'data/lexicon.dfb.json'

async function fetchJson<S extends z.ZodType>(url: string, schema: S): Promise<z.infer<S>> {
  const response = await fetch(url)
  if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`)
  return schema.parse(await response.json())
}

export async function loadReaderData(): Promise<ReaderData> {
  const [ast, lexicon] = await Promise.all([fetchJson(AST_URL, astSchema), fetchJson(LEXICON_URL, lexiconSchema)])
  return { ast, lexicon }
}
