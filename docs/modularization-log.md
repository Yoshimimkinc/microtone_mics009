# 保守性改善の実施記録（docs/maintainability-modularization-plan.md の進捗）

計画書の各フェーズを「何をしたか・結果はどうだったか」で残す。判断は計画書、記録はこちら。

## Phase 0：現状の固定（2026-09-17、HEAD 1a0ed01 = v0.3.128）

ヘッダも検査器も入れる前の、動いている状態の基準。

| 項目 | 結果 |
|---|---|
| `node tools/build.mjs --check` | ✔ mics-609bc14b.html は src と一致（45部品 / v0.3.128） |
| static-check | 暗黙グローバル 0 件／存在しない id 参照 0 件／バージョン3点一致 |
| check.mjs（回帰・5幅） | ✅ 全項目パス（既存の失敗なし） |
| dead-controls | 押しても何も起きないコントロール 0 件 |
| lost-listeners（origin/main 比） | 消えた登録 0／関数 0／要素参照 0 |
| deadcss | 使われていない候補 0 件 |
| ui-audit | 390×844：視認性 57／触れる 100／静けさ 100／画面予算 100、1280×800：53／100／100／82.6 |
| gate.mjs | ✔ 全関門クリア（exit 0） |
| 検査スクショ | `tools/_shots/`（7枚。CI では Artifacts `shots-<run>` に14日保存） |

### manifest の連結順（JS 25 部品）
`src/manifest.json` の `parts` のうち JS：
00-boot → 10-engine-core → 11-engine-master → 12-engine-bus → 13-engine-fx → 20-plock-undo → 21-voice → 22-presets →
30-ui-pads → 31-ui-copy → 32-ui-wave → 33-ui-window → 40-transport → 41-step-strip → 50-menu → 51-edit-modal → 52-chop →
60-autosave → 61-layout → 62-pattern-master → 70-sampling → 71-save-load → 72-midi → 73-share-export → 80-skin-version-splash

### ファイルごとの最上位宣言と参照（AST から機械的に導出）
最上位宣言 **402 個**、2ファイルで同名を宣言しているもの **0 件**、
読み込み時（最上位の文・即時実行関数）に後ろのファイルを参照しているもの **0 件**（＝連結順の前方参照は無い）。

| ファイル | @module | 提供 | 使用 | 読み込み時に依存（@depends） |
|---|---|---:|---:|---|
| `js/00-boot.js` | boot | 6 | 0 | — |
| `js/10-engine-core.js` | engine-core | 10 | 1 | — |
| `js/11-engine-master.js` | engine-master | 34 | 2 | engine-core |
| `js/12-engine-bus.js` | engine-bus | 27 | 10 | engine-core, engine-master |
| `js/13-engine-fx.js` | engine-fx | 51 | 10 | boot, engine-core, engine-master |
| `js/20-plock-undo.js` | plock-undo | 24 | 41 | — |
| `js/21-voice.js` | voice | 11 | 27 | — |
| `js/22-presets.js` | presets | 3 | 4 | — |
| `js/30-ui-pads.js` | ui-pads | 27 | 50 | boot |
| `js/31-ui-copy.js` | ui-copy | 14 | 27 | — |
| `js/32-ui-wave.js` | ui-wave | 12 | 11 | — |
| `js/33-ui-window.js` | ui-window | 7 | 24 | — |
| `js/40-transport.js` | transport | 28 | 39 | — |
| `js/41-step-strip.js` | step-strip | 8 | 26 | boot, plock-undo, transport |
| `js/50-menu.js` | menu | 0 | 19 | — |
| `js/51-edit-modal.js` | edit-modal | 12 | 29 | — |
| `js/52-chop.js` | chop | 24 | 51 | engine-bus, engine-fx, ui-pads |
| `js/60-autosave.js` | autosave | 15 | 8 | presets |
| `js/61-layout.js` | layout | 21 | 29 | — |
| `js/62-pattern-master.js` | pattern-master | 20 | 32 | — |
| `js/70-sampling.js` | sampling | 24 | 19 | — |
| `js/71-save-load.js` | save-load | 6 | 16 | — |
| `js/72-midi.js` | midi | 12 | 17 | — |
| `js/73-share-export.js` | share-export | 5 | 52 | layout |
| `js/80-skin-version-splash.js` | skin-version-splash | 1 | 4 | autosave |

