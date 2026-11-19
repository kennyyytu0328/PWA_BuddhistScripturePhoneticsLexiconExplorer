# 原音隨誦時間碼審閱（review.voice）

- 日期：2026-11-19
- 對象：`data/voice-timings.json`（逐字起始時間，由 `pnpm make:voice` 依 `data-sources/voice/sutra_speech.srt` 產生，咒語起始時間另見 `data-sources/voice/mantra-override.json`）
- 方式：使用者在 GitHub Pages 正式站（commit f5fea6b）以「聲」模式試聽全經，看光標是否落在正在唸的字上。
- 結果：通過。使用者回報原音隨誦「效果很好」，時間碼未調整。

## 備註

- `review.voice` 在試聽前（2026-11-19，commit「chore: mark voice timings as reviewed」）就已設為 `true`，這樣才能經由 `main` 部署到 Pages 試聽；本次試聽補上這份紀錄。
- 本紀錄沒有寫使用的裝置與瀏覽器。
- 之後若重新產生錄音或時間碼，須重新試聽，並將 `review.voice` 改回 `false`，直到試聽完成。
