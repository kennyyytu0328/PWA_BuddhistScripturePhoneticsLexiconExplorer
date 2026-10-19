# reader 單元人工驗收紀錄

> 自動化測試無法涵蓋的驗收項目（REQ-RDR-007 截圖確認、REQ-RDR-027 捲動 60fps；Q-RDR-011、Q-RDR-013）。

## REQ-RDR-007 直排標點（截圖人工確認）

- 日期：2026-10-19
- 條件：正式建置（`pnpm build` 後 `vite preview`），Playwright Chromium Pixel 7 viewport、deviceScaleFactor 4、無音標模式。
- 截圖：五種標點（，。；！：）各取經文中第一次出現處，連同前後字。
- 結果：五種標點皆在前一字下方、同一直行，字形位於字格右上偏中（簡體中文直排字形，Q-RDR-019），未出現在直行行首。
- 確認人：使用者（2026-10-19，檢視 5 張特寫截圖後確認）

## REQ-RDR-027 捲動 60fps（實機）

- 狀態：延後（Q-RDR-030，2026-10-19 使用者決議）——待 `pwa` 單元完成、App 可安裝後於實機確認
- 步驟：手機安裝或開啟正式建置版，於經摺間左右滑動翻頁、開關名相抽屜與白話參考面板；Chrome DevTools 遠端偵錯 Performance 面板錄製，或開啟「顯示 FPS 計數器」。
- 判定：翻頁與抽屜轉場期間無明顯掉格（維持約 60fps）。
- 裝置／瀏覽器：
- 結果：
- 確認人：

## IAST 音標不重疊（實機，code review L9）

- 狀態：待確認，與 REQ-RDR-027 同時於實機進行
- 原因：拉丁字寬以 10px Noto Sans 估算（`src/lib/rubyLayout.ts`）；IAST 變音字母不在子集內，會退回系統字型（Q-RDR-016），字寬可能與估值不同。自動化測試（`ruby-fit.spec.ts`）只在 Playwright Chromium 驗證。
- 步驟：切到梵文（IAST）模式，逐頁檢視所有帶 IAST 的名相與咒語。
- 判定：相鄰 token 的音標不重疊、不超出該 token 的格長。
- 裝置／瀏覽器：
- 結果：
- 確認人：