「提供」＝そのファイルがファイル直下で宣言する関数・変数の数。「使用」＝他ファイルの提供物のうち参照している数。
「読み込み時に依存」＝その参照が最上位の文（または IIFE の中）で起きるもの。関数の中からの参照は実行が後なので含めない。

### 既知の前提
- すべての JS は1つの `<script>` に連結され、同じグローバルスコープで動く（計画書「現状認識」のとおり）
- 関数宣言は巻き上がるので、関数の中から後ろのファイルの関数を呼ぶのは正常。壊れるのは「読み込み時に後ろの let/const を触る」場合だけ

### 完了条件
- [x] 変更前の基準となるテスト結果がある（上表）
- [x] ビルドと gate が通る
- [x] 既存の失敗は無い

## Phase 1：依存関係の明示（v0.3.129）

実行方式は変えない（単純連結のまま）。各 `src/js/*.js` の先頭にヘッダを入れ、`tools/module-check.mjs` で実装と突き合わせる。

### やったこと
- **ヘッダは手書きしない。** `node tools/module-check.mjs --write` が TypeScript の構文解析で実装から導いて書く
  （`@provides` ＝ ファイル直下の宣言、`@uses` ＝ 他ファイルの提供物への参照、`@depends` ＝ 読み込み時の参照先モジュール）。
  計画書の「主要な契約だけ」ではなく**全部**を機械的に列挙した。人が選ぶと漏れるし、全部あれば「不一致」を検査できる
- `@depends` の定義を「読み込み時に要る」に絞った。関数の中からの参照は実行が後で連結順に縛られないので `@uses` にだけ載る。
  これで「manifest 順で依存先が前に無い」検査が意味を持つ（全部を depends にすると後ろのファイルも大量に入って必ず落ちる）
- `tools/module-check.mjs`：6つの検査（計画書のとおり）＋「読み込み時に後ろのファイルの let/const を参照（TDZ）」を実装の問題として止める
- `tools/gate.mjs` の static-check の直後に組み込んだ（ブラウザ不要・1秒。CI の gate と pre-push も同じ経路）
- `@module` 名はファイル名から番号を除いたもの（`30-ui-pads.js` → `ui-pads`）。計画書 Phase 2 の論理分類（`ui/pads-view` 等）へは、
  ファイルを動かす時に付け替える

### 結果
| 項目 | 結果 |
|---|---|
| ヘッダを入れたファイル | 25（`src/js/*.js` 全部） |
| 最上位宣言（`@provides` の総数） | 402（同名の二重宣言 0） |
| 読み込み時の前方参照 | 0（`@depends` は全て manifest で前にある） |
| `node tools/module-check.mjs` | ✔ 問題なし |
| `node tools/build.mjs --check` | ✔ 一致 |
| `node tools/gate.mjs` | ✔ 全関門クリア |
| 既存の動作 | 変更なし（差分はコメント行のみ。公開 HTML は 302KB → 315KB、gzip 後の差はごく小さい） |

### 解析で分かったこと（Phase 2 以降の材料）
- 読み込み時に他ファイルへ依存するのは 9 ファイルだけ。残りは関数の中からの参照だけ＝連結順を入れ替えても壊れない
- `@uses` が多いのは `share-export`（52）、`chop`（51）、`ui-pads`（50）、`plock-undo`（41）、`transport`（39）。責務分離の候補はここ
- `menu` は提供 0／使用 19＝配線だけのファイル。`boot` は提供 6／使用 0＝定数だけ

### 未解決
- ヘッダは公開 HTML にもコメントとして入る（build は連結するだけ）。削る必要が出たら build 側で先頭ヘッダだけ落とす
- `@provides` は「ファイル直下の宣言」であり、`window.x=` での公開や、DOM の id による暗黙グローバル（static-check が見る）は含めない

### 完了条件
- [x] 既存の動作が変わらない
- [x] `node tools/build.mjs --check` が通る
- [x] `node tools/module-check.mjs` が通る
- [x] `node tools/gate.mjs` が通る

## Phase 2：論理的な責務分離（v0.3.130〜。段階的に進める）

