# 原音隨誦（聲）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth step 「聲」 to the follow-along speed button; on 聲, 誦 plays the sutra recording and the cursor follows the voice character by character.

**Architecture:** A one-time script turns the luvvoice SRT plus the MP3's energy envelope into reviewed per-character start times (`data/voice-timings.json`). A separate build step (`pnpm build:voice`) validates them against the sutra and copies the MP3 and timings to `public/data/`. At runtime `useFollowAlong` gains a voice driver: one `setTimeout` per character, re-synced from `audio.currentTime`, sharing the cursor state, pause rules, page turns and progress line with the timed modes.

**Tech Stack:** React 19 + TypeScript, Vite, vite-plugin-pwa (Workbox), Dexie, zod, Vitest, Playwright (Chromium, also used headless to decode the MP3 in the one-time script).

**Spec:** `docs/superpowers/specs/2026-11-18-voice-follow-design.md`

## Global Constraints

- Speed button cycle: 中 → 快 → 慢 → 聲 → 中 (225 → 300 → 150 → `'voice'` → 225). Label 「聲」; `aria-label`「隨誦速度：原音朗讀」. Dexie `prefs` key `followPace` stores `"voice"`; invalid values still fall back to 225.
- No new buttons, no layout change, no `requestAnimationFrame` loop, no `timeupdate`-driven cursor.
- Title phase (voice mode, 誦 pressed on the cover): stay on the cover, play from `title.start`; no `data-follow`, no `follow-progress`; the fold turns to s1 when character 0 starts. 停 then 誦 during the title replays from `title.start`.
- Entering or leaving 聲 while playing pauses (cursor kept); switching among 慢/中/快 keeps today's behaviour (REQ-RDR-032).
- Resume seeks the audio to `chars[cursor]`. Playback failure (fetch/parse failure, `play()` rejected, `error` event) behaves exactly like pressing 停; no error UI.
- Data paths stay relative (`data/voice.mp3`, `data/voice-timings.json`), never `/`-rooted (CLAUDE.md §5).
- Recording source: luvvoice.com, free plan; credited in `THIRD_PARTY_NOTICES.md`.
- `review.voice` false: `pnpm build:voice` warns; `pnpm build` aborts. CI runs `pnpm build`, so **nothing is pushed until the user has listened and set `review.voice: true`** (Task 9).
- Do not change the data unit's `build:data` output or `check-review.ts`; voice validation lives in `build:voice` (this refines the design doc's "build:data validates" — record it in Task 1).
- Files written with LF; never run bare `npx prettier` (no repo config).
- Work on branch `feat/voice-follow` (from `main`); merge to `main` in Task 9 only after the listening review.

## Review Focus

1. 誦 pressed in 聲 before the timings/audio have loaded (just switched to 聲): nothing starts, the button stays 誦, no exception; a later 誦 after loading works. → Task 6 test `ignores play in voice mode until the voice is ready`.
2. A throttled background-ish delay (timer fires late by several characters): the cursor jumps to the character at `audio.currentTime`, not one step. → Task 6 test `a late timer resyncs to the character at the audio position`.
3. Switching 聲 → 中 while playing: the audio is paused (no sound continues under the timed cursor). → Task 7 test `leaving voice mode while playing pauses the audio`.
4. The recording's `ended` event arriving before the last character's timer: playback ends (REQ-RDR-037), no stale timer fires afterwards. → Task 6 test `ended finishes playback and cancels the pending timer`.
5. Reader unmount (e.g. load error remount) while the voice plays: audio paused, timers cleared. → Task 7 test `unmounting stops the voice`.

---

### Task 1: Spec, notices, source files

**Files:**
- Move: `sutra_speech.mp3` → `data-sources/voice/sutra_speech.mp3`; `sutra_speech.mp3.srt` → `data-sources/voice/sutra_speech.srt`
- Modify: `docs/spec/reader/requirements.md`, `docs/spec/reader/open-questions.md`, `docs/spec/data/requirements.md`, `docs/spec/data/open-questions.md`, `docs/spec/pwa/requirements.md`, `docs/spec/pwa/open-questions.md`, `CLAUDE.md` (§1 隨誦光標 line, §3.2 file list, §5 tier 2), `THIRD_PARTY_NOTICES.md`, `docs/superpowers/specs/2026-11-18-voice-follow-design.md` (build:voice refinement)

