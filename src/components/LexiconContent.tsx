import { collectXrefs, orderSenses } from '../lib/senses'
import type { Lexicon, WordToken } from '../lib/types'
import { Definition } from './Definition'

interface Props {
  lexicon: Lexicon
  lex: string
  /** Set only for the entry the tapped token points to; cross-referenced entries have no token. */
  token: WordToken | null
  onXref: (target: string) => void
}

function Readings({ token }: { token: WordToken }) {
  return (
    <section data-testid="lexicon-readings">
      <h3>讀音</h3>
      <p data-testid="reading-zhuyin">{token.chars.map((c) => c.zy).join(' ')}</p>
      <p data-testid="reading-pinyin">{token.chars.map((c) => c.py).join(' ')}</p>
      {token.iast ? <p data-testid="reading-iast">{token.iast}</p> : null}
    </section>
  )
}

function Xrefs({ targets, lexicon, onXref }: { targets: string[]; lexicon: Lexicon; onXref: Props['onXref'] }) {
  return (
    <section data-testid="lexicon-xrefs">
      <h3>參見</h3>
      <ul>
        {targets.map((target) => (
          <li key={target}>
            {lexicon.entries[target] ? (
              <button type="button" data-testid="lexicon-xref" onClick={() => onXref(target)}>
                {target}
              </button>
            ) : (
              <span data-testid="lexicon-xref-text">{target}</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export function LexiconContent({ lexicon, lex, token, onXref }: Props) {
  const entry = lexicon.entries[lex]
  if (!entry) return null
  const senses = orderSenses(entry.senses, token?.sense)
  const xrefs = collectXrefs(entry.senses)
  return (
    <>
      {token ? <Readings token={token} /> : null}
      <section>
        <h3>釋義</h3>
        {senses.map(({ sense, adopted }, i) => (
          <div key={i} data-testid="lexicon-sense" data-adopted={adopted ? 'true' : undefined}>
            {adopted ? <span className="adopted-mark">經文採用</span> : null}
            {sense.usg !== null ? <span data-testid="lexicon-usg">{sense.usg}</span> : null}
            <Definition parts={sense.def} />
          </div>
        ))}
      </section>
      {xrefs.length > 0 ? <Xrefs targets={xrefs} lexicon={lexicon} onXref={onXref} /> : null}
    </>
  )
}
