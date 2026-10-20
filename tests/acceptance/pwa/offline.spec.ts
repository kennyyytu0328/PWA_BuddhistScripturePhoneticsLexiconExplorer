import type { Page } from '@playwright/test'
import {
  ALL_TOKENS,
  DISTINCT_LEX,
  LEX,
  LEX_TOKENS,
  ORIGIN,
  closeOverlay,
  defText,
  expect,
  openControlled,
  openLexicon,
  reloadOffline,
  test,
} from './helpers'

test.use({ serviceWorkers: 'allow' })

const SCRIPTURE = ALL_TOKENS.map((t) => t.t).join('')
const SERIF = 'Noto Serif TC'
const SANS = 'Noto Sans TC'

interface DrawerFacts {
  headword: string | null
  zy: string | null
  py: string | null
  defs: string[]
  attribution: string | null
  gaiji: { id: string | null; src: string | null; loaded: boolean }[]
  backVisible: boolean
}

const drawerFacts = (page: Page): Promise<DrawerFacts> =>
  page.evaluate(() => {
    const t = (window as any).__t
    const d = document.querySelector('[data-testid="lexicon-drawer"]')!
    const text = (sel: string) => {
      const el = d.querySelector(sel)
      return el ? (el.textContent ?? '').trim() : null
    }
    const back = d.querySelector('button[data-testid="lexicon-back"]') as HTMLElement | null
    return {
      headword: text('[data-testid="lexicon-headword"]'),
      zy: text('[data-testid="reading-zhuyin"]'),
      py: text('[data-testid="reading-pinyin"]'),
      defs: [...d.querySelectorAll('[data-testid="lexicon-sense"] [data-testid="lexicon-def"]')].map((e) => t.textWithBr(e) as string),
      attribution: text('[data-testid="lexicon-attribution"]'),
      gaiji: [...d.querySelectorAll('[data-testid="lexicon-def"] img')].map((i) => {
        const img = i as HTMLImageElement
        return { id: img.dataset.gaiji ?? null, src: img.getAttribute('src'), loaded: img.complete && img.naturalWidth > 0 }
      }),
      backVisible: !!back && back.getClientRects().length > 0,
    }
  })

const expectedSenses = (lex: string, adopted: number) => {
  const senses = LEX.entries[lex].senses
  return [senses[adopted], ...senses.filter((_, i) => i !== adopted)]
}
const gaijiIds = (lex: string): string[] =>
  LEX.entries[lex].senses.flatMap((s) => s.def.filter((p): p is { g: string } => typeof p !== 'string').map((p) => p.g))
const allXr = (lex: string): string[] => [...new Set(LEX.entries[lex].senses.flatMap((s) => s.xr))]

function inOrder(hay: string, needles: string[]): boolean {
  let from = 0
  for (const n of needles) {
    const i = hay.indexOf(n, from)
    if (i < 0) return false
    from = i + n.length
  }
  return true
}

