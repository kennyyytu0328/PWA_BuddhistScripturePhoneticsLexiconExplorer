import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { buildIcons, buildSvg } from './build-icons.ts'

const pngSize = (buf: Buffer) => ({
  signature: buf.subarray(0, 8).toString('hex'),
  width: buf.readUInt32BE(16),
  height: buf.readUInt32BE(20),
})

let dir: string

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'icons-'))
})
afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe('buildSvg', () => {
  it('draws the glyph path in #e7e5e4 on a full #0c0a09 square', () => {
    const svg = buildSvg('M0 0Z')
    expect(svg).toContain('<rect width="512" height="512" fill="#0c0a09"/>')
    expect(svg).toContain('<path fill="#e7e5e4" d="M0 0Z"/>')
  })
})

describe('buildIcons', () => {
  it('writes favicon.svg and the 192, 512 and 180 PNGs from the 心 outline', async () => {
    const out = join(dir, 'ok')
    const files = await buildIcons({ out })
    expect(files).toEqual(['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png', 'apple-touch-icon.png'])
    expect((await readdir(out)).sort()).toEqual([...files].sort())

    const svg = await readFile(join(out, 'favicon.svg'), 'utf8')
    expect(svg).toMatch(/<path fill="#e7e5e4" d="M[\d. ]+/)
    for (const [file, size] of [['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['apple-touch-icon.png', 180]] as const) {
      expect(pngSize(await readFile(join(out, file)))).toEqual({ signature: '89504e470d0a1a0a', width: size, height: size })
    }
  }, 60_000)

  it('reports an unreadable font and writes nothing', async () => {
    const out = join(dir, 'missing')
    await expect(buildIcons({ font: join(dir, 'nope.otf'), out })).rejects.toThrow(/無法讀取字型 .*nope\.otf/)
    await expect(readdir(out)).rejects.toThrow()
  })
})
