import { useCallback, useState } from 'react'
import { isPunct } from '../lib/types'
import type { ReaderData, WordToken } from '../lib/types'
import { useHaptics } from './useHaptics'

export interface Selection {
  /** Bumped per tap so each opening gets a fresh drawer (and an empty xref trail). */
  id: number
  key: string
  lex: string
  token: WordToken
}

function findToken(data: ReaderData, key: string): WordToken | null {
  const [segmentId, index] = key.split(':')
  const token = data.ast.segments.find((s) => s.id === segmentId)?.tokens[Number(index)]
  return token && !isPunct(token) && token.lex ? token : null
}

/** Which name-term token is tapped and whether its drawer is open. Highlight follows the open drawer (Q-RDR-008). */
export function useLexiconSelection(data: ReaderData) {
  const vibrate = useHaptics()
  const [selection, setSelection] = useState<Selection | null>(null)
  const [open, setOpen] = useState(false)

  const select = useCallback(
    (key: string) => {
      const token = findToken(data, key)
      if (!token?.lex) return
      const lex = token.lex
      vibrate()
      setSelection((prev) => ({ id: (prev?.id ?? 0) + 1, key, lex, token }))
      setOpen(true)
    },
    [data, vibrate],
  )

  return { selection, open, setOpen, select, activeKey: open ? (selection?.key ?? null) : null }
}
