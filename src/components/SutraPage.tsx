import { memo } from 'react'
import { BACK_TO_COVER } from '../lib/cover'
import { isPunct } from '../lib/types'
import type { PhoneticMode, Segment, Token as TokenData } from '../lib/types'
import { Token } from './Token'

interface Props {
  segment: Segment
  mode: PhoneticMode
  activeKey: string | null
  onSelect: (key: string) => void
  /** Cursor inside this page (clamped upstream so far-away pages keep equal props); null = not following. */
  followAt: number | null
  /** Opens this page's 白話參考 panel; the button is rendered only when given. Keep it referentially stable. */
  onOpenVernacular?: (segmentId: string) => void
  /** Given on the last page only: renders 回到經首 above 白話參考. Keep it referentially stable. */
  onBackToCover?: () => void
}

interface Indexed {
  token: TokenData
  index: number
  /** In-page index of the token's first character; for punctuation, of the character before it. */
  from: number
}

function charCount(token: TokenData): number {
  return isPunct(token) ? 0 : token.chars.length
}

// Punctuation is bound to the token before it so a column never starts with 。，；！： (REQ-RDR-007).
function groupWithPunctuation(tokens: TokenData[]): Indexed[][] {
  let chars = 0
  return tokens.reduce<Indexed[][]>((groups, token, index) => {
    const entry = { token, index, from: isPunct(token) ? chars - 1 : chars }
    chars += charCount(token)
    const last = groups[groups.length - 1]
    if (isPunct(token) && last) return [...groups.slice(0, -1), [...last, entry]]
    return [...groups, [entry]]
  }, [])
}

export const SutraPage = memo(function SutraPage({ segment, mode, activeKey, onSelect, followAt, onOpenVernacular, onBackToCover }: Props) {
  return (
    <section
      className={onBackToCover ? 'sutra-page sutra-page-last' : 'sutra-page'}
      data-testid="sutra-page"
      data-segment={segment.id}
    >
      <div className="sutra-text">
        {groupWithPunctuation(segment.tokens).map((group) => (
          <span className="no-break" key={group[0].index}>
            {group.map(({ token, index, from }) => {
              const key = `${segment.id}:${index}`
              return (
                <Token
                  key={key}
                  token={token}
                  mode={mode}
                  active={activeKey === key}
                  onSelect={() => onSelect(key)}
                  followFrom={from}
                  followAt={followAt}
                />
              )
            })}
          </span>
        ))}
      </div>
      {onBackToCover && (
        <button type="button" className="back-to-cover" data-testid="back-to-cover" onClick={onBackToCover}>
          {BACK_TO_COVER}
        </button>
      )}
      {onOpenVernacular && (
        <button
          type="button"
          className="vernacular-toggle"
          data-testid="vernacular-toggle"
          onClick={() => onOpenVernacular(segment.id)}
        >
          白話參考
        </button>
      )}
    </section>
  )
})
