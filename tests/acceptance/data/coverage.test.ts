import { describe, expect, it } from 'vitest'
import config from '../../../vitest.config'

describe('[REQ-DAT-021] 測試覆蓋率設定', () => {
  const coverage = (config as any).test?.coverage

  it('[REQ-DAT-021] coverage.include 涵蓋 scripts/', () => {
    expect(Array.isArray(coverage?.include)).toBe(true)
    expect((coverage.include as string[]).some((p) => p.replace(/^\.\//, '').startsWith('scripts/'))).toBe(true)
  })

  it('[REQ-DAT-021] coverage.thresholds.lines >= 80', () => {
    expect(coverage?.thresholds?.lines).toBeGreaterThanOrEqual(80)
  })
})
