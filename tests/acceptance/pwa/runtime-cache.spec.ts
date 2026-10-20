import fs from 'node:fs'
import path from 'node:path'
import { DIST, cacheSnapshot, expect, openControlled, precacheOf, test } from './helpers'

test.use({ serviceWorkers: 'allow' })

// A same-origin file under /data/ that did not exist at build time, so it cannot be in the precache.
const EXT_DIR = path.join(DIST, 'data', 'ext')
const EXT_NAME = `extension-${process.pid}-${Date.now()}.json`
const EXT_PATH = `/data/ext/${EXT_NAME}`
const EXT_FILE = path.join(EXT_DIR, EXT_NAME)
const V1 = JSON.stringify({ title: '擴充經典測試檔', version: 1 })
const V2 = JSON.stringify({ title: '擴充經典測試檔（已更新）', version: 2, padding: 'x'.repeat(64) })

test.describe.configure({ mode: 'serial' })

test.beforeAll(() => {
  fs.mkdirSync(EXT_DIR, { recursive: true })
  fs.writeFileSync(EXT_FILE, V1, 'utf8')
})

test.afterAll(() => {
  fs.rmSync(EXT_FILE, { force: true })
  try {
    fs.rmdirSync(EXT_DIR)
  } catch {
    /* not empty or already gone */
  }
})

const fetchText = (page: import('@playwright/test').Page): Promise<string> =>
  page.evaluate(async (u) => {
    const res = await fetch(u, { cache: 'no-store' })
    return `${res.status}|${await res.text()}`
  }, EXT_PATH)

/** Names of non-precache caches that hold the extension file, with the cached body. */
const runtimeHolders = (page: import('@playwright/test').Page): Promise<Record<string, string>> =>
  page.evaluate(async (u) => {
    const out: Record<string, string> = {}
    for (const name of await caches.keys()) {
      if (name.includes('precache')) continue
      const hit = await (await caches.open(name)).match(u)
      if (hit) out[name] = await hit.text()
    }
    return out
  }, EXT_PATH)

test.describe('runtime cache for extension data', () => {
  test('[REQ-PWA-008] first online request of an unlisted /data/ file lands in its own non-precache cache and is served from it offline', async ({ page }) => {
    await openControlled(page)

    // the file is not part of the precache
    expect(precacheOf(await cacheSnapshot(page))).not.toContain(EXT_PATH)
    expect(await runtimeHolders(page)).toEqual({})

    // first request, online
    expect(await fetchText(page)).toBe(`200|${V1}`)
    await expect
      .poll(async () => Object.values(await runtimeHolders(page)), { message: 'the response is stored in a runtime cache' })
      .toEqual([V1])
    const holders = Object.keys(await runtimeHolders(page))
    expect(holders).toHaveLength(1)
    expect(holders[0].includes('precache'), 'runtime cache is separate from the precache').toBe(false)
    expect(precacheOf(await cacheSnapshot(page))).not.toContain(EXT_PATH)

    // offline: same content from the cache
    await page.context().setOffline(true)
    expect(await fetchText(page)).toBe(`200|${V1}`)
    await page.context().setOffline(false)
  })

  test('[REQ-PWA-008] the strategy is StaleWhileRevalidate: a changed file is answered stale first, the cache is refreshed in the background, the next request gets the new content', async ({ page }) => {
    await openControlled(page)
    fs.writeFileSync(EXT_FILE, V1, 'utf8')
    expect(await fetchText(page)).toBe(`200|${V1}`)
    await expect.poll(async () => Object.values(await runtimeHolders(page))).toEqual([V1])

    fs.writeFileSync(EXT_FILE, V2, 'utf8')
    // stale: the cached V1 is returned although the server already has V2
    expect(await fetchText(page)).toBe(`200|${V1}`)
    // revalidation updates the cache in the background
    await expect.poll(async () => Object.values(await runtimeHolders(page)), { timeout: 10_000 }).toEqual([V2])
    expect(await fetchText(page)).toBe(`200|${V2}`)

    // offline serves the refreshed copy
    await page.context().setOffline(true)
    expect(await fetchText(page)).toBe(`200|${V2}`)
    await page.context().setOffline(false)
    fs.writeFileSync(EXT_FILE, V1, 'utf8')
  })

  test('[REQ-PWA-008] a /data/ file that was never fetched while online is not available offline (cache is filled by use, not magic)', async ({ page }) => {
    await openControlled(page)
    await page.context().setOffline(true)
    const never = `/data/ext/never-fetched-${Date.now()}.json`
    const outcome = await page.evaluate(async (u) => {
      try {
        const res = await fetch(u, { cache: 'no-store' })
        return `status ${res.status}`
      } catch {
        return 'network error'
      }
    }, never)
    expect(outcome).toBe('network error')
    await page.context().setOffline(false)
  })
})
