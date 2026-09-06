# CLAUDE.md - Project Context for Claude Code

## What is this?
microtone MICS009 — a browser-based 16-pad sampler/sequencer inspired by SP-1200 and MPC.
Single HTML file (`index.html`), zero external dependencies. Pure Web Audio API.

## Architecture

### Audio Engine
- `AudioContext` with `latencyHint:"interactive"` for minimum latency
- All samples are 12-bit quantized + 26kHz sample rate (SP-1200 emulation) via `makeLofi()`
- Pitch shift uses drop-sample (nearest-neighbour) resampling baked to a buffer played at `rate=1.0` (`pitchBufferNN`) → SP-style aliasing/grit instead of clean browser interpolation
- Presets are synthesized at startup via `OfflineAudioContext` then baked as samples
- Every pad plays the same way: `AudioBufferSourceNode` → filter(optional) → gain envelope → groupBus → SP channel filter → masterGain
- **SP channel filter = SSM2044 model** (`SP_CH`/`ssmNode`, v0.2.29): the SP-1200's per-output SSM2044 (4-pole OTA lowpass VCF) modeled as an **AudioWorklet** (`ssm-2044`): nonlinear ladder = 4 cascaded one-pole stages + resonance feedback, `tanh` saturation per stage (OTA character), 2× oversampling. One instance per group bus. Cutoff/reso/drive per group via `SP_CH`; sample groups (g0/g1) bright (high cutoff/low res), drum groups (g2/g3) rounded; g2 gets a per-hit dynamic cutoff envelope (`spDynOpen`). Graceful **biquad fallback** (`grpBiquad`) when AudioWorklet is unavailable. Stable output stage `grpOut[g]→masterGain` lets the filter impl swap without re-wiring. Runtime toggle in menu (default ON) via `applySpChFilter()`.

### Signal Chain
```
pads → groupBus[g] → SP-chan-filter[g] → masterGain → [comp → saturator → makeupGain] → tapeDelay → output
                                                     ↘ [bypass (comp off)]              ↗
                                                     └→ bassLp → bassSat → bassGain ───→↗
tapeHiss ───────────────────────────────────────────────────────────────────────────→ output
```

### Timing / Groove (SP-1200 emulation)
- 24 PPQ tick grid (all timing derived from absolute tick position, not accumulation)
- Swing: 6 discrete values (50/54/58/63/67/71%) quantized to tick boundaries
- Micro-drift: ±0.4ms random jitter per step
- Scheduler: lookahead pattern (25ms interval, 25ms ahead)

### Data Model
- `tracks[16]`: each has `patterns[4][16]`, buffer, vol, tune, start, end, loop, filter, choke, etc.
- `editPat` (0-3): which pattern is being edited
- Pattern length is derived from bar content via `patLength(p)` (no separate chainLen state; A/B/C/D switching is `queuedPat` at pattern boundary)
- Accessor functions: `getPattern(i)` for edit, `getPlayPattern(i)` for playback

