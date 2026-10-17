import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildData } from '../../../scripts/build-data'
import {
  CBETA_PATH, cloneIast, cloneSutra, copyFile, DFB_PATH, expectBuildFailed, flattenDef, loadDfb, makeTmp, readJson, ROOT, runPnpm,
  writeFixture,
} from './helpers'

describe('[REQ-DAT-010] X 不是 DFB 詞條的「見X條／與X同」不報錯', () => {
  const out = join(makeTmp('sutraflow-gap10-'), 'data')
  let result: Awaited<ReturnType<typeof buildData>>
  let lexicon: any

  beforeAll(async () => {
    result = await buildData({ out })
    lexicon = readJson(join(out, 'lexicon.dfb.json'))
  })

  it('[REQ-DAT-010] 真實資料建置 ok，errors 為空', () => {
    expect(result.errors).toEqual([])
    expect(result.ok).toBe(true)
  })

  const cases: [string, string][] = [
    ['舍利弗', '與設利羅訛言之舍利混同'],
    ['觀音', '與此例同'],
    ['四諦', '見四字部四諦條'],
  ]
  for (const [entry, phrase] of cases) {
    it(`[REQ-DAT-010] 「${entry}」已收錄，且釋義逐字含「${phrase}」`, () => {
      const e = lexicon.entries[entry]
      expect(e).toBeDefined()
      const defs: string[] = e.senses.map((s: any) => flattenDef(s.def))
      expect(defs.some((d) => d.includes(phrase))).toBe(true)
    })
  }
})

describe('[REQ-DAT-012] 輸出 gaiji/ 內本次未引用的舊檔被移除', () => {
  it('[REQ-DAT-012] 預放 DF-8145.png 建置後不存在，gaiji/ 只剩 DF-8752.png、DF-875F.png', async () => {
    const out = join(makeTmp('sutraflow-gap12-'), 'data')
    const gaiji = join(out, 'gaiji')
    mkdirSync(gaiji, { recursive: true })
    writeFileSync(join(gaiji, 'DF-8145.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    const r = await buildData({ out })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(existsSync(join(gaiji, 'DF-8145.png'))).toBe(false)
    expect(readdirSync(gaiji).sort()).toEqual(['DF-8752.png', 'DF-875F.png'])
  })
})

describe('[REQ-DAT-020] 正式建置閘門以非 0 結束', () => {
  it('[REQ-DAT-020] CLI：editorial=false 時 check-review exit 1，stderr 含 editorial', () => {
    const tmp = makeTmp('sutraflow-gap20-')
    const s = cloneSutra()
    s.review.editorial = false
    const sutraPath = writeFixture(tmp, 'sutra-editorial-false.json', s)
    const r = runPnpm(['tsx', 'scripts/check-review.ts', '--sutra', `"${sutraPath}"`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('editorial')
  })

  it('[REQ-DAT-020] package.json build：check-review 在 vite build 之前，且以 && 串接', () => {
    const build: string = readJson(join(ROOT, 'package.json')).scripts.build
    const gate = build.indexOf('check-review')
    const vite = build.indexOf('vite build')
    expect(gate).toBeGreaterThanOrEqual(0)
    expect(vite).toBeGreaterThan(gate)
    const between = build.slice(gate, vite)
    expect(between).toContain('&&')
    expect(between).not.toMatch(/\|\||;|(?<!&)&(?!&)/)
    // 閘門之後第一個分隔符必為 &&
    const rest = build.slice(gate).replace(/^check-review\.ts/, '').trimStart()
    expect(rest.startsWith('&&')).toBe(true)
  })
})

describe('[REQ-DAT-005] 漢字 token 被標為 punct 不得繞過原文比對', () => {
  it('[REQ-DAT-005] s1 的漢字 token「時」被標 punct: true：建置失敗，錯誤指出段落 s1 與該字「時」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap05-')
    const s = cloneSutra()
    const tok = s.segments.find((g) => g.id === 's1')!.tokens.find((x) => x.t === '時')
    if (!tok) throw new Error('fixture token not found: s1/時')
    tok.punct = true
    const out = join(tmp, 'out')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-punct-han.json', s), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('s1')
    expect(msg).toContain('時')
  })
})

describe('[REQ-DAT-005] 原文不一致的錯誤訊息呈現差異（Q-DAT-013）', () => {
  it('[REQ-DAT-005] s1「照見」改成「照現」：建置失敗，錯誤訊息含段落 s1、經文側錯字「現」與 CBETA 側正字「見」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap05diff-')
    const s = cloneSutra()
    const tok = s.segments.find((g) => g.id === 's1')!.tokens.find((x) => x.t === '照見')
    if (!tok) throw new Error('fixture token not found: s1/照見')
    tok.t = '照現'
    const out = join(tmp, 'out')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-diff.json', s), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('s1')
    expect(msg).toContain('現')
    expect(msg).toContain('見')
  })
})

