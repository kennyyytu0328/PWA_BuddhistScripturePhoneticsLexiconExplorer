// In-page image analysis for the icon tests, injected with page.addInitScript. Exposed as window.__icon.
// Plain JavaScript (runs in the browser); no template literals inside.

export const ICON_LIB_SRC = String.raw`
(() => {
  const I = {};
  const BG = [12, 10, 9];
  const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  I.decodeB64 = async (b64) => {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(bmp, 0, 0);
    return { w: bmp.width, h: bmp.height, data: x.getImageData(0, 0, bmp.width, bmp.height).data };
  };

  // Rasterise any image URL (png / svg / ico) onto a size x size #0c0a09 canvas.
  I.decodeUrl = async (url, size) => {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = 'rgb(' + BG.join(',') + ')';
    x.fillRect(0, 0, size, size);
    x.drawImage(img, 0, 0, size, size);
    return { w: size, h: size, data: x.getImageData(0, 0, size, size).data };
  };

  // Pixel facts about an icon. safeRadius is the radius of the maskable safe circle (0.4 * width).
  I.stats = (img) => {
    const { w, h, data } = img;
    const cx = w / 2, cy = h / 2, R = 0.4 * w;
    let nonOpaque = 0, nonGray = 0, outsideTotal = 0, outsideNotBg = 0, ink = 0, inkOutside = 0;
    let peak = [0, 0, 0], peakLum = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a !== 255) nonOpaque++;
      if (Math.max(r, g, b) - Math.min(r, g, b) > 10) nonGray++;
      const inside = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= R;
      if (!inside) {
        outsideTotal++;
        if (r !== BG[0] || g !== BG[1] || b !== BG[2]) outsideNotBg++;
      }
      const l = lum(r, g, b);
      if (l > peakLum) { peakLum = l; peak = [r, g, b]; }
      if (Math.min(r, g, b) >= 200) { ink++; if (!inside) inkOutside++; }
    }
    const px = (x, y) => { const i = (y * w + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
    return {
      w, h, nonOpaque, nonGray, outsideTotal, outsideNotBg, ink, inkOutside, peak,
      corners: [px(0, 0), px(w - 1, 0), px(0, h - 1), px(w - 1, h - 1)],
    };
  };

  // Crop the ink (luminance > 100) bounding box and stretch it to n x n; returns a 0/1 mask and the bbox.
  const inkMask = (w, h, data, n) => {
    let minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (lum(data[i], data[i + 1], data[i + 2]) > 100) {
        if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
    if (maxX < 0) return { mask: new Uint8Array(n * n), bbox: null };
    const src = document.createElement('canvas');
    src.width = w; src.height = h;
    src.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(data), w, h), 0, 0);
    const dst = document.createElement('canvas');
    dst.width = n; dst.height = n;
    const dx = dst.getContext('2d', { willReadFrequently: true });
    dx.fillStyle = 'rgb(' + BG.join(',') + ')';
    dx.fillRect(0, 0, n, n);
    dx.imageSmoothingEnabled = true;
    dx.drawImage(src, minX, minY, maxX - minX + 1, maxY - minY + 1, 0, 0, n, n);
    const d = dx.getImageData(0, 0, n, n).data;
    const mask = new Uint8Array(n * n);
    for (let i = 0; i < n * n; i++) mask[i] = lum(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]) > 100 ? 1 : 0;
    return { mask, bbox: { minX, minY, maxX, maxY } };
  };
  I.shape = (img, n) => inkMask(img.w, img.h, img.data, n);

  // The character rendered with the bundled Noto Serif TC (the page must have loaded the font).
  I.glyph = async (ch, n) => {
    const faces = await document.fonts.load('400px "Noto Serif TC"', ch);
    const size = 600;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = 'rgb(' + BG.join(',') + ')';
    x.fillRect(0, 0, size, size);
    x.fillStyle = '#e7e5e4';
    x.font = '400px "Noto Serif TC"';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(ch, size / 2, size / 2);
    const d = x.getImageData(0, 0, size, size).data;
    const m = inkMask(size, size, d, n);
    return { faces: faces.length, mask: m.mask };
  };

  I.iou = (a, b) => {
    let inter = 0, union = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] && b[i]) inter++;
      if (a[i] || b[i]) union++;
    }
    return union === 0 ? 0 : inter / union;
  };

  window.__icon = I;
})();
`
