import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { checkReferences, checkUnsupported, checkXrTargets, extractEntries, loadDfb } from './lib/dfb.ts'
import { parseArgs, readJsonFile, writeOutputs } from './lib/io.ts'
import { buildSegmentReadings } from './lib/phonetics.ts'
import { falseReviewFlags } from './lib/review.ts'
import { IastFileSchema, LockFileSchema, SutraSchema } from './lib/schemas.ts'
import type { Char, IastFile, Sutra } from './lib/types.ts'
import {
  compareWithLock,
  iastFor,
  resolveSenses,
  validateAgainstCbeta,
  validateIast,
  validatePunct,
} from './lib/validate.ts'

export interface BuildOptions {
  sutra?: string
  iast?: string
  lock?: string
  dfb?: string
  gaijiDir?: string
  cbeta?: string
  out?: string
}

export interface BuildResult {
  ok: boolean
  errors: string[]
  warnings: string[]
}

const DFB_DIR = 'data-sources/dfb/dingfubao.dila.tei.p5.xml'
const SOURCE = '丁福保《佛學大辭典》（DILA TEI P5 版）'
const LICENSE = 'CC BY-SA 2.5 TW'
const ATTRIBUTION =
  '名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權'

function withDefaults(o: BuildOptions): Required<BuildOptions> {
  return {
    sutra: o.sutra ?? 'data/heart-sutra.json',
    iast: o.iast ?? 'data/iast.json',
    lock: o.lock ?? 'data/readings.lock.json',
    dfb: o.dfb ?? `${DFB_DIR}/dingfubao.xml`,
    gaijiDir: o.gaijiDir ?? `${DFB_DIR}/gaiji`,
    cbeta: o.cbeta ?? 'data-sources/cbeta/T08n0251.txt',
    out: o.out ?? 'public/data',
  }
}

function buildAst(
  sutra: Sutra,
  iast: IastFile,
  readings: (Char[] | null)[][],
  senses: Map<string, number>,
) {
  return {
    id: sutra.id,
    title: sutra.title,
    translator: sutra.translator,
    baseText: sutra.baseText,
    review: sutra.review,
    segments: sutra.segments.map((seg, si) => ({
      id: seg.id,
      vernacular: seg.vernacular,
      themes: seg.themes,
      reflection: seg.reflection,
      tokens: seg.tokens.map((token, ti) => {
        const chars = readings[si][ti]
        if (token.punct || !chars) return { t: token.t, punct: true }
        const iastValue = iastFor(iast, seg.id, token.t, token.lex)
        return {
          t: token.t,
          ...(token.lex ? { lex: token.lex, sense: senses.get(`${seg.id}:${ti}`) ?? 0 } : {}),
          chars,
          ...(iastValue ? { iast: iastValue } : {}),
        }
      }),
    })),
  }
}

async function runBuild(o: Required<BuildOptions>): Promise<BuildResult> {
  const sutra = await readJsonFile(o.sutra, SutraSchema)
  const iast = await readJsonFile(o.iast, IastFileSchema)
  const lock = await readJsonFile(o.lock, LockFileSchema)
  const { index: dfb, unsupported } = await loadDfb(o.dfb)
  const cbeta = await readFile(o.cbeta, 'utf8')

  const resolved = resolveSenses(sutra, dfb)
  const segmentReadings = sutra.segments.map(buildSegmentReadings)
  const readings = segmentReadings.map((r) => r.tokens)
  const lexes = sutra.segments.flatMap((s) => s.tokens.flatMap((t) => (t.lex ? [t.lex] : [])))
  const lexicon = extractEntries(dfb, lexes)
  const missingGaiji = lexicon.gaijiIds.filter((id) => !existsSync(join(o.gaijiDir, `${id}.png`)))

  const errors = [
    ...validatePunct(sutra),
    ...validateAgainstCbeta(sutra, cbeta),
    ...resolved.errors,
    ...segmentReadings.flatMap((r) => r.errors),
    ...checkXrTargets(dfb, lexes),
    ...checkReferences(lexicon.entries, dfb),
    ...checkUnsupported(Object.keys(lexicon.entries), unsupported),
    ...validateIast(sutra, iast),
    ...missingGaiji.map((id) => `缺少造字圖檔 ${id}.png`),
  ]
  if (errors.length === 0) errors.push(...compareWithLock(sutra, readings, lock))
  const warnings = falseReviewFlags(sutra, iast)
  if (errors.length > 0) return { ok: false, errors, warnings }

  await writeOutputs({
    out: o.out,
    ast: buildAst(sutra, iast, readings, resolved.senses),
    lexicon: { source: SOURCE, license: LICENSE, attribution: ATTRIBUTION, entries: lexicon.entries },
    gaiji: lexicon.gaijiIds.map((id) => ({ id, from: join(o.gaijiDir, `${id}.png`) })),
  })
  return { ok: true, errors: [], warnings }
}

export async function buildData(options: BuildOptions = {}): Promise<BuildResult> {
  try {
    return await runBuild(withDefaults(options))
  } catch (error) {
    return { ok: false, errors: [(error as Error).message], warnings: [] }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await buildData(parseArgs(process.argv.slice(2)) as BuildOptions)
  for (const w of result.warnings) process.stderr.write(`WARN ${w}\n`)
  for (const e of result.errors) process.stderr.write(`${e}\n`)
  process.exit(result.ok ? 0 : 1)
}
