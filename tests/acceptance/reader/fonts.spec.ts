import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import {
  AST,
  LEX,
  closeOverlay,
  defText,
  expect,
  firstFamily,
  gotoReader,
  openLexicon,
  openVernacular,
  setMode,
  test,
} from './helpers'

const ORIGIN = 'http://localhost:4173'
const SERIF = 'Noto Serif TC'
const SANS = 'Noto Sans TC'

/** Han ideographs plus CJK / full-width punctuation. Latin, kana, PUA and everything else are out of scope (Q-RDR-016). */
const needsBundledGlyph = (cp: number): boolean =>
  (cp >= 0x3400 && cp <= 0x4dbf) ||
  (cp >= 0x4e00 && cp <= 0x9fff) ||
  (cp >= 0xf900 && cp <= 0xfaff) ||
  (cp >= 0x20000 && cp <= 0x2fa1f) ||
  (cp >= 0x3000 && cp <= 0x303f) ||
  (cp >= 0xff01 && cp <= 0xff60) ||
  (cp >= 0xffe0 && cp <= 0xffe6)

function fontDir(): string {
  for (const d of ['dist/fonts', 'public/fonts']) {
    const full = path.join(process.cwd(), d)
    if (fs.existsSync(full) && fs.readdirSync(full).some((f) => f.endsWith('.woff2'))) return full
  }
  return path.join(process.cwd(), 'dist/fonts')
}

function fontFiles(kind: 'serif' | 'sans'): string[] {
  const dir = fontDir()
  return fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.woff2') && f.toLowerCase().includes(kind)).map((f) => path.join(dir, f))
    : []
}

// fontkit cannot be loaded inside the Playwright test runner (its unicode-trie dependency breaks under the
// runner's module hooks), so glyph coverage is computed by plain Node in a child process.
const FONTKIT_SCRIPT = `
import * as fontkit from 'fontkit'
import fs from 'node:fs'
const { files, cps } = JSON.parse(fs.readFileSync(0, 'utf8'))
const fonts = files.map((f) => fontkit.openSync(f))
process.stdout.write(JSON.stringify(cps.filter((cp) => !fonts.some((f) => f.hasGlyphForCodePoint(cp)))))
`

/** Code points that none of the given woff2 files has a glyph for. */
function missingCodePoints(files: string[], cps: number[]): number[] {
  const out = execFileSync(process.execPath, ['--input-type=module', '-e', FONTKIT_SCRIPT], {
    cwd: process.cwd(),
    input: JSON.stringify({ files, cps }),
    maxBuffer: 64 * 1024 * 1024,
  })
  return JSON.parse(out.toString('utf8')) as number[]
}

function textByFamily(): Record<string, string> {
  const out: Record<string, string> = {}
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    const el = n.parentElement
    if (!el || !(n.textContent ?? '').trim()) continue
    const fam = getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
    out[fam] = (out[fam] ?? '') + n.textContent
  }
  return out
}

