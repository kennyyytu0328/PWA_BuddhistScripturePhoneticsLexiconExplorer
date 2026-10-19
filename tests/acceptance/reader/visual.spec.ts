import {
  closeOverlay,
  expect,
  gotoReader,
  inEachState,
  openLexicon,
  pageEl,
  setMode,
  shotBase64,
  tcall,
  test,
} from './helpers'

interface Violation { el: string; [k: string]: unknown }
interface Stop { css: string; rgba: number[]; hue: number; sat: number }
interface Glow {
  backgroundImage: string
  stops: Stop[]
  animations: number
  animationNames: string[]
  transitionDurations: string[]
  insideButton: boolean
  containsButton: boolean
}
interface Rect { left: number; top: number; right: number; bottom: number }

const EMPTY_STATES = { reading: [], lexicon: [], vernacular: [] }

test.describe('visual principles', () => {
  test('[REQ-RDR-021] reading, lexicon drawer and vernacular panel use only grey or amber (amber only on <rt> and the active token)', async ({ page }) => {
    await gotoReader(page)
    const result = await inEachState(page, () => tcall<Violation[]>(page, 'scanColors'))
    expect(result).toEqual(EMPTY_STATES)
  })

  test('[REQ-RDR-021] the active token and <rt> are the amber elements (amber exists there)', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '觀自在')
    const amber = await page.evaluate(() => {
      const t = (window as any).__t
      const hit = (el: Element, prop: string) => {
        const c = t.rgba(getComputedStyle(el).getPropertyValue(prop))
        const h = t.hsl(c)
        return c[3] > 0 && h.s >= 0.1 && h.h >= 15 && h.h <= 50
      }
      return {
        rt: [...document.querySelectorAll('rt')].every((el) => hit(el, 'color')),
        active: document.querySelectorAll('[data-active="true"]').length,
        activeBg: hit(document.querySelector('[data-active="true"]')!, 'background-color'),
        activeBorder: hit(document.querySelector('[data-active="true"]')!, 'border-bottom-color'),
      }
    })
    expect(amber).toEqual({ rt: true, active: 1, activeBg: true, activeBorder: true })
  })

  test('[REQ-RDR-023] capsule and buttons are full pills; drawer, panel and images have radius 0; no box-shadow anywhere', async ({ page }) => {
    await gotoReader(page)
    const pillViolations = async () =>
      page.evaluate(() => {
        const sel = 'button[data-testid="phonetic-toggle"], button[data-testid="vernacular-toggle"], button[data-testid="lexicon-back"], button[data-testid="reload-button"]'
        return [...document.querySelectorAll(sel)]
          .map((el) => {
            const r = el.getBoundingClientRect()
            const s = getComputedStyle(el)
            const radii = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => parseFloat(s.getPropertyValue(`border-${c}-radius`)))
            return { el: (el as HTMLElement).dataset.testid, height: r.height, radii }
          })
          .filter((b) => b.radii.some((x) => !(x >= b.height / 2)))
      })
    const squareViolations = async () =>
      page.evaluate(() => {
        const sel = '[data-testid="lexicon-drawer"], [data-testid="vernacular-panel"], img'
        return [...document.querySelectorAll(sel)]
          .map((el) => {
            const s = getComputedStyle(el)
            const radii = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => s.getPropertyValue(`border-${c}-radius`))
            return { el: (el as HTMLElement).dataset.testid ?? el.tagName.toLowerCase(), radii }
          })
          .filter((b) => b.radii.some((x) => parseFloat(x) !== 0))
      })

    const collect = async () => ({
      pills: await pillViolations(),
      squares: await squareViolations(),
      shadows: await tcall<Violation[]>(page, 'scanShadows'),
    })
    const states = await inEachState(page, collect)
    expect(states).toEqual({
      reading: { pills: [], squares: [], shadows: [] },
      lexicon: { pills: [], squares: [], shadows: [] },
      vernacular: { pills: [], squares: [], shadows: [] },
    })
    expect(await page.locator('button[data-testid="vernacular-toggle"]').count()).toBe(9)

    // images (gaiji) and the back button
    await openLexicon(page, '心經真言')
    expect(await page.locator('img[data-gaiji]').count()).toBeGreaterThan(0)
    expect(await collect()).toEqual({ pills: [], squares: [], shadows: [] })
    await closeOverlay(page)
    await openLexicon(page, '觀自在')
    await page.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
    await expect(page.locator('button[data-testid="lexicon-back"]')).toHaveText('返回')
    expect(await collect()).toEqual({ pills: [], squares: [], shadows: [] })
  })

  test('[REQ-RDR-024] headings weigh 300-400 and nothing on screen weighs 600 or more', async ({ page }) => {
    await gotoReader(page)
    const weight = (sel: string) =>
      page.locator(sel).first().evaluate((el) => parseInt(getComputedStyle(el).fontWeight, 10))
    const states = await inEachState(page, async () => ({
      heavy: await tcall<Violation[]>(page, 'scanWeights'),
      headword: (await page.getByTestId('lexicon-headword').count()) ? await weight('[data-testid="lexicon-headword"]') : null,
      title: (await page.getByTestId('vernacular-title').count()) ? await weight('[data-testid="vernacular-title"]') : null,
    }))
    expect(states.reading.heavy).toEqual([])
    expect(states.lexicon.heavy).toEqual([])
    expect(states.vernacular.heavy).toEqual([])
    expect(states.lexicon.headword).toBeGreaterThanOrEqual(300)
    expect(states.lexicon.headword).toBeLessThanOrEqual(400)
    expect(states.vernacular.title).toBeGreaterThanOrEqual(300)
    expect(states.vernacular.title).toBeLessThanOrEqual(400)
  })

  test('[REQ-RDR-025] glow: static green -> amber -> ochre-red gradient behind the scripture, never on buttons or controls', async ({ page }) => {
    await gotoReader(page)
    const g = await tcall<Glow | null>(page, 'glow')
    expect(g, 'element [data-testid="sutra-glow"] exists').not.toBeNull()
    expect(g!.backgroundImage).toMatch(/gradient\(/)

    const visible = g!.stops.filter((s) => s.rgba[3] > 0)
    const classify = (s: Stop) =>
      s.hue >= 75 && s.hue <= 170 ? 'green' : s.hue >= 32 && s.hue <= 55 ? 'amber' : s.hue < 32 || s.hue >= 345 ? 'red' : 'other'
    const classes = visible.map(classify)
    const order = ['green', 'amber', 'red'] as const
    let from = 0
    const positions = order.map((c) => {
      const idx = classes.indexOf(c, from)
      if (idx >= 0) from = idx + 1
      return idx
    })
    expect(positions.every((p) => p >= 0), `gradient hues ${JSON.stringify(visible.map((s) => [Math.round(s.hue), s.css]))} should run green -> amber -> red`).toBe(true)
    expect(classes[0]).toBe('green')
    expect(classes[classes.length - 1]).toBe('red')

    expect(g!.animations).toBe(0)
    expect(g!.animationNames.every((n) => n === 'none')).toBe(true)
    expect(g!.transitionDurations.flatMap((d) => d.split(',').map((x) => x.trim())).every((d) => d === '0s')).toBe(true)
    expect(g!.insideButton).toBe(false)
    expect(g!.containsButton).toBe(false)

    const buttonImages = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map((b) => getComputedStyle(b).backgroundImage).filter((v) => v !== 'none'),
    )
    expect(buttonImages).toEqual([])

    // the gradient really paints behind the text: with the text hidden, the background is not flat stone-950
    const hide = await page.addStyleTag({ content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' })
    const stats = await page.evaluate(async (b64) => (window as any).__t.deviants(b64, [12, 10, 9], 0), await shotBase64(page))
    await hide.evaluate((el) => (el as Element).remove())
    expect(stats.deviants).toBeGreaterThan(0)
  })

  test('[REQ-RDR-025] scripture and <rt> text keep contrast >= 4.5:1 on the glow (pages 1, 5, 9)', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'zhuyin')
    const colors = await page.evaluate(() => {
      const t = (window as any).__t
      const uniq = (els: Element[]) => [...new Set(els.map((e) => JSON.stringify(t.rgba(getComputedStyle(e).color))))].map((s) => JSON.parse(s) as number[])
      return {
        text: uniq([...document.querySelectorAll(t.TOKEN_SEL)]),
        rt: uniq([...document.querySelectorAll('rt')]),
      }
    })
    expect(colors.text.length).toBeGreaterThan(0)
    expect(colors.rt.length).toBeGreaterThan(0)
    const hide = await page.addStyleTag({ content: '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}' })
    const failures: string[] = []
    for (const seg of ['s1', 's5', 's9']) {
      await pageEl(page, seg).evaluate((el) => el.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' }))
      await page.waitForTimeout(300)
      const rects = await page.evaluate(() => {
        const t = (window as any).__t
        const r = (els: Element[]) => els.map((e) => t.rect(e)) as Rect[]
        return { text: r([...document.querySelectorAll(t.TOKEN_SEL)]), rt: r([...document.querySelectorAll('rt')]) }
      })
      const b64 = await shotBase64(page)
      for (const [kind, list] of [['text', colors.text], ['rt', colors.rt]] as const) {
        for (const c of list) {
          const res = await page.evaluate(([img, rs, col]) => (window as any).__t.minContrast(img, rs, col), [b64, rects[kind], c] as const)
          if (res.samples === 0 || res.min < 4.5) failures.push(`${seg} ${kind} ${JSON.stringify(c)} -> min contrast ${res.min} (${res.samples} samples)`)
        }
      }
    }
    await hide.evaluate((el) => (el as Element).remove())
    expect(failures).toEqual([])
  })
})
