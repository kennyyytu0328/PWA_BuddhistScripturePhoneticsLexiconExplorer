import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildData } from '../../../scripts/build-data'
import { checkReview } from '../../../scripts/check-review'
import {
  cloneIast, cloneSutra, IAST_PATH, listOut, makeTmp, readJson, ROOT, runPnpm, SUTRA_PATH, writeFixture,
} from './helpers'

const tmp = makeTmp('sutraflow-rev-')

describe('[REQ-DAT-020] 審閱狀態控管發佈', () => {
  it('[REQ-DAT-020] review.readings 為 false：build:data 照常產出並警告 readings', async () => {
    const s = cloneSutra()
    s.review.readings = false
    const out = join(tmp, 'out-readings')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-readings.json', s), out })
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toContain('readings')
    const ast = readJson(join(out, 'heart-sutra.ast.json'))
    expect(ast.review.readings).toBe(false)
    expect(ast.review.editorial).toBe(true)
  })

  it('[REQ-DAT-020] review.editorial 為 false：build:data 警告 editorial', async () => {
    const s = cloneSutra()
    s.review.editorial = false
    const out = join(tmp, 'out-editorial')
    const r = await buildData({ sutra: writeFixture(tmp, 'sutra-editorial.json', s), out })
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toContain('editorial')
  })

  it('[REQ-DAT-020] iast.json review.iast 為 false：build:data 警告 iast', async () => {
    const i = cloneIast()
    i.review.iast = false
    const out = join(tmp, 'out-iast')
    const r = await buildData({ iast: writeFixture(tmp, 'iast-false.json', i), out })
    expect(r.ok).toBe(true)
    expect(r.warnings.join('\n')).toContain('iast')
  })

  it('[REQ-DAT-020] 三個旗標皆 true 時，build:data 無審閱警告', async () => {
    const out = join(tmp, 'out-clean')
    const r = await buildData({ out })
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it('[REQ-DAT-020] CLI：旗標為 false 時 build:data exit 0，stderr 以 WARN 開頭列出旗標', () => {
    const s = cloneSutra()
    s.review.readings = false
    const sutraPath = writeFixture(tmp, 'sutra-cli-warn.json', s)
    const out = join(tmp, 'cli-warn')
    const r = runPnpm(['build:data', '--sutra', `"${sutraPath}"`, '--out', `"${out}"`])
    expect(r.status).toBe(0)
    const warnLines = r.stderr.split(/\r?\n/).filter((l) => l.startsWith('WARN '))
    expect(warnLines.length).toBeGreaterThanOrEqual(1)
    expect(warnLines.join('\n')).toContain('readings')
    expect(listOut(out).length).toBeGreaterThan(0)
  })

  it('[REQ-DAT-020] checkReview：readings 為 false 時 ok=false，錯誤列出 readings', async () => {
    const s = cloneSutra()
    s.review.readings = false
    const r = await checkReview({ sutra: writeFixture(tmp, 'sutra-gate-r.json', s), iast: IAST_PATH })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('readings')
  })

  it('[REQ-DAT-020] checkReview：editorial 為 false 時 ok=false，錯誤列出 editorial', async () => {
    const s = cloneSutra()
    s.review.editorial = false
    const r = await checkReview({ sutra: writeFixture(tmp, 'sutra-gate-e.json', s), iast: IAST_PATH })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('editorial')
  })

  it('[REQ-DAT-020] checkReview：iast.json review.iast 為 false 時 ok=false，錯誤列出 iast', async () => {
    const i = cloneIast()
    i.review.iast = false
    const r = await checkReview({ sutra: SUTRA_PATH, iast: writeFixture(tmp, 'iast-gate.json', i) })
    expect(r.ok).toBe(false)
    expect(r.errors.join('\n')).toContain('iast')
  })

  it('[REQ-DAT-020] checkReview：真實資料三旗標皆 true 時 ok=true、errors 為空', async () => {
    const r = await checkReview()
    expect(r.errors).toEqual([])
    expect(r.ok).toBe(true)
  })

  it('[REQ-DAT-020] CLI：pnpm tsx scripts/check-review.ts 對真實資料 exit 0', () => {
    const r = runPnpm(['tsx', 'scripts/check-review.ts'])
    expect(r.status).toBe(0)
  })

  it('[REQ-DAT-020] package.json 的 build 腳本在 vite build 之前執行 check-review', () => {
    const build: string = readJson(join(ROOT, 'package.json')).scripts.build
    const gate = build.indexOf('check-review')
    const vite = build.indexOf('vite build')
    expect(gate).toBeGreaterThanOrEqual(0)
    expect(vite).toBeGreaterThan(gate)
  })
})
