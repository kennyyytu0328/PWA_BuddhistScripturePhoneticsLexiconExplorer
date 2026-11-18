# 隨誦光標 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 讀者按「誦」後，光標依每分鐘 60／100／150 字的節拍逐字前進，已誦字轉亮、當前字左側有琥珀細線、頁尾自動翻頁、頂緣 1px 進度線。

**Architecture:** 純函式 `lib/followAlong.ts` 把經文攤平成逐字時間軸；`useFollowAlong` 以單次 `setTimeout` 鏈推進游標；`SutraViewport` 依游標把逐字狀態（`data-follow`）傳給 memo 過的 `SutraPage`，並在游標換頁時以「瞬間捲動＋WAAPI 位移回原位」翻頁；`Reader` 負責暫停時機。

**Tech Stack:** React 19、TypeScript、Dexie、Vitest + Testing Library + fake-indexeddb、Playwright（`page.clock`）。

**Spec:** `docs/superpowers/specs/2026-11-17-follow-along-design.md`（設計）；Task 1 寫入的 `docs/spec/reader/requirements.md` REQ-RDR-032～037（驗收依據）。

## Global Constraints

- 只用 `setTimeout`，不用 `requestAnimationFrame` 迴圈；不加背景動畫、`text-shadow`、`box-shadow`。
- 所有 CSS transition／WAAPI 動畫用 `var(--ease-zen)`（`cubic-bezier(0.19, 1, 0.22, 1)`，REQ-RDR-026）；`prefers-reduced-motion: reduce` 時翻頁瞬間完成。
- 狀態切換不得移動任何元素（CLS = 0，REQ-RDR-027）：標記用絕對定位的 `::after`，不加 border／padding。
- 不改音標膠囊位置（REQ-RDR-009 置中）；不改既有凍結測試，除 Task 2 列出的 `device.spec.ts` 一處。
- 介面字只用 stone 灰階與 amber-500；琥珀只用於 `<rt>`、名相高亮、隨誦當前字標記。
- 不留 `console.log`；錯誤以 `console.error` 記錄（沿用 `lib/db.ts`）。
- 開發中只跑受影響的測試檔；Task 8 才跑全套。

## Review Focus

1. **播放中改速度**：下一拍起用新速度，且不會同時存在兩個計時器（游標一拍只進一格）→ Task 4 測試 `pace change applies from the next beat with a single timer`。
2. **連點誦／停**：快速 play→pause→play 不會堆疊計時器 → Task 4 `rapid toggling never advances more than once per beat`。
3. **從還原的閱讀進度開啟**（例如開在 s4）按誦 → 從 s4 第一字開始，而非 s1 → Task 4 `play from a restored page starts at that page`、Task 2 驗收測試。
4. **播放中切換音標模式** → 游標與 `data-follow` 保持不變 → Task 5 `phonetic mode switch keeps follow states`。
5. **自動翻頁動畫進行中點開名相** → 立即暫停，翻頁仍停靠對齊 → Task 7 `opening a term mid-turn pauses and the page still aligns`（Playwright）。

---

### Task 1: 規格登錄（維護模式）

主迴圈 inline 撰寫（使用者可見的決議，不派發）。

**Files:**
- Modify: `CLAUDE.md`（§1 核心體驗、§6.4、§6.5「介面無彩色」一句）
- Modify: `docs/spec/reader/open-questions.md`（新增 Q-RDR-049）
- Modify: `docs/spec/reader/requirements.md`（新增「隨誦」一節 REQ-RDR-032～037；修改 REQ-RDR-020、021；檔頭狀態行加一句 2026-11-17 依 Q-RDR-049 新增）

**Interfaces:**
- Produces: REQ 文字是 Task 2 盲寫測試的唯一依據；testid `follow-toggle`、`follow-pace`、`follow-progress`；屬性 `data-follow="read|current|ahead"`；IndexedDB `sutraflow/prefs` 鍵 `followPace`。

