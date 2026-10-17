const INITIALS: Record<string, string> = {
  zh: 'ㄓ', ch: 'ㄔ', sh: 'ㄕ', b: 'ㄅ', p: 'ㄆ', m: 'ㄇ', f: 'ㄈ', d: 'ㄉ', t: 'ㄊ', n: 'ㄋ', l: 'ㄌ',
  g: 'ㄍ', k: 'ㄎ', h: 'ㄏ', j: 'ㄐ', q: 'ㄑ', x: 'ㄒ', r: 'ㄖ', z: 'ㄗ', c: 'ㄘ', s: 'ㄙ',
}

const FINALS: Record<string, string> = {
  a: 'ㄚ', o: 'ㄛ', e: 'ㄜ', ê: 'ㄝ', ai: 'ㄞ', ei: 'ㄟ', ao: 'ㄠ', ou: 'ㄡ', an: 'ㄢ', en: 'ㄣ',
  ang: 'ㄤ', eng: 'ㄥ', ong: 'ㄨㄥ', er: 'ㄦ',
  i: 'ㄧ', ia: 'ㄧㄚ', io: 'ㄧㄛ', ie: 'ㄧㄝ', iao: 'ㄧㄠ', iu: 'ㄧㄡ', iou: 'ㄧㄡ', ian: 'ㄧㄢ',
  in: 'ㄧㄣ', iang: 'ㄧㄤ', ing: 'ㄧㄥ', iong: 'ㄩㄥ',
  u: 'ㄨ', ua: 'ㄨㄚ', uo: 'ㄨㄛ', uai: 'ㄨㄞ', ui: 'ㄨㄟ', uei: 'ㄨㄟ', uan: 'ㄨㄢ', un: 'ㄨㄣ',
  uen: 'ㄨㄣ', uang: 'ㄨㄤ', ueng: 'ㄨㄥ',
  ü: 'ㄩ', üe: 'ㄩㄝ', üan: 'ㄩㄢ', ün: 'ㄩㄣ',
}

// 舌尖元音：聲母後無韻母（zhi chi shi ri zi ci si）
const APICAL = new Set(['zh', 'ch', 'sh', 'r', 'z', 'c', 's'])

const TONE_MARKS: Record<string, number> = { '̄': 1, '́': 2, '̌': 3, '̀': 4 }
const TONE_SYMBOLS = ['˙', '', 'ˊ', 'ˇ', 'ˋ']

function splitTone(syllable: string): { base: string; tone: number } {
  let tone = 0
  let base = ''
  for (const ch of syllable.normalize('NFD')) {
    if (ch in TONE_MARKS) tone = TONE_MARKS[ch]
    else base += ch
  }
  return { base: base.normalize('NFC').toLowerCase().replace(/v/g, 'ü'), tone }
}

function splitSemivowel(base: string): { initial: string; final: string } {
  const rest = base.slice(1)
  if (base[0] === 'y') {
    if (rest.startsWith('i')) return { initial: '', final: rest }
    if (rest.startsWith('u') || rest.startsWith('ü')) return { initial: '', final: 'ü' + rest.slice(1) }
    return { initial: '', final: 'i' + rest }
  }
  return { initial: '', final: rest.startsWith('u') ? rest : 'u' + rest }
}

function splitInitial(base: string): { initial: string; final: string } {
  if (base.startsWith('y') || base.startsWith('w')) return splitSemivowel(base)
  const initial = ['zh', 'ch', 'sh'].find((p) => base.startsWith(p)) ?? (base[0] in INITIALS ? base[0] : '')
  const final = base.slice(initial.length)
  // j q x 後的 u 實為 ü
  if (initial !== '' && 'jqx'.includes(initial) && final.startsWith('u')) {
    return { initial, final: 'ü' + final.slice(1) }
  }
  return { initial, final }
}

/** 單一帶調號拼音音節 → 注音，例 'rě' → 'ㄖㄜˇ'（一聲不標、輕聲標 ˙ 於前）。 */
export function toZhuyin(syllable: string): string {
  const { base, tone } = splitTone(syllable)
  const { initial, final } = splitInitial(base)
  const head = initial ? INITIALS[initial] : ''
  let tail: string
  if (final === 'i' && APICAL.has(initial)) tail = ''
  else if (final in FINALS) tail = FINALS[final]
  else throw new Error(`無法轉換注音的音節：${syllable}`)
  const mark = TONE_SYMBOLS[tone]
  return tone === 0 ? mark + head + tail : head + tail + mark
}
