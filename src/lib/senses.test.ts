import { describe, expect, it } from 'vitest'
import { collectXrefs, orderSenses } from './senses'

const s = (usg: string | null, xr: string[] = []) => ({ usg, def: [usg ?? ''], xr })

describe('orderSenses', () => {
  it('puts the adopted sense first and keeps DFB order for the rest', () => {
    const out = orderSenses([s('a'), s('b'), s('c')], 2)
    expect(out.map((o) => o.sense.usg)).toEqual(['c', 'a', 'b'])
    expect(out.map((o) => o.adopted)).toEqual([true, false, false])
  })

  it('marks nothing when no sense is adopted or the index is out of range', () => {
    expect(orderSenses([s('a'), s('b')], undefined).map((o) => o.adopted)).toEqual([false, false])
    expect(orderSenses([s('a')], 5).map((o) => o.sense.usg)).toEqual(['a'])
  })
})

describe('collectXrefs', () => {
  it('lists distinct targets in first-seen order', () => {
    expect(collectXrefs([s('a', ['x', 'y']), s('b', ['y', 'z'])])).toEqual(['x', 'y', 'z'])
  })
})
