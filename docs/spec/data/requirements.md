# 需求登錄表 — data 單元
> 狀態：已確認（2026-10-16，使用者確認；Q-DAT-001～009 已併入；2026-10-17 併入 Q-DAT-010～022）
> 來源：`CLAUDE.md`（行號依 2026-10-16 版本；2026-10-17 於 §3.4-2 新增一行，第 96 行以後的現行行號 +1）；問題決議見 `open-questions.md`。

## 腳手架

### REQ-DAT-001 技術選型與套件
- 來源：CLAUDE.md §2（第 16–27 行）
- 類型：資料
- 原文：「React 19 + TypeScript（Vite）」「pnpm」「Tailwind CSS」「vaul」「vite-plugin-pwa（Workbox）」「pinyin-pro（建置期產生）」「Dexie.js」「Vitest（單元）、Playwright（E2E）」；「套件版本在建立腳手架時以 Context7 查最新穩定版」
- 驗收：
  - Given 專案根目錄
  - When 讀取 `package.json`
  - Then 依賴包含 `react@19.x`、`react-dom@19.x`、`typescript`、`vite`、`tailwindcss`、`vaul`、`vite-plugin-pwa`、`pinyin-pro`、`dexie`、`vitest`、`@playwright/test`，`packageManager` 欄位為 `pnpm@…`
- 狀態：確認

## 輸出檔

### REQ-DAT-002 產出經文 AST
- 來源：CLAUDE.md §3.2（第 55 行）；Q-DAT-001
- 類型：資料
- 原文：「public/data/heart-sutra.ast.json　# 建置產物：含逐字音標」
- 驗收：
  - Given `data/heart-sutra.json` 驗證通過
  - When 執行 `pnpm build:data`
  - Then 產生 `public/data/heart-sutra.ast.json`，頂層含 `id`、`title`、`translator`、`baseText`、`review`、`segments`；9 段，每段含 `id`、`vernacular`、`themes`、`reflection`、`tokens`
  - And 每個非標點 token 含 `t` 與 `chars`，`chars` 每項為 `{ c, py, zy }`，`chars` 串接等於 `t`；有 `lex` 的 token 另含 `lex` 與 `sense`（義項索引）
  - And 標點 token 輸出為 `{ "t": <標點>, "punct": true }`，不含 `chars`（Q-DAT-022）
- 狀態：確認

### REQ-DAT-003 產出精簡辭典
- 來源：CLAUDE.md §3.2（第 56 行）、§3.4-1（第 92 行）；Q-DAT-001
- 類型：資料
- 原文：「public/data/lexicon.dfb.json　# 建置產物：僅含經文引用到的 DFB 條目」；「只抽出 heart-sutra.json 引用到的條目（含多義項）」
- 驗收：
  - Given 經文引用 38 個不同 `lex`
  - When 執行 `pnpm build:data`
  - Then `lexicon.dfb.json` 頂層含 `source`、`license`、`attribution`、`entries`；`entries` 以 headword 為鍵，每條為 `{ senses: [{ usg, def, xr }] }`（DFB 無 `<usg>` 時 `usg` 為 `null`；`xr` 一律為陣列）
  - And `entries` 恰為這 38 條與一層轉引目標（REQ-DAT-009）的聯集，共 47 條（「色即是空」「菩薩」兩者皆是），不含其他條目；多義項保留全部（例：「五蘊」「六根」「四諦」各 2 義）
- 狀態：確認

### REQ-DAT-004 辭典授權資訊
- 來源：CLAUDE.md §3.1（第 36、40–41 行）、§3.4-2（第 97 行）；Q-DAT-006
- 類型：資料
- 原文：「TEI 數位版 CC BY-SA 2.5 TW（DDBC/DILA）」；「App 內必須標示出處：『名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權』」；「lexicon.dfb.json 須維持 CC BY-SA」
- 驗收：
  - Given 建置完成
  - When 讀取 `lexicon.dfb.json`
  - Then `license` 為 `CC BY-SA 2.5 TW`，`attribution` 逐字等於「名相釋義出自丁福保《佛學大辭典》，數位版本由法鼓文理學院（DILA/DDBC）以 CC BY-SA 2.5 TW 授權」
