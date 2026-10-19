# 需求登錄表 — reader 單元
> 狀態：已確認（2026-10-17，使用者確認；Q-RDR-001～015、017～032 採 A，016 採 B，皆已併入；REQ-RDR-029 於 2026-10-19 依 Q-RDR-018 新增）。
> 來源：`CLAUDE.md`（行號依 2026-10-17 版本，commit 2279ebe）；依賴單元 `data`：產物格式見 `docs/spec/data/requirements.md` 的 REQ-DAT-002（AST）、003（辭典）、004（授權）、011／012（釋義與造字）、016（IAST）、019（無 lex 不可點擊）。
> 範圍：§1 核心體驗、§4-2（UI 部分）、§6、§7、§8.2、8.4、8.5、8.6。PWA 安裝與離線（§5、§8.3）屬後續 `pwa` 單元。

## 沉浸讀經與直排

### REQ-RDR-001 Zen Mode 全螢幕
- 來源：CLAUDE.md §1（第 8 行）、§6.5（第 196 行）
- 類型：UI
- 原文：「沉浸讀經（Zen Mode）：全螢幕、無頂底導航，深色背景（stone-950）」
- 驗收：
  - Given 開啟 App
  - When 閱讀畫面載入完成
  - Then 畫面沒有頂部或底部導航列（無 `header`、`nav`、`footer` 元素；§6.4 的音標膠囊是浮動控制項，不算導航列）
  - And 頁面背景色為 stone-950（`#0c0a09`），經文區佔滿視窗高度
- 狀態：確認

### REQ-RDR-002 直排容器
- 來源：CLAUDE.md §1（第 9 行）、§6.1（第 154–162 行）
- 類型：UI
- 原文：「直排經摺翻頁：writing-mode: vertical-rl，水平由右向左滑動，CSS Scroll Snap 停靠」；`.sutra-viewport` 樣式
- 驗收：
  - Given 閱讀畫面
  - When 讀取經文容器的 computed style
  - Then `height` 等於視窗動態高度（100dvh）、`width` 等於視窗寬度、`overflow-x: auto`、`overflow-y: hidden`、`overscroll-behavior-x: contain`、`scroll-snap-type: x mandatory`、`direction: rtl`
  - And 初次載入時顯示的是經首（第一頁位於畫面最右側並完整可見）
  - And 頁面由右向左依序推進：手指由左向右拖曳（原生 rtl 捲動）前往下一頁，放開後停靠在頁首（Q-RDR-024）
- 狀態：確認

### REQ-RDR-003 經摺頁樣式
- 來源：CLAUDE.md §6.1（第 164–173 行）
- 類型：UI
- 原文：`.sutra-page` 樣式
- 驗收：
  - Given 任一頁
  - When 讀取頁面元素的 computed style
  - Then `scroll-snap-align: start`、`writing-mode: vertical-rl`、`text-orientation: upright`、`font-feature-settings` 含 `"vkrn"` 與 `"vert"`、字型為 Noto Serif TC、`line-height` 為字級的 2.8 倍、`letter-spacing` 為 0.12em、padding 為 1.5rem（上下）1rem（左右）
  - And 一段一頁：共 9 頁，第 n 頁依序含 AST 第 n 段的全部 token；每頁寬度至少一個視窗寬（Q-RDR-001）
- 狀態：確認

### REQ-RDR-004 全經完整呈現
- 來源：CLAUDE.md §1（第 6 行）、§8.3（第 247 行「完整渲染全經」）；REQ-DAT-002
- 類型：資料
- 驗收：
  - Given `public/data/heart-sutra.ast.json`
  - When 閱讀畫面載入完成
  - Then 9 段的所有 token（含標點）依序呈現；畫面上的經文（不含 `<rt>`）串接後逐字等於 AST 全部 token 的 `t` 串接
- 狀態：確認

### REQ-RDR-005 經文字級與觸控熱區
- 來源：CLAUDE.md §6.2（第 178 行）
- 類型：UI
- 原文：「經文字級 18–22px；可點擊 token 為 inline-block，觸控熱區 ≥ 44×44px」
- 驗收：
  - Given 閱讀畫面（手機尺寸 viewport）
  - Then 經文 `font-size` 介於 18px 與 22px
  - And 每個帶 `lex` 的 token 為 `display: inline-block`，可點擊範圍寬與高皆 ≥ 44px：在該範圍內任一點點擊都命中該 token（不被相鄰文字、標點或其他 token 遮蓋）（Q-RDR-026）
- 狀態：確認

