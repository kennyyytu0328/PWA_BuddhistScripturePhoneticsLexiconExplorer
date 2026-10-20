# 待釐清問題 — pwa 單元
> 2026-10-20 由 Step 0 需求登錄產生。每題附建議選項；回覆後併入 `requirements.md`。

### Q-PWA-001 造字圖是否預快取
- 關聯：REQ-PWA-007、011
- 問題：§5 第二層只列 `heart-sutra.ast.json`、`lexicon.dfb.json`，沒列 `data/gaiji/*.png`（目前 2 張，共約 0.5KB）。不預快取的話，離線時沒開過的名相抽屜，造字會顯示破圖。
- 選項：
  - A（建議）：一併預快取 `data/gaiji/` 全部 PNG，歸入第二層。
  - B：不預快取，只在連線時看過後由執行期快取保存。
- 回覆：A（2026-10-20）

### Q-PWA-002 第三層（擴充經典／辭典）現在要不要做
- 關聯：REQ-PWA-008
- 問題：§5 第三層是為「未來」擴充內容設的 StaleWhileRevalidate，但目前沒有任何擴充經典或辭典檔。
- 選項：
  - A（建議）：現在就設定執行期快取規則：同源 `/data/` 下、不在預快取清單的檔案，首次請求時抓取並存入獨立的 CacheStorage（StaleWhileRevalidate）；驗收時以測試用的額外檔案驗證「首次連線取得後，離線仍可讀到」。
  - B：延後到真的新增擴充內容時再做，本單元不登錄。
- 回覆：A（2026-10-20）

### Q-PWA-003 「開啟任一名相抽屜」的測試範圍
- 關聯：REQ-PWA-011
- 問題：§8.3「開啟任一名相抽屜」可讀成「隨便挑一個能開」或「每一個都能開」。
- 選項：
  - A（建議）：離線時逐一開啟經文中每個帶 `lex` 的名相（同一詞條只測一次），以及至少一個轉引連結；含造字的條目須確認圖片載入。
  - B：抽測數個（含一個多義項、一個含造字的條目）。
- 回覆：A（2026-10-20）

### Q-PWA-004 「可安裝」怎麼驗證
- 關聯：REQ-PWA-004
- 問題：Playwright 無法實際觸發「加到主畫面」，Chromium 的 `beforeinstallprompt` 在自動化環境也不穩定。
- 選項：
  - A（建議）：自動化檢查安裝條件（manifest 欄位、圖示實際尺寸、service worker 控制頁面）；另在實機安裝一次，記錄於 `review/pwa-manual-checks.md`（與 reader 延後的 60fps、IAST 實機檢查同一次進行）。
  - B：只做自動化檢查。
- 回覆：A（2026-10-20）

### Q-PWA-005 新版本的更新方式與提示
- 關聯：REQ-PWA-009
- 問題：規格沒寫部署新版後 App 怎麼更新、要不要提示。目前設定（`registerType: 'autoUpdate'`）會在新版就緒時自動重新整理頁面，閱讀中可能被打斷（進度有存 Dexie，但抽屜、捲動位置會跳）。Zen Mode 也不宜有額外介面。
- 選項：
  - A（建議）：背景下載新版，下次開啟 App 時才生效；閱讀中不重新整理、不顯示任何提示（包括「已可離線使用」）。
  - B：新版就緒時顯示一行提示與「重新載入」膠囊，由使用者決定。
  - C：維持現狀，自動重新整理。
- 回覆：A（2026-10-20）

### Q-PWA-006 圖示設計
- 關聯：REQ-PWA-002、003
- 問題：§5 只指定檔名與尺寸，沒有圖示設計；`public/favicon.svg`、`icons.svg` 還是 Vite 範本。
- 選項：
  - A（建議）：以打包的 Noto Serif TC 寫一個「心」字，淺灰白色、置於 stone-950（`#0c0a09`）底上，字落在 maskable 安全區內；無彩色（§6.5 琥珀色只用於音標與高亮）。由建置腳本從字型產生 192、512 PNG 與 favicon.svg，並加一張 180×180 `apple-touch-icon`（iOS 主畫面用）；刪除 `icons.svg`。
  - B：同 A，但不加 `apple-touch-icon`（嚴守 §5 的兩個圖示）。
  - C：使用者提供圖檔。
- 回覆：A（2026-10-20）

### Q-PWA-007 manifest 的 `lang`
- 關聯：REQ-PWA-001
- 問題：§5 的 manifest 沒有 `lang`，但 vite-plugin-pwa 預設會自動加上 `"lang": "en"`（已在目前建置產物中看到），與 App 實際語言（`index.html` 為 `zh-Hant`）不符。
- 選項：
  - A（建議）：明確設為 `zh-Hant`。
  - B：不輸出 `lang` 欄位。
- 回覆：A（2026-10-20）

### Q-PWA-008 凍結測試的時序競態（實作期間發現）
- 關聯：REQ-PWA-005；`tests/acceptance/pwa/helpers.ts` 的 `waitForController`
- 問題：首次安裝時 `clients.claim()` 在 activate 事件中執行，頁面開始受控的瞬間 service worker 可能仍是 `activating`；測試在受控當下即斷言 `activated`，偶發失敗（34 個測試中 1 個）。規格只要求「頁面受控、不需重新開啟」，任何實作都無法避開這個中間態。
- 選項：
  - A（建議）：`waitForController` 在受控後再等狀態離開 `activating`（同一個 20 秒期限），預期值 `activated` 不變；重新凍結。
  - B：不改測試。
- 回覆：A（2026-10-20）

### Q-PWA-009 實機安裝紀錄未填（spec-gate 第 1 輪 FAIL，Major）
- 關聯：REQ-PWA-004
- 問題：`review/pwa-manual-checks.md` 的實機安裝尚未進行（狀態「待確認」、結果與確認人空白）；凍結測試只檢查檔案含「standalone」「主畫面」，空白範本即可通過。
- 選項：
  - A（建議）：加嚴測試（狀態非待確認、結果與確認人已填）並重新凍結；現在進行實機檢查（安裝、60fps、IAST 同一次）。
  - B：加嚴測試，實機延後（測試維持 FAIL）。
  - C：測試不改，實機延後，列為未決事項。
- 回覆：C（2026-10-20）

### Q-PWA-010 manifest 的 `scope`（spec-gate 第 1 輪遺漏掃描）
- 關聯：REQ-PWA-001
- 問題：vite-plugin-pwa 自動輸出 `"scope": "/"`，§5 的 manifest 沒有此欄位；省略時瀏覽器由 `start_url` 推得相同的 `/`，行為無差異。
- 選項：
  - A（建議）：保留，於 REQ-PWA-001 註明允許。
  - B：移除。
- 回覆：A（2026-10-20）
