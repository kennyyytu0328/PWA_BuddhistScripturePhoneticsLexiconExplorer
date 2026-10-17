import { execFile } from 'node:child_process'
import { mkdtemp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { readJsonFile, writeOutputs } from './io.ts'
import { SutraSchema } from './schemas.ts'

const run = promisify(execFile)

describe('writeOutputs', () => {
  it('清除 gaiji/ 中上次建置留下、本次未引用的造字', async () => {
    const out = await mkdtemp(join(tmpdir(), 'io-'))
    const src = join(out, 'src.png')
    await writeFile(src, 'png')
    await mkdir(join(out, 'gaiji'))
    await writeFile(join(out, 'gaiji', 'DF-8145.png'), 'stale')
    await writeOutputs({ out, ast: {}, lexicon: {}, gaiji: [{ from: src, id: 'DF-8752' }] })
    expect(await readdir(join(out, 'gaiji'))).toEqual(['DF-8752.png'])
  })
})

describe('readJsonFile', () => {
  const fixture = async (data: unknown) => {
    const path = join(await mkdtemp(join(tmpdir(), 'json-')), 'sutra.json')
    await writeFile(path, JSON.stringify(data))
    return path
  }

  it('真實經文主檔通過 schema，且保留 baseText 中繼欄位', async () => {
    const sutra = await readJsonFile('data/heart-sutra.json', SutraSchema)
    expect(sutra.baseText.edition).toBe('流通本（常用課誦本）')
    expect(sutra.baseText.variants[0].apparatus).toContain('僧莎【大】')
  })

  it('缺欄位時錯誤訊息列出檔案與欄位路徑', async () => {
    const { review: _, ...rest } = JSON.parse(await readFile('data/heart-sutra.json', 'utf8'))
    const path = await fixture(rest)
    await expect(readJsonFile(path, SutraSchema)).rejects.toThrow(/sutra\.json 格式錯誤[\s\S]*review/)
  })

  it('token 鍵名打錯時報錯', async () => {
    const sutra = JSON.parse(await readFile('data/heart-sutra.json', 'utf8'))
    sutra.segments[0].tokens[0] = { ...sutra.segments[0].tokens[0], pyy: 'x' }
    await expect(readJsonFile(await fixture(sutra), SutraSchema)).rejects.toThrow(/pyy[\s\S]*segments\[0\]\.tokens\[0\]/)
  })
})

describe('check-review CLI', () => {
  it('任一審閱旗標為 false 時以 exit 1 結束並列出旗標', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'review-'))
    const sutra = JSON.parse(await readFile('data/heart-sutra.json', 'utf8'))
    const fixture = join(dir, 'sutra.json')
    await writeFile(fixture, JSON.stringify({ ...sutra, review: { ...sutra.review, editorial: false } }))
    const result = await run('pnpm', ['tsx', 'scripts/check-review.ts', '--sutra', fixture], { shell: true }).then(
      () => ({ code: 0, stderr: '' }),
      (e: { code: number; stderr: string }) => ({ code: e.code, stderr: e.stderr }),
    )
    expect(result.code).toBe(1)
    expect(result.stderr).toContain('editorial')
  })
})