### REQ-RDR-006 無 lex 的 token 不可點擊
- 來源：CLAUDE.md §3.3（第 75 行）；REQ-DAT-019
- 類型：行為
- 驗收：
  - Given 「照見」（無 `lex`）與標點 token
  - When 點擊它們
  - Then 不震動、不高亮、不開啟抽屜；它們不是可聚焦的互動元素
- 狀態：確認

### REQ-RDR-007 直排標點
- 來源：CLAUDE.md §8.2（第 246 行）
- 類型：UI
- 原文：「，、。、；、！、： 在直排下位於字右上偏中，不偏位、不掉行」
- 驗收：
  - Given 經文中的 `，` `。` `；` `！` `：`（AST 中全部 5 種）
  - When 量測每個標點與前一字的字形位置
  - Then 標點與前一字在同一直行、位於其下方；標點字形邊界框的中心點落在其字格的右半部與上半部（直排字形，非橫排字形置中）
  - And 標點不出現在一直行的行首（不掉行）
  - And 標點使用字型的簡體中文直排字形（標點元素 `lang="zh-Hans"`），漢字仍為繁體字形（Q-RDR-019）
  - And 另以截圖人工確認一次（Q-RDR-011）
- 狀態：確認

## 音標

### REQ-RDR-008 Ruby 音標
- 來源：CLAUDE.md §1（第 11 行）、§6.2（第 179 行）；REQ-DAT-002、016；Q-RDR-022、023
- 類型：UI
- 原文：「以 `<ruby>` 呈現」；「`<rt>`：sans-serif、10px、低對比（如 text-amber-500/75）」
- 驗收：
  - Given 音標模式為注音（或拼音）
  - Then 每個非標點字以 `<ruby>` 呈現，`<rt>` 內容為該字 `chars[].zy`（或 `py`）
  - And `<rt>` 的 `font-size` 為 10px、字型為無襯線（§6.5 介面標籤字型）、顏色為 amber-500 75% 不透明
  - Given 音標模式為 IAST
  - Then 帶 `iast` 的 token 以整個 token 為單位標註該值；無 `iast` 的 token 不顯示音標
  - Given 音標模式為無音標
  - Then 不顯示任何 `<rt>`，且經文位置不跳動（見 REQ-RDR-026 的 CLS）
  - And（Q-RDR-022）在注音、拼音、IAST 三種模式下，每個 `<rt>` 沿直行方向的範圍都落在其基字所佔的格（含為容納音標加長的部分；IAST 為整個 token 的格）內，任兩個 `<rt>` 不重疊；`<rt>` 字級維持 10px。每個字沿直行方向佔的長度依該字在三種模式中最長的音標決定，三種模式與無音標模式的經文位置相同
  - And（Q-RDR-023）注音依台灣直排慣例：聲調符號（ˊ ˇ ˋ）位於注音符號右側、與最後一個符號並排；輕聲點（˙）位於注音符號上方（目前經文無輕聲字）；`<rt>` 的文字內容仍逐字等於 `zy`
- 狀態：確認

### REQ-RDR-009 音標切換膠囊
- 來源：CLAUDE.md §1（第 11 行）、§6.4（第 190 行）、§6.5（第 199 行）
- 類型：UI／行為
- 原文：「螢幕底部中央半透明膠囊（backdrop-blur-md bg-stone-900/80），單手拇指輪替模式」
- 驗收：
  - Given 閱讀畫面
  - Then 膠囊位於畫面底部、水平置中，背景為 stone-900 80% 不透明並有 backdrop blur（medium），圓角為 full pill
  - When 連續點擊膠囊
  - Then 模式依序為 注音 → 拼音 → 梵文(IAST) → 無音標 → 注音，膠囊文字依序為「注音」「拼音」「梵文」「無音標」（Q-RDR-009）
- 狀態：確認

### REQ-RDR-010 音標偏好保存
- 來源：CLAUDE.md §2（第 24 行）、§6.4（第 190 行）
- 類型：資料
- 原文：「選擇存入 Dexie」；「Dexie.js（閱讀進度、音標偏好）」
- 驗收：
  - Given 切換到拼音模式
  - When 重新載入頁面
  - Then 仍為拼音模式；偏好存在 IndexedDB（Dexie）
  - And 首次使用（無紀錄）時為注音模式（Q-RDR-009）
- 狀態：確認

### REQ-RDR-011 閱讀進度保存
- 來源：CLAUDE.md §2（第 24 行）
- 類型：資料
- 原文：「Dexie.js（閱讀進度…）」
- 驗收：
  - Given 翻到第 4 頁並停靠
  - When 重新載入頁面
  - Then 畫面停在第 4 頁；進度存在 IndexedDB（Dexie）
  - And 首次使用（無紀錄）時停在經首（Q-RDR-007）
