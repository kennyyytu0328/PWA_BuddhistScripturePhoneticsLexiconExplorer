import {
  AST,
  closeOverlay,
  dragDown,
  expect,
  gotoReader,
  openLexicon,
  openVernacular,
  pageEl,
  test,
} from './helpers'

/** Elements whose own text contains `needle` that are not inside the vernacular panel. */
const stray = (arg: string) => {
  const out: string[] = []
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
  let n: Node | null
  while ((n = walker.nextNode())) {
    if ((n.textContent ?? '').includes(arg) && !n.parentElement?.closest('[data-testid="vernacular-panel"]')) {
      out.push(n.parentElement?.tagName.toLowerCase() ?? '?')
    }
  }
  return out
}

test.describe('vernacular reference', () => {
  test('[REQ-RDR-019] every page has exactly one capsule button labelled 白話參考', async ({ page }) => {
    await gotoReader(page)
    for (const seg of AST.segments) {
      const buttons = pageEl(page, seg.id).locator('button[data-testid="vernacular-toggle"]')
      await expect(buttons, `page ${seg.id}`).toHaveCount(1)
      await expect(buttons).toHaveText('白話參考')
    }
    await expect(page.locator('button[data-testid="vernacular-toggle"]')).toHaveCount(9)
  })

  test('[REQ-RDR-019] each page opens its own separate panel: title 白話參考, then vernacular, theme tags, reflection', async ({ page }) => {
    test.setTimeout(180_000)
    await gotoReader(page)
    for (const seg of AST.segments) {
      const panel = await openVernacular(page, seg.id)
      await expect(page.getByTestId('lexicon-drawer')).toHaveCount(0)
      expect(await panel.evaluate((el) => el.hasAttribute('data-vaul-drawer'))).toBe(true)
      await expect(panel.getByTestId('vernacular-title')).toHaveText('白話參考')
      await expect(panel.getByTestId('vernacular-text')).toHaveText(seg.vernacular)
      await expect(panel.getByTestId('vernacular-theme')).toHaveText(seg.themes)
      await expect(panel.getByTestId('vernacular-reflection')).toHaveText(seg.reflection)
      const order = await panel.evaluate((p) => {
        const wanted = ['vernacular-title', 'vernacular-text', 'vernacular-theme', 'vernacular-reflection']
        return [...p.querySelectorAll('[data-testid]')]
          .map((e) => (e as HTMLElement).dataset.testid as string)
          .filter((id) => wanted.includes(id))
          .filter((id, i, all) => all[i - 1] !== id)
      })
      expect(order, `order in ${seg.id}`).toEqual(['vernacular-title', 'vernacular-text', 'vernacular-theme', 'vernacular-reflection'])
      await closeOverlay(page)
    }
  })

  test('[REQ-RDR-019] vernacular and reflection text never appear outside the 白話參考 panel, nor inside a lexicon drawer', async ({ page }) => {
    await gotoReader(page)
    const find = (needle: string) => page.evaluate(stray, needle)
    for (const seg of AST.segments) {
      expect(await find(seg.vernacular), `vernacular ${seg.id} in reading view`).toEqual([])
      expect(await find(seg.reflection), `reflection ${seg.id} in reading view`).toEqual([])
    }
    const drawer = await openLexicon(page, '觀自在')
    const text = (await drawer.textContent()) ?? ''
    for (const seg of AST.segments) {
      expect(text.includes(seg.vernacular), `vernacular ${seg.id} inside lexicon drawer`).toBe(false)
      expect(text.includes(seg.reflection), `reflection ${seg.id} inside lexicon drawer`).toBe(false)
    }
    expect(await drawer.locator('[data-testid^="vernacular"]').count()).toBe(0)
    await closeOverlay(page)

    const panel = await openVernacular(page, 's1')
    expect(await panel.locator('[data-testid="lexicon-sense"], [data-testid="lexicon-def"], [data-testid="lexicon-attribution"], [data-testid="lexicon-drawer"]').count()).toBe(0)
    expect(await panel.evaluate((el) => !!el.closest('[data-testid="lexicon-drawer"]'))).toBe(false)
  })

  test('[REQ-RDR-019] the panel closes by dragging it downwards', async ({ page }) => {
    await gotoReader(page)
    const panel = await openVernacular(page, 's2')
    await dragDown(page, panel)
    await expect(page.getByTestId('vernacular-panel')).toHaveCount(0, { timeout: 5000 })
  })
})
