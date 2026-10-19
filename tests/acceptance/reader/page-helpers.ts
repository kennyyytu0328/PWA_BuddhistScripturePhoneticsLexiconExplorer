// In-page helper library, injected into every document by the `page` fixture in helpers.ts.
// Exposed as window.__t. Plain JavaScript (runs in the browser); no template literals inside.

export const PAGE_HELPERS_SRC = String.raw`
(() => {
  const T = {};
  const TOKEN_SEL = '[data-testid="lex-token"], [data-testid="token"], [data-testid="punct"]';
  T.TOKEN_SEL = TOKEN_SEL;

  // ---- colour --------------------------------------------------------------
  let ctx = null;
  T.rgba = (css) => {
    if (!ctx) {
      const cv = document.createElement('canvas');
      cv.width = 1; cv.height = 1;
      ctx = cv.getContext('2d', { willReadFrequently: true });
    }
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = '#000000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], Math.round((d[3] / 255) * 1000) / 1000];
  };
  // exact channel values when the computed colour is already rgb()/rgba() (avoids canvas quantisation)
  T.exact = (css) => {
    const m = /^rgba?\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\s*\)$/.exec(css.trim());
    return m ? [parseFloat(m[1]), parseFloat(m[2]), parseFloat(m[3]), m[4] === undefined ? 1 : parseFloat(m[4])] : T.rgba(css);
  };
  T.close = (a, b, tol = 2, atol = 0.02) =>
    a.length === 4 && b.length === 4 &&
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol &&
    Math.abs(a[2] - b[2]) <= tol && Math.abs(a[3] - b[3]) <= atol;
  T.hsl = (rgb) => {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2, d = mx - mn;
    let h = 0, s = 0;
    if (d > 0) {
      s = d / (1 - Math.abs(2 * l - 1));
      if (mx === r) h = ((g - b) / d) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return { h, s, l };
  };
  T.lum = (rgb) => {
    const f = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  };
  T.contrast = (a, b) => {
    const la = T.lum(a), lb = T.lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  };

  // ---- DOM utilities -------------------------------------------------------
  T.desc = (el) => el.tagName.toLowerCase() + (el.dataset && el.dataset.testid ? '[' + el.dataset.testid + ']' : '');
  T.all = () => [document.documentElement, ...document.body.querySelectorAll('*')]
    .filter((el) => !['SCRIPT', 'STYLE', 'NOSCRIPT', 'LINK', 'META', 'TITLE'].includes(el.tagName))
    .filter((el) => getComputedStyle(el).display !== 'none');
  const hasOwnText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim() !== '');
  T.hasOwnText = hasOwnText;
  T.baseText = (node) => {
    const c = node.cloneNode(true);
    c.querySelectorAll('rt, rp').forEach((x) => x.remove());
    return c.textContent;
  };
  T.textWithBr = (node) => {
    const c = node.cloneNode(true);
    c.querySelectorAll('br').forEach((x) => x.replaceWith('\n'));
    return c.textContent;
  };
  const textNodes = (root) => {
    const out = [];
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let n;
    while ((n = w.nextNode())) {
      if (n.parentElement && n.parentElement.closest('rt, rp')) continue;
      if (n.textContent.length === 0) continue;
      out.push(n);
    }
    return out;
  };
  T.charRect = (node, idx) => {
    const r = document.createRange();
    r.setStart(node, idx);
    r.setEnd(node, idx + 1);
    const b = r.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };
  T.rect = (el) => {
    const b = el.getBoundingClientRect();
    return { left: b.left, top: b.top, right: b.right, bottom: b.bottom, width: b.width, height: b.height };
  };

  // ---- tokens --------------------------------------------------------------
  T.tokens = () => [...document.querySelectorAll(TOKEN_SEL)].map((el) => ({
    kind: el.dataset.testid,
    tag: el.tagName.toLowerCase(),
    lex: el.dataset.lex || null,
    seg: (el.closest('[data-testid="sutra-page"]') || { dataset: {} }).dataset.segment || null,
    text: T.baseText(el),
    rubies: [...el.querySelectorAll('ruby')].map((r) => ({
      base: T.baseText(r),
      rt: [...r.querySelectorAll('rt')].map((x) => x.textContent.trim()),
    })),
    rts: [...el.querySelectorAll('rt')].map((x) => x.textContent.trim()),
  }));
  T.tokenRects = () => [...document.querySelectorAll(TOKEN_SEL)].map((el) => T.rect(el));

  T.punctInfos = () => {
    const toks = [...document.querySelectorAll(TOKEN_SEL)];
    const out = [];
    toks.forEach((el, i) => {
      if (el.dataset.testid !== 'punct') return;
      const seg = (el.closest('[data-testid="sutra-page"]') || { dataset: {} }).dataset.segment || null;
      const nodes = textNodes(el);
      if (!nodes.length) { out.push({ char: '', seg, rect: null, prev: null, fontSize: 0 }); return; }
      const node = nodes[0];
      const rect = T.charRect(node, 0);
      let prev = null;
      const pEl = toks[i - 1];
      if (pEl) {
        const pSeg = (pEl.closest('[data-testid="sutra-page"]') || { dataset: {} }).dataset.segment || null;
        if (pSeg === seg) {
          const pn = textNodes(pEl);
          if (pn.length) {
            const last = pn[pn.length - 1];
            prev = { char: last.textContent.slice(-1), rect: T.charRect(last, last.textContent.length - 1) };
          }
        }
      }
      out.push({ index: i, char: node.textContent.slice(0, 1), seg, rect, prev, fontSize: parseFloat(getComputedStyle(el).fontSize) });
    });
    return out;
  };

  // ---- scans (each returns a list of violations) ---------------------------
  T.scanColors = () => {
    const out = [];
    for (const el of T.all()) {
      if (el.closest('[data-testid="sutra-glow"]')) continue;
      const cs = getComputedStyle(el);
      const amberOk = !!el.closest('rt, [data-active="true"]');
      const list = [];
      if (hasOwnText(el)) list.push(['color', cs.color]);
      list.push(['background-color', cs.backgroundColor]);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        if (parseFloat(cs.getPropertyValue('border-' + side + '-width')) > 0 && cs.getPropertyValue('border-' + side + '-style') !== 'none') {
          list.push(['border-' + side + '-color', cs.getPropertyValue('border-' + side + '-color')]);
        }
      }
      for (const [prop, css] of list) {
        const c = T.exact(css);
        if (c[3] === 0) continue;
        const hsl = T.hsl(c);
        if (Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]) <= 10) continue;
        const amber = hsl.h >= 15 && hsl.h <= 50;
        if (amber && amberOk) continue;
        out.push({ el: T.desc(el), prop, css, rgba: c, hue: Math.round(hsl.h), sat: Math.round(hsl.s * 100) });
      }
    }
    return out;
  };
  T.scanShadows = () => T.all()
    .map((el) => ({ el: T.desc(el), shadow: getComputedStyle(el).boxShadow }))
    .filter((x) => x.shadow !== 'none');
  T.scanWeights = () => {
    const out = [];
    for (const el of T.all()) {
      if (!hasOwnText(el)) continue;
      const raw = getComputedStyle(el).fontWeight;
      const w = raw === 'bold' ? 700 : raw === 'normal' ? 400 : parseInt(raw, 10);
      if (!(w < 600)) out.push({ el: T.desc(el), weight: raw });
    }
    return out;
  };
  const seconds = (s) => (s.trim().endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s));
  const timingFns = (v) => v.match(/cubic-bezier\([^)]*\)|steps\([^)]*\)|linear\([^)]*\)|ease-in-out|ease-in|ease-out|ease|linear|step-start|step-end/g) || [];
  const squash = (s) => s.replace(/\s+/g, '');
  T.scanEasing = (curve) => {
    const want = squash(curve);
    const out = [];
    const targets = [];
    for (const el of T.all()) { targets.push([el, null]); targets.push([el, '::before']); targets.push([el, '::after']); }
    for (const [el, pseudo] of targets) {
      const cs = getComputedStyle(el, pseudo);
      const tDur = cs.transitionDuration.split(',').map(seconds);
      const tFns = timingFns(cs.transitionTimingFunction);
      tDur.forEach((d, i) => {
        if (d > 0 && squash(tFns[i % Math.max(tFns.length, 1)] || '') !== want) {
          out.push({ el: T.desc(el) + (pseudo || ''), prop: 'transition', duration: d, fn: tFns[i % Math.max(tFns.length, 1)] });
        }
      });
      const aNames = cs.animationName.split(',').map((x) => x.trim());
      const aDur = cs.animationDuration.split(',').map(seconds);
      const aFns = timingFns(cs.animationTimingFunction);
      aNames.forEach((n, i) => {
        if (n !== 'none' && aDur[i % aDur.length] > 0 && squash(aFns[i % Math.max(aFns.length, 1)] || '') !== want) {
          out.push({ el: T.desc(el) + (pseudo || ''), prop: 'animation', name: n, duration: aDur[i % aDur.length], fn: aFns[i % Math.max(aFns.length, 1)] });
        }
      });
    }
    return out;
  };
  T.scanDurations = (maxSeconds) => {
    const out = [];
    for (const el of T.all()) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = getComputedStyle(el, pseudo);
        const t = cs.transitionDuration.split(',').map(seconds);
        const aNames = cs.animationName.split(',').map((x) => x.trim());
        const a = cs.animationDuration.split(',').map(seconds);
        if (t.some((d) => d > maxSeconds)) out.push({ el: T.desc(el) + (pseudo || ''), prop: 'transition-duration', value: cs.transitionDuration });
        if (aNames.some((n, i) => n !== 'none' && a[i % a.length] > maxSeconds)) out.push({ el: T.desc(el) + (pseudo || ''), prop: 'animation-duration', value: cs.animationDuration });
      }
    }
    return out;
  };

  // ---- glow ----------------------------------------------------------------
  T.glow = () => {
    const el = document.querySelector('[data-testid="sutra-glow"]');
    if (!el) return null;
    const cs = getComputedStyle(el);
    const colorRe = /(?:rgba?|hsla?|oklch|oklab|lab|lch|hwb|color)\([^)]*\)|#[0-9a-fA-F]{3,8}\b/g;
    const stops = (cs.backgroundImage.match(colorRe) || []).map((css) => {
      const rgba = T.rgba(css);
      const h = T.hsl(rgba);
      return { css, rgba, hue: h.h, sat: h.s };
    });
    const sub = [el, ...el.querySelectorAll('*')];
    return {
      backgroundImage: cs.backgroundImage,
      stops,
      animations: el.getAnimations({ subtree: true }).length,
      animationNames: sub.map((x) => getComputedStyle(x).animationName),
      transitionDurations: sub.map((x) => getComputedStyle(x).transitionDuration),
      insideButton: !!el.closest('button'),
      containsButton: !!el.querySelector('button'),
    };
  };

  // ---- images (screenshots passed as base64 PNG) ---------------------------
  T.decode = async (b64) => {
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
  T.deviants = async (b64, rgb, tol) => {
    const { w, h, data } = await T.decode(b64);
    let dev = 0;
    for (let i = 0; i < w * h; i++) {
      if (Math.abs(data[i * 4] - rgb[0]) > tol || Math.abs(data[i * 4 + 1] - rgb[1]) > tol || Math.abs(data[i * 4 + 2] - rgb[2]) > tol) dev++;
    }
    return { total: w * h, deviants: dev };
  };
  T.ink = async (b64) => {
    const { w, h, data } = await T.decode(b64);
    const L = (i) => 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
    let max = 0;
    for (let i = 0; i < w * h; i++) max = Math.max(max, L(i));
    const thr = max * 0.5;
    let minX = w, minY = h, maxX = -1, maxY = -1;
    if (max > 100) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (L(y * w + x) > thr) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
      }
    }
    return { w, h, max, minX, minY, maxX, maxY };
  };
  // Minimum WCAG contrast of a text colour over the pixels inside the given rects.
  T.minContrast = async (b64, rects, text) => {
    const { w, h, data } = await T.decode(b64);
    let min = Infinity, samples = 0;
    for (const r of rects) {
      const x0 = Math.max(0, Math.floor(r.left)), x1 = Math.min(w, Math.ceil(r.right));
      const y0 = Math.max(0, Math.floor(r.top)), y1 = Math.min(h, Math.ceil(r.bottom));
      for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
        const i = (y * w + x) * 4;
        const bg = [data[i], data[i + 1], data[i + 2]];
        const a = text[3];
        const fg = [a * text[0] + (1 - a) * bg[0], a * text[1] + (1 - a) * bg[1], a * text[2] + (1 - a) * bg[2]];
        min = Math.min(min, T.contrast(fg, bg));
        samples++;
      }
    }
    return { min: samples ? min : null, samples };
  };

  window.__t = T;
})();
`
