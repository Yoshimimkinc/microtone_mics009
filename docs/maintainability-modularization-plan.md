# 保守性改善・モジュール化計画

## 目的

このリポジトリは、開発時には `src/` を複数ファイルに分け、公開時に `tools/build.mjs` で `mics-609bc14b.html` へ連結する構成になっている。

この方式は「依存関係ゼロ・単一HTML配布」という目的には適している。一方、現在のJavaScriptは単純連結された共有グローバルスコープで動作しているため、ファイル分割されていても厳密な意味でのモジュール化ではない。

本計画では、公開形式を変えずに、開発・保守・Claudeによる継続開発の安全性を高める。

## 現状認識

現在の構造は概ね次の通りである。

```text
src/ ──(tools/build.mjs)──▶ mics-609bc14b.html
  複数ファイル                  単一HTML
```

`src/manifest.json` の順番でHTML/CSS/JavaScriptを単純連結している。

このため、例えば `src/js/30-ui-pads.js` は、別ファイルで定義された以下のような値や関数を直接参照している。

- `tracks`
- `PADS`
- `AC`
- `selected`
- `trigger()`
- `paintPerf()`
- `syncEditor()`
- `PLOCKS`
- `PERF_BASE`

現在は連結順が正しいため動作するが、次のリスクがある。

- どのファイルがどの変数・関数を提供しているか分かりにくい
- manifestの順番変更で壊れやすい
- 同名の変数・関数を追加しやすい
- Claudeが一部ファイルを修正した際、別ファイルとの暗黙の契約を壊しやすい
- グローバル状態の変更箇所を追跡しにくい
- 生成後の巨大HTMLを見ないと動作確認しにくい
- テストがアプリ内部のグローバル変数へ直接依存している

結論として、現在の構成は「配布には効率的だが、ファイル分割されたグローバルスクリプトの集合」であり、保守性には改善余地がある。

## 基本方針

### 変更してはいけないもの

次の利点は維持する。

- 公開物は単一HTMLファイル
- 外部依存なし
- GitHub Pagesで配布可能
- Web Audio APIの低遅延動作
- 既存のサンプラー・シーケンサー・保存形式
- 既存のPlaywright回帰テストとgate

### 改善するもの

- ファイル間の依存関係
- グローバル状態の管理
- 機能ごとの責務分離
- 開発時の確認方法
- Claudeが安全に変更するためのルール

### 実施上の重要ルール

1. 一度に全体を書き換えない
2. 各段階でビルドと既存テストを実行する
3. 音声処理・保存形式・UI操作を同時に変更しない
4. 公開用の単一HTML生成機能を壊さない
5. 既存の挙動を変える変更と、構造だけを変える変更を分離する
6. 変更前後で `node tools/gate.mjs` を通す
7. 各段階を独立したコミットにする

## 実施フェーズ

## Phase 0: 現状の固定

大規模変更の前に、現状が動作している状態を記録する。

### 作業

- 現在の `main` のビルドを確認する
- `node tools/build.mjs --check` を実行する
- `node tools/gate.mjs` を実行する
- 既存のPlaywrightスクリーンショットと結果を保存する
- `src/manifest.json` の連結順を確認する
- JavaScriptのファイルごとのグローバル定義・参照を一覧化する

### 完了条件

- 変更前の基準となるテスト結果がある
- ビルドとgateが通る
- 既存の失敗がある場合は、変更前からの失敗として記録されている

## Phase 1: 依存関係の明示

この段階では、実行方式を変更しない。単純連結方式を維持したまま、各ファイルにモジュール情報を追加する。

### 各ファイルに付けるメタ情報

JavaScriptファイルの先頭に、次の形式のコメントを追加する。

```js
// @module ui-pads
// @provides selectPad, selectPadHeavy, paintSteps, paintPadStates
// @uses AC, PADS, tracks, selected, trigger, syncEditor
// @depends boot, engine-core, plock-undo
```

意味は以下の通り。

- `@module`: 論理的なモジュール名
- `@provides`: そのファイルが定義・提供する主な関数、変数
- `@uses`: 他ファイルから利用する主な関数、変数
- `@depends`: 実行前に読み込まれている必要がある論理モジュール

### 注意

- これはまだES Modulesの `import/export` ではない
- 動作を変えない
- 既存のグローバル参照をすぐに全置換しない
- コメントと実装の不一致を作らない
- すべての内部シンボルを完璧に列挙する必要はないが、主要な契約は記録する

### `tools/module-check.mjs` の追加

次の検査を行う静的チェッカーを追加する。

1. `@module` の重複検出
2. `@depends` に存在しないモジュールがないか確認
3. manifestの連結順で、依存先が依存元より前にあるか確認
4. `@provides` の重複を検出
5. メタ情報がないJavaScriptファイルを警告
6. manifestにあるファイルと、実際のメタ情報の差分を報告

既存の `tools/static-check.mjs` と役割が重複しないようにする。

- `static-check.mjs`: 暗黙グローバル、存在しないID、バージョン整合性
- `module-check.mjs`: ファイル間の論理依存関係

### 完了条件

