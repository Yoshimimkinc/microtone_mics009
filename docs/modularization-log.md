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

### 第3段：パッド名の表示を1つの口に／transport を音と表示に分ける（v0.3.132）
| 動かしたもの | 元 | 先 | 備考 |
|---|---|---|---|
| パッド名の描画（`.nm` 8文字大文字＋SEQ 行名 `.rn`） | `20-plock-undo`（undo 復元）`51-edit-modal`（改名）`52-chop`（LOAD）`70-sampling`（録音・GTR 取込）`73-share-export`（読込）の**5箇所の直書き** | **`paintPadName(i)`（`ui/pads-view`、新）** | `refreshPadDisplay` もこれを使う。`setDrumRowLabels` は `paintPadName` を16回呼ぶだけに |
| LOAD・録音・GTR 取込のあとの描画（カテゴリ色＋名前＋波形） | それぞれが `applyPadCategory` `.nm` `drawPadWave` を並べていた | `refreshPadDisplay(i)` 1回 | |
| スケジューラ（`bpmVal` `swingPct` tick 導出 `scheduleStep` `scheduler` メトロノーム） | `40-transport` | **`js/audio/transport.js`（新、`audio/transport`）** | 音の側。`audio/` ディレクトリの最初の住人 |
| `drawLoop` ▶ / ● ボタン `updateRecBtnLabel` | `40-transport` | **`js/ui/transport-view.js`（新、`ui/transport-view`）** | `drawQueue` を rAF で消化して点灯・カーソル・パターン枠を描くだけ＝音は出さない |

#### 直った不具合（直書きを1つにしたら見つかった）
- **LOAD したパッドの SEQ 行名が古いままだった**（`52-chop` はパッド内の名前しか書き換えていなかった）。
  録音（`70-sampling`）も同じ。`refreshPadDisplay` 経由でステップ列の波形キャッシュも作り直すようになった
- GTR 取込は名前を整形せず（生の10文字）に書いていた → 他と同じ 8文字大文字に揃った

#### 検査
`check.mjs` `copyPaint` に追加：MOVE の undo で**表示も**戻る（`restoreState` → `paintPadName`）／
LOAD（`#samp` に WAV）で名前・パッド表示・SEQ 行名・種別が揃う。

### 結果（第3段）
| 項目 | 結果 |
|---|---|
| 部品 | 50 → 51（JS 30 → 31：`audio/transport` と `ui/transport-view` が `40-transport` の代わりに入り、`paintPadName` が増えた） |
| 最上位宣言 | 405 → 406（`paintPadName`） |
| `module-check` | ✔ 問題なし（`--write` でヘッダ9件） |
| `lost-listeners`（origin/main 比） | 消えた登録 0／関数 0／要素参照 0 |
| `gate` | ✔ 全関門クリア |

### 次の段の候補
- `perfRevertSnap` / `perfReadVals` は tracks を書き換える＝データ側。Phase 3 の `app/state` と一緒に置き場を決める
- `13-engine-fx` に混ざる UI 状態（`selected` `activeLock` `perfDrag` …）→ Phase 3 `app/state`
- 番号付きファイルの残り（`31-ui-copy` → `features/copy`、`52-chop` → `features/chop` …）は、触る用事が出たときに動かす

## Phase 3：アプリ状態の集約（v0.3.133〜。段階的に進める）

計画書の Phase 3 は「`AppState` オブジェクト＋アクセサを足し、直接代入を段階的に置き換える」。
ただし `AppState.selected` と `let selected` が並ぶ期間は**真が2つ**になる（このプロジェクトが一番嫌う形）。
そこで順番を変えた：**まず宣言の場所を1つにし、書く入口を機械で限定する**。オブジェクト化は入口が絞れてから判断する。

### 第1段：`app/state.js` と `@writers`（v0.3.133）
| 動かしたもの | 元 | 先 |
|---|---|---|
| `selected` `playing` `recording` `stepIdx` `playStep` `playPat` `playBar` `queuedPat` `displayPat` `displayBar` `editPat` `editBar` `activeLock` `editDrag` `perfDrag` `peTarget` `peOpenedAt` `peV0` `peV1` `assignTarget` `perfRecArm` `perfSnap` `perfLast` `perfTapT` | `13-engine-fx` | **`js/app/state.js`（新、`app/state`。manifest で `00-boot` の直後）** |
| `melodicMode` | `20-plock-undo` | 同上 |
| `armMode` `copyArm` | `ui/pads-view` | 同上 |
| `bpmVal` `swingPct` | `audio/transport` | 同上 |