### UI Modes (2 screens since v0.2.8)
- **PADS**: Koala-style layout. Waveform strip on top, pads below. MUTE/SOLO/EDIT toggles. **Pad grid is fixed 4×4** (8×2 layout removed v0.2.30 — maintaining two layouts wasn't worth it). Desktop uses the S2400 split (pads left, waveform/controls right) via `#viewPads.split`, always on; landscape ≥768 promotes to Performance Mode. Mobile forces 4×4 via media query.
- **SEQ**: 16×16 step grid with pattern A/B/C/D selector and chain length.
- **MIX screen removed**: per-pad volume = EDIT Level + P-LOCK level; mute/solo = PADS MUTE/SOLO modes. Rationale: same state was editable from 3 places (DRY violation → sync bugs). Audio routing (groupBus/GROUP_OF/FX nodes) unchanged — only UI moved. See `docs/screen-spec.md`.
- **MENU (⋮) mixer UI removed (v0.2.27)**: the Group-volume (4) and FX (delay/reverb) pads were dropped from the menu too. Group/FX **values still load from `.mics` and apply** via `applyGroupVol`/`applyFx` — only the editing UI is gone. Master volume + COMP remain in the menu. `paintMixer()` kept as a no-op shim for existing callers.

### Key Design Rules
- **"aki rule"**: Hide complex settings. Anyone should be able to enjoy sampling music without understanding filters or choke groups. Simple surface, depth underneath.
- Pad layout: natural numbering (top-left = pad 1). Sample slots (1-8) on top, default drums (9-16) on bottom. Numbering reads top→bottom; drums stay on the bottom rows for ergonomics. No CSS `order` reversal — DOM order = visual order.
- **Single source of truth for state**: a given track property should be edited from one place (avoid duplicate UIs writing the same `tracks[i].*` — that caused sync bugs).
- All mode buttons (MUTE/SOLO/EDIT) use toggle pattern, not hold
- Start point snaps to attack transients (onset detection)
- CHOPPY auto-sets choke groups and end points

### File Format (.mics)
JSON with base64-encoded WAV audio. On save, buffers are cropped to start-1s..end+1s to reduce size.
Stores: all pad settings, 4×16×16 step patterns, BPM, swing, chain, comp settings.

## Key Functions
| Function | Purpose |
|----------|---------|
| `makeLofi(buffer)` | 12-bit quantization + sample rate reduction |
| `playVoice(i, when, accent, fromSeq)` | Core sample playback with filter/loop/fade |
| `snapStartToOnset(idx)` | Attack snap for start point (runs on EDIT start-handle release) |
| `detectOnsets(t,s,e,sens)` | Transient detection for CHOP (ATK mode) |
| `stepTimeClean(stepNo)` | Tick-derived absolute step timing |
| `driftSec()` | SP-style micro-timing jitter |
| `bufToWav(buf, from, to)` | AudioBuffer → WAV encoder with crop |
| `calcCrop(t)` | Calculate crop range for save optimization |

## Members
- **Yoshi**: Producer, 30 years experience (builds everything)
- **hichannel (Hinata)**: Multi-instrumentalist, scratch + synth
- **aki**: Vocalist (needs simplest UI)
- **YKOYKО**: Illustrator (non-technical)

## チーム = 8ロール（v0.3.97 再編成）
目標は「**最高のドラムマシン体験**」。各ロールは `.claude/agents/` にエージェント化済み。
v0.3.96 まで**検査を持つ役が居なかった**ため、SEQの小節が選べないバグが3バージョン潜伏した。再編成で検査と演奏を追加。

| ロール | エージェント | 視点 / 担当 | 現メンバー |
|--------|-------------|------------|-----------|
| プロデューサー | `producer` | スコープ・調停・**Definition of Done** | Yoshi |
| コード | `code` | 実装・修正。**範囲削除禁止・削除後は lost-listeners** | Claude Code |
| **検査（QA）** | `qa` | **関門を回す・バグは再現→テスト追加→修正の順** | Claude Code（新設） |
| 音源 | `sound` | 信号鎖・ローファイ・レイテンシ予算・音の安全 | hichannel |
| **演奏** | `player` | **叩いて気持ちいいか**：反応・手触り・グルーヴ・ライブ編集 | hichannel（新設） |
| 操作感 | `feel` | "aki rule"・手数・両手難易度 | aki |
| UI | `ui` | レイアウト・寸法の不変性・画面予算 | （専任不在＝重点） |
| アートウェア | `artware` | 世界観・色（値は4.5:1を割らない）・命名 | YKOYKO |

### 運用（Definition of Done）
1. **バグは再現してから直す**：qa が Playwright で再現 → `tools/check.mjs` に追加 → code が修正 → 同じテストで確認
2. **出す前に関門**：`node tools/gate.mjs`（check / dead-controls / lost-listeners）が通ること。`.githooks/pre-push` が自動で止める（初回 `git config core.hooksPath .githooks`）
3. **削除は1件ずつ**：範囲指定で消さない。消したら `lost-listeners.mjs`、意図した撤去は `tools/removals-ok.txt` に理由つきで
4. **規則は数値で**：`docs/ui-rules.md`。スコアが悪化したら理由を書く。規則と現実が衝突したら測ってから決める
5. **経緯は残す**：`docs/screen-spec.md` に §番号で。何を試して何が駄目だったかも

意味のある変更は出す前に8ロール（特に qa・player・feel）の観点でセルフレビューする。複雑な課題はロールをサブエージェントとして並行起動し、プロデューサー視点で統合する。

## UI開発規則
楽器UIの基準値（情報提供・操作・視認性スコア・両手操作の難易度・レイテンシ・不変性・
可逆性/安全・静けさ・画面予算）は **`docs/ui-rules.md`** に体系化してある。
新しいUIを足す前と、出す前に、この規則で自己採点する。

## Checks before shipping
`tools/check.mjs`（回帰・合否）／`tools/ui-audit.mjs`（UI規則のスコア）／
`tools/deadcss.mjs`（未使用CSS）を出す前に回す。使い方は `tools/README.md`。
意味のある変更の後は `node tools/check.mjs` が全項目パスすることを確認する。

## Version
MICS009 beta v0.3.105

**Versioning rule**: bump by +0.0.1 on every change (even minor fixes). Update BOTH in the same commit:
- `APP_VERSION` in `mics-609bc14b.html` (also the `<div id="splashVer">` static text)
- `version.json` `"version"` (must equal APP_VERSION)

The splash shows `v<APP_VERSION>` and an update button. On boot it fetches `version.json`; if its version is strictly newer (semver) than the loaded build, the button highlights "新バージョン … 更新" (tap = cache-busting reload). Keeping the two equal per commit means a stale cached client correctly detects the newer deploy.
