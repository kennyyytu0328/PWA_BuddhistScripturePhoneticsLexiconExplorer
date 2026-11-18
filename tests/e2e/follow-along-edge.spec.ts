import { expect, gotoReader, pageRight, test, viewportSize } from '../acceptance/reader/helpers'

test('opening a term mid-turn pauses and the page still aligns', async ({ page }) => {
  await page.clock.install()
  await gotoReader(page)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)

  const toggle = page.locator('button[data-testid="follow-toggle"]')
  await toggle.click()
  await expect(toggle).toHaveText('停')

  // Run until the cursor reaches the first character of s2, which starts the page turn.
  const cursorSegment = () =>
    page.evaluate(() => document.querySelector('[data-follow="current"]')?.closest('[data-testid="sutra-page"]')?.getAttribute('data-segment'))
  for (let i = 0; i < 400 && (await cursorSegment()) !== 's2'; i++) await page.clock.runFor(100)
  expect(await cursorSegment()).toBe('s2')

  // The slide is a transform on every page; open a term while it is still running.
  await page.clock.runFor(100)
  await page.locator('[data-segment="s2"] button[data-testid="lex-token"]').first().dispatchEvent('click')
  await expect(toggle).toHaveText('誦')

  const { w } = await viewportSize(page)
  for (let i = 0; i < 60; i++) {
    await page.clock.runFor(50)
    await page.waitForTimeout(20)
  }
  expect(Math.abs((await pageRight(page, 's2')) - w)).toBeLessThanOrEqual(1.5)
  await expect(toggle).toHaveText('誦')
  // Snapping is switched off only while the slide runs; no inline override may remain afterwards.
  expect(await page.locator('[data-testid="sutra-viewport"]').evaluate((el) => (el as HTMLElement).style.scrollSnapType)).toBe('')
})
