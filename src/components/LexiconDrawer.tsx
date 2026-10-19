import { useState } from 'react'
import { Drawer } from 'vaul'
import type { Lexicon, WordToken } from '../lib/types'
import { LexiconContent } from './LexiconContent'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lexicon: Lexicon
  /** Entry of the tapped token. Mount a fresh drawer (new `key`) per tap so the xref trail starts empty. */
  lex: string
  token: WordToken
}

export function LexiconDrawer({ open, onOpenChange, lexicon, lex, token }: Props) {
  const [trail, setTrail] = useState<string[]>([])
  const current = trail.length > 0 ? trail[trail.length - 1] : lex
  const isRoot = trail.length === 0

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="lexicon-overlay" />
        <Drawer.Content className="lexicon-drawer" data-testid="lexicon-drawer" aria-describedby={undefined}>
          <div className="lexicon-body">
          {isRoot ? null : (
            <button type="button" className="lexicon-back" data-testid="lexicon-back" onClick={() => setTrail((t) => t.slice(0, -1))}>
              返回
            </button>
          )}
          <Drawer.Title className="lexicon-headword" data-testid="lexicon-headword">
            {current}
          </Drawer.Title>
          <LexiconContent
            lexicon={lexicon}
            lex={current}
            token={isRoot ? token : null}
            onXref={(target) => setTrail((t) => [...t, target])}
          />
          <p className="lexicon-attribution" data-testid="lexicon-attribution">
            {lexicon.attribution}
          </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