- 狀態：確認

## 名相抽屜

### REQ-RDR-012 點擊名相：觸覺回饋
- 來源：CLAUDE.md §1（第 10 行）、§6.3-1（第 183 行）
- 類型：行為
- 原文：「navigator.vibrate(12)（不支援則略過）」
- 驗收：
  - Given 支援 Vibration API 的瀏覽器
  - When 點擊帶 `lex` 的 token
  - Then 呼叫 `navigator.vibrate(12)` 一次
  - Given 不支援 Vibration API
  - Then 不拋錯，其餘流程照常
- 狀態：確認

### REQ-RDR-013 點擊名相：高亮
- 來源：CLAUDE.md §1（第 10 行）、§6.3-2（第 184 行）、§6.5（第 202 行）
- 類型：UI
- 原文：「Token 高亮：bg-amber-900/40 border-b border-amber-500」；「觸控回饋（高亮）須即時（≤ 0.3s）」
- 驗收：
  - When 點擊帶 `lex` 的 token
  - Then 0.3 秒內該 token 背景為 amber-900 40% 不透明、底邊框為 amber-500
  - And 同一時間只有一個 token 高亮
  - When 抽屜收起
  - Then 高亮取消（Q-RDR-008）
- 狀態：確認

### REQ-RDR-014 名相抽屜開啟與內容
- 來源：CLAUDE.md §1（第 10 行）、§6.3-3（第 185 行）；Q-RDR-018
- 類型：UI
- 原文：「底部 Bottom Sheet 顯示辭典釋義；不用 Popover」；「vaul 抽屜由底部滑出：詞條、讀音、DFB 釋義、轉引連結、出處標示」
- 驗收：
  - When 點擊帶 `lex` 的 token
  - Then 由 `vaul` 抽屜自畫面底部滑出（不是 popover 或 tooltip）
  - And 抽屜依序含：詞條（該 token 的 `lex`）、讀音、DFB 釋義、轉引連結、出處標示
  - And 讀音同時列出該 token 的注音、拼音（各字 `zy`、`py`），以及該 token 的 `iast`（有才列），不受目前音標模式影響（Q-RDR-003）
  - And 列出條目全部義項；經文採用的義項（AST `sense`）排第一並標示為經文採用，其餘依 DFB 順序；每個義項附 `usg`（為 null 者不顯示）（Q-RDR-004）
  - And 讀音、DFB 釋義、轉引連結三區的標題依序為「讀音」「釋義」「參見」；出處標示不加標題；條目沒有轉引時不顯示「參見」（Q-RDR-018）
- 狀態：確認

### REQ-RDR-015 釋義逐字呈現
- 來源：CLAUDE.md §4-1（第 119 行）；REQ-DAT-011、012；Q-DAT-005；Q-RDR-017
- 類型：資料
- 原文：「名相釋義只能來自 DFB 原文，逐字呈現，不得改寫、摘要或由模型生成」
- 驗收：
  - Given 任一名相
  - Then 抽屜中釋義的文字逐字等於 `lexicon.dfb.json` 該條目 `def` 的字串部分（含換行）
  - And `def` 中的 `{ "g": "ID" }` 在原位置以行內 `<img src="data/gaiji/ID.png">` 顯示（例：「心經真言」的 DF-8752、DF-875F）
  - And `def` 中的 Unicode 私用區字（U+E000–U+F8FF，例：「舍利弗」條的 U+EE1B）在 DOM 文字中保持原字，畫面上以缺字符號「〓」顯示，並附無障礙標籤「缺字」（Q-RDR-017）
- 狀態：確認

### REQ-RDR-016 轉引連結
- 來源：CLAUDE.md §3.4-2（第 93–95 行）、§6.3-3（第 185 行）；REQ-DAT-009
- 類型：行為
- 驗收：
  - Given 「觀自在」抽屜（`xr` 含已收錄的「觀音」）
  - When 點擊「觀音」
  - Then 抽屜內容換成「觀音」條目（詞條、釋義、出處），並出現「返回」
  - When 點擊「返回」
  - Then 回到「觀自在」條目
  - And 未收錄的轉引目標（「觀音」→「五大明王」、「心經」→「般若心經」）顯示為一般文字、不可點擊（Q-RDR-005）
- 狀態：確認

