import {
  ALL_TOKENS,
  AMBER_500_75,
  closeTo,
  expect,
  firstFamily,
  gotoReader,
  setMode,
  tcall,
  test,
} from './helpers'
import type { Tok } from './helpers'

interface RubyInfo { base: string; rt: string[] }
interface TokenInfo { kind: string; text: string; rubies: RubyInfo[]; rts: string[] }
interface Rect { left: number; top: number; width: number; height: number }

const perCharExpected = (tok: Tok, field: 'zy' | 'py') =>
  tok.punct ? { rubies: [], rts: [] } : { rubies: tok.chars!.map((c) => ({ base: c.c, rt: [c[field]] })), rts: tok.chars!.map((c) => c[field]) }

test.describe('phonetics', () => {
  for (const [mode, field] of [['zhuyin', 'zy'], ['pinyin', 'py']] as const) {
    test(`[REQ-RDR-008] ${mode} mode: every non-punct char is a <ruby> whose <rt> is chars[].${field}`, async ({ page }) => {
      await gotoReader(page)
      await setMode(page, mode)
      const tokens = await tcall<TokenInfo[]>(page, 'tokens')
      expect(tokens).toHaveLength(ALL_TOKENS.length)
      const actual = tokens.map((t) => ({ rubies: t.rubies, rts: t.rts }))
      const expected = ALL_TOKENS.map((t) => perCharExpected(t, field))
      expect(actual).toEqual(expected)
    })
  }

  test('[REQ-RDR-008] <rt> style: 10px, Noto Sans TC (sans-serif), amber-500 at 75% opacity', async ({ page }) => {
    await gotoReader(page)
    const info = await page.evaluate(() => {
      const t = (window as any).__t
      return [...document.querySelectorAll('rt')].map((el) => {
        const s = getComputedStyle(el)
        return { fontSize: s.fontSize, family: s.fontFamily, color: t.rgba(s.color) as number[] }
      })
    })
    expect(info.length).toBeGreaterThan(0)
    for (const rt of info) {
      expect(rt.fontSize).toBe('10px')
      expect(firstFamily(rt.family)).toBe('Noto Sans TC')
      expect(rt.family.split(',').map((f) => f.trim())).not.toContain('serif')
      expect(closeTo(rt.color, AMBER_500_75), `rt colour ${JSON.stringify(rt.color)}`).toBe(true)
    }
  })

  test('[REQ-RDR-008] IAST mode: tokens with iast carry one <ruby> over the whole token; tokens without iast show no <rt>', async ({ page }) => {
    await gotoReader(page)
    await setMode(page, 'iast')
    const tokens = await tcall<TokenInfo[]>(page, 'tokens')
    expect(tokens).toHaveLength(ALL_TOKENS.length)
    const actual = tokens.map((t, i) => (ALL_TOKENS[i].iast ? { rubies: t.rubies, rts: t.rts } : { rts: t.rts }))
    const expected = ALL_TOKENS.map((t) =>
      t.iast ? { rubies: [{ base: t.t, rt: [t.iast] }], rts: [t.iast] } : { rts: [] as string[] },
    )
    expect(actual).toEqual(expected)
    expect(ALL_TOKENS.filter((t) => t.iast).length).toBeGreaterThan(0)
  })

  test('[REQ-RDR-008] none mode: no <rt> at all and token positions do not move compared with zhuyin mode', async ({ page }) => {
    await gotoReader(page)
    const before = await tcall<Rect[]>(page, 'tokenRects')
    await setMode(page, 'none')
    expect(await page.locator('rt').count()).toBe(0)
    const after = await tcall<Rect[]>(page, 'tokenRects')
    expect(after).toHaveLength(before.length)
    const moved = before
      .map((b, i) => ({ i, dx: after[i].left - b.left, dy: after[i].top - b.top, dw: after[i].width - b.width, dh: after[i].height - b.height }))
      .filter((m) => [m.dx, m.dy, m.dw, m.dh].some((v) => Math.abs(v) > 1))
    expect(moved).toEqual([])
  })
})
