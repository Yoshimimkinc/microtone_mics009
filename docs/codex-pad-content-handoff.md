# Codex作業メモ：SPL / KEY / SCR・モバイル操作

作業日：2026-10-25。ユーザーの依頼仕様は別途作成済みの実装指示書。
このメモはClaude Codeとの引継ぎ・衝突回避のための実装記録。

## 基準と公開状態

- 基準：`68d80845993a4c5f0b60a5612f4a3d1e75a4edbf`（main / v0.3.170）。
- 開始時、未マージPRなし。公開されている`claude/sleepy-curie-rok0bf`も同じSHAだった。
- Codex専用ローカルブランチ：`codex/pad-types-mobile-fx-local`。
- Claudeの未公開の作業ツリーや他端末の未pushコミットは確認できない。
- リモートへの書き込み・push・PR・merge・公開は未実施。ユーザー承認が必要。
- v0.3.171はこのローカル候補版。main側で先に版が進んだ場合、取り込み時に採番し直す。
- 別作業のBAR HOLDテスト提案を含む元の作業場所は変更せず、独立したworktreeで実装した。

## Claude Codeが続きを作業する場合

1. 自分の作業ツリーと未push変更を先に確認し、退避・分離する。
2. 最新main・作業ブランチの差分を取得し、上記基準SHAから増えた変更を確認する。
3. この差分はまず別のworktreeで`git apply --check`する。
4. 競合箇所は両方の意図を確認する。ファイル全体をこちらの版で上書きしない。
5. 生成HTMLはソース統合後に作り直す。生成物の競合を手で調整しない。
6. 最終HEADでbuild・gateを再実行する。実機とDropbox確認待ちは自動テスト成功と区別する。
7. ユーザー承認前のpush・公開はしない。

## 所有範囲・衝突しやすい場所

| 範囲 | 新規モジュール／変更場所 | 注意 |
|---|---|---|
| KEY正データ・MIDI | `src/js/data/key-phrase.js` | 拍単位のノート、SMF format 0/1 PPQ |
| KEY音源 | `src/js/audio/key-instrument.js` | OfflineAudioContextでFM音源を焼く。最大24キャッシュ、BPM操作はdebounce |
| パッド種類・ピアノロール | `src/js/ui/pad-content.js`、新規HTML/CSS | SPL音声をsampleStateで保持。KEYは4小節・最大512ノート |
| SCR | `src/js/audio/scratch-pad.js` | 既存テープヘッドのアルゴリズムをAudioWorklet化。同一AudioContextを共有 |
| 復帰処理 | `src/js/audio/lifecycle.js`、transport、set-players | 非表示／suspendedで予約停止、復帰時は次ステップを時計へ再同期 |
| MUTE／FX | header、view-pads、performance-view、step-strip、layout、ui-copy | PITCH専用FXとロックRECを撤去。MUTEはarmModeを再利用 |
| 保存・コピー・UNDO | plock-undo、data/set、data/pads、save-load、share-export | padKind/keyPhrase/sampleStateの整合が必要 |
| 数値操作 | ui-window | 5px閾値で主軸固定。上／右が増加。CUTOFFは整数Hz |
| Dropbox | `src/js/data/dropbox.js`、menu-modal | PKCE、sessionStorage、別名保存。認証や実ファイル転送は未確認 |
| 検査 | check、pad-content-check、dead-controls、removals-ok | 廃止仕様の検査を現行仕様へ変更。新機能の回帰を追加 |

## 採用した動作