### REQ-RDR-017 出處與授權標示
- 來源：CLAUDE.md §3.1（第 40 行）、§6.3-3（第 185 行）、§8.4（第 248 行）；REQ-DAT-004
- 類型：UI
- 原文：「每個名相抽屜皆顯示 DFB 出處與授權」
- 驗收：
  - Given 任一名相抽屜（含經轉引連結開啟的條目）
  - Then 顯示文字逐字等於 `lexicon.dfb.json` 的 `attribution`（「名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權」）
  - And 出處文字由 `lexicon.dfb.json` 讀取，不在程式中另寫一份
- 狀態：確認

### REQ-RDR-018 抽屜背景與收起
- 來源：CLAUDE.md §6.3-4（第 186 行）
- 類型：UI／行為
- 原文：「背景 backdrop blur；下滑收起」
- 驗收：
  - Given 抽屜開啟
  - Then 抽屜後方的經文有 backdrop blur
  - When 在抽屜上向下滑動
  - Then 抽屜收起，經文恢復清晰
- 狀態：確認

## 內容區隔

### REQ-RDR-019 白話參考與辭典釋義區隔
- 來源：CLAUDE.md §4-2（第 120 行）、§4-3（第 121 行）；Q-DAT-010
- 類型：UI
- 原文：「專案自撰內容（白話、主題、修持提示）在 UI 上須與辭典釋義明確區隔，並標示為『白話參考』」
- 驗收：
  - Given 某段的 `vernacular`、`themes`、`reflection`
  - Then 三者只出現在標示「白話參考」的區塊中，該區塊不在名相抽屜的 DFB 釋義區內
  - And 名相抽屜中不出現任何 `vernacular`、`reflection` 文字
  - And 每頁有一個「白話參考」膠囊按鈕；點擊後開啟另一個底部面板（與名相抽屜不同），標題為「白話參考」，依序顯示該段的白話、主題標籤、修持提示；下滑收起（Q-RDR-002）
- 狀態：確認

## 裝置 API

### REQ-RDR-020 螢幕常亮（Wake Lock）
- 來源：CLAUDE.md §1（第 12 行）、§7（第 209–241 行）、§2（第 28 行）
- 類型：行為
- 原文：`useWakeLock(active)`；「切到背景時 Wake Lock 會被系統釋放，回到前景需重新取得」
- 驗收：
  - Given 支援 Wake Lock 的瀏覽器，閱讀畫面開啟
  - Then 呼叫 `navigator.wakeLock.request('screen')`
  - When 頁面切到背景再回到前景（`visibilitychange` 為 visible）
  - Then 再次呼叫 `request('screen')`
  - When 閱讀畫面卸載
  - Then 釋放 sentinel（以 jsdom Vitest 驗收測試驗證，Q-RDR-021）
  - Given 不支援或請求被拒
  - Then 不拋錯，閱讀照常
  - And hook 位於 `src/hooks/useWakeLock.ts`
  - And 閱讀畫面開啟且在前景時一律常亮，不提供開關（Q-RDR-006）
- 狀態：確認

## 視覺原則（§6.5）

### REQ-RDR-021 配色
- 來源：CLAUDE.md §6.5（第 196、198 行）
- 類型：UI
- 原文：「介面無彩色：黑、白、灰階；唯一強調色是 §6.2–6.3 的琥珀色（音標、名相高亮）」
- 驗收：
  - Given 閱讀畫面、抽屜開啟、白話參考開啟三種狀態
  - Then 除流光底色（REQ-RDR-025）外，所有元素的文字色、背景色、邊框色皆為灰階或琥珀色
  - And 灰階以 RGB 三通道最大值與最小值的差 ≤ 10（0–255）判定（含 stone 系暖灰）；琥珀色只出現在 `<rt>` 與名相高亮（Q-RDR-012、Q-RDR-020）
- 狀態：確認

### REQ-RDR-022 字型打包
- 來源：CLAUDE.md §6.1（第 169 行）、§6.5（第 196–197 行）
- 類型：UI
- 原文：「無襯線字（預設 Noto Sans TC），須隨 App 打包子集、離線可用，不得依賴線上字型服務」
- 驗收：
  - Given 載入 App
  - Then 經文使用 Noto Serif TC、介面標籤與 `<rt>` 使用 Noto Sans TC，兩者皆為同源（same-origin）的字型檔，無對外字型請求（如 fonts.googleapis.com）
  - And 畫面上出現的每一個漢字與全形標點（經文、釋義、介面文字）都由對應字型子集涵蓋，不退回系統字型；拉丁字母（含 IAST 的 ś ṃ ṇ 等擴充字母）不在此限，TC 子集沒有的可退回系統字型（Q-RDR-016）
  - And 私用區字以「〓」顯示，「〓」由 Noto Serif TC 子集涵蓋（Q-RDR-017）
  - And 經文、DFB 釋義與名相抽屜的詞條標題用 Noto Serif TC；介面標籤（含義項類別 usg、轉引按鈕）、`<rt>`、白話參考用 Noto Sans TC（Q-RDR-032）；子集於建置時由 AST、辭典與介面文字的全部用字產生（Q-RDR-010）；襯線子集以完整版 Noto Serif CJK TC 為原始檔（涵蓋釋義的「儞」「嚩」），CSS 字族名仍為 Noto Serif TC（Q-RDR-016）
