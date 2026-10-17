import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildData } from '../../../scripts/build-data'
import {
  CBETA_PATH, cloneIast, cloneSutra, copyFile, DFB_PATH, expectBuildFailed, listOut, LOCK_PATH, makeTmp,
  readJson, runPnpm, SUTRA_PATH, writeFixture, type Sutra,
} from './helpers'
import { runSuccessfulBuild, type SharedBuild } from './shared-build'

const tmp = makeTmp('sutraflow-val-')
const outOf = (name: string) => join(tmp, `out-${name}`)
const sha = (p: string) => createHash('sha256').update(readFileSync(p)).digest('hex')

const findToken = (s: Sutra, seg: string, t: string) => {
  const tok = s.segments.find((g) => g.id === seg)!.tokens.find((x) => x.t === t)
  if (!tok) throw new Error(`fixture token not found: ${seg}/${t}`)
  return tok
}

describe('[REQ-DAT-005] 原文與 CBETA 一致', () => {
  let b: SharedBuild
  beforeAll(async () => {
    b = await runSuccessfulBuild()
  })

  it('[REQ-DAT-005] 全經 tokens 去標點並換回 cbeta 後，逐字等於 CBETA（260 字）', () => {
    const sutra = readJson<Sutra>(SUTRA_PATH)
    const cjk = (s: string) => s.replace(/[^一-鿿]/g, '')
    const cbeta = cjk(
      readFileSync(CBETA_PATH, 'utf8')
        .split(/\r?\n/)
        .filter((l) => !l.startsWith('#'))
        .join(''),
    )
    let text = cjk(b.ast.segments.map((s: any) => s.tokens.map((t: any) => t.t).join('')).join(''))
    for (const v of sutra.baseText.variants) text = text.replace(cjk(v.recitation), cjk(v.cbeta))
    expect(cbeta.length).toBe(260)
    expect(text).toBe(cbeta)
  })

  it('[REQ-DAT-005] 把「照見」改成「照現」，建置失敗並指出段落 s1，且不寫出產物', async () => {
    const s = cloneSutra()
    findToken(s, 's1', '照見').t = '照現'
    const out = outOf('005')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-005.json', s), out })
    expect(expectBuildFailed(r, out)).toContain('s1')
  })
})

describe('[REQ-DAT-006] lex 必須存在於 DFB', () => {
  it('[REQ-DAT-006] 不存在的 lex：錯誤列出段落 id、token 與該 lex，且不寫出產物', async () => {
    const s = cloneSutra()
    findToken(s, 's1', '菩薩').lex = '不存在的詞條XYZ'
    const out = outOf('006')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-006.json', s), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('s1')
    expect(msg).toContain('菩薩')
    expect(msg).toContain('不存在的詞條XYZ')
  })
})

describe('[REQ-DAT-007] usg 消歧', () => {
  it('[REQ-DAT-007] token 帶 usg 時 sense 指向 <usg> 相符的義項；不帶 usg 時為 0', async () => {
    const s = cloneSutra()
    // 慧光：義項 0 為「術語」、義項 1 為「人名」；天人：義項 0 為「術語」、義項 1 為「天名」
    Object.assign(findToken(s, 's1', '照見'), { lex: '慧光', usg: '人名' })
    Object.assign(findToken(s, 's1', '皆'), { lex: '天人', usg: '天名' })
    Object.assign(findToken(s, 's1', '時'), { lex: '天人', usg: '術語' })
    const out = outOf('007-ok')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-007.json', s), out })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    const ast = readJson(join(out, 'heart-sutra.ast.json'))
    const tok = (t: string) => ast.segments[0].tokens.find((x: any) => x.t === t)
    expect(tok('照見').sense).toBe(1)
    expect(tok('皆').sense).toBe(1)
    expect(tok('時').sense).toBe(0)
    expect(tok('菩薩').sense).toBe(0)
  })

  it('[REQ-DAT-007] usg 在該 lex 條目中無對應義項：建置失敗且不寫出產物', async () => {
    const s = cloneSutra()
    Object.assign(findToken(s, 's1', '照見'), { lex: '慧光', usg: '不存在的類別' })
    const out = outOf('007-bad')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-007-bad.json', s), out })
    expectBuildFailed(r, out)
  })
})

describe('[REQ-DAT-008] py 音節數', () => {
  it('[REQ-DAT-008] 3 字 token 的 py 只有 2 個音節：建置失敗並列出該 token', async () => {
    const s = cloneSutra()
    findToken(s, 's2', '舍利子').py = 'shè lì'
    const out = outOf('008')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-008.json', s), out })
    expect(expectBuildFailed(r, out)).toContain('舍利子')
  })
})

