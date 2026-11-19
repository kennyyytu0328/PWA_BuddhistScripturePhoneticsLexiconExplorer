import fs from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import {
  AST,
  closeOverlay,
  closeTo,
  collectPageErrors,
  colorOf,
  expect,
  firstFamily,
  gotoReader,
  openLexicon,
  styleOf,
  test,
} from './helpers'

// ---------------------------------------------------------------------------
// REQ-RDR-043 聽讀音: a 聽 button in the lexicon drawer plays the recording from the clicked occurrence of the
// term (chars[i]) to its end (chars[i + n]). The recording is the fake media element of voice.spec.ts;
// time is the fake page.clock.
// ---------------------------------------------------------------------------

interface Timings { duration: number; title: { start: number; end: number }; chars: number[] }
const timings = (): Timings =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/voice-timings.json'), 'utf8')) as Timings

interface VoiceHook {
  time(): number
  plays: number[]
  playing: boolean
  rejectPlay: boolean
  fireError(): void
}
const hookTime = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.time())
const hookPlaying = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.playing)

/** Fake media clock (same approach as voice.spec.ts), plus fireError(). */
async function installFakeAudio(page: Page): Promise<void> {
  const { duration } = timings()
  await page.addInitScript((dur: number) => {
    interface S { pos: number; playing: boolean; t0: number; token: number }
    const proto = HTMLMediaElement.prototype
    const states = new WeakMap<object, S>()
    let last: HTMLMediaElement | null = null
    const st = (el: object): S => {
      let s = states.get(el)
      if (!s) {
        s = { pos: 0, playing: false, t0: 0, token: 0 }
        states.set(el, s)
      }
      return s
    }
    const posOf = (el: object): number => {
      const s = st(el)
      return s.playing ? Math.min(dur, s.pos + (Date.now() - s.t0) / 1000) : s.pos
    }
    const hook = {
      plays: [] as number[],
      playing: false,
      rejectPlay: false,
      time: () => (last ? posOf(last) : 0),
      fireError: () => {
        if (!last) return
        const s = st(last)
        s.pos = posOf(last)
        s.playing = false
        s.token++
        hook.playing = false
        last.dispatchEvent(new Event('error'))
      },
    }
    ;(window as unknown as { __voice: typeof hook }).__voice = hook

    const schedule = (el: HTMLMediaElement): void => {
      const s = st(el)
      s.token++
      const tk = s.token
      setTimeout(() => {
        if (s.token !== tk || !s.playing) return
        s.pos = dur
        s.playing = false
        hook.playing = false
        el.dispatchEvent(new Event('pause'))
        el.dispatchEvent(new Event('ended'))
      }, Math.max(0, (dur - posOf(el)) * 1000))
    }
    Object.defineProperty(proto, 'currentTime', {
      configurable: true,
      get(this: HTMLMediaElement) {
        return posOf(this)
      },
      set(this: HTMLMediaElement, v: number) {
        const s = st(this)
        s.pos = Math.max(0, Math.min(dur, Number(v)))
        s.t0 = Date.now()
        last = this
        if (s.playing) schedule(this)
        queueMicrotask(() => this.dispatchEvent(new Event('seeked')))
      },
    })
    Object.defineProperty(proto, 'duration', { configurable: true, get: () => dur })
    Object.defineProperty(proto, 'paused', { configurable: true, get(this: HTMLMediaElement) { return !st(this).playing } })
    Object.defineProperty(proto, 'readyState', { configurable: true, get: () => 4 })
    proto.play = function (this: HTMLMediaElement): Promise<void> {
      last = this
      if (hook.rejectPlay) return Promise.reject(new DOMException('play() blocked by test', 'NotAllowedError'))
      const s = st(this)
      if (!s.playing) {
        if (s.pos >= dur) s.pos = 0
        s.t0 = Date.now()
        s.playing = true
      }
      hook.playing = true
      hook.plays.push(posOf(this))
      schedule(this)
      queueMicrotask(() => this.dispatchEvent(new Event('play')))
      return Promise.resolve()
    }
    proto.pause = function (this: HTMLMediaElement): void {
      const s = st(this)
      if (!s.playing) return
      s.pos = posOf(this)
      s.playing = false
      s.token++
      hook.playing = false
      queueMicrotask(() => this.dispatchEvent(new Event('pause')))
    }
  }, duration)
}

