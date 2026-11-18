import fs from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import {
  AST,
  closeOverlay,
  expect,
  expectPageAligned,
  gotoCover,
  gotoReader,
  openLexicon,
  readPref,
  seedPrefs,
  swipeToNextPage,
  test,
  viewportSize,
  pageRight,
  collectPageErrors,
} from './helpers'

// ---------------------------------------------------------------------------
// Voice follow-along (原音隨誦): REQ-RDR-032 (聲 step), 035, 038, 039.
//
// Media is faked (see installFakeAudio): audio time is derived from Date.now(), so page.clock drives it.
// The real element is only used by the one smoke test at the bottom (no fake there).
// ---------------------------------------------------------------------------

interface Timings {
  audio: string
  duration: number
  title: { start: number; end: number }
  chars: number[]
}

/** Read lazily so a missing product fails the tests (not the module load). */
const timings = (): Timings => {
  const file = path.join(process.cwd(), 'public/data/voice-timings.json')
  const t = JSON.parse(fs.readFileSync(file, 'utf8')) as Timings
  if (!Array.isArray(t.chars) || t.chars.length !== 260) throw new Error('voice-timings.json must hold 260 chars')
  return t
}

/** last i with chars[i] <= t (REQ-RDR-038); -1 before the first character */
const expectedAt = (chars: number[], t: number): number => {
  let r = -1
  for (let i = 0; i < chars.length; i++) if (chars[i] <= t) r = i
  return r
}

interface VoiceHook {
  /** audio position (seconds) of the element that was played last */
  time(): number
  /** position of the element at every play() call (after any earlier seek) */
  plays: number[]
  /** every value assigned to currentTime */
  seeks: number[]
  pauses: number
  ended: number
  /** true while the fake element is playing */
  playing: boolean
  /** set to true to make play() reject (NotAllowedError) */
  rejectPlay: boolean
}
const hookTime = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.time())
const hookState = (page: Page): Promise<{ playing: boolean; plays: number; pauses: number; ended: number }> =>
  page.evaluate(() => {
    const v = (window as unknown as { __voice: VoiceHook }).__voice
    return { playing: v.playing, plays: v.plays.length, pauses: v.pauses, ended: v.ended }
  })
const setRejectPlay = (page: Page, on: boolean): Promise<void> =>
  page.evaluate((v) => {
    ;(window as unknown as { __voice: VoiceHook }).__voice.rejectPlay = v
  }, on)

/**
 * Fake media clock, installed BEFORE navigation. Overrides on HTMLMediaElement.prototype:
 *   play() / pause() / currentTime (get+set) / duration / paused / readyState(=4).
 * Position = base + (Date.now() - startedAt)/1000 while playing, so the fake page.clock moves it.
 * At duration the element stops and fires `pause` then `ended` (scheduled with setTimeout, so page.clock fires it).
 * Records into window.__voice (VoiceHook above).
 */
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
      seeks: [] as number[],
      pauses: 0,
      ended: 0,
      playing: false,
      rejectPlay: false,
      time: () => (last ? posOf(last) : 0),
    }
    ;(window as unknown as { __voice: typeof hook }).__voice = hook

    const schedule = (el: HTMLMediaElement): void => {
      const s = st(el)
      s.token++
      const tk = s.token
      const remaining = Math.max(0, (dur - posOf(el)) * 1000)
      setTimeout(() => {
        if (s.token !== tk || !s.playing) return
        s.pos = dur
        s.playing = false
        hook.playing = false
        hook.ended++
        el.dispatchEvent(new Event('pause'))
        el.dispatchEvent(new Event('ended'))
      }, remaining)
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
        hook.seeks.push(s.pos)
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
      hook.pauses++
      queueMicrotask(() => this.dispatchEvent(new Event('pause')))
    }
  }, duration)
}