中身も初期値も動かしていない。`_ledT`（ASSIGN の LED タイマ）は状態ではなく engine-fx の都合なので残した。
`tracks` / `PADS` は計画書どおり最後（音源と保存形式に密）。

#### `@writers`：状態を書いてよいモジュールを宣言行に書き、`module-check` が見張る
```js
let selected = 0;   // 選択中パッド   @writers ui/pads-view
let bpmVal = 100;   // テンポ（保存）。書く入口は applyBpm（chop）   @writers chop, plock-undo, share-export
```
`module-check` の検査 7)：`app/state` の各変数について、代入（`x=` `x+=` `x++`）している他ファイルのモジュールが
`@writers` に無ければ止める（`ファイル:行` を名指し）。逆に列挙にあるのに書いていないモジュールは警告（列挙を減らせる）。
入れた時点で警告 0 ＝ 列挙は現実と一致している。

#### 迷子の直書きを入口へ（この段で直したもの）
| 場所 | 前 | 後 |
|---|---|---|
| `70-sampling` EDIT モーダルの LOAD / ● SMPL | `selected=peTarget`（選択表示は更新されない） | `selectPad(peTarget)` |
| `72-midi` 外部クロック同期 | `bpmVal=…` ＋ `#bpm` `#bpmRead` を自前で更新（ディレイのテンポ追従・再生中の位相維持が無い） | `applyBpm(…)`（テンポの唯一の入口） |

#### 書く入口の現状（`@writers` から）
- 入口関数がある：`selected`→`selectPad`、`editPat/editBar`→`setEditPat/setEditBar`、`activeLock`→`setActiveLock`、`bpmVal`→`applyBpm`
- 復元経路（`plock-undo` の `restoreState`、`share-export` の `applyProject`）は保存対象を直接書く。これは入口の一種として許容
- 再生系（`playing` `stepIdx` …）は `audio/transport` と `ui/transport-view` の2つが書く。▶ の処理を `startTransport / stopTransport` に
  まとめれば `ui/transport-view` は呼ぶだけになる → 次の段の候補

### 結果（Phase 3 第1段）
| 項目 | 結果 |
|---|---|
| 部品 | 51 → 52（JS 31 → 32：`app/state`） |
| 最上位宣言 | 406 → 406（移しただけ） |
| `module-check` | ✔ 問題なし・警告 0（検査 7 を追加。迷子の書き込みを故意に足すと `ファイル:行` で止まることを確認） |
| `lost-listeners`（origin/main 比） | 消えた要素参照 2（`72-midi` の `bi` `br`：`applyBpm` に置換。`removals-ok.txt` に記録） |
| `gate` | ✔ 全関門クリア |

### 次の段の候補
- ▶ / ■ を `startTransport / stopTransport`（`audio/transport`）にまとめ、`ui/transport-view` は呼ぶだけに
- `perfRevertSnap / perfReadVals`（tracks を書く）を `data/` へ
- `tracks` / `PADS` の書き手の一覧化（`@writers` と同じ仕組みで `t.xxx=` を数える）
- Phase 4：開発用プレビュー（`tools/dev.html`）

### 第2段：▶ / ■ を `startTransport / stopTransport` に、`tracks` / `PADS` の書き手を一覧化（v0.3.134）
| 動かしたもの | 元 | 先 |
|---|---|---|
| 再生開始（`playing=true`・ステップ/パターンの頭出し・`barStartTime`・スケジューラ起動） | `ui/transport-view` の ▶ ハンドラ | **`startTransport()`（`audio/transport`）** |
| 停止（`playing=false`・スケジューラ停止・`stopVoices`・ループ状態リセット） | 同上 | **`stopTransport()`（`audio/transport`）** |

