# 名相線、結束隨誦、聽讀音 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mark tappable 名相 with a thin line, let a long-press on 誦/停 end the follow-along, and add a 「聽」 button to the lexicon drawer that plays the tapped term's slice of the sutra recording.

**Architecture:** The term line is CSS only (`.cell::before` inside `.lex-token`, same geometry as the follow-along mark). Ending adds `end()` to `useFollowAlong` and a `useLongPress` hook on the toggle button. Listening adds a clip driver (`startVoiceClip`) beside the existing `startVoiceClock`, sharing the one `VoicePlayer`; the clip range comes from the token's global character index and `voice-timings.json`.

**Tech Stack:** React 19 + TypeScript, Vite, vaul, zod, Vitest (jsdom), Playwright (Chromium).

**Spec:** `docs/superpowers/specs/2026-11-19-term-line-end-listen-design.md`; requirements REQ-RDR-041–043 in `docs/spec/reader/requirements.md` (written in Task 1).

## Global Constraints

- Existing REQs and frozen acceptance tests are not edited. `follow-toggle` keeps `aria-label`「開始隨誦」／「暫停隨誦」 exactly.
- No new control in the bottom row; nothing floats over the scripture; no `requestAnimationFrame` loop; no `timeupdate`-driven logic.
- Term line: `rgb(168 162 158 / 0.6)`, 1px wide, on `.cell::before` of every cell inside `button[data-testid="lex-token"]`; `right: 100%; margin-right: 2px` (same as `.cell[data-follow='current']::after`); the term's first cell starts 3px in, its last cell ends 3px short; out of flow (no `.cell` box changes). No transition or animation on it.
- Long-press: 600 ms on `follow-toggle`; only while the follow-along is in progress (`cursor !== null || playing`); ends it exactly like REQ-RDR-037 (IDLE) and stays on the visible page; vibrates 12 ms (`useHaptics`); the click that follows the release is swallowed. Hint: `aria-describedby` → hidden element with text 「長按結束隨誦」, present only while in progress.
- 聽: `button[data-testid="lexicon-listen"]` inside `[data-testid="lexicon-readings"]`, root entry only. Idle: text 「聽」, `aria-label="播放讀音"`, `aria-pressed="false"`. Playing: text 「停」, `aria-label="停止播放"`, `aria-pressed="true"`. 44×44, full round, 1px stone-400 border, transparent background, stone-200 text, Noto Sans TC.
- Clip range for a token whose first character has global index `i` (punctuation not counted) and `n` characters: `from = chars[i]`, `to = chars[i + n]`, or `duration` when `i + n` is past the last character.
- Playback failure (not loaded, `play()` rejected, `error`, external pause) = stop silently; no error UI.
- Data paths stay relative. Files written with LF; never run bare `npx prettier` (no repo config). No `console.log`.
- Branch `feat/term-line-end-listen` from `main`; commit per task; push/merge only on the user's instruction.

## Review Focus

1. Long-press, then lift: the release must not start the follow-along again. → Task 4 test `the click after a long press is swallowed`.
2. A touch long-press that the browser cancels (`pointercancel`) or that slides off the button: nothing ends, no stuck timer. → Task 4 test `pointercancel and pointerleave cancel the hold`.
3. 聽 tapped twice before `play()` resolves: the recording ends up paused, button back to 「聽」. → Task 5 test `toggling twice before play resolves leaves the player paused`.
4. Clip stopped (drawer closed), then 誦 in 聲 mode right away: a stale clip timer must not pause the follow-along's audio. → Task 5 test `after stop, a pending clip timer does nothing`.
5. The sutra's last term (ends at the last character): the clip runs to the end of the recording and the button returns to 「聽」 on `ended`. → Task 5 test `a clip to the end of the recording finishes on ended`.

---

### Task 1: Spec

**Files:** Modify `docs/spec/reader/requirements.md`, `docs/spec/reader/open-questions.md`.

- [ ] **Step 1:** Add Q-RDR-057 (the three items, options and decisions from the design doc, including 「我的判斷」 1–9) and REQ-RDR-041 名相線, REQ-RDR-042 長按結束隨誦, REQ-RDR-043 聽讀音, each with Given/When/Then acceptance using the values in Global Constraints. Update the status line at the top of `requirements.md`.
- [ ] **Step 2: Commit** `docs: add term line, follow-along end and listen spec (Q-RDR-057)` (with the design doc and this plan).

### Task 2: Acceptance tests (blind, frozen)

**Files:**
- Create: `tests/acceptance/reader/term-line.spec.ts`, `tests/acceptance/reader/follow-end.spec.ts`, `tests/acceptance/reader/lexicon-listen.spec.ts`
- Modify: `docs/spec/reader/frozen-tests.json` (freeze command only)

**Interfaces:**
- Consumes: REQ-RDR-041–043 text, existing helpers in `tests/acceptance/reader/` (`helpers.ts`, `page-helpers.ts`), and `follow-along.spec.ts` / `voice.spec.ts` as examples of clock and fake-media setup. Blind: the writer does not read `src/`.
- Produces: frozen tests the implementation must pass.