// ---------------------------------------------------------------------------
// Model of the sutra (derived from the data product, as in follow-along.spec.ts)
// ---------------------------------------------------------------------------
interface Cell { ch: string; punct: boolean; seg: string }
const CELLS: Cell[] = AST.segments.flatMap((s) =>
  s.tokens.flatMap((t): Cell[] =>
    t.punct
      ? [...t.t].map((ch) => ({ ch, punct: true, seg: s.id }))
      : (t.chars ?? []).map((c) => ({ ch: c.c, punct: false, seg: s.id })),
  ),
)
const CELL_OF_CHAR: number[] = CELLS.flatMap((c, i) => (c.punct ? [] : [i]))
const CHAR_OF_CELL: number[] = (() => {
  let n = -1
  return CELLS.map((c) => (c.punct ? -1 : ++n))
})()
const CHAR_COUNT = CELL_OF_CHAR.length // 260
const SEG_START: Record<string, number> = {}
CELL_OF_CHAR.forEach((ci, i) => {
  if (!(CELLS[ci].seg in SEG_START)) SEG_START[CELLS[ci].seg] = i
})
const SEG_OF_CHAR = (i: number): string => CELLS[CELL_OF_CHAR[i]].seg
const TOL = 0.06 // seconds, for "audio is at chars[i]" checks on the frozen fake clock

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
const toggleBtn = (page: Page): Locator => page.locator('button[data-testid="follow-toggle"]')
const paceBtn = (page: Page): Locator => page.locator('button[data-testid="follow-pace"]')
const progressEl = (page: Page): Locator => page.locator('[data-testid="follow-progress"]')

async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)
}

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

async function waitAligned(page: Page, seg: string, limitMs = 8000): Promise<void> {
  const { w } = await viewportSize(page)
  const t0 = Date.now()
  for (;;) {
    const r = await pageRight(page, seg)
    if (Math.abs(r - w) <= 1.5) return
    if (Date.now() - t0 > limitMs) throw new Error(`page ${seg} not aligned within ${limitMs}ms (right=${r}, w=${w})`)
    await page.clock.runFor(16)
    await page.waitForTimeout(16)
  }
}

interface BootOpts { cover?: boolean; progress?: string; voice?: boolean }

/** Fake audio + fake clock installed before navigation, reader loaded, clock frozen. */
async function boot(page: Page, opts: BootOpts = {}): Promise<void> {
  await installFakeAudio(page)
  await page.clock.install()
  if (opts.progress) {
    await seedPrefs(page, { peek: true, progress: opts.progress })
    await gotoReader(page)
    await expectPageAligned(page, opts.progress)
  } else if (opts.cover) await gotoCover(page)
  else await gotoReader(page)
  await freezeClock(page)
  if (opts.voice) await setPaceTo(page, '聲')
}

/** Click follow-pace until it shows `label` (at most 4 clicks). */
async function setPaceTo(page: Page, label: string): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((await paceBtn(page).textContent())?.trim() === label) return
    await paceBtn(page).click()
  }
  await expect(paceBtn(page)).toHaveText(label)
}

/** Press 誦 until it turns 停; retries while the recording / timings are still loading (REQ-RDR-039). */
async function startVoice(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if ((await toggleBtn(page).textContent())?.trim() === '停') return
    await toggleBtn(page).click()
    await page.waitForTimeout(150)
  }
  await expect(toggleBtn(page)).toHaveText('停')
}

async function followStates(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => c.getAttribute('data-follow')))
}

/** Index of the current character among the 260; -1 when there is none. */
async function cursor(page: Page): Promise<number> {
  const states = await followStates(page)
  expect(states.length, 'number of .cell elements').toBe(CELLS.length)
  const cur = states.map((s, i) => (s === 'current' ? i : -1)).filter((i) => i >= 0)
  if (cur.length === 0) return -1
  expect(cur.length, 'exactly one current cell').toBe(1)
  return CHAR_OF_CELL[cur[0]]
}

function expectedStates(c: number): string[] {
  const out: string[] = []
  CELLS.forEach((cell, ci) => {
    if (cell.punct) out.push(out[ci - 1] === 'ahead' ? 'ahead' : 'read')
    else {
      const i = CHAR_OF_CELL[ci]
      out.push(i < c ? 'read' : i === c ? 'current' : 'ahead')
    }
  })
  return out
}