- 狀態：確認

## 經文主檔驗證（任一失敗即以非 0 結束，且不寫出任何建置產物）

### REQ-DAT-005 原文與 CBETA 一致
- 來源：CLAUDE.md §3.3（第 85 行）、§3.4-4（第 100、102 行）；Q-DAT-002（A）、Q-DAT-014（A）
- 類型：驗證
- 原文：「全經 tokens[].t 串接後必須逐字等於經文原文」；「套用 baseText.variants 換回 CBETA 用字後，須與 CBETA 去標點文字相同」（Q-DAT-014）
- 驗收：
  - Given `data-sources/cbeta/T08n0251.txt`（CBETA 原文）
  - When 執行 `pnpm build:data`，將全經 tokens 串接、去除標點，並把 `baseText.variants` 的 `recitation` 換回 `cbeta`（CBETA 用字；Q-DAT-014）
  - Then 結果逐字等於 CBETA 原文去除標點與空白後的文字（260 字）
  - And 若任何一字不同（例：把「照見」改成「照現」），建置失敗，錯誤訊息指出段落 id 與差異
  - And 標為 `punct` 的 token 含非標點文字時，建置失敗，錯誤訊息指出段落 id 與該文字（Q-DAT-022）
  - And CBETA 檔中以 `#` 開頭的行為檔頭註解（經文資訊、校勘），不參與比對（Q-DAT-022）
- 狀態：確認

### REQ-DAT-006 lex 必須存在於 DFB
- 來源：CLAUDE.md §3.3（第 86 行）、§3.4-4（第 100 行）、§4-4（第 121 行）
- 類型：驗證
- 原文：「lex 必須能在 DFB 找到」
- 驗收：
  - Given 某 token 的 `lex` 不是 DFB 任何條目的 `<form>`
  - When 執行 `pnpm build:data`
  - Then 建置失敗，錯誤訊息列出段落 id、token 與該 lex
- 狀態：確認

### REQ-DAT-007 usg 消歧
- 來源：CLAUDE.md §3.3（第 86 行）
- 類型：驗證
- 原文：「需消歧時加 "usg": "術語" 指定義項類別」
- 驗收：
  - Given token 帶 `usg`
  - When 執行 `pnpm build:data`
  - Then 該 token 的 `sense` 指向 lex 條目中 `<usg>` 等於該值的義項；無此義項則建置失敗
  - And token 不帶 `usg` 時 `sense` 為 0
- 狀態：確認（目前經文無 token 使用 `usg`，以測試資料驗證）

### REQ-DAT-008 py 音節數
- 來源：CLAUDE.md §3.3（第 87 行）、§3.4-4（第 100 行）
- 類型：驗證
- 原文：「py … 音節數 = 字數」
- 驗收：
  - Given 某 token `t` 為 3 字而 `py` 為 2 個音節
  - When 執行 `pnpm build:data`
  - Then 建置失敗，錯誤訊息列出該 token
- 狀態：確認

## 辭典抽取

### REQ-DAT-009 轉引條目收錄（一層）
- 來源：CLAUDE.md §3.4-2（第 93–95 行；2026-10-17 新增一行）；Q-DAT-003、Q-DAT-004、Q-DAT-015
- 類型：資料
- 原文：「解析 見X條／與X同 轉引，一併收錄目標條目並建立連結」
- 驗收：
  - Given 經文引用條目的 `<xr>` 目標共 11 個：觀音、陰、三科、蘇波訶、大般涅槃、菩薩、般若波羅蜜、心經、色即是空、四諦、萬法
  - When 執行 `pnpm build:data`
  - Then 這 11 條皆收入 `entries`，引用它們的義項 `xr` 列出目標 headword
  - And 轉引目標自身的 `<xr>`（例：觀音 → 五大明王、心經 → 般若心經）保留在其 `xr` 欄位，但目標條目**不**收錄
  - And 若經文引用條目的某個 `<xr>` 目標不是 DFB 詞條，建置失敗，錯誤訊息列出引用條目與該目標（Q-DAT-015）
- 狀態：確認

