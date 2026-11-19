import type { Page } from '@playwright/test'
import { MODE_ORDER, expect, gotoReader, lexToken, openLexicon, setMode, test } from './helpers'
import type { Mode } from './helpers'

// ---------------------------------------------------------------------------
// REQ-RDR-041 名相線: a 1px stone-400 (60%) vertical line on the left of every character cell of a term
// (button[data-testid="lex-token"]), drawn as the cell's ::before. Pseudo-elements have no box, so
// everything is read from computed style.
// ---------------------------------------------------------------------------

interface LineInfo {
  where: string
  content: string
  position: string
  width: string
  bg: number[]
  top: string
  bottom: string
  right: string
  marginRight: string
  transitionDurations: string[]
  animationName: string
  cellRight: number
  cellWidth: number
  rtLeft: number | null
  isFirst: boolean
  isLast: boolean
}

/** Computed ::before of every .cell inside a term, with its position in the term. */
const termLines = (page: Page): Promise<LineInfo[]> =>
  page.evaluate(() => {
    const T = (window as unknown as { __t: { exact: (c: string) => number[] } }).__t
    const out: LineInfo[] = []
    for (const tok of document.querySelectorAll('button[data-testid="lex-token"]')) {
      const cells = [...tok.querySelectorAll('.cell')]
      cells.forEach((cell, i) => {
        const cs = getComputedStyle(cell, '::before')
        const rt = cell.querySelector('rt')
        out.push({
          where: `${(tok as HTMLElement).dataset.lex}[${i}/${cells.length}]`,
          content: cs.content,
          position: cs.position,
          width: cs.width,
          bg: T.exact(cs.backgroundColor),
          top: cs.top,
          bottom: cs.bottom,
          right: cs.right,
          marginRight: cs.marginRight,
          transitionDurations: cs.transitionDuration.split(',').map((s) => s.trim()),
          animationName: cs.animationName,
          cellRight: cell.getBoundingClientRect().right,
          cellWidth: cell.getBoundingClientRect().width,
          rtLeft: rt ? rt.getBoundingClientRect().left : null,
          isFirst: i === 0,
          isLast: i === cells.length - 1,
        })
      })
    }
    return out
  })

const isNone = (content: string): boolean => content === 'none' || content === 'normal'
const isZeroTime = (s: string): boolean => parseFloat(s) === 0

/** Every violation of the REQ-RDR-041 line spec among the term cells. */
function lineViolations(lines: LineInfo[]): string[] {
  const bad: string[] = []
  for (const l of lines) {
    if (isNone(l.content)) bad.push(`${l.where}: ::before content is ${l.content}`)
    if (l.position !== 'absolute') bad.push(`${l.where}: position ${l.position}`)
    if (Math.abs(parseFloat(l.width) - 1) > 0.05) bad.push(`${l.where}: width ${l.width}`)
    const [r, g, b, a] = l.bg
    if (Math.abs(r - 168) > 2 || Math.abs(g - 162) > 2 || Math.abs(b - 158) > 2 || Math.abs(a - 0.6) > 0.02) {
      bad.push(`${l.where}: background ${l.bg.join(',')}`)
    }
    if (!l.transitionDurations.every(isZeroTime)) bad.push(`${l.where}: transition ${l.transitionDurations.join(',')}`)
    if (l.animationName !== 'none') bad.push(`${l.where}: animation ${l.animationName}`)
    const wantTop = l.isFirst ? 3 : 0
    const wantBottom = l.isLast ? 3 : 0
    if (Math.abs(parseFloat(l.top) - wantTop) > 0.05) bad.push(`${l.where}: top ${l.top}, want ${wantTop}px`)
    if (Math.abs(parseFloat(l.bottom) - wantBottom) > 0.05) bad.push(`${l.where}: bottom ${l.bottom}, want ${wantBottom}px`)
  }
  return bad
}

async function seedFrozenFollow(page: Page): Promise<void> {
  await page.clock.install()
  await gotoReader(page)
  const now = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(now + 200)
}

