import { z } from 'zod'

// Shapes of the data unit's build products (REQ-DAT-002, REQ-DAT-003). Only fields the reader uses are listed.

const charSchema = z.object({ c: z.string(), py: z.string(), zy: z.string() })

const punctTokenSchema = z.object({ t: z.string(), punct: z.literal(true) })

const wordTokenSchema = z.object({
  t: z.string(),
  chars: z.array(charSchema),
  lex: z.string().optional(),
  sense: z.number().int().optional(),
  iast: z.string().optional(),
})

const segmentSchema = z.object({
  id: z.string(),
  vernacular: z.string(),
  themes: z.array(z.string()),
  reflection: z.string(),
  tokens: z.array(z.union([punctTokenSchema, wordTokenSchema])),
})

export const astSchema = z.object({
  id: z.string(),
  title: z.string(),
  segments: z.array(segmentSchema),
})

const senseSchema = z.object({
  usg: z.string().nullable(),
  def: z.array(z.union([z.string(), z.object({ g: z.string() })])),
  xr: z.array(z.string()),
})

export const lexiconSchema = z.object({
  source: z.string(),
  license: z.string(),
  attribution: z.string(),
  entries: z.record(z.string(), z.object({ senses: z.array(senseSchema) })),
})

export type Char = z.infer<typeof charSchema>
export type PunctToken = z.infer<typeof punctTokenSchema>
export type WordToken = z.infer<typeof wordTokenSchema>
export type Token = PunctToken | WordToken
export type Segment = z.infer<typeof segmentSchema>
export type Ast = z.infer<typeof astSchema>
export type Lexicon = z.infer<typeof lexiconSchema>

export type PhoneticMode = 'zhuyin' | 'pinyin' | 'iast' | 'none'

export interface ReaderData {
  ast: Ast
  lexicon: Lexicon
}

export const isPunct = (token: Token): token is PunctToken => 'punct' in token
