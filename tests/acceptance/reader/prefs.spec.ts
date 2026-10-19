import {
  AST,
  STONE_900_80,
  closeTo,
  colorOf,
  expect,
  expectPageAligned,
  gotoReader,
  pageEl,
  readPref,
  setMode,
  styleOf,
  test,
  toggle,
  turnToPage,
  viewportSize,
} from './helpers'

test.describe('preferences and progress', () => {
  test('[REQ-RDR-009] capsule sits at the bottom centre: stone-900 at 80%, backdrop-blur-md, full pill', async ({ page }) => {
    await gotoReader(page)
    const t = toggle(page)
    await expect(t).toHaveCount(1)
    const { w, h } = await viewportSize(page)
    const rect = await t.evaluate((el) => el.getBoundingClientRect().toJSON())
    expect(Math.abs(rect.left + rect.width / 2 - w / 2), 'horizontally centred').toBeLessThanOrEqual(1)
    expect(rect.bottom, 'inside the window').toBeLessThanOrEqual(h)
    expect(rect.bottom, 'in the bottom 15% of the window').toBeGreaterThanOrEqual(h * 0.85)
    const bg = await colorOf(t, 'background-color')
    expect(closeTo(bg, STONE_900_80), `capsule background ${JSON.stringify(bg)}`).toBe(true)
    expect(await styleOf(t, 'backdrop-filter')).toMatch(/blur\(12px\)/)
    const radius = parseFloat(await styleOf(t, 'border-top-left-radius'))
    expect(radius).toBeGreaterThanOrEqual(rect.height / 2)
  })

  test('[REQ-RDR-009] tapping the capsule cycles 注音 -> 拼音 -> 梵文 -> 無音標 -> 注音', async ({ page }) => {
    await gotoReader(page)
    const t = toggle(page)
    const seen: { mode: string | null; text: string }[] = []
    for (let i = 0; i < 5; i++) {
      seen.push({ mode: await t.getAttribute('data-mode'), text: ((await t.textContent()) ?? '').trim() })
      await t.click()
    }
    expect(seen).toEqual([
      { mode: 'zhuyin', text: '注音' },
      { mode: 'pinyin', text: '拼音' },
      { mode: 'iast', text: '梵文' },
      { mode: 'none', text: '無音標' },
      { mode: 'zhuyin', text: '注音' },
    ])
  })

  test('[REQ-RDR-010] first use starts in zhuyin mode', async ({ page }) => {
    await gotoReader(page)
    await expect(toggle(page)).toHaveAttribute('data-mode', 'zhuyin')
    await expect(toggle(page)).toHaveText('注音')
    const first = AST.segments[0].tokens[0].chars![0]
    await expect(page.locator('rt').first()).toHaveText(first.zy)
  })

  test('[REQ-RDR-010] chosen mode survives a reload and is stored in IndexedDB sutraflow/prefs', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'pinyin')
    await expect.poll(() => readPref(page, 'phoneticMode'), { timeout: 5000 }).toEqual({ key: 'phoneticMode', value: 'pinyin' })
    await page.reload()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await expect(toggle(page)).toHaveAttribute('data-mode', 'pinyin')
    await expect(toggle(page)).toHaveText('拼音')
    const first = AST.segments[0].tokens[0].chars![0]
    await expect(page.locator('rt').first()).toHaveText(first.py)
  })

  for (const mode of ['iast', 'none'] as const) {
    test(`[REQ-RDR-010] ${mode} mode is also persisted across reload`, async ({ page }) => {
      await gotoReader(page)
      await setMode(page, mode)
      await expect.poll(() => readPref(page, 'phoneticMode'), { timeout: 5000 }).toEqual({ key: 'phoneticMode', value: mode })
      await page.reload()
      await expect(page.getByTestId('sutra-page')).toHaveCount(9)
      await expect(toggle(page)).toHaveAttribute('data-mode', mode)
    })
  }

  test('[REQ-RDR-011] first use stops at the head of the sutra (page 1 aligned)', async ({ page }) => {
    await gotoReader(page)
    await expectPageAligned(page, 's1')
  })

  test('[REQ-RDR-011] turning to page 4 stores progress s4 in IndexedDB and a reload returns to page 4', async ({ page }) => {
    await gotoReader(page)
    await turnToPage(page, 4)
    await expect.poll(() => readPref(page, 'progress'), { timeout: 5000 }).toEqual({ key: 'progress', value: 's4' })
    await page.reload()
    await expect(page.getByTestId('sutra-page')).toHaveCount(9)
    await expectPageAligned(page, 's4')
    const { w } = await viewportSize(page)
    const s1Left = await pageEl(page, 's1').evaluate((el) => el.getBoundingClientRect().left)
    expect(s1Left, 'page 1 lies to the right of the window').toBeGreaterThanOrEqual(w - 1)
  })
})
