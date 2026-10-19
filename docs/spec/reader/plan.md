# 實作計畫 — reader 單元

> 需求內容以 `requirements.md` 為準，本檔只寫執行索引與技術介面（非規格）。
> 原始規格：`CLAUDE.md` §1、§4-2、§6、§7、§8.2、8.4–8.6。依賴：`data` 單元產物（`public/data/`，格式見 `docs/spec/data/requirements.md` REQ-DAT-002、003、004、011、012、016、019）。

## 技術介面（驗收測試與實作共用）

### 執行環境

- 驗收測試：Playwright，`tests/acceptance/reader/*.spec.ts`。
- `playwright.config.ts`（repo 根目錄）：`testMatch: '**/*.spec.ts'`；單一 project，`devices['Pixel 7']`（Chromium）；`webServer: { command: 'pnpm preview', url: 'http://localhost:4173' }`，`baseURL: 'http://localhost:4173'`；`serviceWorkers: 'block'`（離線屬 `pwa` 單元）。
- 驗收指令先跑 `pnpm build`，測試對象是正式建置（`dist/`）。
- 閱讀畫面在 `/`，單頁、無路由。

### 資料載入

- App 啟動時 `fetch('data/heart-sutra.ast.json')` 與 `fetch('data/lexicon.dfb.json')`（相對於 base `/`）。
- 測試可用 `page.route('**/data/heart-sutra.ast.json', …)` 攔截以製造載入中（延遲回應）與失敗（500、壞 JSON）情境（REQ-RDR-029）。

### DOM 與 `data-testid`

| 元素 | selector／屬性 | REQ |
|---|---|---|
| 經文容器（`.sutra-viewport`） | `[data-testid="sutra-viewport"]` | 001、002 |
| 每頁（`.sutra-page`），9 個，DOM 順序 = 段落順序 | `[data-testid="sutra-page"][data-segment="s1"]`… | 003、011 |
| 帶 `lex` 的 token | `button[data-testid="lex-token"][data-lex="<lex>"]`（`type="button"`） | 005、012–014 |
| 無 `lex` 的非標點 token | `span[data-testid="token"]` | 006 |
| 標點 token | `span[data-testid="punct"]` | 004、007 |
| token 高亮中 | 上述 token 加 `data-active="true"` | 013 |
| 每字 ruby | token 內 `<ruby>字<rt>音</rt></ruby>`；IAST 模式為整個 token 一個 `<ruby>`；無音標模式不輸出 `<rt>` | 008 |
| 流光底色層 | `[data-testid="sutra-glow"]`（經文後方的背景元素） | 025 |
| 音標膠囊 | `button[data-testid="phonetic-toggle"][data-mode="zhuyin\|pinyin\|iast\|none"]` | 009 |
| 名相抽屜（vaul `Drawer.Content`） | `[data-testid="lexicon-drawer"]` | 014、018 |
| 詞條標題 | `[data-testid="lexicon-headword"]`（`h2`） | 014、024 |
| 讀音區 | `[data-testid="lexicon-readings"]`，內含 `[data-testid="reading-zhuyin"]`、`[data-testid="reading-pinyin"]`、`[data-testid="reading-iast"]`（無 iast 不輸出） | 014 |
| 義項 | `[data-testid="lexicon-sense"]`，採用者加 `data-adopted="true"`；內含 `[data-testid="lexicon-usg"]`（usg 為 null 不輸出）、`[data-testid="lexicon-def"]` | 014、015 |
| 造字 | `img[data-gaiji="<ID>"]`，`src="data/gaiji/<ID>.png"` | 015 |
| 私用區缺字 | `span[data-testid="missing-glyph"][role="img"][aria-label="缺字"]`，文字內容為原 PUA 字；畫面上的「〓」由 `::before { content: "〓" }` 呈現，原字不可見 | 015 |
| 參見區 | `[data-testid="lexicon-xrefs"]`；可點的 `button[data-testid="lexicon-xref"]`、不可點的 `span[data-testid="lexicon-xref-text"]` | 016 |
| 返回 | `button[data-testid="lexicon-back"]` | 016 |
| 出處 | `[data-testid="lexicon-attribution"]` | 017 |
| 白話參考按鈕（每頁一個） | `button[data-testid="vernacular-toggle"]`（位於對應 `sutra-page` 內） | 019 |
| 白話參考面板（另一個 vaul 抽屜） | `[data-testid="vernacular-panel"]`，內含 `[data-testid="vernacular-title"]`、`[data-testid="vernacular-text"]`、`[data-testid="vernacular-theme"]`（每個標籤一個）、`[data-testid="vernacular-reflection"]` | 019 |
| 載入失敗 | `[data-testid="load-error"]`，內含 `button[data-testid="reload-button"]` | 029 |