// ---------------------------------------------------------------------------
// Model: occurrences of every term (i = non-punctuation characters before it, n = its length)
// ---------------------------------------------------------------------------
interface Occ { lex: string; nth: number; i: number; n: number }
const OCCS: Occ[] = (() => {
  const out: Occ[] = []
  const seen: Record<string, number> = {}
  let i = 0
  for (const s of AST.segments) {
    for (const t of s.tokens) {
      if (t.punct) continue
      const n = t.chars?.length ?? 0
      if (t.lex) {
        out.push({ lex: t.lex, nth: seen[t.lex] ?? 0, i, n })
        seen[t.lex] = (seen[t.lex] ?? 0) + 1
      }
      i += n
    }
  }
  return out
})()
const occ = (lex: string, nth = 0): Occ => {
  const o = OCCS.find((x) => x.lex === lex && x.nth === nth)
  if (!o) throw new Error(`no occurrence ${lex}#${nth}`)
  return o
}
const TOL = 0.06

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
async function withTicking<T>(page: Page, fn: () => Promise<T>): Promise<T> {
  let stop = false
  const loop = (async () => {
    while (!stop) {
      await page.clock.runFor(30).catch(() => undefined)
      await new Promise((r) => setTimeout(r, 20))
    }
  })()
  try {
    return await fn()
  } finally {
    stop = true
    await loop
  }
}

async function boot(page: Page): Promise<void> {
  await installFakeAudio(page)
  await page.clock.install()
  await gotoReader(page)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)
}

const drawerOf = (page: Page): Locator => page.getByTestId('lexicon-drawer')
const listenIn = (page: Page): Locator => drawerOf(page).locator('button[data-testid="lexicon-listen"]')

async function openTerm(page: Page, o: Occ): Promise<Locator> {
  const drawer = await withTicking(page, () => openLexicon(page, o.lex, o.nth))
  await expect(listenIn(page), 'the drawer of a term has one 聽 button').toHaveCount(1) // fail fast, not on a click timeout
  return drawer
}

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)

/** Click 聽 until it turns 停 (retries while the recording / timings are still loading). */
async function startListen(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if ((await listenIn(page).textContent())?.trim() === '停') return
    await listenIn(page).click()
    await page.waitForTimeout(100)
  }
  await expect(listenIn(page)).toHaveText('停')
}

async function expectIdle(page: Page): Promise<void> {
  await expect(listenIn(page)).toHaveText('聽')
  await expect(listenIn(page)).toHaveAttribute('aria-label', '播放讀音')
  await expect(listenIn(page)).toHaveAttribute('aria-pressed', 'false')
}

async function expectPlayingUi(page: Page): Promise<void> {
  await expect(listenIn(page)).toHaveText('停')
  await expect(listenIn(page)).toHaveAttribute('aria-label', '停止播放')
  await expect(listenIn(page)).toHaveAttribute('aria-pressed', 'true')
}

/** Where the clip started: the media position right after starting, read while the clock is frozen (call order of seek / play does not matter). */
const lastStart = (page: Page): Promise<number> => hookTime(page)

