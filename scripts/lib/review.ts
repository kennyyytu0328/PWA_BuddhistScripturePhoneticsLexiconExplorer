import type { IastFile, Sutra } from './types.ts'

/** 回傳為 false 的審閱旗標訊息。 */
export function falseReviewFlags(sutra: Sutra, iast: IastFile): string[] {
  const flags: [string, boolean][] = [
    ['readings', sutra.review.readings],
    ['editorial', sutra.review.editorial],
    ['iast', iast.review.iast],
  ]
  return flags.filter(([, v]) => v !== true).map(([k]) => `review.${k} 為 false（尚未人工審閱）`)
}
