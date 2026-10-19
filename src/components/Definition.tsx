import type { Sense } from '../lib/senses'

const PRIVATE_USE = /([\uE000-\uF8FF])/

function Text({ text }: { text: string }) {
  return (
    <>
      {text.split(PRIVATE_USE).map((piece, i) =>
        PRIVATE_USE.test(piece) ? (
          <span key={i} className="missing-glyph" data-testid="missing-glyph" role="img" aria-label="缺字">
            {piece}
          </span>
        ) : (
          piece
        ),
      )}
    </>
  )
}

// Definitions are DFB text verbatim: no trimming, newlines kept (pre-wrap), gaiji as inline images.
export function Definition({ parts }: { parts: Sense['def'] }) {
  return (
    <p className="lexicon-def" data-testid="lexicon-def">
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Text key={i} text={part} />
        ) : (
          <img key={i} className="gaiji" data-gaiji={part.g} src={`data/gaiji/${part.g}.png`} alt="造字" />
        ),
      )}
    </p>
  )
}