- 區塊標題（讀音／釋義／參見）為各區第一個 `h3`。
- 抽屜開啟時 vaul 的遮罩為 `[data-vaul-overlay]`，套 `backdrop-filter: blur(...)`（REQ-RDR-018）。

### 色彩 token

Tailwind v4 預設輸出 oklch；規格色以 literal rgb 定義成 CSS 變數，避免換算誤差：

| token | 值 |
|---|---|
| stone-950 | `#0c0a09` |
| stone-900 | `#1c1917` |
| amber-500 | `#f59e0b` |
| amber-900 | `#78350f` |

- 驗收測試比對顏色時，先把 computed color 經 canvas 正規化成 sRGB `rgba()` 再比（瀏覽器可能回傳 `oklch()`／`color(srgb …)`）。
- 半透明：`<rt>` = amber-500 × 0.75；高亮背景 = amber-900 × 0.4；膠囊背景 = stone-900 × 0.8。

### 本機儲存（Dexie）

- DB 名 `sutraflow`，table `prefs`，主鍵 `key`。
- 列：`{ key: 'phoneticMode', value: 'zhuyin' | 'pinyin' | 'iast' | 'none' }`、`{ key: 'progress', value: '<segment id>' }`（例 `'s4'`）。
- 進度於捲動停靠後寫入；啟動時讀取並 `scrollIntoView` 至該頁（無紀錄停在 `s1`）。

### 裝置 API

- `src/hooks/useWakeLock.ts`（CLAUDE.md §7 原碼）、`src/hooks/useHaptics.ts`（`navigator.vibrate(12)`，不支援略過）、`src/hooks/usePhoneticMode.ts`。
- 驗收測試以 `page.addInitScript` 置換 `navigator.vibrate`、`navigator.wakeLock` 為記錄呼叫的 stub；「不支援」情境以刪除該屬性模擬。

### 字型

- 原始檔（OFL，commit 進 repo）：`fonts/NotoSerifCJKtc-Regular.otf`（github notofonts/noto-cjk `Serif/OTF/TraditionalChinese/`）、`fonts/NotoSansTC-Regular.otf`（`Sans/SubsetOTF/TC/`），附 `fonts/OFL.txt`。
- `scripts/build-fonts.ts`（`pnpm build:fonts`）：收集 AST、辭典（含 attribution、usg）與介面文字（`src/` 中的中文字串常數，含「〓」）的全部用字，以 `subset-font` 產生 woff2，以 `fontkit` 檢查 cmap。漢字或全形符號缺字即中止；拉丁字母缺字允許（Q-RDR-016）。
- 產物（gitignore）：`public/fonts/`，四個 woff2，unicode-range 互斥：`serif-sutra`（經文用字，preload）、`serif-lexicon`（其餘襯線用字）、`sans-core`（介面與 `<rt>` 用字，preload）、`sans-ext`（白話參考其餘用字）；另產生 `public/fonts/fonts.css`（`@font-face`，family 名為 `Noto Serif TC`、`Noto Sans TC`，`font-display: block`）。檔名固定、不帶 hash（`serif-sutra.woff2`、`serif-lexicon.woff2`、`sans-core.woff2`、`sans-ext.woff2`）；`index.html` 已寫入兩個 preload 與 `fonts.css` 的 `<link>`。
- `package.json` 的 `build` 在 `tsc -b` 前加 `pnpm build:fonts`；`dev` 前需先跑一次。
- 標點 span 帶 `lang="zh-Hans"`（Q-RDR-019）：襯線子集須保留 `locl`（ZHS）與 `vert` 的替換字形；`build-fonts.ts` 以 fontkit `layout(ch, ['vert','locl'], 'hani', 'ZHS')` 確認五種標點的直排字形中心落在右上，否則中止。

### 動態