- [ ] **Step 1:** Dispatch a test-writer. Long-press is driven with `page.mouse.down()` / `up()` (and one touch-emulated case) plus `page.clock`; the recording uses the same fake `HTMLMediaElement` approach as `voice.spec.ts`; expectations read `public/data/voice-timings.json` and `public/data/heart-sutra.ast.json`.
- [ ] **Step 2:** `pnpm build`, run the three files; expected RED (no line, long-press does nothing, no 聽 button).
- [ ] **Step 3:** Freeze: `node ~/.claude/skills/spec-gate/scripts/trace-check.mjs --unit reader --freeze <the three files>`; trace-check PASS.
- [ ] **Step 4: Commit** `test: add term line, follow-end and listen acceptance tests (Q-RDR-057)`.

### Task 3: Term line

**Files:** Modify `src/index.css` (after the `.lex-token` rules).

- [ ] **Step 1:** `term-line.spec.ts` is RED.
- [ ] **Step 2:** Add the `::before` rules per Global Constraints. Structures to cover: 注音／拼音 `.lex-token > ruby.cell`; 無音標 and 梵文 without IAST `.lex-token > span.cell`; 梵文 with IAST `.lex-token > ruby.cell-group > span.cell` followed by one `<rt>` (so the last cell is `span.cell:last-of-type`, not `:last-child`).
- [ ] **Step 3:** `pnpm build`; GREEN: `npx playwright test tests/acceptance/reader/{term-line,follow-along,ruby-fit,hit-area,layout,visual,motion}.spec.ts`.
- [ ] **Step 4: Commit** `feat: mark tappable name terms with a thin line`.

### Task 4: End the follow-along by long-press

**Files:**
- Create: `src/hooks/useLongPress.ts`, `src/hooks/useLongPress.test.ts`
- Modify: `src/hooks/useFollowAlong.ts`, `src/hooks/useFollowAlong.test.ts`, `src/hooks/useFollowAlong.voice.test.ts`, `src/components/FollowControls.tsx`, `src/components/FollowControls.test.tsx`, `src/components/Reader.tsx`, `src/index.css` (`.follow-button`: `touch-action: manipulation; user-select: none; -webkit-touch-callout: none`)

**Interfaces:**
- Produces:
  - `useFollowAlong(...)` returns `{ cursor, playing, play, pause, end }`; `end(): void` sets the idle state (cursor null, not playing).
  - `export const LONG_PRESS_MS = 600` and `useLongPress(opts: { enabled: boolean; onLongPress: () => void; onClick: () => void }): Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'onPointerDown' | 'onPointerUp' | 'onPointerLeave' | 'onPointerCancel' | 'onClick' | 'onContextMenu'>` in `src/hooks/useLongPress.ts`. `enabled: false` → plain click behaviour.
  - `FollowControls` props gain `active: boolean` and `onEnd: () => void`.

- [ ] **Step 1: Failing tests**
  - `useFollowAlong.test.ts`: `end while playing clears the cursor and stops the beats` (advance timers after `end()`: cursor stays null); `end while paused clears the cursor`; `end when idle changes nothing`.
  - `useFollowAlong.voice.test.ts`: `end in voice mode pauses the player`; `end during the title pauses the player`.
  - `useLongPress.test.ts` (fake timers, a rendered button): `fires onLongPress after 600 ms of holding` (not at 599); `releasing earlier is a click`; `the click after a long press is swallowed` (and the next ordinary click works); `pointercancel and pointerleave cancel the hold`; `disabled: a long hold is still a click`; `unmount clears the timer`.
  - `FollowControls.test.tsx`: `in progress: the toggle is described by 長按結束隨誦` (`aria-describedby` resolves to an element with that text; `aria-label` unchanged); `not in progress: no description`; `holding the toggle 600 ms calls onEnd, not onToggle`.
- [ ] **Step 2:** `npx vitest run src/hooks/useLongPress.test.ts src/hooks/useFollowAlong.test.ts src/hooks/useFollowAlong.voice.test.ts src/components/FollowControls.test.tsx` → FAIL.
- [ ] **Step 3: Implement.** Reader passes `active={cursor !== null || playing}` and `onEnd` = vibrate (`useHaptics`) then `end()`.
- [ ] **Step 4:** Unit tests PASS; `pnpm build`; GREEN: `npx playwright test tests/acceptance/reader/{follow-end,follow-along,voice,device}.spec.ts`.
- [ ] **Step 5: Commit** `feat: end the follow-along with a long press`.

### Task 5: 聽 in the lexicon drawer

**Files:**
- Create: `src/hooks/useVoiceClip.ts`, `src/hooks/useVoiceClip.test.ts`
- Modify: `src/lib/followAlong.ts` (+test), `src/lib/voice.ts` (+test), `src/lib/voicePlayer.ts` (+test), `src/components/LexiconContent.tsx`, `src/components/LexiconDrawer.tsx` (+test), `src/components/Reader.tsx`, `src/index.css`

