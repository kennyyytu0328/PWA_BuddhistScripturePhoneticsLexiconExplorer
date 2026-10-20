import fs from 'node:fs'
import path from 'node:path'
import {
  DIST,
  cacheSnapshot,
  distIndexHtml,
  expect,
  gotoReader,
  precacheOf,
  test,
  urlOf,
  waitForController,
  walk,
} from './helpers'

test.use({ serviceWorkers: 'allow' })

const distFiles = (sub: string, ext: RegExp): string[] => walk(path.join(DIST, sub)).filter((f) => ext.test(f)).map(urlOf).sort()

/** JS and CSS that the built index.html loads (script src, stylesheet / modulepreload href). */
function indexAssets(): string[] {
  const html = distIndexHtml()
  const urls = [...html.matchAll(/(?:src|href)="(\/[^"?#]+\.(?:js|css))[^"]*"/g)].map((m) => m[1])
  return [...new Set(urls)].sort()
}

test.describe('service worker and precache', () => {
  test('[REQ-PWA-005] on the first online visit a service worker controls the page without a second visit or reload', async ({ page }) => {
    await gotoReader(page)
    const marker = await page.evaluate(() => {
      ;(window as any).__noReload = 'first-load'
      return performance.timeOrigin
    })
    const state = await waitForController(page)
    expect(state).toBe('activated')
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return {
        scope: reg?.scope,
        activeState: reg?.active?.state,
        controllerScript: navigator.serviceWorker.controller?.scriptURL === reg?.active?.scriptURL,
        marker: (window as any).__noReload,
        timeOrigin: performance.timeOrigin,
      }
    })
    expect(info.scope).toBe('http://localhost:4173/')
    expect(info.activeState).toBe('activated')
    expect(info.controllerScript).toBe(true)
    expect(info.marker).toBe('first-load')
    expect(info.timeOrigin).toBe(marker)
  })

  test('[REQ-PWA-006] precache holds index.html, every JS/CSS the build produced and index.html loads, /fonts/fonts.css and every woff2 under /fonts/', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const pre = precacheOf(await cacheSnapshot(page))
    expect(pre.length, 'a precache cache exists').toBeGreaterThan(0)

    const assetsJsCss = distFiles('assets', /\.(js|css)$/)
    expect(assetsJsCss.length, 'dist/assets has JS and CSS').toBeGreaterThanOrEqual(2)
    const woff2 = distFiles('fonts', /\.woff2$/)
    expect(woff2).toEqual(['/fonts/sans-core.woff2', '/fonts/sans-ext.woff2', '/fonts/serif-lexicon.woff2', '/fonts/serif-sutra.woff2'])
    const loadedByIndex = indexAssets()
    expect(loadedByIndex.length, 'index.html loads JS/CSS').toBeGreaterThanOrEqual(2)

    const expected = [...new Set(['/index.html', ...assetsJsCss, ...loadedByIndex, '/fonts/fonts.css', ...woff2])].sort()
    const missing = expected.filter((u) => !pre.includes(u))
    expect(missing, 'expected precache entries that are missing').toEqual([])
  })

  test('[REQ-PWA-006] offline, precached shell and font files are answered from the cache with the exact built bytes', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const files = [
      '/index.html',
      ...distFiles('assets', /\.(js|css)$/),
      ...indexAssets(),
      '/fonts/fonts.css',
      ...distFiles('fonts', /\.woff2$/),
    ]
    const unique = [...new Set(files)]
    const sizes = Object.fromEntries(unique.map((u) => [u, fs.statSync(path.join(DIST, u)).size]))

    await page.context().setOffline(true)
    const result = await page.evaluate(async (urls) => {
      const out: Record<string, { status: number; bytes: number } | string> = {}
      for (const u of urls) {
        try {
          const res = await fetch(u, { cache: 'no-store' })
          out[u] = { status: res.status, bytes: (await res.arrayBuffer()).byteLength }
        } catch (e) {
          out[u] = 'network error: ' + String(e)
        }
      }
      return out
    }, unique)
    const expected = Object.fromEntries(unique.map((u) => [u, { status: 200, bytes: sizes[u] }]))
    expect(result).toEqual(expected)
  })

  test('[REQ-PWA-007] right after the service worker activates (no lexicon token touched) precache holds heart-sutra.ast.json and lexicon.dfb.json', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const snap = await cacheSnapshot(page)
    const pre = precacheOf(snap)
    expect(pre).toContain('/data/heart-sutra.ast.json')
    expect(pre).toContain('/data/lexicon.dfb.json')

    const bytes = await page.evaluate(async () => {
      const out: Record<string, number> = {}
      for (const u of ['/data/heart-sutra.ast.json', '/data/lexicon.dfb.json']) {
        for (const name of await caches.keys()) {
          if (!name.includes('precache')) continue
          const cache = await caches.open(name)
          for (const req of await cache.keys()) {
            const url = new URL(req.url)
            if (url.pathname === u) out[u] = (await (await cache.match(req))!.arrayBuffer()).byteLength
          }
        }
      }
      return out
    })
    expect(bytes).toEqual({
      '/data/heart-sutra.ast.json': fs.statSync(path.join(DIST, 'data/heart-sutra.ast.json')).size,
      '/data/lexicon.dfb.json': fs.statSync(path.join(DIST, 'data/lexicon.dfb.json')).size,
    })
  })

  test('[REQ-PWA-007] precache holds every PNG under /data/gaiji/ (Q-PWA-001)', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const gaiji = distFiles('data/gaiji', /\.png$/)
    expect(gaiji).toEqual(['/data/gaiji/DF-8752.png', '/data/gaiji/DF-875F.png'])
    const pre = precacheOf(await cacheSnapshot(page))
    expect(gaiji.filter((u) => !pre.includes(u))).toEqual([])
  })
})