- [ ] **Step 1: CLAUDE.md**：§1 加一條「隨誦光標」（2026-11-17 定案），內容即設計文件「行為」一節加「我的判斷」1–6；§6.5「介面無彩色」句末加「及隨誦當前字標記」；§6.4 加一行「膠囊右側另有隨誦速度與播放鍵（見 §1）」。
- [ ] **Step 2: Q-RDR-049**：格式比照 Q-RDR-042；選項列 A（按鈕控制）、B（加點字跳位）；回覆「A（2026-11-17）」，並列出設計文件「我的判斷」1–7 為隨附決議。
- [ ] **Step 3: REQ-RDR-032～037**，每條含 來源（Q-RDR-049）、類型、Given/When/Then 驗收、狀態「確認」。驗收須寫入下列確切值：
  - **032 隨誦控制鍵**：`button[data-testid="follow-pace"]`、`button[data-testid="follow-toggle"]`，`position: fixed`，下緣與 `phonetic-toggle` 同高（±1px），`follow-toggle` 右緣距視窗右緣 16px（±1px），`follow-pace` 在其左側間距 8px；兩者 44×44、`border-radius` full、背景 stone-900 80%、backdrop blur、邊框同音標膠囊、Noto Sans TC 字重 300–400；360×640 與 Pixel 7 下不與 `phonetic-toggle`、`vernacular-toggle`、`swipe-hint` 重疊。`follow-toggle` 文字未播放「誦」、播放中「停」，`aria-pressed` 為 `false`／`true`，`aria-label` 為「開始隨誦」／「暫停隨誦」。`follow-pace` 文字「慢」「中」「快」對應每分鐘 60、100、150 字，點擊依 中→快→慢→中 輪替，`aria-label`「隨誦速度：每分鐘 N 字」；值存於 `followPace`（字串 `"60"`／`"100"`／`"150"`），無紀錄或無效值時為 100；播放中改速度自下一拍生效。
  - **033 節拍與配色**：每字停留 60000／N 毫秒；字後緊接「，」「：」者加 1 拍，緊接「。」「；」「！」者加 2 拍。隨誦進行中（含暫停）每個 `.cell` 帶 `data-follow`：游標前為 `read`、游標所在為 `current`、之後為 `ahead`；標點的顏色同其前一字（`ahead` 或非 `ahead`）。`ahead` 字色 stone-400（`#a8a29e`），`read`／`current` 字色 stone-200（`#e7e5e4`）；`current` 的 `::after` 為 1px 寬 amber-500 直線，位於字的左側、長度等於該格長度，不與 `<rt>` 重疊；`color` transition ≤ 0.3s、zen 緩動；狀態變化前後所有 `.cell` 的 bounding box 不變。未開始或已結束時沒有任何 `data-follow`，顏色同現行。
  - **034 自動翻頁**：游標進到下一頁第一字時，經摺翻到該頁，停靠後該頁右緣 = 視窗右緣 ±1.5px；翻頁動畫 1.2 秒內完成、zen 緩動；`prefers-reduced-motion: reduce` 時 100ms 內對齊。翻頁照常寫入閱讀進度，不造成暫停。
  - **035 暫停與續誦**：播放中下列任一發生即暫停：點 `follow-toggle`；開啟名相抽屜；開啟白話參考；使用者滑動且停靠在游標所在頁以外的頁；`document.visibilityState` 變為 `hidden`。暫停保留 `data-follow` 與進度線；關閉抽屜不自動續誦。按「誦」時：所見頁為游標所在頁 → 從游標續誦；否則游標移到所見頁第一字；所見為封面 → 翻到 s1 並從其第一字開始。點擊一般字（非名相）不影響隨誦。
  - **036 進度線**：`[data-testid="follow-progress"]`，`position: fixed`、上緣 = `env(safe-area-inset-top)`、高 1px、背景 stone-400、`aria-hidden="true"`、`pointer-events: none`；右端貼齊視窗右緣，寬度 = 視窗寬 ×（游標序號 + 1）／ 260（±2px，transition 結束後量）；只在隨誦進行中（含暫停）存在。
  - **037 誦畢**：最後一字「訶」的拍數走完後結束：`follow-toggle` 回到「誦」、`aria-pressed="false"`，所有 `data-follow` 與 `follow-progress` 移除，畫面停在 s9。再按「誦」從 s9 第一字開始。
