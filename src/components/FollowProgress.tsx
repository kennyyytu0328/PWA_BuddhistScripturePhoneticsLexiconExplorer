interface Props {
  /** 0 < fraction <= 1 */
  fraction: number
}

export function FollowProgress({ fraction }: Props) {
  return <div className="follow-progress" data-testid="follow-progress" aria-hidden="true" style={{ transform: `scaleX(${fraction})` }} />
}
