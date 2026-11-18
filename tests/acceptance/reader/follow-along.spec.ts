import type { Locator, Page } from '@playwright/test'
import {
  AST,
  AMBER_500,
  EASE_ZEN,
  STONE_900_80,
  closeOverlay,
  closeTo,
  colorOf,
  expect,
  expectCoverAligned,
  expectPageAligned,
  firstFamily,
  gotoCover,
  gotoCoverWithPeek,
  gotoReader,
  lexToken,
  openLexicon,
  openVernacular,
  pageEl,
  pageRight,
  readPref,
  styleOf,
  swipeToNextPage,
  test,
  toggle,
  viewportSize,
} from './helpers'

// ---------------------------------------------------------------------------
// Model of the sutra, derived from the data product (never hard-coded)
// ---------------------------------------------------------------------------
const STONE_400: [number, number, number, number] = [168, 162, 158, 1] // #a8a29e
const STONE_200: [number, number, number, number] = [231, 229, 228, 1] // #e7e5e4
const EXTRA_BEATS: Record<string, number> = { '，': 1, '：': 1, '。': 2, '；': 2, '！': 2 }
const PACES = { 慢: 60, 中: 100, 快: 150 } as const
type PaceLabel = keyof typeof PACES
const beatMs = (label: PaceLabel): number => 60000 / PACES[label]

interface Cell { ch: string; punct: boolean; seg: string }
const CELLS: Cell[] = AST.segments.flatMap((s) =>
  s.tokens.flatMap((t): Cell[] =>
    t.punct
      ? [...t.t].map((ch) => ({ ch, punct: true, seg: s.id }))
      : (t.chars ?? []).map((c) => ({ ch: c.c, punct: false, seg: s.id })),
  ),
)
/** index (among all cells) of every non-punctuation character, in reading order */
const CELL_OF_CHAR: number[] = CELLS.flatMap((c, i) => (c.punct ? [] : [i]))
const CHAR_OF_CELL: number[] = (() => {
  let n = -1
  return CELLS.map((c) => (c.punct ? -1 : ++n))
})()
const CHAR_COUNT = CELL_OF_CHAR.length // 260
/** beats of character i: 1 + the extra beats of the punctuation that directly follows it */
const BEATS: number[] = CELL_OF_CHAR.map((ci) => {
  const next = CELLS[ci + 1]
  return 1 + (next?.punct ? (EXTRA_BEATS[next.ch] ?? 0) : 0)
})
/** PRE[i] = beats spent before character i starts */
const PRE: number[] = BEATS.map((_, i) => BEATS.slice(0, i).reduce((a, b) => a + b, 0))
const TOTAL_BEATS = BEATS.reduce((a, b) => a + b, 0)
const SEG_START: Record<string, number> = {}
CELL_OF_CHAR.forEach((ci, i) => {
  if (!(CELLS[ci].seg in SEG_START)) SEG_START[CELLS[ci].seg] = i
})
const SEG_OF_CHAR = (i: number): string => CELLS[CELL_OF_CHAR[i]].seg

/** first character index (per distinct punctuation mark) of a character directly followed by that mark */
const CHAR_BEFORE_PUNCT: number[] = (() => {
  const seen = new Set<string>()
  const out: number[] = []
  CELL_OF_CHAR.forEach((ci, i) => {
    const next = CELLS[ci + 1]
    if (next?.punct && !seen.has(next.ch)) {
      seen.add(next.ch)
      out.push(i)
    }
  })
  return out
})()

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------
const toggleBtn = (page: Page): Locator => page.locator('button[data-testid="follow-toggle"]')
const paceBtn = (page: Page): Locator => page.locator('button[data-testid="follow-pace"]')
const progressEl = (page: Page): Locator => page.locator('[data-testid="follow-progress"]')

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)

/** Freeze the fake clock at (roughly) the current time; from here only page.clock.runFor moves time. */
async function freezeClock(page: Page): Promise<void> {
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)
}

interface BootOpts { cover?: boolean; progress?: string; pace?: PaceLabel }

/** Fake clock installed before navigation, reader loaded, clock frozen. */
async function boot(page: Page, opts: BootOpts = {}): Promise<void> {
  await page.clock.install()
  if (opts.progress) await gotoCoverWithPeek(page, { progress: opts.progress })
  else if (opts.cover) await gotoCover(page)
  else await gotoReader(page)
  if (opts.progress) await expectPageAligned(page, opts.progress)
  await freezeClock(page)
  if (opts.pace) await setPace(page, opts.pace)
}

async function setPace(page: Page, label: PaceLabel): Promise<void> {
  for (let i = 0; i < 4; i++) {
    if ((await paceBtn(page).textContent())?.trim() === label) return
    await paceBtn(page).click()
  }
  await expect(paceBtn(page)).toHaveText(label)
}

/** Run `fn` while the frozen clock is advanced in small steps (for UI that needs timers: sheets, scroll-end, ...). */
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

