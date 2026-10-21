# CLAUDE.md — SutraFlow PWA（心經逐字解讀沉浸器）

## 1. 專案概要

- **名稱**：SutraFlow PWA（佛學沉浸式經文逐字解讀與動態音標對照器，行動 PWA 版）
- **試行經文**：《般若波羅蜜多心經》玄奘譯本，流通本（含咒語）
- **核心體驗**：
  - **沉浸讀經（Zen Mode）**：全螢幕、無頂底導航，深色背景（stone-950）。
  - **直排經摺翻頁**：`writing-mode: vertical-rl`，水平由右向左滑動，CSS Scroll Snap 停靠。第一頁為封面：經題「般若波羅蜜多心經」與譯者「唐 三藏法師玄奘 譯」（2026-10-20 定案）。封面左下有滑動提示「‹ 向右滑動翻頁」；首次在封面開啟時，經摺自動輕推約 40px 露出經文第 1 頁邊緣後彈回，只做一次，`prefers-reduced-motion` 時不推（2026-10-21 定案）。
  - **名相解讀抽屜**：點擊名相 → 微震動 → 高亮 → 底部 Bottom Sheet 顯示辭典釋義；不用 Popover。
  - **音標切換**：注音 → 拼音 → 梵文(IAST) → 無音標，以 `<ruby>` 呈現。
  - **PWA**：可安裝（standalone）、100% 離線、螢幕常亮（Wake Lock）、觸覺回饋（Vibration）。

## 2. 技術選型（已定案）

| 類別 | 選擇 |
|---|---|
| 框架 | **React 19 + TypeScript**（Vite） |
| 套件管理 | pnpm |
| 樣式 | Tailwind CSS |
| Bottom Sheet | `vaul` |
| PWA | `vite-plugin-pwa`（Workbox） |
| 音標產生 | `pinyin-pro`（建置期產生）＋ 人工覆寫表 |
| 本機儲存 | Dexie.js（閱讀進度、音標偏好） |
| 測試 | Vitest（單元）、Playwright（E2E，含離線測試） |

- 套件版本在建立腳手架時以 Context7 查最新穩定版，不要憑記憶鎖版本。
- 自訂 hook 放 `src/hooks/`（例：`useWakeLock`、`useHaptics`、`usePhoneticMode`）。

## 3. 資料架構

### 3.1 資料來源與授權

| 來源 | 用途 | 授權 | 位置 |
|---|---|---|---|
| 丁福保《佛學大辭典》DILA TEI P5 版 | 名相釋義（唯一辭典來源） | 原文公共領域；TEI 數位版 **CC BY-SA 2.5 TW**（DDBC/DILA） | `data-sources/dfb/` |
| CBETA T08n0251 | 經文校勘依據 | CBETA 授權 | 僅作比對 |

- 下載頁：https://glossaries.dila.edu.tw/glossaries/DFB
- **App 內必須標示出處**：「名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權」。
- 由 DFB 衍生的 `lexicon.dfb.json` 須維持 CC BY-SA；App 程式碼本身不受影響。
- **《佛光大辭典》不得使用**：有著作權、無開放資料，離線打包即構成重製散布。

### 3.2 檔案

```
data/heart-sutra.json                 # 人工校訂的經文主檔（唯一真實來源）
data/readings.lock.json               # 已審閱的全經讀音快照（建置比對用）
data/iast.json                        # 梵文 IAST 對照表（已審定）
review/                               # 讀音、白話審閱報告
data-sources/dfb/…/dingfubao.xml      # DFB TEI 原始檔（31,366 條）
data-sources/cbeta/T08n0251.txt       # CBETA 原文（建置期比對用，不隨 App 散布；不進 git repo，見 THIRD_PARTY_NOTICES.md）
data-sources/legacy/sutra-db.v0.json  # 舊版資料，僅供參考，不再使用
scripts/build-data.ts                 # 建置腳本（pnpm build:data）
public/data/heart-sutra.ast.json      # 建置產物：含逐字音標
public/data/lexicon.dfb.json          # 建置產物：僅含經文引用到的 DFB 條目
public/data/gaiji/                    # 建置產物：釋義用到的 DFB 造字 PNG
scripts/build-icons.ts                # 圖示產生腳本（pnpm build:icons）
public/{pwa-*.png,apple-touch-icon.png,favicon.svg}  # 建置產物：App 圖示與 favicon（「心」字）
docs/spec/data/                       # data 單元需求登錄表與決議（spec-flow）
```

