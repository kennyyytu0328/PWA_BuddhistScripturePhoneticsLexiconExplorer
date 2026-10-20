import * as fontkit from 'fontkit'

/** 以 fontkit 開啟單一字型（不支援 .ttc 字型集合）。 */
export function openFont(buffer: Buffer): fontkit.Font {
  const font = fontkit.create(buffer)
  if (!('hasGlyphForCodePoint' in font)) throw new Error('不支援字型集合檔（.ttc）')
  return font
}
