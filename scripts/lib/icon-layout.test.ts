import { describe, expect, it } from 'vitest'
import { diagonal, placeGlyph, withinSafeZone } from './icon-layout.ts'

const bbox = { minX: 50, minY: -20, maxX: 950, maxY: 780 }

describe('placeGlyph', () => {
  it('scales the bbox diagonal to size * 0.8 * 0.95', () => {
    const p = placeGlyph(bbox, 512)
    expect(diagonal(bbox) * p.scale).toBeCloseTo(512 * 0.8 * 0.95, 6)
  })

  it('centres the bbox on the canvas', () => {
    const p = placeGlyph(bbox, 512)
    const cx = p.tx + (p.scale * (bbox.minX + bbox.maxX)) / 2
    const cy = p.ty - (p.scale * (bbox.minY + bbox.maxY)) / 2
    expect(cx).toBeCloseTo(256, 6)
    expect(cy).toBeCloseTo(256, 6)
  })

  it('keeps all bbox corners inside the safe circle', () => {
    for (const size of [180, 192, 512]) {
      expect(withinSafeZone(bbox, placeGlyph(bbox, size), size)).toBe(true)
    }
  })

  it('detects a bbox that leaves the safe circle', () => {
    const p = placeGlyph(bbox, 512)
    expect(withinSafeZone(bbox, { ...p, scale: p.scale * 1.1 }, 512)).toBe(false)
  })

  it('rejects an empty bbox', () => {
    expect(() => placeGlyph({ minX: 0, minY: 0, maxX: 0, maxY: 0 }, 512)).toThrow()
  })
})
