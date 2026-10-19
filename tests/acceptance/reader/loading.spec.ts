import type { Page, Route } from '@playwright/test'
import { expect, shotBase64, test } from './helpers'

const AST_URL = '**/data/heart-sutra.ast.json'
const LEX_URL = '**/data/lexicon.dfb.json'

type Failure = 'network' | 'status500' | 'badjson'

async function fail(route: Route, how: Failure): Promise<void> {
  if (how === 'network') return route.abort('failed')
  if (how === 'status500') return route.fulfill({ status: 500, contentType: 'text/plain', body: 'boom' })
  return route.fulfill({ status: 200, contentType: 'application/json', body: '{"segments": [' })
}

const visibleLines = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    document.body.innerText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  )

test.describe('loading and load failure', () => {
  for (const [label, url] of [['AST', AST_URL], ['lexicon', LEX_URL]] as const) {
    test(`[REQ-RDR-029] while ${label} is still loading the screen is plain stone-950: no text, spinner or skeleton`, async ({ page }) => {
      let release!: () => void
      const gate = new Promise<void>((r) => { release = r })
      await page.route(url, async (route) => {
        await gate
        await route.continue()
      })
      await page.goto('/', { waitUntil: 'commit' })
      await page.waitForLoadState('load')
      await page.waitForTimeout(500)

      expect(await visibleLines(page)).toEqual([])
      expect(await page.locator('svg, img, canvas, progress, [role="progressbar"], [aria-busy="true"], [data-testid="load-error"], [data-testid="sutra-page"]').count()).toBe(0)
      const stats = await page.evaluate(async (b64) => (window as any).__t.deviants(b64, [12, 10, 9], 2), await shotBase64(page))
      expect(stats.deviants, 'pixels that are not #0c0a09').toBe(0)

      release()
      await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 10_000 })
    })
  }

  for (const [label, url] of [['AST', AST_URL], ['lexicon', LEX_URL]] as const) {
    for (const how of ['network', 'status500', 'badjson'] as Failure[]) {
      test(`[REQ-RDR-029] ${label} fails (${how}): one line 經文載入失敗 and a pill button 重新載入, no partial scripture`, async ({ page }) => {
        await page.route(url, (route) => fail(route, how))
        await page.goto('/')
        const err = page.getByTestId('load-error')
        await expect(err).toBeVisible({ timeout: 10_000 })
        const btn = err.getByTestId('reload-button')
        await expect(btn).toHaveText('重新載入')
        expect(await btn.evaluate((el) => el.tagName)).toBe('BUTTON')
        expect(await visibleLines(page)).toEqual(['經文載入失敗', '重新載入'])
        const radius = await btn.evaluate((el) => ({ r: parseFloat(getComputedStyle(el).borderTopLeftRadius), h: el.getBoundingClientRect().height }))
        expect(radius.r).toBeGreaterThanOrEqual(radius.h / 2)
        await expect(page.getByTestId('sutra-page')).toHaveCount(0)
        await expect(page.locator('[data-testid="lex-token"], [data-testid="token"], [data-testid="punct"]')).toHaveCount(0)
      })
    }
  }

  test('[REQ-RDR-029] clicking 重新載入 fetches both files again and then shows the scripture', async ({ page }) => {
    let broken = true
    const hits: Record<string, number> = { ast: 0, lex: 0 }
    await page.route(AST_URL, async (route) => {
      hits.ast++
      if (broken) return route.fulfill({ status: 500, body: 'boom' })
      return route.continue()
    })
    await page.route(LEX_URL, async (route) => {
      hits.lex++
      return route.continue()
    })
    await page.goto('/')
    await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 10_000 })
    const before = { ...hits }
    broken = false
    await page.getByTestId('reload-button').click()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 10_000 })
    await expect(page.getByTestId('load-error')).toHaveCount(0)
    expect(hits.ast).toBe(before.ast + 1)
    expect(hits.lex).toBe(before.lex + 1)
  })

  test('[REQ-RDR-029] a failed lexicon recovers the same way', async ({ page }) => {
    let broken = true
    await page.route(LEX_URL, async (route) => {
      if (broken) return route.abort('failed')
      return route.continue()
    })
    await page.goto('/')
    await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 10_000 })
    broken = false
    await page.getByTestId('reload-button').click()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9, { timeout: 10_000 })
    expect(await visibleLines(page)).not.toContain('經文載入失敗')
  })
})