- [ ] **Step 1: Reader spec.** Q-RDR-055 records the design decisions (option A, title on cover, release with credit, all 9 「我的判斷」). Amend REQ-RDR-032 (cycle and `"voice"` value as in Global Constraints) and REQ-RDR-035 (cover in 聲 mode). Add:
  - REQ-RDR-038 原音隨誦: given 聲 and timings `chars[i]`, the current character at audio time t is the last i with `chars[i] ≤ t`; `data-follow`, progress line, page turns and wide-page follow as in timed modes; resume seeks to `chars[cursor]`; title phase as in Global Constraints; recording end = REQ-RDR-037.
  - REQ-RDR-039 錄音不可用與切換: play in 聲 before ready does nothing; playback failure = 停; entering/leaving 聲 while playing pauses and keeps the cursor.
- [ ] **Step 2: Data spec.** REQ-DAT-022 原音時間碼: `data/voice-timings.json` = `{ audio, duration, title: {start, end}, chars: number[], review: { voice: boolean } }`; `pnpm build:voice` fails unless `chars.length` equals the sutra's character count (260), `chars` strictly increasing, `title.end ≤ chars[0]`, `chars[259] < duration`, and `audio` exists; on success writes `public/data/voice.mp3` (byte-identical) and `public/data/voice-timings.json` (`audio: "voice.mp3"`); `review.voice` false → warning in `build:voice`, non-zero exit from `pnpm build`.
- [ ] **Step 3: PWA spec.** REQ-PWA-007 adds `/data/voice.mp3` and `/data/voice-timings.json` to the precache; Q-PWA-011 records it.
- [ ] **Step 4: CLAUDE.md, notices, design doc** as listed in Files; notices section "Sutra recording (luvvoice.com)": files, generated with luvvoice.com free plan by the project author, used non-commercially, will be removed on objection.
- [ ] **Step 5: Commit** `docs: add voice follow-along spec (Q-RDR-055)` with the moved source files.

### Task 2: Acceptance tests (blind, frozen)

**Files:**
- Create: `tests/acceptance/reader/voice.spec.ts`, `tests/acceptance/data/voice.test.ts`, `tests/acceptance/pwa/voice-precache.spec.ts`
- Modify: `docs/spec/{reader,data,pwa}/frozen-tests.json` (freeze command)

**Interfaces:**
- Consumes: REQ-RDR-032/035/038/039, REQ-DAT-022, REQ-PWA-007 text only (blind: the writer does not read `src/`).
- Produces: frozen tests the implementation must pass.

- [ ] **Step 1:** Dispatch a test-writer that reads only the spec registries and existing acceptance helpers. Reader tests replace `HTMLMediaElement.prototype` `play`/`pause`/`currentTime`/`duration` via `addInitScript` with a fake whose time advances with `Date.now()` (so `page.clock` drives it) and which dispatches `ended` at `duration`; expectations use `public/data/voice-timings.json`. One smoke test uses the real element: `data/voice.mp3` loads, `play()` resolves, `duration` within 0.1 s of the timings' `duration`.
- [ ] **Step 2:** `pnpm build` then run the three files; expected RED (no 聲 step / no build:voice / no precache entry).
- [ ] **Step 3:** Freeze: `node ~/.claude/skills/spec-gate/scripts/trace-check.mjs --unit <unit> --freeze <file>` for each unit; trace-check PASS.
- [ ] **Step 4: Commit** `test: add voice follow-along acceptance tests (Q-RDR-055)`.

### Task 3: Timing generator

**Files:**
- Create: `scripts/lib/voice-timings.ts`, `scripts/lib/voice-timings.test.ts`, `scripts/make-voice-timings.ts`, `data/voice-timings.json`
- Modify: `package.json` (`"make:voice": "tsx scripts/make-voice-timings.ts"`)

