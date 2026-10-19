import { Drawer } from 'vaul'
import type { Segment } from '../lib/types'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Kept mounted through the close animation, so the caller keeps the last segment. */
  segment: Segment
}

// Project-written content (CLAUDE.md §4-2): kept apart from the DFB lexicon drawer and labelled 白話參考.
export function VernacularPanel({ open, onOpenChange, segment }: Props) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="lexicon-overlay" />
        <Drawer.Content className="vernacular-panel" data-testid="vernacular-panel" aria-describedby={undefined}>
          <div className="vernacular-body">
            <Drawer.Title className="vernacular-title" data-testid="vernacular-title">
              白話參考
            </Drawer.Title>
            <p className="vernacular-text" data-testid="vernacular-text">
              {segment.vernacular}
            </p>
            <ul className="vernacular-themes">
              {segment.themes.map((theme) => (
                <li key={theme} data-testid="vernacular-theme">
                  {theme}
                </li>
              ))}
            </ul>
            <p className="vernacular-reflection" data-testid="vernacular-reflection">
              {segment.reflection}
            </p>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
