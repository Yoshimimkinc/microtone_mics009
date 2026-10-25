# CLAUDE.md - Project Context for Claude Code

## What is this?
microtone MICS009 — a browser-based 16-pad sampler/sequencer inspired by SP-1200 and MPC.
Ships as a single HTML file (`mics-609bc14b.html`), zero external dependencies. Pure Web Audio API.

**開発はモジュール、公開は1ファイル（v0.3.116〜）**：触るのは `src/`（57部品）。
`node tools/build.mjs` が連結して `mics-609bc14b.html` を生成する。**生成物を直接編集しない**
（関門 `build.mjs --check` が止める）。バージョンは `version.json` だけが正で、ビルドが差し込む。
流れの全体は **`docs/dev-flow.md`**。

## Architecture

### Audio Engine
- `AudioContext` with `latencyHint:"interactive"` for minimum latency
- All samples are 12-bit quantized + 26kHz sample rate (SP-1200 emulation) via `makeLofi()`
- Pitch shift uses drop-sample (nearest-neighbour) resampling baked to a buffer played at `rate=1.0` (`pitchBufferNN`) → SP-style aliasing/grit instead of clean browser interpolation. Only the region being played (START..END, incl. loop start) is baked (`getPitchedRegion`, v0.3.169 §163), and positions come from the source frames, so changing pitch never moves START on long samples
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
- **1 ステージ（＝1 ファイル・セーブの単位）= 16 セット × 4 シーケンス × 16 パッド（v0.3.144, §145 / 呼び名 §147）**。`setSlots[16]`（`data/set`）が全セットを snapshot の形で持ち、
  いまのセット（`setCur`）だけ live の `tracks` / `PADS` / `bpmVal` / `swingPct` に展開される。切替＝退避（`snapshotSet`）→ 展開（`applySetSnapshot`）。
  `.mics` v3 = `{version:3, cur, sets:[16 × {name,bpm,swing,tracks}], comp, masterVol, groupVol, fx}`（v2 は SET 1 に入る）。触っていないプリセットの音は同梱しない。
- `tracks[16]`: each has `patterns[4][16]`, buffer, vol, tune, start, end, loop, filter, choke, etc.
- **ミュート / ソロ / エフェクトは A B C D ごと（v0.3.149–150, §146）**：各トラックの `mutes[4]` / `solos[4]` / `patFx[4]`（DELAY・REVERB の送り、FILTER 種類・カットオフ・レゾ＝`PAT_FX`）。live の値は `patSlot` のパターンのもので、パターンを移るとき `patLoad`（`data/patterns`）が書き戻し→読み出しする。
  エフェクトのボタン（PITCH / FILTER / DELAY / REVERB）は解除しても値が残る（v0.3.168 §162）。掛かっていればボタンにポッチ、ダブルタップで全パッドから外す、EDIT 中に押すとモーダル（FILTER / DELAY / REVERB。`ui/performance-view` の `fxBtnTap`）。
- `editPat` (0-3): which pattern is being edited
- **BAR ホールド（v0.3.161, §155）**：BAR のダブルタップで `barHold`。ホールドがあれば再生はその小節だけを順にくり返す（`nextPlayBar`）。保存しない。ホールドした小節で打ち込むと、ホールドした小節すべての同じステップへ入る（`editBars`、v0.3.166 §159）
- Pattern length is derived from bar content via `patLength(p)` (no separate chainLen state; A/B/C/D switching is `queuedPat`; when it switches is a menu setting PATTERN (default, after the pattern plays out) / BAR / BEAT — `patSwitchMode()`, v0.3.168 §161)
- Accessor functions: `getPattern(i)` for edit, `getPlayPattern(i)` for playback

