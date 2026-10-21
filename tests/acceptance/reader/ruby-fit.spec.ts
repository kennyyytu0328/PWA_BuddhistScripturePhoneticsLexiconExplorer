import { ALL_TOKENS, expect, gotoReader, setMode, tcall, test } from './helpers'
import type { Mode } from './helpers'

interface R { left: number; top: number; right: number; bottom: number }
interface RtInfo { fontSize: string; text: R | null; cell: R; page: string | null }

/** Actual text extent of every <rt> (union of per-character Range rects) plus the cell it must fit in. */
const collectRts = (mode: string) =>
  [...document.querySelectorAll('rt')].map((rt) => {
    const rects: DOMRect[] = []
    const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT)
    let n: Node | null
    while ((n = walker.nextNode())) {
      const len = (n.textContent ?? '').length
      for (let i = 0; i < len; i++) {
        const r = document.createRange()
        r.setStart(n, i)
        r.setEnd(n, i + 1)
        rects.push(...Array.from(r.getClientRects()).filter((x) => x.width > 0 || x.height > 0))
      }
    }
    const union = rects.length
      ? { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) }
      : null
    const cellEl = mode === 'iast'
      ? rt.closest('[data-testid="lex-token"], [data-testid="token"]')
      : rt.closest('ruby')
    const c = cellEl!.getBoundingClientRect()
    return {
      fontSize: getComputedStyle(rt).fontSize,
      text: union,
      cell: { left: c.left, top: c.top, right: c.right, bottom: c.bottom },
      page: (rt.closest('[data-testid="sutra-page"]') as HTMLElement | null)?.dataset.segment ?? null,
    }
  })

for (const mode of ['zhuyin', 'pinyin', 'iast'] as const) {
  test(`[REQ-RDR-008] ${mode}: every <rt> is 10px, stays inside its cell along the column, and no two rt in a column overlap`, async ({ page }) => {
    await gotoReader(page)
    await setMode(page, mode)
    const rts = await page.evaluate(collectRts, mode)
    expect(rts.length).toBeGreaterThan(0)
    if (mode === 'iast') expect(rts.length).toBe(ALL_TOKENS.filter((t) => t.iast).length)
    else expect(rts.length).toBe(ALL_TOKENS.reduce((n, t) => n + (t.chars?.length ?? 0), 0))

    const badSize = rts.map((r, i) => ({ i, size: r.fontSize })).filter((r) => r.size !== '10px')
    expect(badSize).toEqual([])

    const outside = rts
      .map((r, i) => ({ i, page: r.page, text: r.text, cell: r.cell }))
      .filter((r) => !r.text || r.text.top < r.cell.top - 1 || r.text.bottom > r.cell.bottom + 1)
    expect(outside, 'rt text outside its cell (y axis)').toEqual([])

    // group by page and column (x centre), then check consecutive rects along y
    const overlaps: unknown[] = []
    const byPage = new Map<string, { i: number; t: R }[]>()
    rts.forEach((r, i) => byPage.set(r.page ?? '?', [...(byPage.get(r.page ?? '?') ?? []), { i, t: r.text! }]))
    for (const [pg, list] of byPage) {
      const sorted = [...list].sort((a, b) => (a.t.left + a.t.right) / 2 - (b.t.left + b.t.right) / 2)
      const columns: { i: number; t: R }[][] = []
      for (const item of sorted) {
        const last = columns[columns.length - 1]
        const cx = (item.t.left + item.t.right) / 2
        const refX = last ? (last[0].t.left + last[0].t.right) / 2 : 0
        if (last && Math.abs(cx - refX) < 14) last.push(item)
        else columns.push([item])
      }
      for (const col of columns) {
        const ys = [...col].sort((a, b) => a.t.top - b.t.top)
        for (let k = 1; k < ys.length; k++) {
          if (ys[k].t.top < ys[k - 1].t.bottom - 0.5) overlaps.push({ pg, a: ys[k - 1].i, b: ys[k].i, aBottom: ys[k - 1].t.bottom, bTop: ys[k].t.top })
        }
      }
    }
    expect(overlaps, 'overlapping rt in the same column').toEqual([])
  })
}

