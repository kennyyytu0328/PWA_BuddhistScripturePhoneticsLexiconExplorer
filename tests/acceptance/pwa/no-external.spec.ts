import fs from 'node:fs'
import path from 'node:path'
import type { BrowserContext, Page } from '@playwright/test'
import {
  DIST,
  ORIGIN,
  closeOverlay,
  distIndexHtml,
  expect,
  openControlled,
  openLexicon,
  openVernacular,
  reloadOffline,
  setMode,
  test,
  walk,
} from './helpers'

test.use({ serviceWorkers: 'allow' })

/** The same user flow for the online and the offline run. */
async function exercise(page: Page): Promise<void> {
  for (const mode of ['zhuyin', 'pinyin', 'iast', 'none', 'zhuyin'] as const) await setMode(page, mode)
  await openLexicon(page, '心經真言')
  await closeOverlay(page)
  const drawer = await openLexicon(page, '觀自在')
  await drawer.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
  await expect(drawer.getByTestId('lexicon-headword')).toHaveText('觀音')
  await closeOverlay(page)
  await openVernacular(page, 's1')
  await closeOverlay(page)
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
}

function watch(context: BrowserContext) {
  const urls: string[] = []
  const failed: string[] = []
  context.on('request', (r) => urls.push(r.url()))
  context.on('requestfailed', (r) => failed.push(`${r.url()} ${r.failure()?.errorText ?? ''}`))
  return { urls, failed }
}

const foreign = (urls: string[]): string[] =>
  urls.filter((u) => !u.startsWith(ORIGIN + '/') && !u.startsWith('data:') && !u.startsWith('blob:'))

test.describe('no external network resources', () => {
  test('[REQ-PWA-012] online, from opening the app through every phonetic mode, lexicon drawers and the vernacular panel all requests are same-origin and none fails', async ({ page, context }) => {
    test.setTimeout(120_000)
    const seen = watch(context)
    await openControlled(page)
    await exercise(page)

    expect(seen.urls.length).toBeGreaterThan(10)
    expect(seen.urls.map((u) => new URL(u).pathname)).toEqual(expect.arrayContaining(['/data/heart-sutra.ast.json', '/data/lexicon.dfb.json', '/fonts/serif-sutra.woff2']))
    expect(foreign(seen.urls), 'requests to other origins').toEqual([])
    expect(seen.failed).toEqual([])
  })

  test('[REQ-PWA-012] offline, the same flow produces zero failed requests and no foreign request', async ({ page, context }) => {
    test.setTimeout(120_000)
    await openControlled(page)
    const seen = watch(context)
    await reloadOffline(page)
    await exercise(page)

    expect(seen.urls.length, 'requests were observed offline').toBeGreaterThan(5)
    expect(foreign(seen.urls), 'requests to other origins').toEqual([])
    expect(seen.failed, 'requestfailed events').toEqual([])
  })

  test('[REQ-PWA-012] the built HTML and CSS reference no other origin (no CDN, no online font service)', async () => {
    const html = distIndexHtml()
    const refs = [...html.matchAll(/(?:src|href)="(https?:\/\/[^"]+)"/g)].map((m) => m[1])
    expect(refs, 'index.html references to http(s) URLs').toEqual([])

    const cssFiles = walk(DIST).filter((f) => f.endsWith('.css'))
    expect(cssFiles.length).toBeGreaterThan(1)
    for (const f of cssFiles) {
      const css = fs.readFileSync(f, 'utf8')
      const external = [...css.matchAll(/(?:url\(\s*|@import\s+(?:url\(\s*)?)["']?(https?:)?\/\/[^"')\s]+/g)].map((m) => m[0])
      expect(external, `${path.relative(DIST, f)} external url()/@import`).toEqual([])
    }
  })
})