產物格式見 `docs/spec/data/requirements.md`（REQ-DAT-002、003）。

### 3.3 `data/heart-sutra.json` 結構

```jsonc
{
  "baseText": { "edition": "流通本", "collatedWith": "CBETA T08n0251", "variants": [...] },
  "review": { "readings": false, "editorial": false },   // 人工審閱狀態
  "segments": [{
    "id": "s1",
    "tokens": [
      { "t": "觀自在", "lex": "觀自在" },                 // lex = DFB 詞條 headword
      { "t": "舍利子", "lex": "舍利弗", "py": "shè lì zǐ" }, // lex 可與 t 不同（消歧）
      { "t": "，", "punct": true },
      { "t": "照見" }                                    // 無 lex = 不可點擊
    ],
    "vernacular": "…",   // 白話：專案自撰（editorial）
    "themes": ["…"],     // 主題標籤：專案自撰
    "reflection": "…"    // 修持提示：專案自撰，不作醫療／療效宣稱
  }]
}
```

規則：
- 全經 `tokens[].t` 串接後必須**逐字等於**經文原文（比對方式見 3.4-4；段落切分屬編輯判斷，不另行比對）。
- `lex` 必須能在 DFB 找到；需消歧時加 `"usg": "術語"` 指定義項類別。
- `py` 用於佛教慣讀（般若 bō rě、舍利 shè lì、行 xíng…）及需鎖定讀音之處（咒語、音譯詞），音節數 = 字數；其餘交給 `pinyin-pro`。
- 已知對應陷阱：DFB「舍利子」第一義為遺骨，故指向「舍利弗」；「夢想」指睡夢，故「顛倒夢想」指向「顛倒」。

### 3.4 建置腳本職責（`scripts/build-data.ts`）

1. 解析 DFB TEI XML，只抽出 `heart-sutra.json` 引用到的條目（含多義項）。
2. 解析 `見X條`／`與X同` 轉引，一併收錄目標條目並建立連結。
   - 以 XML 的 `<xr>` 為準；釋義中的「見X條」「與X同」，當 X 本身是 DFB 詞條卻沒有對應 `<xr>` 時即中止建置（X 非詞條者不是轉引，例：「與此例同」）。
   - 經文引用條目的 `<xr>` 目標本身不是 DFB 詞條時即中止建置，交人工處理。
   - 只收一層：轉引目標自身的 `<xr>` 保留文字，不再收錄。
   - 造字 `<g ref="#ID"/>` 在釋義中以 `{ "g": "ID" }` 保留位置，用到的 PNG 複製到 `public/data/gaiji/`。
   - `lexicon.dfb.json` 帶 `license`、`attribution` 欄位（§3.1 出處原句），UI 由此讀取。
3. 以 `pinyin-pro` 產生逐字拼音（**`toneSandhi: false`**，標本調，與教育部辭典一致），套用 `py` 覆寫，再轉注音。
   - `pinyin-pro` 依大陸普通話審音，與台灣國語不同處（如 識 shì、究 jiù、空相 xiàng）一律以 `py` 覆寫。