### REQ-DAT-010 轉引文字與 `<xr>` 一致
- 來源：CLAUDE.md §3.4-2（第 94 行）；Q-DAT-004、Q-DAT-009
- 類型：驗證
- 原文：「解析 見X條／與X同 轉引」
- 驗收：
  - Given 已收錄的某義項釋義含「見X條」或「與X同」，且 X 本身是 DFB 詞條
  - When 執行 `pnpm build:data`
  - Then 該義項的 `<xr>` 必須包含 X；否則建置失敗，錯誤訊息列出條目與 X
  - And X 不是 DFB 詞條時（例：舍利弗「與設利羅訛言之舍利混同」、觀音「與此例同」、四諦「見四字部四諦條」）不視為轉引，不報錯
- 狀態：確認（Q-DAT-009：A）

### REQ-DAT-011 釋義逐字取自 DFB
- 來源：CLAUDE.md §4-1（第 118 行）；Q-DAT-005
- 類型：資料
- 原文：「名相釋義只能來自 DFB 原文，逐字呈現，不得改寫、摘要或由模型生成」
- 驗收：
  - Given 任一收錄條目的任一義項
  - When 比對 `lexicon.dfb.json` 的 `def` 與 `dingfubao.xml` 該 `<def>`
  - Then 純文字部分逐字相同（含原文中的空白與換行）；`<g ref="#ID"/>` 造字在 `def` 中為 `{ "g": "ID" }` 物件，位置不變（`def` 為字串與造字物件組成的陣列）
  - And 收錄條目的 `<def>` 含 `<g>` 以外的元素（例：`<choice>`）時，建置失敗，錯誤訊息列出條目與元素名稱，因其無法逐字保留（Q-DAT-022）
- 狀態：確認

### REQ-DAT-012 造字圖檔
- 來源：CLAUDE.md §3.4-2（第 96 行）、§4-1（第 118 行）；Q-DAT-005
- 類型：資料
- 原文：「逐字呈現」
- 驗收：
  - Given 「心經真言」釋義含造字 DF-8752、DF-875F
  - When 執行 `pnpm build:data`
  - Then `public/data/gaiji/DF-8752.png`、`DF-875F.png` 存在，且與 `data-sources/dfb/…/gaiji/` 原檔位元組相同；未被引用的造字不複製
  - And 輸出目錄的 `gaiji/` 若留有上次建置的舊檔（本次未引用），建置後應移除
- 狀態：確認

## 音標

### REQ-DAT-013 拼音產生
- 來源：CLAUDE.md §3.3（第 87 行）、§3.4-3（第 98–99 行）
- 類型：資料
- 原文：「以 pinyin-pro 產生逐字拼音（toneSandhi: false，標本調…），套用 py 覆寫」
- 驗收：
  - Given 「一切」無 `py`、「空相」有 `py: kōng xiàng`
  - When 執行 `pnpm build:data`
  - Then 「一切」的 `chars[].py` 為 `yī`、`qiè`（非 `yí`），「空相」為 `kōng`、`xiàng`
- 狀態：確認

### REQ-DAT-014 注音轉換
- 來源：CLAUDE.md §3.4-3（第 98 行）、§1（第 11 行）
- 類型：資料
- 原文：「再轉注音」；「音標切換：注音 → 拼音 → 梵文(IAST) → 無音標」
- 驗收：
  - Given 拼音 `bō rě`、`jiù jìng`、`zǐ`、`shì`、`yī`
  - When 執行轉換
  - Then 依序得 `ㄅㄛ ㄖㄜˇ`、`ㄐㄧㄡˋ ㄐㄧㄥˋ`、`ㄗˇ`、`ㄕˋ`、`ㄧ`（一聲不標調號）
- 狀態：確認

### REQ-DAT-015 讀音鎖定比對
- 來源：CLAUDE.md §3.4-4（第 100–101 行）
- 類型：驗證
- 原文：「全經讀音與 data/readings.lock.json 逐 token 相同；任一失敗即中止建置」「lock 檔…只在人工對照教育部辭典後更新」
- 驗收：
  - Given 產生的讀音有一個 token 與 lock 檔不同（例：移除「意識界」的 `py`，產生 `yì shí jiè`）
  - When 執行 `pnpm build:data`
  - Then 建置失敗，錯誤訊息列出段落、token、產生值與 lock 值；lock 檔內容不變
