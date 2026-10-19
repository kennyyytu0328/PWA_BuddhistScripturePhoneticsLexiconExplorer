import type { Page } from '@playwright/test'
import { DISTINCT_LEX, closeOverlay, expect, gotoReader, lexToken, openLexicon, test } from './helpers'

interface Radii { el: string; height: number; radii: number[] }

/** Full-pill violations among the elements matching `sel`, plus how many were inspected. */
const pillReport = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    const bad = els
      .map((el) => {
        const cs = getComputedStyle(el)
        const h = el.getBoundingClientRect().height
        return {
          el: (el as HTMLElement).dataset.testid + ':' + (el.textContent ?? '').trim().slice(0, 8),
          height: h,
          radii: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => parseFloat(cs.getPropertyValue(`border-${c}-radius`))),
        }
      })
      .filter((r) => r.radii.some((x) => !(x >= r.height / 2)))
    return { count: els.length, bad: bad as Radii[] }
  }, sel)

const squareReport = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const els = [...document.querySelectorAll(s)]
    const bad = els
      .map((el) => {
        const cs = getComputedStyle(el)
        return {
          el: (el as HTMLElement).dataset.lex ?? '?',
          radii: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => parseFloat(cs.getPropertyValue(`border-${c}-radius`))),
        }
      })
      .filter((r) => r.radii.some((x) => x !== 0))
    return { count: els.length, bad }
  }, sel)

test.describe('pill scope', () => {
  test('[REQ-RDR-023] phonetic toggle and every 白話參考 button are full pills', async ({ page }) => {
    await gotoReader(page)
    const a = await pillReport(page, 'button[data-testid="phonetic-toggle"]')
    expect(a.count).toBe(1)
    expect(a.bad).toEqual([])
    const b = await pillReport(page, 'button[data-testid="vernacular-toggle"]')
    expect(b.count).toBe(9)
    expect(b.bad).toEqual([])
  })

  test('[REQ-RDR-023] every clickable lexicon-xref (all 38 drawers) and the 返回 button are full pills', async ({ page }) => {
    test.setTimeout(240_000)
    await gotoReader(page)
    let xrefs = 0
    const bad: Radii[] = []
    for (const lex of DISTINCT_LEX) {
      await openLexicon(page, lex)
      const r = await pillReport(page, 'button[data-testid="lexicon-xref"]')
      xrefs += r.count
      bad.push(...r.bad)
      if (lex === '觀自在') {
        expect(await page.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).count()).toBe(1)
        await page.locator('button[data-testid="lexicon-xref"]', { hasText: '觀音' }).click()
        const back = await pillReport(page, 'button[data-testid="lexicon-back"]')
        expect(back.count).toBe(1)
        expect(back.bad).toEqual([])
      }
      await closeOverlay(page)
    }
    expect(xrefs).toBeGreaterThan(0)
    expect(bad).toEqual([])
  })

  test('[REQ-RDR-023] the 重新載入 button on the error screen is a full pill', async ({ page }) => {
    await page.route('**/data/heart-sutra.ast.json', (route) => route.fulfill({ status: 500, body: 'boom' }))
    await page.goto('/')
    await expect(page.getByTestId('reload-button')).toBeVisible({ timeout: 10_000 })
    const r = await pillReport(page, 'button[data-testid="reload-button"]')
    expect(r.count).toBe(1)
    expect(r.bad).toEqual([])
  })

  test('[REQ-RDR-023] scripture lex tokens are not pills: all four radii are 0, at rest and highlighted', async ({ page }) => {
    await gotoReader(page)
    const rest = await squareReport(page, 'button[data-testid="lex-token"]')
    expect(rest.count).toBe(52)
    expect(rest.bad).toEqual([])
    await openLexicon(page, '觀自在')
    const active = await squareReport(page, 'button[data-testid="lex-token"][data-active="true"]')
    expect(active.count).toBe(1)
    expect(active.bad).toEqual([])
    const all = await squareReport(page, 'button[data-testid="lex-token"]')
    expect(all.bad).toEqual([])
  })

  test('[REQ-RDR-023] a keyboard-focused lex token keeps radius 0 (square focus ring)', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '觀自在')
    await closeOverlay(page) // Escape: focus returns to the token
    const token = lexToken(page, '觀自在')
    if (!(await token.evaluate((el) => document.activeElement === el))) await token.focus()
    const info = await token.evaluate((el) => {
      const cs = getComputedStyle(el)
      return {
        focused: document.activeElement === el,
        radii: ['top-left', 'top-right', 'bottom-left', 'bottom-right'].map((c) => parseFloat(cs.getPropertyValue(`border-${c}-radius`))),
        outlineStyle: cs.outlineStyle,
        outlineWidth: cs.outlineWidth,
      }
    })
    expect(info.focused).toBe(true)
    expect(info.radii).toEqual([0, 0, 0, 0])
  })
})