async function followStates(page: Page): Promise<(string | null)[]> {
  return page.evaluate(() => [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => c.getAttribute('data-follow')))
}

/** Index of the current character among the 260 characters; -1 when there is none. */
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

async function start(page: Page): Promise<void> {
  await toggleBtn(page).click()
  await expect(toggleBtn(page)).toHaveText('停')
}

/** Poll (advancing the clock a little each time) until page `seg` is aligned; returns the elapsed real ms. */
async function waitAligned(page: Page, seg: string, limitMs = 6000, probe?: () => Promise<void>): Promise<number> {
  const { w } = await viewportSize(page)
  const t0 = Date.now()
  for (;;) {
    if (probe) await probe()
    const r = await pageRight(page, seg)
    if (Math.abs(r - w) <= 1.5) return Date.now() - t0
    if (Date.now() - t0 > limitMs) throw new Error(`page ${seg} not aligned within ${limitMs}ms (right=${r}, w=${w})`)
    await page.clock.runFor(16)
    await page.waitForTimeout(16)
  }
}

const timeAxis = (page: Page) => {
  let t = 0
  return async (ms: number) => {
    await page.clock.runFor(Math.max(0, ms - t))
    t = Math.max(t, ms)
  }
}

interface Box { left: number; top: number; width: number; height: number }
const rectOf = (loc: Locator) =>
  loc.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }
  })

/** every .cell box relative to its own sutra page, so scrolling does not count as a shift */
const cellBoxes = (page: Page): Promise<Box[]> =>
  page.evaluate(() =>
    [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => {
      const p = c.closest('[data-testid="sutra-page"]')!.getBoundingClientRect()
      const r = c.getBoundingClientRect()
      return { left: r.left - p.left, top: r.top - p.top, width: r.width, height: r.height }
    }),
  )

async function seedFollowPace(page: Page, value: unknown): Promise<void> {
  await page.addInitScript((v) => {
    const open = indexedDB.open('sutraflow', 10)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('prefs')) open.result.createObjectStore('prefs', { keyPath: 'key' })
    }
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('prefs')) { db.close(); return }
      db.transaction('prefs', 'readwrite').objectStore('prefs').put({ key: 'followPace', value: v })
      db.close()
    }
  }, value)
}

const colorsClose = (a: number[], b: number[], tol = 2) => closeTo(a, b, tol)

// ===========================================================================
// REQ-RDR-032 controls
// ===========================================================================
function geometryTests(label: string): void {
  for (const where of ['cover', 'reading'] as const) {
    test(`[REQ-RDR-032] (${label}, ${where}) both keys exist, are fixed, bottom-aligned with the phonetic pill, 16px from the right edge, 8px apart, 44x44`, async ({ page }) => {
      if (where === 'cover') await gotoCover(page)
      else await gotoReader(page)
      await expect(toggleBtn(page)).toHaveCount(1)
      await expect(paceBtn(page)).toHaveCount(1)
      expect(await styleOf(toggleBtn(page), 'position')).toBe('fixed')
      expect(await styleOf(paceBtn(page), 'position')).toBe('fixed')
      const { w } = await viewportSize(page)
      const pill = await rectOf(toggle(page))
      const ft = await rectOf(toggleBtn(page))
      const fp = await rectOf(paceBtn(page))
      expect(Math.abs(ft.bottom - pill.bottom)).toBeLessThanOrEqual(1)
      expect(Math.abs(fp.bottom - pill.bottom)).toBeLessThanOrEqual(1)
      expect(Math.abs(w - 16 - ft.right)).toBeLessThanOrEqual(1)
      expect(Math.abs(ft.left - fp.right - 8)).toBeLessThanOrEqual(1)
      for (const r of [ft, fp]) {
        expect(Math.abs(r.width - 44)).toBeLessThanOrEqual(0.6)
        expect(Math.abs(r.height - 44)).toBeLessThanOrEqual(0.6)
      }
    })

    test(`[REQ-RDR-032] (${label}, ${where}) the keys do not overlap the phonetic pill, the vernacular buttons or the swipe hint`, async ({ page }) => {
      if (where === 'cover') await gotoCover(page)
      else await gotoReader(page)
      await expect(toggleBtn(page)).toHaveCount(1)
      const hits = await page.evaluate(() => {
        const rects = (sel: string) => [...document.querySelectorAll(sel)].map((e) => ({ sel, r: e.getBoundingClientRect() }))
        const mine = [...rects('[data-testid="follow-toggle"]'), ...rects('[data-testid="follow-pace"]')]
        const others = [
          ...rects('[data-testid="phonetic-toggle"]'),
          ...rects('[data-testid="vernacular-toggle"]'),
          ...rects('[data-testid="swipe-hint"]'),
        ]
        const out: string[] = []
        for (const a of mine) for (const b of others) {
          const w = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left)
          const h = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top)
          if (w > 0.5 && h > 0.5) out.push(`${a.sel} overlaps ${b.sel} (${w.toFixed(1)}x${h.toFixed(1)})`)
        }
        return out
      })
      expect(hits).toEqual([])
    })
  }
}

