# 待釐清問題 — data 單元
> 2026-10-16。每題附建議；回覆後我更新 `requirements.md`，必要時補入 CLAUDE.md。

### Q-DAT-001 建置產物的資料格式
- 關聯：REQ-DAT-002、003
- 問題：CLAUDE.md 只說兩個產物「含逐字音標」「僅含引用到的條目」，沒有定義欄位。這是之後閱讀介面單元要讀的格式。
- 建議：
  ```jsonc
  // heart-sutra.ast.json
  { "id", "title", "translator", "baseText", "review",
    "segments": [{ "id", "vernacular", "themes", "reflection",
      "tokens": [{ "t": "般若", "lex": "般若波羅蜜多", "sense": 0,
                   "chars": [{ "c": "般", "py": "bō", "zy": "ㄅㄛ" }, …],
                   "iast": "prajñāpāramitā" }] }] }
  // lexicon.dfb.json
  { "source", "license", "attribution",
    "entries": { "觀自在": { "senses": [{ "usg": "術語", "def": "…", "xr": ["觀音"] }] } } }
  ```
- 回覆：OK

### Q-DAT-002 「經文原文」比對對象
- 關聯：REQ-DAT-005
- 問題：規則要求 tokens 串接「逐字等於經文原文」，但專案裡沒有獨立的原文檔，`heart-sutra.json` 本身就是唯一來源，自己比自己驗不出錯。
- 選項：
  - A（建議）：存一份 CBETA T08n0251 原文到 `data-sources/cbeta/`，建置時把 tokens 串接去標點後，套用 `baseText.variants` 再與 CBETA 比對。這是外部權威，但 `variants` 要補齊流通本與大正藏的所有差異（例如 呪／咒 等用字）。
  - B：另存一份人工確認的流通本純文字 `data/heart-sutra.text.txt` 作為比對對象。較簡單，但仍是專案自建。
- 回覆：A

### Q-DAT-003 轉引深度
- 關聯：REQ-DAT-009
- 問題：轉引目標本身也可能再轉引（例：觀自在 → 觀音 → 五大明王；般若波羅蜜多咒 → 心經 → 般若心經）。
- 建議：只收一層。目標條目照收，但其內的轉引只保留文字、不再收錄（否則會連鎖收進大量條目）。
- 回覆：OK

### Q-DAT-004 轉引的判定依據
- 關聯：REQ-DAT-009、010
- 問題：DFB XML 已有 `<xr>` 標記轉引目標。全辭典 6,005 處「見X條」中，254 處沒有對應的 `<xr>`；但經文目前引用的條目全部都有 `<xr>`。
- 建議：以 `<xr>` 為準。另外驗證已收錄條目的釋義中，每個「見X條」「與X同」都有對應的 `<xr>`；沒有就中止建置，交人工處理。
- 回覆：OK

### Q-DAT-005 DFB 造字（悉曇字圖片）
- 關聯：REQ-DAT-011、012
- 問題：「心經真言」釋義含 2 個悉曇造字（`<g ref="#DF-8752"/>`、`DF-875F`），DFB 只提供 PNG 圖檔（`gaiji/`）。逐字呈現需要保留它們。
- 建議：釋義中以 `{"g": "DF-8752"}` 標記保留位置，建置時把用到的 PNG 複製到 `public/data/gaiji/`（同屬 CC BY-SA）。UI 以 `<img>` 行內顯示。
- 回覆：OK

### Q-DAT-006 授權資訊寫入辭典檔
- 關聯：REQ-DAT-004
- 問題：§3.1 要求 App 內標示出處、`lexicon.dfb.json` 維持 CC BY-SA，但沒說出處文字放哪裡。
- 建議：寫進 `lexicon.dfb.json` 的 `license` 與 `attribution` 欄位，UI 直接讀取顯示，出處文字只維護一處。
- 回覆：OK

### Q-DAT-007 IAST 是否納入本次建置
- 關聯：REQ-DAT-016、017
- 問題：§3.4 的建置職責沒有列 IAST，但 §1 有 IAST 模式，`data/iast.json` 也已審定。
- 建議：納入。建置時依 `iast.json` 標到 token 上，並驗證 `iast.json` 的每個 token 都存在於經文中。
- 回覆：OK

### Q-DAT-008 審閱狀態未完成時的處理
- 關聯：REQ-DAT-020
- 問題：「review.* 皆為 true 才可正式發佈」要如何執行？目前三個旗標都已是 true，但日後修改內容時可能改回 false。
- 選項：
  - A（建議）：`pnpm build:data` 照常產出並警告；正式建置 `pnpm build` 在任一旗標（含 `iast.json` 的 `review.iast`）為 false 時中止。開發時不受阻，發佈時擋住。
  - B：`pnpm build:data` 就直接中止。