### UI Modes (2 screens since v0.2.8)
- **PADS**: Koala-style layout. Waveform strip on top, pads below. MUTE/SOLO/EDIT toggles. **Pad grid is fixed 4×4** (8×2 layout removed v0.2.30 — maintaining two layouts wasn't worth it). Desktop uses the S2400 split (pads left, waveform/controls right) via `#viewPads.split`, always on; landscape ≥768 promotes to Performance Mode. Mobile forces 4×4 via media query.
- **SEQ**: 16×16 step grid with pattern A/B/C/D selector and chain length.
- **MIX screen removed**: per-pad volume = EDIT Level only (P-LOCK level removed v0.3.124, §135); mute/solo = PADS MUTE/SOLO modes. Rationale: same state was editable from 3 places (DRY violation → sync bugs). Audio routing (groupBus/GROUP_OF/FX nodes) unchanged — only UI moved. See `docs/screen-spec.md`.
- **MENU (⋮) mixer UI removed (v0.2.27)**: the Group-volume (4) and FX (delay/reverb) pads were dropped from the menu too. Group/FX **values still load from `.mics` and apply** via `applyGroupVol`/`applyFx` — only the editing UI is gone. Master volume + COMP remain in the menu. `paintMixer()` kept as a no-op shim for existing callers.

- **SET モード（v0.3.144, §145）**: 上段スイッチ PADS / SEQ / SET。SET は PADS 画面の状態（`body.setmode`）で、情報窓が SET 演奏モード、
  パッドが **16 セットのポン出し**（v0.3.147：押す＝そのセットを頭から鳴らす＋ PADS / SEQ の対象もそのセットに／離す＝止まる／
  1 拍（4 ステップ）押し続ける＝ホールド（押して離すと止まる）／**同時鳴らし可**＝ミックス／押しながら上下スワイプ＝そのセットの音量 `setLevels`。■ は全部止める）。キーボード（1-8 / Q-I、↑↓ で音量）と MIDI（C4〜D#5）からも同じ操作（§152）。SET の切替ボタンに 16 セットの地図と番号（§147）。セットの名前は情報窓の NOW の横の ✎（§160）。データは `data/set`、表示は `ui/set-view`。
  いまのセットは `audio/transport`、他に鳴っているセットは `audio/set-players`（snapshot のトラック列を `playVoice(..., trs)` で鳴らす。時計はセットごと）。

### Key Design Rules
- **"aki rule"**: Hide complex settings. Anyone should be able to enjoy sampling music without understanding filters or choke groups. Simple surface, depth underneath.
- Pad layout: natural numbering (top-left = pad 1). Sample slots (1-8) on top, default drums (9-16) on bottom. Numbering reads top→bottom; drums stay on the bottom rows for ergonomics. No CSS `order` reversal — DOM order = visual order.
- **Single source of truth for state**: a given track property should be edited from one place (avoid duplicate UIs writing the same `tracks[i].*` — that caused sync bugs).
- All mode buttons (MUTE/SOLO/EDIT) use toggle pattern, not hold
- Start point snaps to attack transients (onset detection)
- CHOPPY auto-sets choke groups and end points

### File Format (.mics)
JSON with base64-encoded WAV audio. On save, buffers are cropped to start-1s..end+1s to reduce size.
v3（v0.3.144〜）: 16 sets, each with 16 pad settings, 4×4×16 step patterns, BPM, swing; global comp/master/group/fx. v2 (single set) still loads as SET 1.
SAVE / LOAD は単位 STAGE / SET / SEQ を選べる（v0.3.162, §156）：拡張子は STAGE `.mics`／SET `.micset`（`{kind:"set", set}`）／SEQ `.micseq`（`{kind:"seq", tracks}`、音なし）（v0.3.165）。読み込みはファイルと単位の小さいほうへ（`loadFileData`）。

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

## 開発の流れ（要点。詳細は `docs/dev-flow.md`）
1. `src/` を直す → `node tools/build.mjs` → `node tools/gate.mjs`
   - `src/js/` は番号付きファイル（旧来）と **責務別ディレクトリ `app/` `ui/` `data/` `audio/`**（v0.3.130〜 Phase 2 / 3）が同居する。
     新しい部品は責務別ディレクトリへ（`ui/pads-view` `ui/seq-view` `ui/performance-view` `ui/status` `data/pads` `data/patterns` `data/set` `audio/transport` `ui/transport-view` `ui/set-view`）。
     旧 `30-ui-pads.js` はこの5つに分けた（第1段）。第2段（v0.3.131）で COPY のデータ更新を `data/` へ、P-LOCK の塗りを
     `ui/performance-view` へ移し、**データ更新は DOM を触らない・描画は `refreshPadDisplay` 等の描画関数だけ**という分け方にした。第3段（v0.3.132）でパッド名の描画を `paintPadName` に一本化し、`40-transport` を音（`audio/transport`）と
     表示（`ui/transport-view`）に分けた。記録は `docs/modularization-log.md` Phase 2
   - **アプリ状態（`selected` `playing` `editPat` `activeLock` `bpmVal` …）は `js/app/state.js` に集めてある**（v0.3.133〜 Phase 3）。
     各行の `@writers` に書いてよいモジュールを列挙してあり、他のファイルから代入すると関門 `module-check` が止める。
     状態を変えるときは入口関数（`selectPad` `setEditPat` `setActiveLock` `applyBpm` `startTransport` / `stopTransport` `setStep` `hitVoice` …）を呼ぶ。新しい状態変数は
     `app/state.js` に足して `@writers` を書く。`tracks` / `PADS` の書き手は `node tools/module-check.mjs --tracks` で一覧できる
   - 各 `src/js/**/*.js` の先頭に **`@module / @provides / @uses / @depends`** がある（v0.3.129〜、`docs/maintainability-modularization-plan.md` Phase 1）。
     触る前に `@uses` と `@depends` で影響範囲を見る。関数や変数を足した／消したら **`node tools/module-check.mjs --write`** で
     ヘッダを実装に合わせる（手で書かない。ズレは関門 `module-check` が止める）。記録は `docs/modularization-log.md`
   - **ビルドなしで確かめる**：`python3 -m http.server 8137` → `http://localhost:8137/tools/dev.html`（`src/` を manifest の順に個別に読む。
     エラーが `src/js/…:行` で出る。v0.3.136〜 Phase 4）。公開物ではないので、**最終確認は生成後の `mics-609bc14b.html`** で
2. ブランチに push → GitHub Actions が **gate（関門）** と **pages（`/preview/<branch>/` に配置）** を回す
3. **プレビューを実機で触ってから** PR → merge（main が本番URLに出る）。タグと Release は `release.yml` が自動で打つ
4. 判断待ち・宿題は Issues に（`role:qa` `role:player` `role:feel` … のラベル）

## Checks before shipping
`tools/check.mjs`（回帰・合否）／`tools/ui-audit.mjs`（UI規則のスコア）／
`tools/deadcss.mjs`（未使用CSS）を出す前に回す。使い方は `tools/README.md`。
意味のある変更の後は `node tools/check.mjs` が全項目パスすることを確認する。

## Version
MICS009 beta v0.3.178

**Versioning rule**: bump by +0.0.1 on every change (even minor fixes).
**編集するのは `version.json` の `"version"` だけ**。`APP_VERSION` とスプラッシュ表記は
`src/` の `__APP_VERSION__` にビルドが差し込むので自動で一致する（v0.3.116〜）。

The splash shows `v<APP_VERSION>` and an update button. On boot it fetches `version.json`; if its version is strictly newer (semver) than the loaded build, the button highlights "新バージョン … 更新" (tap = cache-busting reload). Keeping the two equal per commit means a stale cached client correctly detects the newer deploy.


## Local v0.3.176 integration notes
Normal FX is live pad-value selection, EDIT+FX is parameter configuration; step automation remains retired. SCR opens a platter/fader surface: DSP/routing in `src/js/audio/scratch-pad.js`, drawing/input in `src/js/ui/scratch-view.js`, shared tape-head core for worklet/fallback. Guitar entry/integration is retired. See latest sections of docs/codex-pad-content-handoff.md; do not follow earlier direct-FX-modal notes. Source is local only; do not push without user approval or overwrite Claude's unpublished work. Run the full gate in a browser-capable environment before merging.