for (const mode of ['zhuyin', 'pinyin', 'iast'] as const) {
  test(`[REQ-RDR-008] ${mode}: adjacent <rt> in the same column are at least 6px apart along the column`, async ({ page }) => {
    await gotoReader(page)
    await setMode(page, mode)
    const rts = await page.evaluate(collectRts, mode)
    expect(rts.length).toBeGreaterThan(0)
    const byPage = new Map<string, R[]>()
    for (const r of rts) byPage.set(r.page ?? '?', [...(byPage.get(r.page ?? '?') ?? []), r.text!])
    const tooClose: unknown[] = []
    let pairs = 0
    for (const [pg, list] of byPage) {
      const sorted = [...list].sort((a, b) => (a.left + a.right) / 2 - (b.left + b.right) / 2)
      const columns: R[][] = []
      for (const item of sorted) {
        const last = columns[columns.length - 1]
        const cx = (item.left + item.right) / 2
        const refX = last ? (last[0].left + last[0].right) / 2 : 0
        if (last && Math.abs(cx - refX) < 14) last.push(item)
        else columns.push([item])
      }
      for (const col of columns) {
        const ys = [...col].sort((a, b) => a.top - b.top)
        for (let k = 1; k < ys.length; k++) {
          pairs++
          const gap = ys[k].top - ys[k - 1].bottom
          if (gap < 6 - 0.1) tooClose.push({ pg, gap, aBottom: ys[k - 1].bottom, bTop: ys[k].top })
        }
      }
    }
    expect(pairs, 'adjacent rt pairs measured').toBeGreaterThan(20)
    expect(tooClose.slice(0, 5)).toEqual([])
  })
}

test('[REQ-RDR-008] token rectangles are identical (<=1px) in zhuyin, pinyin, iast and no-phonetics modes', async ({ page }) => {
  await gotoReader(page)
  const rects: Record<string, R[]> = {}
  for (const mode of ['zhuyin', 'pinyin', 'iast', 'none'] as Mode[]) {
    await setMode(page, mode)
    rects[mode] = await tcall<R[]>(page, 'tokenRects')
  }
  for (const mode of ['zhuyin', 'pinyin', 'iast'] as const) {
    expect(rects[mode]).toHaveLength(rects.none.length)
    const moved = rects[mode]
      .map((r, i) => ({ i, mode, d: [r.left - rects.none[i].left, r.top - rects.none[i].top, r.right - rects.none[i].right, r.bottom - rects.none[i].bottom] }))
      .filter((m) => m.d.some((v) => Math.abs(v) > 1))
    expect(moved, `${mode} vs none`).toEqual([])
  }
})

test('[REQ-RDR-008] zhuyin tone marks (ˊ ˇ ˋ) sit to the right of the symbols, level with the last symbol; rt text still equals zy', async ({ page }) => {
  await gotoReader(page)
  await setMode(page, 'zhuyin')
  const expected = ALL_TOKENS.flatMap((t) => (t.chars ?? []).map((c) => c.zy))
  const info = await page.evaluate(() =>
    [...document.querySelectorAll('rt')].map((rt) => {
      const chars: { ch: string; cx: number; top: number; bottom: number }[] = []
      const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT)
      let n: Node | null
      while ((n = walker.nextNode())) {
        const s = n.textContent ?? ''
        for (let i = 0; i < s.length; i++) {
          const r = document.createRange()
          r.setStart(n, i)
          r.setEnd(n, i + 1)
          const b = r.getBoundingClientRect()
          chars.push({ ch: s[i], cx: (b.left + b.right) / 2, top: b.top, bottom: b.bottom })
        }
      }
      return { text: rt.textContent ?? '', chars }
    }),
  )
  expect(info.map((i) => i.text)).toEqual(expected)

  const TONES = ['ˊ', 'ˇ', 'ˋ']
  const withTone = info.filter((i) => TONES.includes(i.text.slice(-1)) && i.text.length > 1)
  expect(withTone.length).toBeGreaterThan(0)
  const wrong: unknown[] = []
  for (const i of withTone) {
    const tone = i.chars[i.chars.length - 1]
    const symbols = i.chars.slice(0, -1)
    const last = symbols[symbols.length - 1]
    const maxCx = Math.max(...symbols.map((s) => s.cx))
    const right = tone.cx > maxCx
    const level = tone.top < last.bottom && tone.bottom > last.top
    if (!right || !level) wrong.push({ text: i.text, toneCx: tone.cx, maxSymbolCx: maxCx, tone: [tone.top, tone.bottom], last: [last.top, last.bottom] })
  }
  expect(wrong).toEqual([])
})