test.describe('REQ-RDR-032 controls', () => {
  test.describe('Pixel 7 viewport', () => geometryTests('Pixel 7'))
  test.describe('360x640 viewport', () => {
    test.use({ viewport: { width: 360, height: 640 } })
    geometryTests('360x640')
  })

  test('[REQ-RDR-032] pill look: 44x44 round, stone-900 80% background, backdrop blur, same border as the phonetic pill, Noto Sans TC weight 300-400', async ({ page }) => {
    await gotoReader(page)
    for (const btn of [toggleBtn(page), paceBtn(page)]) {
      await expect(btn).toHaveCount(1)
      const radius = parseFloat(await styleOf(btn, 'border-top-left-radius'))
      expect(radius).toBeGreaterThanOrEqual(22)
      expect(closeTo(await colorOf(btn, 'background-color'), STONE_900_80, 3, 0.03)).toBe(true)
      const blur = await btn.evaluate((el) => {
        const cs = getComputedStyle(el) as CSSStyleDeclaration & { webkitBackdropFilter?: string }
        return cs.backdropFilter || cs.webkitBackdropFilter || ''
      })
      expect(blur).toMatch(/blur\((?!0(px)?\))/)
      for (const side of ['top', 'right', 'bottom', 'left']) {
        expect(await styleOf(btn, `border-${side}-width`)).toBe(await styleOf(toggle(page), `border-${side}-width`))
        expect(await styleOf(btn, `border-${side}-style`)).toBe(await styleOf(toggle(page), `border-${side}-style`))
        expect(await colorOf(btn, `border-${side}-color`)).toEqual(await colorOf(toggle(page), `border-${side}-color`))
      }
      expect(firstFamily(await styleOf(btn, 'font-family'))).toBe('Noto Sans TC')
      const raw = await styleOf(btn, 'font-weight')
      const weight = raw === 'normal' ? 400 : raw === 'bold' ? 700 : parseInt(raw, 10)
      expect(weight).toBeGreaterThanOrEqual(300)
      expect(weight).toBeLessThanOrEqual(400)
    }
  })

  test('[REQ-RDR-032] follow-toggle: idle shows 誦 / aria-pressed=false / 開始隨誦; playing shows 停 / true / 暫停隨誦', async ({ page }) => {
    await boot(page)
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '開始隨誦')
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'true')
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '暫停隨誦')
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    await expect(toggleBtn(page)).toHaveAttribute('aria-label', '開始隨誦')
  })

  test('[REQ-RDR-032] follow-pace shows 中 / 每分鐘 100 字 by default and cycles 中 → 快 → 慢 → 中', async ({ page }) => {
    await gotoReader(page)
    const expected: [string, number][] = [['中', 100], ['快', 150], ['慢', 60], ['中', 100]]
    for (const [i, [text, n]] of expected.entries()) {
      if (i > 0) await paceBtn(page).click()
      await expect(paceBtn(page)).toHaveText(text)
      await expect(paceBtn(page)).toHaveAttribute('aria-label', `隨誦速度：每分鐘 ${n} 字`)
    }
  })

  test('[REQ-RDR-032] the pace is saved in IndexedDB prefs under followPace as the strings "150" / "60" / "100" and restored after reload', async ({ page }) => {
    await gotoReader(page)
    const steps: [string, string][] = [['快', '150'], ['慢', '60'], ['中', '100']]
    for (const [text, value] of steps) {
      await paceBtn(page).click()
      await expect(paceBtn(page)).toHaveText(text)
      await expect.poll(async () => ((await readPref(page, 'followPace')) as { value?: unknown } | null)?.value).toBe(value)
    }
    await paceBtn(page).click() // 快
    await expect.poll(async () => ((await readPref(page, 'followPace')) as { value?: unknown } | null)?.value).toBe('150')
    await page.reload()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await expect(paceBtn(page)).toHaveText('快')
    await expect(paceBtn(page)).toHaveAttribute('aria-label', '隨誦速度：每分鐘 150 字')
  })

  test('[REQ-RDR-032] a stored followPace of "60" is restored as 慢', async ({ page }) => {
    await seedFollowPace(page, '60')
    await gotoReader(page)
    await expect(paceBtn(page)).toHaveText('慢')
  })

  for (const bad of ['999', 'fast', '', 100, null]) {
    test(`[REQ-RDR-032] an invalid stored followPace (${JSON.stringify(bad)}) falls back to 100 (中)`, async ({ page }) => {
      await seedFollowPace(page, bad)
      await gotoReader(page)
      await expect(paceBtn(page)).toHaveText('中')
      await expect(paceBtn(page)).toHaveAttribute('aria-label', '隨誦速度：每分鐘 100 字')
    })
  }

  test('[REQ-RDR-032] changing the pace while playing takes effect from the next beat', async ({ page }) => {
    await boot(page) // 中: 600ms per beat
    await start(page)
    expect(await cursor(page)).toBe(0)
    await page.clock.runFor(300)
    await paceBtn(page).click() // 中 → 快 (400ms per beat)
    await expect(paceBtn(page)).toHaveText('快')
    await page.clock.runFor(250) // t = 550: first beat (old speed) still running
    expect(await cursor(page)).toBe(0)
    await page.clock.runFor(100) // t = 650: first beat done at the old 600ms, now in beat 2
    expect(await cursor(page)).toBe(1)
    await page.clock.runFor(300) // t = 950: beat 2 lasts 400ms at the new speed (ends at 1000)
    expect(await cursor(page)).toBe(1)
    await page.clock.runFor(100) // t = 1050
    expect(await cursor(page)).toBe(2)
  })
})

