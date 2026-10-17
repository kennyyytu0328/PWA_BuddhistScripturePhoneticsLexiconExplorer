import { beforeAll, describe, expect, it } from 'vitest'
import { readJson, SUTRA_PATH, IAST_PATH, type Sutra, type Token } from './helpers'
import { runSuccessfulBuild, type SharedBuild } from './shared-build'

let b: SharedBuild
const sutra = readJson<Sutra>(SUTRA_PATH)
const iast = readJson(IAST_PATH)

beforeAll(async () => {
  b = await runSuccessfulBuild()
})

const nonPunct = (tokens: any[]) => tokens.filter((t) => !t.punct)
const allTokens = () => b.ast.segments.flatMap((s: any) => s.tokens as any[])

describe('[REQ-DAT-002] 產出經文 AST', () => {
  it('[REQ-DAT-002] 頂層欄位值與主檔一致', () => {
    expect(b.ast.id).toBe('heart-sutra')
    expect(b.ast.title).toBe('般若波羅蜜多心經')
    expect(b.ast.translator).toBe('唐 玄奘')
    expect(b.ast.baseText).toEqual(sutra.baseText)
    expect(b.ast.review.readings).toBe(true)
    expect(b.ast.review.editorial).toBe(true)
  })

  it('[REQ-DAT-002] 9 段，id 為 s1..s9，且自撰欄位與主檔相同', () => {
    expect(b.ast.segments.map((s: any) => s.id)).toEqual(['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9'])
    b.ast.segments.forEach((s: any, i: number) => {
      expect(s.vernacular).toBe(sutra.segments[i].vernacular)
      expect(s.themes).toEqual(sutra.segments[i].themes)
      expect(s.reflection).toBe(sutra.segments[i].reflection)
      expect(Array.isArray(s.tokens)).toBe(true)
    })
  })

  it('[REQ-DAT-002] 每段 token 的 t 依序等於主檔', () => {
    b.ast.segments.forEach((s: any, i: number) => {
      expect(s.tokens.map((t: any) => t.t)).toEqual(sutra.segments[i].tokens.map((t: Token) => t.t))
    })
  })

  it('[REQ-DAT-002] 非標點 token 的 chars 串接等於 t，每項含 c/py/zy 字串', () => {
    const toks = nonPunct(allTokens())
    expect(toks.length).toBe(nonPunct(sutra.segments.flatMap((s) => s.tokens)).length)
    for (const t of toks) {
      expect(t.chars.map((c: any) => c.c).join('')).toBe(t.t)
      expect(t.chars.length).toBe([...t.t].length)
      for (const c of t.chars) {
        expect(typeof c.py).toBe('string')
        expect(c.py.length).toBeGreaterThan(0)
        expect(typeof c.zy).toBe('string')
        expect(c.zy.length).toBeGreaterThan(0)
      }
    }
  })

  it('[REQ-DAT-002] 有 lex 的 token 帶 lex 與整數 sense', () => {
    const lexToks = allTokens().filter((t) => t.lex)
    expect(lexToks.length).toBe(sutra.segments.flatMap((s) => s.tokens).filter((t) => t.lex).length)
    const first = b.ast.segments[0].tokens[0]
    expect(first.t).toBe('觀自在')
    expect(first.lex).toBe('觀自在')
    expect(first.sense).toBe(0)
    for (const t of lexToks) expect(Number.isInteger(t.sense)).toBe(true)
  })
})

describe('[REQ-DAT-013] 拼音產生', () => {
  it('[REQ-DAT-013] 「一切」為 yī、qiè（非 yí）', () => {
    const toks = allTokens().filter((t) => t.t === '一切')
    expect(toks.length).toBe(2)
    for (const t of toks) expect(t.chars.map((c: any) => c.py)).toEqual(['yī', 'qiè'])
  })

  it('[REQ-DAT-013] 「空相」套用 py 覆寫為 kōng、xiàng', () => {
    const toks = allTokens().filter((t) => t.t === '空相')
    expect(toks.length).toBeGreaterThanOrEqual(1)
    for (const t of toks) expect(t.chars.map((c: any) => c.py)).toEqual(['kōng', 'xiàng'])
  })

  it('[REQ-DAT-013] 「般若波羅蜜多」套用佛教慣讀 bō rě bō luó mì duō', () => {
    const t = allTokens().find((x) => x.t === '般若波羅蜜多')
    expect(t.chars.map((c: any) => c.py).join(' ')).toBe('bō rě bō luó mì duō')
  })
})