- 回覆：A

### Q-DAT-009 「見X條」「與X同」不一定是轉引
- 關聯：REQ-DAT-010
- 問題：依 REQ-DAT-010 字面，每個「見X條」「與X同」都要有對應的 `<xr>`；但已收錄條目中有 4 處不是轉引，照字面驗證會讓正常建置失敗：
  - 舍利弗：「與設利羅訛言之舍利混同」
  - 觀音：「與西方彌陀四菩薩之最初法菩薩同」、「與此例同」
  - 四諦第一義：「見四字部四諦條」（指原書四字部，DFB 未標 `<xr>`）
- 實作暫行做法：只有當 X 本身是 DFB 詞條時，才要求它出現在該義項的 `<xr>`。以上 4 處的 X 都不是詞條，故不報錯；「觀自在」缺 `<xr>觀音</xr>` 仍會失敗。
- 選項：
  - A（建議）：採用暫行做法。
  - B：改為人工維護的例外清單（逐一列出允許的非轉引句）。較嚴格，但 DFB 改版或新增經文時要手動補。
- 回覆：A（2026-10-16）

> 以下三題來自 spec-gate 第 2 輪稽核（2026-10-16 19:11），待下次回覆。程式漏洞已修正（validatePunct、variants 找不到即報錯、釋義含 <g> 以外元素即報錯），117/117 測試通過。

### Q-DAT-010 REQ-DAT-018「與辭典區隔」的解讀
- 問題：CLAUDE.md §4-2 要求「在 UI 上」區隔；登錄表寫成「lexicon.dfb.json 不含任何自撰文字」。但 10 個 `themes` 標籤（五蘊皆空、十八界、四諦…）本來就出現在 DFB 釋義中，字面要求永遠無法成立。
- 選項：
  - A（建議）：結構性區隔——辭典檔無自撰欄位、不含白話與修持提示句子；與名相同字的主題標籤不算。現行測試即此解讀。
  - B：字面——辭典檔不得出現任何自撰文字（需改掉 10 個主題標籤）。
- 回覆：A（2026-10-17）

### Q-DAT-011 補驗收測試並重新凍結
- 問題：稽核指出兩個測試缺口：REQ-DAT-005 沒有「漢字被標為 punct」的測試（漏洞已修，目前只有單元測試）；REQ-DAT-017 的 segments 情境沒有斷言錯誤訊息。
- 選項：
  - A（建議）：由盲寫測試者只在 `gaps.test.ts` 新增測試，既有測試不動，再重新凍結。
  - B：維持現狀，由 `scripts/` 的單元測試涵蓋。
- 回覆：A（2026-10-17）

### Q-DAT-012 AST 中的 CBETA 校勘資訊是否算「散布」
- 問題：CLAUDE.md 規定 CBETA 原文「不隨 App 散布」。AST 的 `baseText.variants` 帶有 s9 咒語的大正藏用字（約 20 字）與一行 CBETA 校勘說明。
- 選項：
  - A（建議）：保留——屬版本差異的簡短事實紀錄，不是 CBETA 全文；UI 可作出處說明。
  - B：建置時從 AST 移除 `baseText.variants`，只留在 `data/heart-sutra.json`。
- 回覆：A（2026-10-17）

> 以下四題來自 spec-gate 第 3 輪稽核（2026-10-17 09:32）：PASS 20／FAIL 1（Minor）／AMBIGUOUS 2。

### Q-DAT-013 REQ-DAT-005 測試未斷言「差異」
- 問題：requirements.md 要求錯誤訊息「指出段落 id 與差異」，`validation.test.ts`「照現」案例只斷言 `s1`。實作有報差異。
- 選項：
  - A（建議）：盲寫測試者在 `gaps.test.ts` 補斷言，重新凍結，spec-gate 只複核相關需求。
  - B：補斷言不複核。
  - C：豁免。
- 回覆：A（2026-10-17）

### Q-DAT-014 咒語處「大正藏用字」與 CBETA 矛盾
- 關聯：REQ-DAT-005、Q-DAT-012
- 問題：CLAUDE.md §3.4-4 要求「換回大正藏用字後與 CBETA 相同」。但 CBETA 依房山石經把大正藏「僧莎訶」校改為「莎婆訶」，兩者在此不可能同時成立；`variants[0].taisho` 實際填的是 CBETA 用字，`apparatus` 也漏了「僧莎【大】」與【房山-CB】。
- 選項：
  - A（建議）：規格改為「換回 CBETA 用字」，欄位 `taisho` 改名 `cbeta`，`apparatus` 照 CBETA 校勘補齊。
  - B：照字面比對大正藏原字（需另一份比對來源）。