// ===========================================================================
// REQ-RDR-033 beats and per-character colours
// ===========================================================================
test.describe('REQ-RDR-033 beats and colours', () => {
  test('[REQ-RDR-033] the DOM has one .cell per sutra character and punctuation mark, none carries data-follow before playing', async ({ page }) => {
    await boot(page)
    const texts = await page.evaluate(() =>
      [...document.querySelectorAll('.cell, [data-testid="punct"]')].map((c) => {
        const k = c.cloneNode(true) as Element
        k.querySelectorAll('rt, rp').forEach((x) => x.remove())
        return k.textContent
      }),
    )
    expect(texts).toEqual(CELLS.map((c) => c.ch))
    expect(await page.locator('[data-follow]').count()).toBe(0)
    await expect(progressEl(page)).toHaveCount(0)
    await start(page)
    expect(await cursor(page)).toBe(0)
  })

  test('[REQ-RDR-033] at 中 the first character of s1 is current, and turns read after 600ms', async ({ page }) => {
    await boot(page)
    await start(page)
    expect(await cursor(page)).toBe(0)
    await page.clock.runFor(550)
    expect(await cursor(page)).toBe(0)
    await page.clock.runFor(100)
    expect(await cursor(page)).toBe(1)
    expect((await followStates(page))[0]).toBe('read')
  })

  for (const [label, ms] of [['慢', 1000], ['快', 400]] as const) {
    test(`[REQ-RDR-033] at ${label} a character stays ${ms}ms`, async ({ page }) => {
      await boot(page, { pace: label })
      await start(page)
      await page.clock.runFor(ms - 60)
      expect(await cursor(page)).toBe(0)
      await page.clock.runFor(120)
      expect(await cursor(page)).toBe(1)
    })
  }

  test('[REQ-RDR-033] a character followed by ，or ：stays 2 beats, by 。；！ stays 3 beats, every other character 1 beat (快)', async ({ page }) => {
    expect(CHAR_BEFORE_PUNCT.length).toBe(Object.keys(EXTRA_BEATS).length)
    test.setTimeout(60_000)
    await boot(page, { pace: '快' })
    await start(page)
    const B = beatMs('快')
    const to = timeAxis(page)
    const targets = [...new Set([0, ...CHAR_BEFORE_PUNCT])].sort((a, b) => a - b)
    for (const i of targets) {
      const t0 = PRE[i] * B
      const n = BEATS[i]
      await to(t0 + 0.5 * B)
      expect(await cursor(page), `char ${i} at start of its beats`).toBe(i)
      await to(t0 + (n - 0.5) * B)
      expect(await cursor(page), `char ${i} (${n} beats) still current near the end`).toBe(i)
      await to(t0 + (n + 0.5) * B)
      expect(await cursor(page), `char ${i} (${n} beats) is over`).toBe(i + 1)
    }
  })

  test('[REQ-RDR-033] data-follow marks cells before the cursor read, the cursor current, the rest ahead; punctuation follows the character before it; the marks stay when paused', async ({ page }) => {
    await boot(page, { pace: '快' })
    await start(page)
    const B = beatMs('快')
    const to = timeAxis(page)
    const firstPunctChar = CHAR_BEFORE_PUNCT[0]
    const cursors = [0, firstPunctChar, firstPunctChar + 1, 60]
    for (const c of cursors) {
      await to(PRE[c] * B + 0.5 * B)
      expect(await cursor(page)).toBe(c)
      expect(await followStates(page)).toEqual(expectedStates(c))
    }
    await toggleBtn(page).click() // pause
    await expect(toggleBtn(page)).toHaveText('誦')
    expect(await followStates(page)).toEqual(expectedStates(60))
    await page.clock.runFor(5000)
    expect(await followStates(page)).toEqual(expectedStates(60))
  })

  test('[REQ-RDR-033] ahead text is stone-400, read and current text is stone-200, ruby text colour is untouched', async ({ page }) => {
    await boot(page, { pace: '快' })
    const cells = page.locator('.cell, [data-testid="punct"]')
    const rtOf = (i: number) => cells.nth(CELL_OF_CHAR[i]).locator('rt').first()
    const rtBefore = [await colorOf(rtOf(0), 'color'), await colorOf(rtOf(40), 'color')]
    await start(page)
    await page.clock.runFor(PRE[5] * beatMs('快') + 100) // cursor on character 5 (character 4 is followed by ，: 2 beats)
    expect(await cursor(page)).toBe(5)
    const cellOf = (i: number) => cells.nth(CELL_OF_CHAR[i])
    await expect(async () => {
      expect(colorsClose(await colorOf(cellOf(0), 'color'), STONE_200)).toBe(true)
      expect(colorsClose(await colorOf(cellOf(5), 'color'), STONE_200)).toBe(true)
      expect(colorsClose(await colorOf(cellOf(6), 'color'), STONE_400)).toBe(true)
      expect(colorsClose(await colorOf(cellOf(40), 'color'), STONE_400)).toBe(true)
    }).toPass({ timeout: 3000 })
    expect(colorsClose(await colorOf(rtOf(0), 'color'), rtBefore[0], 1)).toBe(true)
    expect(colorsClose(await colorOf(rtOf(40), 'color'), rtBefore[1], 1)).toBe(true)
  })

  test('[REQ-RDR-033] the current cell has a 1px amber-500 line on its left, as long as the cell, clear of the <rt>', async ({ page }) => {
    await boot(page, { pace: '快' })
    await start(page)
    await page.clock.runFor(PRE[5] * beatMs('快') + 100) // cursor on character 5
    expect(await cursor(page)).toBe(5)
    const cell = page.locator('.cell, [data-testid="punct"]').nth(CELL_OF_CHAR[5])
    const info = await cell.evaluate((el) => {
      const T = (window as unknown as { __t: { rgba: (c: string) => number[] } }).__t
      const cs = getComputedStyle(el, '::after')
      const r = el.getBoundingClientRect()
      const rt = el.querySelector('rt')
      const rtr = rt ? rt.getBoundingClientRect() : null
      const borders = ['top', 'right', 'bottom', 'left'].map((s) => ({
        side: s,
        w: parseFloat(cs.getPropertyValue(`border-${s}-width`)) || 0,
        style: cs.getPropertyValue(`border-${s}-style`),
        color: T.rgba(cs.getPropertyValue(`border-${s}-color`)),
      }))
      return {
        content: cs.content,
        position: cs.position,
        width: parseFloat(cs.width),
        height: parseFloat(cs.height),
        left: cs.left,
        right: cs.right,
        bg: T.rgba(cs.backgroundColor),
        borders,
        cell: { left: r.left, right: r.right, width: r.width, height: r.height },
        rtLeft: rtr ? rtr.left : null,
      }
    })
    expect(info.content, 'the ::after must be generated').not.toBe('none')
    expect(info.content).not.toBe('normal')
    expect(['absolute', 'fixed']).toContain(info.position)
    const solidBg = info.bg[3] > 0
    if (solidBg) {
      expect(Math.abs(info.width - 1)).toBeLessThanOrEqual(0.05)
      expect(colorsClose(info.bg, AMBER_500, 2)).toBe(true)
    } else {
      const line = info.borders.filter((b) => b.w > 0 && b.style !== 'none')
      expect(line.length).toBeGreaterThan(0)
      expect(line.every((b) => Math.abs(b.w - 1) <= 0.05 && colorsClose(b.color, AMBER_500, 2))).toBe(true)
    }
    expect(Math.abs(info.height - info.cell.height)).toBeLessThanOrEqual(1.5)
    // x-extent of the line, from whichever of left / right is resolved to px
    const lineW = info.width > 0 ? info.width : 1
    const left = parseFloat(info.left)
    const right = parseFloat(info.right)
    expect(Number.isFinite(left) || Number.isFinite(right), `left "${info.left}" / right "${info.right}"`).toBe(true)
    const x0 = Number.isFinite(left) ? info.cell.left + left : info.cell.right - right - lineW
    const x1 = x0 + lineW
    // left of the glyph: its centre is in the left half of the cell
    expect(x0 + lineW / 2).toBeLessThanOrEqual(info.cell.left + info.cell.width * 0.5)
    // but it must not reach into the neighbouring column on the left
    expect(x0).toBeGreaterThanOrEqual(info.cell.left - info.cell.width)
    // clear of the <rt> (which sits to the right of the glyph in vertical text)
    if (info.rtLeft !== null) expect(x1).toBeLessThanOrEqual(info.rtLeft + 0.5)
  })

  test('[REQ-RDR-033] the colour transition is at most 0.3s with the zen easing', async ({ page }) => {
    await boot(page)
    await start(page)
    const t = await page.locator('.cell, [data-testid="punct"]').nth(CELL_OF_CHAR[3]).evaluate((el) => {
      const cs = getComputedStyle(el)
      const sec = (s: string) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s))
      const props = cs.transitionProperty.split(',').map((s) => s.trim())
      const durs = cs.transitionDuration.split(',').map(sec)
      const fns = cs.transitionTimingFunction.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|ease-in-out|ease-in|ease-out|ease|linear/g) ?? []
      const i = props.findIndex((p) => p === 'color' || p === 'all')
      return i < 0 ? null : { dur: durs[i % durs.length], fn: (fns[i % Math.max(fns.length, 1)] ?? '').replace(/\s+/g, '') }
    })
    expect(t, 'a transition on color (or all) must exist on .cell').not.toBeNull()
    expect(t!.dur).toBeGreaterThan(0)
    expect(t!.dur).toBeLessThanOrEqual(0.3)
    expect(t!.fn).toBe(EASE_ZEN.replace(/\s+/g, ''))
  })

  test('[REQ-RDR-033] no .cell bounding box moves or resizes between idle, playing, paused (CLS = 0)', async ({ page }) => {
    await boot(page, { pace: '快' })
    const idle = await cellBoxes(page)
    await start(page)
    expect(await cellBoxes(page)).toEqual(idle)
    await page.clock.runFor(12 * beatMs('快') + 100)
    expect(await cursor(page)).toBeGreaterThan(5)
    await page.waitForTimeout(500) // let the colour transitions run
    expect(await cellBoxes(page)).toEqual(idle)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    expect(await cellBoxes(page)).toEqual(idle)
  })
})