- [ ] **Step 4: 修改 REQ-RDR-020**（按鈕清單加入 `follow-pace`、`follow-toggle`）與 **REQ-RDR-021**（琥珀可出現處加「隨誦當前字標記（REQ-RDR-033）」），各註明「2026-11-17 依 Q-RDR-049 修改」。
- [ ] **Step 5: 檢查格式**：Run `node ~/.claude/skills/spec-gate/scripts/trace-check.mjs --unit reader`。Expected：無格式錯誤；回報 REQ-RDR-032～037 尚無測試（Task 2 補）。
- [ ] **Step 6: Commit** `docs: register follow-along requirements (Q-RDR-049)`

---

### Task 2: 盲寫驗收測試並凍結

派發獨立 subagent（`model: "sonnet"`），**只給** REQ-RDR-020、021、032～037 全文、`tests/acceptance/reader/helpers.ts`、`page-helpers.ts`、`device.spec.ts`；不給設計文件與實作計畫的其他 Task。

**Files:**
- Create: `tests/acceptance/reader/follow-along.spec.ts`
- Modify: `tests/acceptance/reader/device.spec.ts:70`（清單改為 `['follow-pace', 'follow-toggle', 'lex-token', 'phonetic-toggle', 'vernacular-toggle']`）
- Modify: `docs/spec/reader/frozen-tests.json`（由 freeze 指令更新）

**Interfaces:**
- Consumes: Task 1 的 REQ；helpers `gotoReader`、`gotoCover`、`swipeToNextPage`、`openLexicon`、`openVernacular`、`closeOverlay`、`pageRight`、`colorOf`、`styleOf`、`viewportSize`。

- [ ] **Step 1: 寫測試**：每個測試標題以 `[REQ-RDR-0xx]` 開頭；每條 REQ 至少一項。計時用 `page.clock.install()`（在 `goto` 之前）與 `page.clock.runFor(ms)`；翻頁動畫是 WAAPI，不受 clock 控制，以 `expect.poll` 等待對齊。至少涵蓋：中速下 s1 第一字經 600ms 變 `read`；「，」前一字多停 600ms；從封面按誦翻到 s1；開在 s4 按誦從 s4 開始（用 `gotoCoverWithPeek(page, { progress: 's4' })` 或等效還原）；名相抽屜開啟即暫停；手動滑到別頁暫停後按誦從該頁開始；`visibilityState` 為 hidden 暫停；`followPace` 保存與無效值；誦畢（以 `runFor` 快轉全經，150 字／分約 2 分鐘）；進度線寬度；狀態切換前後 `.cell` bounding box 相同；`prefers-reduced-motion` 翻頁 100ms 內對齊。
- [ ] **Step 2: 確認 RED**：Run `pnpm exec playwright test tests/acceptance/reader/follow-along.spec.ts tests/acceptance/reader/device.spec.ts`。Expected：follow-along 全部 FAIL（找不到 `follow-toggle`）；device 只有 REQ-RDR-020 清單那項 FAIL，原因為缺少新按鈕。
- [ ] **Step 3: 凍結**：Run `node ~/.claude/skills/spec-gate/scripts/trace-check.mjs --unit reader --freeze tests/acceptance/reader/follow-along.spec.ts tests/acceptance/reader/device.spec.ts`。Expected：只有這兩個檔案的 hash 變動。
- [ ] **Step 4: Commit** `test: add follow-along acceptance tests (REQ-RDR-032..037)`

---

### Task 3: 時間軸（純函式）

**Files:**
- Create: `src/lib/followAlong.ts`
- Test: `src/lib/followAlong.test.ts`

