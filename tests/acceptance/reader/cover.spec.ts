import type { Page } from '@playwright/test'
import { expect, firstFamily, gotoCover, pageEl, setMode, shotBase64, styleOf, test, toggle, viewportSize } from './helpers'
import type { Mode } from './helpers'

interface R { left: number; top: number; right: number; bottom: number; width: number; height: number }

const cover = (page: Page) => page.getByTestId('sutra-cover')
const title = (page: Page) => page.getByTestId('cover-title')
const translator = (page: Page) => page.getByTestId('cover-translator')

/** Load the reader and require the cover to exist (so assertions about its contents cannot pass vacuously). */
const openCover = async (page: Page): Promise<void> => {
  await gotoCover(page)
  await expect(cover(page)).toHaveCount(1)
}

const weightOf = (raw: string): number => (raw === 'bold' ? 700 : raw === 'normal' ? 400 : parseInt(raw, 10))

test.describe('cover (REQ-RDR-030)', () => {
  test('[REQ-RDR-030] the rightmost page is data-testid="sutra-cover", it is not a sutra-page, and there are still 9 sutra pages', async ({ page }) => {
    await openCover(page)
    await expect(cover(page)).toHaveCount(1)
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    const info = await page.evaluate(() => {
      const c = document.querySelector('[data-testid="sutra-cover"]') as HTMLElement
      const w = window.innerWidth
      const cr = c.getBoundingClientRect()
      const s1 = (document.querySelector('[data-testid="sutra-page"][data-segment="s1"]') as HTMLElement).getBoundingClientRect()
      return {
        isPage: c.matches('[data-testid="sutra-page"]'),
        insidePage: !!c.closest('[data-testid="sutra-page"]'),
        coverRight: cr.right,
        windowW: w,
        s1Right: s1.right,
        coverLeft: cr.left,
      }
    })
    expect(info.isPage).toBe(false)
    expect(info.insidePage).toBe(false)
    expect(Math.abs(info.coverRight - info.windowW), 'cover is aligned at the right edge').toBeLessThanOrEqual(1)
    expect(Math.abs(info.s1Right - info.coverLeft), 'page 1 comes directly after the cover (to its left)').toBeLessThanOrEqual(1)
  })

  test('[REQ-RDR-030] the cover has writing-mode vertical-rl, scroll-snap-align start and a width of one window', async ({ page }) => {
    await openCover(page)
    const { w } = await viewportSize(page)
    const cs = await cover(page).evaluate((el) => {
      const s = getComputedStyle(el)
      return { writingMode: s.writingMode, snapAlign: s.scrollSnapAlign, width: el.getBoundingClientRect().width }
    })
    expect(cs.writingMode).toBe('vertical-rl')
    expect(cs.snapAlign).toMatch(/^start( start)?$/)
    expect(Math.abs(cs.width - w)).toBeLessThanOrEqual(1)
  })

  test('[REQ-RDR-030] the title reads 般若波羅蜜多心經', async ({ page }) => {
    await openCover(page)
    await expect(title(page)).toHaveCount(1)
    expect(((await title(page).textContent()) ?? '').replace(/\s/g, '')).toBe('般若波羅蜜多心經')
  })

  test('[REQ-RDR-030] the translator reads 唐三藏法師玄奘譯 once whitespace is removed', async ({ page }) => {
    await openCover(page)
    await expect(translator(page)).toHaveCount(1)
    expect(((await translator(page).textContent()) ?? '').replace(/\s/g, '')).toBe('唐三藏法師玄奘譯')
  })

  test('[REQ-RDR-030] the translator textContent is exactly 唐　三藏法師玄奘　譯 (two U+3000 ideographic spaces)', async ({ page }) => {
    await openCover(page)
    expect(await translator(page).textContent()).toBe('唐　三藏法師玄奘　譯')
  })

  test('[REQ-RDR-030] title and translator are each one vertical line, title on the right and translator on the left', async ({ page }) => {
    await openCover(page)
    const info = await page.evaluate(() => {
      const f = (window as any).__t.textExtent as (el: Element) => R
      const t = document.querySelector('[data-testid="cover-title"]') as HTMLElement
      const tr = document.querySelector('[data-testid="cover-translator"]') as HTMLElement
      return {
        title: { rect: f(t), fontSize: parseFloat(getComputedStyle(t).fontSize), mode: getComputedStyle(t).writingMode },
        translator: { rect: f(tr), fontSize: parseFloat(getComputedStyle(tr).fontSize), mode: getComputedStyle(tr).writingMode },
      }
    })
    expect(info.title.mode).toBe('vertical-rl')
    expect(info.translator.mode).toBe('vertical-rl')
    // one line each: the line is no wider than about two font sizes
    expect(info.title.rect.width).toBeLessThanOrEqual(info.title.fontSize * 2)
    expect(info.translator.rect.width).toBeLessThanOrEqual(info.translator.fontSize * 2)
    // title on the right, translator on the left, not overlapping
    expect(info.title.rect.left).toBeGreaterThanOrEqual(info.translator.rect.right - 0.5)
  })

  test('[REQ-RDR-030] both lines together are centred on the cover, horizontally and vertically (within 8px)', async ({ page }) => {
    await openCover(page)
    const m = await page.evaluate(() => {
      const f = (window as any).__t.textExtent as (el: Element) => R
      const c = document.querySelector('[data-testid="sutra-cover"]')!.getBoundingClientRect()
      const a = f(document.querySelector('[data-testid="cover-title"]')!)
      const b = f(document.querySelector('[data-testid="cover-translator"]')!)
      return {
        coverCx: (c.left + c.right) / 2,
        coverCy: (c.top + c.bottom) / 2,
        cx: (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2,
        cy: (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2,
      }
    })
    expect(Math.abs(m.cx - m.coverCx), `horizontal offset (cx ${m.cx}, cover ${m.coverCx})`).toBeLessThanOrEqual(8)
    expect(Math.abs(m.cy - m.coverCy), `vertical offset (cy ${m.cy}, cover ${m.coverCy})`).toBeLessThanOrEqual(8)
  })

  test('[REQ-RDR-030] title and translator are Noto Serif TC with font-weight 300-400', async ({ page }) => {
    await openCover(page)
    for (const loc of [title(page), translator(page)]) {
      expect(firstFamily(await styleOf(loc, 'font-family'))).toBe('Noto Serif TC')
      const w = weightOf(await styleOf(loc, 'font-weight'))
      expect(w).toBeGreaterThanOrEqual(300)
      expect(w).toBeLessThanOrEqual(400)
    }
  })

  test('[REQ-RDR-030] the title font size is at least 1.5 x the scripture font size; the translator is smaller than the title', async ({ page }) => {
    await openCover(page)
    const scripture = parseFloat(await styleOf(pageEl(page, 's1'), 'font-size'))
    const t = parseFloat(await styleOf(title(page), 'font-size'))
    const tr = parseFloat(await styleOf(translator(page), 'font-size'))
    expect(scripture).toBeGreaterThanOrEqual(18)
    expect(t).toBeGreaterThanOrEqual(scripture * 1.5)
    expect(tr).toBeLessThan(t)
  })

  for (const mode of ['zhuyin', 'pinyin', 'iast', 'none'] as Mode[]) {
    test(`[REQ-RDR-030] ${mode} mode: the cover contains no <ruby> or <rt>`, async ({ page }) => {
      await openCover(page)
      await setMode(page, mode)
      expect(await cover(page).locator('ruby, rt').count()).toBe(0)
    })
  }

  test('[REQ-RDR-030] the cover has no clickable lexicon tokens, no buttons and no 白話參考 button', async ({ page }) => {
    await openCover(page)
    const c = cover(page)
    expect(await c.locator('[data-testid="lex-token"], [data-lex]').count()).toBe(0)
    expect(await c.locator('button, a, [role="button"], [tabindex]:not([tabindex="-1"])').count()).toBe(0)
    expect(await c.locator('[data-testid="vernacular-toggle"]').count()).toBe(0)
    expect(await c.getByText('白話參考').count()).toBe(0)
    // the 9 sutra pages still carry one 白話參考 button each
    await expect(page.locator('button[data-testid="vernacular-toggle"]')).toHaveCount(9)
  })

  test('[REQ-RDR-030] the phonetic capsule is visible on the cover, bottom centre', async ({ page }) => {
    await openCover(page)
    await expect(toggle(page)).toBeVisible()
    const { w, h } = await viewportSize(page)
    const rect = await toggle(page).evaluate((el) => el.getBoundingClientRect().toJSON())
    expect(Math.abs(rect.left + rect.width / 2 - w / 2)).toBeLessThanOrEqual(1)
    expect(rect.left).toBeGreaterThanOrEqual(0)
    expect(rect.right).toBeLessThanOrEqual(w)
    expect(rect.bottom).toBeLessThanOrEqual(h)
    expect(rect.bottom).toBeGreaterThanOrEqual(h * 0.85)
    await expect(toggle(page)).toHaveText('注音')
  })

  test('[REQ-RDR-030] cover text has the same colour as the scripture text', async ({ page }) => {
    await openCover(page)
    const scripture = await styleOf(page.locator('[data-testid="token"]').first(), 'color')
    expect(await styleOf(title(page), 'color')).toBe(scripture)
    expect(await styleOf(translator(page), 'color')).toBe(scripture)
  })

  test('[REQ-RDR-030] the glow continues onto the cover: with the text and buttons hidden the cover is not flat #0c0a09', async ({ page }) => {
    await openCover(page)
    const hide = await page.addStyleTag({
      content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}button{visibility:hidden!important}',
    })
    const stats = await page.evaluate(async (b64) => (window as any).__t.deviants(b64, [12, 10, 9], 0), await shotBase64(page))
    await hide.evaluate((el) => (el as Element).remove())
    expect(stats.deviants, 'pixels on the cover that are not #0c0a09').toBeGreaterThan(0)
    await expect(page.getByTestId('sutra-glow')).toHaveCount(1)
  })
})
