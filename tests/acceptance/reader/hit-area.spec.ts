
import { LEX_TOKENS, expect, gotoReader, setMode, test } from './helpers'
import type { Mode } from './helpers'

interface Row { i: number; lex: string; seg: string; hitY: number; hitX: number; covered: boolean; inView: boolean }

/** Sweep every lex token with elementFromPoint and report the longest run of points that hit the token itself. */
const sweep = async () => {
  const tokens = [...document.querySelectorAll('[data-testid="lex-token"]')] as HTMLElement[]
  const controls = [...document.querySelectorAll('[data-testid="phonetic-toggle"], [data-testid="vernacular-toggle"]')]
  const longestRun = (hits: boolean[]) => {
    let best = 0
    let cur = 0
    for (const h of hits) { cur = h ? cur + 1 : 0; best = Math.max(best, cur) }
    return best
  }
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  const out = []
  for (const [i, el] of tokens.entries()) {
    el.closest('[data-testid="sutra-page"]')?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' })
    el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
    await frame()
    const r = el.getBoundingClientRect()
    const hitsY: boolean[] = []
    const mx = (r.left + r.right) / 2
    for (let y = Math.ceil(r.top); y <= Math.floor(r.bottom); y++) {
      hitsY.push(document.elementFromPoint(mx, y)?.closest('[data-testid="lex-token"]') === el)
    }
    const hitsX: boolean[] = []
    const my = (r.top + r.bottom) / 2
    for (let x = Math.ceil(r.left); x <= Math.floor(r.right); x++) {
      hitsX.push(document.elementFromPoint(x, my)?.closest('[data-testid="lex-token"]') === el)
    }
    const covered = controls.some((c) => {
      const b = c.getBoundingClientRect()
      return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top
    })
    const inView = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
    out.push({ i, lex: el.dataset.lex ?? '', seg: (el.closest('[data-testid="sutra-page"]') as HTMLElement | null)?.dataset.segment ?? '', hitY: longestRun(hitsY), hitX: longestRun(hitsX), covered, inView })
  }
  return out
}

for (const mode of ['zhuyin', 'none'] as Mode[]) {
  test(`[REQ-RDR-005] ${mode} mode: every lex token is hit by at least 44px of points along and across the column, not covered by controls`, async ({ page }) => {
    await gotoReader(page)
    await setMode(page, mode)
    const rows = await page.evaluate(sweep)
    expect(rows).toHaveLength(LEX_TOKENS.length)
    expect(rows.map((r) => r.lex)).toEqual(LEX_TOKENS.map((t) => t.lex))
    const fail = rows.filter((r) => r.hitY < 44 || r.hitX < 44 || r.covered || !r.inView)
    expect(
      fail.map((r) => `#${r.i} ${r.lex} (${r.seg}): along-column ${r.hitY}px, across ${r.hitX}px${r.covered ? ', under a fixed control' : ''}${r.inView ? '' : ', not fully in view'}`),
    ).toEqual([])
  })
}
