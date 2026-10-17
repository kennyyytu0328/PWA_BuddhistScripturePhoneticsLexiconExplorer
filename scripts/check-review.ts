import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs, readJsonFile } from './lib/io.ts'
import { falseReviewFlags } from './lib/review.ts'
import { IastFileSchema, SutraSchema } from './lib/schemas.ts'

export async function checkReview(
  options: { sutra?: string; iast?: string } = {},
): Promise<{ ok: boolean; errors: string[] }> {
  try {
    const sutra = await readJsonFile(options.sutra ?? 'data/heart-sutra.json', SutraSchema)
    const iast = await readJsonFile(options.iast ?? 'data/iast.json', IastFileSchema)
    const errors = falseReviewFlags(sutra, iast)
    return { ok: errors.length === 0, errors }
  } catch (error) {
    return { ok: false, errors: [(error as Error).message] }
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const r = await checkReview(parseArgs(process.argv.slice(2)))
  for (const e of r.errors) process.stderr.write(`${e}\n`)
  process.exit(r.ok ? 0 : 1)
}