「ファイルを増やすこと自体を目的にしない」。まず論理分類を記録し、計画書が名指しする `30-ui-pads.js` から分ける。

### 論理分類（現在のファイル → 目標の置き場）
| 目標 | 現在のファイル | 状態 |
|---|---|---|
| `app/boot` | `00-boot.js` | 定数だけ（KEYMAP / PADS / STEPS）。Phase 3 で `app/state` を隣に置く |
| `audio/*` | `10-engine-core` `11-engine-master` `12-engine-bus` `13-engine-fx` `21-voice` `22-presets` | 安定。`13-engine-fx` に `selected` / `activeLock` 等の**UI状態**が混ざっている（Phase 3 で `app/state` へ） |
| `data/*` | `20-plock-undo`（p-lock と undo）、**`data/pads`（新）** | `31-ui-copy` の `swapPads` / `copyPattern` / `copyBar` は次の段で `data/` へ |
| `ui/*` | **`ui/status` `ui/pads-view` `ui/performance-view` `ui/seq-view`（新）**、`32-ui-wave` `33-ui-window` `41-step-strip` `61-layout` `62-pattern-master` `51-edit-modal` `50-menu` `80-skin-version-splash` | `61-layout` の P-LOCK 表示（perfFillPad / renderPerfFills / perfLockApply）は `ui/performance-view` へ寄せる候補 |
| `features/*` | `31-ui-copy`（COPY）、`52-chop` `70-sampling` `71-save-load` `72-midi` `73-share-export` `60-autosave` | `40-transport` は `audio/`（スケジューラ）と `ui/`（表示）が混在 |

### 第1段：`30-ui-pads.js`（317行・責務9つ）を5つに（v0.3.130）
コードは**そのまま移す**（動作を変えない）。唯一の手術は、パッド生成ループの中に埋まっていた P-LOCK 操作を
`perfPadDown / perfPadMove / perfPadEnd` の3関数に切り出したこと（呼び出し順・中身は同じ）。

| 新ファイル | @module | 中身 | 行 |
|---|---|---|---:|
| `js/ui/status.js` | `ui/status` | `sampNameEl`（トースト）。パッド以外からも使う共通の出口 | 19 |
| `js/ui/pads-view.js` | `ui/pads-view` | `padsEl`／パッド生成／`selectPad`／`paintPadStates`／EDIT 中の並べ替え／`armMode` `copyArm` | 147 |
| `js/ui/performance-view.js` | `ui/performance-view` | P-LOCK 選択中のパッド操作（横ドラッグ＝値、ダブルタップ＝戻す） | 47 |
| `js/ui/seq-view.js` | `ui/seq-view` | SEQ グリッド生成／`paintSteps`／`moveCursors`（表示だけ） | 105 |
| `js/data/pads.js` | `data/pads` | `copyPadSound`／`chopBaseName`／`nextChokeGroup`（データ更新の入口） | 27 |

manifest では旧 `30-ui-pads.js` の位置にこの順で入る。`@module` 名は **`js/` からの相対パス**（`ui/pads-view`）にした。
番号付きファイルは従来どおりファイル名（`chop`）。`module-check` が `@module` とパスの一致も見る。

### 解析器の修正（この段で分かったこと）
`PADS.forEach((p,i)=>{ … i===selected … })` のような**配列の同期コールバック**は読み込み時に走るのに、
関数の中＝「後で実行」と扱っていたため `@depends` から `engine-fx`（`selected` の持ち主）が漏れていた。
`forEach / map / filter / some / every / reduce / find / sort` の引数は読み込み時扱いにした
（`addEventListener` / `setTimeout` / `requestAnimationFrame` / `MutationObserver` の引数は後で呼ばれるので含めない）。

### 分離時の規則（計画書）に対する現状
- `paintSteps` / `moveCursors` / `paintPadStates` は表示更新だけ ✔
- `copyPadSound`（`data/pads`）はまだパッド名・SEQ 行名・波形の描画も自分でやる → 次の段で描画を `ui/` 側の関数へ
- 音を鳴らす処理を描画関数に増やしていない ✔