**Interfaces:**
- Consumes: `Segment`、`isPunct`（`src/lib/types.ts`）；`COVER_PAGE`（`src/lib/cover.ts`）。
- Produces:
  ```ts
  export const PACES = [60, 100, 150] as const
  export type Pace = (typeof PACES)[number]
  export const DEFAULT_PACE: Pace = 100
  export const PACE_LABEL: Record<Pace, string> // { 60: '慢', 100: '中', 150: '快' }
  export const nextPace: (pace: Pace) => Pace    // 100→150→60→100
  export const isPace: (value: string | null) => boolean
  export interface FollowStep { segmentId: string; beats: number }
  export interface Timeline { steps: FollowStep[]; startOf: Record<string, number>; countOf: Record<string, number> }
  export function buildTimeline(segments: Segment[]): Timeline
  export const beatMs = (pace: Pace): number => 60000 / pace
  export type FollowMark = 'read' | 'current' | 'ahead'
  export function followMark(localIndex: number, cursorLocal: number): FollowMark
  /** cursor 換算成某頁的頁內位置，夾在 [-1, countOf[id]]，讓遠離游標的頁 props 不變。 */
  export function localCursor(timeline: Timeline, segmentId: string, cursor: number): number
  /** 按「誦」的起點：visible 為 COVER_PAGE 時回傳 0。 */
  export function startIndex(timeline: Timeline, visible: string, cursor: number | null): number
  ```

- [ ] **Step 1: 寫失敗測試**（用 `public/data/heart-sutra.ast.json` 實際資料，載入方式比照 `src/lib/loadData.test.ts`）：
  - `buildTimeline` → `steps.length === 260`、`startOf.s1 === 0`、`Object.values(countOf)` 加總 260。
  - 拍數：某字後接「，」→ `beats === 2`；接「。」→ `3`；接「：」→ `2`；接「；」「！」→ `3`；無標點 → `1`。以 s1 的實際 token 找出對應字斷言。
  - `nextPace(100) === 150`、`nextPace(150) === 60`、`nextPace(60) === 100`；`isPace('100') === true`、`isPace('80') === false`、`isPace(null) === false`。
  - `followMark(2, 3) === 'read'`、`followMark(3, 3) === 'current'`、`followMark(4, 3) === 'ahead'`。
  - `localCursor`：游標在 s3 時，s1 得 `countOf.s1`、s5 得 `-1`、s3 得頁內位置。
  - `startIndex`：`(tl, COVER_PAGE, null) === 0`；`(tl, 's4', null) === startOf.s4`；游標在 s4 中段且 visible 為 s4 → 回傳游標；visible 為 s2 → `startOf.s2`。
- [ ] **Step 2: Run** `pnpm vitest run src/lib/followAlong.test.ts` — Expected: FAIL（模組不存在）。
- [ ] **Step 3: 實作** `src/lib/followAlong.ts`。拍數規則：`PAUSE_BEATS = { '，': 1, '：': 1, '。': 2, '；': 2, '！': 2 }`，加到標點前一個字的 step 上；其他標點 0。
- [ ] **Step 4: Run** 同上 — Expected: PASS。
- [ ] **Step 5: Commit** `feat: add follow-along timeline`

---

### Task 4: 速度偏好與推進 hook

**Files:**
- Create: `src/hooks/useFollowPace.ts`、`src/hooks/useFollowAlong.ts`
- Test: `src/hooks/useFollowPace.test.ts`、`src/hooks/useFollowAlong.test.ts`

**Interfaces:**
- Consumes: Task 3 全部；`readPref`／`writePref`。
- Produces:
  ```ts
  // pace 為 null 直到讀完 IndexedDB（同 usePhoneticMode）；鍵 'followPace'
  export function useFollowPace(): { pace: Pace | null; cycle: () => void }
  export function useFollowAlong(timeline: Timeline, pace: Pace): {
    cursor: number | null
    playing: boolean
    play: (visible: string) => void   // visible = 所見頁 segment id 或 COVER_PAGE
    pause: () => void
  }
  ```