// ===========================================================================
test.describe('REQ-RDR-043 聽讀音: the button', () => {
  for (const [lex, nth] of [['觀自在', 0], ['心經真言', 0]] as const) {
    test(`[REQ-RDR-043] ${lex}: exactly one 聽 button in lexicon-readings with the right text, aria-label, aria-pressed, size and look`, async ({ page }) => {
      await gotoReader(page)
      const drawer = await openLexicon(page, lex, nth)
      const readings = drawer.getByTestId('lexicon-readings')
      await expect(readings.locator('button[data-testid="lexicon-listen"]')).toHaveCount(1)
      await expect(drawer.locator('button[data-testid="lexicon-listen"]')).toHaveCount(1)
      const btn = readings.locator('button[data-testid="lexicon-listen"]')
      await expect(btn).toHaveText('聽')
      await expect(btn).toHaveAttribute('aria-label', '播放讀音')
      await expect(btn).toHaveAttribute('aria-pressed', 'false')

      const box = await btn.boundingBox()
      expect(Math.abs(box!.width - 44)).toBeLessThanOrEqual(0.6)
      expect(Math.abs(box!.height - 44)).toBeLessThanOrEqual(0.6)
      const radius = parseFloat(await styleOf(btn, 'border-top-left-radius'))
      expect(radius).toBeGreaterThanOrEqual(22)
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(parseFloat(await styleOf(btn, `border-${side}-width`)), `border-${side}-width`).toBeCloseTo(1, 1)
        expect(await styleOf(btn, `border-${side}-style`)).toBe('solid')
        expect(closeTo(await colorOf(btn, `border-${side}-color`), [168, 162, 158, 1], 2)).toBe(true)
      }
      expect((await colorOf(btn, 'background-color'))[3]).toBe(0)
      expect(closeTo(await colorOf(btn, 'color'), [231, 229, 228, 1], 2)).toBe(true)
      expect(firstFamily(await styleOf(btn, 'font-family'))).toBe('Noto Sans TC')
      const weight = parseInt(await styleOf(btn, 'font-weight'), 10)
      expect(weight).toBeGreaterThanOrEqual(300)
      expect(weight).toBeLessThanOrEqual(400)

      // completely inside the drawer, clear of the reading text
      const geo = await drawer.evaluate((d, sel) => {
        const b = d.querySelector(sel)!.getBoundingClientRect()
        const dr = d.getBoundingClientRect()
        const rd = d.querySelector('[data-testid="lexicon-readings"]')!
        const T = (window as unknown as { __t: { hasOwnText: (e: Element) => boolean } }).__t
        const overlaps = [...rd.querySelectorAll('*')]
          .filter((e) => !e.closest('button[data-testid="lexicon-listen"]') && T.hasOwnText(e))
          .map((e) => ({ e, r: e.getBoundingClientRect() }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top)
          .map(({ e }) => `${e.tagName}:${e.textContent}`)
        return {
          inside: b.left >= dr.left - 0.5 && b.right <= dr.right + 0.5 && b.top >= dr.top - 0.5 && b.bottom <= dr.bottom + 0.5,
          overlaps,
        }
      }, 'button[data-testid="lexicon-listen"]')
      expect(geo.inside).toBe(true)
      expect(geo.overlaps).toEqual([])
    })
  }

  test('[REQ-RDR-043] a cross-reference entry has no 聽 button; 返回 brings it back', async ({ page }) => {
    await boot(page)
    const drawer = await openTerm(page, occ('觀自在'))
    await expect(listenIn(page)).toHaveCount(1)
    await withTicking(page, async () => {
      await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
      await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')
    })
    await expect(drawer.locator('button[data-testid="lexicon-listen"]')).toHaveCount(0)
    await withTicking(page, async () => {
      await drawer.locator('button[data-testid="lexicon-back"]').click()
      await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀自在')
    })
    await expect(listenIn(page)).toHaveCount(1)
    await expectIdle(page)
  })
})

