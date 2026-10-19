import fs from 'node:fs'
import path from 'node:path'
import type { Page } from '@playwright/test'
import {
  collectPageErrors,
  expect,
  gotoReader,
  installDeviceStubs,
  test,
  wakeLockLog,
} from './helpers'

const setVisibility = (page: Page, state: 'hidden' | 'visible') =>
  page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => s })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => s === 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)

test.describe('device APIs', () => {
  test('[REQ-RDR-020] opening the reading screen requests the screen wake lock once', async ({ page }) => {
    await installDeviceStubs(page, { wakeLock: 'record' })
    await gotoReader(page)
    await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen'])
    await page.waitForTimeout(500)
    expect((await wakeLockLog(page)).requests).toEqual(['screen'])
  })

  test('[REQ-RDR-020] going to the background does not request; coming back to the foreground requests again', async ({ page }) => {
    await installDeviceStubs(page, { wakeLock: 'record' })
    await gotoReader(page)
    await expect.poll(async () => (await wakeLockLog(page)).requests.length).toBe(1)
    await setVisibility(page, 'hidden')
    await page.waitForTimeout(300)
    expect((await wakeLockLog(page)).requests).toEqual(['screen'])
    await setVisibility(page, 'visible')
    await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen', 'screen'])
  })

  test('[REQ-RDR-020] hook lives in src/hooks/useWakeLock.ts', async () => {
    expect(fs.existsSync(path.join(process.cwd(), 'src', 'hooks', 'useWakeLock.ts'))).toBe(true)
  })

  test('[REQ-RDR-020] without the Wake Lock API reading works and nothing throws', async ({ page }) => {
    await installDeviceStubs(page, { wakeLock: 'absent' })
    const errors = collectPageErrors(page)
    await gotoReader(page)
    expect(await page.evaluate(() => 'wakeLock' in navigator && !!navigator.wakeLock)).toBe(false)
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await page.waitForTimeout(300)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-020] a rejected wake lock request is swallowed: reading works, no page error', async ({ page }) => {
    await installDeviceStubs(page, { wakeLock: 'reject' })
    const errors = collectPageErrors(page)
    await gotoReader(page)
    await expect.poll(async () => (await wakeLockLog(page)).requests).toEqual(['screen'])
    await setVisibility(page, 'hidden')
    await setVisibility(page, 'visible')
    await page.waitForTimeout(300)
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    expect(errors).toEqual([])
  })

  test('[REQ-RDR-020] always on while reading: there is no switch or checkbox, only the known buttons', async ({ page }) => {
    await gotoReader(page)
    expect(await page.locator('[role="switch"], input[type="checkbox"], input[type="radio"]').count()).toBe(0)
    const testIds = await page.locator('button').evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLElement).dataset.testid ?? '(none)'))].sort())
    expect(testIds).toEqual(['lex-token', 'phonetic-toggle', 'vernacular-toggle'])
  })
})