- 回覆：A（2026-10-17）。CLAUDE.md §3.4-4 已改寫。

### Q-DAT-015 `<xr>` 目標不是 DFB 詞條
- 關聯：REQ-DAT-009
- 問題：DFB 共 7,428 個 `<xr>`，有 5 個目標不是詞條（一即一切、教論、心不相應法、同上、逆路迦耶陀）。現行實作略過不收，但 `xr` 仍保留目標文字，建置成功，產生指向不存在條目的連結。本經 47 條未遇到。
- 選項：
  - A（建議）：中止建置，交人工處理。
  - B：保留文字但標為不可點擊。
  - C：從 `xr` 移除。
- 回覆：A（2026-10-17）。CLAUDE.md §3.4-2 已加入。

### Q-DAT-016 登錄表與決議不同步
- 問題：REQ-DAT-018 仍是 Q-DAT-010 否決的字面寫法；REQ-DAT-005 引文寫「每段」，CLAUDE.md 現為「全經」；標頭只記到 Q-DAT-008。
- 回覆：同意更新文字以符合決議（2026-10-17），不動測試。

> 以下兩題來自 spec-gate 局部複核（2026-10-17 09:51，REQ-DAT-005／009／018）：PASS 2／FAIL 1（Minor）。

### Q-DAT-017 REQ-DAT-018 測試只比對整段文字
- 問題：`lexicon.test.ts` 只檢查整段 vernacular／reflection 是否出現在辭典，單句外洩抓不到；改為逐句比對又需要先定義「句子」（「舍利子！」同時是經文與名相）。
- 選項：
  - A（建議）：補結構測試——每個義項的鍵恰為 usg／def／xr，且 usg、xr 與 DFB 相同；連同既有的頂層鍵、entries 鍵、def 逐字（REQ-DAT-003、011），辭典內容完全由 DFB 決定，不必定義句子。盲寫、重新凍結，以 trace-check 與測試輸出為證，不再稽核。
  - B：同 A，另跑一次局部稽核。
  - C：以既有測試為證豁免。
  - D：逐句比對。
- 回覆：A（2026-10-17）

### Q-DAT-018 「xr 目標非詞條即中止」的適用層級
- 關聯：REQ-DAT-009、Q-DAT-015
- 問題：CLAUDE.md §3.4-2 未限定層級；登錄表與實作只檢查經文引用條目（第一層）。現行 DFB 兩種解讀結果相同。
- 回覆：只檢查第一層（2026-10-17）。CLAUDE.md §3.4-2 已改為「經文引用條目的 `<xr>` 目標」。

> 以下四題來自 Step 7 code review（2026-10-17）。規格範圍內的四項已直接修正：validateIast 逐 token 驗證、pinyin-pro 音節數與段落字數對齊檢查、variants 段落不存在即報錯、兩處小型程式品質。

### Q-DAT-019 iast.json 重複／重疊／空值
- 關聯：REQ-DAT-016
- 問題：同一 lex＋token＋段落在 entries 重複、或同時列在 entries 與 noIast、或 iast 為空字串時，建置不報錯（iastFor 取第一筆），REQ-DAT-016「noIast 皆無 iast」不受保證。
- 回覆：中止建置（2026-10-17）。REQ-DAT-016 已補驗收句。

### Q-DAT-020 建置輸入的結構驗證
- 問題：heart-sutra.json、iast.json、readings.lock.json 僅以型別斷言讀入，缺欄位時錯誤為 TypeError。
- 回覆：以 zod 建 schema 驗證，型別由 schema 導出（2026-10-17）。屬技術實作細節，不另立 REQ。

### Q-DAT-021 iast.json 來源備註與 review.iast 矛盾
- 問題：`sources.mn1884.status` 寫「Check against the page images before setting review.iast」，但 review.iast 已為 true，CLAUDE.md §3.5 稱此對照為選擇性。
- 回覆：改寫備註以符合 §3.5（2026-10-17）。

### Q-DAT-022 已實作但未登錄的行為
- 問題：釋義含 `<g>` 以外元素即中止、漢字標為 punct 即中止、CBETA 檔 `#` 行為註解、AST 標點 token 形狀，皆未寫入登錄表。
- 回覆：補入 REQ-DAT-002、005、011（2026-10-17）。
