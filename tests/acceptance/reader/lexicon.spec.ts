import type { Page } from '@playwright/test'
import {
  AMBER_500,
  AMBER_900_40,
  DISTINCT_LEX,
  LEX,
  LEX_TOKENS,
  PUA,
  closeOverlay,
  closeTo,
  collectPageErrors,
  defText,
  dragDown,
  expect,
  gotoReader,
  installDeviceStubs,
  openLexicon,
  setMode,
  test,
  vibrateCalls,
  viewportSize,
} from './helpers'
import type { DefPart, Sense, Tok } from './helpers'

interface DrawerSnapshot {
  headword: string | null
  h3: string[]
  zy: string | null
  py: string | null
  iast: string | null
  senses: { adopted: string | null; usg: string | null; def: string }[]
  xrButtons: string[]
  xrTexts: string[]
  attribution: string | null
}

const snapshot = (page: Page): Promise<DrawerSnapshot> =>
  page.evaluate(() => {
    const t = (window as any).__t
    const d = document.querySelector('[data-testid="lexicon-drawer"]')!
    const text = (sel: string) => {
      const el = d.querySelector(sel)
      return el ? (el.textContent ?? '').trim() : null
    }
    return {
      headword: text('[data-testid="lexicon-headword"]'),
      h3: [...d.querySelectorAll('h3')].map((h) => (h.textContent ?? '').trim()),
      zy: text('[data-testid="reading-zhuyin"]'),
      py: text('[data-testid="reading-pinyin"]'),
      iast: text('[data-testid="reading-iast"]'),
      senses: [...d.querySelectorAll('[data-testid="lexicon-sense"]')].map((s) => ({
        adopted: s.getAttribute('data-adopted'),
        usg: s.querySelector('[data-testid="lexicon-usg"]') ? (s.querySelector('[data-testid="lexicon-usg"]')!.textContent ?? '').trim() : null,
        def: t.textWithBr(s.querySelector('[data-testid="lexicon-def"]')) as string,
      })),
      xrButtons: [...d.querySelectorAll('button[data-testid="lexicon-xref"]')].map((b) => (b.textContent ?? '').trim()),
      xrTexts: [...d.querySelectorAll('span[data-testid="lexicon-xref-text"]')].map((b) => (b.textContent ?? '').trim()),
      attribution: text('[data-testid="lexicon-attribution"]'),
    }
  })

/** Expected sense order: the adopted sense first, the rest in DFB order. */
function expectedSenses(lex: string, adopted: number): Sense[] {
  const senses = LEX.entries[lex].senses
  return [senses[adopted], ...senses.filter((_, i) => i !== adopted)]
}

function tokenOccurrences(lex: string): Tok[] {
  return LEX_TOKENS.filter((t) => t.lex === lex)
}

function mergeStrings(parts: DefPart[]): DefPart[] {
  const out: DefPart[] = []
  for (const p of parts) {
    const last = out[out.length - 1]
    if (typeof p === 'string' && typeof last === 'string') out[out.length - 1] = last + p
    else out.push(p)
  }
  return out
}

function containsInOrder(hay: string, needles: string[]): boolean {
  let from = 0
  for (const n of needles) {
    const idx = hay.indexOf(n, from)
    if (idx < 0) return false
    from = idx + n.length
  }
  return true
}

const allXr = (lex: string): string[] => [...new Set(LEX.entries[lex].senses.flatMap((s) => s.xr))]

