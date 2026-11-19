import type { Locator, Page } from '@playwright/test'
import { expect, expectCoverAligned, expectPageAligned, gotoCoverWithPeek, pageEl, readPref, seedPrefs, test, viewportSize } from './helpers'

const back = (page: Page): Locator => page.locator('button[data-testid="back-to-cover"]')

async function gotoLastPage(page: Page): Promise<void> {
  await seedPrefs(page, { peek: true })
  await gotoCoverWithPeek(page, { progress: 's9' })
  await expectPageAligned(page, 's9')
}

const boxOf = (loc: Locator) => loc.evaluate((el) => {
  const r = el.getBoundingClientRect()
  return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
})
type Box = Awaited<ReturnType<typeof boxOf>>
const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom

test.describe('REQ-RDR-040 回到經首', () => {
  test('[REQ-RDR-040] exactly one 回到經首 button, on the last page (s9), fully in view, a 44px-high full pill', async ({ page }) => {
    await gotoLastPage(page)
    await expect(back(page)).toHaveCount(1)
    await expect(pageEl(page, 's9').locator('button[data-testid="back-to-cover"]')).toHaveText('回到經首')
    const { w, h } = await viewportSize(page)
    const b = await boxOf(back(page))
    expect(b.left).toBeGreaterThanOrEqual(0)
    expect(b.right).toBeLessThanOrEqual(w)
    expect(b.top).toBeGreaterThanOrEqual(0)
    expect(b.bottom).toBeLessThanOrEqual(h)
    expect(b.bottom - b.top).toBeGreaterThanOrEqual(44)
    const radius = await back(page).evaluate((el) => parseFloat(getComputedStyle(el).borderTopLeftRadius))
    expect(radius).toBeGreaterThanOrEqual((b.bottom - b.top) / 2 - 0.5)
  })

  test('[REQ-RDR-040] the button overlaps no scripture character, the 白話參考 button or the floating controls', async ({ page }) => {
    await gotoLastPage(page)
    const b = await boxOf(back(page))
    const others = await page
      .locator('[data-testid="sutra-page"][data-segment="s9"] .cell, [data-testid="sutra-page"][data-segment="s9"] [data-testid="vernacular-toggle"], [data-testid="phonetic-toggle"], [data-testid="follow-pace"], [data-testid="follow-toggle"]')
      .evaluateAll((els) => els.map((el) => {
        const r = el.getBoundingClientRect()
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
      }))
    expect(others.length).toBeGreaterThan(10)
    expect(others.filter((o) => overlaps(b, o))).toEqual([])
  })

  test('[REQ-RDR-040] tapping it turns the fold to the cover and saves the cover as the reading progress', async ({ page }) => {
    await gotoLastPage(page)
    await back(page).click()
    await expectCoverAligned(page)
    await expect.poll(() => readPref(page, 'progress').then((r) => (r as { value?: string } | null)?.value), { timeout: 5000 }).toBe('cover')
  })

  test('[REQ-RDR-040] tapping it while following along pauses the follow-along', async ({ page }) => {
    await gotoLastPage(page)
    const toggle = page.locator('button[data-testid="follow-toggle"]')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await back(page).click()
    await expectCoverAligned(page)
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  })
})