- 介面轉場曲線 `cubic-bezier(0.19, 1, 0.22, 1)` 定義為 CSS 變數 `--ease-zen`。
- vaul 內建 `0.5s cubic-bezier(0.32,0.72,0,1)`：以 `[data-vaul-drawer]:not(.vaul-dragging)` 覆寫 `transition-timing-function` 與 `animation-timing-function`（REQ-RDR-026）。
- `prefers-reduced-motion: reduce` 下所有 `transition-duration`／`animation-duration` 設為近 0，`scroll-behavior: auto`。

### 單元測試與覆蓋率

- `vitest.config.ts` 改為 `test.projects`：`node`（`tests/**/*.test.ts`、`scripts/**/*.test.ts`）與 `jsdom`（`src/**/*.test.{ts,tsx}`）。
- `test.coverage` 維持在頂層（data 單元的凍結測試 `tests/acceptance/data/coverage.test.ts` 讀 `config.test.coverage`）：`include: ['scripts/**/*.ts', 'src/**/*.{ts,tsx}']`，排除測試檔與 `*.d.ts`，`thresholds.lines: 80`。
- 新增 devDependency：`jsdom`、`@testing-library/react`、`fake-indexeddb`、`subset-font`、`fontkit`（版本以 Context7／npm 查最新穩定版）。
- data 單元的驗收指令 `pnpm vitest run tests/acceptance/data` 須照常通過。

## 任務

| Task | REQ | 規格 | 目標檔 | 驗收測試 |
|---|---|---|---|---|
| T0 基礎建設：Playwright、vitest projects、依賴、清掉 Vite 範本、`index.html`（`lang="zh-Hant"`、title、viewport）、色彩與動態 token | 028（設定部分） | CLAUDE.md §2、§8.6 | `playwright.config.ts`、`vitest.config.ts`、`package.json`、`index.html`、`src/index.css` | `quality.spec.ts` |
| T1 字型子集 | 022 | §6.1、§6.5 | `fonts/`、`scripts/build-fonts.ts`、`package.json` | `fonts.spec.ts` |
| T2 閱讀外殼：載入、直排、分頁、token、ruby、流光、配色 | 001–008、021、023–025、029 | §1、§6.1、§6.2、§6.5、§8.2 | `src/App.tsx`、`src/lib/loadData.ts`、`src/components/SutraViewport.tsx`、`SutraPage.tsx`、`Token.tsx` | `layout.spec.ts`、`phonetics.spec.ts`、`visual.spec.ts`、`loading.spec.ts` |
| T3 偏好與進度（Dexie）、音標膠囊 | 009–011 | §2、§6.4 | `src/lib/db.ts`、`src/hooks/usePhoneticMode.ts`、`src/hooks/useReadingProgress.ts`、`src/components/PhoneticToggle.tsx` | `prefs.spec.ts` |
| T4 名相抽屜 | 012–018 | §1、§3.4-2、§4-1、§6.3、§8.4 | `src/hooks/useHaptics.ts`、`src/components/LexiconDrawer.tsx`、`Definition.tsx` | `lexicon.spec.ts` |
| T5 白話參考面板 | 019 | §4-2、§4-3 | `src/components/VernacularPanel.tsx` | `vernacular.spec.ts` |
| T6 螢幕常亮 | 020 | §7 | `src/hooks/useWakeLock.ts`、`src/App.tsx` | `device.spec.ts` |
| T7 品質：減少動態、FCP／CLS、覆蓋率補測、人工紀錄（60fps、直排標點截圖）寫入 `review/reader-manual-checks.md` | 007（人工部分）、026–028 | §6.5、§8.2、§8.5、§8.6 | 各元件 `*.test.tsx`、`review/` | `motion.spec.ts`、`quality.spec.ts` |

順序：T0 → T1 ∥ T2 ∥ T6 → T3 → T4 ∥ T5（兩者都會掛到 `App.tsx`，各自只新增元件與一處掛載點）→ T7。

### 實作注意（技術細節，非規格）

- 單字名相（空、度、色、智、苦）字寬不足 44px：以 padding 擴大熱區、負 margin 抵銷版面位移（REQ-RDR-005，不得造成 CLS）。
- 無音標模式保留 `<rt>` 的行距空間（§6.1 `line-height: 2.8` 已預留），切換時不得位移（REQ-RDR-008、027）。
- 抽屜與面板一律直角、無陰影；vaul 預設樣式若帶圓角或陰影須覆寫。
- 名相抽屜收起時清除高亮；轉引切換不重新觸發震動。
