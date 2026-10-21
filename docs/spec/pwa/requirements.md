# 需求登錄表 — pwa 單元
> 狀態：已確認（2026-10-20，使用者確認；Q-PWA-001～008、010 採 A，009 採 C，已併入）。
> 來源：`CLAUDE.md`（行號依 commit d77c770 版本）；依賴單元 `data`（產物：REQ-DAT-002 AST、003 辭典、012 造字 PNG）、`reader`（REQ-RDR-004 全經呈現、014 名相抽屜、017 出處、022 字型打包、029 載入失敗）。
> 範圍：§1 的 PWA 項（可安裝、100% 離線）、§5（manifest、Workbox 快取分層）、§8.3（離線驗收）；另依 2026-10-20 使用者決議納入圖示與 favicon。測試覆蓋率沿用 REQ-RDR-028，不另登錄。

## 安裝

### REQ-PWA-001 Web App Manifest
- 來源：CLAUDE.md §5（第 126–141 行）、§2（第 22 行）
- 類型：資料
- 原文：`manifest.webmanifest` 區塊（name、short_name、start_url、display、background_color、theme_color、orientation、icons）
- 驗收：
  - Given 正式建置（`pnpm build` 後 `vite preview`）
  - When 讀取 `index.html` 的 `<link rel="manifest">` 所指檔案
  - Then `name` =「心經·逐字解讀沉浸器」、`short_name` =「心經」、`start_url` = `/`、`display` = `standalone`、`background_color` 與 `theme_color` = `#0c0a09`、`orientation` = `portrait`
  - And `icons` 恰為兩項：`/pwa-192x192.png`（192x192、image/png、無 purpose）與 `/pwa-512x512.png`（512x512、image/png、purpose `any maskable`）
  - And `lang` = `zh-Hant`（Q-PWA-007）
  - And 允許外掛自動輸出的 `scope: "/"`（與瀏覽器由 `start_url` 推得的預設值相同，Q-PWA-010）
  - 註：上列 `/` 為預設 base。GitHub Pages 部署以 `BASE_PATH=/<repo>/` 建置，`start_url`、`scope`、`icons` 一律改以該路徑開頭（2026-10-21 定案）
- 狀態：確認

### REQ-PWA-002 App 圖示
- 來源：CLAUDE.md §5（第 137–140 行）；Q-PWA-006
- 類型：UI／資料
- 驗收：
  - Given 正式建置
  - Then `/pwa-192x192.png`、`/pwa-512x512.png` 皆可取得（HTTP 200、`image/png`），實際像素尺寸分別為 192×192、512×512
  - And 512 圖示可作 maskable：圖示主體位於中心 80% 直徑圓形安全區內，安全區外為不透明底色
  - And 圖示為打包的 Noto Serif TC「心」字，淺灰白（灰階：RGB 最大值與最小值差 ≤ 10，同 Q-RDR-020）置於 stone-950（`#0c0a09`）底上；無彩色（Q-PWA-006）
  - And 另有 `/apple-touch-icon.png`（180×180、同一設計），由 `index.html` 的 `<link rel="apple-touch-icon">` 引用（Q-PWA-006）
- 狀態：確認

### REQ-PWA-003 Favicon
- 來源：2026-10-20 使用者決議（範圍納入 favicon）；Q-PWA-006
- 類型：UI
- 驗收：
  - Given 正式建置
  - Then `index.html` 引用的 favicon 為本專案圖示（與 REQ-PWA-002 同一設計），不是 Vite 範本圖
  - And 建置產物不含未使用的 Vite 範本圖檔（`icons.svg`）
- 狀態：確認

### REQ-PWA-004 可安裝
- 來源：CLAUDE.md §1（第 12 行「可安裝（standalone）」）；Q-PWA-004
- 類型：行為
- 驗收：
  - Given 正式建置，Chromium 手機 viewport
  - Then 符合瀏覽器安裝條件：manifest 合格（REQ-PWA-001、002）、頁面由具 fetch 處理的 service worker 控制（REQ-PWA-005）
  - And 實機安裝一次（加到主畫面、以 standalone 開啟），記錄於 `review/pwa-manual-checks.md`，與 REQ-RDR-027 的 60fps、IAST 實機檢查同一次進行（Q-PWA-004）
- 狀態：確認；實機安裝延後，列為未決事項（Q-PWA-009）

## Service Worker 與快取

### REQ-PWA-005 Service Worker 註冊與控制
- 來源：CLAUDE.md §1（第 12 行）、§2（第 22 行「vite-plugin-pwa（Workbox）」）
- 類型：行為
- 驗收：
  - Given 正式建置，首次以連線狀態開啟 `/`
  - When service worker 安裝並啟用完成
  - Then 頁面由該 service worker 控制（`navigator.serviceWorker.controller` 不為 null），不需使用者再次開啟
- 狀態：確認