// ===========================================================================
// REQ-RDR-034 auto page turn
// ===========================================================================
/**
 * A running animation with the zen easing that belongs to the page turn: its target is the scroller, a sutra page / cover,
 * or a container of them, and NOT a character cell, a button or other chrome (the cells' colour transitions use the same easing).
 */
const turnEasingSeen = (page: Page): Promise<boolean> =>
  page.evaluate((want) => {
    const sq = (s: string) => s.replace(/\s+/g, '')
    const viewport = document.querySelector('[data-testid="sutra-viewport"]')
    return document.getAnimations().some((a) => {
      const eff = a.effect as KeyframeEffect | null
      const target = eff?.target as Element | null | undefined
      if (!eff || !target || !viewport) return false
      if (target.closest('.cell, [data-testid="punct"], button, [data-testid="follow-progress"]')) return false
      if (!(viewport.contains(target) || target.contains(viewport))) return false
      const list: string[] = []
      try { list.push(String(eff.getTiming().easing)) } catch { /* ignore */ }
      try { for (const k of eff.getKeyframes()) list.push(String(k.easing)) } catch { /* ignore */ }
      return list.some((e) => sq(e) === sq(want))
    })
  }, EASE_ZEN)

test.describe('REQ-RDR-034 auto page turn', () => {
  test('[REQ-RDR-034] when the cursor reaches the first character of the next page the fold turns: aligned (±1.5px) within 1.2s, with the zen easing', async ({ page }) => {
    await boot(page, { pace: '快' })
    await start(page)
    const B = beatMs('快')
    const next = SEG_START.s2
    await page.clock.runFor(PRE[next] * B - 150)
    expect(await cursor(page)).toBe(next - 1)
    await expectPageAligned(page, 's1')
    await page.clock.runFor(250)
    expect(await cursor(page)).toBe(next)
    let eased = false
    const elapsed = await waitAligned(page, 's2', 3000, async () => {
      eased = eased || (await turnEasingSeen(page))
    })
    expect(elapsed, 'turn duration (real ms)').toBeLessThanOrEqual(1300)
    expect(eased, 'a running page-turn animation (not a cell colour transition) with cubic-bezier(0.19, 1, 0.22, 1)').toBe(true)
    await page.waitForTimeout(150)
    const { w } = await viewportSize(page)
    expect(Math.abs((await pageRight(page, 's2')) - w)).toBeLessThanOrEqual(1.5)
  })

  test('[REQ-RDR-034] the turn is written to the reading progress and does not pause the playback', async ({ page }) => {
    await boot(page, { pace: '快' })
    await start(page)
    const B = beatMs('快')
    const next = SEG_START.s2
    await page.clock.runFor(PRE[next] * B + 100)
    await waitAligned(page, 's2', 3000)
    await expect
      .poll(async () => {
        await page.clock.runFor(100)
        return ((await readPref(page, 'progress')) as { value?: unknown } | null)?.value
      }, { timeout: 5000 })
      .toBe('s2')
    await expect(toggleBtn(page)).toHaveText('停')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'true')
    const before = await cursor(page)
    await page.clock.runFor(3 * B)
    expect(await cursor(page)).toBeGreaterThan(before)
    await expect(toggleBtn(page)).toHaveText('停')
  })

  test.describe('prefers-reduced-motion: reduce', () => {
    test.use({ reducedMotion: 'reduce' })

    test('[REQ-RDR-034] with reduced motion the next page is aligned within 100ms of the cursor arriving', async ({ page }) => {
      await boot(page, { pace: '快' })
      await start(page)
      const B = beatMs('快')
      const next = SEG_START.s2
      await page.clock.runFor(PRE[next] * B - 150)
      expect(await cursor(page)).toBe(next - 1)
      await page.clock.runFor(200) // cursor is now on the first character of s2 for ~50ms
      expect(await cursor(page)).toBe(next)
      await page.clock.runFor(50)
      await page.waitForTimeout(50)
      const { w } = await viewportSize(page)
      expect(Math.abs((await pageRight(page, 's2')) - w)).toBeLessThanOrEqual(1.5)
    })
  })
})

