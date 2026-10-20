import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import { DIST, ORIGIN, distIndexHtml, expect, gotoReader, pngSize, test, walk } from './helpers'
import { ICON_LIB_SRC } from './icon-lib'

test.use({ serviceWorkers: 'allow' })

const ICONS = [
  { url: '/pwa-192x192.png', size: 192 },
  { url: '/pwa-512x512.png', size: 512 },
  { url: '/apple-touch-icon.png', size: 180 },
] as const

async function fetchPng(page: Page, url: string) {
  const res = await page.request.get(ORIGIN + url)
  const type = (res.headers()['content-type'] ?? '').split(';')[0].trim()
  // fail here (not in the image decoder) when the URL is missing and the SPA fallback answers with HTML
  expect({ url, status: res.status(), type }).toEqual({ url, status: 200, type: 'image/png' })
  return { status: res.status(), type, body: await res.body() }
}

test.describe('icons and favicon', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(ICON_LIB_SRC)
  })

  for (const icon of ICONS) {
    test(`[REQ-PWA-002] ${icon.url} is served as image/png with pixel size ${icon.size}x${icon.size}`, async ({ page }) => {
      const png = await fetchPng(page, icon.url)
      expect(png.status).toBe(200)
      expect(png.type).toBe('image/png')
      expect(pngSize(png.body)).toEqual({ width: icon.size, height: icon.size })
    })
  }

  for (const icon of ICONS) {
    test(`[REQ-PWA-002] ${icon.url} is fully opaque, greyscale (max-min <= 10), #0c0a09 corners, light grey-white ink`, async ({ page }) => {
      const png = await fetchPng(page, icon.url)
      expect(png.status).toBe(200)
      await page.goto('/')
      const s = await page.evaluate(async (b64) => {
        const I = (window as any).__icon
        return I.stats(await I.decodeB64(b64))
      }, png.body.toString('base64'))
      expect({ w: s.w, h: s.h }).toEqual({ w: icon.size, h: icon.size })
      expect(s.nonOpaque, 'pixels with alpha != 255').toBe(0)
      expect(s.nonGray, 'pixels with max(R,G,B) - min(R,G,B) > 10').toBe(0)
      expect(s.corners).toEqual([[12, 10, 9, 255], [12, 10, 9, 255], [12, 10, 9, 255], [12, 10, 9, 255]])
      expect(s.ink, 'pixels with every channel >= 200').toBeGreaterThan(icon.size * icon.size * 0.01)
      expect(Math.min(...s.peak), `brightest pixel ${JSON.stringify(s.peak)} is light grey-white`).toBeGreaterThanOrEqual(200)
    })
  }

  test('[REQ-PWA-002] the 512 icon is maskable: outside the centre 80% diameter circle every pixel is exactly #0c0a09, all ink lies inside', async ({ page }) => {
    const png = await fetchPng(page, '/pwa-512x512.png')
    expect(png.status).toBe(200)
    await page.goto('/')
    const s = await page.evaluate(async (b64) => {
      const I = (window as any).__icon
      return I.stats(await I.decodeB64(b64))
    }, png.body.toString('base64'))
    expect(s.w).toBe(512)
    expect(s.outsideTotal).toBeGreaterThan(50_000)
    expect(s.outsideNotBg, 'pixels outside the safe circle that are not #0c0a09').toBe(0)
    expect(s.inkOutside, 'ink pixels outside the safe circle').toBe(0)
    expect(s.ink).toBeGreaterThan(512 * 512 * 0.01)
  })

  test('[REQ-PWA-002] the icon glyph is 心 set in the bundled Noto Serif TC (shape matches the rendered glyph, not another character)', async ({ page }) => {
    const png = await fetchPng(page, '/pwa-512x512.png')
    expect(png.status).toBe(200)
    await gotoReader(page)
    const r = await page.evaluate(async (b64) => {
      const I = (window as any).__icon
      const shape = I.shape(await I.decodeB64(b64), 128)
      const xin = await I.glyph('心', 128)
      const kong = await I.glyph('空', 128)
      return { faces: xin.faces, iouXin: I.iou(shape.mask, xin.mask), iouKong: I.iou(shape.mask, kong.mask), hasInk: shape.bbox !== null }
    }, png.body.toString('base64'))
    expect(r.hasInk).toBe(true)
    expect(r.faces, 'Noto Serif TC font faces loaded for 心').toBeGreaterThan(0)
    expect(r.iouXin, `IoU with 心 = ${r.iouXin}`).toBeGreaterThanOrEqual(0.75)
    expect(r.iouXin - r.iouKong, `IoU 心 ${r.iouXin} vs 空 ${r.iouKong}`).toBeGreaterThanOrEqual(0.1)
  })

  test('[REQ-PWA-002] 192, 512 and the 180 apple-touch icon are the same design (ink shapes match after scaling)', async ({ page }) => {
    const [a, b, c] = await Promise.all(ICONS.map((i) => fetchPng(page, i.url)))
    for (const p of [a, b, c]) expect(p.status).toBe(200)
    await page.goto('/')
    const r = await page.evaluate(async ([b192, b512, b180]) => {
      const I = (window as any).__icon
      const m = async (b64: string) => I.shape(await I.decodeB64(b64), 128).mask
      const [s192, s512, s180] = [await m(b192), await m(b512), await m(b180)]
      return { iou192: I.iou(s192, s512), iou180: I.iou(s180, s512) }
    }, [a.body.toString('base64'), b.body.toString('base64'), c.body.toString('base64')])
    expect(r.iou192, `192 vs 512 IoU ${r.iou192}`).toBeGreaterThanOrEqual(0.8)
    expect(r.iou180, `180 vs 512 IoU ${r.iou180}`).toBeGreaterThanOrEqual(0.8)
  })

  test('[REQ-PWA-002] index.html has exactly one <link rel="apple-touch-icon"> pointing to /apple-touch-icon.png', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel="apple-touch-icon"]')].map((l) => (l as HTMLLinkElement).href),
    )
    expect(hrefs).toEqual([ORIGIN + '/apple-touch-icon.png'])
  })

  test('[REQ-PWA-003] the favicon referenced by index.html is the project icon: greyscale, same shape as the 192 icon, not the Vite template', async ({ page }) => {
    await page.goto('/')
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll('link[rel~="icon"]')].map((l) => (l as HTMLLinkElement).href),
    )
    expect(hrefs.length, 'favicon <link rel="icon"> elements').toBeGreaterThanOrEqual(1)
    const png192 = await fetchPng(page, '/pwa-192x192.png')
    expect(png192.status).toBe(200)
    for (const href of hrefs) {
      expect(href.startsWith(ORIGIN + '/'), `favicon ${href} is same-origin`).toBe(true)
      const res = await page.request.get(href)
      expect(res.status(), href).toBe(200)
      const body = (await res.body()).toString('latin1')
      expect(body, `${href} must not be the Vite template (purple #863bff)`).not.toMatch(/863bff/i)
      expect(body, `${href} must not carry the Vite template colour #47bfff`).not.toMatch(/47bfff/i)
      const r = await page.evaluate(
        async ([url, b64]) => {
          const I = (window as any).__icon
          const fav = await I.decodeUrl(url, 192)
          const ref = await I.decodeB64(b64)
          return {
            stats: I.stats(fav),
            iou: I.iou(I.shape(fav, 128).mask, I.shape(ref, 128).mask),
          }
        },
        [href, png192.body.toString('base64')],
      )
      expect(r.stats.nonGray, `${href}: non-greyscale pixels`).toBe(0)
      expect(r.stats.ink, `${href}: has light ink`).toBeGreaterThan(192 * 192 * 0.01)
      expect(r.iou, `${href}: IoU with the 192 icon ${r.iou}`).toBeGreaterThanOrEqual(0.8)
    }
  })

  test('[REQ-PWA-003] the build output contains no icons.svg and no Vite template favicon', async () => {
    const files = walk(DIST)
    expect(files.length, 'dist/ exists (run pnpm build first)').toBeGreaterThan(0)
    expect(files.filter((f) => path.basename(f) === 'icons.svg')).toEqual([])
    for (const f of files.filter((f) => f.endsWith('.svg'))) {
      expect(fs.readFileSync(f, 'utf8'), `${f} is the Vite template`).not.toMatch(/863bff/i)
    }
    expect(distIndexHtml()).not.toContain('icons.svg')
  })
})
