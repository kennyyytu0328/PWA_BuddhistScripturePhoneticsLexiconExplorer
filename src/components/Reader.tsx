import { useState } from 'react'
import { usePhoneticMode } from '../hooks/usePhoneticMode'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { useLexiconSelection } from '../hooks/useLexiconSelection'
import { useWakeLock } from '../hooks/useWakeLock'
import type { ReaderData, Segment } from '../lib/types'
import { LexiconDrawer } from './LexiconDrawer'
import { PhoneticToggle } from './PhoneticToggle'
import { SutraViewport } from './SutraViewport'
import { VernacularPanel } from './VernacularPanel'

interface Props {
  data: ReaderData
}

export function Reader({ data }: Props) {
  useWakeLock(true)
  const { mode, cycle } = usePhoneticMode()
  const progress = useReadingProgress()
  const lexicon = useLexiconSelection(data)
  // The segment stays set after closing so the panel content survives the slide-out animation.
  const [vernacular, setVernacular] = useState<{ segment: Segment; open: boolean } | null>(null)

  // Stay bare until the stored mode and page are known, so nothing is drawn and then moved.
  if (mode === null || !progress.loaded) return null

  return (
    <>
      <div className="sutra-glow" data-testid="sutra-glow" aria-hidden="true" />
      <SutraViewport
        segments={data.ast.segments}
        mode={mode}
        activeKey={lexicon.activeKey}
        onSelect={lexicon.select}
        initialSegment={progress.initial}
        onPageChange={progress.save}
        onOpenVernacular={(segment) => setVernacular({ segment, open: true })}
      />
      <PhoneticToggle mode={mode} onCycle={cycle} />
      {vernacular ? (
        <VernacularPanel
          open={vernacular.open}
          onOpenChange={(open) => setVernacular({ ...vernacular, open })}
          segment={vernacular.segment}
        />
      ) : null}
      {lexicon.selection ? (
        <LexiconDrawer
          key={lexicon.selection.id}
          open={lexicon.open}
          onOpenChange={lexicon.setOpen}
          lexicon={data.lexicon}
          lex={lexicon.selection.lex}
          token={lexicon.selection.token}
        />
      ) : null}
    </>
  )
}