// ===========================================================================
// REQ-RDR-035 pause and resume
// ===========================================================================
test.describe('REQ-RDR-035 pause and resume', () => {
  async function playUntil(page: Page, c: number, pace: PaceLabel = '快'): Promise<void> {
    await start(page)
    await page.clock.runFor(PRE[c] * beatMs(pace) + 0.5 * beatMs(pace))
    expect(await cursor(page)).toBe(c)
  }

  async function expectPausedAt(page: Page, c: number): Promise<void> {
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect(await cursor(page)).toBe(c)
    expect(await followStates(page)).toEqual(expectedStates(c))
    await expect(progressEl(page)).toHaveCount(1)
    await page.clock.runFor(5000)
    expect(await cursor(page)).toBe(c)
  }

  test('[REQ-RDR-035] tapping 停 pauses: the cursor stops, data-follow and the progress line stay', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 4)
    await toggleBtn(page).click()
    await expectPausedAt(page, 4)
  })

  test('[REQ-RDR-035] opening a lexicon drawer pauses; closing it does not resume', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 2)
    await withTicking(page, async () => {
      await openLexicon(page, '觀自在')
    })
    await expect(toggleBtn(page)).toHaveText('誦')
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(2)
    await expectPausedAt(page, c)
    await withTicking(page, () => closeOverlay(page))
    await page.clock.runFor(5000)
    await expectPausedAt(page, c)
  })

  test('[REQ-RDR-035] opening the vernacular reference pauses; closing it does not resume', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 2)
    await withTicking(page, async () => {
      await openVernacular(page, 's1')
    })
    await expect(toggleBtn(page)).toHaveText('誦')
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(2)
    await expectPausedAt(page, c)
    await withTicking(page, () => closeOverlay(page))
    await page.clock.runFor(5000)
    await expectPausedAt(page, c)
  })

  test('[REQ-RDR-035] swiping to a page other than the cursor page pauses; 誦 then starts at the first character of the page in view', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 3)
    await withTicking(page, async () => {
      await swipeToNextPage(page)
      await expectPageAligned(page, 's2')
      await expect(toggleBtn(page)).toHaveText('誦')
    })
    // paused once the swipe settled on another page: cursor and marks stay where they were at that moment, on s1
    const c = await cursor(page)
    expect(c).toBeGreaterThanOrEqual(3)
    expect(SEG_OF_CHAR(c)).toBe('s1')
    await expectPausedAt(page, c)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s2)
    expect(await followStates(page)).toEqual(expectedStates(SEG_START.s2))
  })

  test('[REQ-RDR-035] document.visibilityState turning hidden pauses', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 3)
    await setVisibility(page, 'hidden')
    await expect(toggleBtn(page)).toHaveText('誦')
    await expectPausedAt(page, 3)
  })

  test('[REQ-RDR-035] pressing 誦 while the cursor page is in view resumes from the cursor', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 5)
    await toggleBtn(page).click()
    await expectPausedAt(page, 5)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(5)
    // a fresh full beat or only the remaining time are both fine: at BEATS+0.25 beats the cursor is on 6 either way
    await page.clock.runFor(beatMs('快') * (BEATS[5] + 0.25))
    expect(await cursor(page)).toBe(6)
  })

  test('[REQ-RDR-035] pressing 誦 on the cover turns to s1 and starts at its first character', async ({ page }) => {
    await boot(page, { cover: true })
    await expectCoverAligned(page)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    // the clock is frozen: right after the tap no time has passed, so the cursor sits on the first character of s1
    expect(await cursor(page)).toBe(SEG_START.s1)
    await waitAligned(page, 's1', 5000)
    const c = await cursor(page)
    expect(SEG_OF_CHAR(c)).toBe('s1')
    expect(c).toBeLessThanOrEqual(8) // the turn itself takes at most ~1.2s (<= 8 beats at 中)
  })

  test('[REQ-RDR-035] opening on s4 (REQ-RDR-011) and pressing 誦 starts at the first character of s4', async ({ page }) => {
    await boot(page, { progress: 's4' })
    expect(await page.locator('[data-follow]').count()).toBe(0)
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s4)
    expect(await followStates(page)).toEqual(expectedStates(SEG_START.s4))
    await expectPageAligned(page, 's4')
  })

  test('[REQ-RDR-035] tapping a plain character (no lex) does not affect the playback', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 3)
    const plain = pageEl(page, 's1').locator('[data-testid="token"]').first()
    await expect(plain).toHaveCount(1)
    await plain.click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(3)
    await page.clock.runFor(beatMs('快') * 3)
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBeGreaterThan(3)
    expect(await cursor(page)).toBeLessThanOrEqual(7)
    await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0)
  })

  test('[REQ-RDR-035] tapping a lex token opens its drawer (and pauses) via the normal lex-token path', async ({ page }) => {
    await boot(page, { pace: '快' })
    await playUntil(page, 1)
    await withTicking(page, async () => {
      await openLexicon(page, '觀自在')
    })
    await expect(toggleBtn(page)).toHaveText('誦')
  })
})