- 種類未指定の旧パッドはSPL。既存のPADS.type（sample/synth/empty）は音声の由来として残す。
- `padKind`はSPL/KEY/SCR。KEYのノートは`keyPhrase`、元サンプルはruntimeの`sampleState`へ退避する。
- ファイルには元サンプルとKEYノートを保持し、KEYの生成音声は再生成する。二重のWAVを保存しない。
- KEYの音源識別子は`rhodes-fm-v1`。ローズ風のFM音源試作であり、実機の完全再現や回路モデルと称していない。
- KEYはパッド内部の1～4小節フレーズ。既存A/B/C/Dのシーケンスとは独立する。
- KEYはワンショット。SEQのトリガーでフレーズを再生する。通常のチョーク／再トリガーを継承する。
- EDITの種類ボタンで選び、KEYはPIANO ROLLから編集。マスで追加／選択し、数値欄で音高・開始・長さ・強さを変更する。
- 長いピアノロールはスクロール。音域はOCTボタンで移動する。スクロールで誤って音を追加しない。
- MIDIはformat 0/1、PPQ形式。トラックを選んで取り込む。テンポは本体BPM、拍子は4/4。
- MIDIの4小節超過・音域補正・サステイン未対応等は案内する。SMPTE／format 2はエラーにする。
- SCRは通常のパッドタップで開く。EDIT/MUTE/SOLO/COPYを優先し、SEQから勝手に画面は開かない。
- SCRの指を離すと順再生する既存操作を継承。閉じるとworklet、関連ノード、イベント参照を解放する。
- FX列はMUTE/FILTER/DELAY/REVERB。MUTEはタップで対象パッドのミュート切替。
- FILTER/DELAY/REVERBはボタンから直接編集モーダルへ。ステップ／パッド上の専用ロックドラッグは廃止。
- PITCHは演奏用FXから撤去。サンプルのTUNEとKEYノート音高は維持。
- 旧ロック値を発音に適用しない。ベース設定とA/B/C/D別FX・ミュート・ソロは維持。
- リバーブは低～中送りのカーブをsqrtへ変更し、最大送りは1のまま。IRは1.5秒から1.8秒へ。
  聞こえ方の好みと実機での負荷・音量確認は別途必要。
- ファイル形式はv3の拡張フィールド。KEY/SCRを再現するにはこの機能に対応するアプリ版が必要。
  古いアプリが新しいパッド種類を再現するとは保証しない。

## Dropboxの外部設定（未設定ならここが残作業）

1. Dropbox App ConsoleでScoped Appを用意する。共有フォルダへアクセスするためFull Dropboxを選ぶ。
2. `files.metadata.read`、`files.content.read`、`files.content.write`を有効化する。
3. 実際に配信する本体HTMLのURL（origin + pathname、queryなし）をRedirect URIへ登録する。
4. App keyをアプリのDropbox欄へ入力する。App secretは使用せず、公開コードへ入れない。
5. メンバーをDropbox共有フォルダへ招待し、それぞれのアカウントに追加する。
6. 各端末で接続し、その端末から見えるフォルダパスを指定する。アプリは招待・権限変更を自動では行わない。
7. 認証はブラウザの短期トークン＋PKCE。タブのsessionStorageだけにトークンを保持する。期限切れは再接続する。
8. 別名保存はadd + strict_conflict。既存ファイルを自動上書きしない。失敗時は別名を指定する。
9. 実アカウントの認証、別メンバーの端末からの保存・読込は利用者の設定後に確認する。

参考公式資料：
- https://developers.dropbox.com/oauth-guide
- https://www.dropbox.com/developers/documentation/http/documentation

## 実機で確認すべきこと

- iPhoneでSafariとホーム画面起動の両方を確認する。他アプリ切替／ロック後の発音遅延、音量、二重発音。
- 復帰処理の時計同期は自動テストできるが、iOSの出力経路／Bluetoothの体感遅延を自動検査だけで判断しない。
- ローズ風音源の音色、KEYの強弱、和音、最大フレーズでのモバイル負荷。
- SCRの擦り心地、戻る操作、出力音量、連続開閉のCPU・メモリ。
- リバーブを短い打音と持続音で比較する。以前のステージでは低～中送りの効果が強くなる。
- Dropboxの共有権限・別端末・失敗・同名競合。自動テストは通信模擬のみで実ファイルへ書いていない。

## 自動検査

CIと同じPlaywright 1.56.1とTypeScript 5を使用。
通常の`node tools/build.mjs`、`node tools/gate.mjs`で検査する。
新機能検査は`tools/pad-content-check.mjs`を`tools/check.mjs`から呼ぶ。
BAR 2/4 HOLDのPATTERN/BAR/BEATも発音予約された全ステップを検査する。
具体的な最終検査結果は同梱の検査記録に記載する。


