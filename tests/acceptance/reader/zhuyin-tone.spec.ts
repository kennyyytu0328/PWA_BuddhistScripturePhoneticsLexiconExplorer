import { ALL_TOKENS, expect, gotoReader, setMode, test } from './helpers'

const TONES = /[ˊˇˋ˙]/

// In vertical text, `text-orientation: mixed` turns these marks 90° clockwise: ˊ then reads as ˋ, ˋ as ˊ, ˇ as <.
test('[REQ-RDR-008] zhuyin tone marks keep their horizontal shape: every tone mark is laid out upright (Q-RDR-048)', async ({ page }) => {
  await gotoReader(page)
  await setMode(page, 'zhuyin')
  const marks = await page.evaluate((src) => {
    const re = new RegExp(src)
    const out: { mark: string; writingMode: string; textOrientation: string }[] = []
    for (const rt of document.querySelectorAll('rt')) {
      const walker = document.createTreeWalker(rt, NodeFilter.SHOW_TEXT)
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        for (const ch of n.textContent ?? '') {
          if (!re.test(ch)) continue
          const s = getComputedStyle(n.parentElement!)
          out.push({ mark: ch, writingMode: s.writingMode, textOrientation: s.textOrientation })
        }
      }
    }
    return out
  }, TONES.source)

  const expected = ALL_TOKENS.flatMap((t) => (t.chars ?? []).flatMap((c) => [...c.zy].filter((ch) => TONES.test(ch))))
  expect(marks.map((m) => m.mark)).toEqual(expected)
  expect(new Set(expected)).toEqual(new Set(['ˊ', 'ˇ', 'ˋ']))
  const sideways = marks.filter((m) => m.writingMode !== 'horizontal-tb' && m.textOrientation !== 'upright')
  expect(sideways).toEqual([])
})
