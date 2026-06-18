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
- `chainLen` (1-4): how many patterns play in sequence (A→B→C→D)
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

## Unit = 6 Roles
制作の基本単位は「1ユニット = 6ロール」。各ロールは `.claude/agents/` にエージェント化済み（`producer` / `code` / `ui` / `sound` / `feel` / `artware`）。

| ロール | 視点 / 担当 | 現メンバー |
|--------|------------|-----------|
| プロデューサー | スコープ・調停・最終判断 | Yoshi |
| プログラミングコード担当 | 実装・最適化・バグ修正 | Claude Code |
| UI担当 | レイアウト・CSS・レスポンシブ・情報階層 | （専任不在＝重点） |
| 音源担当 | Web Audio・音作り・グルーヴ | hichannel |
| 操作感担当 | "aki rule"・触り心地・手数 | aki |
| アートウェア担当（感性） | 世界観・色・命名・ヴァイブ | YKOYKO |

運用：意味のある変更は出す前に6ロール（特に UI・操作感・感性）の観点でセルフレビューする。複雑な課題はロールをサブエージェントとして並行起動し、プロデューサー視点で統合する。

## Version
MICS009 beta v0.3.20

**Versioning rule**: bump by +0.0.1 on every change (even minor fixes). Update BOTH in the same commit:
- `APP_VERSION` in `mics-609bc14b.html` (also the `<div id="splashVer">` static text)
- `version.json` `"version"` (must equal APP_VERSION)

The splash shows `v<APP_VERSION>` and an update button. On boot it fetches `version.json`; if its version is strictly newer (semver) than the loaded build, the button highlights "新バージョン … 更新" (tap = cache-busting reload). Keeping the two equal per commit means a stale cached client correctly detects the newer deploy.