// ===========================================================================
// REQ-RDR-036 progress line
// ===========================================================================
test.describe('REQ-RDR-036 progress line', () => {
  test('[REQ-RDR-036] there is no follow-progress before playing', async ({ page }) => {
    await boot(page)
    await expect(toggleBtn(page)).toHaveCount(1)
    await expect(progressEl(page)).toHaveCount(0)
  })

  test('[REQ-RDR-036] the line is a fixed 1px stone-400 bar at the top, aria-hidden, not interactive', async ({ page }) => {
    await boot(page)
    await start(page)
    const bar = progressEl(page)
    await expect(bar).toHaveCount(1)
    expect(await styleOf(bar, 'position')).toBe('fixed')
    expect(await styleOf(bar, 'pointer-events')).toBe('none')
    await expect(bar).toHaveAttribute('aria-hidden', 'true')
    expect(colorsClose(await colorOf(bar, 'background-color'), STONE_400)).toBe(true)
    const r = await rectOf(bar)
    expect(Math.abs(r.height - 1)).toBeLessThanOrEqual(0.05)
    // env(safe-area-inset-top) is 0 in the test browser
    expect(Math.abs(r.top)).toBeLessThanOrEqual(0.5)
  })

  test('[REQ-RDR-036] right end at the window edge, width = window width x (index + 1) / 260, kept while paused', async ({ page }) => {
    expect(CHAR_COUNT).toBe(260)
    await boot(page, { pace: '快' })
    await start(page)
    const B = beatMs('快')
    const to = timeAxis(page)
    const { w } = await viewportSize(page)
    for (const c of [0, 7, 100]) {
      await to(PRE[c] * B + 0.5 * B)
      expect(await cursor(page)).toBe(c)
      await expect(async () => {
        const r = await rectOf(progressEl(page))
        expect(Math.abs(r.right - w)).toBeLessThanOrEqual(2)
        expect(Math.abs(r.width - (w * (c + 1)) / 260)).toBeLessThanOrEqual(2)
      }).toPass({ timeout: 3000 })
    }
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('誦')
    await page.clock.runFor(3000)
    await expect(progressEl(page)).toHaveCount(1)
    const r = await rectOf(progressEl(page))
    expect(Math.abs(r.right - w)).toBeLessThanOrEqual(2)
    expect(Math.abs(r.width - (w * 101) / 260)).toBeLessThanOrEqual(2)
  })
})