- [ ] **Step 1: 寫 `useFollowPace` 失敗測試**（比照 `usePhoneticMode.test.ts`）：載入中為 null 後預設 100；還原 `'60'`；無效值 `'80'` → 100；`cycle` 後為 150 並寫入 `'150'`。
- [ ] **Step 2: 寫 `useFollowAlong` 失敗測試**（`vi.useFakeTimers()`，用 Task 3 的真實 timeline）：
  - `play(COVER_PAGE)` → `cursor === 0`、`playing === true`；`advanceTimersByTime(beatMs(100) * steps[0].beats)` 後 `cursor === 1`。
  - `pause` 後再過 10 拍游標不變；`play` 同頁續誦從原游標。
  - `play from a restored page starts at that page`：`play('s4')` → `cursor === startOf.s4`。
  - `pace change applies from the next beat with a single timer`：播放中 rerender 為 150，之後恰好每 `beatMs(150) * beats` 進一格。
  - `rapid toggling never advances more than once per beat`：同一拍內 play/pause/play 三次，經過一拍只進一格。
  - 最後一字拍數走完 → `cursor === null`、`playing === false`。
  - `document.visibilityState` 改為 `'hidden'` 並派發 `visibilitychange` → `playing === false`。
  - unmount 後 `vi.getTimerCount() === 0`。
- [ ] **Step 3: Run** `pnpm vitest run src/hooks/useFollowPace.test.ts src/hooks/useFollowAlong.test.ts` — Expected: FAIL。
- [ ] **Step 4: 實作**。`useFollowAlong`：state `{ cursor, playing }`；一個 `useEffect([playing, cursor, pace])` 在 `playing && cursor !== null` 時排一個 `setTimeout(beatMs(pace) * steps[cursor].beats)`，cleanup 清除；到最後一格時改為結束狀態。`play` 用 `startIndex`。
- [ ] **Step 5: Run** 同上 — Expected: PASS。
- [ ] **Step 6: Commit** `feat: add follow-along pace and cursor hooks`

---

### Task 5: 逐字狀態呈現

**Files:**
- Modify: `src/components/SutraPage.tsx`、`src/components/Token.tsx`、`src/index.css`
- Test: `src/components/Token.test.tsx`（擴充）、新增 `src/components/SutraPage.test.tsx`

**Interfaces:**
- Consumes: `followMark`（Task 3）。
- Produces:
  - `SutraPage` 新 prop `followAt: number | null`（頁內游標；null = 未隨誦），以 `React.memo` 包裝。
  - `Token` 新 props `followFrom: number`（此 token 第一字的頁內序號；標點傳前一字序號）、`followAt: number | null`。每個 `.cell` 帶 `data-follow`；標點 `<span class="punct">` 帶 `data-follow`（前一字為 `ahead` 則 `ahead`，否則 `read`）。`followAt === null` 時不輸出屬性。

- [ ] **Step 1: 寫失敗測試**：
  - `SutraPage` 以 s1、`followAt={2}` 渲染 → 前兩個 `.cell` 為 `read`、第三個 `current`、其餘 `ahead`；`followAt={null}` → 沒有任何 `[data-follow]`。
  - IAST 模式（`.cell-group` 內）每字仍各有 `.cell[data-follow]`。
  - 標點：s1 第一個「，」在其前一字為 `current` 時為 `read`、為 `ahead` 時為 `ahead`。
  - `phonetic mode switch keeps follow states`：同一 `followAt` 下由 zhuyin rerender 為 pinyin，`data-follow` 序列不變。
- [ ] **Step 2: Run** `pnpm vitest run src/components/SutraPage.test.tsx src/components/Token.test.tsx` — Expected: FAIL。
- [ ] **Step 3: 實作**。CSS（加在 `.cell` 規則之後）：
  - `.cell, .punct { transition: color 0.3s var(--ease-zen); }`
  - `[data-follow='ahead'] { color: var(--color-stone-400); }`（`read`／`current` 沿用繼承的 stone-200）
  - `.cell[data-follow='current']::after`：`position: absolute; top: 0; bottom: 0; right: 100%; margin-right: 2px; width: 1px; background: var(--color-amber-500); content: ''`。
  - `<rt>` 顏色不得被 `ahead` 改到（`rt` 已有自己的 `color`，確認不被覆寫）。
- [ ] **Step 4: Run** 同上 — Expected: PASS；再跑 `pnpm vitest run src/components` 確認既有元件測試照過。
- [ ] **Step 5: Commit** `feat: render follow-along character states`

---

### Task 6: 自動翻頁