describe('[REQ-DAT-009] 引用條目的 <xr> 目標不是 DFB 詞條（Q-DAT-015）', () => {
  // DFB 真實資料：「一切即一」唯一義項的 <xr> 為「一即一切」，而「一即一切」不是 DFB 詞條
  it('[REQ-DAT-009] lex 指向 xr 目標非詞條的「一切即一」：建置失敗，錯誤訊息列出「一切即一」與「一即一切」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap09-')
    const s = cloneSutra()
    const tok = s.segments.find((g) => g.id === 's1')!.tokens.find((x) => x.t === '照見')
    if (!tok) throw new Error('fixture token not found: s1/照見')
    tok.lex = '一切即一'
    const out = join(tmp, 'out')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-xr-nonentry.json', s), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('一切即一')
    expect(msg).toContain('一即一切')
  })
})

describe('[REQ-DAT-017] iast.json 的 segments 指定段落沒有該 token', () => {
  it('[REQ-DAT-017] 「一切」條目的 segments 改為 s2（s2 無此 token）：建置失敗，錯誤訊息列出「一切」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap17-')
    const iast = cloneIast()
    const e = iast.entries.find((x: any) => x.lex === '一切' && x.segments?.includes('s8'))
    if (!e) throw new Error('fixture entry not found: 一切 / s8')
    e.segments = ['s2'] // 「一切」只出現在 s1、s8
    const out = join(tmp, 'out')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-segments-missing.json', iast), out })
    expect(expectBuildFailed(r, out)).toContain('一切')
  })
})

describe('[REQ-DAT-018] 辭典內容完全由 DFB 決定：義項的鍵、usg、xr（Q-DAT-017）', () => {
  const out = join(makeTmp('sutraflow-gap18-'), 'data')
  let lexicon: any

  beforeAll(async () => {
    const r = await buildData({ out })
    expect(r.errors).toEqual([])
    lexicon = readJson(join(out, 'lexicon.dfb.json'))
  })

  it('[REQ-DAT-018] 每條每個義項的鍵恰為 usg、def、xr', () => {
    let compared = 0
    for (const [head, e] of Object.entries<any>(lexicon.entries)) {
      e.senses.forEach((s: any, i: number) => {
        expect(Object.keys(s).sort(), `${head}#${i}`).toEqual(['def', 'usg', 'xr'])
        compared++
      })
    }
    expect(compared).toBeGreaterThan(50)
  })

  it('[REQ-DAT-018] 每條每個義項的 usg 與 DFB <usg> 相同（無 <usg> 為 null）', () => {
    const dfb = loadDfb()
    let compared = 0
    for (const [head, e] of Object.entries<any>(lexicon.entries)) {
      const src = dfb.get(head)
      expect(src, `${head} 應為 DFB 詞條`).toBeDefined()
      expect(e.senses.length, `${head} 義項數`).toBe(src!.length)
      e.senses.forEach((s: any, i: number) => {
        expect(s.usg, `${head}#${i} usg`).toStrictEqual(src![i].usg)
        compared++
      })
    }
    expect(compared).toBeGreaterThan(50)
  })

  it('[REQ-DAT-018] 每條每個義項的 xr 與 DFB <xr> 目標清單相同（依 XML 出現順序）', () => {
    const dfb = loadDfb()
    let compared = 0
    for (const [head, e] of Object.entries<any>(lexicon.entries)) {
      const src = dfb.get(head)!
      e.senses.forEach((s: any, i: number) => {
        expect(s.xr, `${head}#${i} xr`).toEqual(src[i].xr)
        compared++
      })
    }
    expect(compared).toBeGreaterThan(50)
  })
})

describe('[REQ-DAT-002] 標點 token 恰為 { t, punct: true }（Q-DAT-022）', () => {
  const out = join(makeTmp('sutraflow-gap02-'), 'data')
  let ast: any

  beforeAll(async () => {
    const r = await buildData({ out })
    expect(r.errors).toEqual([])
    ast = readJson(join(out, 'heart-sutra.ast.json'))
  })

  it('[REQ-DAT-002] AST 的每個標點 token 鍵排序後恰為 [punct, t]，值為 { t: <原標點>, punct: true }，且無 chars', () => {
    const src = cloneSutra()
    let checked = 0
    for (const seg of ast.segments) {
      const srcSeg = src.segments.find((g) => g.id === seg.id)!
      expect(seg.tokens.length, `${seg.id} token 數`).toBe(srcSeg.tokens.length)
      seg.tokens.forEach((tok: any, i: number) => {
        if (!srcSeg.tokens[i].punct) return
        expect(Object.keys(tok).sort(), `${seg.id}#${i}`).toEqual(['punct', 't'])
        expect(tok, `${seg.id}#${i}`).toEqual({ t: srcSeg.tokens[i].t, punct: true })
        expect('chars' in tok).toBe(false)
        checked++
      })
    }
    expect(checked).toBeGreaterThan(20)
  })
})