/** Advance the fake clock (in steps) until the audio position reaches t seconds. */
async function advanceTo(page: Page, t: number, stepMs = 250): Promise<void> {
  for (let guard = 0; guard < 2000; guard++) {
    const cur = await hookTime(page)
    if (cur >= t - 1e-6) return
    await page.clock.runFor(Math.min(stepMs, Math.max(1, Math.ceil((t - cur) * 1000))))
  }
  throw new Error(`audio never reached ${t}s`)
}

const midOf = (tm: Timings, k: number): number =>
  k < tm.chars.length - 1 ? (tm.chars[k] + tm.chars[k + 1]) / 2 : Math.min(tm.chars[k] + 0.15, (tm.chars[k] + tm.duration) / 2)

async function expectNoFollow(page: Page): Promise<void> {
  expect(await page.locator('[data-follow]').count()).toBe(0)
  await expect(progressEl(page)).toHaveCount(0)
}

const setVisibleFinished = async (page: Page): Promise<void> => {
  await expect(toggleBtn(page)).toHaveText('誦')
  await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
  await expectNoFollow(page)
}

// ===========================================================================
// REQ-RDR-032: the 聲 step of follow-pace
// ===========================================================================
test.describe('REQ-RDR-032 聲 pace step', () => {
  test('[REQ-RDR-032] follow-pace cycles 中 → 快 → 慢 → 聲 → 中; 聲 has aria-label 隨誦速度：原音朗讀', async ({ page }) => {
    await gotoReader(page)
    const steps: [string, string][] = [
      ['中', '隨誦速度：每分鐘 225 字'],
      ['快', '隨誦速度：每分鐘 300 字'],
      ['慢', '隨誦速度：每分鐘 150 字'],
      ['聲', '隨誦速度：原音朗讀'],
      ['中', '隨誦速度：每分鐘 225 字'],
    ]
    for (const [i, [text, label]] of steps.entries()) {
      if (i > 0) await paceBtn(page).click()
      await expect(paceBtn(page)).toHaveText(text)
      await expect(paceBtn(page)).toHaveAttribute('aria-label', label)
    }
  })

  test('[REQ-RDR-032] 聲 is saved in IndexedDB prefs followPace as the string "voice" and restored after reload', async ({ page }) => {
    await gotoReader(page)
    await setPaceTo(page, '聲')
    await expect.poll(async () => ((await readPref(page, 'followPace')) as { value?: unknown } | null)?.value).toBe('voice')
    await page.reload()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await expect(paceBtn(page)).toHaveText('聲')
    await expect(paceBtn(page)).toHaveAttribute('aria-label', '隨誦速度：原音朗讀')
  })
})

