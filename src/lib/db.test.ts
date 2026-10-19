import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { db, readPref, writePref } from './db'

afterEach(async () => {
  vi.restoreAllMocks()
  await db.prefs.clear()
})

describe('prefs store', () => {
  it('returns null when nothing is stored', async () => {
    expect(await readPref('phoneticMode')).toBeNull()
  })

  it('stores rows as { key, value } and overwrites by key', async () => {
    await writePref('phoneticMode', 'pinyin')
    await writePref('phoneticMode', 'iast')
    expect(await db.prefs.toArray()).toEqual([{ key: 'phoneticMode', value: 'iast' }])
    expect(await readPref('phoneticMode')).toBe('iast')
  })

  it('swallows storage errors and falls back', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(db.prefs, 'get').mockRejectedValue(new Error('blocked'))
    vi.spyOn(db.prefs, 'put').mockRejectedValue(new Error('blocked'))
    expect(await readPref('x')).toBeNull()
    await expect(writePref('x', 'y')).resolves.toBeUndefined()
  })
})
