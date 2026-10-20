import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import * as fontkit from 'fontkit'
import subsetFont from 'subset-font'
import { z } from 'zod'
import { parseArgs, readJsonFile } from './lib/io.ts'
import { openFont } from './lib/open-font.ts'
import {
  buildCss,
  codePointsOf,
  collectStrings,
  difference,
  isRequired,
  misplacedPunct,
  uiCodePointsFromSource,
  union,
  type CodePoints,
  type FaceSpec,
  type PunctGlyph,
} from './lib/fonts.ts'

export interface FontBuildOptions {
  ast?: string
  lexicon?: string
  src?: string
  serif?: string
  sans?: string
  license?: string
  out?: string
}

export interface FontBuildResult {
  ok: boolean
  errors: string[]
  warnings: string[]
  /** 每個子集檔的字數與大小（bytes） */
  files: { file: string; chars: number; bytes: number }[]
}

const SERIF = 'Noto Serif TC'
const SANS = 'Noto Sans TC'
const PUNCT = '，。；！：'
/** 規格固定的介面字串（REQ-RDR-022）。 */
const UI_STRINGS = '注音 拼音 梵文 無音標 白話參考 讀音 釋義 參見 返回 缺字 經文載入失敗 重新載入 經文採用'
const MISSING_GLYPH = '〓'
/** 直排字形的縱向原點：思源字型的字格為 -120…880，上緣 = 880。 */
const VERT_ORIGIN_Y = 880

function withDefaults(o: FontBuildOptions): Required<FontBuildOptions> {
  return {
    ast: o.ast ?? 'public/data/heart-sutra.ast.json',
    lexicon: o.lexicon ?? 'public/data/lexicon.dfb.json',
    src: o.src ?? 'src',
    serif: o.serif ?? 'fonts/NotoSerifCJKtc-Regular.otf',
    sans: o.sans ?? 'fonts/NotoSansTC-Regular.otf',
    license: o.license ?? 'fonts/OFL.txt',
    out: o.out ?? 'public/fonts',
  }
}

// 只驗證字型建置用到的欄位；其餘欄位照收（AST 與辭典的完整格式由 data 單元驗證）。
const TokenSchema = z.looseObject({
  t: z.string(),
  chars: z.array(z.looseObject({ py: z.string().optional(), zy: z.string().optional() })).optional(),
  iast: z.string().optional(),
})

const AstSchema = z.looseObject({
  title: z.string().optional(),
  translator: z.string().optional(),
  segments: z.array(z.looseObject({ tokens: z.array(TokenSchema) })),
})

const LexiconSchema = z.looseObject({
  source: z.string().optional(),
  attribution: z.string().optional(),
  entries: z.record(
    z.string(),
    z.looseObject({ senses: z.array(z.looseObject({ usg: z.string().nullable(), xr: z.array(z.string()) })) }),
  ),
})

async function readInput<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  try {
    return await readJsonFile(path, schema)
  } catch (error) {
    throw new Error(`${(error as Error).message}（請先執行 pnpm build:data）`)
  }
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (e) => {
      const full = join(dir, e.name)
      if (e.isDirectory()) return sourceFiles(full)
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [full] : []
    }),
  )
  return nested.flat()
}

interface CharPools {
  sutra: Set<number>
  serif: Set<number>
  sansCore: Set<number>
  sansAll: Set<number>
}

/** 每次建置都由 AST、辭典與 src/ 重算，src 變動後重跑即可。 */
export async function collectPools(o: Required<FontBuildOptions>): Promise<CharPools> {
  const ast = await readInput(o.ast, AstSchema)
  const lexicon = await readInput(o.lexicon, LexiconSchema)
  const tokens = ast.segments.flatMap((s) => s.tokens)

  const sutra = codePointsOf(tokens.map((t) => t.t))
  const phonetics = codePointsOf(
    tokens.flatMap((t) => [...(t.chars ?? []).flatMap((c) => [c.py ?? '', c.zy ?? '']), t.iast ?? '']),
  )
  // 白話、主題、修持提示、校勘等 AST 自有文字（不含 token 的經文與讀音，它們另算）
  const astOwn = codePointsOf(
    collectStrings({ ...ast, segments: ast.segments.map((s) => ({ ...s, tokens: [] })) }),
  )
  const astLabels = codePointsOf(collectStrings([ast.title, ast.translator]))
  const lexAll = codePointsOf(collectStrings(lexicon))
  const lexLabels = codePointsOf(
    collectStrings([
      Object.keys(lexicon.entries),
      lexicon.source,
      lexicon.attribution,
      Object.values(lexicon.entries).flatMap((e) => e.senses.flatMap((s) => [s.usg, s.xr])),
    ]),
  )
  const srcTexts = await Promise.all((await sourceFiles(o.src)).map((f) => readFile(f, 'utf8')))
  const ui = union(codePointsOf([UI_STRINGS]), ...srcTexts.map(uiCodePointsFromSource))
  const ascii = codePointsOf([String.fromCharCode(...Array.from({ length: 95 }, (_, i) => 0x20 + i))])
  const missingGlyph = codePointsOf([MISSING_GLYPH])

  return {
    sutra,
    serif: union(sutra, lexAll, astLabels, ui, missingGlyph),
    sansCore: union(ui, ascii, phonetics, astLabels, lexLabels),
    sansAll: union(ui, ascii, phonetics, astLabels, lexLabels, astOwn),
  }
}