test.describe('fonts', () => {
  test('[REQ-RDR-022] font files are bundled: four same-origin woff2 subsets, no online font service', async ({ page }) => {
    const requests: { url: string; type: string }[] = []
    page.on('request', (r) => requests.push({ url: r.url(), type: r.resourceType() }))
    await gotoReader(page)
    await openLexicon(page, '心經真言')
    await closeOverlay(page)
    await openVernacular(page, 's1')
    await closeOverlay(page)
    await setMode(page, 'iast')
    await page.evaluate(() => document.fonts.ready.then(() => undefined))

    const fonts = requests.filter((r) => r.type === 'font')
    expect(fonts.length).toBeGreaterThan(0)
    for (const f of fonts) expect(f.url.startsWith(ORIGIN + '/'), `font request ${f.url}`).toBe(true)
    expect(requests.filter((r) => /fonts\.googleapis\.com|fonts\.gstatic\.com/.test(r.url))).toEqual([])
    expect(requests.filter((r) => !r.url.startsWith(ORIGIN) && !r.url.startsWith('data:') && !r.url.startsWith('blob:'))).toEqual([])

    const dir = fontDir()
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.woff2')) : []
    for (const stem of ['serif-sutra', 'serif-lexicon', 'sans-core', 'sans-ext']) {
      expect(files.some((f) => f.startsWith(stem)), `${stem}*.woff2 in ${dir}`).toBe(true)
    }
    const loaded = await page.evaluate(() => [...new Set([...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].sort())
    expect(loaded).toEqual(expect.arrayContaining([SERIF, SANS]))
  })

  test('[REQ-RDR-022] scripture and definitions use Noto Serif TC; labels, <rt> and the vernacular panel use Noto Sans TC', async ({ page }) => {
    await gotoReader(page)
    const fam = async (sel: string) => firstFamily(await page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily))
    expect(await fam('[data-testid="sutra-page"]')).toBe(SERIF)
    expect(await fam('[data-testid="lex-token"]')).toBe(SERIF)
    expect(await fam('ruby')).toBe(SERIF)
    expect(await fam('rt')).toBe(SANS)
    expect(await fam('[data-testid="phonetic-toggle"]')).toBe(SANS)
    expect(await fam('[data-testid="vernacular-toggle"]')).toBe(SANS)

    const drawer = await openLexicon(page, '觀自在')
    const inDrawer = async (sel: string) => firstFamily(await drawer.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily))
    expect(await inDrawer('[data-testid="lexicon-def"]')).toBe(SERIF)
    expect(await drawer.locator('h3').evaluateAll((els) => els.map((e) => getComputedStyle(e).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')))).toEqual([SANS, SANS, SANS])
    await closeOverlay(page)

    const panel = await openVernacular(page, 's1')
    for (const id of ['vernacular-title', 'vernacular-text', 'vernacular-theme', 'vernacular-reflection']) {
      expect(firstFamily(await panel.getByTestId(id).first().evaluate((el) => getComputedStyle(el).fontFamily)), id).toBe(SANS)
    }
  })

  test('[REQ-RDR-022] every Han character and full-width punctuation on screen has a glyph in the bundled subset of its font', async ({ page }) => {
    test.setTimeout(120_000)
    const serifFiles = fontFiles('serif')
    const sansFiles = fontFiles('sans')
    expect(serifFiles.length, 'serif woff2 files').toBeGreaterThan(0)
    expect(sansFiles.length, 'sans woff2 files').toBeGreaterThan(0)

    await gotoReader(page)
    const gathered: Record<string, string>[] = []
    gathered.push(await page.evaluate(textByFamily))
    const drawer = await openLexicon(page, '觀自在')
    await drawer.locator('button[data-testid="lexicon-xref"]').first().click()
    await expect(drawer.getByTestId('lexicon-back')).toBeVisible()
    gathered.push(await page.evaluate(textByFamily))
    await closeOverlay(page)
    for (const seg of ['s1', 's9']) {
      await openVernacular(page, seg)
      gathered.push(await page.evaluate(textByFamily))
      await closeOverlay(page)
    }

    const serifText = new Set<string>()
    const sansText = new Set<string>()
    const stray: string[] = []
    for (const g of gathered) {
      for (const [family, text] of Object.entries(g)) {
        const target = family === SERIF ? serifText : family === SANS ? sansText : null
        for (const ch of text) {
          if (!needsBundledGlyph(ch.codePointAt(0)!)) continue
          if (target) target.add(ch)
          else stray.push(`${ch} in ${family}`)
        }
      }
    }
    // everything the data can put on screen: scripture and all definitions in serif, the project's own text in sans
    for (const tok of AST.segments.flatMap((s) => s.tokens)) for (const ch of tok.t) if (needsBundledGlyph(ch.codePointAt(0)!)) serifText.add(ch)
    for (const e of Object.values(LEX.entries)) for (const s of e.senses) for (const ch of defText(s)) if (needsBundledGlyph(ch.codePointAt(0)!)) serifText.add(ch)
    for (const s of AST.segments) for (const ch of [s.vernacular, s.reflection, ...s.themes].join('')) if (needsBundledGlyph(ch.codePointAt(0)!)) sansText.add(ch)
    serifText.add('〓')

    expect(stray, 'Han/full-width text rendered with a non-Noto family').toEqual([])
    const missingSerif = missingCodePoints(serifFiles, [...serifText].map((c) => c.codePointAt(0)!)).map((cp) => String.fromCodePoint(cp))
    const missingSans = missingCodePoints(sansFiles, [...sansText].map((c) => c.codePointAt(0)!)).map((cp) => String.fromCodePoint(cp))
    expect(missingSerif, 'characters missing from the serif subsets').toEqual([])
    expect(missingSans, 'characters missing from the sans subsets').toEqual([])
    expect(serifText.size).toBeGreaterThan(300)
    expect(sansText.size).toBeGreaterThan(100)
  })

  test('[REQ-RDR-022] the browser renders scripture characters and punctuation with the bundled font, not a system fallback', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'none') // no <rt>: only scripture text is left inside the pages
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-testid="sutra-page"] *' })
    expect(nodeIds.length).toBeGreaterThan(0)
    let glyphs = 0
    const system: string[] = []
    for (const nodeId of nodeIds) {
      const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      for (const f of fonts) {
        glyphs += f.glyphCount
        if (!f.isCustomFont) system.push(f.familyName)
      }
    }
    expect(system).toEqual([])
    expect(glyphs).toBeGreaterThanOrEqual(SCRIPTURE_CHARS)
    await cdp.detach()
  })

  test('[REQ-RDR-022] 〓 for private-use characters is covered by the serif subset', async () => {
    const serifFiles = fontFiles('serif')
    expect(serifFiles.length).toBeGreaterThan(0)
    expect(missingCodePoints(serifFiles, [0x3013])).toEqual([])
  })
})

const SCRIPTURE_CHARS = AST.segments.flatMap((s) => s.tokens).reduce((n, t) => n + [...t.t].length, 0)
