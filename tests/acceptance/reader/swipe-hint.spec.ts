import type { Page } from '@playwright/test'
import {
  EASE_ZEN,
  expect,
  expectCoverAligned,
  firstFamily,
  gotoCover,
  gotoCoverWithPeek,
  readPref,
  styleOf,
  test,
  toggle,
  viewportSize,
} from './helpers'

const HINT_TEXT = '‹ 向右滑動翻頁'
const BG: [number, number, number] = [12, 10, 9] // #0c0a09

const hint = (page: Page) => page.getByTestId('swipe-hint')
const weightOf = (raw: string): number => (raw === 'bold' ? 700 : raw === 'normal' ? 400 : parseInt(raw, 10))

// ---------------------------------------------------------------------------
// Frame sampler: installed before the app runs, records page 1's right edge every animation frame.
// ---------------------------------------------------------------------------
interface Sample { t: number; right: number; coverRight: number; scrollLeft: number; anims: string[] }

async function installSampler(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const store: { samples: Sample[] } = { samples: [] }
    ;(window as any).__peekLog = store
    interface Sample { t: number; right: number; coverRight: number; scrollLeft: number; anims: string[] }
    const easings = (a: Animation): string[] => {
      const out: string[] = []
      const eff = a.effect as KeyframeEffect | null
      if (!eff) return out
      try { out.push(eff.getTiming().easing as string) } catch { /* ignore */ }
      try { for (const k of eff.getKeyframes()) out.push(String(k.easing)) } catch { /* ignore */ }
      return out
    }
    const tick = () => {
      const s1 = document.querySelector('[data-testid="sutra-page"][data-segment="s1"]')
      const vp = document.querySelector('[data-testid="sutra-viewport"]') as HTMLElement | null
      const cover = document.querySelector('[data-testid="sutra-cover"]')
      if (s1 && vp && cover && store.samples.length < 3000) {
        const right = s1.getBoundingClientRect().right
        const anims = document
          .getAnimations()
          .filter((a) => a.effect && (a.effect as KeyframeEffect).target && (a.effect as KeyframeEffect).target!.closest?.('[data-testid="sutra-viewport"]'))
          .map((a) => easings(a).join('|'))
        store.samples.push({
          t: performance.now(),
          right,
          coverRight: cover.getBoundingClientRect().right,
          scrollLeft: vp.scrollLeft,
          anims,
        } as Sample)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
}

const samplesOf = (page: Page): Promise<Sample[]> => page.evaluate(() => (window as any).__peekLog.samples as Sample[])
const nowOf = (page: Page): Promise<number> => page.evaluate(() => performance.now())

/** Samples taken during the first 3 s after page 1 first appeared (waits until that window is complete). */
async function firstThreeSeconds(page: Page): Promise<Sample[]> {
  await expect
    .poll(
      async () => {
        const s = await samplesOf(page)
        return s.length > 0 && s[s.length - 1].t - s[0].t >= 3000
      },
      { timeout: 10_000, intervals: [100] },
    )
    .toBe(true)
  const s = await samplesOf(page)
  return s.filter((x) => x.t - s[0].t <= 3000)
}

const maxRight = (s: Sample[]): number => Math.max(...s.map((x) => x.right))

// ---------------------------------------------------------------------------
// Static hint: content, typography, position (both viewports)
// ---------------------------------------------------------------------------
function staticHintTests(label: string): void {
  test(`[REQ-RDR-031] (${label}) exactly one swipe-hint exists, inside the cover, not in any sutra page, text is "${HINT_TEXT}"`, async ({ page }) => {
    await gotoCover(page)
    await expect(page.getByTestId('swipe-hint')).toHaveCount(1)
    const info = await page.evaluate(() => {
      const h = document.querySelector('[data-testid="swipe-hint"]')!
      return {
        inCover: !!h.closest('[data-testid="sutra-cover"]'),
        inPage: !!h.closest('[data-testid="sutra-page"]'),
        pagesWithHint: document.querySelectorAll('[data-testid="sutra-page"] [data-testid="swipe-hint"]').length,
        text: h.textContent,
      }
    })
    expect(info.inCover).toBe(true)
    expect(info.inPage).toBe(false)
    expect(info.pagesWithHint).toBe(0)
    expect(info.text).toBe(HINT_TEXT)
    await expect(hint(page)).toBeVisible()
  })

  test(`[REQ-RDR-031] (${label}) the hint is horizontal, Noto Sans TC, weight 300-400, 12-14px`, async ({ page }) => {
    await gotoCover(page)
    await expect(hint(page)).toHaveCount(1)
    expect(await styleOf(hint(page), 'writing-mode')).toBe('horizontal-tb')
    expect(firstFamily(await styleOf(hint(page), 'font-family'))).toBe('Noto Sans TC')
    const w = weightOf(await styleOf(hint(page), 'font-weight'))
    expect(w).toBeGreaterThanOrEqual(300)
    expect(w).toBeLessThanOrEqual(400)
    const size = parseFloat(await styleOf(hint(page), 'font-size'))
    expect(size).toBeGreaterThanOrEqual(12)
    expect(size).toBeLessThanOrEqual(14)
  })

  test(`[REQ-RDR-031] (${label}) the hint colour is greyscale (channels within 16) with contrast >= 4.5:1 against #0c0a09`, async ({ page }) => {
    await gotoCover(page)
    await expect(hint(page)).toHaveCount(1)
    const m = await hint(page).evaluate((el, bg) => {
      const T = (window as any).__t
      const c = T.exact(getComputedStyle(el).color) as number[]
      const a = c[3]
      const fg = [0, 1, 2].map((i) => a * c[i] + (1 - a) * bg[i])
      return { rgb: c, spread: Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]), contrast: T.contrast(fg, bg) as number }
    }, BG)
    expect(m.spread, `colour ${JSON.stringify(m.rgb)}`).toBeLessThanOrEqual(16)
    expect(m.contrast, `colour ${JSON.stringify(m.rgb)}`).toBeGreaterThanOrEqual(4.5)
  })

  test(`[REQ-RDR-031] (${label}) the hint sits at the cover's bottom left: left >= 16px from the cover edge, bottom in 85%-100% of the window`, async ({ page }) => {
    await gotoCover(page)
    await expect(hint(page)).toHaveCount(1)
    const { h } = await viewportSize(page)
    const m = await page.evaluate(() => {
      const r = document.querySelector('[data-testid="swipe-hint"]')!.getBoundingClientRect()
      const c = document.querySelector('[data-testid="sutra-cover"]')!.getBoundingClientRect()
      return { hintLeft: r.left, hintRight: r.right, hintBottom: r.bottom, coverLeft: c.left, coverCx: (c.left + c.right) / 2 }
    })
    expect(m.hintLeft - m.coverLeft).toBeGreaterThanOrEqual(16)
    expect(m.hintBottom).toBeGreaterThanOrEqual(h * 0.85)
    expect(m.hintBottom).toBeLessThanOrEqual(h)
    expect(m.hintRight, 'hint is on the left half of the cover').toBeLessThanOrEqual(m.coverCx)
  })

  test(`[REQ-RDR-031] (${label}) the hint does not overlap the phonetic capsule, the title or the translator`, async ({ page }) => {
    await gotoCover(page)
    await expect(hint(page)).toHaveCount(1)
    await expect(toggle(page)).toBeVisible()
    const m = await page.evaluate(() => {
      const ext = (window as any).__t.textExtent as (el: Element) => { left: number; top: number; right: number; bottom: number }
      const rect = (el: Element) => el.getBoundingClientRect()
      return {
        hint: rect(document.querySelector('[data-testid="swipe-hint"]')!).toJSON(),
        toggle: rect(document.querySelector('[data-testid="phonetic-toggle"]')!).toJSON(),
        title: ext(document.querySelector('[data-testid="cover-title"]')!),
        translator: ext(document.querySelector('[data-testid="cover-translator"]')!),
      }
    })
    type B = { left: number; top: number; right: number; bottom: number }
    const overlap = (a: B, b: B) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
    expect(overlap(m.hint, m.toggle), 'hint vs capsule').toBe(false)
    expect(overlap(m.hint, m.title), 'hint vs title').toBe(false)
    expect(overlap(m.hint, m.translator), 'hint vs translator').toBe(false)
  })

  test(`[REQ-RDR-031] (${label}) the hint is not clickable or focusable and title and translator stay centred (within 8px)`, async ({ page }) => {
    await gotoCover(page)
    await expect(hint(page)).toHaveCount(1)
    const info = await hint(page).evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      tabindex: el.getAttribute('tabindex'),
      role: el.getAttribute('role'),
      insideInteractive: !!el.closest('button, a, [tabindex]'),
    }))
    expect(['button', 'a']).not.toContain(info.tag)
    expect(info.tabindex).toBeNull()
    expect(info.role).not.toBe('button')
    expect(info.insideInteractive).toBe(false)
    await hint(page).click({ force: true })
    await expect(page.locator('[data-testid="lexicon-drawer"], [data-testid="vernacular-panel"]')).toHaveCount(0)
    await expectCoverAligned(page)

    const m = await page.evaluate(() => {
      const f = (window as any).__t.textExtent as (el: Element) => { left: number; top: number; right: number; bottom: number }
      const c = document.querySelector('[data-testid="sutra-cover"]')!.getBoundingClientRect()
      const a = f(document.querySelector('[data-testid="cover-title"]')!)
      const b = f(document.querySelector('[data-testid="cover-translator"]')!)
      return {
        dx: (Math.min(a.left, b.left) + Math.max(a.right, b.right)) / 2 - (c.left + c.right) / 2,
        dy: (Math.min(a.top, b.top) + Math.max(a.bottom, b.bottom)) / 2 - (c.top + c.bottom) / 2,
      }
    })
    expect(Math.abs(m.dx)).toBeLessThanOrEqual(8)
    expect(Math.abs(m.dy)).toBeLessThanOrEqual(8)
  })
}

