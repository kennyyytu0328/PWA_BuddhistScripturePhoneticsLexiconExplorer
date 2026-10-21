import fs from 'node:fs'
import path from 'node:path'
import { test as base, expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import { PAGE_HELPERS_SRC } from './page-helpers'

export { expect }

// ---------------------------------------------------------------------------
// Fixture: every page gets window.__t (see page-helpers.ts)
// ---------------------------------------------------------------------------
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript(PAGE_HELPERS_SRC)
    await use(page)
  },
})

// ---------------------------------------------------------------------------
// Data products (read from the data unit's build output)
// ---------------------------------------------------------------------------
export interface Char { c: string; py: string; zy: string }
export interface Tok { t: string; punct?: true; lex?: string; sense?: number; chars?: Char[]; iast?: string }
export interface Seg { id: string; vernacular: string; themes: string[]; reflection: string; tokens: Tok[] }
export interface Ast { segments: Seg[] }
export type DefPart = string | { g: string }
export interface Sense { usg: string | null; def: DefPart[]; xr: string[] }
export interface Lexicon { source: string; license: string; attribution: string; entries: Record<string, { senses: Sense[] }> }

const readJson = <T>(rel: string): T => JSON.parse(fs.readFileSync(path.join(process.cwd(), rel), 'utf8')) as T
export const AST = readJson<Ast>('public/data/heart-sutra.ast.json')
export const LEX = readJson<Lexicon>('public/data/lexicon.dfb.json')
export const ALL_TOKENS: Tok[] = AST.segments.flatMap((s) => s.tokens)
export const LEX_TOKENS: Tok[] = ALL_TOKENS.filter((t) => t.lex)
export const DISTINCT_LEX: string[] = [...new Set(LEX_TOKENS.map((t) => t.lex as string))]

export const defText = (s: Sense): string => s.def.filter((p): p is string => typeof p === 'string').join('')
export const PUA = /[-]/g

export const SEL = {
  token: '[data-testid="lex-token"], [data-testid="token"], [data-testid="punct"]',
  lexToken: 'button[data-testid="lex-token"]',
}

// ---------------------------------------------------------------------------
// Colours (spec tokens)
// ---------------------------------------------------------------------------
export type Rgba = [number, number, number, number]
export const STONE_950: Rgba = [12, 10, 9, 1]
export const STONE_900_80: Rgba = [28, 25, 23, 0.8]
export const AMBER_500: Rgba = [245, 158, 11, 1]
export const AMBER_500_75: Rgba = [245, 158, 11, 0.75]
export const AMBER_900_40: Rgba = [120, 53, 15, 0.4]
export const EASE_ZEN = 'cubic-bezier(0.19, 1, 0.22, 1)'

export function closeTo(actual: number[], expected: number[], tol = 2, aTol = 0.02): boolean {
  return (
    actual.length === 4 &&
    [0, 1, 2].every((i) => Math.abs(actual[i] - expected[i]) <= tol) &&
    Math.abs(actual[3] - expected[3]) <= aTol
  )
}

/** Computed colour of a CSS property, normalised to sRGB [r,g,b,a] through a canvas. */
export async function colorOf(loc: Locator, prop: string, pseudo?: string): Promise<Rgba> {
  return loc.evaluate(
    (el, [p, ps]) => {
      const t = (window as unknown as { __t: { rgba: (c: string) => number[] } }).__t
      return t.rgba(getComputedStyle(el, ps || null).getPropertyValue(p)) as Rgba
    },
    [prop, pseudo ?? ''] as const,
  )
}

export async function styleOf(loc: Locator, prop: string, pseudo?: string): Promise<string> {
  return loc.evaluate((el, [p, ps]) => getComputedStyle(el, ps || null).getPropertyValue(p), [prop, pseudo ?? ''] as const)
}

/** First family name in a computed font-family list, quotes stripped. */
export function firstFamily(fontFamily: string): string {
  return fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '')
}

