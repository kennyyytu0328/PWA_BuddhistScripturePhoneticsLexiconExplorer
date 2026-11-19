import { useId } from 'react'
import { useLongPress } from '../hooks/useLongPress'
import { MODE_LABEL, type FollowMode } from '../lib/followAlong'

interface Props {
  playing: boolean
  /** The follow-along is in progress (playing or paused with a cursor): a long press on the toggle ends it. */
  active: boolean
  pace: FollowMode
  onToggle: () => void
  onEnd: () => void
  onCyclePace: () => void
}

export function FollowControls({ playing, active, pace, onToggle, onEnd, onCyclePace }: Props) {
  const hintId = useId()
  const press = useLongPress({ enabled: active, onLongPress: onEnd, onClick: onToggle })
  return (
    <>
      <button
        type="button"
        className="follow-button"
        data-testid="follow-pace"
        aria-label={pace === 'voice' ? '隨誦速度：原音朗讀' : `隨誦速度：每分鐘 ${pace} 字`}
        onClick={onCyclePace}
      >
        {MODE_LABEL[pace]}
      </button>
      <button
        type="button"
        className="follow-button"
        data-testid="follow-toggle"
        aria-pressed={playing}
        aria-label={playing ? '暫停隨誦' : '開始隨誦'}
        aria-describedby={active ? hintId : undefined}
        {...press}
      >
        {playing ? '停' : '誦'}
      </button>
      {active ? (
        <span id={hintId} hidden>
          長按結束隨誦
        </span>
      ) : null}
    </>
  )
}
