import fs from 'node:fs'
import path from 'node:path'
import { DIST, ORIGIN, expect, gotoReader, openControlled, test, waitForController } from './helpers'

test.use({ serviceWorkers: 'allow' })

const VERSION_PROBE = '/__sw_version__'

interface SwVersion {
  status: string
  scriptURL: string
}

let swFile: string | null = null
let original: string | null = null

test.afterEach(() => {
  if (swFile && original !== null) fs.writeFileSync(swFile, original, 'utf8')
  swFile = null
  original = null
})

test.describe('update strategy', () => {
  test('[REQ-PWA-009] a new service worker waits silently (no reload, no prompt); after all app pages are closed the next visit is controlled by it', async ({ context, page }) => {
    test.setTimeout(120_000)
    const marker = `SW_V2_${Date.now()}`

    // A page that is not an app client: it only watches service worker versions through CDP.
    const observer = await context.newPage()
    const cdp = await context.newCDPSession(observer)
    const versions = new Map<string, SwVersion>()
    cdp.on('ServiceWorker.workerVersionUpdated', (ev) => {
      for (const v of ev.versions) if (v.scriptURL.startsWith(ORIGIN + '/')) versions.set(v.versionId, { status: v.status, scriptURL: v.scriptURL })
    })
    await cdp.send('ServiceWorker.enable')

    // --- old version controls the page --------------------------------------------------------
    await openControlled(page)
    await expect.poll(() => [...versions.values()].filter((v) => v.status === 'activated').length, { timeout: 15_000 }).toBe(1)
    const oldId = [...versions.entries()].find(([, v]) => v.status === 'activated')![0]
    const scriptURL = versions.get(oldId)!.scriptURL

    const probe = (p: typeof page) =>
      p.evaluate(async (u) => (await (await fetch(u, { cache: 'no-store' })).text()).trim(), VERSION_PROBE)
    expect(await probe(page), 'old worker does not answer the version probe').not.toBe(marker)

    await page.evaluate(() => {
      const w = window as any
      w.__noReload = 'original-page'
      w.__controllerChanges = 0
      navigator.serviceWorker.addEventListener('controllerchange', () => w.__controllerChanges++)
    })
    const before = await page.evaluate(() => ({
      text: document.body.innerText,
      live: document.querySelectorAll('[role="alert"], [role="status"], [aria-live]').length,
      timeOrigin: performance.timeOrigin,
    }))

    // --- the server now has a new version: same script URL, changed bytes (dist/ is rewritten and restored afterwards) that answer the probe ---
    swFile = path.join(DIST, new URL(scriptURL).pathname)
    original = fs.readFileSync(swFile, 'utf8')
    fs.writeFileSync(
      swFile,
      original +
        `
;self.addEventListener('fetch', function (e) { if (new URL(e.request.url).pathname === '${VERSION_PROBE}') e.respondWith(new Response('${marker}')); });
`,
      'utf8',
    )
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      await reg!.update()
    })

    // new version installs and then waits
    await expect
      .poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state ?? null), { timeout: 20_000 })
      .toBe('installed')
    await expect.poll(() => [...versions.values()].some((v) => v.status === 'installed'), { timeout: 5_000 }).toBe(true)

    // give an eager implementation (skipWaiting, auto reload) time to show itself
    await page.waitForTimeout(2_000)
    const during = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      const w = window as any
      return {
        waiting: reg?.waiting?.state ?? null,
        activeState: reg?.active?.state ?? null,
        controllerState: navigator.serviceWorker.controller?.state ?? null,
        marker: w.__noReload,
        controllerChanges: w.__controllerChanges,
        timeOrigin: performance.timeOrigin,
        text: document.body.innerText,
        live: document.querySelectorAll('[role="alert"], [role="status"], [aria-live]').length,
      }
    })
    expect(during.waiting, 'new worker is still waiting').toBe('installed')
    expect(during.activeState).toBe('activated')
    expect(during.controllerState).toBe('activated')
    expect(during.marker, 'current page was not reloaded').toBe('original-page')
    expect(during.timeOrigin).toBe(before.timeOrigin)
    expect(during.controllerChanges, 'controllerchange events').toBe(0)
    expect(during.text, 'visible text is unchanged: no update / offline-ready notice').toBe(before.text)
    expect(during.live, 'no alert / status / aria-live elements appeared').toBe(before.live)
    expect(await probe(page), 'the old worker still answers requests').not.toBe(marker)
    const stillOld = [...versions.entries()].find(([id]) => id === oldId)![1]
    expect(stillOld.status).toBe('activated')

    // --- close every app page: the waiting worker takes over ----------------------------------
    await page.close()
    await expect
      .poll(() => [...versions.entries()].some(([id, v]) => id !== oldId && v.status === 'activated'), { timeout: 20_000 })
      .toBe(true)

    const reopened = await context.newPage()
    await gotoReader(reopened)
    expect(await waitForController(reopened)).toBe('activated')
    expect(await probe(reopened), 'the next visit is controlled by the new worker').toBe(marker)
    await observer.close()
  })
})
