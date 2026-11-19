import fs from 'node:fs'
import path from 'node:path'
import type { Locator, Page } from '@playwright/test'
import {
  AST,
  collectPageErrors,
  expect,
  expectCoverAligned,
  expectPageAligned,
  gotoCover,
  gotoReader,
  installDeviceStubs,
  pageRight,
  seedPrefs,
  test,
  vibrateCalls,
  viewportSize,
} from './helpers'

// ---------------------------------------------------------------------------
// REQ-RDR-042 長按結束隨誦: pressing and holding follow-toggle for 600ms ends the follow-along
// (like REQ-RDR-037) and vibrates once; releasing afterwards is not a click. Time is the fake page.clock,
// the recording (聲 mode) is the fake media element used by voice.spec.ts.
// ---------------------------------------------------------------------------

interface Timings { duration: number; title: { start: number; end: number }; chars: number[] }
const timings = (): Timings =>
  JSON.parse(fs.readFileSync(path.join(process.cwd(), 'public/data/voice-timings.json'), 'utf8')) as Timings

interface VoiceHook { time(): number; playing: boolean; plays: number[] }
const hookTime = (page: Page): Promise<number> =>
  page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.time())
const hookPlaying = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __voice: VoiceHook }).__voice.playing)

/** Fake media clock (same approach as voice.spec.ts): position derives from Date.now(), so page.clock drives it. */
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
    const hook = { plays: [] as number[], playing: false, time: () => (last ? posOf(last) : 0) }
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
// Model of the sutra
// ---------------------------------------------------------------------------
interface Cell { punct: boolean; seg: string }
const CELLS: Cell[] = AST.segments.flatMap((s) =>
  s.tokens.flatMap((t): Cell[] =>
    t.punct ? [...t.t].map(() => ({ punct: true, seg: s.id })) : (t.chars ?? []).map(() => ({ punct: false, seg: s.id })),
  ),
)
const CHAR_OF_CELL: number[] = (() => {
  let n = -1
  return CELLS.map((c) => (c.punct ? -1 : ++n))
})()
const SEG_START: Record<string, number> = {}
CELLS.forEach((c, ci) => {
  if (!c.punct && !(c.seg in SEG_START)) SEG_START[c.seg] = CHAR_OF_CELL[ci]
})
const TOL = 0.06

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
const toggleBtn = (page: Page): Locator => page.locator('button[data-testid="follow-toggle"]')
const paceBtn = (page: Page): Locator => page.locator('button[data-testid="follow-pace"]')
const progressEl = (page: Page): Locator => page.locator('[data-testid="follow-progress"]')

async function cursor(page: Page): Promise<number> {
  const states = await page.evaluate(() => [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => c.getAttribute('data-follow')))
  expect(states.length).toBe(CELLS.length)
  const cur = states.map((s, i) => (s === 'current' ? i : -1)).filter((i) => i >= 0)
  if (cur.length === 0) return -1
  expect(cur.length).toBe(1)
  return CHAR_OF_CELL[cur[0]]
}

async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)
}

interface BootOpts { cover?: boolean; progress?: string; voice?: boolean; pace?: string; vibrate?: 'record' | 'absent' }

async function boot(page: Page, opts: BootOpts = {}): Promise<void> {
  await installDeviceStubs(page, { vibrate: opts.vibrate ?? 'record' })
  if (opts.voice) await installFakeAudio(page)
  await page.clock.install()
  if (opts.progress) {
    await seedPrefs(page, { peek: true, progress: opts.progress })
    await gotoReader(page)
    await expectPageAligned(page, opts.progress)
  } else if (opts.cover) await gotoCover(page)
  else await gotoReader(page)
  await freezeClock(page)
  const want = opts.voice ? '聲' : opts.pace
  if (want) {
    for (let i = 0; i < 4 && (await paceBtn(page).textContent())?.trim() !== want; i++) await paceBtn(page).click()
    await expect(paceBtn(page)).toHaveText(want)
  }
}