test.describe('swipe hint, Pixel 7 viewport (REQ-RDR-031)', () => {
  staticHintTests('Pixel 7')
})

test.describe('swipe hint, 360x640 viewport (REQ-RDR-031)', () => {
  test.use({ viewport: { width: 360, height: 640 } })
  staticHintTests('360x640')
})

// ---------------------------------------------------------------------------
// First-use nudge
// ---------------------------------------------------------------------------
test.describe('first-use nudge (REQ-RDR-031)', () => {
  test('[REQ-RDR-031] first open on the cover: within 3 s page 1 peeks in 32-48px from the right window edge, then the cover is aligned again', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    const { w } = await viewportSize(page)
    const win = await firstThreeSeconds(page)
    const peak = maxRight(win)
    // page 1 sits left of the cover: right edge = window width when the cover is not shifted; the nudge moves it into the window
    expect(peak, `max right edge of page 1 (window ${w}); samples ${win.length}`).toBeGreaterThanOrEqual(32)
    expect(peak).toBeLessThanOrEqual(48)
    await expectCoverAligned(page)
  })

  test('[REQ-RDR-031] the whole nudge finishes within 2.5 s', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    const win = await firstThreeSeconds(page)
    const moving = win.filter((x) => x.right > 1)
    expect(moving.length, 'the nudge must be visible in at least one frame').toBeGreaterThan(0)
    const span = moving[moving.length - 1].t - moving[0].t
    expect(span, `nudge lasted ${Math.round(span)} ms`).toBeLessThanOrEqual(2500)
    // and it really did return
    expect(win[win.length - 1].right).toBeLessThanOrEqual(1)
  })

  test('[REQ-RDR-031] the nudge easing is cubic-bezier(0.19, 1, 0.22, 1)', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    const win = await firstThreeSeconds(page)
    const during = win.filter((x) => x.right > 1)
    expect(during.length, 'the nudge must be visible in at least one frame').toBeGreaterThan(0)
    // every animation running over the reader while the nudge is visible must use the zen easing
    const seen = [...new Set(during.flatMap((x) => x.anims))]
    expect(seen.length, 'no Web Animation / CSS transition observed during the nudge; easing cannot be measured').toBeGreaterThan(0)
    const norm = (s: string) => s.replace(/\s+/g, '')
    for (const a of seen) {
      expect(a.split('|').map(norm), `animation easings ${a}`).toContain(norm(EASE_ZEN))
    }
  })

  test('[REQ-RDR-031] the nudge does not change the scroll position and does not write reading progress; afterwards a peek record exists', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    const win = await firstThreeSeconds(page)
    const moved = win.some((x) => x.right > 1)
    expect(moved, 'nudge must have happened for this check to mean anything').toBe(true)
    expect(new Set(win.map((x) => x.scrollLeft)).size, 'viewport scrollLeft is constant during the nudge').toBe(1)
    await expectCoverAligned(page)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 5000 }).not.toBeNull()
    expect(await readPref(page, 'progress')).toBeNull()
  })

  test('[REQ-RDR-031] after the nudge, reloading does not nudge again', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    const first = await firstThreeSeconds(page)
    expect(maxRight(first), 'first load nudged').toBeGreaterThanOrEqual(32)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 5000 }).not.toBeNull()
    await page.reload()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 10_000 })
    const win = await firstThreeSeconds(page)
    expect(maxRight(win)).toBeLessThanOrEqual(1)
    await expectCoverAligned(page)
  })

  test('[REQ-RDR-031] touching during the nudge stops it at once (page 1 back at <= 1px within 100 ms) and records peek', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    // wait until the nudge is visibly under way
    await expect
      .poll(async () => maxRight(await samplesOf(page)), { timeout: 5000, intervals: [16] })
      .toBeGreaterThan(5)
    const { w, h } = await viewportSize(page)
    const cdp = await page.context().newCDPSession(page)
    const pt = { x: Math.round(w / 2), y: Math.round(h / 2) }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] })
    const sentAt = await nowOf(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(500)
    const after = (await samplesOf(page)).filter((x) => x.t >= sentAt + 100)
    expect(after.length).toBeGreaterThan(0)
    expect(maxRight(after), 'page 1 right edge more than 100 ms after the touch').toBeLessThanOrEqual(1)
    await expectCoverAligned(page)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 3000 }).not.toBeNull()
  })

  test('[REQ-RDR-031] opening on a sutra page (progress s4) does not nudge and writes no peek record', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page, { progress: 's4' })
    const win = await firstThreeSeconds(page)
    const s4 = await page.evaluate(() => (document.querySelector('[data-testid="sutra-page"][data-segment="s4"]') as HTMLElement).getBoundingClientRect().right)
    const { w } = await viewportSize(page)
    expect(Math.abs(s4 - w), 'reader opened on page 4').toBeLessThanOrEqual(1.5)
    // page 1 and page 4 must not move at all during 3 s
    const rights = win.map((x) => Math.round(x.right * 10) / 10)
    expect(new Set(rights).size, 'page 1 right edge is constant').toBe(1)
    const s4After = await page.evaluate(() => (document.querySelector('[data-testid="sutra-page"][data-segment="s4"]') as HTMLElement).getBoundingClientRect().right)
    expect(Math.abs(s4After - s4)).toBeLessThanOrEqual(0.5)
    expect(await readPref(page, 'peek')).toBeNull()
    expect(await readPref(page, 'progress')).toEqual({ key: 'progress', value: 's4' })
  })
})