// ===========================================================================
test.describe('REQ-RDR-043 聽讀音: playing the clip', () => {
  const CASES: [string, number][] = [
    ['觀自在', 0],
    ['空', 0],
    ['般若波羅蜜多', 0],
    ['般若波羅蜜多', 3],
    ['舍利弗', 1],
    ['心經真言', 3], // ends at the last character of the sutra: i + n = 260
  ]
  for (const [lex, nth] of CASES) {
    test(`[REQ-RDR-043] ${lex}#${nth}: 聽 plays from chars[i] and pauses at chars[i + n] (recording end when i + n = 260), button back to 聽`, async ({ page }) => {
      const tm = timings()
      const o = occ(lex, nth)
      const end = o.i + o.n >= 260 ? tm.duration : tm.chars[o.i + o.n]
      await boot(page)
      await openTerm(page, o)
      expect(await hookPlaying(page)).toBe(false)
      await startListen(page)
      await expectPlayingUi(page)
      expect(Math.abs((await lastStart(page)) - tm.chars[o.i])).toBeLessThanOrEqual(TOL)
      expect(await hookPlaying(page)).toBe(true)

      // still playing shortly before the end
      await page.clock.runFor(Math.max(1, Math.floor((end - tm.chars[o.i] - 0.04) * 1000)))
      expect(await hookPlaying(page)).toBe(true)
      await expect(listenIn(page)).toHaveText('停')

      await page.clock.runFor(600)
      expect(await hookPlaying(page)).toBe(false)
      await expectIdle(page)
      const at = await hookTime(page)
      expect(at).toBeGreaterThanOrEqual(end - 0.002)
      expect(at).toBeLessThanOrEqual(end + 0.1)
    })
  }

  test('[REQ-RDR-043] the same term in two places plays two different clips (the one that was tapped)', async ({ page }) => {
    const tm = timings()
    await boot(page)
    for (const nth of [0, 3]) {
      const o = occ('般若波羅蜜多', nth)
      await openTerm(page, o)
      await startListen(page)
      expect(Math.abs((await lastStart(page)) - tm.chars[o.i])).toBeLessThanOrEqual(TOL)
      await listenIn(page).click()
      await expectIdle(page)
      await withTicking(page, () => closeOverlay(page))
    }
    expect(occ('般若波羅蜜多', 0).i).not.toBe(occ('般若波羅蜜多', 3).i)
  })

  test('[REQ-RDR-043] clicking 停 while playing pauses and shows 聽; clicking again replays from chars[i]', async ({ page }) => {
    const tm = timings()
    const o = occ('阿耨多羅三藐三菩提')
    await boot(page)
    await openTerm(page, o)
    await startListen(page)
    await page.clock.runFor(1200)
    expect(await hookPlaying(page)).toBe(true)
    await listenIn(page).click()
    await expectIdle(page)
    expect(await hookPlaying(page)).toBe(false)
    const frozen = await hookTime(page)
    await page.clock.runFor(1500)
    expect(await hookTime(page)).toBeCloseTo(frozen, 3)

    await listenIn(page).click()
    await expectPlayingUi(page)
    expect(Math.abs((await lastStart(page)) - tm.chars[o.i])).toBeLessThanOrEqual(TOL)
    expect(await hookPlaying(page)).toBe(true)
  })

  test('[REQ-RDR-043] the clip end is found without a requestAnimationFrame loop (and the fake media never dispatches timeupdate, so it is not found through it)', async ({ page }) => {
    const o = occ('阿耨多羅三藐三菩提')
    await boot(page)
    await openTerm(page, o)
    await page.evaluate(() => {
      const w = window as unknown as { __raf: number; requestAnimationFrame: (cb: FrameRequestCallback) => number }
      w.__raf = 0
      const orig = w.requestAnimationFrame.bind(window)
      w.requestAnimationFrame = (cb: FrameRequestCallback) => {
        w.__raf++
        return orig(cb)
      }
    })
    await startListen(page)
    await page.evaluate(() => {
      ;(window as unknown as { __raf: number }).__raf = 0
    })
    await page.clock.runFor(2000)
    expect(await hookPlaying(page)).toBe(true)
    const frames = await page.evaluate(() => (window as unknown as { __raf: number }).__raf)
    expect(frames, 'a per-frame loop would call requestAnimationFrame ~120 times in 2s').toBeLessThan(30)
    // the fake element never fires timeupdate: the clip still ends on time
    await page.clock.runFor(4000)
    expect(await hookPlaying(page)).toBe(false)
    await expectIdle(page)
  })
})

