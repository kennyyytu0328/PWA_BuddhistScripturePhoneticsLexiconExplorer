import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildFonts, collectPools, measurePunct } from './build-fonts.ts'

const token = (t: string, extra = {}) => ({ t, ...extra })
const ast = {
  title: '般若',
  translator: '唐',
  baseText: { edition: '流通本' },
  segments: [
    {
      id: 's1',
      vernacular: '白話文字',
      themes: ['觀照'],
      reflection: '覺察',
      tokens: [
        token('觀自在', { chars: [{ c: '觀', py: 'guān', zy: 'ㄍㄨㄢ' }] }),
        token('，', { punct: true }),
        token('。', { punct: true }),
        token('；', { punct: true }),
        token('！', { punct: true }),
        token('：', { punct: true }),
        token('揭', { iast: 'gate' }),
      ],
    },
  ],
}
const lexicon = {
  source: '丁福保',
  attribution: '名相釋義出自',
  entries: { 觀自在: { senses: [{ usg: '術語', def: ['釋義文字', { g: 'DF-1' }], xr: ['觀音'] }] } },
}

let dir: string
const opts = () => ({
  ast: join(dir, 'ast.json'),
  lexicon: join(dir, 'lex.json'),
  src: join(dir, 'src'),
  out: join(dir, 'out'),
})

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'fonts-'))
  await mkdir(join(dir, 'src'))
  await writeFile(join(dir, 'ast.json'), JSON.stringify(ast))
  await writeFile(join(dir, 'lex.json'), JSON.stringify(lexicon))
  await writeFile(join(dir, 'src', 'ui.tsx'), 'export const L = "重新載入" // 註解\n')
  await writeFile(join(dir, 'src', 'ui.test.tsx'), 'export const T = "測試專用"\n')
})

afterAll(() => rm(dir, { recursive: true, force: true }))

describe('collectPools', () => {
  it('splits scripture, lexicon and interface characters, ignoring comments and test files', async () => {
    const pools = await collectPools({ ...opts(), serif: '', sans: '', license: '' })
    const has = (set: Set<number>, s: string) => [...s].every((c) => set.has(c.codePointAt(0)!))
    expect(has(pools.sutra, '觀自在，。；！：')).toBe(true)
    expect(has(pools.serif, '釋義文字〓重新載入')).toBe(true)
    expect(pools.serif.has(0xee1b)).toBe(false)
    expect(has(pools.sansCore, '重新載入ㄍguān注音')).toBe(true)
    expect(has(pools.sansAll, '白話文字覺察')).toBe(true)
    expect(has(pools.sansCore, '覺察')).toBe(false)
    expect(has(pools.sansAll, '註解')).toBe(false)
    expect(has(pools.sansAll, '測試專用')).toBe(false)
  })
})

describe('buildFonts', () => {
  it('writes four mutually exclusive subsets, fonts.css and the licence', async () => {
    const result = await buildFonts(opts())
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
    expect(result.files.map((f) => f.file)).toEqual([
      'serif-sutra.woff2',
      'serif-lexicon.woff2',
      'sans-core.woff2',
      'sans-ext.woff2',
    ])
    expect((await readdir(join(dir, 'out'))).sort()).toEqual([
      'OFL.txt',
      'fonts.css',
      'sans-core.woff2',
      'sans-ext.woff2',
      'serif-lexicon.woff2',
      'serif-sutra.woff2',
    ])
    const css = await readFile(join(dir, 'out', 'fonts.css'), 'utf8')
    expect(css.match(/@font-face/g)).toHaveLength(4)
    expect(css).toContain("font-family: 'Noto Sans TC'")

    const glyphs = measurePunct(await readFile(join(dir, 'out', 'serif-sutra.woff2')))
    expect(glyphs.map((g) => g.char).join('')).toBe('，。；！：')
    for (const g of glyphs) {
      expect(g.x).toBeGreaterThan(0.5)
      expect(g.y).toBeLessThan(0.5)
    }
  })

  it('fails when a required character is not in the source font', async () => {
    await writeFile(join(dir, 'ast-bad.json'), JSON.stringify({ ...ast, title: '\u{2A700}' }))
    const result = await buildFonts({ ...opts(), ast: join(dir, 'ast-bad.json') })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toContain('缺字')
  })

  it('fails with a pointer to build:data when the AST is missing', async () => {
    const result = await buildFonts({ ...opts(), ast: join(dir, 'nope.json') })
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toContain('build:data')
  })
})