## 2026-10-25 local follow-up: v0.3.172 (not pushed)

User approved local implementation only. Claude's unpublished work remains unknown; do not copy this checkout over a working Claude checkout. Base remains 68d80845993a4c5f0b60a5612f4a3d1e75a4edbf. Recheck upstream and open PRs before integration; no remote changes made.

- KEY: direct draw/move/left+right resize, velocity lane, multi-selection, duplicate/delete/undo, fit/zoom, touch edit vs navigation, explicit drag tool for short mobile notes. Scale root/type/enabled and 1/16 snap independently persist under `keyPhrase.editor`. Enabling scale never rewrites imported notes; subsequent pitch edits constrain notes to the chosen scale. Snap OFF retains existing 1/96-beat precision.
- Instrument migrates from `rhodes-fm-v1` to `rhodes-tine-v2`: finite hammer pulse, damped modal tine/tonebar response, note-off damper, nonlinear pickup flux differentiated to voltage. 2x synthesis rate + lowpass/downsample. Reduced physical model voiced with heuristics, not a measured/calibrated hardware replica or a full collision/FEM solver. Rendering stays cached at edit time; no physical solver in the live scheduler. Preferences excluded from sound cache keys.
- Both FX rows now swipe left to a four-way full-width ABCD page and right back. Tap suppression prevents accidental FX dialogs, mute/edit toggles or pattern changes from swipes. Buttons reuse setEditPat/copyTap, existing queued/play indicators and PATTERN/BAR/BEAT timing. No new transport state.
- Extra changed areas: `src/js/61-layout.js`, `src/js/62-pattern-master.js`, `src/js/31-ui-copy.js`, `src/css/60-controls.css`, new `src/js/ui/fx-pattern-page.js`, manifest, gate and test additions.

Validation for this follow-up:
- `node tools/key-editor-unit.mjs`: 25 checks passed (real gesture code with DOM double, physical DSP and pitch/harmonics).
- `node tools/fx-pattern-page-unit.mjs`: 10 checks passed (two rows, direction, tap suppression, vertical/cancel/keyboard).
- build agreement, static/module checks and git diff whitespace check passed.
- Cloud Chrome GUI: actual note create/move/right resize, velocity 96→34, snap OFF on a non-1/16 onset, scale C-major pitch constraint, explicit Length tool, undo and autosave/reload confirmed; actual FX→ABCD→B→FX confirmed.
- Existing full 7-width Playwright gate NOT rerun in this follow-up. Existing KEY pointer test updated to the new canvas geometry; run full `node tools/gate.mjs` before integration.
- iPhone touch/latency, physical instrument sound quality, Dropbox real OAuth and shared-stage workflow still require user device/account checks.
- Trial HTML is separately packaged with default.mics inline and its own preview autosave DB. Local QA fixture that skips the passphrase is neither a source change nor part of the deliverable. Delivered trial retains original passphrase.

References (conceptual, code independently implemented):
https://www.ableton.com/en/manual/editing-midi/
https://www.dafx17.eca.ed.ac.uk/papers/DAFx17_paper_79.pdf


### Follow-up v0.3.173: phone layout and verification environment
- Phone editor now places Preview/Undo/Bars, navigation/drag/snap and scale in three compact rows. Extra tools use a native details disclosure (closed on phone, open on desktop). All controls remain the same instances/IDs, preserving event handlers and undo.
- In a real Chrome iframe viewport of 390×844, note grid and velocity were visible together with panel scrollTop=0; velocity bottom=693.3px. At 520×844, panel scrollWidth=clientWidth=491px, velocity bottom=679.3px. This is responsive desktop Chrome, not an iPhone touch or audio-latency test.
- Actual mobile-width GUI: FX swipe → full-width ABCD → B passed. Editor entry via SAMPLE → EDIT → PIANO ROLL passed. Stored notes and editor scale/snap restored.
- Full gate attempted on 2026-10-25. Its build/static/module/35 new unit checks and removal audit ran; browser-dependent checks could not run: Chromium process_singleton socket() returned Operation not permitted. Browser binary was restored, but the execution restriction remains. Do not mark full gate as passed. Run it in Claude's usual development environment before integration.
- `tools/pad-content-check.mjs` now also contains real-pointer FX↔ABCD checks for 390/1280 widths, target equality/minimum size, deliberate B tap and no FX dialog leak. These new browser assertions are prepared but not executed in this restricted environment.