**Interfaces:**
- Consumes: `Voice`, `VoicePlayer`, `fakePlayer`/`fakeTimings` (`src/test/fakeVoice.ts`), `useVoice(enabled)`.
- Produces:
  - `tokenChars(segments: Segment[], key: string): { index: number; count: number } | null` in `lib/followAlong.ts` — `key` is `"<segmentId>:<tokenIndex>"` (as built in `SutraPage`); `index` is the global character index of the token's first character (punctuation not counted, same order as `buildTimeline`); null for an unknown key or a punctuation token.
  - `clipRange(timings: VoiceTimings, index: number, count: number): { from: number; to: number }` in `lib/voice.ts`.
  - `startVoiceClip(voice: Voice, range: { from: number; to: number }, onDone: () => void): () => void` in `lib/voicePlayer.ts` — plays from `range.from`; one timer aimed at `range.to`, re-synced from `player.time()` on each tick (reuse `MIN_DELAY_MS`, `SEEK_TOLERANCE_S`); on reaching `to`, `ended`, `error`, external pause, a rejected `playAt` or a failed seek: pause the player and call `onDone` once. The returned stop function pauses, removes listeners, clears the timer and never calls `onDone`.
  - `useVoiceClip(voice: Voice | null): { playing: boolean; toggle(range: { from: number; to: number }): void; stop(): void }` — `toggle` starts a clip, or stops the running one; no-op while `voice` is null; stops on unmount and when `document.visibilityState` becomes `hidden`.
  - `LexiconDrawer` gains optional prop `listen?: { playing: boolean; toggle: () => void; stop: () => void }`, forwarded to `LexiconContent`; the drawer calls `listen.stop()` when an xref is followed and when it closes.

- [ ] **Step 1: Failing tests**
  - `followAlong.test.ts`: `tokenChars` for the first token of s1 (`index 0`), a token after punctuation, the second occurrence of a repeated term (larger index than the first), a punctuation key (null), an unknown key (null).
  - `voice.test.ts`: `clipRange` mid-sutra (`to = chars[index + count]`) and for the last characters (`to = duration`).
  - `voicePlayer.test.ts`: `a clip stops at its end and reports done once`; `a late timer still stops the clip`; `a clip to the end of the recording finishes on ended`; `rejected play reports done`; `an external pause reports done`; `after stop, a pending clip timer does nothing` (no `onDone`, no second `pause` after a later `playAt`).
  - `useVoiceClip.test.ts`: `toggle plays, toggle again stops`; `playing turns false when the clip ends`; `toggling twice before play resolves leaves the player paused`; `null voice: toggle does nothing`; `hidden stops the clip`; `unmount stops the clip`.
  - `LexiconDrawer.test.tsx`: `root entry shows 聽 with the play label`; `playing shows 停 with the stop label and aria-pressed`; `no 聽 on a cross-referenced entry, back again after 返回`; `following an xref and closing the drawer call stop`; `no listen prop: no button`.
- [ ] **Step 2:** Run the five test files → FAIL.
- [ ] **Step 3: Implement.** Reader: `useVoice(pace === 'voice' || lexicon.selection !== null)`; `listen.toggle` computes `tokenChars(segments, selection.key)` and `clipRange(voice.timings, index, count)` and calls `clip.toggle(range)`; while `voice` is null it does nothing. Reader always passes `listen`, so the button renders for every root entry. Button sits at the right of the 讀音 section, vertically centred on the readings, not overlapping them.
- [ ] **Step 4:** Unit tests PASS; `pnpm build` (the font subset picks 「聽」 up from `src/`; `fonts.spec.ts` confirms); GREEN: `npx playwright test tests/acceptance/reader/{lexicon-listen,lexicon,voice,fonts,visual,pill-scope,quality}.spec.ts`.
- [ ] **Step 5: Commit** `feat: play a name term's reading from the recording`.

### Task 6: Verification, review, docs, listening

- [ ] **Step 1:** Full verification: `npx vitest run --coverage` (report the line %), `npx tsc -b`, `pnpm lint`, `pnpm build`, `npx playwright test` (all), trace-check PASS for reader.
- [ ] **Step 2:** Whole-branch review (model `fable`), fix Critical/High, scoped re-review. Scoped spec-gate audit: REQ-RDR-041, 042, 043.
- [ ] **Step 3:** Update `CLAUDE.md` once: §1 (名相線；長按結束隨誦；抽屜「聽」), §6.2 (line), §6.3 (聽 in the drawer contents). Commit `docs: describe the term line, long-press end and 聽`.
- [ ] **Step 4:** Ask the user to try on a phone: the line's look, the long-press, and listening to the 52 term occurrences. Terms that clip → follow-up (per-occurrence overrides), not this plan.
- [ ] **Step 5:** Merge and push only on the user's instruction.
