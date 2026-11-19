import { useState } from 'react'
import { Drawer } from 'vaul'
import type { Lexicon, WordToken } from '../lib/types'
import { LexiconContent, type ListenControl } from './LexiconContent'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  lexicon: Lexicon
  /** Entry of the tapped token. Mount a fresh drawer (new `key`) per tap so the xref trail starts empty. */
  lex: string
  token: WordToken
  /** 聽 for the tapped term (REQ-RDR-043); without it the drawer has no button. */
  listen?: ListenControl
}

export function LexiconDrawer({ open, onOpenChange, lexicon, lex, token, listen }: Props) {
  const [trail, setTrail] = useState<string[]>([])
  const current = trail.length > 0 ? trail[trail.length - 1] : lex
  const isRoot = trail.length === 0

  const follow = (target: string) => {
    listen?.stop()
    setTrail((t) => [...t, target])
  }
  const changeOpen = (next: boolean) => {
    if (!next) listen?.stop()
    onOpenChange(next)
  }

  return (
    <Drawer.Root open={open} onOpenChange={changeOpen}>
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
            onXref={follow}
            listen={listen}
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
