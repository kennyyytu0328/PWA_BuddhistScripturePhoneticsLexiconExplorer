import {
  ALL_TOKENS,
  AST,
  LEX_TOKENS,
  STONE_950,
  closeTo,
  expect,
  expectPageAligned,
  firstFamily,
  gotoCover,
  gotoReader,
  installDeviceStubs,
  pageEl,
  setMode,
  shotBase64,
  swipeToNextPage,
  tcall,
  test,
  vibrateCalls,
  viewportSize,
} from './helpers'

interface TokenInfo { kind: string; tag: string; lex: string | null; seg: string | null; text: string }
interface Rect { left: number; top: number; right: number; bottom: number; width: number; height: number }
interface PunctInfo {
  char: string
  seg: string | null
  rect: Rect | null
  prev: { char: string; rect: Rect } | null
  fontSize: number
}

test.describe('layout', () => {
  test('[REQ-RDR-001] Zen Mode: no header/nav/footer, stone-950 background, text area fills the window height', async ({ page }) => {
    await gotoReader(page)
    for (const tag of ['header', 'nav', 'footer']) {
      expect(await page.locator(tag).count(), `<${tag}> elements`).toBe(0)
    }
    const bg = await page.evaluate(() => {
      const t = (window as any).__t
      const body = t.rgba(getComputedStyle(document.body).backgroundColor)
      const html = t.rgba(getComputedStyle(document.documentElement).backgroundColor)
      return { body, html }
    })
    const effective = bg.body[3] > 0 ? bg.body : bg.html
    expect(closeTo(effective, STONE_950), `page background ${JSON.stringify(bg)} should be #0c0a09`).toBe(true)
    const { h } = await viewportSize(page)
    const rect = await page.getByTestId('sutra-viewport').evaluate((el) => el.getBoundingClientRect().toJSON())
    expect(Math.abs(rect.top)).toBeLessThanOrEqual(1)
    expect(Math.abs(rect.height - h)).toBeLessThanOrEqual(1)
  })

  test('[REQ-RDR-002] vertical container: computed style, starts at the cover, snaps page by page (cover -> s1 -> s2)', async ({ page }) => {
    await gotoCover(page)
    const vp = page.getByTestId('sutra-viewport')
    const { w, h } = await viewportSize(page)
    const cs = await vp.evaluate((el) => {
      const s = getComputedStyle(el)
      return {
        height: s.height,
        width: s.width,
        overflowX: s.overflowX,
        overflowY: s.overflowY,
        overscrollBehaviorX: s.overscrollBehaviorX,
        scrollSnapType: s.scrollSnapType,
        direction: s.direction,
      }
    })
    expect(parseFloat(cs.height)).toBeCloseTo(h, 0)
    expect(parseFloat(cs.width)).toBeCloseTo(w, 0)
    expect(cs.overflowX).toBe('auto')
    expect(cs.overflowY).toBe('hidden')
    expect(cs.overscrollBehaviorX).toBe('contain')
    expect(cs.scrollSnapType).toBe('x mandatory')
    expect(cs.direction).toBe('rtl')

    // the cover (REQ-RDR-030) is at the right edge and fully visible; page 1 lies directly to its left
    const cover = await page.getByTestId('sutra-cover').evaluate((el) => el.getBoundingClientRect().toJSON())
    expect(cover.right).toBeGreaterThanOrEqual(w - 1)
    expect(cover.right).toBeLessThanOrEqual(w + 1)
    expect(cover.left).toBeGreaterThanOrEqual(-1)
    expect(await vp.evaluate((el) => el.scrollLeft)).toBe(0)
    const s1 = await pageEl(page, 's1').evaluate((el) => el.getBoundingClientRect().toJSON())
    expect(Math.abs(s1.right - cover.left), 'page 1 starts where the cover ends').toBeLessThanOrEqual(1)

    // swiping forward lands exactly on the head of page 1, then page 2
    await swipeToNextPage(page)
    await expectPageAligned(page, 's1')
    await swipeToNextPage(page)
    await expectPageAligned(page, 's2')
  })

  test('[REQ-RDR-003] page style: snap align, vertical-rl, upright, vkrn/vert, Noto Serif TC, 2.8 line-height, 0.5em spacing, padding', async ({ page }) => {
    await gotoReader(page)
    const info = await page.evaluate(() => {
      const pages = [...document.querySelectorAll('[data-testid="sutra-page"]')] as HTMLElement[]
      const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize)
      return {
        rootPx,
        segments: pages.map((p) => p.dataset.segment),
        styles: pages.map((p) => {
          const s = getComputedStyle(p)
          return {
            snapAlign: s.scrollSnapAlign,
            writingMode: s.writingMode,
            textOrientation: s.textOrientation,
            features: s.fontFeatureSettings,
            family: s.fontFamily,
            fontSize: parseFloat(s.fontSize),
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing,
            pt: s.paddingTop,
            pb: s.paddingBottom,
            pl: s.paddingLeft,
            pr: s.paddingRight,
            width: p.getBoundingClientRect().width,
          }
        }),
        winW: window.innerWidth,
      }
    })
    expect(info.segments).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'])
    for (const [i, s] of info.styles.entries()) {
      const label = `page ${i + 1}`
      expect(s.snapAlign, label).toMatch(/^start( start)?$/)
      expect(s.writingMode, label).toBe('vertical-rl')
      expect(s.textOrientation, label).toBe('upright')
      expect(s.features, label).toContain('"vkrn"')
      expect(s.features, label).toContain('"vert"')
      expect(firstFamily(s.family), label).toBe('Noto Serif TC')
      expect(parseFloat(s.lineHeight) / s.fontSize, label).toBeCloseTo(2.8, 2)
      expect(parseFloat(s.letterSpacing) / s.fontSize, label).toBeCloseTo(0.5, 2)
      expect(parseFloat(s.pt), label).toBeCloseTo(1.5 * info.rootPx, 1)
      expect(parseFloat(s.pb), label).toBeCloseTo(1.5 * info.rootPx, 1)
      expect(parseFloat(s.pl), label).toBeCloseTo(1 * info.rootPx, 1)
      expect(parseFloat(s.pr), label).toBeCloseTo(1 * info.rootPx, 1)
      expect(s.width, `${label} width at least one window width`).toBeGreaterThanOrEqual(info.winW - 1)
    }
  })

  for (const mode of ['zhuyin', 'none'] as const) {
    test(`[REQ-RDR-003] ${mode} mode: every character takes at least 1.5 x font size along its column (30px at 20px)`, async ({ page }) => {
      await gotoReader(page)
      await setMode(page, mode)
      const info = await page.evaluate(() => {
        const out: { seg: string | null; ch: string; fontSize: number; pitch: number }[] = []
        for (const pg of document.querySelectorAll('[data-testid="sutra-page"]')) {
          const chars: { ch: string; cx: number; top: number; fontSize: number }[] = []
          const walker = document.createTreeWalker(pg, NodeFilter.SHOW_TEXT)
          let n: Node | null
          while ((n = walker.nextNode())) {
            const parent = (n as Text).parentElement
            if (!parent || parent.closest('rt, rp, button[data-testid="vernacular-toggle"]')) continue
            const s = n.textContent ?? ''
            for (let i = 0; i < s.length; i++) {
              const r = document.createRange()
              r.setStart(n, i)
              r.setEnd(n, i + 1)
              const b = r.getBoundingClientRect()
              if (b.width === 0 && b.height === 0) continue
              chars.push({ ch: s[i], cx: (b.left + b.right) / 2, top: b.top, fontSize: parseFloat(getComputedStyle(parent).fontSize) })
            }
          }
          for (let i = 1; i < chars.length; i++) {
            const a = chars[i - 1]
            const b = chars[i]
            if (Math.abs(a.cx - b.cx) < a.fontSize / 2 && b.top > a.top) {
              out.push({ seg: (pg as HTMLElement).dataset.segment ?? null, ch: a.ch + b.ch, fontSize: a.fontSize, pitch: b.top - a.top })
            }
          }
        }
        return out
      })
      expect(info.length, 'consecutive character pairs measured').toBeGreaterThan(100)
      const tooTight = info.filter((p) => p.pitch < p.fontSize * 1.5 - 0.5)
      expect(tooTight.slice(0, 5)).toEqual([])
    })
  }

  test('[REQ-RDR-003] page n holds exactly the tokens of AST segment n, in order', async ({ page }) => {
    await gotoReader(page)
    const tokens = await tcall<TokenInfo[]>(page, 'tokens')
    for (const seg of AST.segments) {
      const actual = tokens.filter((t) => t.seg === seg.id).map((t) => t.text)
      expect(actual, `segment ${seg.id}`).toEqual(seg.tokens.map((t) => t.t))
    }
  })

  test('[REQ-RDR-004] all 9 segments render every token including punctuation, text equals the AST concatenation', async ({ page }) => {
    await gotoReader(page)
    const tokens = await tcall<TokenInfo[]>(page, 'tokens')
    const expectedKinds = ALL_TOKENS.map((t) => (t.punct ? 'punct' : t.lex ? 'lex-token' : 'token'))
    expect(tokens.map((t) => t.kind)).toEqual(expectedKinds)
    expect(tokens.map((t) => t.text)).toEqual(ALL_TOKENS.map((t) => t.t))
    expect(tokens.map((t) => t.text).join('')).toBe(ALL_TOKENS.map((t) => t.t).join(''))
    expect(tokens.filter((t) => t.kind === 'punct')).toHaveLength(ALL_TOKENS.filter((t) => t.punct).length)
  })

  test('[REQ-RDR-005] scripture font size is 18-22px; every lex token is an inline-block button of at least 44x44px', async ({ page }) => {
    await gotoReader(page)
    const info = await page.evaluate(() => {
      const t = (window as any).__t
      const sizes = [...document.querySelectorAll(t.TOKEN_SEL)].map((el) => parseFloat(getComputedStyle(el).fontSize))
      const lex = [...document.querySelectorAll('[data-testid="lex-token"]')].map((el) => {
        const r = el.getBoundingClientRect()
        return {
          lex: (el as HTMLElement).dataset.lex,
          tag: el.tagName,
          type: el.getAttribute('type'),
          display: getComputedStyle(el).display,
          w: r.width,
          h: r.height,
        }
      })
      return { sizes, lex }
    })
    expect(info.sizes.length).toBe(ALL_TOKENS.length)
    for (const s of info.sizes) {
      expect(s).toBeGreaterThanOrEqual(18)
      expect(s).toBeLessThanOrEqual(22)
    }
    expect(info.lex.map((l) => l.lex)).toEqual(LEX_TOKENS.map((t) => t.lex))
    for (const l of info.lex) {
      expect(l.tag, l.lex ?? '').toBe('BUTTON')
      expect(l.type, l.lex ?? '').toBe('button')
      expect(l.display, l.lex ?? '').toBe('inline-block')
      expect(l.w, `${l.lex} width`).toBeGreaterThanOrEqual(43.99)
      expect(l.h, `${l.lex} height`).toBeGreaterThanOrEqual(43.99)
    }
  })

  test('[REQ-RDR-006] tokens without lex and punctuation are inert: no vibrate, no highlight, no drawer, not focusable', async ({ page }) => {
    await installDeviceStubs(page, { vibrate: 'record' })
    await gotoReader(page)
    const plainIndex = ALL_TOKENS.filter((t) => !t.lex && !t.punct).findIndex((t) => t.t === '照見')
    expect(plainIndex).toBeGreaterThanOrEqual(0)
    const plain = page.locator('span[data-testid="token"]').nth(plainIndex)
    expect(await plain.evaluate((el) => (window as any).__t.baseText(el))).toBe('照見')
    const punct = page.locator('span[data-testid="punct"]').first()
    for (const loc of [plain, punct]) {
      const focusable = await loc.evaluate((el) => ({
        tabIndex: el.tabIndex,
        role: el.getAttribute('role'),
        interactiveAncestor: !!el.closest('button, a, [role="button"], [tabindex]:not([tabindex="-1"])'),
      }))
      expect(focusable.tabIndex).toBeLessThan(0)
      expect(focusable.role).toBeNull()
      expect(focusable.interactiveAncestor).toBe(false)
      await loc.click()
    }
    expect(await vibrateCalls(page)).toEqual([])
    await expect(page.locator('[data-active="true"]')).toHaveCount(0)
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0)
    await expect(page.getByTestId('vernacular-panel')).toHaveCount(0)
  })

  test('[REQ-RDR-007] punctuation uses the Simplified Chinese vertical glyphs (lang zh-Hans) while Han characters stay Traditional', async ({ page }) => {
    await gotoReader(page)
    const langs = await page.evaluate(() => {
      const lang = (el: Element) => (el.closest('[lang]') as HTMLElement | null)?.lang ?? ''
      return {
        punct: [...document.querySelectorAll('[data-testid="punct"]')].map(lang),
        han: [...document.querySelectorAll('[data-testid="lex-token"], [data-testid="token"]')].map(lang),
      }
    })
    expect(langs.punct).toHaveLength(ALL_TOKENS.filter((t) => t.punct).length)
    expect(langs.punct.filter((l) => l !== 'zh-Hans')).toEqual([])
    expect(langs.han).toHaveLength(ALL_TOKENS.filter((t) => !t.punct).length)
    expect(langs.han.filter((l) => !(l.startsWith('zh-Hant') || l === 'zh-TW'))).toEqual([])
  })

  test('[REQ-RDR-007] vertical punctuation: same column below the previous char, glyph in the upper-right of its cell, never at column head', async ({ page }) => {
    await gotoReader(page)
    const infos = await tcall<PunctInfo[]>(page, 'punctInfos')
    const expectedChars = ALL_TOKENS.filter((t) => t.punct).map((t) => t.t)
    expect(infos.map((i) => i.char)).toEqual(expectedChars)
    expect(new Set(expectedChars)).toEqual(new Set(['，', '。', '；', '！', '：']))

    // structural: every punctuation mark sits directly below a previous char in the same column
    for (const [i, p] of infos.entries()) {
      const label = `#${i} ${p.char} (${p.seg})`
      expect(p.prev, `${label} has a previous char on its page`).not.toBeNull()
      const prev = p.prev!
      const rect = p.rect!
      const cx = (rect.left + rect.right) / 2
      const px = (prev.rect.left + prev.rect.right) / 2
      expect(Math.abs(cx - px), `${label} same column (dx)`).toBeLessThanOrEqual(p.fontSize / 2)
      expect((rect.top + rect.bottom) / 2, `${label} below previous char`).toBeGreaterThan((prev.rect.top + prev.rect.bottom) / 2)
      expect(rect.top - prev.rect.bottom, `${label} directly below previous char`).toBeLessThanOrEqual(p.fontSize)
    }

    // glyph position: first occurrence of each of the 5 marks, measured on pixels inside the Range rect
    for (const ch of ['，', '。', '；', '！', '：']) {
      const idx = infos.findIndex((i) => i.char === ch)
      const seg = infos[idx].seg!
      await pageEl(page, seg).scrollIntoViewIfNeeded()
      const fresh = (await tcall<PunctInfo[]>(page, 'punctInfos'))[idx]
      const r = fresh.rect!
      const clip = { x: Math.floor(r.left), y: Math.floor(r.top), width: Math.ceil(r.right) - Math.floor(r.left), height: Math.ceil(r.bottom) - Math.floor(r.top) }
      const ink = await page.evaluate(async (b64) => (window as any).__t.ink(b64), await shotBase64(page, clip))
      expect(ink.maxX, `${ch}: glyph pixels found in the cell`).toBeGreaterThanOrEqual(0)
      const cx = clip.x + (ink.minX + ink.maxX + 1) / 2
      const cy = clip.y + (ink.minY + ink.maxY + 1) / 2
      const cellMidX = (r.left + r.right) / 2
      const cellMidY = (r.top + r.bottom) / 2
      expect(cx, `${ch}: glyph centre x ${cx} should be in the right half (cell mid ${cellMidX})`).toBeGreaterThanOrEqual(cellMidX)
      expect(cy, `${ch}: glyph centre y ${cy} should be in the upper half (cell mid ${cellMidY})`).toBeLessThanOrEqual(cellMidY)
    }
  })
})
