import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type * as fontkit from 'fontkit'
import { Resvg } from '@resvg/resvg-js'
import { parseArgs } from './lib/io.ts'
import { openFont } from './lib/open-font.ts'
import { placeGlyph, withinSafeZone, type Bbox } from './lib/icon-layout.ts'

export interface IconBuildOptions {
  font?: string
  out?: string
}

const GLYPH = '心'
const INK = '#e7e5e4'
const BG = '#0c0a09'
/** SVG 的座標系；PNG 由此縮放，四個產物共用同一個 path。 */
const VIEW = 512
const PNGS = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
]

const fmt = (n: number) => String(Math.round(n * 100) / 100)

/** 把字形外框以放置參數轉成 SVG path data（字型座標 y 向上，翻轉為 SVG 座標）。 */
function glyphPathData(font: fontkit.Font): string {
  const glyph = font.glyphForCodePoint(GLYPH.codePointAt(0)!)
  if (glyph.id === 0) throw new Error(`字型缺字 ${GLYPH}`)
  const bbox: Bbox = glyph.bbox
  const p = placeGlyph(bbox, VIEW)
  if (!withinSafeZone(bbox, p, VIEW)) throw new Error('字形超出 maskable 安全區')
  const x = (v: number) => fmt(p.tx + p.scale * v)
  const y = (v: number) => fmt(p.ty - p.scale * v)
  return glyph.path.commands
    .map((c) => {
      const a = c.args
      switch (c.command) {
        case 'moveTo':
          return `M${x(a[0])} ${y(a[1])}`
        case 'lineTo':
          return `L${x(a[0])} ${y(a[1])}`
        case 'quadraticCurveTo':
          return `Q${x(a[0])} ${y(a[1])} ${x(a[2])} ${y(a[3])}`
        case 'bezierCurveTo':
          return `C${x(a[0])} ${y(a[1])} ${x(a[2])} ${y(a[3])} ${x(a[4])} ${y(a[5])}`
        case 'closePath':
          return 'Z'
        default:
          throw new Error(`未支援的字形外框指令 ${c.command}`)
      }
    })
    .join('')
}

export function buildSvg(pathData: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VIEW} ${VIEW}" width="${VIEW}" height="${VIEW}">` +
    `<rect width="${VIEW}" height="${VIEW}" fill="${BG}"/>` +
    `<path fill="${INK}" d="${pathData}"/></svg>\n`
  )
}

async function readFontFile(path: string): Promise<Buffer> {
  try {
    return await readFile(path)
  } catch (error) {
    throw new Error(`無法讀取字型 ${path}：${(error as Error).message}`)
  }
}

/** SVG 只有 path、不含文字，不載入系統字型，產物不受建置機器影響。 */
const renderPng = (svg: string, size: number): Buffer =>
  new Resvg(svg, { fitTo: { mode: 'width', value: size }, font: { loadSystemFonts: false } }).render().asPng()

export async function buildIcons(options: IconBuildOptions = {}): Promise<string[]> {
  const fontPath = options.font ?? 'fonts/NotoSerifCJKtc-Regular.otf'
  const out = options.out ?? 'public'
  const svg = buildSvg(glyphPathData(openFont(await readFontFile(fontPath))))
  // render everything before writing, so a failure never leaves a mixed set of icons
  const outputs = [
    { file: 'favicon.svg', data: svg },
    ...PNGS.map(({ file, size }) => ({ file, data: renderPng(svg, size) })),
  ]

  await mkdir(out, { recursive: true })
  for (const { file, data } of outputs) await writeFile(join(out, file), data)
  return outputs.map((o) => o.file)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const files = await buildIcons(parseArgs(process.argv.slice(2)) as IconBuildOptions)
    for (const f of files) process.stdout.write(`${f}\n`)
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`)
    process.exit(1)
  }
}