test.describe('lexicon drawer', () => {
  test('[REQ-RDR-012] tapping a lex token calls navigator.vibrate(12) exactly once', async ({ page }) => {
    await installDeviceStubs(page, { vibrate: 'record' })
    await gotoReader(page)
    expect(await vibrateCalls(page)).toEqual([])
    await openLexicon(page, '觀自在')
    expect(await vibrateCalls(page)).toEqual([[12]])
  })

  test('[REQ-RDR-012] without the Vibration API nothing throws and the drawer still opens', async ({ page }) => {
    await installDeviceStubs(page, { vibrate: 'absent' })
    const errors = collectPageErrors(page)
    await gotoReader(page)
    expect(await page.evaluate(() => 'vibrate' in navigator && typeof navigator.vibrate === 'function')).toBe(false)
    const drawer = await openLexicon(page, '觀自在')
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀自在')
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-013] highlight within 0.3s: bg amber-900/40, bottom border amber-500, only the tapped token, cleared on close', async ({ page }) => {
    await gotoReader(page)
    const nth = 2 // the third 般若波羅蜜多 in the sutra
    const tokens = page.locator('button[data-testid="lex-token"][data-lex="般若波羅蜜多"]')
    expect(await tokens.count()).toBe(tokenOccurrences('般若波羅蜜多').length)
    const result = await tokens.nth(nth).evaluate(
      (el, [bg, border]) =>
        new Promise<{ matched: boolean; elapsed: number; bgNow: number[]; borderNow: number[]; width: string; style: string }>((resolve) => {
          const t = (window as any).__t
          const t0 = performance.now()
          ;(el as HTMLElement).click()
          const probe = () => {
            const s = getComputedStyle(el)
            const bgNow = t.rgba(s.backgroundColor)
            const borderNow = t.rgba(s.borderBottomColor)
            const matched = t.close(bgNow, bg) && t.close(borderNow, border) && parseFloat(s.borderBottomWidth) > 0 && s.borderBottomStyle === 'solid'
            const elapsed = performance.now() - t0
            if (matched || elapsed > 1500) resolve({ matched, elapsed, bgNow, borderNow, width: s.borderBottomWidth, style: s.borderBottomStyle })
            else requestAnimationFrame(probe)
          }
          probe()
        }),
      [AMBER_900_40, AMBER_500] as const,
    )
    expect(result.matched, `highlight not reached: ${JSON.stringify(result)}`).toBe(true)
    expect(result.elapsed).toBeLessThanOrEqual(300)

    // exactly one token is active and it is the tapped one
    await expect(page.locator('[data-active="true"]')).toHaveCount(1)
    const activeIndex = await tokens.evaluateAll((els) => els.map((e) => e.getAttribute('data-active') === 'true'))
    expect(activeIndex).toEqual(tokenOccurrences('般若波羅蜜多').map((_, i) => i === nth))

    // closing the drawer removes the highlight
    await closeOverlay(page)
    await expect(page.locator('[data-active="true"]')).toHaveCount(0)
    const bgAfter = await tokens.nth(nth).evaluate((el) => (window as any).__t.rgba(getComputedStyle(el).backgroundColor) as number[])
    expect(bgAfter[3]).toBe(0)
  })

  test('[REQ-RDR-013] after closing, tapping another token highlights only that one', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '觀自在')
    await expect(page.locator('[data-active="true"]')).toHaveCount(1)
    await expect(page.locator('[data-active="true"]')).toHaveAttribute('data-lex', '觀自在')
    await closeOverlay(page)
    await expect(page.locator('[data-active="true"]')).toHaveCount(0)
    await openLexicon(page, '空')
    await expect(page.locator('[data-active="true"]')).toHaveCount(1)
    await expect(page.locator('[data-active="true"]')).toHaveAttribute('data-lex', '空')
  })

  test('[REQ-RDR-014] a vaul bottom sheet slides up from the bottom of the screen; no popover or tooltip', async ({ page }) => {
    await gotoReader(page)
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0)
    const drawer = await openLexicon(page, '觀自在')
    const { w, h } = await viewportSize(page)
    const info = await drawer.evaluate((el) => ({
      rect: el.getBoundingClientRect().toJSON(),
      vaul: el.hasAttribute('data-vaul-drawer'),
      direction: el.getAttribute('data-vaul-drawer-direction'),
    }))
    expect(info.vaul).toBe(true)
    expect(info.direction).toBe('bottom')
    expect(Math.abs(info.rect.bottom - h)).toBeLessThanOrEqual(1)
    expect(info.rect.top).toBeGreaterThan(0)
    expect(Math.abs(info.rect.width - w)).toBeLessThanOrEqual(1)
    expect(await page.locator('[popover], [role="tooltip"]').count()).toBe(0)
  })

  test('[REQ-RDR-014] drawer content order: headword, readings, definitions, xrefs, attribution; section titles 讀音 / 釋義 / 參見', async ({ page }) => {
    await gotoReader(page)
    const drawer = await openLexicon(page, '觀自在')
    const order = await drawer.evaluate((d) => {
      const wanted = ['lexicon-headword', 'lexicon-readings', 'lexicon-sense', 'lexicon-xrefs', 'lexicon-attribution']
      return [...d.querySelectorAll('[data-testid]')]
        .map((e) => (e as HTMLElement).dataset.testid as string)
        .filter((id) => wanted.includes(id))
        .filter((id, i, all) => all[i - 1] !== id)
    })
    expect(order).toEqual(['lexicon-headword', 'lexicon-readings', 'lexicon-sense', 'lexicon-xrefs', 'lexicon-attribution'])
    const snap = await snapshot(page)
    expect(snap.headword).toBe('觀自在')
    expect(await drawer.getByTestId('lexicon-headword').evaluate((e) => e.tagName)).toBe('H2')
    expect(snap.h3).toEqual(['讀音', '釋義', '參見'])
    expect(await drawer.getByTestId('lexicon-readings').locator('h3').first().textContent()).toBe('讀音')
    expect(await drawer.getByTestId('lexicon-xrefs').locator('h3').first().textContent()).toBe('參見')
    expect(await drawer.getByTestId('lexicon-attribution').locator('h1, h2, h3, h4, h5, h6').count()).toBe(0)
  })

  test('[REQ-RDR-014] an entry without cross references shows no 參見 section', async ({ page }) => {
    await gotoReader(page)
    const lex = DISTINCT_LEX.find((l) => allXr(l).length === 0)!
    await openLexicon(page, lex)
    const snap = await snapshot(page)
    expect(snap.h3).toEqual(['讀音', '釋義'])
    await expect(page.getByTestId('lexicon-xrefs')).toHaveCount(0)
    await expect(page.getByTestId('lexicon-drawer')).not.toContainText('參見')
  })

  test('[REQ-RDR-014] readings list the token zhuyin and pinyin per char plus its iast (only if present), whatever the current mode', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'none')
    const cases: { lex: string; nth: number }[] = [
      { lex: '觀自在', nth: 0 },
      { lex: '般若波羅蜜多', nth: 0 },
      { lex: '空', nth: 0 },
      { lex: '一切', nth: 0 }, // s1: no iast
      { lex: '一切', nth: 1 }, // s8: sarva
    ]
    for (const c of cases) {
      const tok = tokenOccurrences(c.lex)[c.nth]
      await openLexicon(page, c.lex, c.nth)
      const snap = await snapshot(page)
      const label = `${c.lex}#${c.nth}`
      expect(containsInOrder(snap.zy ?? '', tok.chars!.map((x) => x.zy)), `${label} zhuyin "${snap.zy}"`).toBe(true)
      expect(containsInOrder(snap.py ?? '', tok.chars!.map((x) => x.py)), `${label} pinyin "${snap.py}"`).toBe(true)
      if (tok.iast) expect(snap.iast, label).toContain(tok.iast)
      else expect(snap.iast, `${label} has no iast row`).toBeNull()
      await closeOverlay(page)
    }
    expect(tokenOccurrences('一切')[0].iast).toBeUndefined()
    expect(tokenOccurrences('一切')[1].iast).toBe('sarva')
  })

  test('[REQ-RDR-014] every sense is listed, the adopted one first and marked, usg shown only when not null', async ({ page }) => {
    await gotoReader(page)
    const multi = DISTINCT_LEX.filter((l) => LEX.entries[l].senses.length > 1)
    expect(multi.length).toBeGreaterThan(0)
    for (const lex of multi) {
      const tok = tokenOccurrences(lex)[0]
      await openLexicon(page, lex)
      const snap = await snapshot(page)
      const exp = expectedSenses(lex, tok.sense ?? 0)
      expect(snap.senses.length, `${lex} sense count`).toBe(exp.length)
      expect(snap.senses.map((s) => s.adopted === 'true'), `${lex} adopted flags`).toEqual(exp.map((_, i) => i === 0))
      const actualUsg = snap.senses.map((s) => s.usg)
      expect(actualUsg.map((u) => u === null), `${lex} usg presence`).toEqual(exp.map((e) => e.usg === null))
      actualUsg.forEach((u, i) => {
        if (u !== null) expect(u, `${lex} sense ${i} usg`).toContain(exp[i].usg as string)
      })
      await closeOverlay(page)
    }
    // 空相 has a second sense whose usg is null: no usg element for it
    await openLexicon(page, '空相')
    const snap = await snapshot(page)
    expect(snap.senses.map((s) => s.usg === null)).toEqual([false, true])
  })

  test('[REQ-RDR-015] definitions equal the DFB def strings character for character (newlines included) for all 38 terms', async ({ page }) => {
    test.setTimeout(240_000)
    await gotoReader(page)
    const mismatches: string[] = []
    for (const lex of DISTINCT_LEX) {
      const tok = tokenOccurrences(lex)[0]
      await openLexicon(page, lex)
      const snap = await snapshot(page)
      const exp = expectedSenses(lex, tok.sense ?? 0).map(defText)
      if (JSON.stringify(snap.senses.map((s) => s.def)) !== JSON.stringify(exp)) mismatches.push(lex)
      await closeOverlay(page)
    }
    expect(mismatches).toEqual([])
    expect(DISTINCT_LEX).toHaveLength(38)
  })

  test('[REQ-RDR-015] entries opened through an xref (11 targets, incl. 四諦 with a newline) are also verbatim, in DFB order', async ({ page }) => {
    test.setTimeout(240_000)
    await gotoReader(page)
    const reach = new Map<string, string>()
    for (const lex of DISTINCT_LEX) for (const x of allXr(lex)) if (LEX.entries[x] && !reach.has(x)) reach.set(x, lex)
    expect([...reach.keys()].sort()).toEqual(['三科', '四諦', '大般涅槃', '心經', '般若波羅蜜', '菩薩', '萬法', '蘇波訶', '觀音', '陰', '色即是空'].sort())
    const mismatches: string[] = []
    for (const [target, owner] of reach) {
      const drawer = await openLexicon(page, owner)
      await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: new RegExp(`^${target}$`) }).click()
      await expect(drawer.getByTestId('lexicon-headword')).toHaveText(target)
      const snap = await snapshot(page)
      if (JSON.stringify(snap.senses.map((s) => s.def)) !== JSON.stringify(LEX.entries[target].senses.map(defText))) mismatches.push(target)
      await closeOverlay(page)
    }
    expect(mismatches).toEqual([])
    expect(LEX.entries['四諦'].senses.some((s) => defText(s).includes('\n'))).toBe(true)
  })

  test('[REQ-RDR-015] gaiji objects become inline <img src="data/gaiji/ID.png"> at their original position (心經真言: DF-8752, DF-875F)', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '心經真言')
    const expected = LEX.entries['心經真言'].senses.map((s) => mergeStrings(s.def))
    const actual = await page.evaluate(() => {
        const walk = (node: Node, out: any[]) => {
        node.childNodes.forEach((n) => {
          if (n.nodeType === 3) {
            const s = n.textContent ?? ''
            if (typeof out[out.length - 1] === 'string') out[out.length - 1] += s
            else out.push(s)
          } else if (n instanceof HTMLImageElement) out.push({ g: n.dataset.gaiji })
          else if (n instanceof HTMLBRElement) {
            if (typeof out[out.length - 1] === 'string') out[out.length - 1] += '\n'
            else out.push('\n')
          } else walk(n, out)
        })
        return out
      }
      return [...document.querySelectorAll('[data-testid="lexicon-sense"] [data-testid="lexicon-def"]')].map((d) => walk(d, []))
    })
    expect(actual).toEqual(expected)
    const imgs = await page.locator('[data-testid="lexicon-def"] img').evaluateAll((els) =>
      els.map((e) => {
        const i = e as HTMLImageElement
        return { gaiji: i.dataset.gaiji, src: i.getAttribute('src'), loaded: i.complete && i.naturalWidth > 0, display: getComputedStyle(i).display }
      }),
    )
    const ids = LEX.entries['心經真言'].senses.flatMap((s) => s.def.filter((p): p is { g: string } => typeof p !== 'string').map((p) => p.g))
    expect(ids).toEqual(expect.arrayContaining(['DF-8752', 'DF-875F']))
    expect(imgs.map((i) => ({ gaiji: i.gaiji, src: i.src, loaded: i.loaded }))).toEqual(ids.map((g) => ({ gaiji: g, src: `data/gaiji/${g}.png`, loaded: true })))
    for (const i of imgs) expect(i.display).toMatch(/^inline/)
  })

  test('[REQ-RDR-015] private-use characters stay in the DOM text, are shown as 〓 and labelled 缺字 (舍利弗)', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '舍利弗')
    const puaInData = LEX.entries['舍利弗'].senses.map(defText).join('').match(PUA) ?? []
    expect(puaInData.length).toBeGreaterThan(0)
    const info = await page.evaluate(() => {
      const spans = [...document.querySelectorAll('span[data-testid="missing-glyph"]')] as HTMLElement[]
      const defText = [...document.querySelectorAll('[data-testid="lexicon-def"]')].map((d) => d.textContent ?? '').join('')
      return {
        spans: spans.map((s) => ({ role: s.getAttribute('role'), label: s.getAttribute('aria-label'), text: s.textContent, before: getComputedStyle(s, '::before').content })),
        puaInDef: defText.match(/[-]/g) ?? [],
      }
    })
    expect(info.puaInDef).toEqual(puaInData)
    expect(info.spans).toEqual(puaInData.map((c) => ({ role: 'img', label: '缺字', text: c, before: '"〓"' })))
  })

  test('[REQ-RDR-016] 觀自在 -> 觀音 swaps the content, shows 返回, 返回 restores 觀自在; uncollected targets are plain text', async ({ page }) => {
    await gotoReader(page)
    const drawer = await openLexicon(page, '觀自在')
    expect(await drawer.locator('button[data-testid="lexicon-back"]').isVisible()).toBe(false)
    const first = await snapshot(page)
    expect(first.xrButtons).toEqual(['觀音'])
    expect(first.xrTexts).toEqual([])

    await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')
    const back = drawer.locator('button[data-testid="lexicon-back"]')
    await expect(back).toHaveText('返回')
    const second = await snapshot(page)
    expect(second.senses.map((s) => s.def)).toEqual(LEX.entries['觀音'].senses.map(defText))
    expect(second.attribution).toBe(LEX.attribution)
    // 五大明王 is not collected: plain text, not a button, and tapping it changes nothing
    expect(second.xrButtons).toEqual([])
    expect(second.xrTexts).toEqual(['五大明王'])
    await drawer.locator('span[data-testid="lexicon-xref-text"]', { hasText: '五大明王' }).click()
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')

    await back.click()
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀自在')
    expect(await snapshot(page)).toEqual(first)
    expect(await drawer.locator('button[data-testid="lexicon-back"]').isVisible()).toBe(false)
  })

  test('[REQ-RDR-016] 般若波羅蜜多咒 -> 心經: 般若心經 is plain text', async ({ page }) => {
    await gotoReader(page)
    const drawer = await openLexicon(page, '般若波羅蜜多咒')
    await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '心經' }).click()
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('心經')
    const snap = await snapshot(page)
    expect(snap.xrButtons).toEqual([])
    expect(snap.xrTexts).toEqual(['般若心經'])
  })

  test('[REQ-RDR-016] every term lists its xrefs: collected targets as buttons, others as plain text', async ({ page }) => {
    test.setTimeout(240_000)
    await gotoReader(page)
    const wrong: string[] = []
    for (const lex of DISTINCT_LEX.filter((l) => allXr(l).length > 0)) {
      await openLexicon(page, lex)
      const snap = await snapshot(page)
      const xr = allXr(lex)
      const wantButtons = xr.filter((x) => LEX.entries[x]).sort()
      const wantTexts = xr.filter((x) => !LEX.entries[x]).sort()
      if (JSON.stringify([...snap.xrButtons].sort()) !== JSON.stringify(wantButtons) || JSON.stringify([...snap.xrTexts].sort()) !== JSON.stringify(wantTexts)) {
        wrong.push(`${lex}: buttons ${JSON.stringify(snap.xrButtons)} texts ${JSON.stringify(snap.xrTexts)}`)
      }
      await closeOverlay(page)
    }
    expect(wrong).toEqual([])
  })

  test('[REQ-RDR-017] every term drawer shows the attribution from lexicon.dfb.json verbatim', async ({ page }) => {
    test.setTimeout(240_000)
    await gotoReader(page)
    expect(LEX.attribution).toBe('名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權')
    const wrong: string[] = []
    for (const lex of DISTINCT_LEX) {
      await openLexicon(page, lex)
      const snap = await snapshot(page)
      if (snap.attribution !== LEX.attribution) wrong.push(`${lex}: ${snap.attribution}`)
      await closeOverlay(page)
    }
    expect(wrong).toEqual([])
  })

  test('[REQ-RDR-017] an entry opened through an xref shows the attribution too', async ({ page }) => {
    await gotoReader(page)
    const drawer = await openLexicon(page, '觀自在')
    await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
    await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')
    await expect(drawer.getByTestId('lexicon-attribution')).toHaveText(LEX.attribution)
  })

  test('[REQ-RDR-017] the attribution comes from the data file, not from the program', async ({ page }) => {
    const custom = '測試用出處-XYZ-123'
    await page.route('**/data/lexicon.dfb.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ...LEX, attribution: custom }) }),
    )
    await gotoReader(page)
    const drawer = await openLexicon(page, '觀自在')
    await expect(drawer.getByTestId('lexicon-attribution')).toHaveText(custom)
    await expect(drawer).not.toContainText(LEX.attribution)
  })

  test('[REQ-RDR-018] a blur overlay covers the scripture behind the drawer; dragging down closes it and the blur goes away', async ({ page }) => {
    await gotoReader(page)
    const drawer = await openLexicon(page, '觀自在')
    const { w, h } = await viewportSize(page)
    const overlay = await page.evaluate(() => {
      const el = document.querySelector('[data-vaul-overlay]')
      if (!el) return null
      const s = getComputedStyle(el)
      const r = el.getBoundingClientRect()
      return { filter: s.getPropertyValue('backdrop-filter') || s.getPropertyValue('-webkit-backdrop-filter'), w: r.width, h: r.height }
    })
    expect(overlay, '[data-vaul-overlay] exists while open').not.toBeNull()
    const blur = /blur\(([\d.]+)px\)/.exec(overlay!.filter)
    expect(blur, `backdrop-filter "${overlay!.filter}"`).not.toBeNull()
    expect(parseFloat(blur![1])).toBeGreaterThan(0)
    expect(overlay!.w).toBeGreaterThanOrEqual(w - 1)
    expect(overlay!.h).toBeGreaterThanOrEqual(h - 1)

    await dragDown(page, drawer)
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0, { timeout: 5000 })
    await expect
      .poll(() =>
        page.evaluate(() => {
          const el = document.querySelector('[data-vaul-overlay]')
          if (!el) return 'none'
          const f = getComputedStyle(el).getPropertyValue('backdrop-filter')
          return f === 'none' || /blur\(0(px)?\)/.test(f) ? 'none' : f
        }),
      )
      .toBe('none')
    await expect(page.locator('[data-active="true"]')).toHaveCount(0)
  })
})
