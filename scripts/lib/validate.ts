import type { DfbIndex } from './dfb.ts'
import { joinPinyin } from './phonetics.ts'
import type { Char, IastEntry, IastFile, LockFile, Sutra, SutraSegment } from './types.ts'

const PUNCT = /[\s\p{P}\p{S}]/gu
export const stripPunct = (s: string): string => s.replace(PUNCT, '')

// 含標點 token：標點字元由 stripPunct 去除，誤標為 punct 的文字因此仍會參與比對
const segmentText = (seg: SutraSegment): string => seg.tokens.map((t) => t.t).join('')

/** 標為 punct 的 token 只能含標點字元。 */
export function validatePunct(sutra: Sutra): string[] {
  return sutra.segments.flatMap((seg) =>
    seg.tokens
      .filter((t) => t.punct && stripPunct(t.t) !== '')
      .map((t) => `${seg.id}：token「${t.t}」標為 punct，但含非標點文字「${stripPunct(t.t)}」`),
  )
}

/** 套用 variants（流通本 → CBETA 用字）後逐字比對 CBETA，回報首個差異所在段落。 */
export function validateAgainstCbeta(sutra: Sutra, cbetaRaw: string): string[] {
  const cbeta = stripPunct(
    cbetaRaw.split(/\r?\n/).filter((l) => !l.startsWith('#')).join(''),
  )
  const variantErrors = sutra.baseText.variants
    .filter((v) => !sutra.segments.some((seg) => seg.id === v.segment))
    .map((v) => `baseText.variants：段落 ${v.segment} 不存在`)
  const pieces = sutra.segments.map((seg) => {
    let text = stripPunct(segmentText(seg))
    for (const v of sutra.baseText.variants.filter((x) => x.segment === seg.id)) {
      const recitation = stripPunct(v.recitation)
      if (!text.includes(recitation)) variantErrors.push(`baseText.variants：段落 ${seg.id} 找不到流通本文字「${v.recitation}」`)
      text = text.replace(recitation, stripPunct(v.cbeta))
    }
    return { id: seg.id, text }
  })
  if (variantErrors.length) return variantErrors
  const actual = pieces.map((p) => p.text).join('')
  if (actual === cbeta) return []

  let diff = 0
  while (diff < actual.length && diff < cbeta.length && actual[diff] === cbeta[diff]) diff++
  const ends = pieces.map((_, i) => pieces.slice(0, i + 1).reduce((n, p) => n + p.text.length, 0))
  const hit = pieces[ends.findIndex((end) => end > diff)] ?? pieces[pieces.length - 1]
  return [
    `與 CBETA 不一致：段落 ${hit.id}，第 ${diff + 1} 字，經文「${actual.slice(diff, diff + 6)}」，CBETA「${cbeta.slice(diff, diff + 6)}」`,
  ]
}

/** lex 必須存在於 DFB；回傳錯誤，並以 resolveSense 解析義項索引。 */
export function resolveSenses(sutra: Sutra, dfb: DfbIndex): { errors: string[]; senses: Map<string, number> } {
  const errors: string[] = []
  const senses = new Map<string, number>()
  sutra.segments.forEach((seg) =>
    seg.tokens.forEach((token, i) => {
      if (!token.lex) return
      const list = dfb.get(token.lex)
      if (!list) {
        errors.push(`${seg.id}：token「${token.t}」的 lex「${token.lex}」不在 DFB`)
        return
      }
      const index = token.usg ? list.findIndex((s) => s.usg === token.usg) : 0
      if (index < 0) {
        errors.push(`${seg.id}：token「${token.t}」的 lex「${token.lex}」沒有 usg 為「${token.usg}」的義項`)
        return
      }
      senses.set(`${seg.id}:${i}`, index)
    }),
  )
  return { errors, senses }
}

/** iast.json 驗證：每個 token 都存在於經文、iast 非空、同一 lex＋token＋段落只能出現一次。 */
export function validateIast(sutra: Sutra, iast: IastFile): string[] {
  const missing = [...iast.entries, ...iast.noIast].flatMap((e) =>
    e.tokens
      .filter((tok) => occurrences(sutra, e, tok).length === 0)
      .map((tok) => `iast.json 條目「${e.lex}」的 token「${tok}」在經文${e.segments ? ` ${e.segments.join(',')} 段` : ''}中找不到`),
  )
  const empty = iast.entries
    .filter((e) => e.iast.trim() === '')
    .map((e) => `iast.json 條目「${e.lex}」（${e.tokens.join('、')}）的 iast 為空字串`)
  return [...missing, ...empty, ...duplicateKeys(sutra, iast)]
}

/** 條目實際命中的段落 id（依 lex、token 與 segments 限定）。 */
function occurrences(sutra: Sutra, e: IastEntry, tok: string): string[] {
  return sutra.segments
    .filter((seg) => (!e.segments || e.segments.includes(seg.id)) && seg.tokens.some((t) => t.lex === e.lex && t.t === tok))
    .map((seg) => seg.id)
}

/** 展開為 lex|token|段落，找出 entries 內重複，以及 entries 與 noIast 重疊者。 */
function duplicateKeys(sutra: Sutra, iast: IastFile): string[] {
  const keysOf = (e: IastEntry) => e.tokens.flatMap((tok) => occurrences(sutra, e, tok).map((seg) => ({ e, tok, seg })))
  const entryKeys = iast.entries.flatMap(keysOf)
  const noIastKeys = new Set(iast.noIast.flatMap(keysOf).map((k) => `${k.e.lex}|${k.tok}|${k.seg}`))
  const seen = new Set<string>()
  return entryKeys.flatMap(({ e, tok, seg }) => {
    const key = `${e.lex}|${tok}|${seg}`
    const errors = [
      ...(seen.has(key) ? [`iast.json 條目「${e.lex}」的 token「${tok}」在 ${seg} 段重複出現於 entries`] : []),
      ...(noIastKeys.has(key) ? [`iast.json 條目「${e.lex}」的 token「${tok}」在 ${seg} 段同時列於 entries 與 noIast`] : []),
    ]
    seen.add(key)
    return errors
  })
}

/** 取得 token 的 IAST：依 entries 比對 lex、t、段落。 */
export function iastFor(iast: IastFile, segId: string, t: string, lex: string | undefined): string | undefined {
  if (!lex) return undefined
  return iast.entries.find(
    (e) => e.lex === lex && e.tokens.includes(t) && (!e.segments || e.segments.includes(segId)),
  )?.iast
}

/** 產生的讀音需與 readings.lock.json 逐 token 相同。 */
export function compareWithLock(
  sutra: Sutra,
  readings: (Char[] | null)[][],
  lock: LockFile,
): string[] {
  const errors: string[] = []
  sutra.segments.forEach((seg, si) => {
    const locked = lock.segments[seg.id] ?? []
    const generated = seg.tokens
      .map((token, ti) => ({ t: token.t, chars: readings[si][ti] }))
      .filter((x): x is { t: string; chars: Char[] } => x.chars !== null)
    if (generated.length !== locked.length) {
      errors.push(`${seg.id}：讀音鎖定檔有 ${locked.length} 個 token，經文有 ${generated.length} 個`)
    }
    generated.forEach((g, i) => {
      const py = joinPinyin(g.chars)
      if (!locked[i] || locked[i].t !== g.t || locked[i].py !== py) {
        errors.push(`${seg.id}：token「${g.t}」讀音與鎖定檔不同，產生值「${py}」，lock 值「${locked[i]?.py ?? '（無）'}」`)
      }
    })
  })
  return errors
}
