import { describe, expect, it } from 'vitest'
import { checkReferences, checkXrTargets } from './dfb.ts'
import { parseArgs } from './io.ts'
import { buildSegmentReadings } from './phonetics.ts'
import { falseReviewFlags } from './review.ts'
import type { DfbSense, IastFile, Sutra } from './types.ts'
import { iastFor, stripPunct } from './validate.ts'
import { toZhuyin } from './zhuyin.ts'

describe('toZhuyin 特例', () => {
  it.each([
    ['zhī', 'ㄓ'], ['chī', 'ㄔ'], ['rì', 'ㄖˋ'], ['sī', 'ㄙ'], ['èr', 'ㄦˋ'], ['ēr', 'ㄦ'],
    ['yū', 'ㄩ'], ['yuè', 'ㄩㄝˋ'], ['jū', 'ㄐㄩ'], ['xuǎn', 'ㄒㄩㄢˇ'], ['lǜ', 'ㄌㄩˋ'],
    ['wú', 'ㄨˊ'], ['wèi', 'ㄨㄟˋ'], ['yòu', 'ㄧㄡˋ'], ['yīng', 'ㄧㄥ'], ['yōng', 'ㄩㄥ'],
    ['jiǔ', 'ㄐㄧㄡˇ'], ['guī', 'ㄍㄨㄟ'], ['lún', 'ㄌㄨㄣˊ'], ['de', '˙ㄉㄜ'], ['ma', '˙ㄇㄚ'],
  ])('%s -> %s', (py, zy) => {
    expect(toZhuyin(py)).toBe(zy)
  })

  it('無法轉換者拋錯', () => {
    expect(() => toZhuyin('xyz')).toThrow()
  })
})

describe('buildSegmentReadings', () => {
  const seg = (py?: string) => ({
    id: 'sx', vernacular: '', themes: [], reflection: '',
    tokens: [{ t: '一切' }, { t: '，', punct: true }, { t: '空相', ...(py ? { py } : {}) }],
  })

  it('標點為 null，其餘逐字產生', () => {
    const r = buildSegmentReadings(seg('kōng xiàng'))
    expect(r.errors).toEqual([])
    expect(r.tokens[1]).toBeNull()
    expect(r.tokens[0]?.map((c) => c.py)).toEqual(['yī', 'qiè'])
    expect(r.tokens[2]?.map((c) => c.zy)).toEqual(['ㄎㄨㄥ', 'ㄒㄧㄤˋ'])
  })

  it('py 音節數不符回報錯誤', () => {
    const r = buildSegmentReadings(seg('kōng'))
    expect(r.errors[0]).toContain('空相')
    expect(r.tokens[2]).toBeNull()
  })

  it('py 含無法轉注音的音節回報錯誤', () => {
    expect(buildSegmentReadings(seg('xyz abc')).errors).toHaveLength(1)
  })
})

describe('其他小工具', () => {
  it('parseArgs 轉 camelCase', () => {
    expect(parseArgs(['--gaiji-dir', 'a', '--out', 'b', 'stray'])).toEqual({ gaijiDir: 'a', out: 'b' })
  })

  it('stripPunct 去除標點與空白', () => {
    expect(stripPunct('觀自在，菩薩。 行')).toBe('觀自在菩薩行')
  })

  it('falseReviewFlags 列出為 false 的旗標', () => {
    const sutra = { review: { readings: false, editorial: true } } as Sutra
    const iast = { review: { iast: false } } as IastFile
    expect(falseReviewFlags(sutra, iast)).toHaveLength(2)
  })

  it('iastFor 依 lex、token、段落比對', () => {
    const iast = {
      entries: [{ lex: 'a', tokens: ['甲'], segments: ['s2'], iast: 'x' }],
      noIast: [],
    } as unknown as IastFile
    expect(iastFor(iast, 's2', '甲', 'a')).toBe('x')
    expect(iastFor(iast, 's1', '甲', 'a')).toBeUndefined()
    expect(iastFor(iast, 's2', '甲', undefined)).toBeUndefined()
  })

  it('checkReferences 只對 DFB 詞條要求 xr', () => {
    const sense = (xr: string[]): DfbSense => ({ usg: null, def: ['見甲條。與乙同。與丙同。'], xr })
    const dfb = new Map([['甲', []], ['乙', []]])
    expect(checkReferences({ 條: { senses: [sense(['甲', '乙'])] } }, dfb)).toEqual([])
    expect(checkReferences({ 條: { senses: [sense(['甲'])] } }, dfb)).toHaveLength(1)
  })
  it('checkXrTargets 只檢查經文引用條目的 xr 目標是否為詞條', () => {
    const sense = (xr: string[]): DfbSense => ({ usg: null, def: [], xr })
    const dfb = new Map([['甲', [sense(['乙', '無'])]], ['乙', [sense(['也無'])]]])
    expect(checkXrTargets(dfb, ['甲', '甲'])).toEqual(['辭典條目「甲」的 <xr> 目標「無」不是 DFB 詞條'])
    expect(checkXrTargets(dfb, ['乙'])).toHaveLength(1)
    expect(checkXrTargets(dfb, ['不存在'])).toEqual([])
  })
})