/** Press 誦 until it turns 停 (retries while the recording is still loading). */
async function startFollow(page: Page): Promise<void> {
  for (let i = 0; i < 30; i++) {
    if ((await toggleBtn(page).textContent())?.trim() === '停') return
    await toggleBtn(page).click()
    await page.waitForTimeout(100)
  }
  await expect(toggleBtn(page)).toHaveText('停')
}

async function advanceTo(page: Page, t: number): Promise<void> {
  for (let guard = 0; guard < 2000; guard++) {
    const cur = await hookTime(page)
    if (cur >= t - 1e-6) return
    await page.clock.runFor(Math.min(250, Math.max(1, Math.ceil((t - cur) * 1000))))
  }
  throw new Error(`audio never reached ${t}s`)
}

async function centre(loc: Locator): Promise<{ x: number; y: number }> {
  const box = await loc.boundingBox()
  if (!box) throw new Error('no bounding box')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** Pointer down over follow-toggle, then `ms` of fake time while still held. The caller releases with release(). */
async function pressAndHold(page: Page, ms: number): Promise<void> {
  const { x, y } = await centre(toggleBtn(page))
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.clock.runFor(ms)
}
const release = (page: Page): Promise<void> => page.mouse.up()

async function expectEnded(page: Page): Promise<void> {
  await expect(toggleBtn(page)).toHaveText('誦')
  await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
  expect(await page.locator('[data-follow]').count()).toBe(0)
  await expect(progressEl(page)).toHaveCount(0)
}

const vibrateCount = async (page: Page): Promise<number> => (await vibrateCalls(page)).length

async function describedText(page: Page): Promise<string | null> {
  return toggleBtn(page).evaluate((el) => {
    const id = el.getAttribute('aria-describedby')
    if (id === null) return null
    return id
      .split(/\s+/)
      .map((i) => document.getElementById(i)?.textContent ?? '')
      .join(' ')
      .trim()
  })
}

// ===========================================================================
test.describe('REQ-RDR-042 長按結束隨誦', () => {
  test('[REQ-RDR-042] holding 誦/停 for 600ms while playing ends the follow-along (like REQ-RDR-037) and stays on the current page', async ({ page }) => {
    await boot(page, { progress: 's2', pace: '快' })
    await startFollow(page)
    await page.clock.runFor(450)
    expect(await cursor(page)).toBeGreaterThanOrEqual(SEG_START.s2)
    await pressAndHold(page, 650)
    await expectEnded(page)
    await release(page)
    await page.clock.runFor(3000)
    await expectEnded(page)
    await expectPageAligned(page, 's2')
  })

  test('[REQ-RDR-042] holding while paused (data-follow kept) ends the follow-along too', async ({ page }) => {
    await boot(page, { pace: '中' })
    await startFollow(page)
    await page.clock.runFor(700)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    await pressAndHold(page, 650)
    await expectEnded(page)
    await release(page)
    await expectEnded(page)
  })

  test('[REQ-RDR-042] ending calls navigator.vibrate(12) exactly once; releasing does not vibrate again', async ({ page }) => {
    await boot(page, { pace: '中' })
    await startFollow(page)
    await page.clock.runFor(300)
    const before = await vibrateCount(page)
    await pressAndHold(page, 650)
    await expectEnded(page)
    expect((await vibrateCalls(page)).slice(before)).toEqual([[12]])
    await release(page)
    await page.clock.runFor(1000)
    expect((await vibrateCalls(page)).slice(before)).toEqual([[12]])
  })

  test('[REQ-RDR-042] without navigator.vibrate the long press still ends the follow-along, no exception', async ({ page }) => {
    const errors = collectPageErrors(page)
    await boot(page, { pace: '中', vibrate: 'absent' })
    await startFollow(page)
    await page.clock.runFor(300)
    await pressAndHold(page, 650)
    await expectEnded(page)
    await release(page)
    await page.clock.runFor(500)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-042] releasing after the long press is not a click: it does not restart the follow-along', async ({ page }) => {
    await boot(page, { pace: '中' })
    await startFollow(page)
    await page.clock.runFor(300)
    await pressAndHold(page, 650)
    await release(page)
    await page.clock.runFor(200)
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect(await page.locator('[data-follow]').count()).toBe(0)
    await expect(progressEl(page)).toHaveCount(0)
  })

  test('[REQ-RDR-042] a short press afterwards starts from the first character of the page in view', async ({ page }) => {
    await boot(page, { progress: 's3', pace: '快' })
    await startFollow(page)
    await page.clock.runFor(1000)
    expect(await cursor(page)).toBeGreaterThan(SEG_START.s3)
    await pressAndHold(page, 650)
    await release(page)
    await expectEnded(page)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s3)
  })

  test('[REQ-RDR-042] holding less than 600ms is a normal click: playing pauses, paused resumes, nothing ends', async ({ page }) => {
    await boot(page, { pace: '中' })
    await startFollow(page)
    await page.clock.runFor(500)
    const before = await vibrateCount(page)

    await pressAndHold(page, 400)
    await release(page)
    await expect(toggleBtn(page)).toHaveText('誦') // paused
    const paused = await cursor(page)
    expect(paused).toBeGreaterThanOrEqual(0)
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    await expect(progressEl(page)).toHaveCount(1)

    await pressAndHold(page, 400)
    await release(page)
    await expect(toggleBtn(page)).toHaveText('停') // resumed
    expect(await cursor(page)).toBe(paused)
    expect(await vibrateCount(page)).toBe(before)
    // and the long-press timer from the short presses must not end it later
    await page.clock.runFor(800)
    await expect(toggleBtn(page)).toHaveText('停')
  })

  test('[REQ-RDR-042] moving the pointer off the button while held (pointerleave) does not end the follow-along', async ({ page }) => {
    await boot(page, { pace: '慢' })
    await startFollow(page)
    const { x, y } = await centre(toggleBtn(page))
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.clock.runFor(200)
    await page.mouse.move(x - 160, y - 200, { steps: 4 })
    const before = await vibrateCount(page)
    await page.clock.runFor(900)
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    expect(await vibrateCount(page)).toBe(before)
    await release(page)
    await page.clock.runFor(300)
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
  })

  test('[REQ-RDR-042] pointercancel while held does not end the follow-along', async ({ page }) => {
    await boot(page, { pace: '慢' })
    await startFollow(page)
    const { x, y } = await centre(toggleBtn(page))
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.clock.runFor(200)
    await toggleBtn(page).evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: 1, pointerType: 'mouse' }))
    })
    const before = await vibrateCount(page)
    await page.clock.runFor(900)
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    expect(await vibrateCount(page)).toBe(before)
    await release(page)
    await page.clock.runFor(200)
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
  })

  test('[REQ-RDR-042] a touch long press (real touch events) ends the follow-along and the release does not restart it', async ({ page }) => {
    await boot(page, { pace: '中' })
    await startFollow(page)
    await page.clock.runFor(300)
    const before = await vibrateCount(page)
    const { x, y } = await centre(toggleBtn(page))
    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] })
    await page.clock.runFor(700)
    await expectEnded(page)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await cdp.detach()
    await page.clock.runFor(300)
    await expectEnded(page)
    expect((await vibrateCalls(page)).slice(before)).toEqual([[12]])
  })

  test('[REQ-RDR-042] when not following, holding for 600ms+ then releasing starts the follow-along like a click, without vibrating', async ({ page }) => {
    await boot(page, { pace: '中' })
    await expect(toggleBtn(page)).toHaveText('誦')
    const before = await vibrateCount(page)
    await pressAndHold(page, 800)
    await release(page)
    await expect(toggleBtn(page)).toHaveText('停')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'true')
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    expect(await vibrateCount(page)).toBe(before)
  })

  test('[REQ-RDR-042] after the follow-along has finished (last character), holding 600ms+ starts it again, without vibrating', async ({ page }) => {
    await boot(page, { progress: 's9', pace: '快' })
    await startFollow(page)
    await page.clock.runFor(60_000)
    await expectEnded(page)
    const before = await vibrateCount(page)
    await pressAndHold(page, 800)
    await release(page)
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s9)
    expect(await vibrateCount(page)).toBe(before)
  })

  test('[REQ-RDR-042] aria-describedby points to 長按結束隨誦 only while following (playing or paused); aria-label is unchanged', async ({ page }) => {
    await boot(page, { pace: '中' })
    await expect(toggleBtn(page)).not.toHaveAttribute('aria-describedby', /.+/)
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '開始隨誦')
    await startFollow(page)
    expect(await describedText(page)).toBe('長按結束隨誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '暫停隨誦')
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    expect(await describedText(page)).toBe('長按結束隨誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '開始隨誦')
    await pressAndHold(page, 650)
    await release(page)
    await expectEnded(page)
    expect(await toggleBtn(page).getAttribute('aria-describedby')).toBeNull()
  })
})

