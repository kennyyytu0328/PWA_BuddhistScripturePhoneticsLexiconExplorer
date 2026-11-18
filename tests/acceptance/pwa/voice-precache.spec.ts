import fs from 'node:fs'
import path from 'node:path'
import { DIST, cacheSnapshot, expect, gotoReader, precacheOf, test, waitForController } from './helpers'

test.use({ serviceWorkers: 'allow' })

const VOICE_FILES = ['/data/voice.mp3', '/data/voice-timings.json']

test.describe('voice recording precache (REQ-PWA-007, Q-PWA-011)', () => {
  test('[REQ-PWA-007] right after the service worker activates, precache holds /data/voice.mp3 and /data/voice-timings.json', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const pre = precacheOf(await cacheSnapshot(page))
    for (const u of VOICE_FILES) expect(pre, `precache entry ${u}`).toContain(u)
  })

  test('[REQ-PWA-007] the precached voice files have the exact built bytes and are served from the cache offline', async ({ page }) => {
    await gotoReader(page)
    expect(await waitForController(page)).toBe('activated')
    const sizes = Object.fromEntries(VOICE_FILES.map((u) => [u, fs.statSync(path.join(DIST, u)).size]))

    const inCache = await page.evaluate(async (urls) => {
      const out: Record<string, number> = {}
      for (const name of await caches.keys()) {
        if (!name.includes('precache')) continue
        const cache = await caches.open(name)
        for (const req of await cache.keys()) {
          const url = new URL(req.url)
          if (urls.includes(url.pathname)) out[url.pathname] = (await (await cache.match(req))!.arrayBuffer()).byteLength
        }
      }
      return out
    }, VOICE_FILES)
    expect(inCache).toEqual(sizes)

    await page.context().setOffline(true)
    const offline = await page.evaluate(async (urls) => {
      const out: Record<string, { status: number; bytes: number } | string> = {}
      for (const u of urls) {
        try {
          const res = await fetch(u, { cache: 'no-store' })
          out[u] = { status: res.status, bytes: (await res.arrayBuffer()).byteLength }
        } catch (e) {
          out[u] = String(e)
        }
      }
      return out
    }, VOICE_FILES)
    await page.context().setOffline(false)
    expect(offline).toEqual(Object.fromEntries(VOICE_FILES.map((u) => [u, { status: 200, bytes: sizes[u] }])))
  })
})