- Final v0.3.173 also refits the piano roll after viewport resize unless the user chose manual zoom. Two additional regression checks pass (27 KEY + 10 swipe = 37). Chrome GUI confirmed 520px iframe canvasWidth=viewportWidth=454px after resizing from 390px.


## Local v0.3.174 handoff (not pushed)

Product direction from the user: this is microtone's playable pad/phrase instrument for live performance, rap and rehearsal. Keep editing as preparation and keep the performance surface direct. Live/Note note-editing conventions are a reference for editing only.

Changes:
- Contextual note cursors and clearer playback / NOTES / SOUND / edit-grid / scale grouping. Extra tools remain in a native disclosure on phone.
- `keyPhrase.effects`: independent `motion` = off/tremolo/wah and `color` = off/chorus/phaser, each with Depth/Rate. Saved/copied/restored through the existing normalizer. Old files default to bypass. Editing preferences excluded from sound cache keys; changing effects reuses the dry physical voice cache.
- Original, simplified tremolo, resonant swept/touch-influenced wah, two-tap modulated-delay chorus and four-stage allpass phaser DSP. CP/reface-style controls; no claim to reproduce Yamaha's proprietary VCM algorithms. Baked/cached per phrase. Parameter changes commit on slider release (one undo per gesture).
- KEY pad thumbnail uses MIDI note geometry and velocity, never its audio samples. SPL/SCR waveforms unchanged. Shared draw entry means loading/copy/undo/set changes use the same route.
- Reproduced reported bug before fixing: KEY→SPL→KEY returns original SPL audio because `_keySignature` survived restoration. Fix resets signature on kind change and validates buffers with a WeakSet before reusing/preparing/playing KEY. Valid copied/restored generated buffers remain recognised; inconsistent buffers are regenerated and never played as SPL under KEY.
- Editor Preview uses audition rather than trigger/REC path. Kind-change status no longer remains stuck on generating.

Validation: 62 KEY/editor/DSP/thumbnail/provenance checks plus 10 swipe checks pass; build/static/module/whitespace checks pass. Reproduction failure captured in key-type-repro.log in the task workspace. Cloud Chrome GUI checked phone mode cursor, SOUND slot selection, rate and preview, saved FX restoration after reload/kind roundtrip, and actual KEY mini-note pad drawing. Existing full browser regression gate still blocked by the execution environment's Chromium socket restriction. Run `node tools/gate.mjs` in the usual Claude development environment before merging. iPhone hardware audio latency and effect voicing still need device listening tests.

Keep source changes local until user approves push/publication; recheck latest main and Claude's unpublished work before integration. New shared files changed: `src/js/32-ui-wave.js`, `src/js/21-voice.js`, key phrase/instrument/editor modules and UI/CSS. Do not overwrite a Claude checkout wholesale.

Reference for effect control grouping: https://usa.yamaha.com/products/music_production/synthesizers/reface/reface_cp.html


## Local v0.3.175–176: FX correction, guitar retirement, SCR platter

User correction: normal FX taps must not act like EDIT. Normal FILTER/DELAY/REVERB selects live pad current-value editing; re-tap deselects with values preserved. Pad drag adjusts base values on one locked axis (right/up increases), one gesture = one undo. Step automation/locks stay disabled. EDIT+FX opens the corresponding parameter panel and clears live selection. MUTE remains a toggle. Smartphone EDIT is reachable at the end of the FX row. Swiping to ABCD clears live selection so pads return to playing; current values stay intact. Includes new `tools/fx-performance-unit.mjs` and updated browser assertions.