4. 驗證：原文串接一致、lex 全部存在、`py` 音節數正確、**全經讀音與 `data/readings.lock.json` 逐 token 相同**；任一失敗即中止建置。
   - lock 檔是已審閱的讀音快照，只在人工對照教育部辭典後更新（審閱紀錄：`review/readings-review.md`）。
   - 「原文」指 `data-sources/cbeta/T08n0251.txt`：tokens 串接去標點、套用 `baseText.variants` 換回 CBETA 用字後，須與 CBETA 去標點文字相同（咒語「莎婆訶」CBETA 依房山石經校改，大正藏作「僧莎訶」，故比對對象是 CBETA 而非大正藏）。
   - 依 `data/iast.json` 標註 token 的 IAST，並驗證其中每個 token 都存在於經文中。
5. 審閱旗標：`pnpm build:data` 遇任一 `review.*`（含 `iast.json` 的 `review.iast`）為 false 時只警告；正式建置 `pnpm build` 則中止。

### 3.5 尚未解決

- **IAST**：DFB 內嵌梵文拼寫不一致，不採用。已建 `data/iast.json`（33 條，主要依 GRETIL 所收 Vaidya 1961 本）。
  - **只收單一名相與咒語**，不收整句：GRETIL 為 CC BY-NC-SA 4.0，整句譯寫等同重製校訂本文字。
  - IAST 以 token 為單位標註（梵文無法逐字對應漢字）；`noIast` 列出無梵文對應者（如 度一切苦厄）。
  - 2026-10-16 審定完成（見 `review/iast-review.md`），`review.iast: true`。尚未對照 Müller & Nanjio 1884 天城體原頁（選擇性）。
  - DILA Soothill-Hodous 頁面未標授權，不引用。
- ~~**讀音審閱**~~：2026-10-16 完成（見 `review/readings-review.md`），`review.readings: true`。
- ~~**白話審閱**~~：2026-10-16 完成（見 `review/editorial-review.md`，依法藏《略疏》、窺基《幽贊》），`review.editorial: true`。

## 4. 內容規範（Zero Hallucination）

1. **名相釋義只能來自 DFB 原文**，逐字呈現，不得改寫、摘要或由模型生成。
2. 專案自撰內容（白話、主題、修持提示）在 UI 上須與辭典釋義**明確區隔**，並標示為「白話參考」。
3. `reflection` 不得宣稱療效，不得處理或診斷任何病症，不得含說服、操弄性語句。
4. 新增 token 對應時，必須能指出 DFB 條目內容支持該對應。

## 5. PWA 與快取

`manifest.webmanifest`：

```json
{
  "name": "心經·逐字解讀沉浸器",
  "short_name": "心經",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0c0a09",
  "theme_color": "#0c0a09",
  "orientation": "portrait",
  "icons": [
    { "src": "/pwa-192x192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/pwa-512x512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

上列 `/` 為預設 base。GitHub Pages（`.github/workflows/deploy-pages.yml`）以 `BASE_PATH=/<repo>/` 建置，`start_url`、`scope`、`icons` 隨之改變；App 內資料與字型一律用相對路徑，不得寫死 `/` 開頭（2026-10-21 定案）。CBETA 原文以 repo secret `CBETA_T08N0251_B64`（base64）提供給 CI。

Workbox 快取分層：
1. **App Shell 與字型**（Precache / CacheFirst）：JS、CSS、Noto Serif TC 直排子集字型、介面標籤字型子集（§6.5）。
2. **經文與辭典**（Precache）：`heart-sutra.ast.json`、`lexicon.dfb.json` 於安裝時預快取。
3. **未來擴充經典／辭典**（StaleWhileRevalidate）：首次查詢時抓取並存入 CacheStorage。

## 6. 行動端版面

### 6.1 直排容器

```css
.sutra-viewport {
  height: 100dvh;                 /* 動態視窗高度，避免網址列伸縮推擠 */
  width: 100vw;
  overflow-x: auto;
  overflow-y: hidden;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;  /* 經摺翻頁停靠 */
  direction: rtl;                 /* 從最右側（經首）開始 */
}

