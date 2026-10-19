import {
  EASE_ZEN,
  expect,
  gotoReader,
  closeOverlay,
  inEachState,
  openLexicon,
  openVernacular,
  tcall,
  test,
} from './helpers'

interface Violation { el: string; [k: string]: unknown }

const squash = (s: string) => s.replace(/\s+/g, '')

test.describe('motion', () => {
  test('[REQ-RDR-026] --ease-zen is cubic-bezier(0.19, 1, 0.22, 1)', async ({ page }) => {
    await gotoReader(page)
    const v = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ease-zen'))
    expect(squash(v)).toBe(squash(EASE_ZEN))
  })

  test('[REQ-RDR-026] every running CSS transition/animation uses the zen curve: reading, drawer, panel states', async ({ page }) => {
    await gotoReader(page)
    const states = await inEachState(page, () => tcall<Violation[]>(page, 'scanEasing', EASE_ZEN))
    expect(states).toEqual({ reading: [], lexicon: [], vernacular: [] })
  })

  test('[REQ-RDR-026] the lexicon drawer and the vernacular panel slide with the zen curve (transition or animation)', async ({ page }) => {
    await gotoReader(page)
    const read = (sel: string) =>
      page.locator(sel).first().evaluate((el) => {
        const s = getComputedStyle(el)
        const seconds = (v: string) => v.split(',').map((x) => (x.trim().endsWith('ms') ? parseFloat(x) / 1000 : parseFloat(x)))
        return {
          transition: { durations: seconds(s.transitionDuration), fn: s.transitionTimingFunction },
          animation: { names: s.animationName.split(',').map((x) => x.trim()), durations: seconds(s.animationDuration), fn: s.animationTimingFunction },
        }
      })
    const curves = (v: string) => v.match(/cubic-bezier\([^)]*\)/g) ?? []
    const isZen = (v: string) => curves(v).length > 0 && curves(v).every((x) => squash(x) === squash(EASE_ZEN))
    for (const [label, open, sel] of [
      ['lexicon drawer', () => openLexicon(page, '觀自在'), '[data-testid="lexicon-drawer"]'],
      ['vernacular panel', () => openVernacular(page, 's1'), '[data-testid="vernacular-panel"]'],
    ] as const) {
      await open()
      const r = await read(sel)
      const moves = r.transition.durations.some((d) => d > 0) || r.animation.names.some((n, i) => n !== 'none' && r.animation.durations[i % r.animation.durations.length] > 0)
      expect(moves, `${label} slides with a transition or an animation: ${JSON.stringify(r)}`).toBe(true)
      if (r.transition.durations.some((d) => d > 0)) expect(isZen(r.transition.fn), `${label} transition ${r.transition.fn}`).toBe(true)
      if (r.animation.names.some((n) => n !== 'none')) expect(isZen(r.animation.fn), `${label} animation ${r.animation.fn}`).toBe(true)
      await closeOverlay(page)
    }
  })

  test('[REQ-RDR-026] while closing (Escape) and after a swipe-down release the transitions still use the zen curve', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '觀自在')
    await page.keyboard.press('Escape')
    const afterEscape = await tcall<Violation[]>(page, 'scanEasing', EASE_ZEN)
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0)
    expect(afterEscape).toEqual([])

    const drawer = await openLexicon(page, '空')
    // release the drag and inspect immediately, before the exit transition ends
    const box = (await drawer.boundingBox())!
    const x = box.x + box.width / 2
    const y = box.y + 24
    await page.mouse.move(x, y)
    await page.mouse.down()
    for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + i * 50)
    await page.mouse.up()
    const afterRelease = await tcall<Violation[]>(page, 'scanEasing', EASE_ZEN)
    expect(afterRelease).toEqual([])
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0, { timeout: 5000 })
  })

  test('[REQ-RDR-026] page turning stays native scroll snap: no custom transition or animation on the viewport or pages', async ({ page }) => {
    await gotoReader(page)
    const info = await page.evaluate(() => {
      const els = [document.querySelector('[data-testid="sutra-viewport"]')!, ...document.querySelectorAll('[data-testid="sutra-page"]')]
      return els.map((el) => {
        const s = getComputedStyle(el)
        return { td: s.transitionDuration, an: s.animationName, snap: s.scrollSnapType, snapAlign: s.scrollSnapAlign, tf: s.transform }
      })
    })
    expect(info[0].snap).toBe('x mandatory')
    for (const i of info) {
      expect(i.td.split(',').every((d) => d.trim() === '0s')).toBe(true)
      expect(i.an).toBe('none')
      expect(i.tf).toBe('none')
    }
  })

  test.describe('prefers-reduced-motion: reduce', () => {
    test.use({ reducedMotion: 'reduce' })

    test('[REQ-RDR-026] transitions and animations are (almost) instant everywhere and scrolling is not smooth', async ({ page }) => {
      await gotoReader(page)
      expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
      const states = await inEachState(page, () => tcall<Violation[]>(page, 'scanDurations', 0.01))
      expect(states).toEqual({ reading: [], lexicon: [], vernacular: [] })
      const behaviors = await page.evaluate(() => ({
        html: getComputedStyle(document.documentElement).scrollBehavior,
        viewport: getComputedStyle(document.querySelector('[data-testid="sutra-viewport"]')!).scrollBehavior,
        body: getComputedStyle(document.body).scrollBehavior,
      }))
      expect(behaviors).toEqual({ html: 'auto', viewport: 'auto', body: 'auto' })
    })

    test('[REQ-RDR-026] closing a sheet while reduced motion is on has no long transition either', async ({ page }) => {
      await gotoReader(page)
      await openLexicon(page, '觀自在')
      await page.keyboard.press('Escape')
      expect(await tcall<Violation[]>(page, 'scanDurations', 0.01)).toEqual([])
      await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0, { timeout: 2000 })
    })
  })
})
