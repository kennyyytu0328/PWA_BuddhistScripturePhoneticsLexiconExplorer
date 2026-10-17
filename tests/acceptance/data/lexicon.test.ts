import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import {
  ATTRIBUTION, expectedEntryKeys, flattenDef, GAIJI_DIR, loadDfb, readJson, SUTRA_PATH, sutraLexSet,
  type Sutra,
} from './helpers'
import { runSuccessfulBuild, type SharedBuild } from './shared-build'

let b: SharedBuild
const sutra = readJson<Sutra>(SUTRA_PATH)
const XR_TARGETS = ['觀音', '陰', '三科', '蘇波訶', '大般涅槃', '菩薩', '般若波羅蜜', '心經', '色即是空', '四諦', '萬法']

beforeAll(async () => {
  b = await runSuccessfulBuild()
})

const entries = () => b.lexicon.entries as Record<string, { senses: any[] }>
const xrOf = (head: string): string[] => entries()[head].senses.flatMap((s) => s.xr ?? [])

describe('[REQ-DAT-003] 產出精簡辭典', () => {
  it('[REQ-DAT-003] 頂層含 source/license/attribution/entries', () => {
    expect(Object.keys(b.lexicon).sort()).toEqual(['attribution', 'entries', 'license', 'source'])
    expect(typeof b.lexicon.source).toBe('string')
    expect(b.lexicon.source.length).toBeGreaterThan(0)
  })

  it('[REQ-DAT-003] 經文引用 38 個不同 lex', () => {
    expect(sutraLexSet(sutra).size).toBe(38)
  })

  it('[REQ-DAT-003] entries 恰為 38 條 lex 加上一層轉引目標（共 47 條）', () => {
    const expected = [...expectedEntryKeys(sutra)].sort()
    expect(expected.length).toBe(47)
    expect(Object.keys(entries()).sort()).toEqual(expected)
  })

  it('[REQ-DAT-003] 每條為 { senses: [{ usg, def, xr }] }，義項數與 DFB 相同', () => {
    const dfb = loadDfb()
    for (const [head, e] of Object.entries(entries())) {
      expect(Object.keys(e)).toEqual(['senses'])
      expect(e.senses.length, head).toBe(dfb.get(head)!.length)
      for (const s of e.senses) {
        expect(Array.isArray(s.def), head).toBe(true)
        expect(s).toHaveProperty('usg')
      }
    }
  })

  it('[REQ-DAT-003] 多義項保留全部：五蘊、六根、四諦各 2 義', () => {
    expect(entries()['五蘊'].senses.length).toBe(2)
    expect(entries()['六根'].senses.length).toBe(2)
    expect(entries()['四諦'].senses.length).toBe(2)
  })

  it('[REQ-DAT-003] 義項 usg 取自 DFB（五蘊為術語、六根為名數）', () => {
    expect(entries()['五蘊'].senses.map((s) => s.usg)).toEqual(['術語', '術語'])
    expect(entries()['六根'].senses.map((s) => s.usg)).toEqual(['名數', '名數'])
  })

  it('[REQ-DAT-003] DFB 無 <usg> 的義項輸出 usg: null；每個義項的 xr 皆為陣列', () => {
    expect(entries()['空相'].senses.map((s) => s.usg)).toEqual(['術語', null])
    expect(entries()['空相'].senses[1].xr).toEqual([])
    for (const [head, e] of Object.entries(entries()))
      for (const s of e.senses) expect(Array.isArray(s.xr), head).toBe(true)
  })
})

describe('[REQ-DAT-004] 辭典授權資訊', () => {
  it('[REQ-DAT-004] license 為 CC BY-SA 2.5 TW', () => {
    expect(b.lexicon.license).toBe('CC BY-SA 2.5 TW')
  })
  it('[REQ-DAT-004] attribution 逐字等於規格出處原句', () => {
    expect(b.lexicon.attribution).toBe(
      '名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權',
    )
    expect(b.lexicon.attribution).toBe(ATTRIBUTION)
  })
})