User retired Guitar: removed menu/recording entries, iframe integration and postMessage receiver. Historical standalone guitar-strum.html is not launched or packaged into the trial. Removed listeners/functions documented in tools/removals-ok.txt.

SCR interaction decision: pressing a SCR pad opens a large flat record plus fader, providing space for one hand on the platter and another on the cut fader. No hidden direct-scratch gesture on the small pad. Record motion is angular and relative; one revolution maps to 1.8 seconds of source motion (33⅓ rpm). Angle unwrap and unwrapped tape-head target prevent jumps at ±π/sample loops. Holding stops at current position, forward/back gesture moves playback, releasing returns to motor state. Pause, CUE and scratch-only crossfader are separate; backing transport is not stopped. Closing/visibility cleanup releases audio/UI nodes.

Architecture follows source units: audio/scratch-pad owns resampling, routing and controls; ui/scratch-view owns flat canvas and pointer/fader controls. One shared createScratchHead DSP core is used by AudioWorklet and ScriptProcessor compatibility driver (512-frame callback). Worklet is preferred; compatibility is for unavailable/blocked worklets and can have more timing jitter. It does not change browser security permissions. The shared crossfader precedes the scratch-only gain/sends and never changes the backing bus. These fader/motor states are transient, not stage parameters.

Validation: 62 KEY checks + 16 live-FX/EDIT checks + 11 swipe checks + 33 SCR DSP/routing/gesture/fallback/gate checks = 122 passed. Build/static/module/whitespace and intentional removal audit pass. Cloud Chrome 390px GUI: normal DELAY selected without modal, EDIT+DELAY opened 16-pad parameter panel; SCR pad opened platter via compatibility driver; manual quarter-turn moved source position while motor paused; release retained pause; fader Home reached 0%. New source units passed module contracts. Full 7-width browser gate remains unrun because local Chromium socket startup is restricted; iPhone simultaneous touch and audible scratch feel need real-device checks.

No push/publication. Keep isolated from Claude's unpublished work; recheck/reconcile before integration. Latest candidate supersedes the old direct-FX-modal instruction in earlier handoff sections.

Latest SCR steering: fader is a momentary HOLD gate, not a slider. It starts CLOSED. Pointer/key down opens only SCR audio; up/cancel/lost capture/focus loss/close closes it. Separate pointer capture keeps platter and gate independent. A 3ms gain ramp suppresses clicks. Motor/record motion continue independently. Native two-finger iPhone testing remains outstanding.


## v0.3.177 production candidate (2026-10-25)

User now authorizes production publication if checks pass. This supersedes the local-only boundary above. Upstream main was rechecked at 68d80845993a4c5f0b60a5612f4a3d1e75a4edbf; no open PRs at preparation time. Do not overwrite other working checkouts.

SCR PC/MIDI input now opens its assigned platter and momentary gate while held, closes on release, and leaves the platter visible. Default/custom PC keys and MIDI notes use the same helper; MIDI channels are independent, Note Off and velocity-zero Note On both release, and repeats do not reopen/reset playback. Async startup retains releases and multiple held sources. Blur/close and MIDI disconnection release gates. Touch HOLD remains available.

Validation: KEY 62 + FX performance 16 + FX swipe 11 + SCR 48 = 137 unit checks passed; source/build/module/static/whitespace checks pass. SCR tests include real keyboard and MIDI handlers. Local full browser gate remains blocked by environment Chromium sockets; push the candidate branch for GitHub CI and do not merge unless CI gate passes. Native iPhone feel/audio and Dropbox OAuth still need real-device/account verification.


### v0.3.178 CI alignment
First full CI run 40164349828 executed the complete seven-width regression suite, new content acceptance tests, and control/removal audits. Four stale expectations failed: three still expected mobile EDIT to be hidden, and EDIT drag expected the pre-existing live FX selection to be null. Actual pad swapping and values were correct. Update these expectations to the intended visible EDIT and priority of EDIT over live FX; additionally check two distinct delay sends move unchanged with their pads. No product behavior change in this follow-up. Repeat the complete gate before merge.
