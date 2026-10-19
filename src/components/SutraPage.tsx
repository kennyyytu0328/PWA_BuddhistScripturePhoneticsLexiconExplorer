import type { ReactNode } from 'react'
import { isPunct } from '../lib/types'
import type { PhoneticMode, Segment, Token as TokenData } from '../lib/types'
import { Token } from './Token'

interface Props {
  segment: Segment
  mode: PhoneticMode
  activeKey: string | null
  onSelect: (key: string) => void
  /** Slot for per-page controls (the 白話參考 button lands here). */
  children?: ReactNode
}

interface Indexed {
  token: TokenData
  index: number
}

// Punctuation is bound to the token before it so a column never starts with 。，；！： (REQ-RDR-007).
function groupWithPunctuation(tokens: TokenData[]): Indexed[][] {
  return tokens.reduce<Indexed[][]>((groups, token, index) => {
    const last = groups[groups.length - 1]
    if (isPunct(token) && last) return [...groups.slice(0, -1), [...last, { token, index }]]
    return [...groups, [{ token, index }]]
  }, [])
}

export function SutraPage({ segment, mode, activeKey, onSelect, children }: Props) {
  return (
    <section className="sutra-page" data-testid="sutra-page" data-segment={segment.id}>
      <div className="sutra-text">
        {groupWithPunctuation(segment.tokens).map((group) => (
          <span className="no-break" key={group[0].index}>
            {group.map(({ token, index }) => {
              const key = `${segment.id}:${index}`
              return (
                <Token
                  key={key}
                  token={token}
                  mode={mode}
                  active={activeKey === key}
                  onSelect={() => onSelect(key)}
                />
              )
            })}
          </span>
        ))}
      </div>
      {children}
    </section>
  )
}
