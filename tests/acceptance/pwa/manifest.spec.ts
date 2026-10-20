import fs from 'node:fs'
import path from 'node:path'
import { ORIGIN, expect, openControlled, pngSize, test } from './helpers'

test.use({ serviceWorkers: 'allow' })

interface Manifest {
  name?: string
  short_name?: string
  start_url?: string
  display?: string
  background_color?: string
  theme_color?: string
  orientation?: string
  lang?: string
  icons?: Record<string, unknown>[]
}

async function manifestOf(page: import('@playwright/test').Page): Promise<{ href: string; json: Manifest }> {
  await page.goto('/')
  const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel="manifest"]')].map((l) => (l as HTMLLinkElement).href))
  expect(hrefs.length, '<link rel="manifest"> count').toBe(1)
  const res = await page.request.get(hrefs[0])
  expect(res.status()).toBe(200)
  return { href: hrefs[0], json: (await res.json()) as Manifest }
}

test.describe('manifest and installability', () => {
  test('[REQ-PWA-001] manifest fields match CLAUDE.md §5 verbatim, plus lang zh-Hant (Q-PWA-007)', async ({ page }) => {
    const { href, json } = await manifestOf(page)
    expect(href.startsWith(ORIGIN + '/'), 'manifest is same-origin').toBe(true)
    expect(json.name).toBe('心經·逐字解讀沉浸器')
    expect(json.short_name).toBe('心經')
    expect(json.start_url).toBe('/')
    expect(json.display).toBe('standalone')
    expect(json.background_color).toBe('#0c0a09')
    expect(json.theme_color).toBe('#0c0a09')
    expect(json.orientation).toBe('portrait')
    expect(json.lang).toBe('zh-Hant')
  })

  test('[REQ-PWA-001] icons are exactly two: 192 (image/png, no purpose) and 512 (image/png, purpose "any maskable")', async ({ page }) => {
    const { json } = await manifestOf(page)
    expect(json.icons).toEqual([
      { src: '/pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: '/pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
    ])
  })

  test('[REQ-PWA-004] Chromium reports no installability errors and a service worker controls the page (mobile viewport)', async ({ page }) => {
    await openControlled(page)
    const viewport = await page.evaluate(() => ({ w: window.innerWidth, touch: navigator.maxTouchPoints > 0 }))
    expect(viewport.w).toBeLessThanOrEqual(500)
    expect(viewport.touch).toBe(true)

    const controller = await page.evaluate(() => {
      const c = navigator.serviceWorker.controller
      return c ? { state: c.state, scope: location.origin + '/' } : null
    })
    expect(controller).toEqual({ state: 'activated', scope: ORIGIN + '/' })

    // the icons the manifest declares really are PNGs of the declared size (REQ-PWA-002)
    const { json } = await manifestOf(page)
    const declared = (json.icons ?? []).map((i) => ({ src: i.src as string, sizes: i.sizes as string }))
    expect(declared).toHaveLength(2)
    for (const i of declared) {
      const res = await page.request.get(ORIGIN + i.src)
      expect({ src: i.src, status: res.status(), type: res.headers()['content-type'] }).toEqual({ src: i.src, status: 200, type: 'image/png' })
      const { width, height } = pngSize(await res.body())
      expect(`${width}x${height}`).toBe(i.sizes)
    }

    const cdp = await page.context().newCDPSession(page)
    const result = await cdp.send('Page.getInstallabilityErrors')
    expect(result.installabilityErrors, JSON.stringify(result.installabilityErrors)).toEqual([])
    await cdp.detach()
  })

  test('[REQ-PWA-004] the real-device install check is recorded in review/pwa-manual-checks.md (add to home screen, open in standalone)', async () => {
    const file = path.join(process.cwd(), 'review', 'pwa-manual-checks.md')
    expect(fs.existsSync(file), 'review/pwa-manual-checks.md exists').toBe(true)
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('standalone')
    expect(text).toContain('主畫面')
  })
})