describe('[REQ-DAT-005] CBETA 檔 # 開頭的行為檔頭註解，不參與比對（Q-DAT-022）', () => {
  const cbetaLines = () => readFileSync(CBETA_PATH, 'utf8').split(/\r?\n/)

  it('[REQ-DAT-005] 在 CBETA 檔頭與經文行之間各插入一行含漢字的 # 註解：建置仍成功並寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap05hash-ok-')
    const lines = cbetaLines()
    const firstText = lines.findIndex((l) => !l.startsWith('#') && l.trim() !== '')
    expect(firstText).toBeGreaterThan(0)
    const patched = [
      '# 測試註解，含漢字',
      ...lines.slice(0, firstText + 1),
      '# 中間的測試註解，含漢字',
      ...lines.slice(firstText + 1),
    ].join('\n')
    const cbeta = copyFile(CBETA_PATH, join(tmp, 'cbeta'), 'T08n0251.txt')
    writeFileSync(cbeta, patched, 'utf8')
    const out = join(tmp, 'out')
    const r = await buildData({ cbeta, out })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(existsSync(join(out, 'heart-sutra.ast.json'))).toBe(true)
  })

  it('[REQ-DAT-005] 把第一行非註解的經文行前加 #（變成註解）：經文缺字，建置失敗且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap05hash-bad-')
    const lines = cbetaLines()
    const firstText = lines.findIndex((l) => !l.startsWith('#') && l.trim() !== '')
    expect(firstText).toBeGreaterThan(0)
    lines[firstText] = '#' + lines[firstText]
    const cbeta = copyFile(CBETA_PATH, join(tmp, 'cbeta'), 'T08n0251.txt')
    writeFileSync(cbeta, lines.join('\n'), 'utf8')
    const out = join(tmp, 'out')
    const r = await buildData({ cbeta, out })
    expectBuildFailed(r, out)
  })
})

describe('[REQ-DAT-011] 收錄條目的 <def> 含 <g> 以外元素即中止（Q-DAT-022）', () => {
  it('[REQ-DAT-011] 被經文引用的「觀自在」<def> 內插入 <choice>：建置失敗，錯誤訊息含「觀自在」與「choice」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap11-')
    const xml = readFileSync(DFB_PATH, 'utf8')
    const head = xml.indexOf('<form>觀自在</form>')
    expect(head).toBeGreaterThan(0)
    const marker = '<def>'
    const at = xml.indexOf(marker, head)
    expect(at).toBeGreaterThan(head)
    const patched =
      xml.slice(0, at + marker.length) +
      '<choice><orig>甲</orig><corr>乙</corr></choice>' +
      xml.slice(at + marker.length)
    const dfb = copyFile(DFB_PATH, join(tmp, 'dfb'), 'dingfubao.xml')
    writeFileSync(dfb, patched, 'utf8')
    const out = join(tmp, 'out')
    const r = await buildData({ dfb, out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('觀自在')
    expect(msg).toContain('choice')
  })
})

describe('[REQ-DAT-016] iast.json 重複／重疊／空值即中止（Q-DAT-019）', () => {
  const findEntry = (iast: any, lex: string, seg: string) => {
    const e = iast.entries.find((x: any) => x.lex === lex && x.segments?.includes(seg))
    if (!e) throw new Error(`fixture entry not found: ${lex} / ${seg}`)
    return e
  }

  it('[REQ-DAT-016] (a) entries 有兩筆相同的 lex＋token＋段落（一切／s8）：建置失敗，錯誤訊息含「一切」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap16a-')
    const iast = cloneIast()
    iast.entries.push(structuredClone(findEntry(iast, '一切', 's8')))
    const out = join(tmp, 'out')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-duplicate.json', iast), out })
    expect(expectBuildFailed(r, out)).toContain('一切')
  })

  it('[REQ-DAT-016] (b) 同一 lex＋token＋段落（一切／s8）同時在 entries 與 noIast：建置失敗，錯誤訊息含「一切」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap16b-')
    const iast = cloneIast()
    findEntry(iast, '一切', 's8')
    iast.noIast.push({ lex: '一切', tokens: ['一切'], segments: ['s8'], reason: 'test overlap' })
    const out = join(tmp, 'out')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-overlap.json', iast), out })
    expect(expectBuildFailed(r, out)).toContain('一切')
  })

  it('[REQ-DAT-016] (c) 「觀自在」entries[].iast 為空字串：建置失敗，錯誤訊息含「觀自在」，且不寫出產物', async () => {
    const tmp = makeTmp('sutraflow-gap16c-')
    const iast = cloneIast()
    const e = iast.entries.find((x: any) => x.lex === '觀自在')
    if (!e) throw new Error('fixture entry not found: 觀自在')
    e.iast = ''
    const out = join(tmp, 'out')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-empty.json', iast), out })
    expect(expectBuildFailed(r, out)).toContain('觀自在')
  })
})
