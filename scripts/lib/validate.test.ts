import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { checkUnsupported } from './dfb.ts'
import { splitReadings } from './phonetics.ts'
import type { IastFile, Sutra, SutraSegment } from './types.ts'
import { validateAgainstCbeta, validateIast, validatePunct } from './validate.ts'

const loadSutra = async (): Promise<Sutra> => JSON.parse(await readFile('data/heart-sutra.json', 'utf8'))
const loadCbeta = () => readFile('data-sources/cbeta/T08n0251.txt', 'utf8')
const loadIast = async (): Promise<IastFile> => JSON.parse(await readFile('data/iast.json', 'utf8'))

/** 在 s1「照見」前插入一個 token（不改動原物件）。 */
const withInsertedToken = (sutra: Sutra, token: { t: string; punct?: boolean }): Sutra => ({
  ...sutra,
  segments: sutra.segments.map((seg) => {
    if (seg.id !== 's1') return seg
    const at = seg.tokens.findIndex((t) => t.t === '照見')
    return { ...seg, tokens: [...seg.tokens.slice(0, at), token, ...seg.tokens.slice(at)] }
  }),
})

describe('validatePunct', () => {
  it('真實資料的 punct token 皆只含標點', async () => {
    expect(validatePunct(await loadSutra())).toEqual([])
  })

  it('標為 punct 的漢字回報段落與內容', async () => {
    const errors = validatePunct(withInsertedToken(await loadSutra(), { t: '不照見', punct: true }))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('s1')
    expect(errors[0]).toContain('不照見')
  })
})

describe('validateAgainstCbeta', () => {
  it('誤標為 punct 的漢字仍參與 CBETA 比對', async () => {
    const sutra = withInsertedToken(await loadSutra(), { t: '不照見', punct: true })
    const errors = validateAgainstCbeta(sutra, await loadCbeta())
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('s1')
  })

  it('variants 的流通本文字在段落中找不到時報錯', async () => {
    const sutra = await loadSutra()
    const broken = {
      ...sutra,
      baseText: { ...sutra.baseText, variants: [{ ...sutra.baseText.variants[0], recitation: '揭諦揭諦揭諦' }] },
    }
    const errors = validateAgainstCbeta(broken, await loadCbeta())
    expect(errors).toEqual(['baseText.variants：段落 s9 找不到流通本文字「揭諦揭諦揭諦」'])
  })

  it('variants 指向不存在的段落時報錯', async () => {
    const sutra = await loadSutra()
    const broken = {
      ...sutra,
      baseText: { ...sutra.baseText, variants: [{ ...sutra.baseText.variants[0], segment: 's10' }] },
    }
    expect(validateAgainstCbeta(broken, await loadCbeta())).toEqual(['baseText.variants：段落 s10 不存在'])
  })
})

describe('validateIast', () => {
  it('真實資料無錯誤', async () => {
    expect(validateIast(await loadSutra(), await loadIast())).toEqual([])
  })

  it('條目中任一 token 不在經文即報錯，並指出該 token', async () => {
    const iast = await loadIast()
    const [first, ...rest] = iast.entries
    const broken = { ...iast, entries: [{ ...first, tokens: [...first.tokens, '不存在'] }, ...rest] }
    const errors = validateIast(await loadSutra(), broken)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain(`「${first.lex}」`)
    expect(errors[0]).toContain('「不存在」')
  })
})

describe('splitReadings', () => {
  const seg = (tokens: SutraSegment['tokens']): SutraSegment => ({ id: 's1', tokens, vernacular: '', themes: [], reflection: '' })
  const segment = seg([{ t: '觀自在' }, { t: '，', punct: true }, { t: '菩薩' }])

  it('pinyin-pro 回傳音節數與段落字數不同時，回報段落層級錯誤', () => {
    const r = splitReadings(segment, ['guān', 'zì', 'zài', '，', 'pú'])
    expect(r.errors).toEqual(['s1：pinyin-pro 回傳 5 個音節，但段落有 6 字'])
    expect(r.tokens).toEqual([null, null, null])
  })

  it('音節數與字數相符時依 token 字數切分', () => {
    const r = splitReadings(seg([{ t: '菩薩' }]), ['pú', 'sà'])
    expect(r.errors).toEqual([])
    expect(r.tokens[0]?.map((c) => c.py)).toEqual(['pú', 'sà'])
  })
})

describe('checkUnsupported', () => {
  it('收錄條目含 <g> 以外的元素時報錯，未收錄者不報', () => {
    const unsupported = new Map([['甲', ['choice', 'note', 'choice']], ['乙', ['lb']]])
    expect(checkUnsupported(['甲', '丙'], unsupported)).toEqual(['辭典條目「甲」釋義含無法逐字保留的元素：choice、note'])
  })
})
