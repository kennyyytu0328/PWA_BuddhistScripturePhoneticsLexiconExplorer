export interface Bbox {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

export interface Placement {
  scale: number
  /** SVG x = tx + scale * fontX */
  tx: number
  /** SVG y = ty - scale * fontY（字型座標 y 向上，SVG 向下） */
  ty: number
}

/** maskable 安全區：置中、直徑為圖寬 80% 的圓。 */
export const SAFE_ZONE_RATIO = 0.8
/** 字形外框對角線佔安全區直徑的上限，留邊給抗鋸齒。 */
export const FILL_RATIO = 0.95

export const diagonal = (b: Bbox): number => Math.hypot(b.maxX - b.minX, b.maxY - b.minY)

/** 縮放字形使 bbox 對角線 = size × 0.8 × 0.95，並把 bbox 中心放到畫布中心。 */
export function placeGlyph(bbox: Bbox, size: number): Placement {
  const d = diagonal(bbox)
  if (!(d > 0)) throw new Error('字形外框為空')
  const scale = (size * SAFE_ZONE_RATIO * FILL_RATIO) / d
  return {
    scale,
    tx: size / 2 - (scale * (bbox.minX + bbox.maxX)) / 2,
    ty: size / 2 + (scale * (bbox.minY + bbox.maxY)) / 2,
  }
}

/** 放置後的外框四角是否全在安全圓內（圓心 = 畫布中心，半徑 = size × 0.4）。 */
export function withinSafeZone(bbox: Bbox, p: Placement, size: number): boolean {
  const radius = (size * SAFE_ZONE_RATIO) / 2
  const xs = [bbox.minX, bbox.maxX].map((x) => p.tx + p.scale * x)
  const ys = [bbox.minY, bbox.maxY].map((y) => p.ty - p.scale * y)
  return xs.every((x) => ys.every((y) => Math.hypot(x - size / 2, y - size / 2) <= radius))
}
