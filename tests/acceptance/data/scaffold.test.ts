import { describe, expect, it } from 'vitest'
import { readJson, ROOT } from './helpers'
import { join } from 'node:path'

describe('[REQ-DAT-001] 技術選型與套件', () => {
  const pkg = readJson(join(ROOT, 'package.json'))
  const deps: Record<string, string> = { ...pkg.dependencies, ...pkg.devDependencies }

  it('[REQ-DAT-001] react 與 react-dom 為 19.x', () => {
    expect(deps['react']).toMatch(/^[\^~]?19\./)
    expect(deps['react-dom']).toMatch(/^[\^~]?19\./)
  })

  it('[REQ-DAT-001] 其餘指定套件皆列於依賴', () => {
    for (const name of [
      'typescript', 'vite', 'tailwindcss', 'vaul', 'vite-plugin-pwa',
      'pinyin-pro', 'dexie', 'vitest', '@playwright/test',
    ]) {
      expect(deps[name], `missing dependency ${name}`).toMatch(/^[\^~]?\d+\./)
    }
  })

  it('[REQ-DAT-001] packageManager 為 pnpm@…', () => {
    expect(pkg.packageManager).toMatch(/^pnpm@\d+\.\d+\.\d+/)
  })
})
