import { readFile } from 'node:fs/promises'
import { DOMParser } from '@xmldom/xmldom'
import type { DefPart, DfbSense } from './types.ts'

export type DfbIndex = Map<string, DfbSense[]>

/** 解析結果：index 供查詢；unsupported 記錄 <def> 內無法逐字保留的元素（headword → 元素名）。 */
export interface Dfb {
  index: DfbIndex
  unsupported: Map<string, string[]>
}

type XmlNode = {
  nodeType: number
  nodeName: string
  nodeValue: string | null
  textContent: string | null
  childNodes: ArrayLike<XmlNode>
  getAttribute?: (name: string) => string | null
}

const children = (node: XmlNode, name: string): XmlNode[] =>
  Array.from(node.childNodes).filter((n) => n.nodeType === 1 && n.nodeName === name)

function parseDef(def: XmlNode): { parts: DefPart[]; unsupported: string[] } {
  const parts: DefPart[] = []
  const unsupported: string[] = []
  for (const n of Array.from(def.childNodes)) {
    if (n.nodeType === 3) parts.push(n.nodeValue ?? '')
    else if (n.nodeType === 1 && n.nodeName === 'g') {
      parts.push({ g: (n.getAttribute?.('ref') ?? '').replace(/^#/, '') })
    } else if (n.nodeType === 1) unsupported.push(n.nodeName)
  }
  return { parts, unsupported }
}

function parseSense(sense: XmlNode): { sense: DfbSense; unsupported: string[] } {
  const usg = children(sense, 'usg')[0]
  const def = children(sense, 'def')[0]
  const parsed = def ? parseDef(def) : { parts: [], unsupported: [] }
  return {
    sense: {
      usg: usg ? (usg.textContent ?? '') : null,
      def: parsed.parts,
      xr: children(sense, 'xr').map((x) => x.textContent ?? ''),
    },
    unsupported: parsed.unsupported,
  }
}

/** 解析 DFB TEI：headword → 義項陣列（同名多個 entry 的義項依序合併）。 */
export async function loadDfb(path: string): Promise<Dfb> {
  const xml = await readFile(path, 'utf8')
  const doc = new DOMParser().parseFromString(xml, 'text/xml')
  const index: DfbIndex = new Map()
  const unsupported = new Map<string, string[]>()
  const entries = Array.from(doc.getElementsByTagName('entry')) as unknown as XmlNode[]
  for (const entry of entries) {
    const form = children(entry, 'form')[0]?.textContent ?? ''
    const parsed = children(entry, 'sense').map(parseSense)
    index.set(form, [...(index.get(form) ?? []), ...parsed.map((p) => p.sense)])
    const bad = parsed.flatMap((p) => p.unsupported)
    if (bad.length) unsupported.set(form, [...(unsupported.get(form) ?? []), ...bad])
  }
  return { index, unsupported }
}

/** 收錄條目的 <def> 若含 <g> 以外的元素（如 <choice>、<note>），無法逐字保留，中止建置。 */
export function checkUnsupported(heads: string[], unsupported: Map<string, string[]>): string[] {
  return heads.flatMap((head) => {
    const bad = unsupported.get(head)
    return bad ? [`辭典條目「${head}」釋義含無法逐字保留的元素：${[...new Set(bad)].join('、')}`] : []
  })
}

export interface LexiconEntries {
  entries: Record<string, { senses: DfbSense[] }>
  gaijiIds: string[]
}

/** 收錄 lex 條目與其義項 <xr> 目標（僅一層，目標自身的 xr 保留但不再展開）。 */
export function extractEntries(dfb: DfbIndex, lexes: string[]): LexiconEntries {
  const unique = [...new Set(lexes)]
  const targets = unique.flatMap((lex) => (dfb.get(lex) ?? []).flatMap((s) => s.xr))
  const entries: Record<string, { senses: DfbSense[] }> = {}
  for (const head of new Set([...unique, ...targets])) {
    const senses = dfb.get(head)
    if (senses) entries[head] = { senses }
  }
  const gaijiIds = new Set<string>()
  for (const e of Object.values(entries)) {
    for (const s of e.senses) for (const p of s.def) if (typeof p !== 'string') gaijiIds.add(p.g)
  }
  return { entries, gaijiIds: [...gaijiIds] }
}

/** 經文引用條目的 <xr> 目標必須是 DFB 詞條，否則會產生指向不存在條目的連結。 */
export function checkXrTargets(dfb: DfbIndex, lexes: string[]): string[] {
  return [...new Set(lexes)].flatMap((lex) => {
    const targets = new Set((dfb.get(lex) ?? []).flatMap((s) => s.xr))
    return [...targets]
      .filter((x) => !dfb.has(x))
      .map((x) => `辭典條目「${lex}」的 <xr> 目標「${x}」不是 DFB 詞條`)
  })
}

const REFERENCE_PATTERNS = [/見([^見條，。；：、（）「」\s]{1,20})條/g, /與([^與同，。；：、（）「」\s]{1,20})同/g]

/**
 * 釋義中的「見X條」「與X同」，若 X 是 DFB 的詞條（可建立連結），則必須出現在該義項的 <xr>。
 * X 不是詞條者（如「與此例同」的一般行文）不構成轉引。
 */
export function checkReferences(entries: Record<string, { senses: DfbSense[] }>, dfb: DfbIndex): string[] {
  const errors: string[] = []
  for (const [head, entry] of Object.entries(entries)) {
    entry.senses.forEach((sense, i) => {
      const text = sense.def.filter((p): p is string => typeof p === 'string').join('')
      for (const re of REFERENCE_PATTERNS) {
        for (const m of text.matchAll(re)) {
          if (dfb.has(m[1]) && !sense.xr.includes(m[1])) {
            errors.push(`辭典條目「${head}」義項 ${i} 釋義含「${m[0]}」，但 <xr> 缺少「${m[1]}」`)
          }
        }
      }
    })
  }
  return errors
}
