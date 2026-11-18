import { followMark } from '../lib/followAlong'
import { GLYPH_LENGTH, LIGHT_TONE, cellLengths, zhuyinParts } from '../lib/rubyLayout'
import { isPunct } from '../lib/types'
import type { PhoneticMode, Token as TokenData, WordToken } from '../lib/types'

interface Props {
  token: TokenData
  mode: PhoneticMode
  active: boolean
  onSelect: (lex: string) => void
  /** In-page index of this token's first character (for punctuation: the character before it). */
  followFrom?: number
  /** In-page follow-along cursor; null when not following (no data-follow is rendered). */
  followAt?: number | null
}

function ZhuyinRt({ zy }: { zy: string }) {
  const { light, symbols, tone } = zhuyinParts(zy)
  return (
    <rt className="rt-zhuyin">
      {light ? <span className="zy-light">{LIGHT_TONE}</span> : null}
      <span className="zy-symbols">
        {symbols}
        {tone ? <span className="zy-tone">{tone}</span> : null}
      </span>
    </rt>
  )
}

// Every mode renders the same sized cells, with `<rt>` taken out of flow (see index.css and lib/rubyLayout.ts),
// so switching modes never moves the text.
function Annotated({ token, mode, followFrom, followAt }: { token: WordToken; mode: PhoneticMode; followFrom: number; followAt: number | null }) {
  const follow = (i: number) => (followAt === null ? undefined : followMark(followFrom + i, followAt))
  const lengths = cellLengths(token)
  // Padding (not a fixed-size box) keeps the characters in one text run, so vertical kerning still
  // pulls 。，；！： up against the character before them (§8.2). The cell carries the page's 0.5em
  // letter-spacing as even padding instead (letter-spacing: 0 in index.css), so the glyph sits in the
  // middle of its cell, where the centred `<rt>` is.
  const style = (i: number) => {
    const pad = `${(lengths[i] - GLYPH_LENGTH) / 2}px`
    return { paddingTop: pad, paddingBottom: pad }
  }

  if (mode === 'zhuyin' || mode === 'pinyin') {
    return token.chars.map((ch, i) => (
      <ruby className="cell" style={style(i)} data-follow={follow(i)} key={i}>
        {ch.c}
        {mode === 'zhuyin' ? <ZhuyinRt zy={ch.zy} /> : <rt>{ch.py}</rt>}
      </ruby>
    ))
  }
  const cells = token.chars.map((ch, i) => (
    <span className="cell" style={style(i)} data-follow={follow(i)} key={i}>
      {ch.c}
    </span>
  ))
  if (mode === 'iast' && token.iast) {
    return (
      <ruby className="cell-group">
        {cells}
        <rt>{token.iast}</rt>
      </ruby>
    )
  }
  return cells
}

export function Token({ token, mode, active, onSelect, followFrom = 0, followAt = null }: Props) {
  if (isPunct(token)) {
    // A mark follows the character before it: ahead while that one is ahead, otherwise already read.
    const mark = followAt === null ? undefined : followMark(followFrom, followAt) === 'ahead' ? 'ahead' : 'read'
    return (
      <span className="punct" data-testid="punct" data-follow={mark} lang="zh-Hans">
        {token.t}
      </span>
    )
  }
  const content = <Annotated token={token} mode={mode} followFrom={followFrom} followAt={followAt} />
  if (!token.lex) return <span data-testid="token">{content}</span>
  const lex = token.lex
  return (
    <button
      type="button"
      className="lex-token"
      data-testid="lex-token"
      data-lex={lex}
      data-active={active ? 'true' : undefined}
      onClick={() => onSelect(lex)}
    >
      {content}
    </button>
  )
}
