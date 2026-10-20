# 實作計畫 — pwa 單元

> 執行索引，不是規格。需求內容以 `CLAUDE.md` §1、§5、§8.3 與 `docs/spec/pwa/requirements.md` 為準。無 mock，略過 Step 1。

## 技術介面（驗收測試與實作共用）

### 執行環境
- 驗收測試：Playwright，`tests/acceptance/pwa/*.spec.ts`，沿用 `playwright.config.ts`（Pixel 7 Chromium、`vite preview` :4173）。
- 全域設定 `serviceWorkers: 'block'`（reader 單元用）；pwa 測試檔一律 `test.use({ serviceWorkers: 'allow' })`。
- 每個測試是新的 browser context，service worker 與 Cache Storage 不跨測試共用。
- 離線：`context.setOffline(true)` 後 `page.reload()`。
- 等待 SW 就緒：`navigator.serviceWorker.ready` 且 `navigator.serviceWorker.controller` 不為 null。
- DOM 與 `data-testid` 沿用 `docs/spec/reader/plan.md`「DOM 與 data-testid」（`lex-token`、`lexicon-drawer`、`lexicon-headword`、`lexicon-def`、`lexicon-attribution`、`lexicon-xref`、`load-error`…）；造字為釋義中的 `<img>`，`src` 以 `/data/gaiji/` 開頭。

### Service worker（`vite.config.ts`，vite-plugin-pwa generateSW）
- `registerType: 'prompt'`、`injectRegister: 'script'`（產出 `registerSW.js`），不 import `virtual:pwa-register`、不寫任何更新 UI → 新版等待到所有頁面關閉才啟用（REQ-PWA-009）。
- `workbox.clientsClaim: true`：首次安裝即控制頁面（REQ-PWA-005）；不設 `skipWaiting`。
- `workbox.globPatterns: ['**/*.{js,css,html,woff2,png,svg}', 'data/*.json']`：App Shell、字型（含 `fonts/fonts.css`）、圖示、`data/gaiji/*.png`、兩個資料檔（REQ-PWA-006、007）。`fonts/OFL.txt` 不預快取。
- `workbox.runtimeCaching`：同源且 pathname 以 `/data/` 開頭 → `StaleWhileRevalidate`，`cacheName: 'sutraflow-extensions'`（REQ-PWA-008）。預快取路由先註冊，已預快取的檔案不會進這個 cache。
- `manifest.lang: 'zh-Hant'`；其餘欄位照 §5 不變（REQ-PWA-001）。
- 快取名稱：預快取用 Workbox 預設（`workbox-precache-v2-…`），測試以 `caches.keys()` 中含 `precache` 的那個判定。

### 圖示（`scripts/build-icons.ts`，`pnpm build:icons`）
- 以 fontkit 讀 `fonts/NotoSerifCJKtc-Regular.otf` 的「心」字外框轉 SVG path（不依賴字型檔），`@resvg/resvg-js` 轉 PNG。
- 顏色：字 `#e7e5e4`（stone-200，灰階 max−min = 3）、底 `#0c0a09`，整張不透明。
- 字形外框（bbox）置中，bbox 對角線 ≤ 圖寬 × 0.8 × 0.95 → 落在 maskable 安全區（中心 80% 直徑圓）內。
- 產出到 `public/`（gitignore）：`pwa-192x192.png`、`pwa-512x512.png`、`apple-touch-icon.png`（180）、`favicon.svg`（同一 path、同色）。刪除既有 `public/favicon.svg`、`public/icons.svg`（Vite 範本）。
- `index.html` 加 `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />`；`build` script 在 `build:fonts` 後加 `pnpm build:icons`。
- 純函式（版面計算：縮放、置中、安全區檢查）放 `scripts/lib/icon-layout.ts` 並寫 vitest 單元測試。

## 任務

| Task | REQ | 規格來源 | 目標檔 | 驗收測試 |
|---|---|---|---|---|
| T1 圖示 | 002、003 | CLAUDE.md §5 第 137–140 行；Q-PWA-006 | `scripts/build-icons.ts`、`scripts/lib/icon-layout.ts`、`index.html`、`package.json`、`.gitignore`、刪 `public/favicon.svg`、`public/icons.svg` | `icons.spec.ts` |
| T2 SW 與快取 | 001、004–012 | CLAUDE.md §1 第 12 行、§5 第 126–147 行、§8.3 第 253 行；Q-PWA-001～005、007 | `vite.config.ts`、`playwright.config.ts`（註解） | `manifest.spec.ts`、`precache.spec.ts`、`runtime-cache.spec.ts`、`update.spec.ts`、`offline.spec.ts`、`no-external.spec.ts`（檔名由測試撰寫者決定） |
| T3 實機紀錄 | 004 | Q-PWA-004 | `review/pwa-manual-checks.md`（安裝、standalone 開啟；連同 reader 的 60fps、IAST 項目） | 人工 |

順序：Step 3 盲寫 → 凍結（RED）→ T1 ∥ T2（T2 的圖示測試依賴 T1 產物，整合後一起驗）→ T3 → Step 5 驗證 → Step 6 spec-gate → Step 7 review。
