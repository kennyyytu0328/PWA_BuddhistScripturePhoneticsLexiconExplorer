import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'

/** 讀取 JSON 並以 schema 驗證結構；錯誤訊息列出檔案與欄位路徑。 */
export async function readJsonFile<S extends z.ZodType>(path: string, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`無法讀取 ${path}：${(error as Error).message}`)
  }
  const result = schema.safeParse(raw)
  if (!result.success) throw new Error(`${path} 格式錯誤：
${z.prettifyError(result.error)}`)
  return result.data
}

export interface OutputBundle {
  out: string
  ast: unknown
  lexicon: unknown
  gaiji: { from: string; id: string }[]
}

/** 全部驗證通過後才呼叫：一次寫出所有產物。 */
export async function writeOutputs(bundle: OutputBundle): Promise<void> {
  const { out } = bundle
  // gaiji/ 只放本次釋義用到的造字，先清掉上次建置留下的舊檔
  await rm(join(out, 'gaiji'), { recursive: true, force: true })
  await mkdir(join(out, 'gaiji'), { recursive: true })
  await writeFile(join(out, 'heart-sutra.ast.json'), JSON.stringify(bundle.ast, null, 2) + '\n', 'utf8')
  await writeFile(join(out, 'lexicon.dfb.json'), JSON.stringify(bundle.lexicon, null, 2) + '\n', 'utf8')
  for (const g of bundle.gaiji) await copyFile(g.from, join(out, 'gaiji', `${g.id}.png`))
}

/** `--gaiji-dir x` 轉為 { gaijiDir: 'x' } */
export function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {}
  for (let i = 0; i < argv.length - 1; i++) {
    if (!argv[i].startsWith('--')) continue
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    result[key] = argv[i + 1]
    i++
  }
  return result
}