// ---------------------------------------------------------------------------
// prefers-reduced-motion
// ---------------------------------------------------------------------------
test.describe('reduced motion (REQ-RDR-031)', () => {
  test.use({ reducedMotion: 'reduce' })

  test('[REQ-RDR-031] with prefers-reduced-motion: reduce there is no nudge (page 1 stays at <= 1px for 3 s) and the swipe hint is still shown', async ({ page }) => {
    await installSampler(page)
    await gotoCoverWithPeek(page)
    expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
    const win = await firstThreeSeconds(page)
    expect(maxRight(win)).toBeLessThanOrEqual(1)
    await expect(hint(page)).toHaveCount(1)
    await expect(hint(page)).toBeVisible()
    await expect(hint(page)).toHaveText(HINT_TEXT)
    await expectCoverAligned(page)
  })
})

// ---------------------------------------------------------------------------
// Added after audit: interruption of the nudge (scroll / early touch / capsule) and "whole content" movement
// ---------------------------------------------------------------------------
interface DSample {
  t: number
  s1Left: number
  s1Right: number
  s2Right: number
  coverLeft: number
  scrollLeft: number
  /** true while the content is displaced by the nudge: a running animation on/around the reader, or a transform/translate on page 1 or any ancestor */
  displaced: boolean
}

