import { MODE_LABEL, type FollowMode } from '../lib/followAlong'

interface Props {
  playing: boolean
  pace: FollowMode
  onToggle: () => void
  onCyclePace: () => void
}

export function FollowControls({ playing, pace, onToggle, onCyclePace }: Props) {
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
        onClick={onToggle}
      >
        {playing ? '停' : '誦'}
      </button>
    </>
  )
}