// ===========================================================================
test.describe('REQ-RDR-042 長按結束隨誦 (聲 mode)', () => {
  test('[REQ-RDR-042] in the 聲 title stage a long press ends the follow-along: the recording pauses, the cover stays, 誦 / aria-pressed false, one vibrate', async ({ page }) => {
    const tm = timings()
    await boot(page, { cover: true, voice: true })
    await startFollow(page)
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'true')
    expect(Math.abs((await hookTime(page)) - tm.title.start)).toBeLessThanOrEqual(TOL)
    expect(await page.locator('[data-follow]').count()).toBe(0) // title stage: no cursor yet
    expect(await describedText(page)).toBe('長按結束隨誦')
    await advanceTo(page, (tm.title.start + tm.chars[0]) / 2)
    const before = await vibrateCount(page)
    await pressAndHold(page, 650)
    await expectEnded(page)
    expect(await hookPlaying(page)).toBe(false)
    expect((await vibrateCalls(page)).slice(before)).toEqual([[12]])
    await release(page)
    await page.clock.runFor(2000)
    await expectEnded(page)
    expect(await hookPlaying(page)).toBe(false)
    await expectCoverAligned(page)
    expect(await toggleBtn(page).getAttribute('aria-describedby')).toBeNull()

    // a short press now follows the cover rule of REQ-RDR-038: the title plays again from title.start
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(Math.abs((await hookTime(page)) - tm.title.start)).toBeLessThanOrEqual(TOL)
    expect(await hookPlaying(page)).toBe(true)
  })

  test('[REQ-RDR-042] while the recording follows the text, a long press pauses the recording, removes data-follow and does not turn the page', async ({ page }) => {
    const tm = timings()
    await boot(page, { progress: 's2', voice: true })
    await startFollow(page)
    expect(Math.abs((await hookTime(page)) - tm.chars[SEG_START.s2])).toBeLessThanOrEqual(TOL)
    await advanceTo(page, tm.chars[SEG_START.s2 + 2] + 0.05)
    expect(await hookPlaying(page)).toBe(true)
    await pressAndHold(page, 650)
    await expectEnded(page)
    expect(await hookPlaying(page)).toBe(false)
    await release(page)
    await page.clock.runFor(3000)
    await expectEnded(page)
    expect(await hookPlaying(page)).toBe(false)
    const { w } = await viewportSize(page)
    expect(Math.abs((await pageRight(page, 's2')) - w)).toBeLessThanOrEqual(1.5)

    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s2)
    expect(Math.abs((await hookTime(page)) - tm.chars[SEG_START.s2])).toBeLessThanOrEqual(TOL)
  })
})
