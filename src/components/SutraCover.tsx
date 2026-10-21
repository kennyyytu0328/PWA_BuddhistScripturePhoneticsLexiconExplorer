import { COVER_PAGE, COVER_SWIPE_HINT, COVER_TRANSLATOR } from '../lib/cover'

interface Props {
  title: string
}

/** First fold of the sutra (REQ-RDR-030): title on the right, translator on the left, swipe hint below (REQ-RDR-031). */
export function SutraCover({ title }: Props) {
  return (
    <section className="sutra-cover" data-testid="sutra-cover" data-segment={COVER_PAGE}>
      <div>
        <h1 className="cover-title" data-testid="cover-title">
          {title}
        </h1>
        <p className="cover-translator" data-testid="cover-translator">
          {COVER_TRANSLATOR}
        </p>
      </div>
      <p className="swipe-hint" data-testid="swipe-hint">
        {COVER_SWIPE_HINT}
      </p>
    </section>
  )
}