// ---------------------------------------------------------------------------
// Reader navigation
// ---------------------------------------------------------------------------
/** Load the reader and wait for fonts. The reader starts on the cover (REQ-RDR-030); nothing is scrolled. */
export async function gotoCover(page: Page): Promise<void> {
  // Q-RDR-043 (A): existing tests behave as if the first-use nudge (REQ-RDR-031) was already seen.
  await seedPrefs(page, { peek: true })
  await openReaderPage(page)
}

/**
 * Seed IndexedDB `sutraflow/prefs` before any app script runs (Dexie version 1 = native version 10).
 * Existing records are never overwritten, so the init script is safe to run again on every reload.
 * `peek` writes { key: 'peek', value: 'done' }; `progress` writes { key: 'progress', value: <seg id | 'cover'> }.
 */
export async function seedPrefs(page: Page, seed: { peek?: boolean; progress?: string }): Promise<void> {
  await page.addInitScript((s) => {
    const records: { key: string; value: string }[] = []
    if (s.peek) records.push({ key: 'peek', value: 'done' })
    if (s.progress) records.push({ key: 'progress', value: s.progress })
    if (!records.length) return
    const open = indexedDB.open('sutraflow', 10)
    open.onupgradeneeded = () => {
      if (!open.result.objectStoreNames.contains('prefs')) open.result.createObjectStore('prefs', { keyPath: 'key' })
    }
    open.onsuccess = () => {
      const db = open.result
      if (!db.objectStoreNames.contains('prefs')) { db.close(); return }
      const store = db.transaction('prefs', 'readwrite').objectStore('prefs')
      for (const r of records) {
        const req = store.add(r)
        req.onerror = (e) => e.preventDefault()
      }
      db.close()
    }
  }, seed)
}

/**
 * Load the reader WITHOUT the `peek` record (first use), for REQ-RDR-031 tests only.
 * `progress` optionally pre-seeds a reading position (REQ-RDR-011) without a `peek` record.
 */
export async function gotoCoverWithPeek(page: Page, opts: { progress?: string } = {}): Promise<void> {
  if (opts.progress) await seedPrefs(page, { progress: opts.progress })
  await openReaderPage(page)
}

async function openReaderPage(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 10_000 })
  // let the web fonts finish loading so measurements and screenshots are stable
  await page.evaluate(async () => {
    await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
    await document.fonts.ready
  })
}

/**
 * Load the reader and turn from the cover to page 1 (REQ-RDR-002), so tests written for "page 1 is on screen"
 * keep their meaning. The swipe only happens when the reader opened on the cover; a restored reading
 * position (REQ-RDR-011) is left alone. Use gotoCover to stay on the cover.
 */
export async function gotoReader(page: Page): Promise<void> {
  await gotoCover(page)
  const cover = page.getByTestId('sutra-cover')
  const { w } = await viewportSize(page)
  const onCover =
    (await cover.count()) > 0 && Math.abs((await cover.evaluate((el) => el.getBoundingClientRect().right)) - w) <= 1.5
  if (onCover) {
    await swipeToNextPage(page)
    await expectPageAligned(page, 's1')
  }
}

export const viewportSize = (page: Page) =>
  page.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }))

export const pageEl = (page: Page, seg: string): Locator =>
  page.locator(`[data-testid="sutra-page"][data-segment="${seg}"]`)

export const lexToken = (page: Page, lex: string, nth = 0): Locator =>
  page.locator(`button[data-testid="lex-token"][data-lex="${lex}"]`).nth(nth)

export const toggle = (page: Page): Locator => page.locator('button[data-testid="phonetic-toggle"]')

export type Mode = 'zhuyin' | 'pinyin' | 'iast' | 'none'
export const MODE_ORDER: Mode[] = ['zhuyin', 'pinyin', 'iast', 'none']
export const MODE_LABEL: Record<Mode, string> = { zhuyin: '注音', pinyin: '拼音', iast: '梵文', none: '無音標' }

export async function setMode(page: Page, mode: Mode): Promise<void> {
  const t = toggle(page)
  for (let i = 0; i < 5; i++) {
    if ((await t.getAttribute('data-mode')) === mode) return
    await t.click()
  }
  await expect(t).toHaveAttribute('data-mode', mode)
}