- 既存の動作が変わらない
- `node tools/build.mjs --check` が通る
- `node tools/module-check.mjs` が通る
- `node tools/gate.mjs` が通る
- 依存順の問題があれば、実装変更ではなく先にメタ情報を修正する

## Phase 2: 論理的な責務分離

ファイルを増やすこと自体を目的にしない。まず、現在のファイルに混在している責務を整理する。

### 目標構造

最終的には次のような論理分類を目指す。ただし、一度に移動せず、機能単位で段階的に行う。

```text
src/js/
  app/
    boot.js
    state.js
    events.js

  audio/
    context.js
    engine.js
    master.js
    bus.js
    fx.js
    voice.js
    presets.js

  data/
    pads.js
    patterns.js
    project.js
    undo.js

  ui/
    pads-view.js
    seq-view.js
    editor-view.js
    performance-view.js
    menu-view.js
    modal-view.js

  features/
    sampling.js
    save-load.js
    midi.js
    chop.js
    autosave.js
```

実際の移動では、現在の番号付きファイルを一度に廃止しなくてよい。まずは論理分類をドキュメントに記録し、安定した機能から少しずつ移す。

### 特に分離したい責務

`src/js/30-ui-pads.js` のようなファイルには、以下の複数の責務が混在している。

- パッドDOM生成
- パッド選択
- パッド発音の入口
- P-LOCKのパッド操作
- EDIT中のドラッグ
- SEQグリッド生成
- SEQカーソル更新
- MUTE/SOLO状態の描画
- COPY操作

これを次のような単位へ段階的に分ける。

- `ui/pads-view.js`: パッドのDOM、選択表示、状態表示
- `ui/seq-view.js`: SEQグリッド、ステップ表示、カーソル
- `ui/performance-view.js`: P-LOCK表示とライブ操作
- `data/pads.js`: パッド状態の更新・コピー・入れ替え
- `features/copy.js`: コピー操作のモード管理

### 分離時のルール

- DOM要素の生成とデータ更新をできるだけ分ける
- 音を鳴らす処理をUI描画関数から直接増やさない
- `paint*` 関数は原則として表示更新に限定する
- データ変更は専用関数を経由する
- Undoが必要な変更は、UIイベント内で直接状態を書き換えず、変更関数に集約する

## Phase 3: アプリ状態の集約

現在、多数の状態が個別のグローバル変数として存在している。

例:

- `tracks`
- `selected`
- `playing`
- `bpmVal`
- `editPat`
- `editBar`
- `activeLock`
- `melodicMode`
- `perfRecArm`

これらを段階的に名前空間へ集約する。

### 最初の互換層

まず、既存コードを壊さないために、状態オブジェクトを追加する。

```js
const AppState = {
  selected: 0,
  playing: false,
  bpm: 100,
  editPat: 0,
  editBar: 0,
  activeLock: null,
  melodicMode: false,
  perfRecArm: false
};
```

既存変数との完全な置換は後段にする。

### アクセサー

直接代入を一斉に変更するのではなく、まずアクセス関数を用意する。

```js
function getSelectedPad() {
  return AppState.selected;
}

function setSelectedPad(i) {
  AppState.selected = i;
}
```

その後、変更頻度の高いものから次のように移行する。

```js
// 移行前
selected = i;

// 移行後
setSelectedPad(i);
```

### 状態移行の優先順位

1. UI選択状態
2. 再生・停止状態
3. BPM・スウィング
4. 編集中のパターン・小節
5. P-LOCK状態
6. MIDI・割り当て状態

`tracks` と `PADS` は保存形式・音声エンジンとの結合が強いため、最後に扱う。

### 状態変更のルール

- UIから状態へ書き込む入口を限定する
- 状態変更後に必要な再描画を明示する
- `paint*` 関数から状態変更を行わない
- 状態変更関数ではUndoの要否を明確にする
- 保存対象の状態と、一時的なUI状態を分離する

## Phase 4: 開発用プレビューを追加

公開用の単一HTMLは維持したまま、開発時に個別ファイルを読み込むプレビューを追加する。

### 追加するもの

```text
tools/dev.html
```

または、開発用の専用シェルを次のように用意する。

```text
tools/dev-shell.html
```

開発用HTMLでは、srcのCSS・HTML・JavaScriptを個別に読み込む。

```html
<script src="../src/js/app/state.js"></script>
<script src="../src/js/audio/context.js"></script>
<script src="../src/js/ui/pads-view.js"></script>
```

### 目的

- 生成後の巨大HTMLを直接読む必要をなくす
- ブラウザのエラーで元ファイルが分かりやすくなる
- Claudeが修正対象を特定しやすくする
- モジュール単位の動作確認をしやすくする

### 制約

開発用プレビューを追加しても、公開物の生成処理は別に維持する。

```text
開発時: srcを個別に読み込む
公開時: tools/build.mjsで単一HTMLを生成する
テスト: 公開用生成物に対して既存の回帰テストを実行する
```

開発用プレビューと公開用生成物の挙動が異ならないよう、最終確認は必ず生成後の `mics-609bc14b.html` で行う。