**Interfaces:**
- Produces (`scripts/lib/voice-timings.ts`):
  - `parseSrt(text: string): Cue[]` with `interface Cue { start: number; end: number; text: string }` (seconds).
  - `phrasesOf(sutra: Sutra): string[][]` — characters per punctuation-delimited phrase, in reading order (52 phrases, 260 chars).
  - `voicedEnd(envelope: Float32Array, frameSec: number, from: number, to: number, threshold: number): number` — last time in [from, to) whose frame energy ≥ threshold.
  - `findPauses(envelope: Float32Array, frameSec: number, from: number, to: number, threshold: number, minPauseSec: number): { start: number; end: number }[]`.
  - `spread(start: number, end: number, count: number): number[]` — `count` evenly spaced starts in [start, end).
  - `buildTimings(input: { cues: Cue[]; phrases: string[][]; envelope: Float32Array; frameSec: number; duration: number; mantraOverride?: number[] }): VoiceTimings` — cue 0 → title; cues 1..48 ↔ phrases 0..47 (assert equal character counts); mantra phrases 48..51 from `findPauses` over [cue 49 start, duration) expecting exactly 3 pauses, else `mantraOverride` (18 starts) is required, else throw.
- `VoiceTimings` = the REQ-DAT-022 shape (`review.voice: false` when generated).