- 狀態：確認

### REQ-DAT-016 IAST 標註
- 來源：CLAUDE.md §1（第 11 行）、§3.5（第 108–110 行）；Q-DAT-007、Q-DAT-019
- 類型：資料
- 原文：「音標切換：注音 → 拼音 → 梵文(IAST) → 無音標」；「IAST 以 token 為單位標註…；noIast 列出無梵文對應者」
- 驗收：
  - Given `data/iast.json`
  - When 執行 `pnpm build:data`
  - Then 「般若波羅蜜多」token 的 `iast` 為 `prajñāpāramitā`；s1 的「一切」無 `iast`，s8 的「一切」為 `sarva`；`noIast` 列出的 token 皆無 `iast`
  - And 若 `iast.json` 有下列任一情況，建置失敗，錯誤訊息列出條目：同一 lex＋token＋段落在 `entries` 出現兩次；同一 lex＋token＋段落同時出現在 `entries` 與 `noIast`；`entries[].iast` 為空字串（Q-DAT-019）
- 狀態：確認

### REQ-DAT-017 IAST 對照表驗證
- 來源：CLAUDE.md §3.4-4（第 103 行）；Q-DAT-007
- 類型：驗證
- 原文：（決議）「驗證 iast.json 的每個 token 都存在於經文中」
- 驗收：
  - Given `iast.json` 某條目的 token 不在經文中（或 `segments` 指定的段落中沒有該 token）
  - When 執行 `pnpm build:data`
  - Then 建置失敗，錯誤訊息列出該條目
- 狀態：確認

## 內容區隔

### REQ-DAT-018 專案自撰內容與辭典分開
- 來源：CLAUDE.md §4-2（第 119 行）
- 類型：資料
- 原文：「專案自撰內容（白話、主題、修持提示）在 UI 上須與辭典釋義明確區隔」
- 驗收：
  - Given 建置完成
  - When 讀取兩個產物
  - Then `vernacular`／`themes`／`reflection` 只出現在 AST 的段落層級；`lexicon.dfb.json` 沒有任何自撰欄位，也不含 `vernacular`、`reflection` 的句子（與名相同字的 `themes` 標籤不算；Q-DAT-010）
  - And 辭典內容完全由 DFB 決定：每個義項的鍵恰為 `usg`、`def`、`xr`，且 `usg`、`xr` 與 DFB 該義項相同（`def` 見 REQ-DAT-011；Q-DAT-017）
- 狀態：確認

### REQ-DAT-019 無 lex 的 token 不可點擊
- 來源：CLAUDE.md §3.3（第 75 行）
- 類型：資料
- 原文：「無 lex = 不可點擊」
- 驗收：
  - Given 「照見」無 `lex`
  - When 讀取 AST
  - Then 該 token 無 `lex`；所有帶 `lex` 的 token，其 `lex` 皆為 `lexicon.dfb.json` 的 `entries` 鍵
- 狀態：確認

## 發佈與品質

### REQ-DAT-020 審閱狀態控管發佈
- 來源：CLAUDE.md §3.4-5（第 104 行）、§8-1（第 229 行）；Q-DAT-008（A）
- 類型：驗證
- 原文：「建置驗證全數通過（見 3.4）；review.* 皆為 true 才可正式發佈」
- 驗收：
  - Given `heart-sutra.json` 的 `review.readings`／`review.editorial` 或 `iast.json` 的 `review.iast` 任一為 `false`
  - When 執行 `pnpm build:data`
  - Then 照常產出，並在輸出中警告哪個旗標為 false
  - When 執行 `pnpm build`（正式建置）
  - Then 以非 0 結束，錯誤訊息列出為 false 的旗標
- 狀態：確認

### REQ-DAT-021 測試覆蓋率
- 來源：CLAUDE.md §8-6（第 234 行）
- 類型：驗證
- 原文：「測試覆蓋率 ≥ 80%」
- 驗收：
  - Given `scripts/` 下的建置程式
  - When 執行 `pnpm vitest run --coverage`
  - Then 行覆蓋率 ≥ 80%
- 狀態：確認
