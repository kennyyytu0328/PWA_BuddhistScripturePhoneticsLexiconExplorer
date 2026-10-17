# 實作計畫 — data 單元

> 需求內容以 `requirements.md` 為準，本檔只寫執行索引與技術介面（非規格）。

## 已完成

- **T0 腳手架**（REQ-DAT-001）：Vite react-ts 範本 + 依賴套件；`pnpm build` 可通過。

## 技術介面（驗收測試與實作共用）

### `scripts/build-data.ts`

```ts
export interface BuildOptions {
  sutra?: string     // 預設 data/heart-sutra.json
  iast?: string      // 預設 data/iast.json
  lock?: string      // 預設 data/readings.lock.json
  dfb?: string       // 預設 data-sources/dfb/dingfubao.dila.tei.p5.xml/dingfubao.xml
  gaijiDir?: string  // 預設 data-sources/dfb/dingfubao.dila.tei.p5.xml/gaiji
  cbeta?: string     // 預設 data-sources/cbeta/T08n0251.txt
  out?: string       // 預設 public/data
}
export interface BuildResult {
  ok: boolean
  errors: string[]   // 驗證失敗訊息；ok=false 時至少一則
  warnings: string[] // 例：審閱旗標為 false
}
export function buildData(options?: BuildOptions): Promise<BuildResult>
```

- 路徑相對於目前工作目錄（repo 根目錄）。
- `ok=false` 時，`out` 目錄不得新增或改寫任何檔案。
- 直接執行（`pnpm build:data`，可帶 `--sutra <path>` 等同名 kebab-case 參數，如 `--gaiji-dir`）：成功 exit 0；失敗把 `errors` 逐行寫到 stderr 並 exit 1；`warnings` 以 `WARN ` 開頭寫到 stderr。
- 產物：`<out>/heart-sutra.ast.json`、`<out>/lexicon.dfb.json`、`<out>/gaiji/<ID>.png`。
- CBETA 檔：以 `#` 開頭的行為說明，比對時略去。

### `scripts/lib/zhuyin.ts`

```ts
export function toZhuyin(syllable: string): string  // 單一帶調號拼音音節 → 注音，例 'rě' → 'ㄖㄜˇ'
```

### `scripts/check-review.ts`（正式建置閘門）

```ts
export function checkReview(options?: { sutra?: string; iast?: string }): Promise<{ ok: boolean; errors: string[] }>
```

- 直接執行：任一旗標為 false 時 exit 1。`package.json` 的 `build` 需在 `vite build` 之前執行它。

### 測試

- 驗收測試：`tests/acceptance/data/`（Vitest，node 環境，逾時 120 秒）。
- 失敗情境以暫存目錄中的修改版輸入檔（fixture）呼叫 `buildData`，不得修改 `data/` 下的真實檔案。

## 任務

| Task | REQ | 規格 | 目標檔 |
|---|---|---|---|
| T1 經文與 IAST 驗證、CBETA 比對 | 005–008、017 | CLAUDE.md §3.3、§3.4-4 | `scripts/build-data.ts`、`scripts/lib/validate*.ts` |
| T2 DFB 抽取、轉引、造字 | 003、004、009–012、018 | CLAUDE.md §3.1、§3.4-1/2、§4-1 | `scripts/lib/dfb.ts` |
| T3 音標（拼音、注音、lock、IAST） | 002、013–016、019 | CLAUDE.md §3.4-3/4、§3.5 | `scripts/lib/phonetics.ts`、`scripts/lib/zhuyin.ts` |
| T4 發佈閘門與覆蓋率 | 020、021 | CLAUDE.md §8 | `scripts/check-review.ts`、`package.json`、`vitest.config.ts` |