- 狀態：確認

### REQ-RDR-023 圓角與陰影
- 來源：CLAUDE.md §6.5（第 199–200 行）
- 類型：UI
- 驗收：
  - Then 膠囊（full pill）只用於操作按鈕與音標膠囊：音標膠囊、「白話參考」、「返回」、可點的轉引、「重新載入」為 full pill；經文名相 token 雖為 button 但屬經文，不得為膠囊；抽屜、面板、圖片的 `border-radius` 為 0（Q-RDR-025）
  - And 所有元素的 `box-shadow` 為 none
- 狀態：確認

### REQ-RDR-024 字重
- 來源：CLAUDE.md §6.5（第 201 行）
- 類型：UI
- 驗收：
  - Then 標題（抽屜詞條、白話參考標題）`font-weight` 介於 300 與 400；全畫面無 600 以上字重
- 狀態：確認

### REQ-RDR-025 流光底色
- 來源：CLAUDE.md §6.5（第 203–205 行）
- 類型：UI
- 驗收：
  - Then 經文背後有綠 → 琥珀 → 赭紅的虹彩漸層，該漸層沒有 CSS animation 或 transition，也不出現在按鈕或控制項上
  - And 在漸層上，經文與 `<rt>` 的文字對比度皆 ≥ 4.5:1（WCAG AA 一般文字）
- 狀態：確認

### REQ-RDR-026 轉場與減少動態
- 來源：CLAUDE.md §6.5（第 202 行）
- 類型：UI
- 驗收：
  - Then CSS 轉場與抽屜滑出／收起使用 `cubic-bezier(0.19, 1, 0.22, 1)`
  - Given `prefers-reduced-motion: reduce`
  - Then 轉場時間為 0 或接近 0，捲動不使用 smooth 行為
  - And 翻頁維持原生 Scroll Snap，不套用該曲線（Q-RDR-015）
- 狀態：確認

## 品質

### REQ-RDR-027 效能
- 來源：CLAUDE.md §8.5（第 249 行）
- 類型：品質
- 原文：「FCP < 0.8s、捲動 60fps、CLS = 0」
- 驗收：
  - Given 正式建置（`pnpm build` 後 `vite preview`），Playwright Chromium 手機 viewport，無網路節流
  - Then FCP（PerformanceObserver `first-contentful-paint`）< 800ms
  - And 從載入、切換全部音標模式、開關名相抽屜到開關白話參考，累計 CLS 為 0
  - And 捲動 60fps 以實機手動確認並記錄於 `review/`（Q-RDR-013）
- 狀態：確認

### REQ-RDR-028 測試覆蓋率
- 來源：CLAUDE.md §8.6（第 250 行）
- 類型：品質
- 原文：「測試覆蓋率 ≥ 80%」
- 驗收：
  - Then vitest 覆蓋率範圍包含 `src/**`（不含測試檔與型別宣告），行覆蓋率 ≥ 80%；驗收測試以 Playwright 執行（Q-RDR-014）
- 狀態：確認

## 載入狀態

### REQ-RDR-029 載入中與載入失敗
- 來源：Q-RDR-018（規格未規範，2026-10-19 使用者決議）；CLAUDE.md §1（第 8 行）、§6.5（第 196、199 行）
- 類型：UI／行為
- 驗收：
  - Given `heart-sutra.ast.json` 或 `lexicon.dfb.json` 尚未載入完成
  - Then 畫面只有 stone-950 背景，沒有轉圈、骨架或文字
  - Given 任一檔案載入失敗（網路錯誤、非 2xx、JSON 無法解析）
  - Then 畫面顯示一行「經文載入失敗」與一個膠囊按鈕「重新載入」，不顯示部分經文
  - When 點擊「重新載入」
  - Then 重新載入兩個檔案；成功後顯示經文
- 狀態：確認