## Phase 5: ES Modules化の検討

ES Modulesの `import/export` は、最初から導入しない。Phase 1〜4で依存関係と責務が整理された後、必要性を評価する。

### 導入例

```js
import { tracks } from "../data/state.js";
import { trigger } from "../audio/voice.js";
```

### 事前確認事項

- `file://` で直接開く用途が残っていないか
- 開発時にHTTPサーバーを必須にできるか
- GitHub Pagesで正常に動くか
- AudioWorkletのコード生成・読み込みに影響し��いか
- 単一HTMLビルド時にimportを解決できるか
- Playwrightのテスト起動方法を変更する必要があるか

### 判断

ES Modules化は必須ではない。

単一HTML配布を最優先する場合は、次の状態でも十分な改善になる。

- 論理モジュールの責務が明確
- `@provides` / `@uses` / `@depends` がある
- `module-check.mjs` がある
- アプリ状態が名前空間に集約されている
- 開発用プレビューがある

## テストと品質ゲート

各フェーズの完了時に、最低限次を実行する。

```sh
node tools/build.mjs
node tools/build.mjs --check
node tools/module-check.mjs
node tools/gate.mjs
```

必要に応じて次も実行する。

```sh
node tools/static-check.mjs
node tools/dead-controls.mjs
node tools/lost-listeners.mjs
node tools/ui-audit.mjs
```

### 追加する検査候補

- モジュールメタ情報の欠落
- `@provides` の重複
- `@depends` の循環
- manifest順と依存順の不一致
- UI層からAudio内部実装への過剰な直接参照
- データ変更処理を経由しない直接代入

## Claude向け開発ルール

今後Claudeが変更する際は、次の順番を守る。

1. 変更対象の論理モジュールを特定する
2. `@uses` と `@depends` を確認する
3. 公開用HTMLではなく `src/` を編集する
4. 責務外のファイルをついでに変更しない
5. 状態を直接書き換える場合は、既存のUndo・保存・再描画への影響を確認する
6. UI変更、音声変更、データ形式変更を1コミットに混在させない
7. 削除前に `lost-listeners` を実行する
8. ビルドする
9. `module-check` を実行する
10. `gate` を実行する
11. 変更内容とテスト結果をコミットメッセージまたはPRに記録する

### 変更報告のテンプレート

```markdown
## 変更対象
- module: `ui/pads-view`
- files: `src/js/...`

## 変更内容
- パッド選択表示の責務を分離
- 既存の発音処理は変更していない

## 依存関係
- depends: `app/state`, `audio/voice`
- provides: `selectPad`, `paintPadStates`

## 確認
- [ ] `node tools/build.mjs`
- [ ] `node tools/build.mjs --check`
- [ ] `node tools/module-check.mjs`
- [ ] `node tools/gate.mjs`
```

## READMEとドキュメントの整合性

構造改善と別コミットで、ドキュメントの記述も確認する。

特に、現在の実装ではMIX画面が削除されている一方、READMEに以下のような古い記述が残っている���能性がある。

- MIX画面へ切り替える手順
- Mixerに関する古い機能説明

実装済み機能とREADME、`CLAUDE.md`、`docs/dev-flow.md` の内容を一致させる。

## 推奨する実施順

最初に行う変更は、次の小さな範囲に限定する。

### 第1コミット

- 本ドキュメントを追加
- 現状のビルド・gate結果を記録

### 第2コミット

- JavaScriptの主要ファイルに `@module` / `@provides` / `@uses` / `@depends` を追加
- `tools/module-check.mjs` を追加
- 既存コードの動作は変更しない

### 第3コミット

- `AppState` を追加
- 互換アクセサーを追加
- まず `selected` などUI状態の一部だけを移行

### 第4コミット以降

- `ui-pads` の責務分割
- SEQ表示の分離
- P-LOCK表示の分離
- 開発用プレビューの追加
- 必要に応じてES Modules化を再評価

## 完了の定義

この計画は、単にファイル数が増えた時点では完了としない。

以下を満たした時点で、保守性改善が達成されたと判断する。

- 公開用単一HTMLが従来通り生成できる
- 既存の操作・音声・保存形式が維持されている
- 各主要ファイルの依存関係が確認できる
- 依存順の破壊を自動検出できる
- 状態変更の入口が追跡できる
- UIと音声エンジンの責務が分離されている
- Claudeが変更対象と影響範囲を特定しやすい
- `node tools/gate.mjs` が通る
- 変更ごとにテスト結果を記録できる

## Claudeへの依頼文

このドキュメントに従って、保守性改善を段階的に実施してください。

最初から全体をES Modules化したり、大量のファイルを一括移動したりしないでください。まずPhase 0とPhase 1だけを実施し、既存の動作を維持したまま、依存関係の明示と `module-check.mjs` の追加まで行ってください。

作業後は次を報告してください。

- 変更したファイル
- 各ファイルの責務
- 追加・変更した依存関係
- ビルド結果
- `module-check` の結果
- `gate` の結果
- 未解決の問題

Phase 1が通過した後に、次のフェーズへ進むか判断します。