describe('[REQ-DAT-014] AST 中的注音', () => {
  it('[REQ-DAT-014] 「般若波羅蜜多」的 zy 前兩字為 ㄅㄛ、ㄖㄜˇ', () => {
    const t = allTokens().find((x) => x.t === '般若波羅蜜多')
    expect(t.chars.slice(0, 2).map((c: any) => c.zy)).toEqual(['ㄅㄛ', 'ㄖㄜˇ'])
  })

  it('[REQ-DAT-014] 「一切」的 zy 為 ㄧ、ㄑㄧㄝˋ', () => {
    const t = allTokens().find((x) => x.t === '一切')
    expect(t.chars.map((c: any) => c.zy)).toEqual(['ㄧ', 'ㄑㄧㄝˋ'])
  })
})

describe('[REQ-DAT-016] IAST 標註', () => {
  const seg = (id: string) => b.ast.segments.find((s: any) => s.id === id)

  it('[REQ-DAT-016] 「般若波羅蜜多」token 的 iast 為 prajñāpāramitā', () => {
    const toks = allTokens().filter((t) => t.t === '般若波羅蜜多')
    expect(toks.length).toBeGreaterThanOrEqual(1)
    for (const t of toks) expect(t.iast).toBe('prajñāpāramitā')
  })

  it('[REQ-DAT-016] s1 的「一切」無 iast，s8 的「一切」為 sarva', () => {
    const s1 = seg('s1').tokens.find((t: any) => t.t === '一切')
    const s8 = seg('s8').tokens.find((t: any) => t.t === '一切')
    expect(s1.iast).toBeUndefined()
    expect(s8.iast).toBe('sarva')
  })

  it('[REQ-DAT-016] noIast 列出的 token 皆無 iast', () => {
    let checked = 0
    for (const e of iast.noIast) {
      for (const s of b.ast.segments) {
        if (e.segments && !e.segments.includes(s.id)) continue
        for (const t of s.tokens) {
          if (e.tokens.includes(t.t) && t.lex === e.lex) {
            expect(t.iast, `${s.id} ${t.t}`).toBeUndefined()
            checked++
          }
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(iast.noIast.length)
  })

  it('[REQ-DAT-016] iast.json 每個 entries 的 token 皆標上對應 iast', () => {
    for (const e of iast.entries) {
      let matched = 0
      for (const s of b.ast.segments) {
        if (e.segments && !e.segments.includes(s.id)) continue
        for (const t of s.tokens) {
          if (e.tokens.includes(t.t) && t.lex === e.lex) {
            expect(t.iast, `${s.id} ${t.t}`).toBe(e.iast)
            matched++
          }
        }
      }
      expect(matched, e.lex).toBeGreaterThanOrEqual(1)
    }
  })
})

describe('[REQ-DAT-018] 專案自撰內容只在 AST 段落層級', () => {
  it('[REQ-DAT-018] token 物件不含 vernacular/themes/reflection', () => {
    for (const t of allTokens()) {
      expect(t).not.toHaveProperty('vernacular')
      expect(t).not.toHaveProperty('themes')
      expect(t).not.toHaveProperty('reflection')
    }
  })
  it('[REQ-DAT-018] AST 頂層不含 vernacular/themes/reflection', () => {
    expect(Object.keys(b.ast)).not.toContain('vernacular')
    expect(Object.keys(b.ast)).not.toContain('themes')
    expect(Object.keys(b.ast)).not.toContain('reflection')
  })
})

describe('[REQ-DAT-019] 無 lex 的 token 不可點擊', () => {
  it('[REQ-DAT-019] 「照見」無 lex', () => {
    const t = b.ast.segments[0].tokens.find((x: any) => x.t === '照見')
    expect(t.t).toBe('照見')
    expect(t.lex).toBeUndefined()
  })

  it('[REQ-DAT-019] 主檔無 lex 的 token，輸出亦無 lex', () => {
    b.ast.segments.forEach((s: any, i: number) => {
      s.tokens.forEach((t: any, j: number) => {
        if (!sutra.segments[i].tokens[j].lex) expect(t.lex, `${s.id}:${t.t}`).toBeUndefined()
      })
    })
  })

  it('[REQ-DAT-019] 所有帶 lex 的 token，其 lex 皆為 lexicon entries 的鍵', () => {
    const keys = new Set(Object.keys(b.lexicon.entries))
    const lexes = allTokens().filter((t) => t.lex).map((t) => t.lex as string)
    expect(lexes.length).toBeGreaterThan(30)
    for (const l of lexes) expect(keys.has(l), l).toBe(true)
  })
})