/** Wait until an element stops animating / moving. */
export async function settled(loc: Locator): Promise<void> {
  await expect
    .poll(async () => loc.evaluate((el) => el.getAnimations({ subtree: true }).length), { timeout: 5000 })
    .toBe(0)
  let last = ''
  await expect
    .poll(
      async () => {
        const cur = await loc.evaluate((el) => JSON.stringify(el.getBoundingClientRect()))
        const same = cur === last
        last = cur
        return same
      },
      { timeout: 5000, intervals: [100] },
    )
    .toBe(true)
}

export async function openLexicon(page: Page, lex: string, nth = 0): Promise<Locator> {
  await lexToken(page, lex, nth).click()
  const drawer = page.getByTestId('lexicon-drawer')
  await expect(drawer).toBeVisible()
  await expect(drawer.getByTestId('lexicon-headword')).toHaveText(lex)
  await settled(drawer)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return drawer
}

export async function openVernacular(page: Page, seg: string): Promise<Locator> {
  await pageEl(page, seg).locator('button[data-testid="vernacular-toggle"]').click()
  const panel = page.getByTestId('vernacular-panel')
  await expect(panel).toBeVisible()
  await settled(panel)
  return panel
}

/** Dismiss whichever drawer/panel is open (Escape) and wait until none remains. */
export async function closeOverlay(page: Page): Promise<void> {
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-testid="lexicon-drawer"], [data-testid="vernacular-panel"]')).toHaveCount(0)
}

/** Drag a bottom sheet downwards with the pointer. */
export async function dragDown(page: Page, sheet: Locator, distance = 500): Promise<void> {
  const box = await sheet.boundingBox()
  if (!box) throw new Error('sheet has no bounding box')
  const x = box.x + box.width / 2
  const y = box.y + 24
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x, y + (distance * i) / 10)
  await page.mouse.up()
}

/**
 * Touch swipe that reveals the next page: the finger moves towards the right, the rtl scroller moves
 * towards the left. A bit over half a window, with a pause before release so there is no fling.
 */
export async function swipeToNextPage(page: Page, direction: 'next' | 'prev' = 'next'): Promise<void> {
  const { w, h } = await viewportSize(page)
  const cdp = await page.context().newCDPSession(page)
  const y = Math.round(h / 2)
  const x0 = Math.round(direction === 'next' ? w / 2 - w * 0.3 : w / 2 + w * 0.3)
  const dx = Math.round(direction === 'next' ? w * 0.6 : -w * 0.6)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] })
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 + (dx * i) / 12, y }] })
    await page.waitForTimeout(20)
  }
  await page.waitForTimeout(150)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach()
}

/** Right edge of a page relative to the window: ~innerWidth when the page is aligned to its start (rtl). */
export async function pageRight(page: Page, seg: string): Promise<number> {
  return pageEl(page, seg).evaluate((el) => el.getBoundingClientRect().right)
}

/** Swipe back towards the head of the sutra (finger moves left, the rtl scroller moves right). */
export const swipeToPrevPage = (page: Page): Promise<void> => swipeToNextPage(page, 'prev')

/** The cover (REQ-RDR-030) is aligned when its right edge meets the window's right edge. */
export async function expectCoverAligned(page: Page): Promise<void> {
  const { w } = await viewportSize(page)
  const right = () => page.getByTestId('sutra-cover').evaluate((el) => el.getBoundingClientRect().right)
  await expect.poll(right, { timeout: 5000 }).toBeGreaterThanOrEqual(w - 1.5)
  await expect.poll(right, { timeout: 5000 }).toBeLessThanOrEqual(w + 1.5)
}

export async function expectPageAligned(page: Page, seg: string): Promise<void> {
  const { w } = await viewportSize(page)
  await expect.poll(() => pageRight(page, seg), { timeout: 5000 }).toBeGreaterThanOrEqual(w - 1.5)
  await expect.poll(() => pageRight(page, seg), { timeout: 5000 }).toBeLessThanOrEqual(w + 1.5)
}

export async function turnToPage(page: Page, n: number): Promise<void> {
  for (let i = 1; i < n; i++) {
    await swipeToNextPage(page)
    await expectPageAligned(page, `s${i + 1}`)
  }
}