### 結果
| 項目 | 結果 |
|---|---|
| 部品 | 45 → 49（JS 25 → 29） |
| 最上位宣言 | 402 → 405（`perfPadDown / perfPadMove / perfPadEnd` の3つが増えた分。消えたものは無い） |
| `module-check` | ✔ 問題なし（`ui/pads-view` `ui/seq-view` は `boot, engine-fx` に読み込み時依存） |
| `lost-listeners`（origin/main 比） | 消えた登録 0／関数 0／要素参照 0（移しただけで何も失っていない） |
| `gate` | ✔ 全関門クリア（回帰 全項目パス、無反応 0、deadcss 0） |

### 第2段：データ更新と描画を分ける（v0.3.131）
第1段の「分離時の規則に対する現状」で残した3点を片づけた。コードは**そのまま移す**が、今回は2箇所だけ手術がある
（`copyPadSound` / `swapPads` から描画を抜き、呼び出し側が `refreshPadDisplay` を呼ぶ）。

| 動かしたもの | 元 | 先 | 備考 |
|---|---|---|---|
| `copyPattern` / `copyBar` | `31-ui-copy` | **`js/data/patterns.js`（新、`data/patterns`）** | DOM を触らない。`doCopy` が呼ぶ |
| `swapPads` | `31-ui-copy` | `data/pads` | 末尾の `refreshPadDisplay(a); refreshPadDisplay(b);` を抜いた（描画は呼び出し側） |
| `copyPadSound` の描画部（カテゴリ色・パッド名・SEQ 行名・波形） | `data/pads` | 呼び出し側が `refreshPadDisplay(dst)` | `doCopy`（COPY モード）と `ui/pads-view` のドラッグ（長押しコピー）の2箇所 |
| `refreshPadDisplay` | `31-ui-copy` | `ui/pads-view` | パッド表示を作り直す**唯一の口**。`52-chop` からも従来どおり呼ぶ |
| `perfFillPad` `plockFillsOn` `renderPerfFills` `perfRevertSnap` `perfReadVals` `perfLockApply` | `61-layout` | `ui/performance-view` | 61-layout に残るのは `updatePerf` と `#perfPlk` の配線（これらは関数呼び出しなので順序は問わない） |

`31-ui-copy` は COPY の操作・表示（`copyTap` `doCopy` `paintCopyHL`）と mode の arm（`arm` `bindHold` `assignMS`）だけになった。
`61-layout` は 282 → 225 行、`31-ui-copy` は 144 → 105 行。

#### 動作の差（意図したもの）
- COPY / MOVE のあとに **ステップ波形（`buildTrackWave`）も作り直す**ようになった。旧 `copyPadSound` は
  パッド名と波形は描き直したがステップ列の波形キャッシュは古いままだった（`refreshPadDisplay` はもともと作り直していた）
- パッド名の表示は `tracks[i].name` から作る（8文字・大文字）。旧 `copyPadSound` はコピー元の**表示文字列**を写していたので、
  録音直後（`70-sampling` が `.nm` に生の名前を入れる）のパッドをコピーすると先だけ整形されて見える。
  表示の出どころが1つになった分だけ揃う方向。`70-sampling` 側の `.nm` 直書きは次の段で `refreshPadDisplay` に寄せる候補

#### 検査
`check.mjs` に `copyPaint`：COPY（`doCopy`）で名前・パッド表示・SEQ 行名が先へ写る／EDIT 中のドラッグ MOVE で
データと表示が両方入れ替わる／`doUndo` で戻る。あわせて §140（文字選択の禁止）もここで見る。

### 結果（第2段）
| 項目 | 結果 |
|---|---|
| 部品 | 49 → 50（JS 29 → 30：`data/patterns` が増えた） |
| 最上位宣言 | 405 → 405（増減なし＝移しただけ） |
| `module-check` | ✔ 問題なし（`--write` でヘッダ6件を実装に合わせた） |
| `lost-listeners`（origin/main 比） | 消えた登録 0／関数 0／要素参照 0 |
| `gate` | ✔ 全関門クリア |

### 次の段の候補
- `70-sampling` / `52-chop` / `73-share-export` にある `.nm` の直書きを `refreshPadDisplay` へ（表示の出どころを1つに）
- `perfRevertSnap` / `perfReadVals` は tracks を書き換える＝データ側。Phase 3 の `app/state` と一緒に置き場を決める
- `40-transport` のスケジューラ（音）と表示の分離
