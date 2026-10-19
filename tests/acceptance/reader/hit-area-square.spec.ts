import { LEX_TOKENS, expect, gotoReader, setMode, test } from './helpers'
import type { Mode } from './helpers'

const MIN_SIDE_PX = 44

interface Row {
  i: number
  lex: string
  seg: string
  side: number
  covered: boolean
  inView: boolean
}

/**
 * Measure one lex token: side of the largest square (0.25px grid) in which every point hits the token itself.
 *
 * document.elementFromPoint costs ~0.28ms per distinct point, so sweeping every 0.25px grid point of every
 * token (~100k points each, x4 modes) would take over an hour. The search is therefore counterexample driven:
 *  1. draft: sample a 1px lattice (every 4th grid point) with elementFromPoint;
 *  2. DP on the lattice finds a 44x44px candidate square whose lattice points all hit (none: the token fails
 *     and the lattice DP side is reported, which is accurate to ~1px);
 *  3. the candidate is verified with real elementFromPoint on the full 0.25px grid along scan lines every
 *     4px (rows and columns, plus its edges). Each miss blocks its lattice cell and the DP is rerun, until a
 *     candidate verifies or none is left.
 * A miss thinner than 1px that spans the candidate (like the 0.25-1.25px overlap strips of Q-RDR-031) is
 * caught by every crossing scan line; only an isolated blob smaller than 4px in both directions could slip
 * through.
 */
const measureToken = async (index: number): Promise<Row | null> => {
  const MIN_SIDE_PX = 44
  const STEP_PX = 0.25
  const LATTICE = 4 // grid steps per lattice step (1px)
  const VERIFY_GAP = 16 // grid steps between verification scan lines (4px)
  const need = Math.round(MIN_SIDE_PX / STEP_PX) + 1 // grid points per side of a 44px square
  const needLat = need > 1 ? (need - 1) / LATTICE + 1 : 1 // lattice points per side
  const tokens = [...document.querySelectorAll('[data-testid="lex-token"]')] as HTMLElement[]
  const el = tokens[index]
  if (!el) return null
  const frame = () => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  el.closest('[data-testid="sutra-page"]')?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' })
  el.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'instant' })
  await frame()

  const r = el.getBoundingClientRect()
  const cols = Math.floor((r.right - r.left) / STEP_PX) + 1
  const rows = Math.floor((r.bottom - r.top) / STEP_PX) + 1
  const hitAt = (ix: number, iy: number) =>
    document.elementFromPoint(r.left + ix * STEP_PX, r.top + iy * STEP_PX)?.closest('[data-testid="lex-token"]') === el

  const lc = Math.floor((cols - 1) / LATTICE) + 1
  const lr = Math.floor((rows - 1) / LATTICE) + 1
  const lat = new Uint8Array(lc * lr)
  for (let b = 0; b < lr; b++) for (let a = 0; a < lc; a++) lat[b * lc + a] = hitAt(a * LATTICE, b * LATTICE) ? 1 : 0

  const scanLines = (from: number) => {
    const out = new Set<number>([0, need - 1])
    for (let k = 0; k < need; k += VERIFY_GAP) out.add(k)
    return [...out].map((k) => from + k)
  }

  let bestSide = 0
  let verified = false
  for (let round = 0; round < 200 && !verified; round++) {
    let prev = new Int32Array(lc + 1)
    let best = 0
    let cand: [number, number] | null = null
    for (let b = 0; b < lr; b++) {
      const cur = new Int32Array(lc + 1)
      for (let a = 0; a < lc; a++) {
        if (lat[b * lc + a]) {
          const v = Math.min(prev[a], prev[a + 1], cur[a]) + 1
          cur[a + 1] = v
          if (v > best) best = v
          if (v >= needLat && !cand) cand = [a - needLat + 1, b - needLat + 1]
        }
      }
      prev = cur
    }
    bestSide = best > 0 ? (best - 1) * (LATTICE * STEP_PX) : 0
    if (!cand) break
    const x0 = cand[0] * LATTICE
    const y0 = cand[1] * LATTICE
    let miss = 0
    const block = (ix: number, iy: number) => { lat[Math.floor(iy / LATTICE) * lc + Math.floor(ix / LATTICE)] = 0; miss++ }
    for (const iy of scanLines(y0)) for (let ix = x0; ix < x0 + need; ix++) if (!hitAt(ix, iy)) block(ix, iy)
    for (const ix of scanLines(x0)) for (let iy = y0; iy < y0 + need; iy++) if (!hitAt(ix, iy)) block(ix, iy)
    verified = miss === 0
  }

  const controls = [...document.querySelectorAll('[data-testid="phonetic-toggle"], [data-testid="vernacular-toggle"]')]
  const covered = controls.some((c) => {
    const b = c.getBoundingClientRect()
    return b.left < r.right && b.right > r.left && b.top < r.bottom && b.bottom > r.top
  })
  const inView = r.left >= 0 && r.top >= 0 && r.right <= window.innerWidth && r.bottom <= window.innerHeight
  return {
    i: index,
    lex: el.dataset.lex ?? '',
    seg: (el.closest('[data-testid="sutra-page"]') as HTMLElement | null)?.dataset.segment ?? '',
    side: verified ? Math.max(bestSide, MIN_SIDE_PX) : Math.min(bestSide, MIN_SIDE_PX - STEP_PX),
    covered,
    inView,
  }
}

test.describe.configure({ mode: 'parallel' })

// Each mode's tokens are split into chunks so no single test runs long under a full parallel suite (Q-RDR-034).
const CHUNKS = 4
const CHUNK_SIZE = Math.ceil(LEX_TOKENS.length / CHUNKS)

for (const mode of ['zhuyin', 'pinyin', 'iast', 'none'] as Mode[]) {
  for (let chunk = 0; chunk < CHUNKS; chunk++) {
    const start = chunk * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, LEX_TOKENS.length)
    test(`[REQ-RDR-005] ${mode} mode, lex tokens #${start}-#${end - 1}: each contains a fully-hit ${MIN_SIDE_PX}x${MIN_SIDE_PX}px square (0.25px along 4px scan lines), in view, not covered by controls`, async ({ page }) => {
      test.setTimeout(300_000)
      await gotoReader(page)
      await setMode(page, mode)
      await page.evaluate(() => document.fonts.ready.then(() => undefined))

      const count = await page.locator('button[data-testid="lex-token"]').count()
      expect(count).toBe(LEX_TOKENS.length)

      const rows: Row[] = []
      for (let i = start; i < end; i++) {
        const row = await page.evaluate(measureToken, i)
        if (row) rows.push(row)
      }
      expect(rows.map((r) => r.lex)).toEqual(LEX_TOKENS.slice(start, end).map((t) => t.lex))

      const failList = rows
        .filter((r) => r.side < MIN_SIDE_PX || r.covered || !r.inView)
        .map(
          (r) =>
            `#${r.i} ${r.lex} (${r.seg}): largest fully-hit square ${r.side}px` +
            `${r.covered ? ', under a fixed control' : ''}${r.inView ? '' : ', not fully in view'}`,
        )
      expect(failList).toEqual([])
    })
  }
}