async function installDetailSampler(page: Page, opts: { touchOnFirstFrame?: boolean } = {}): Promise<void> {
  await page.addInitScript((o) => {
    const store: { samples: DSample[] } = { samples: [] }
    interface DSample { t: number; s1Left: number; s1Right: number; s2Right: number; coverLeft: number; scrollLeft: number; displaced: boolean }
    ;(window as any).__detailLog = store
    const S1 = '[data-testid="sutra-page"][data-segment="s1"]'
    const isDisplaced = (s1: Element, vp: Element): boolean => {
      for (let el: Element | null = s1; el; el = el.parentElement) {
        const cs = getComputedStyle(el)
        if (cs.transform !== 'none' && cs.transform !== '') return true
        if (cs.translate !== 'none' && cs.translate !== '') return true
      }
      return document.getAnimations().some((a) => {
        const target = (a.effect as KeyframeEffect | null)?.target as Element | null | undefined
        return a.playState === 'running' && !!target && (target.contains(s1) || vp.contains(target))
      })
    }
    const tick = () => {
      const s1 = document.querySelector(S1)
      const s2 = document.querySelector('[data-testid="sutra-page"][data-segment="s2"]')
      const vp = document.querySelector('[data-testid="sutra-viewport"]') as HTMLElement | null
      const cover = document.querySelector('[data-testid="sutra-cover"]')
      if (s1 && s2 && vp && cover && store.samples.length < 3000) {
        const r1 = s1.getBoundingClientRect()
        store.samples.push({
          t: performance.now(),
          s1Left: r1.left,
          s1Right: r1.right,
          s2Right: s2.getBoundingClientRect().right,
          coverLeft: cover.getBoundingClientRect().left,
          scrollLeft: vp.scrollLeft,
          displaced: isDisplaced(s1, vp),
        })
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)

    if (o.touchOnFirstFrame) {
      // Fire a touch the instant page 1 enters the DOM, i.e. before the first frame that shows it.
      const fire = (target: Element) => {
        const mk = (type: string) => {
          try {
            const touch = new Touch({ identifier: 1, target, clientX: 100, clientY: 200 })
            return new TouchEvent(type, { bubbles: true, cancelable: true, touches: type === 'touchend' ? [] : [touch], targetTouches: type === 'touchend' ? [] : [touch], changedTouches: [touch] })
          } catch { return new Event(type, { bubbles: true, cancelable: true }) }
        }
        target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: 100, clientY: 200 }))
        target.dispatchEvent(mk('touchstart'))
        target.dispatchEvent(mk('touchend'))
        target.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', clientX: 100, clientY: 200 }))
      }
      const mo = new MutationObserver(() => {
        const s1 = document.querySelector(S1)
        if (!s1) return
        mo.disconnect()
        ;(window as any).__earlyTouchAt = performance.now()
        fire(s1)
      })
      mo.observe(document, { childList: true, subtree: true })
    }
  }, opts)
}

