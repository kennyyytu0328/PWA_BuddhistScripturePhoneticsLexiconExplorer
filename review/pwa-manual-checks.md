# pwa 單元人工驗收紀錄

> 自動化測試無法涵蓋的驗收項目（REQ-PWA-004；Q-PWA-004）。與 reader 單元延後的實機檢查（`review/reader-manual-checks.md` 的 REQ-RDR-027 捲動 60fps、IAST 音標不重疊）同一次進行。

## REQ-PWA-004 實機安裝

- 狀態：待確認
- 步驟：
  1. 手機以瀏覽器開啟正式建置版（`pnpm build` 後 `pnpm preview --host`，或部署後的 HTTPS 網址；Android Chrome 需 HTTPS 或 localhost 才可安裝）。
  2. 選單中「安裝應用程式」或「加到主畫面」。
  3. 從主畫面圖示開啟。
- 判定：
  - 主畫面圖示為 stone-950 底上的淺灰白「心」字，未被裁切（maskable 安全區）。
  - 以 standalone 開啟：沒有瀏覽器網址列與分頁列，背景與狀態列為 stone-950。
  - 開啟飛航模式後重新開啟 App，全經可完整呈現，可開啟名相抽屜。
- 裝置／瀏覽器：
- 結果：
- 確認人：