// ---------------------------------------------------------------------------
// IndexedDB (Dexie database `sutraflow`, table `prefs`)
// ---------------------------------------------------------------------------
export async function readPref(page: Page, key: string): Promise<unknown> {
  return page.evaluate(async (k) => {
    const dbs = await indexedDB.databases()
    if (!dbs.some((d) => d.name === 'sutraflow')) return null
    return new Promise((resolve) => {
      const open = indexedDB.open('sutraflow')
      open.onerror = () => resolve(null)
      open.onsuccess = () => {
        const db = open.result
        if (!db.objectStoreNames.contains('prefs')) { db.close(); resolve(null); return }
        const req = db.transaction('prefs', 'readonly').objectStore('prefs').get(k)
        req.onsuccess = () => { db.close(); resolve(req.result ?? null) }
        req.onerror = () => { db.close(); resolve(null) }
      }
    })
  }, key)
}

// ---------------------------------------------------------------------------
// Device API stubs
// ---------------------------------------------------------------------------
export interface StubOptions {
  vibrate?: 'record' | 'absent'
  wakeLock?: 'record' | 'absent' | 'reject'
}

export async function installDeviceStubs(page: Page, opts: StubOptions): Promise<void> {
  await page.addInitScript((o) => {
    const w = window as any
    w.__vibrateCalls = []
    w.__wl = { requests: [] as string[], releases: 0, sentinels: [] as any[] }
    if (o.vibrate === 'record') {
      Object.defineProperty(navigator, 'vibrate', {
        configurable: true,
        value: (...args: unknown[]) => { w.__vibrateCalls.push(args); return true },
      })
    } else if (o.vibrate === 'absent') {
      try { delete (Navigator.prototype as any).vibrate } catch { /* ignore */ }
      try { delete (navigator as any).vibrate } catch { /* ignore */ }
      Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined })
      try { delete (navigator as any).vibrate } catch { /* ignore */ }
    }
    if (o.wakeLock === 'record' || o.wakeLock === 'reject') {
      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        value: {
          request: async (type: string) => {
            w.__wl.requests.push(type)
            if (o.wakeLock === 'reject') throw new DOMException('denied', 'NotAllowedError')
            const s = {
              type,
              released: false,
              release: async () => { s.released = true; w.__wl.releases++ },
              addEventListener() {},
              removeEventListener() {},
            }
            w.__wl.sentinels.push(s)
            return s
          },
        },
      })
    } else if (o.wakeLock === 'absent') {
      try { delete (Navigator.prototype as any).wakeLock } catch { /* ignore */ }
      try { delete (navigator as any).wakeLock } catch { /* ignore */ }
    }
  }, opts)
}

export const vibrateCalls = (page: Page): Promise<unknown[][]> =>
  page.evaluate(() => (window as any).__vibrateCalls as unknown[][])
export const wakeLockLog = (page: Page): Promise<{ requests: string[]; releases: number }> =>
  page.evaluate(() => {
    const l = (window as any).__wl
    return { requests: [...l.requests], releases: l.releases }
  })

export function collectPageErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

// ---------------------------------------------------------------------------
// Screenshots analysed inside the page
// ---------------------------------------------------------------------------
export async function shotBase64(page: Page, clip?: { x: number; y: number; width: number; height: number }): Promise<string> {
  const buf = await page.screenshot({ scale: 'css', animations: 'disabled', ...(clip ? { clip } : {}) })
  return buf.toString('base64')
}

/** Run every check callback in reading / lexicon-drawer / vernacular-panel state, collect per-state results. */
export async function inEachState<R>(page: Page, check: () => Promise<R>): Promise<Record<string, R>> {
  const result: Record<string, R> = {}
  result.reading = await check()
  await openLexicon(page, '觀自在')
  result.lexicon = await check()
  await closeOverlay(page)
  await openVernacular(page, 's1')
  result.vernacular = await check()
  await closeOverlay(page)
  return result
}

/** Call a window.__t function (page-helpers.ts) in the page. */
export function tcall<R>(page: Page, fn: string, ...args: unknown[]): Promise<R> {
  return page.evaluate(([name, a]) => (window as any).__t[name as string](...(a as unknown[])), [fn, args] as const) as Promise<R>
}