const detailOf = (page: Page): Promise<DSample[]> => page.evaluate(() => (window as any).__detailLog.samples as DSample[])

async function waitNudgeUnderway(page: Page): Promise<void> {
  await expect
    .poll(async () => Math.max(0, ...(await detailOf(page)).map((x) => x.s1Right)), { timeout: 5000, intervals: [16] })
    .toBeGreaterThan(5)
}

async function waitThreeSecondsDetail(page: Page): Promise<DSample[]> {
  await expect
    .poll(async () => {
      const s = await detailOf(page)
      return s.length > 0 && s[s.length - 1].t - s[0].t >= 3000
    }, { timeout: 10_000, intervals: [100] })
    .toBe(true)
  const s = await detailOf(page)
  return s.filter((x) => x.t - s[0].t <= 3000)
}

test.describe('first-use nudge interruption and whole-content movement (REQ-RDR-031)', () => {
  test('[REQ-RDR-031] scrolling the sutra viewport during the nudge stops it at once (content back in place within 100 ms) and records peek', async ({ page }) => {
    await installDetailSampler(page)
    await gotoCoverWithPeek(page)
    await waitNudgeUnderway(page)
    const { w, h } = await viewportSize(page)
    const sentAt = await nowOf(page)
    await page.mouse.move(Math.round(w / 2), Math.round(h / 2))
    await page.mouse.wheel(-150, 0)
    await page.waitForTimeout(800)
    const all = await detailOf(page)
    const after = all.filter((x) => x.t >= sentAt + 100)
    expect(after.length).toBeGreaterThan(0)
    expect(after.filter((x) => x.displaced).length, 'frames still displaced by the nudge more than 100 ms after the scroll').toBe(0)
    expect(Math.max(...all.filter((x) => x.t >= sentAt).map((x) => Math.abs(x.scrollLeft))), 'the wheel really scrolled the viewport').toBeGreaterThan(0)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 3000 }).not.toBeNull()
  })

  test('[REQ-RDR-031] a touch before the nudge starts cancels it: page 1 right edge stays <= 1px for 3 s and peek is recorded', async ({ page }) => {
    await installDetailSampler(page, { touchOnFirstFrame: true })
    await gotoCoverWithPeek(page)
    const win = await waitThreeSecondsDetail(page)
    expect(await page.evaluate(() => (window as any).__earlyTouchAt), 'early touch was dispatched').toBeGreaterThan(0)
    expect(Math.max(...win.map((x) => x.s1Right)), `max right edge of page 1 over 3 s (${win.length} frames)`).toBeLessThanOrEqual(1)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 3000 }).not.toBeNull()
  })

  test('[REQ-RDR-031] touching the phonetic capsule (outside the viewport) during the nudge stops it at once (page 1 back at <= 1px within 100 ms) and records peek', async ({ page }) => {
    await installDetailSampler(page)
    await gotoCoverWithPeek(page)
    await waitNudgeUnderway(page)
    const box = await toggle(page).boundingBox()
    expect(box, 'capsule has a bounding box').not.toBeNull()
    const pt = { x: Math.round(box!.x + box!.width / 2), y: Math.round(box!.y + box!.height / 2) }
    const cdp = await page.context().newCDPSession(page)
    const sentAt = await nowOf(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [pt] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await page.waitForTimeout(600)
    const after = (await detailOf(page)).filter((x) => x.t >= sentAt + 100)
    expect(after.length).toBeGreaterThan(0)
    expect(Math.max(...after.map((x) => x.s1Right)), 'page 1 right edge more than 100 ms after the capsule touch').toBeLessThanOrEqual(1)
    await expect.poll(() => readPref(page, 'peek'), { timeout: 3000 }).not.toBeNull()
  })

  test('[REQ-RDR-031] the nudge moves the sutra content as a whole: at the peak the cover, page 1 and page 2 stay edge to edge (within 1px)', async ({ page }) => {
    await installDetailSampler(page)
    await gotoCoverWithPeek(page)
    const win = await waitThreeSecondsDetail(page)
    const peak = win.reduce((a, b) => (b.s1Right > a.s1Right ? b : a))
    expect(peak.s1Right, 'the nudge happened').toBeGreaterThanOrEqual(32)
    expect(Math.abs(peak.coverLeft - peak.s1Right), `cover left ${peak.coverLeft} vs page 1 right ${peak.s1Right}`).toBeLessThanOrEqual(1)
    expect(Math.abs(peak.s1Left - peak.s2Right), `page 1 left ${peak.s1Left} vs page 2 right ${peak.s2Right}`).toBeLessThanOrEqual(1)
  })
})
