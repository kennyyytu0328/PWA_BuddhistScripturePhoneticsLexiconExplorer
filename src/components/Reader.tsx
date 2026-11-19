import { useCallback, useMemo, useState } from 'react'
import { useFollowAlong } from '../hooks/useFollowAlong'
import { useHaptics } from '../hooks/useHaptics'
import { useFollowPace } from '../hooks/useFollowPace'
import { useVoice } from '../hooks/useVoice'
import { useVoiceClip } from '../hooks/useVoiceClip'
import { COVER_PAGE } from '../lib/cover'
import { buildTimeline, DEFAULT_PACE, tokenChars } from '../lib/followAlong'
import { usePhoneticMode } from '../hooks/usePhoneticMode'
import { useReadingProgress } from '../hooks/useReadingProgress'
import { useLexiconSelection } from '../hooks/useLexiconSelection'
import { useWakeLock } from '../hooks/useWakeLock'
import { clipRange } from '../lib/voice'
import type { ReaderData, Segment } from '../lib/types'
import { FollowControls } from './FollowControls'
import { FollowProgress } from './FollowProgress'
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
  const { pace, cycle: cyclePace } = useFollowPace()
  const segments = data.ast.segments
  const timeline = useMemo(() => buildTimeline(segments), [segments])
  const voice = useVoice(pace === 'voice' || lexicon.open)
  // Switching into or out of 聲 while playing pauses inside useFollowAlong (REQ-RDR-039).
  const { cursor, playing, play, pause, end } = useFollowAlong(timeline, pace ?? DEFAULT_PACE, voice)
  const [visible, setVisible] = useState<string | null>(null)
  // The segment stays set after closing so the panel content survives the slide-out animation.
  const [vernacular, setVernacular] = useState<{ segment: Segment; open: boolean } | null>(null)

  const clip = useVoiceClip(voice)
  const selectionKey = lexicon.selection?.key
  const { toggle: toggleClip } = clip
  const toggleListen = useCallback(() => {
    const chars = selectionKey ? tokenChars(segments, selectionKey) : null
    if (!voice || !chars) return
    toggleClip(clipRange(voice.timings, chars.index, chars.count))
  }, [voice, selectionKey, segments, toggleClip])

  const vibrate = useHaptics()
  const endFollow = useCallback(() => {
    vibrate()
    end()
  }, [vibrate, end])

  const cursorSegment = cursor !== null ? timeline.steps[cursor].segmentId : null
  const follow = useMemo(() => (cursor !== null ? { timeline, cursor } : null), [timeline, cursor])
  const { save } = progress
  const onPageChange = useCallback(
    (id: string, source: 'user' | 'auto') => {
      save(id)
      setVisible(id)
      if (source === 'user' && playing && id !== cursorSegment) pause()
    },
    [save, playing, cursorSegment, pause],
  )
  const { select } = lexicon
  const onSelect = useCallback(
    (key: string) => {
      pause()
      select(key)
    },
    [pause, select],
  )
  const onOpenVernacular = useCallback(
    (segment: Segment) => {
      pause()
      setVernacular({ segment, open: true })
    },
    [pause],
  )

  // Stay bare until the stored mode, page and pace are known, so nothing is drawn and then moved.
  if (mode === null || pace === null || !progress.loaded) return null
  const restored = segments.some((s) => s.id === progress.initial) ? progress.initial : null
  const current = visible ?? restored ?? COVER_PAGE

  return (
    <>
      <div className="sutra-glow" data-testid="sutra-glow" aria-hidden="true" />
      <SutraViewport
        title={data.ast.title}
        segments={segments}
        mode={mode}
        activeKey={lexicon.activeKey}
        onSelect={onSelect}
        initialSegment={progress.initial}
        onPageChange={onPageChange}
        onOpenVernacular={onOpenVernacular}
        follow={follow}
        followSegment={playing ? cursorSegment : null}
      />
      <PhoneticToggle mode={mode} onCycle={cycle} />
      <FollowControls
        playing={playing}
        active={cursor !== null || playing}
        pace={pace}
        onEnd={endFollow}
        onToggle={() => (playing ? pause() : play(current))}
        onCyclePace={cyclePace}
      />
      {cursor !== null ? <FollowProgress fraction={(cursor + 1) / timeline.steps.length} /> : null}
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
          listen={{ playing: clip.playing, toggle: toggleListen, stop: clip.stop }}
        />
      ) : null}
    </>
  )
}