// ===========================================================================
// REQ-RDR-038 voice follow-along
// ===========================================================================
test.describe('REQ-RDR-038 voice follow-along', () => {
  test('[REQ-RDR-038] the cursor is the last character with chars[i] <= audio time; colours and progress line follow it', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    const { w } = await viewportSize(page)
    await startVoice(page)
    // started from the page in view (s1 first character): audio at chars[0]
    expect(Math.abs((await hookTime(page)) - tm.chars[0])).toBeLessThanOrEqual(TOL)
    expect(await cursor(page)).toBe(0)
    expect((await hookState(page)).playing).toBe(true)

    const A = SEG_START.s2
    const B = SEG_START.s4
    for (const k of [3, A - 1, A, B, CHAR_COUNT - 1]) {
      const gap = tm.chars[k] - tm.chars[k - 1]
      if (gap > 0.12) {
        // just before chars[k] the previous character is still current
        await advanceTo(page, tm.chars[k] - 0.04)
        expect(await cursor(page), `just before chars[${k}]`).toBe(k - 1)
      }
      await advanceTo(page, midOf(tm, k))
      expect(await cursor(page), `between chars[${k}] and the next`).toBe(k)
      expect(await followStates(page)).toEqual(expectedStates(k))
      await expect
        .poll(async () => (await progressEl(page).evaluate((el) => el.getBoundingClientRect().width)) as number, { timeout: 5000 })
        .toBeGreaterThanOrEqual((w * (k + 1)) / CHAR_COUNT - 2)
      const width = await progressEl(page).evaluate((el) => el.getBoundingClientRect().width)
      expect(Math.abs(width - (w * (k + 1)) / CHAR_COUNT)).toBeLessThanOrEqual(2)
    }
  })

  test('[REQ-RDR-038] crossing into the next page turns the fold to it (auto page turn) while the cursor keeps tracking the audio', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    await startVoice(page)
    const A = SEG_START.s2
    await advanceTo(page, tm.chars[A] - 0.15)
    await expectPageAligned(page, 's1')
    // small steps so the turn animation can run
    while ((await hookTime(page)) < tm.chars[A] + 0.03) {
      await page.clock.runFor(16)
      await page.waitForTimeout(8)
    }
    await waitAligned(page, 's2')
    const t = await hookTime(page)
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(expectedAt(tm.chars, t - 0.05))
    expect(c).toBeLessThanOrEqual(expectedAt(tm.chars, t))
    expect(c).toBeGreaterThanOrEqual(A)
    expect(SEG_OF_CHAR(c)).toBe('s2')
  })

  test('[REQ-RDR-038] on the cover 聲 plays the title first: stays on the cover, 停 / aria-pressed true, no data-follow, no progress line; at chars[0] the fold turns to s1 and the cursor is its first character', async ({ page }) => {
    const tm = timings()
    await boot(page, { cover: true, voice: true })
    await startVoice(page)
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'true')
    expect(Math.abs((await hookTime(page)) - tm.title.start)).toBeLessThanOrEqual(TOL)
    await expectNoFollow(page)

    await advanceTo(page, (tm.title.start + tm.chars[0]) / 2)
    const { w } = await viewportSize(page)
    expect(Math.abs((await page.getByTestId('sutra-cover').evaluate((el) => el.getBoundingClientRect().right)) - w)).toBeLessThanOrEqual(1.5)
    await expect(toggleBtn(page)).toHaveText('停')
    await expectNoFollow(page)

    await advanceTo(page, tm.chars[0] + 0.05)
    await waitAligned(page, 's1')
    expect(await cursor(page)).toBe(0)
    await expect(progressEl(page)).toHaveCount(1)
    await expect(toggleBtn(page)).toHaveText('停')
  })

  test('[REQ-RDR-038] stopping and pressing 誦 again during the title replays the recording from title.start', async ({ page }) => {
    const tm = timings()
    await boot(page, { cover: true, voice: true })
    await startVoice(page)
    await advanceTo(page, (tm.title.start + tm.chars[0]) / 2)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    expect((await hookState(page)).playing).toBe(false)
    await expectNoFollow(page)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect((await hookState(page)).playing).toBe(true)
    expect(Math.abs((await hookTime(page)) - tm.title.start)).toBeLessThanOrEqual(TOL)
    await expectNoFollow(page)
  })

  test('[REQ-RDR-038] pausing (follow-toggle) pauses the audio and keeps the cursor; resuming on the cursor page seeks the audio to chars[cursor]', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    await startVoice(page)
    await advanceTo(page, midOf(tm, 5))
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    expect((await hookState(page)).playing).toBe(false)
    const frozenAt = await hookTime(page)
    await page.clock.runFor(3000)
    expect(await hookTime(page)).toBeCloseTo(frozenAt, 3)
    expect(await cursor(page)).toBe(5)
    expect(await followStates(page)).toEqual(expectedStates(5))
    await expect(progressEl(page)).toHaveCount(1)

    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect((await hookState(page)).playing).toBe(true)
    expect(Math.abs((await hookTime(page)) - tm.chars[5])).toBeLessThanOrEqual(TOL)
    expect(await cursor(page)).toBe(5)
  })

  test('[REQ-RDR-038] resuming while another page is in view moves the cursor to that page\'s first character and the audio to its chars', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    await startVoice(page)
    await advanceTo(page, midOf(tm, 3))
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    await withTicking(page, async () => {
      await swipeToNextPage(page)
      await expectPageAligned(page, 's2')
    })
    await startVoice(page)
    const A = SEG_START.s2
    expect(await cursor(page)).toBe(A)
    expect(Math.abs((await hookTime(page)) - tm.chars[A])).toBeLessThanOrEqual(TOL)
    expect((await hookState(page)).playing).toBe(true)
  })

  test('[REQ-RDR-038] opened on s4 (nothing played yet), 聲 + 誦 starts at the first character of s4 with the audio at its chars', async ({ page }) => {
    const tm = timings()
    await boot(page, { progress: 's4', voice: true })
    await startVoice(page)
    const B = SEG_START.s4
    expect(await cursor(page)).toBe(B)
    expect(Math.abs((await hookTime(page)) - tm.chars[B])).toBeLessThanOrEqual(TOL)
  })

  test('[REQ-RDR-035] opening a lexicon drawer pauses the voice (audio silent); closing it does not resume', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    await startVoice(page)
    await advanceTo(page, midOf(tm, 2))
    await withTicking(page, async () => {
      await openLexicon(page, '觀自在')
    })
    await expect(toggleBtn(page)).toHaveText('誦')
    expect((await hookState(page)).playing).toBe(false)
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(2)
    await withTicking(page, () => closeOverlay(page))
    await page.clock.runFor(2000)
    await expect(toggleBtn(page)).toHaveText('誦')
    expect((await hookState(page)).playing).toBe(false)
    expect(await cursor(page)).toBe(c)
  })

  test('[REQ-RDR-038] when the recording ends the follow-along finishes like REQ-RDR-037 (no data-follow, no progress, 誦, stays on s9); 誦 again starts from s9', async ({ page }) => {
    const tm = timings()
    await boot(page, { progress: 's9', voice: true })
    await startVoice(page)
    const S9 = SEG_START.s9
    expect(await cursor(page)).toBe(S9)
    expect(Math.abs((await hookTime(page)) - tm.chars[S9])).toBeLessThanOrEqual(TOL)
    await advanceTo(page, midOf(tm, CHAR_COUNT - 1))
    expect(await cursor(page)).toBe(CHAR_COUNT - 1)
    await page.clock.runFor(Math.ceil((tm.duration - (await hookTime(page))) * 1000) + 300)
    expect((await hookState(page)).ended).toBeGreaterThanOrEqual(1)
    await setVisibleFinished(page)
    await expectPageAligned(page, 's9')

    await startVoice(page)
    expect(await cursor(page)).toBe(S9)
    expect(Math.abs((await hookTime(page)) - tm.chars[S9])).toBeLessThanOrEqual(TOL)
  })
})