**Files:**
- Create: `src/lib/motion.ts`（從 `useCoverPeek.ts` 移出 `prefersReducedMotion`、`zenEasing`，`useCoverPeek` 改為 import）
- Create: `src/lib/pageTurn.ts`
- Modify: `src/components/SutraViewport.tsx`
- Test: `src/lib/pageTurn.test.ts`、`src/components/SutraViewport.test.tsx`（擴充）

**Interfaces:**
- Consumes: `localCursor`、`Timeline`（Task 3）。
- Produces:
  ```ts
  // lib/motion.ts
  export const prefersReducedMotion: () => boolean
  export const zenEasing: () => string
  // lib/pageTurn.ts — 瞬間捲到 target，再讓各頁 translateX 從位移量動畫回 0（700ms、zen）；reduced motion 只捲動
  export function turnToPage(container: HTMLElement, target: HTMLElement): Animation[]
  // SutraViewport 新 props
  follow?: { timeline: Timeline; cursor: number } | null   // 決定各頁 followAt
  followSegment?: string | null   // 播放中游標所在頁；改變且不同於所見頁時呼叫 turnToPage
  onPageChange?: (segmentId: string, source: 'user' | 'auto') => void   // 簽名擴充
  ```

- [ ] **Step 1: 寫失敗測試**：
  - `pageTurn.test.ts`（jsdom，mock `scrollIntoView` 與 `Element.prototype.animate`）：一般情況呼叫 `scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'instant' })` 一次，並對每個子元素 `animate`，keyframes 終點 `translateX(0)`、`duration: 700`、easing 為 zen；`matchMedia('(prefers-reduced-motion: reduce)')` 為 true 時只捲動、不 `animate`。
  - `SutraViewport.test.tsx`：`followSegment` 由 null 改為 `'s2'` → `turnToPage` 被呼叫一次（`vi.mock('../lib/pageTurn')`）；之後 `scrollend` 停靠在 s2 → `onPageChange('s2', 'auto')`；沒有 `followSegment` 變化時的停靠 → `source === 'user'`。
  - `follow={{ timeline, cursor: startOf.s3 + 1 }}` → s3 頁有一個 `current`，s1 全為 `read`，s5 全為 `ahead`。
- [ ] **Step 2: Run** `pnpm vitest run src/lib/pageTurn.test.ts src/components/SutraViewport.test.tsx src/hooks/useCoverPeek.test.ts` — Expected: 新測試 FAIL，`useCoverPeek` 照過。
- [ ] **Step 3: 實作**。`SutraViewport` 以 ref `autoTarget` 記錄程式翻頁的目標；`settle` 時 `id === autoTarget.current` 則 source 為 `'auto'` 並清除。位移量 = 捲動前後 target 的 `getBoundingClientRect().left` 差。
- [ ] **Step 4: Run** 同上 — Expected: PASS。
- [ ] **Step 5: Commit** `feat: turn pages automatically while following along`

---

### Task 7: 控制鍵、進度線與 Reader 串接

**Files:**
- Create: `src/components/FollowControls.tsx`、`src/components/FollowProgress.tsx`
- Modify: `src/components/Reader.tsx`、`src/index.css`
- Test: `src/components/FollowControls.test.tsx`、`src/components/FollowProgress.test.tsx`、`src/App.test.tsx`（擴充）

**Interfaces:**
- Consumes: Task 3–6 全部。
- Produces:
  ```ts
  FollowControls({ playing, pace, onToggle, onCyclePace }: { playing: boolean; pace: Pace; onToggle(): void; onCyclePace(): void })
  FollowProgress({ fraction }: { fraction: number })   // 0 < fraction ≤ 1
  ```

- [ ] **Step 1: 寫失敗測試**：
  - `FollowControls`：文字與 `aria-label`／`aria-pressed` 依 REQ-RDR-032 的確切字串（「誦」「停」「開始隨誦」「暫停隨誦」「慢」「中」「快」「隨誦速度：每分鐘 100 字」）；點擊呼叫對應 callback。
  - `FollowProgress`：`data-testid="follow-progress"`、`aria-hidden="true"`、`style.transform === 'scaleX(0.5)'`（fraction 0.5）。
  - `App.test.tsx`：按「誦」後 `follow-toggle` 為「停」；點名相 → 回到「誦」（暫停）；按「白話參考」→ 暫停；暫停時 `follow-progress` 仍存在；Reader 在 `pace` 讀取完成前不渲染（同音標）。