// ===========================================================================
test.describe('REQ-RDR-043 聽讀音: stopping and isolation', () => {
  test('[REQ-RDR-043] collapsing the drawer pauses the recording; reopening the same term shows 聽', async ({ page }) => {
    const o = occ('阿耨多羅三藐三菩提')
    await boot(page)
    await openTerm(page, o)
    await startListen(page)
    await page.clock.runFor(500)
    await withTicking(page, () => closeOverlay(page))
    expect(await hookPlaying(page)).toBe(false)
    await openTerm(page, o)
    await expectIdle(page)
  })

  test('[REQ-RDR-043] tapping a cross-reference while playing pauses the recording', async ({ page }) => {
    await boot(page)
    const drawer = await openTerm(page, occ('觀自在'))
    await startListen(page)
    await withTicking(page, async () => {
      await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
      await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')
    })
    expect(await hookPlaying(page)).toBe(false)
    await withTicking(page, () => drawer.locator('button[data-testid="lexicon-back"]').click())
    await expectIdle(page)
    expect(await hookPlaying(page)).toBe(false)
  })

  test('[REQ-RDR-043] document.visibilityState hidden pauses the recording; the button shows 聽 afterwards', async ({ page }) => {
    await boot(page)
    await openTerm(page, occ('阿耨多羅三藐三菩提'))
    await startListen(page)
    await page.clock.runFor(400)
    await setVisibility(page, 'hidden')
    await expect.poll(() => hookPlaying(page)).toBe(false)
    await setVisibility(page, 'visible')
    await expectIdle(page)
    await withTicking(page, () => closeOverlay(page))
    await openTerm(page, occ('阿耨多羅三藐三菩提'))
    await expectIdle(page)
  })

  test('[REQ-RDR-043] the clip does not touch the follow-along: cursor, data-follow and progress line are unchanged, and 聲 + 誦 still resumes from chars[cursor]', async ({ page }) => {
    const tm = timings()
    await boot(page)
    const toggle = page.locator('button[data-testid="follow-toggle"]')
    const pace = page.locator('button[data-testid="follow-pace"]')
    for (let i = 0; i < 4 && (await pace.textContent())?.trim() !== '聲'; i++) await pace.click()
    await expect(pace).toHaveText('聲')
    for (let i = 0; i < 30 && (await toggle.textContent())?.trim() !== '停'; i++) {
      await toggle.click()
      await page.waitForTimeout(100)
    }
    await expect(toggle).toHaveText('停')
    await page.clock.runFor(Math.floor((tm.chars[4] + 0.1) * 1000))
    await toggle.click() // pause with a cursor
    await expect(toggle).toHaveText('誦')

    const snapshot = async () => {
      // the bar has a CSS transition that runs on real time: wait for it before measuring
      await expect
        .poll(() => page.evaluate(() => document.querySelector('[data-testid="follow-progress"]')?.getAnimations().length ?? 0))
        .toBe(0)
      return page.evaluate(() => ({
        follow: [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => c.getAttribute('data-follow')),
        progress: Math.round((document.querySelector('[data-testid="follow-progress"]')?.getBoundingClientRect().width ?? -1) * 2) / 2,
      }))
    }
    const before = await snapshot()
    const cur = before.follow.indexOf('current')
    expect(cur).toBeGreaterThanOrEqual(0)

    const o = occ('空')
    await openTerm(page, o)
    await startListen(page)
    await page.clock.runFor(300)
    expect(await snapshot()).toEqual(before)
    await listenIn(page).click()
    await expectIdle(page)
    await withTicking(page, () => closeOverlay(page))
    expect(await snapshot()).toEqual(before)

    // resume from the cursor character (its index among the 260 characters)
    await toggle.click()
    await expect(toggle).toHaveText('停')
    const played = await lastStart(page)
    const cursorChar = await page.evaluate((k) => {
      const cells = [...document.querySelectorAll('.cell, [data-testid="punct"]')]
      return cells.slice(0, k).filter((c) => !c.matches('[data-testid="punct"]')).length
    }, cur)
    expect(Math.abs(played - tm.chars[cursorChar])).toBeLessThanOrEqual(TOL)
  })
})