// ===========================================================================
// REQ-RDR-039 unavailable recording and mode switches
// ===========================================================================
test.describe('REQ-RDR-039 recording unavailable and mode switches', () => {
  test('[REQ-RDR-039] while the timings are still loading, 誦 does not start (no exception); once loaded, 誦 starts normally', async ({ page }) => {
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
      await boot(page, { voice: true })
      await toggleBtn(page).click()
      await page.waitForTimeout(400)
      await expect(toggleBtn(page)).toHaveText('誦')
      await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
      expect((await hookState(page)).playing).toBe(false)
      await expectNoFollow(page)
      expect(errors).toEqual([])
    } finally {
      release()
    }
    await startVoice(page)
    expect(await cursor(page)).toBe(0)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-039] play() rejected: behaves like 停 (toggle 誦, cursor and data-follow kept), no error UI; works again once play() is allowed', async ({ page }) => {
    const tm = timings()
    const errors = collectPageErrors(page)
    await boot(page, { voice: true })
    await startVoice(page)
    await advanceTo(page, midOf(tm, 3))
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')

    await setRejectPlay(page, true)
    await toggleBtn(page).click()
    await page.waitForTimeout(400)
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await hookState(page)).playing).toBe(false)
    expect(await cursor(page)).toBe(3)
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect(errors).toEqual([])

    await setRejectPlay(page, false)
    await startVoice(page)
    expect(Math.abs((await hookTime(page)) - tm.chars[3])).toBeLessThanOrEqual(TOL)
  })

  test('[REQ-RDR-039] play() rejected on a fresh start: toggle stays 誦 / aria-pressed false, audio silent, no error UI, no exception', async ({ page }) => {
    const errors = collectPageErrors(page)
    await boot(page, { voice: true })
    await setRejectPlay(page, true)
    await toggleBtn(page).click()
    await page.waitForTimeout(500)
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await hookState(page)).playing).toBe(false)
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-039] switching 聲 → 中 while playing pauses the audio and keeps the cursor and data-follow; 誦 then follows at the new pace with the audio silent', async ({ page }) => {
    const tm = timings()
    await boot(page, { voice: true })
    await startVoice(page)
    await advanceTo(page, midOf(tm, 3))
    const before = await hookState(page)

    await paceBtn(page).click() // 聲 → 中
    await expect(paceBtn(page)).toHaveText('中')
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect((await hookState(page)).playing).toBe(false)
    expect(await cursor(page)).toBe(3)
    expect(await followStates(page)).toEqual(expectedStates(3))
    await expect(progressEl(page)).toHaveCount(1)
    await page.clock.runFor(2000)
    expect(await cursor(page)).toBe(3)

    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(3)
    await page.clock.runFor(900) // > 2 beats at 中
    expect(await cursor(page)).toBeGreaterThan(3)
    const after = await hookState(page)
    expect(after.playing).toBe(false)
    expect(after.plays).toBe(before.plays)
  })

  test('[REQ-RDR-039] switching 中 → … → 聲 while playing pauses and keeps data-follow with the audio silent; 誦 then resumes the voice from the cursor', async ({ page }) => {
    const tm = timings()
    await boot(page)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    await page.clock.runFor(700)
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(1)
    await setPaceTo(page, '聲') // 中 → 快 → 慢 → 聲
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    const st = await hookState(page)
    expect(st.playing).toBe(false)
    expect(st.plays).toBe(0)
    expect(await cursor(page)).toBe(c)
    expect(await followStates(page)).toEqual(expectedStates(c))
    await page.clock.runFor(2000)
    expect(await cursor(page)).toBe(c)
    expect((await hookState(page)).playing).toBe(false)

    await startVoice(page)
    expect(await cursor(page)).toBe(c)
    expect(Math.abs((await hookTime(page)) - tm.chars[c])).toBeLessThanOrEqual(TOL)
    expect((await hookState(page)).playing).toBe(true)
  })
})

// ===========================================================================
// Smoke test with the REAL media element (no fake): the published recording loads and plays.
// Autoplay: the element is muted, which Chromium always allows without a user gesture.
// ===========================================================================
test.describe('REQ-RDR-038 recording smoke test (real element)', () => {
  test('[REQ-RDR-038] data/voice.mp3 loads (duration within 0.1s of the timings) and play() resolves', async ({ page }) => {
    const tm = timings()
    await gotoReader(page)
    const result = await page.evaluate(async () => {
      const audio = new Audio('data/voice.mp3')
      audio.muted = true
      audio.preload = 'auto'
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('loadedmetadata timeout')), 15000)
        audio.addEventListener('loadedmetadata', () => {
          clearTimeout(timer)
          resolve()
        })
        audio.addEventListener('error', () => {
          clearTimeout(timer)
          reject(new Error('audio error ' + (audio.error?.code ?? '?')))
        })
      })
      const duration = audio.duration
      await audio.play()
      const started = !audio.paused
      audio.pause()
      return { duration, started }
    })
    expect(Math.abs(result.duration - tm.duration)).toBeLessThanOrEqual(0.1)
    expect(result.started).toBe(true)
  })
})