describe('[REQ-DAT-010] 轉引文字與 <xr> 一致', () => {
  it('[REQ-DAT-010] 釋義含「見觀音條」但 <xr> 缺少「觀音」：建置失敗並列出條目與 X', async () => {
    const xml = readFileSync(DFB_PATH, 'utf8')
    const head = xml.indexOf('<form>觀自在</form>')
    expect(head).toBeGreaterThan(0)
    const at = xml.indexOf('<xr>觀音</xr>', head)
    expect(at).toBeGreaterThan(head)
    const patched = xml.slice(0, at) + xml.slice(at + '<xr>觀音</xr>'.length)
    const dfbDir = join(tmp, 'dfb-010')
    const dfb = copyFile(DFB_PATH, dfbDir, 'dingfubao.xml')
    writeFileSync(dfb, patched, 'utf8')
    const out = outOf('010')
    const r = await buildData({ dfb, out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('觀自在')
    expect(msg).toContain('觀音')
  })
})

describe('[REQ-DAT-015] 讀音鎖定比對', () => {
  it('[REQ-DAT-015] 移除「意識界」的 py：失敗並列出段落、token、產生值與 lock 值，lock 檔不變', async () => {
    const before = sha(LOCK_PATH)
    const s = cloneSutra()
    delete findToken(s, 's4', '意識界').py
    const out = outOf('015')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-015.json', s), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('s4')
    expect(msg).toContain('意識界')
    expect(msg).toContain('yì shí jiè')
    expect(msg).toContain('yì shì jiè')
    expect(sha(LOCK_PATH)).toBe(before)
  })

  it('[REQ-DAT-015] 竄改 lock 檔中一個 token 的讀音：失敗並列出該 token（複製的 lock 檔）', async () => {
    const lock = readJson(LOCK_PATH)
    const entry = lock.segments.s1.find((x: any) => x.t === '菩薩')
    entry.py = 'pú sà_x'
    const out = outOf('015b')
    const r = await buildData({ lock: writeFixture(tmp, 'lock-015.json', lock), out })
    const msg = expectBuildFailed(r, out)
    expect(msg).toContain('s1')
    expect(msg).toContain('菩薩')
  })
})

describe('[REQ-DAT-017] IAST 對照表驗證', () => {
  it('[REQ-DAT-017] iast.json 條目的 token 不在經文中：失敗並列出該條目', async () => {
    const iast = cloneIast()
    const e = iast.entries.find((x: any) => x.lex === '菩薩')
    e.tokens = ['不在經文的詞']
    const out = outOf('017a')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-017a.json', iast), out })
    expect(expectBuildFailed(r, out)).toMatch(/菩薩|不在經文的詞/)
  })

  it('[REQ-DAT-017] segments 指定的段落中沒有該 token：失敗', async () => {
    const iast = cloneIast()
    const e = iast.entries.find((x: any) => x.lex === '一切' && x.segments?.includes('s8'))
    e.segments = ['s2'] // 「一切」只出現在 s1、s8
    const out = outOf('017b')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-017b.json', iast), out })
    expectBuildFailed(r, out)
  })
})

describe('CLI 子行程執行 build:data 的 exit code', () => {
  it('[REQ-DAT-002] pnpm build:data --out <tmp> 成功時 exit 0 並寫出三類產物', () => {
    const out = join(tmp, 'cli-ok')
    const r = runPnpm(['build:data', '--out', `"${out}"`])
    expect(r.status).toBe(0)
    const files = listOut(out).map((f) => f.replace(/\\/g, '/'))
    expect(files).toContain('heart-sutra.ast.json')
    expect(files).toContain('lexicon.dfb.json')
    expect(files).toContain('gaiji/DF-8752.png')
  })

  it('[REQ-DAT-006] 不存在的 lex：pnpm tsx scripts/build-data.ts exit 1，stderr 含 lex，且不寫出產物', () => {
    const s = cloneSutra()
    findToken(s, 's1', '菩薩').lex = '不存在的詞條XYZ'
    const sutraPath = writeFixture(tmp, 'sutra-cli-006.json', s)
    const out = join(tmp, 'cli-bad')
    const r = runPnpm(['tsx', 'scripts/build-data.ts', '--sutra', `"${sutraPath}"`, '--out', `"${out}"`])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('不存在的詞條XYZ')
    expect(r.stderr).toContain('s1')
    expect(listOut(out)).toEqual([])
  })
})