describe('[REQ-DAT-009] 轉引條目收錄（一層）', () => {
  it('[REQ-DAT-009] 11 個轉引目標皆收入 entries', () => {
    for (const x of XR_TARGETS) expect(entries()[x], x).toBeDefined()
  })

  it('[REQ-DAT-009] 引用它們的義項 xr 列出目標 headword', () => {
    expect(xrOf('觀自在')).toEqual(['觀音'])
    expect(xrOf('五蘊')).toEqual(['陰'])
    expect(xrOf('十八界')).toEqual(['三科'])
    expect(xrOf('心經真言')).toEqual(['蘇波訶'])
    expect(xrOf('究竟涅槃')).toEqual(['大般涅槃'])
    expect(xrOf('菩提薩埵')).toEqual(['菩薩'])
    expect(xrOf('般若波羅蜜多')).toEqual(['般若波羅蜜'])
    expect(xrOf('般若波羅蜜多咒')).toEqual(['心經'])
    expect(xrOf('色不異空')).toEqual(['色即是空'])
    expect(xrOf('苦集滅道')).toEqual(['四諦'])
    expect(xrOf('諸法')).toEqual(['萬法'])
  })

  it('[REQ-DAT-009] 轉引目標自身的 xr 保留，但其目標不收錄', () => {
    expect(xrOf('觀音')).toEqual(['五大明王'])
    expect(xrOf('心經')).toEqual(['般若心經'])
    expect(entries()['五大明王']).toBeUndefined()
    expect(entries()['般若心經']).toBeUndefined()
  })
})

describe('[REQ-DAT-011] 釋義逐字取自 DFB', () => {
  const srcFlat = (parts: (string | { g: string })[]) =>
    parts.map((p) => (typeof p === 'string' ? p : `{g:${p.g}}`)).join('')

  it('[REQ-DAT-011] 每條每義項的 def 與 DFB <def> 逐字相同（含空白與換行）', () => {
    const dfb = loadDfb()
    let compared = 0
    for (const [head, e] of Object.entries(entries())) {
      const src = dfb.get(head)!
      e.senses.forEach((s, i) => {
        expect(flattenDef(s.def), `${head}#${i}`).toBe(srcFlat(src[i].defParts))
        compared++
      })
    }
    expect(compared).toBeGreaterThan(50)
  })

  it('[REQ-DAT-011] 「五蘊」第一義逐字為 色受想行識之五法，皆積集為性者，故云五蘊。', () => {
    expect(flattenDef(entries()['五蘊'].senses[0].def)).toBe('色受想行識之五法，皆積集為性者，故云五蘊。')
  })

  it('[REQ-DAT-011] 「心經真言」的造字以 { g: ID } 物件保留在原位置', () => {
    const def = entries()['心經真言'].senses[0].def as any[]
    const objs = def.filter((p) => typeof p !== 'string')
    expect(objs).toEqual([{ g: 'DF-8752' }, { g: 'DF-875F' }])
    expect(flattenDef(def)).toContain('揭為行不可得之{g:DF-8752}字，諦為如不可得之{g:DF-875F}字')
  })

  it('[REQ-DAT-011] 「四諦」第二義的原文換行原樣保留', () => {
    const flat = flattenDef(entries()['四諦'].senses[1].def)
    expect(flat).toContain('是為悟之因。\n其中前二者流轉之因果也')
  })
})

describe('[REQ-DAT-012] 造字圖檔', () => {
  const gaijiOut = () => join(b.out, 'gaiji')

  it('[REQ-DAT-012] DF-8752.png、DF-875F.png 存在且與原檔位元組相同', () => {
    for (const id of ['DF-8752', 'DF-875F']) {
      const copied = readFileSync(join(gaijiOut(), `${id}.png`))
      const original = readFileSync(join(GAIJI_DIR, `${id}.png`))
      expect(copied.length).toBeGreaterThan(0)
      expect(copied.equals(original)).toBe(true)
    }
  })

  it('[REQ-DAT-012] 只複製被引用的造字，未引用者（DF-8145）不複製', () => {
    const referenced = new Set<string>()
    for (const e of Object.values(entries()))
      for (const s of e.senses) for (const p of s.def) if (typeof p !== 'string') referenced.add(p.g)
    const files = readdirSync(gaijiOut()).sort()
    expect(files).toEqual([...referenced].map((id) => `${id}.png`).sort())
    expect(files).toContain('DF-8752.png')
    expect(files).not.toContain('DF-8145.png')
  })
})

describe('[REQ-DAT-018] 辭典不含專案自撰內容', () => {
  it('[REQ-DAT-018] lexicon.dfb.json 不含任何段落的 vernacular／reflection 文字', () => {
    const text = JSON.stringify(b.lexicon)
    for (const s of sutra.segments) {
      expect(text.includes(s.vernacular), `${s.id} vernacular`).toBe(false)
      expect(text.includes(s.reflection), `${s.id} reflection`).toBe(false)
    }
  })

  it('[REQ-DAT-018] lexicon.dfb.json 不含 vernacular／themes／reflection 欄位', () => {
    const text = JSON.stringify(b.lexicon)
    for (const k of ['"vernacular"', '"themes"', '"reflection"']) expect(text.includes(k)).toBe(false)
  })
})