// ===========================================================================
// REQ-RDR-037 finishing
// ===========================================================================
test.describe('REQ-RDR-037 finishing', () => {
  test('[REQ-RDR-037] when the beats of the last character are over the playback ends on s9; pressing 誦 again starts from the first character of s9', async ({ page }) => {
    test.setTimeout(90_000)
    await boot(page, { pace: '快' })
    const baseline = await colorOf(page.locator('.cell, [data-testid="punct"]').nth(0), 'color')
    await start(page)
    const B = beatMs('快')
    const last = CHAR_COUNT - 1
    const endAt = TOTAL_BEATS * B
    const lastStart = PRE[last] * B
    let t = 0
    const chunkTo = async (target: number) => {
      while (t < target) {
        const step = Math.min(10_000, target - t)
        await page.clock.runFor(step)
        t += step
      }
    }
    await chunkTo(lastStart + 0.5 * B)
    expect(await cursor(page)).toBe(last)
    await expect(toggleBtn(page)).toHaveText('停')
    await chunkTo(endAt - 0.5 * B)
    expect(await cursor(page)).toBe(last)
    await chunkTo(endAt + 0.5 * B)
    await expect(toggleBtn(page)).toHaveText('誦')
    await expect(toggleBtn(page)).toHaveAttribute('aria-pressed', 'false')
    expect(await page.locator('[data-follow]').count()).toBe(0)
    await expect(progressEl(page)).toHaveCount(0)
    await waitAligned(page, 's9', 5000)
    await expect(async () => {
      expect(colorsClose(await colorOf(page.locator('.cell, [data-testid="punct"]').nth(0), 'color'), baseline)).toBe(true)
    }).toPass({ timeout: 3000 })
    await toggleBtn(page).click()
    await expect(toggleBtn(page)).toHaveText('停')
    expect(await cursor(page)).toBe(SEG_START.s9)
    expect(await followStates(page)).toEqual(expectedStates(SEG_START.s9))
  })
})