### REQ-PWA-006 第一層：App Shell 與字型預快取
- 來源：CLAUDE.md §5（第 145 行）；REQ-RDR-022
- 類型：資料
- 原文：「App Shell 與字型（Precache / CacheFirst）：JS、CSS、Noto Serif TC 直排子集字型、介面標籤字型子集（§6.5）」
- 驗收：
  - Given 首次連線開啟後 service worker 已啟用
  - When 檢查 Cache Storage
  - Then 預快取包含 `index.html`、建置產出的全部 JS 與 CSS、`/fonts/fonts.css` 與 `/fonts/` 下全部 woff2 子集字型
  - And 離線時這些資源由快取回應（不經網路）
- 狀態：確認

### REQ-PWA-007 第二層：經文與辭典預快取
- 來源：CLAUDE.md §5（第 146 行）；REQ-DAT-002、003
- 類型：資料
- 原文：「經文與辭典（Precache）：heart-sutra.ast.json、lexicon.dfb.json 於安裝時預快取」
- 驗收：
  - Given 首次連線開啟
  - When service worker 安裝完成（頁面尚未操作任何名相）
  - Then 預快取包含 `/data/heart-sutra.ast.json`、`/data/lexicon.dfb.json`
  - And 預快取包含 `/data/gaiji/` 下全部 PNG（Q-PWA-001）
- 狀態：確認

### REQ-PWA-008 第三層：擴充經典／辭典
- 來源：CLAUDE.md §5（第 147 行）
- 類型：行為
- 原文：「未來擴充經典／辭典（StaleWhileRevalidate）：首次查詢時抓取並存入 CacheStorage」
- 驗收（Q-PWA-002）：
  - Given service worker 已控制頁面，連線狀態
  - When 首次請求同源 `/data/` 下、不在預快取清單中的檔案
  - Then 回應存入獨立的 CacheStorage（非預快取 cache），策略為 StaleWhileRevalidate
  - And 之後離線請求同一檔案，由該快取回應相同內容
- 狀態：確認

### REQ-PWA-009 更新策略
- 來源：規格未規範；Q-PWA-005
- 類型：行為
- 驗收（Q-PWA-005）：
  - Given 舊版 service worker 控制頁面，伺服器上已有新版
  - When 瀏覽器偵測到新版 service worker 並安裝完成
  - Then 目前頁面不重新整理，新版處於等待狀態，畫面不顯示任何更新或「可離線使用」提示
  - When 關閉所有 App 頁面後再次開啟
  - Then 由新版 service worker 控制頁面
- 狀態：確認

## 離線驗收

### REQ-PWA-010 離線完整渲染全經
- 來源：CLAUDE.md §8.3（第 253 行）、§1（第 12 行「100% 離線」）；REQ-RDR-004
- 類型：行為
- 原文：「DevTools 切 Offline 後重新整理，可完整渲染全經並開啟任一名相抽屜（Playwright 自動化）」
- 驗收：
  - Given 首次連線開啟、service worker 已控制頁面
  - When 瀏覽器切為離線（Playwright `context.setOffline(true)`）後重新整理
  - Then 經文完整呈現，判準同 REQ-RDR-004（畫面經文不含 `<rt>` 串接後逐字等於 AST 全部 token 的 `t`）
  - And 不出現 REQ-RDR-029 的「經文載入失敗」
  - And 經文與介面字型為打包的子集字型（`document.fonts` 中對應字型狀態為 loaded），不是系統備用字型
- 狀態：確認

### REQ-PWA-011 離線開啟名相抽屜
- 來源：CLAUDE.md §8.3（第 253 行）；REQ-RDR-014、016、017
- 類型：行為
- 驗收：
  - Given REQ-PWA-010 的離線狀態
  - When 逐一點擊經文中每個帶 `lex` 的名相（同一詞條只測一次），並至少點擊一個轉引連結（Q-PWA-003）
  - Then 名相抽屜開啟，顯示該名相的詞條、讀音、DFB 釋義與出處授權標示（同 REQ-RDR-014、017）
  - And 轉引連結開啟目標詞條（同 REQ-RDR-016）
  - And 釋義中的造字圖成功載入（`naturalWidth` > 0）
- 狀態：確認

### REQ-PWA-012 不依賴外部網路資源
- 來源：CLAUDE.md §1（第 12 行「100% 離線」）、§6.5（第 197 行「不得依賴線上字型服務」）
- 類型：行為
- 驗收：
  - Given 正式建置，連線狀態
  - When 從開啟 App 到切換全部音標模式、開啟名相抽屜與白話參考
  - Then 所有網路請求皆為同源（無 CDN、線上字型或其他第三方網域）
  - Given REQ-PWA-010 的離線狀態，執行同樣操作
  - Then 沒有任何失敗的請求（Playwright `requestfailed` 事件為 0）
- 狀態：確認
