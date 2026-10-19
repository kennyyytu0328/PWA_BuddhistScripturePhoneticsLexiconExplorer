import type { Page } from '@playwright/test'
import config from '../../../vitest.config'
import {
  closeOverlay,
  expect,
  gotoReader,
  openLexicon,
  openVernacular,
  setMode,
  test,
} from './helpers'
import type { Mode } from './helpers'

// FCP is sensitive to CPU contention from parallel workers, so allow retries for this file.
test.describe.configure({ retries: 2 })

const observers = () => {
  const w = window as any
  w.__cls = 0
  w.__clsEntries = [] as unknown[]
  w.__fcp = null
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as any[]) {
        if (!e.hadRecentInput) {
          w.__cls += e.value
          w.__clsEntries.push({ value: e.value, start: e.startTime })
        }
      }
    }).observe({ type: 'layout-shift', buffered: true })
  } catch { /* unsupported */ }
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) if (e.name === 'first-contentful-paint') w.__fcp = e.startTime
    }).observe({ type: 'paint', buffered: true })
  } catch { /* unsupported */ }
}

const metrics = (page: Page) =>
  page.evaluate(() => {
    const w = window as any
    return { fcp: w.__fcp as number | null, cls: w.__cls as number, shifts: w.__clsEntries as unknown[] }
  })

test.describe('quality', () => {
  test('[REQ-RDR-027] FCP is under 800 ms on the production build (mobile viewport, no throttling)', async ({ page }) => {
    await page.addInitScript(observers)
    await gotoReader(page)
    await expect.poll(async () => (await metrics(page)).fcp, { timeout: 5000 }).not.toBeNull()
    const { fcp } = await metrics(page)
    expect(fcp!, `FCP ${fcp} ms`).toBeLessThan(800)
  })

  test('[REQ-RDR-027] cumulative layout shift stays 0 through load, all phonetic modes, drawer and panel open/close', async ({ page }) => {
    await page.addInitScript(observers)
    await gotoReader(page)
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    for (const mode of ['pinyin', 'iast', 'none', 'zhuyin'] as Mode[]) await setMode(page, mode)
    await openLexicon(page, '觀自在')
    await closeOverlay(page)
    await openLexicon(page, '心經真言')
    await closeOverlay(page)
    await openVernacular(page, 's1')
    await closeOverlay(page)
    await page.waitForTimeout(500)
    const m = await metrics(page)
    expect(m.shifts, 'layout shift entries').toEqual([])
    expect(m.cls).toBe(0)
  })

  test('[REQ-RDR-028] vitest coverage config covers src/** (minus tests and .d.ts) with a line threshold of at least 80', async () => {
    const cfg = config as unknown as {
      test: { coverage: { include: string[]; exclude?: string[]; thresholds: { lines: number } } }
    }
    const cov = cfg.test.coverage
    expect(cov.include.some((p) => p.startsWith('src/')), `coverage.include ${JSON.stringify(cov.include)}`).toBe(true)
    expect((cov.exclude ?? []).some((p) => /test/.test(p)), 'tests excluded').toBe(true)
    expect((cov.exclude ?? []).some((p) => p.includes('.d.ts')), 'type declarations excluded').toBe(true)
    expect(cov.thresholds.lines).toBeGreaterThanOrEqual(80)
  })
})