- [ ] **Step 2: Run** `pnpm vitest run src/components/FollowControls.test.tsx src/components/FollowProgress.test.tsx src/App.test.tsx` — Expected: FAIL。
- [ ] **Step 3: 實作**。
  - `Reader`：`useMemo(() => buildTimeline(segments))`；state `visible`（初值 `progress.initial ?? COVER_PAGE`）；`onPageChange(id, source)` → `progress.save(id)`、`setVisible(id)`，`source === 'user'` 且播放中且 `id` 不是游標所在頁 → `pause()`；名相 `select` 與 `onOpenVernacular` 先 `pause()`；`followSegment = playing ? steps[cursor].segmentId : null`；`fraction = (cursor + 1) / steps.length`，`cursor === null` 時不渲染 `FollowProgress`。
  - CSS：`.follow-controls { position: fixed; z-index: 2; right: 1rem; bottom: calc(1.5rem + env(safe-area-inset-bottom)); display: flex; gap: 0.5rem; }`；按鈕 44×44、`border-radius: 9999px`，背景／邊框／blur 與 `.phonetic-toggle` 相同（抽出共用 class 或重複宣告皆可），`padding: 0`。`.follow-progress { position: fixed; z-index: 2; top: env(safe-area-inset-top); left: 0; right: 0; height: 1px; background: var(--color-stone-400); transform-origin: right; transition: transform 0.3s var(--ease-zen); pointer-events: none; }`。
- [ ] **Step 4: Run** 同上 — Expected: PASS。
- [ ] **Step 5: 字型子集**：Run `pnpm build:fonts`。Expected：無「缺字」錯誤；輸出的 sans 子集字數比先前多（含 誦 停 慢 中 快）。
- [ ] **Step 6: 驗收測試**：Run `pnpm build && pnpm exec playwright test tests/acceptance/reader/follow-along.spec.ts tests/acceptance/reader/device.spec.ts`。Expected：全部 PASS。
- [ ] **Step 7: 補 Review Focus 5**：新增非凍結 Playwright 檔 `tests/e2e/follow-along-edge.spec.ts`（`playwright.config.ts` 的 `testDir: 'tests'`、`testMatch: '**/*.spec.ts'` 會收到；import `../acceptance/reader/helpers`），測試 `opening a term mid-turn pauses and the page still aligns`：翻頁動畫開始後 100ms 內點名相 → `follow-toggle` 為「誦」，翻頁結束後目標頁右緣 = 視窗右緣 ±1.5px。Run `pnpm exec playwright test tests/e2e` — Expected: PASS。
- [ ] **Step 8: Commit** `feat: add follow-along controls and progress line`

---

### Task 8: 全套驗證與稽核

- [ ] **Step 1**: Run `pnpm build`、`pnpm exec playwright test tests/acceptance/reader`、`pnpm exec playwright test tests/acceptance/pwa`、`pnpm vitest run --coverage`。Expected：全部 PASS、無 skip；覆蓋率 lines ≥ 80%（回報實際數字）。特別確認 REQ-RDR-009、021、026、027、031 的既有測試照過。
- [ ] **Step 2**: Run `pnpm lint`。Expected：無錯誤；`git grep -n "console.log" src` 無結果。
- [ ] **Step 3**: 範圍稽核 `/spec-gate reader REQ-RDR-020 REQ-RDR-021 REQ-RDR-032 REQ-RDR-033 REQ-RDR-034 REQ-RDR-035 REQ-RDR-036 REQ-RDR-037`。Expected：全部 PASS；AMBIGUOUS 屬使用者可見者帶回給使用者裁決。
- [ ] **Step 4**: 整支分支最終審查（`model: "fable"`，依 dev-flow Step 5，先產生 diff 檔）。
- [ ] **Step 5**: 實機待辦寫入 `review/reader-manual-checks.md`：真機上翻頁動畫流暢度、當前字標記在注音／拼音／梵文三種模式下不壓到音標、iOS Safari 的 `visibilitychange` 暫停。