▶ ボタンは `if(!playing) startTransport(); else stopTransport();` の後に**表示だけ**（ボタンの字・`drawLoop`・VU・カーソル消し）。
Space / MIDI Start・Stop / GTR / 共有の試聴は従来どおり `playBtn.click()` でここを通る＝表示が必ず追従。
`@writers`：`playing` `stepIdx` `playPat` `playBar` `queuedPat` から `ui/transport-view` が消え、再生系の書き手は `audio/transport` だけになった
（`playStep` `displayPat` `displayBar` は `drawLoop` が進めるので両方）。

#### `tracks` / `PADS` の書き手（`node tools/module-check.mjs --tracks`）
計画書が「最後に扱う」とした `tracks` / `PADS` の下調べ。`tracks[i].xxx=` と、別名（`const t=tracks[i]` / `tracks.forEach(t=>…)` / `for(const t of tracks)`）
経由の `t.xxx=` を数える。`t[prop]=` のような動的なキー（P-LOCK の適用など）は数えていない。

| 書かれる属性 | 書き手（モジュール：回数） | 書き手の数 |
|---|---|---:|
| `tracks.start` | plock-undo:1, presets:1, data/pads:1, ui-wave:1, edit-modal:4, chop:3, sampling:1, share-export:1 | 8 |
| `tracks.buffer` | plock-undo:1, presets:1, data/pads:1, edit-modal:1, chop:3, sampling:1, share-export:2 | 7 |
| `tracks.end` | plock-undo:1, presets:2, data/pads:1, edit-modal:4, chop:3, sampling:1, share-export:1 | 7 |
| `tracks.loopStart` | plock-undo:1, presets:1, data/pads:1, edit-modal:4, chop:3, sampling:1, share-export:1 | 7 |
| `tracks.rawBuffer` | plock-undo:1, presets:1, data/pads:1, edit-modal:1, chop:3, sampling:1, share-export:2 | 7 |
| `tracks.cutoff` | engine-fx:1, plock-undo:1, ui/performance-view:2, data/pads:1, chop:1, share-export:1 | 6 |
| `tracks.filter` | engine-fx:1, plock-undo:1, ui/performance-view:3, data/pads:1, chop:1, share-export:1 | 6 |
| `tracks.loop` | plock-undo:1, presets:1, data/pads:1, chop:3, sampling:1, share-export:1 | 6 |
| `tracks.name` | plock-undo:1, data/pads:1, edit-modal:1, chop:3, sampling:2, share-export:1 | 6 |
| `PADS.type` | plock-undo:1, data/pads:3, chop:3, sampling:1, share-export:1 | 5 |
| `tracks.mute` | plock-undo:1, ui/pads-view:1, ui-copy:1, chop:1, share-export:1 | 5 |
| `PADS.voice` | plock-undo:1, data/pads:3, chop:2, share-export:1 | 4 |
| `tracks.choke` | plock-undo:1, data/pads:1, chop:2, share-export:1 | 4 |
| `tracks.key` | plock-undo:1, data/pads:1, ui-window:1, share-export:1 | 4 |
| `tracks.loopPlaying` | voice:2, ui/seq-view:2, audio/transport:5, share-export:1 | 4 |
| `tracks.midiNote` | plock-undo:1, data/pads:1, ui-window:1, share-export:1 | 4 |
| `tracks.reso` | plock-undo:1, data/pads:1, chop:1, share-export:1 | 4 |
| `tracks.tune` | plock-undo:1, data/pads:1, chop:2, share-export:1 | 4 |
| `tracks.vol` | plock-undo:1, data/pads:1, chop:2, share-export:1 | 4 |
| `tracks.attack` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.delaySend` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.fade` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.locks` | plock-undo:3, ui-copy:1, share-export:1 | 3 |
| `tracks.outBus` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.reverbSend` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.scale` | plock-undo:1, data/pads:1, share-export:1 | 3 |
| `tracks.solo` | plock-undo:1, ui-copy:1, share-export:1 | 3 |
| `PADS.name` | edit-modal:1, share-export:1 | 2 |
| `tracks.patterns` | plock-undo:1 | 1 |

属性 29 種 / 代入 177 箇所

読み方：
- どの属性も `plock-undo`（undo 復元）と `share-export`（.mics 読込）と `data/pads`（COPY / MOVE）が書く。これは復元・複製の経路で、入口の一種
- それ以外の「本当の編集入口」は属性ごとにほぼ1〜2箇所：`start/end/loopStart` は `edit-modal`（ハンドル）と `chop`（LOAD / CHOPPY）、
  `cutoff/filter` は `ui/performance-view`（P-LOCK ドラッグ）と `chop`、`name` は `edit-modal`（改名）と `chop` `sampling`（取込名）
- `loopPlaying` だけは音側（`voice` `audio/transport`）と表示側（`ui/seq-view`）の両方が書く＝Phase 3 の次の段で見る候補
- `tracks.patterns` は `plock-undo` の復元だけ（ステップの ON/OFF は `patterns[p][b][s]=` の要素代入で、この表には出ない）

### 結果（Phase 3 第2段）
| 項目 | 結果 |
|---|---|
| 部品 | 52（変わらず） |
| 最上位宣言 | 406 → 408（`startTransport` `stopTransport`） |
| `module-check` | ✔ 問題なし・警告 0（`--tracks` レポートを追加） |
| `check.mjs` | 7i に「▶ で startTransport（playing・スケジューラ・ボタン）」「■ で stopTransport（…カーソル・ボタン）」を追加 |
| `gate` | ✔ 全関門クリア |

### 次の段の候補
- `loopPlaying` の書き手を音側に寄せる（`ui/seq-view` はトグル要求を投げるだけに）
- ステップの ON/OFF（`patterns[p][b][s]=`）の書き手を `--tracks` に含める
- Phase 4：開発用プレビュー（`tools/dev.html`）

### 第3段：`loopPlaying` を音側へ、ステップの書き口を `setStep` に（v0.3.135）
| 動かしたもの | 元 | 先 |
|---|---|---|
| 手叩きのループ・トグル（発音中なら止める／鳴らして `loopPlaying=true`） | `21-voice` の `trigger` と `ui/seq-view` の行名クリック（音階モード）の**2箇所に同じ分岐** | **`hitVoice(i, semi, accent)`（`21-voice`）**。戻り値 true=鳴った。表示（点灯・VU・記録）は呼び出し側 |
| 全パッド停止＋ループ状態リセット | `stopTransport`（`audio/transport`）と `applyProject`（`share-export`）の同じ1行 | **`stopAllVoices(when)`（`21-voice`）** |
| ステップの ON/OFF（`getPattern(i)[s]=v` ＋ OFF なら `clearLockEdit`） | `ui/seq-view`（通常・音階の2箇所）と `41-step-strip`（`toggleStepAt`、ドラッグの自動 ON） | **`setStep(i, s, v)`（`data/patterns`）** |

`loopPlaying` の書き手は `voice` と `audio/transport`（スケジューラ）だけになった。`ui/seq-view` は音を出す判断をしない。

#### `--tracks` の拡張：要素代入も数える
`t.patterns[p][b][s]=` / `getPattern(i)[s]=` / `t.locks[k]=` / `t[prop]=` のような **`[…]` を含む代入**も追う（`[·]` で表す。
`const pat=getPattern(i)` の別名は `tracks.patterns[·][·]` として扱う）。増えた行：

| `tracks.patterns[·][·][·]` | voice:1, data/patterns:1, ui-copy:1 | 3 |
| `tracks[·]` | engine-fx:1, ui/performance-view:4, data/pads:2, midi:2 | 4 |
| `tracks.locks` | plock-undo:3, ui-copy:1, share-export:1 | 3 |
| `tracks.locks[·]` | plock-undo:2, data/patterns:2, ui-copy:1 | 3 |
| `tracks.loopPlaying` | voice:3, audio/transport:4 | 2 |
| `tracks.patterns[·][·]` | data/patterns:2, share-export:3 | 2 |
| `tracks.locks[·][·]` | plock-undo:2 | 1 |
| `tracks.patterns` | plock-undo:1 | 1 |

読み方：
- `tracks.patterns[·][·][·]`（ステップ1つ）は `data/patterns`（`setStep`）のほか、`ui-copy`（ノートの COPY）と `voice`（● REC 中の手叩きを
  `trigger` が直接書く）。`step-strip` の「値を入れたら自動 ON」も `setStep` に寄せた。次の段で `voice` の分を `setStepAt(i,p,b,s,v)` に寄せる候補
- `tracks[·]`（`t[prop]=`：キーが動的）は P-LOCK の適用（`ui/performance-view` `engine-fx`）、COPY（`data/pads`）、MIDI CC（`midi`）
- `tracks.locks[·]` は `plock-undo`（`setLockEdit` 等の入口）と `data/patterns`（COPY）と `ui-copy`（ノート COPY）

### 結果（Phase 3 第3段）
| 項目 | 結果 |
|---|---|
| 部品 | 52（変わらず） |
| 最上位宣言 | 408 → 411（`hitVoice` `stopAllVoices` `setStep`） |
| `--tracks` | 29 属性・177 箇所 → 34 種・199 箇所（要素代入を含めた分。`loopPlaying` の書き手 4 → 2） |
| `check.mjs` | `hitVoice` のトグルと `stopAllVoices`／`setStep` の ON・OFF（OFF で p-lock も消える）を追加 |
| `gate` | ✔ 全関門クリア |

### 次の段の候補
- ● REC 中の手叩き記録（`voice` が `patterns[displayPat][displayBar][playStep]=` を直接書く）を `data/patterns` の `setStepAt` に
- Phase 4：開発用プレビュー（`tools/dev.html`）

## Phase 4：開発用プレビュー（v0.3.136）

`tools/dev.html`。`src/manifest.json` の順に部品を**そのまま**読み込む（バージョンは `version.json` を差し込む）。
ビルドを挟まずに直した部品を確かめられ、ブラウザのエラーが `src/js/…:行` で出る（各 JS に `//# sourceURL` を付ける）。