- [ ] **Step 1: Failing tests** in `voice-timings.test.ts`: `parseSrt` on a 2-cue sample (`00:01:02,520` → 62.52); `spread(10, 11, 4)` → `[10, 10.25, 10.5, 10.75]`; `voicedEnd`/`findPauses` on a synthetic envelope (loud 0–1 s, silent 1–1.3 s, loud 1.3–2 s; frame 0.01 s) → voiced end ≈ 1.0, one pause ≈ [1.0, 1.3]; `buildTimings` on a 2-phrase toy input gives strictly increasing chars and throws when a cue's character count differs from its phrase, and when the mantra has ≠ 3 pauses without override.
- [ ] **Step 2:** `npx vitest run scripts/lib/voice-timings.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** the functions above. `make-voice-timings.ts`: read `data-sources/voice/sutra_speech.{mp3,srt}` and `data/heart-sutra.json`; launch Playwright Chromium headless, `decodeAudioData` the MP3 bytes, return a 10 ms RMS envelope and the duration; pick the threshold as 10 % of the envelope's 95th percentile; `minPauseSec` 0.12; optional `--mantra-override data-sources/voice/mantra-override.json`; write `data/voice-timings.json` (LF, 3-decimal seconds).
- [ ] **Step 4:** Tests PASS; run `pnpm make:voice`; check the output: 260 chars, increasing, first char ≈ 2.32 s, s4's first char 是 ≈ 26.24 s. If the mantra pauses are not exactly 3 at the sutra's commas, derive the 18 mantra starts from envelope syllable onsets, write `data-sources/voice/mantra-override.json`, rerun with the override, and report it.
- [ ] **Step 5: Commit** `feat: generate voice timings from the recording`.

### Task 4: `build:voice`

**Files:**
- Create: `scripts/build-voice.ts`, `scripts/build-voice.test.ts`
- Modify: `scripts/lib/schemas.ts` (`VoiceTimingsSchema`), `package.json` (`"build:voice": "tsx scripts/build-voice.ts"`; `build` becomes `tsx scripts/check-review.ts && pnpm build:data && pnpm build:voice --release && pnpm build:fonts && pnpm build:icons && tsc -b && vite build`)

**Interfaces:**
- Consumes: Task 3's `data/voice-timings.json`.
- Produces: `buildVoice(options?: { timings?: string; sutra?: string; out?: string; release?: boolean }): Promise<{ ok: boolean; errors: string[]; warnings: string[] }>`; CLI exits 1 when `!ok`, prints errors and warnings.

- [ ] **Step 1: Failing tests** (temp dirs, fixture timings): valid → `public/data/voice.mp3` byte-identical, timings copied with `audio: "voice.mp3"`; each REQ-DAT-022 violation → `ok: false` with a message naming it (wrong count, non-increasing, `title.end > chars[0]`, last ≥ duration, missing audio); `review.voice: false` → `ok: true` + warning, and `ok: false` with `release: true`.
- [ ] **Step 2:** FAIL. **Step 3:** implement (character count from `data/heart-sutra.json` tokens without `punct`). **Step 4:** PASS; `pnpm build:voice` warns (review false), `tests/acceptance/data/voice.test.ts` GREEN.
- [ ] **Step 5: Commit** `feat: validate and publish voice timings (build:voice)`.

### Task 5: Mode type, pace hook, label

**Files:**
- Modify: `src/lib/followAlong.ts`, `src/lib/followAlong.test.ts`, `src/hooks/useFollowPace.ts`, `src/hooks/useFollowPace.test.ts`, `src/components/FollowControls.tsx`, `src/components/FollowControls.test.tsx`
- Create: `src/lib/voice.ts`, `src/lib/voice.test.ts`

**Interfaces:**
- Produces (`followAlong.ts`): `type FollowMode = Pace | 'voice'`; `nextMode(mode: FollowMode): FollowMode` (replaces `nextPace`); `isFollowMode(value: string | null): boolean` (replaces `isPace`); `MODE_LABEL: Record<FollowMode, string>` (replaces `PACE_LABEL`, adds `voice: '聲'`). `Pace`, `PACES`, `DEFAULT_PACE`, `beatMs` unchanged.
- Produces (`useFollowPace.ts`): `useFollowPace(): { pace: FollowMode | null; cycle: () => void }`.
- Produces (`FollowControls.tsx`): prop `pace: FollowMode`; `aria-label` 「隨誦速度：原音朗讀」 for `'voice'`, unchanged otherwise.
- Produces (`voice.ts`): `voiceTimingsSchema` (zod, REQ-DAT-022 shape); `type VoiceTimings`; `charIndexAt(chars: readonly number[], seconds: number): number | null` (last i with `chars[i] ≤ seconds`, null before `chars[0]`); `VOICE_URL = 'data/voice.mp3'`, `VOICE_TIMINGS_URL = 'data/voice-timings.json'`.

- [ ] **Step 1: Failing tests:** `nextMode` 225→300→150→'voice'→225; `isFollowMode('voice')` true, `'60'` false; stored `"voice"` restores 聲 and cycling writes `"voice"`; FollowControls shows 聲 with the aria-label; `charIndexAt([1,2,3], 0.5)` null, `(…, 2)` 1, `(…, 9)` 2.
- [ ] **Step 2:** FAIL. **Step 3:** implement; update existing call sites/tests of the renamed exports. **Step 4:** `npx vitest run src/lib src/hooks/useFollowPace.test.ts src/components/FollowControls.test.tsx` PASS; `npx tsc -b` passes.
- [ ] **Step 5: Commit** `feat: add the 聲 step to the follow-along speed`.

### Task 6: Voice driver in `useFollowAlong`

**Files:**
- Create: `src/lib/voicePlayer.ts`, `src/lib/voicePlayer.test.ts`
- Modify: `src/hooks/useFollowAlong.ts`, `src/hooks/useFollowAlong.test.ts`

**Interfaces:**
- Consumes: `FollowMode`, `VoiceTimings`, `charIndexAt` (Task 5).
- Produces (`voicePlayer.ts`):
  ```ts
  export interface VoicePlayer {
    playAt(seconds: number): Promise<void> // seek then play; rejects when playback cannot start
    pause(): void
    time(): number // current position, seconds
    onEnded(listener: () => void): () => void // returns unsubscribe
    onError(listener: () => void): () => void
  }
  export function createVoicePlayer(audio: HTMLMediaElement): VoicePlayer
  ```
- Produces (`useFollowAlong.ts`): `useFollowAlong(timeline: Timeline, pace: FollowMode, voice: { player: VoicePlayer; timings: VoiceTimings } | null): { cursor: number | null; playing: boolean; play(visible: string): void; pause(): void }` — same contract as today in timed modes; in `'voice'`: `play` on the cover starts the title phase (`playing: true`, `cursor: null`, audio from `title.start`); elsewhere starts at `startIndex(...)` with the audio at `chars[index]`; each tick sets `cursor = charIndexAt(chars, player.time())` and schedules the next tick at `(chars[next] - time) * 1000` ms; `ended` → idle; `play()` rejection or `error` → pause; pause/unmount → `player.pause()` and timer cleared; `voice === null` in `'voice'` → `play` is a no-op.

- [ ] **Step 1: Failing tests** with a fake `VoicePlayer` whose `time()` follows `vi` fake timers: cursor follows `chars`; title phase keeps `cursor` null until `chars[0]`; resume seeks to `chars[cursor]`; Review Focus tests 1, 2, 4 (names as listed there); rejection → paused with cursor kept; timed modes unchanged (existing tests stay green). `voicePlayer.test.ts`: `playAt` sets `currentTime` before `play()`, listeners unsubscribe.
- [ ] **Step 2:** FAIL. **Step 3:** implement; keep `useFollowAlong.ts` under 200 lines by putting the voice tick scheduling in a helper inside `voicePlayer.ts` or a sibling `src/lib/voiceClock.ts` if needed. **Step 4:** PASS.
- [ ] **Step 5: Commit** `feat: drive the follow-along cursor from the recording`.

### Task 7: Reader wiring

**Files:**
- Create: `src/hooks/useVoice.ts`, `src/hooks/useVoice.test.ts`
- Modify: `src/components/Reader.tsx`, `src/App.test.tsx` or a new `src/components/Reader.test.tsx` (follow the existing location of Reader tests)

**Interfaces:**
- Produces: `useVoice(enabled: boolean): { player: VoicePlayer; timings: VoiceTimings } | null` — when first enabled, fetches `VOICE_TIMINGS_URL` (schema-parsed) and creates `new Audio(VOICE_URL)` with `preload = 'auto'`; stays loaded once loaded; on failure returns null and `console.warn`s the reason.
- Reader: `useFollowAlong(timeline, pace ?? DEFAULT_PACE, voice)`; `onCyclePace` pauses first when playing and either the current or the next mode is `'voice'`.

- [ ] **Step 1: Failing tests:** `useVoice` loads once and returns null on a 404; Review Focus tests 3 and 5; cover + 聲 + 誦 shows 停 with no `data-follow` until `chars[0]`.
- [ ] **Step 2:** FAIL. **Step 3:** implement. **Step 4:** unit suite PASS; `pnpm build` (with `review.voice` temporarily irrelevant — use `pnpm build:data && pnpm build:voice && pnpm build:fonts && pnpm build:icons && tsc -b && vite build`), then `npx playwright test tests/acceptance/reader/voice.spec.ts` GREEN except anything needing Task 8.
- [ ] **Step 5: Commit** `feat: wire the voice follow-along into the reader`.

### Task 8: Precache

**Files:**
- Modify: `vite.config.ts` (`globPatterns` += `'data/voice.mp3'`, `'data/voice-timings.json'`; `maximumFileSizeToCacheInBytes` only if Workbox's 2 MiB default is exceeded — it is not at ~530 KB)

- [ ] **Step 1:** `tests/acceptance/pwa/voice-precache.spec.ts` is RED. **Step 2:** edit. **Step 3:** build as in Task 7 Step 4; pwa suite GREEN (`npx playwright test tests/acceptance/pwa`).
- [ ] **Step 4: Commit** `feat: precache the sutra recording`.

### Task 9: Verification, review, listening, release

- [ ] **Step 1:** Full verification: `npx vitest run --coverage` (report the line %), `npx tsc -b`, `pnpm lint`, build as in Task 7, `npx playwright test` (all), trace-check PASS for reader/data/pwa.
- [ ] **Step 2:** Whole-branch review (model `fable`), fix Critical/High, scoped re-review.
- [ ] **Step 3:** Ask the user to listen through in 聲 mode (local preview or a phone on the LAN) and confirm the cursor sits on the spoken character, mantra included. Adjust `data/voice-timings.json` (or the mantra override) per their notes and rerun.
- [ ] **Step 4:** On the user's OK: set `review.voice: true`, write `review/voice-review.md` (date, what was checked, any adjustments), `pnpm build` passes, commit `docs: record the voice timing review`.
- [ ] **Step 5:** Push `main` only on the user's instruction; watch the Pages deploy.