test.describe('offline scripture', () => {
  test('[REQ-PWA-010] offline reload renders the whole scripture: on-screen text (without <rt>) equals the AST tokens, no load error', async ({ page }) => {
    await openControlled(page)
    const failed: string[] = []
    page.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText}`))
    await reloadOffline(page)

    const tokens = await page.evaluate(() => (window as any).__t.tokens() as { text: string; kind: string }[])
    expect(tokens.length).toBe(ALL_TOKENS.length)
    expect(tokens.map((t) => t.text).join('')).toBe(SCRIPTURE)
    expect(SCRIPTURE.length).toBeGreaterThan(200)
    await expect(page.getByTestId('load-error')).toHaveCount(0)
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await expect(page.locator('button[data-testid="lex-token"]')).toHaveCount(LEX_TOKENS.length)
    expect(failed).toEqual([])
  })

  test('[REQ-PWA-010] during the offline reload every same-origin response comes from the service worker, including the AST, the lexicon and the font files', async ({ page }) => {
    await openControlled(page)
    const seen: { url: string; status: number; fromSW: boolean; type: string }[] = []
    page.on('response', (r) =>
      seen.push({ url: r.url(), status: r.status(), fromSW: r.fromServiceWorker(), type: r.request().resourceType() }),
    )
    await reloadOffline(page)

    expect(seen.length).toBeGreaterThan(5)
    expect(seen.filter((s) => !s.url.startsWith(ORIGIN + '/') && !s.url.startsWith('data:'))).toEqual([])
    expect(seen.filter((s) => !s.fromSW).map((s) => s.url), 'responses not served by the service worker').toEqual([])
    expect(seen.filter((s) => s.status !== 200).map((s) => `${s.status} ${s.url}`)).toEqual([])
    const paths = seen.map((s) => new URL(s.url).pathname)
    expect(paths).toContain('/data/heart-sutra.ast.json')
    expect(paths).toContain('/data/lexicon.dfb.json')
    const fonts = seen.filter((s) => s.type === 'font').map((s) => new URL(s.url).pathname)
    expect(fonts).toContain('/fonts/serif-sutra.woff2')
    expect(fonts).toContain('/fonts/sans-core.woff2')
  })

  test('[REQ-PWA-010] offline, scripture and interface text use the bundled Noto Serif TC / Noto Sans TC subsets (loaded, not a system fallback)', async ({ page }) => {
    await openControlled(page)
    await reloadOffline(page)

    const fonts = await page.evaluate(() => {
      const faces = [...document.fonts]
      return {
        loaded: [...new Set(faces.filter((f) => f.status === 'loaded').map((f) => f.family.replace(/["']/g, '')))].sort(),
        errored: faces.filter((f) => f.status === 'error').map((f) => f.family),
      }
    })
    expect(fonts.errored).toEqual([])
    expect(fonts.loaded).toEqual([SANS, SERIF].sort())

    const first = (sel: string) =>
      page.locator(sel).first().evaluate((el) => getComputedStyle(el).fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, ''))
    expect(await first('[data-testid="lex-token"]')).toBe(SERIF)
    expect(await first('rt')).toBe(SANS)
    expect(await first('[data-testid="phonetic-toggle"]')).toBe(SANS)

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('DOM.enable')
    await cdp.send('CSS.enable')
    const { root } = await cdp.send('DOM.getDocument', { depth: 0 })
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-testid="sutra-page"] *' })
    expect(nodeIds.length).toBeGreaterThan(0)
    let glyphs = 0
    const system: string[] = []
    for (const nodeId of nodeIds) {
      const { fonts: used } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })
      for (const f of used) {
        glyphs += f.glyphCount
        if (!f.isCustomFont) system.push(f.familyName)
      }
    }
    await cdp.detach()
    expect(system).toEqual([])
    expect(glyphs).toBeGreaterThanOrEqual(SCRIPTURE.length)
  })

  test('[REQ-PWA-011] offline, every lex token opens its drawer: headword, readings, all DFB senses verbatim, attribution; gaiji images load', async ({ page }) => {
    test.setTimeout(300_000)
    await openControlled(page)
    const failed: string[] = []
    page.on('requestfailed', (r) => failed.push(r.url()))
    await reloadOffline(page)
    expect(DISTINCT_LEX).toHaveLength(38)

    const problems: string[] = []
    const gaijiSeen = new Set<string>()
    for (const lex of DISTINCT_LEX) {
      const tok = LEX_TOKENS.find((t) => t.lex === lex)!
      await openLexicon(page, lex)
      const f = await drawerFacts(page)
      const exp = expectedSenses(lex, tok.sense ?? 0).map(defText)
      if (f.headword !== lex) problems.push(`${lex}: headword ${f.headword}`)
      if (!inOrder(f.zy ?? '', tok.chars!.map((c) => c.zy))) problems.push(`${lex}: zhuyin "${f.zy}"`)
      if (!inOrder(f.py ?? '', tok.chars!.map((c) => c.py))) problems.push(`${lex}: pinyin "${f.py}"`)
      if (JSON.stringify(f.defs) !== JSON.stringify(exp)) problems.push(`${lex}: definitions differ`)
      if (f.attribution !== LEX.attribution) problems.push(`${lex}: attribution "${f.attribution}"`)
      const wantIds = gaijiIds(lex)
      if (JSON.stringify(f.gaiji.map((g) => g.id)) !== JSON.stringify(wantIds)) problems.push(`${lex}: gaiji ids ${JSON.stringify(f.gaiji.map((g) => g.id))} != ${JSON.stringify(wantIds)}`)
      for (const g of f.gaiji) {
        if (!g.loaded) problems.push(`${lex}: gaiji ${g.id} did not load (naturalWidth 0)`)
        if (g.id) gaijiSeen.add(g.id)
      }
      await closeOverlay(page)
    }
    expect(problems).toEqual([])
    expect([...gaijiSeen].sort()).toEqual(['DF-8752', 'DF-875F'])
    expect(failed).toEqual([])
  })

  test('[REQ-PWA-011] offline, every cross-reference button opens its target entry (all 11 targets) with attribution and a 返回 button', async ({ page }) => {
    test.setTimeout(300_000)
    await openControlled(page)
    const failed: string[] = []
    page.on('requestfailed', (r) => failed.push(r.url()))
    await reloadOffline(page)

    const reach = new Map<string, string>()
    for (const lex of DISTINCT_LEX) for (const x of allXr(lex)) if (LEX.entries[x] && !reach.has(x)) reach.set(x, lex)
    expect([...reach.keys()].sort()).toEqual(['三科', '四諦', '大般涅槃', '心經', '般若波羅蜜', '菩薩', '萬法', '蘇波訶', '觀音', '陰', '色即是空'].sort())

    const problems: string[] = []
    for (const [target, owner] of reach) {
      const drawer = await openLexicon(page, owner)
      await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: new RegExp(`^${target}$`) }).click()
      await expect(drawer.getByTestId('lexicon-headword')).toHaveText(target)
      const f = await drawerFacts(page)
      if (JSON.stringify(f.defs) !== JSON.stringify(LEX.entries[target].senses.map(defText))) problems.push(`${target}: definitions differ`)
      if (f.attribution !== LEX.attribution) problems.push(`${target}: attribution "${f.attribution}"`)
      if (!f.backVisible) problems.push(`${target}: no 返回 button`)
      for (const g of f.gaiji) if (!g.loaded) problems.push(`${target}: gaiji ${g.id} did not load`)
      await closeOverlay(page)
    }
    expect(problems).toEqual([])
    expect(failed).toEqual([])
  })

  test('[REQ-PWA-011] offline, 心經真言 shows both gaiji images from the cache (DF-8752, DF-875F), naturalWidth > 0, src under /data/gaiji/', async ({ page }) => {
    await openControlled(page)
    await reloadOffline(page)
    await openLexicon(page, '心經真言')
    const f = await drawerFacts(page)
    expect(f.gaiji).toEqual([
      { id: 'DF-8752', src: 'data/gaiji/DF-8752.png', loaded: true },
      { id: 'DF-875F', src: 'data/gaiji/DF-875F.png', loaded: true },
    ])
    const widths = await page.locator('[data-testid="lexicon-def"] img').evaluateAll((els) => els.map((e) => (e as HTMLImageElement).naturalWidth))
    expect(widths.every((w) => w > 0)).toBe(true)
    expect(widths).toHaveLength(2)
  })
})