/** 檢查原始字型涵蓋；回傳實際可進子集的字、必須字缺字、可略過的缺字。 */
function checkCoverage(label: string, font: fontkit.Font, wanted: CodePoints) {
  const present = new Set([...wanted].filter((cp) => font.hasGlyphForCodePoint(cp)))
  const absent = [...difference(wanted, present)]
  return {
    present,
    errors: absent
      .filter(isRequired)
      .map((cp) => `${label}缺字 ${String.fromCodePoint(cp)}（U+${cp.toString(16).toUpperCase()}）`),
    skipped: absent.filter((cp) => !isRequired(cp)).map((cp) => String.fromCodePoint(cp)),
  }
}

/** 子集化後的襯線字型：五種標點在 ZHS 下的直排字形中心。 */
export function measurePunct(subset: Buffer): PunctGlyph[] {
  const font = openFont(subset)
  return [...PUNCT].map((char) => {
    const glyph = font.layout(char, ['vert', 'locl'], 'hani', 'ZHS').glyphs[0]
    const { minX, maxX, minY, maxY } = glyph.bbox
    return {
      char,
      x: (minX + maxX) / 2 / font.unitsPerEm,
      y: (VERT_ORIGIN_Y - (minY + maxY) / 2) / font.unitsPerEm,
    }
  })
}

async function runBuild(o: Required<FontBuildOptions>): Promise<FontBuildResult> {
  const pools = await collectPools(o)
  const serifBuf = await readFile(o.serif)
  const sansBuf = await readFile(o.sans)

  const serif = checkCoverage('Noto Serif CJK TC ', openFont(serifBuf), pools.serif)
  const sans = checkCoverage('Noto Sans TC ', openFont(sansBuf), pools.sansAll)
  const errors = [...serif.errors, ...sans.errors]
  const warnings = [
    `拉丁等非必須字未涵蓋（Q-RDR-016）：襯線 ${serif.skipped.join('') || '無'}；無襯線 ${sans.skipped.join('') || '無'}`,
  ]
  if (errors.length > 0) return { ok: false, errors, warnings, files: [] }

  const sutra = new Set([...pools.sutra].filter((cp) => serif.present.has(cp)))
  const sansCore = new Set([...pools.sansCore].filter((cp) => sans.present.has(cp)))
  const groups = [
    { family: SERIF, file: 'serif-sutra.woff2', source: serifBuf, cps: sutra },
    { family: SERIF, file: 'serif-lexicon.woff2', source: serifBuf, cps: difference(serif.present, sutra) },
    { family: SANS, file: 'sans-core.woff2', source: sansBuf, cps: sansCore },
    { family: SANS, file: 'sans-ext.woff2', source: sansBuf, cps: difference(sans.present, sansCore) },
  ]

  const subsets = await Promise.all(
    groups.map(async (g) => ({
      ...g,
      data: await subsetFont(g.source, String.fromCodePoint(...g.cps), { targetFormat: 'woff2' }),
    })),
  )

  const misplaced = misplacedPunct(measurePunct(subsets[0].data))
  if (misplaced.length > 0) return { ok: false, errors: misplaced, warnings, files: [] }

  await rm(o.out, { recursive: true, force: true })
  await mkdir(o.out, { recursive: true })
  for (const s of subsets) await writeFile(join(o.out, s.file), s.data)
  const faces: FaceSpec[] = subsets.map((s) => ({ family: s.family, file: s.file, codePoints: s.cps }))
  await writeFile(join(o.out, 'fonts.css'), buildCss(faces), 'utf8')
  await copyFile(o.license, join(o.out, 'OFL.txt'))

  const files = await Promise.all(
    subsets.map(async (s) => ({ file: s.file, chars: s.cps.size, bytes: (await stat(join(o.out, s.file))).size })),
  )
  return { ok: true, errors: [], warnings, files }
}

export async function buildFonts(options: FontBuildOptions = {}): Promise<FontBuildResult> {
  try {
    return await runBuild(withDefaults(options))
  } catch (error) {
    return { ok: false, errors: [(error as Error).message], warnings: [], files: [] }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const result = await buildFonts(parseArgs(process.argv.slice(2)) as FontBuildOptions)
  for (const w of result.warnings) process.stderr.write(`WARN ${w}\n`)
  for (const e of result.errors) process.stderr.write(`${e}\n`)
  for (const f of result.files) process.stdout.write(`${f.file}\t${f.chars} chars\t${f.bytes} bytes\n`)
  process.exit(result.ok ? 0 : 1)
}
