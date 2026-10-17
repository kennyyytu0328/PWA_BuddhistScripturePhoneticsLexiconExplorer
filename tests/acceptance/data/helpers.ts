import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DOMParser } from '@xmldom/xmldom'
import { expect } from 'vitest'

export const ROOT = resolve(__dirname, '../../..')
export const SUTRA_PATH = join(ROOT, 'data/heart-sutra.json')
export const IAST_PATH = join(ROOT, 'data/iast.json')
export const LOCK_PATH = join(ROOT, 'data/readings.lock.json')
export const CBETA_PATH = join(ROOT, 'data-sources/cbeta/T08n0251.txt')
export const DFB_DIR = join(ROOT, 'data-sources/dfb/dingfubao.dila.tei.p5.xml')
export const DFB_PATH = join(DFB_DIR, 'dingfubao.xml')
export const GAIJI_DIR = join(DFB_DIR, 'gaiji')

export const ATTRIBUTION =
  '名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權'

export interface Token {
  t: string
  lex?: string
  py?: string
  usg?: string
  punct?: boolean
  [k: string]: unknown
}
export interface Segment {
  id: string
  tokens: Token[]
  vernacular: string
  themes: string[]
  reflection: string
}
export interface Sutra {
  id: string
  title: string
  translator: string
  baseText: { variants: { segment: string; recitation: string; cbeta: string }[] } & Record<string, unknown>
  review: { readings: boolean; editorial: boolean }
  segments: Segment[]
}

export const readJson = <T = any>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T

export function makeTmp(prefix = 'sutraflow-acc-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** 在暫存目錄寫出修改後的輸入檔，回傳路徑；絕不修改真實檔案。 */
export function writeFixture(dir: string, name: string, data: unknown): string {
  const p = join(dir, name)
  writeFileSync(p, JSON.stringify(data, null, 2), 'utf8')
  return p
}

export function cloneSutra(): Sutra {
  return structuredClone(readJson<Sutra>(SUTRA_PATH))
}

export function cloneIast(): any {
  return structuredClone(readJson(IAST_PATH))
}

export function copyFile(src: string, destDir: string, name: string): string {
  mkdirSync(destDir, { recursive: true })
  const p = join(destDir, name)
  copyFileSync(src, p)
  return p
}

export function listOut(out: string): string[] {
  return existsSync(out) ? readdirSync(out, { recursive: true }).map(String) : []
}

export function expectBuildFailed(result: { ok: boolean; errors: string[] }, out: string): string {
  expect(result.ok).toBe(false)
  expect(result.errors.length).toBeGreaterThanOrEqual(1)
  expect(listOut(out)).toEqual([])
  return result.errors.join('\n')
}

export function runPnpm(args: string[]) {
  const r = spawnSync('pnpm', args, { cwd: ROOT, shell: true, encoding: 'utf8', timeout: 110_000 })
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/* ---------- 獨立的 DFB 解析（僅依賴原始 XML，不碰實作） ---------- */

export interface DfbSense {
  usg: string | null
  def: string
  defParts: (string | { g: string })[]
  xr: string[]
}
let dfbCache: Map<string, DfbSense[]> | null = null

export function loadDfb(): Map<string, DfbSense[]> {
  if (dfbCache) return dfbCache
  const doc = new DOMParser().parseFromString(readFileSync(DFB_PATH, 'utf8'), 'text/xml')
  const map = new Map<string, DfbSense[]>()
  const entries = doc.getElementsByTagName('entry')
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]
    const form = e.getElementsByTagName('form')[0].textContent ?? ''
    const senses = e.getElementsByTagName('sense')
    const list = map.get(form) ?? []
    for (let j = 0; j < senses.length; j++) {
      const s = senses[j]
      const usgEl = s.getElementsByTagName('usg')[0]
      const defEl = s.getElementsByTagName('def')[0]
      const parts: (string | { g: string })[] = []
      for (let k = 0; k < defEl.childNodes.length; k++) {
        const n = defEl.childNodes[k]
        if (n.nodeType === 3) parts.push(n.nodeValue ?? '')
        else if (n.nodeType === 1 && n.nodeName === 'g') parts.push({ g: (n as Element).getAttribute('ref')!.replace(/^#/, '') })
      }
      const xr: string[] = []
      const xrs = s.getElementsByTagName('xr')
      for (let k = 0; k < xrs.length; k++) xr.push(xrs[k].textContent ?? '')
      list.push({ usg: usgEl ? usgEl.textContent : null, def: defEl.textContent ?? '', defParts: parts, xr })
    }
    map.set(form, list)
  }
  dfbCache = map
  return map
}

/** 將 def（字串或字串／造字物件陣列）攤平成字串，造字以 {g:ID} 標記。 */
export function flattenDef(def: unknown): string {
  const arr = Array.isArray(def) ? def : [def]
  return arr.map((p) => (typeof p === 'string' ? p : `{g:${(p as { g: string }).g}}`)).join('')
}
export function flattenParts(parts: (string | { g: string })[]): string {
  return flattenDef(parts)
}

export function sutraLexSet(sutra: Sutra): Set<string> {
  const s = new Set<string>()
  for (const g of sutra.segments) for (const t of g.tokens) if (t.lex) s.add(t.lex)
  return s
}

/** 經文引用 lex 加上其義項 <xr> 目標（一層）。 */
export function expectedEntryKeys(sutra: Sutra): Set<string> {
  const dfb = loadDfb()
  const keys = sutraLexSet(sutra)
  const out = new Set(keys)
  for (const lex of keys) for (const s of dfb.get(lex) ?? []) for (const x of s.xr) out.add(x)
  return out
}
