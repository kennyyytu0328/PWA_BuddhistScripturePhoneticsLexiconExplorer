import { join } from 'node:path'
import { buildData } from '../../../scripts/build-data'
import { makeTmp, readJson } from './helpers'

export interface SharedBuild {
  out: string
  result: Awaited<ReturnType<typeof buildData>>
  ast: any
  lexicon: any
}

/** 以真實輸入對暫存 out 目錄建置一次（每個測試檔各自呼叫一次）。 */
export async function runSuccessfulBuild(): Promise<SharedBuild> {
  const out = join(makeTmp('sutraflow-out-'), 'data')
  const result = await buildData({ out })
  if (!result.ok) throw new Error('baseline build failed: ' + result.errors.join('\n'))
  return {
    out,
    result,
    ast: readJson(join(out, 'heart-sutra.ast.json')),
    lexicon: readJson(join(out, 'lexicon.dfb.json')),
  }
}