test.describe('REQ-RDR-041 名相線', () => {
  for (const mode of MODE_ORDER) {
    test(`[REQ-RDR-041] ${mode} mode: every cell of every term has a 1px stone-400/60% absolute ::before line with no transition or animation`, async ({ page }) => {
      await gotoReader(page)
      await setMode(page, mode)
      const lines = await termLines(page)
      expect(lines.length).toBeGreaterThan(100)
      expect(lineViolations(lines).slice(0, 12)).toEqual([])
    })
  }

  test('[REQ-RDR-041] the line sits on the left of the character, clear of the <rt>', async ({ page }) => {
    await gotoReader(page)
    for (const mode of MODE_ORDER) {
      await setMode(page, mode)
      const lines = await termLines(page)
      const bad: string[] = []
      for (const l of lines) {
        const right = parseFloat(l.right)
        const margin = parseFloat(l.marginRight)
        if (!Number.isFinite(right)) {
          bad.push(`${mode} ${l.where}: right "${l.right}"`)
          continue
        }
        // the cell is the containing block: the line's right edge is right + margin-right in from the cell's right edge
        const x1 = l.cellRight - right - (Number.isFinite(margin) ? margin : 0)
        const x0 = x1 - 1
        if (x0 + 0.5 > l.cellRight - l.cellWidth * 0.5 + 0.5) bad.push(`${mode} ${l.where}: line not in the left half of the cell`)
        if (l.rtLeft !== null && x1 > l.rtLeft + 0.5) bad.push(`${mode} ${l.where}: line overlaps the <rt>`)
      }
      expect(bad.slice(0, 10)).toEqual([])
    }
  })

  test('[REQ-RDR-041] the line has the same right / margin-right / width as the amber follow mark (::after of the current cell)', async ({ page }) => {
    await seedFrozenFollow(page)
    await page.locator('button[data-testid="follow-toggle"]').click()
    await expect(page.locator('button[data-testid="follow-toggle"]')).toHaveText('停')
    // character 0 belongs to the term 觀自在
    const cell = page.locator('button[data-testid="lex-token"] .cell[data-follow="current"]')
    await expect(cell).toHaveCount(1)
    const [before, after] = await cell.evaluate((el) => {
      const pick = (p: '::before' | '::after') => {
        const cs = getComputedStyle(el, p)
        return { content: cs.content, right: cs.right, marginRight: cs.marginRight, width: cs.width }
      }
      return [pick('::before'), pick('::after')]
    })
    expect(isNone(before.content)).toBe(false)
    expect(isNone(after.content)).toBe(false)
    expect(before.right).toBe(after.right)
    expect(before.marginRight).toBe(after.marginRight)
    expect(before.width).toBe(after.width)
  })

  test('[REQ-RDR-041] first cell of a term is inset 3px at the top, last 3px at the bottom, the others reach 0; a single-character term is inset at both ends', async ({ page }) => {
    await gotoReader(page)
    const lines = await termLines(page)
    const single = lines.filter((l) => l.isFirst && l.isLast)
    const multi = lines.filter((l) => !(l.isFirst && l.isLast))
    expect(single.length).toBeGreaterThan(0) // 空, 度, 色, 智, 苦
    expect(multi.some((l) => !l.isFirst && !l.isLast)).toBe(true)
    for (const l of single) {
      expect([l.where, l.top, l.bottom]).toEqual([l.where, '3px', '3px'])
    }
    for (const l of multi) {
      expect([l.where, l.top]).toEqual([l.where, l.isFirst ? '3px' : '0px'])
      expect([l.where, l.bottom]).toEqual([l.where, l.isLast ? '3px' : '0px'])
    }
  })

  test('[REQ-RDR-041] cells outside terms and punctuation have no line (::before content none)', async ({ page }) => {
    await gotoReader(page)
    for (const mode of MODE_ORDER) {
      await setMode(page, mode)
      const res = await page.evaluate(() => {
        const plain = [
          ...document.querySelectorAll('[data-testid="token"] .cell'),
          ...document.querySelectorAll('[data-testid="punct"], [data-testid="punct"] .cell'),
        ]
        return { count: plain.length, withLine: plain.filter((el) => { const c = getComputedStyle(el, '::before').content; return c !== 'none' && c !== 'normal' }).length }
      })
      expect(res.count).toBeGreaterThan(20)
      expect([mode, res.withLine]).toEqual([mode, 0])
    }
  })

  test('[REQ-RDR-041] the line stays while a term is highlighted (data-active) and while the follow-along runs', async ({ page }) => {
    await gotoReader(page)
    await openLexicon(page, '觀自在')
    await expect(page.locator('[data-active="true"]')).toHaveCount(1)
    const active = await page.evaluate(() => {
      const t = document.querySelector('button[data-testid="lex-token"][data-active="true"]')!
      return [...t.querySelectorAll('.cell')].map((c) => getComputedStyle(c, '::before').content)
    })
    expect(active.length).toBe(3)
    expect(active.every((c) => !isNone(c))).toBe(true)
    expect(lineViolations((await termLines(page)).filter((l) => l.where.startsWith('觀自在')))).toEqual([])
  })

  test('[REQ-RDR-041] the line is unchanged while the follow-along is running (data-follow present)', async ({ page }) => {
    await seedFrozenFollow(page)
    await page.locator('button[data-testid="follow-toggle"]').click()
    await expect(page.locator('button[data-testid="follow-toggle"]')).toHaveText('停')
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    expect(lineViolations(await termLines(page)).slice(0, 12)).toEqual([])
    await page.locator('button[data-testid="follow-toggle"]').click() // paused keeps data-follow
    await expect(page.locator('button[data-testid="follow-toggle"]')).toHaveText('誦')
    expect(await page.locator('[data-follow]').count()).toBeGreaterThan(0)
    expect(lineViolations(await termLines(page)).slice(0, 12)).toEqual([])
  })

  test('[REQ-RDR-041] the line takes no space: with the ::before suppressed every .cell and lex-token box is identical, in every mode', async ({ page }) => {
    await gotoReader(page)
    const boxes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('.cell, button[data-testid="lex-token"], [data-testid="token"]')].map((el) => {
          const p = el.closest('[data-testid="sutra-page"]')!.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          return [r.left - p.left, r.top - p.top, r.width, r.height].map((n) => Math.round(n * 100) / 100)
        }),
      )
    for (const mode of MODE_ORDER as Mode[]) {
      await setMode(page, mode)
      const withLine = await boxes()
      const handle = await page.addStyleTag({ content: '.cell::before { content: none !important; }' })
      const without = await boxes()
      await handle.evaluate((el) => el.remove())
      expect(without.length).toBe(withLine.length)
      expect(without).toEqual(withLine)
    }
  })

  test('[REQ-RDR-041] switching through all modes and back leaves term and cell boxes where they were (CLS = 0)', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'zhuyin')
    const boxes = () =>
      page.evaluate(() =>
        [...document.querySelectorAll('button[data-testid="lex-token"]')].map((el) => {
          const p = el.closest('[data-testid="sutra-page"]')!.getBoundingClientRect()
          const r = el.getBoundingClientRect()
          return [r.left - p.left, r.top - p.top, r.width, r.height].map((n) => Math.round(n))
        }),
      )
    const start = await boxes()
    for (const mode of ['pinyin', 'iast', 'none', 'zhuyin'] as Mode[]) await setMode(page, mode)
    expect(await boxes()).toEqual(start)
  })

  test('[REQ-RDR-041] the touch target is still hit: the centre of a term hits the term itself', async ({ page }) => {
    await gotoReader(page)
    for (const mode of ['zhuyin', 'none'] as Mode[]) {
      await setMode(page, mode)
      const tok = lexToken(page, '觀自在')
      await tok.scrollIntoViewIfNeeded()
      const hit = await tok.evaluate((el) => {
        const r = el.getBoundingClientRect()
        const found = document.elementFromPoint((r.left + r.right) / 2, (r.top + r.bottom) / 2)
        return { hits: found?.closest('button[data-testid="lex-token"]') === el, display: getComputedStyle(el).display }
      })
      expect([mode, hit.hits, hit.display]).toEqual([mode, true, 'inline-block'])
    }
  })
})
