import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { expect, gotoReader } from '../reader/helpers'

export {
  AST,
  ALL_TOKENS,
  DISTINCT_LEX,
  LEX,
  LEX_TOKENS,
  closeOverlay,
  defText,
  expect,
  gotoReader,
  openLexicon,
  openVernacular,
  setMode,
  test,
} from '../reader/helpers'

export const ORIGIN = 'http://localhost:4173'
export const DIST = path.join(process.cwd(), 'dist')
export const STONE_950_RGB = [12, 10, 9] as const

// ---------------------------------------------------------------------------
// dist/ (the production build the tests run against)
// ---------------------------------------------------------------------------
export function walk(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    return e.isDirectory() ? walk(full) : [full]
  })
}

/** URL path (leading slash, forward slashes) of a file under dist/. */
export const urlOf = (file: string): string => '/' + path.relative(DIST, file).split(path.sep).join('/')

export const distIndexHtml = (): string => fs.readFileSync(path.join(DIST, 'index.html'), 'utf8')

// ---------------------------------------------------------------------------
// Service worker / Cache Storage
// ---------------------------------------------------------------------------
/** Wait (up to 20s) until a service worker controls the page, without any reload. Returns the controller state. */
export async function waitForController(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const sw = navigator.serviceWorker
    if (!sw) return null
    const deadline = Date.now() + 20_000
    while (!sw.controller && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    // clients.claim() runs inside the activate event, so control can begin while the worker is still 'activating' (Q-PWA-008)
    while (sw.controller && sw.controller.state === 'activating' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50))
    }
    return sw.controller ? sw.controller.state : null
  })
}

/** cache name -> same-origin request paths (pathname + search, without Workbox's __WB_REVISION__ parameter). */
export async function cacheSnapshot(page: Page): Promise<Record<string, string[]>> {
  return page.evaluate(async () => {
    const out: Record<string, string[]> = {}
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      const urls: string[] = []
      for (const req of await cache.keys()) {
        const u = new URL(req.url)
        if (u.origin !== location.origin) continue
        u.searchParams.delete('__WB_REVISION__')
        urls.push(u.pathname + u.search)
      }
      out[name] = urls
    }
    return out
  })
}

export const precacheOf = (snap: Record<string, string[]>): string[] =>
  Object.entries(snap)
    .filter(([name]) => name.includes('precache'))
    .flatMap(([, urls]) => urls)

/** Open the reader with a controlling service worker; returns the page after the scripture rendered. */
export async function openControlled(page: Page): Promise<void> {
  await gotoReader(page)
  const state = await waitForController(page)
  expect(state, 'navigator.serviceWorker.controller.state').toBe('activated')
}

/** Switch the browser offline and reload; waits for the scripture. */
export async function reloadOffline(page: Page): Promise<void> {
  await page.context().setOffline(true)
  await page.reload()
  await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 15_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------
export function pngSize(buf: Buffer): { width: number; height: number } {
  const sig = buf.subarray(0, 8).toString('hex')
  if (sig !== '89504e470d0a1a0a') throw new Error('not a PNG: ' + sig)
  if (buf.subarray(12, 16).toString('latin1') !== 'IHDR') throw new Error('first chunk is not IHDR')
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}