```sh
python3 -m http.server 8137      # リポジトリの根で
# → http://localhost:8137/tools/dev.html
```

### 作り
- `<base href="../">` でリポジトリの根を基準にする（`default.mics` `version.json` の相対パスが公開物と同じに解決する）
- 外枠（`shell/*.html`）は読まず dev.html 自身が持つ。CSS は `<style data-src>`、body は `insertAdjacentHTML`、JS は `<script data-src>` に**同期**で差し込む
- **先に全部 fetch してから一気に差し込む**。最初は部品ごとに `await fetch` していたら、`60-autosave` の `loadPresets().then(…)` が
  `80-skin-version-splash` の `APP_VERSION` より先に走って `default.mics` を読めなかった（単一 HTML では起きない順序）
- 単一 HTML では `<script>` が `load` より前に走るが、ここは `load` の後に差し込むので、差し込み終わりに `window.dispatchEvent(new Event('load'))`
  を送る（`61-layout` の `lockViewHeight` / `relocate*` / `updatePerf` が `load` 待ち）

### 単一 HTML との違い（知っておくこと）
- 部品ごとに別の `<script>` ＝ **読み込み時に後ろの部品の関数を呼ぶと ReferenceError**（単一 HTML では巻き上げで動いてしまう）。
  `module-check` が同じ条件を警告するので、警告 0 なら同じに動く。dev.html はその「巻き上げ頼み」を実行でも炙り出す
- 公開物ではない（pages は `mics-609bc14b.html` だけを配る）。**最終確認は必ず生成後の `mics-609bc14b.html`**（計画書の制約）

### 検査
`check.mjs` に `devShell`：部品数が manifest どおり／バージョン差し込み・起動・`default.mics` 読込／`load` 待ちの処理が走る（1280×800 で perf）／0 errors。
公開物の検査は他の項目が全部やる。dev.html は「壊れていない」ことだけ見る（部品を足したときに落ちる）。

### 結果
| 項目 | 結果 |
|---|---|
| 追加 | `tools/dev.html`（60行）。`src/` は触っていない |
| `check.mjs` | `devShell` 4 項目 |
| `gate` | ✔ 全関門クリア |

## Phase 5（ES Modules 化）について
計画書どおり**まだ入れない**。dev.html で「部品ごとに別スクリプト」の動作が得られたので、`import/export` に進む前に確認すべき
「読み込み順への依存」は `module-check` の警告と dev.html の実行の両方で見える。必要になったら判断する。