// ===========================================================================
test.describe('REQ-RDR-043 聽讀音: recording unavailable', () => {
  test('[REQ-RDR-043] timings not loaded yet: 聽 does not play, stays 聽, no error UI, no exception; works once loaded', async ({ page }) => {
    const errors = collectPageErrors(page)
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => {
      release = r
    })
    await page.route('**/data/voice-timings.json', async (route) => {
      await gate
      await route.continue()
    })
    try {
      await boot(page)
      await openTerm(page, occ('觀自在'))
      await listenIn(page).click()
      await page.waitForTimeout(400)
      await expectIdle(page)
      expect(await hookPlaying(page)).toBe(false)
      await expect(page.locator('[role="alert"]')).toHaveCount(0)
      expect(errors).toEqual([])
    } finally {
      release()
    }
    await startListen(page)
    await expectPlayingUi(page)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-043] timings failed to load: 聽 does not play, stays 聽, no error UI, no exception', async ({ page }) => {
    const errors = collectPageErrors(page)
    await page.route('**/data/voice-timings.json', (route) => route.abort())
    await boot(page)
    await openTerm(page, occ('觀自在'))
    await listenIn(page).click()
    await page.waitForTimeout(500)
    await expectIdle(page)
    expect(await hookPlaying(page)).toBe(false)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  for (const mode of ['gate', 'abort'] as const) {
    test(`[REQ-RDR-043] recording (voice.mp3) ${mode === 'gate' ? 'not loaded yet' : 'failed to load'}: 聽 does not play, stays 聽, no error UI, no exception`, async ({ page }) => {
      const errors = collectPageErrors(page)
      // real media element here (the fake one never touches the network); watch play() and element state
      await page.addInitScript(() => {
        const w = window as unknown as { __els: HTMLMediaElement[] }
        w.__els = []
        const orig = HTMLMediaElement.prototype.play
        HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
          w.__els.push(this)
          return orig.call(this)
        }
      })
      let release: () => void = () => undefined
      const gate = new Promise<void>((r) => {
        release = r
      })
      await page.route('**/data/voice.mp3', async (route) => {
        if (mode === 'abort') return route.abort()
        await gate
        return route.abort()
      })
      try {
        await gotoReader(page)
        await openLexicon(page, '觀自在')
        await expect(listenIn(page)).toHaveCount(1)
        await listenIn(page).click()
        await page.waitForTimeout(600)
        await expectIdle(page)
        const playing = await page.evaluate(() =>
          (window as unknown as { __els: HTMLMediaElement[] }).__els.filter((e) => !e.paused && e.currentTime > 0).length,
        )
        expect(playing).toBe(0)
        await expect(page.locator('[role="alert"]')).toHaveCount(0)
        expect(errors).toEqual([])
      } finally {
        release()
      }
    })
  }

  test('[REQ-RDR-043] play() rejected: behaves like stop, button stays 聽, no error UI, no exception', async ({ page }) => {
    const errors = collectPageErrors(page)
    await boot(page)
    await openTerm(page, occ('觀自在'))
    // make sure the timings are loaded first: a successful play, then stop
    await startListen(page)
    await listenIn(page).click()
    await expectIdle(page)
    await page.evaluate(() => {
      ;(window as unknown as { __voice: VoiceHook }).__voice.rejectPlay = true
    })
    await listenIn(page).click()
    await page.waitForTimeout(400)
    await expectIdle(page)
    expect(await hookPlaying(page)).toBe(false)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-043] an error event while playing stops like 停: button back to 聽, no error UI, no exception', async ({ page }) => {
    const errors = collectPageErrors(page)
    await boot(page)
    await openTerm(page, occ('阿耨多羅三藐三菩提'))
    await startListen(page)
    await page.clock.runFor(300)
    await page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.fireError())
    await expectIdle(page)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})