.sutra-page {
  scroll-snap-align: start;
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-feature-settings: "vkrn" on, "vert" on;
  font-family: "Noto Serif TC", serif;
  line-height: 2.8;               /* 預留 <rt> 空間 */
  letter-spacing: 0.5em;          /* 字與字之間留白（2026-10-20 由 0.12em 放寬） */
  padding: 1.5rem 1rem;
}
```

### 6.2 觸控與 Ruby

- 經文字級 18–22px；可點擊 token 為 `inline-block`，觸控熱區 ≥ 44×44px。
- `<rt>`：sans-serif、10px、低對比（如 `text-amber-500/75`）。
- 同一直行相鄰兩個 `<rt>` 之間至少留 6px（注音、拼音、IAST 皆同；2026-10-20 定案）。

### 6.3 Bottom Sheet 互動

1. `navigator.vibrate(12)`（不支援則略過）。
2. Token 高亮：`bg-amber-900/40 border-b border-amber-500`。
3. `vaul` 抽屜由底部滑出：詞條、讀音、DFB 釋義、轉引連結、出處標示。
4. 背景 backdrop blur；下滑收起。

### 6.4 音標切換膠囊

- 螢幕底部中央半透明膠囊（`backdrop-blur-md bg-stone-900/80`），單手拇指輪替模式，選擇存入 Dexie。

### 6.5 視覺原則（2026-10-17 定案）

借用「單色編輯式」風格參考的原則，不沿用其淺色主題、字型與巨型字級。

- **深色不變**：維持 Zen Mode（stone-950）；經文仍為 Noto Serif TC 直排。
- **介面標籤字型**：無襯線字（預設 Noto Sans TC），須隨 App 打包子集、離線可用，不得依賴線上字型服務。
- **介面無彩色**：黑、白、灰階；唯一強調色是 §6.2–6.3 的琥珀色（音標、名相高亮）。
- **圓角二分**：膠囊（full pill）只用於按鈕與膠囊切換；抽屜、面板、圖片一律直角。
- **無陰影**：以 1px 細線與明暗區隔層次，不用 box-shadow。
- **留白與輕字重**：標題用細字重（300–400），不用粗體。
- **緩動**：轉場用 `cubic-bezier(0.19, 1, 0.22, 1)`；翻頁、抽屜等轉場可較慢，觸控回饋（高亮）須即時（≤ 0.3s）；遵守 `prefers-reduced-motion`。
- **流光底色**：經文背後可有極淡的虹彩漸層（綠 → 琥珀 → 赭紅），只作背景，不得用於按鈕或控制項。
  - **靜態**：不做動畫（螢幕常亮時避免耗電）。
  - **可讀性優先**：漸層濃度以經文與音標（含 10px `<rt>`）皆符合 WCAG AA 為上限；兩者衝突時調淡漸層，不調暗文字。

## 7. 裝置 API

```ts
// src/hooks/useWakeLock.ts
import { useEffect } from 'react'

export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let cancelled = false

    const acquire = async () => {
      try {
        const lock = await navigator.wakeLock.request('screen')
        // 請求期間已卸載：之後不會有人釋放，當場釋放
        if (cancelled) {
          lock.release()
          return
        }
        sentinel = lock
      } catch (error) {
        console.warn('Wake Lock request failed:', error)
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible' && !cancelled) acquire()
    }

    acquire()
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      sentinel?.release()
    }
  }, [active])
}
```

（切到背景時 Wake Lock 會被系統釋放，回到前景需重新取得。）

## 8. 驗收清單

1. **資料**：建置驗證全數通過（見 3.4）；`review.*` 皆為 `true` 才可正式發佈。
2. **直排標點**：`，`、`。`、`；`、`！`、`：` 在直排下位於字右上偏中，不偏位、不掉行。
3. **離線**：DevTools 切 Offline 後重新整理，可完整渲染全經並開啟任一名相抽屜（Playwright 自動化）。
4. **出處**：每個名相抽屜皆顯示 DFB 出處與授權。
5. **效能**：FCP < 0.8s、捲動 60fps、CLS = 0。
6. **測試覆蓋率** ≥ 80%。
