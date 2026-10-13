# 開発の流れ（v0.3.116〜）

**開発はモジュール、公開は1ファイル。** 触るのは `src/`、出るのは `mics-609bc14b.html`。
動くプログラムが1つという強み（依存ゼロ・起動が速い・壊れにくい）は変えずに、
読む単位と直す単位だけを小さくする。

```
src/ ──(tools/build.mjs)──▶ mics-609bc14b.html ──▶ GitHub ──▶ Pages
 52部品                        1ファイル（コミットする生成物）
```

## 1. どこを触るか

| 触る場所 | 中身 |
|---|---|
| `src/shell/` | `<head>` / `</style></head><body>` / `<script>` / 末尾。触ることはほぼ無い |
| `src/css/` | 9枚：base / theme / window / artware / seq / controls / editor / responsive / small-splash |
| `src/body/` | 7枚：splash / header / menu-modal / pad-edit-modal / viewdots / view-pads / view-seq |
| `src/js/` | 32枚：番号付き（boot / engine-* / plock-undo / voice / presets / ui-copy / ui-wave / ui-window / step-strip / menu / edit-modal / chop / autosave / layout / pattern-master / sampling / save-load / midi / share-export / skin-version-splash）＋ 責務別ディレクトリ `ui/`（status / pads-view / performance-view / seq-view）`data/`（pads / patterns）`audio/`（transport）＋ `ui/transport-view`、`app/`（state：アプリ状態と `@writers`）。新しい部品は責務別ディレクトリへ（Phase 2、`docs/modularization-log.md`） |
| `src/manifest.json` | 連結する順番。部品を足す/消すときだけ触る |
| `tools/dev.html` | 開発用プレビュー：`src/` を manifest の順に個別に読む（ビルド不要。`python3 -m http.server 8137` → `/tools/dev.html`）。公開物ではない |

**`mics-609bc14b.html` は直接編集しない。** 生成物なので次のビルドで消える。
うっかり直接編集しても関門（`build.mjs --check`）が「最初にズレる部品」を名指しで止める。

```sh
node tools/build.mjs           # 作り直す
node tools/build.mjs --check   # 現物と src が一致しているか（関門の最初の項目）
```

## 2. バージョンは1箇所

`version.json` の `"version"` **だけ**が正。ビルドが `__APP_VERSION__` に差し込むので、
`APP_VERSION` と スプラッシュ表記は自動で揃う。3箇所を手で合わせる作業は無くなった。

## 3. 出すまで

1. `src/` を直す → `node tools/build.mjs`
2. `node tools/gate.mjs`（手元の関門。`.githooks/pre-push` が push 時に自動で回す）
   - JS の先頭ヘッダ（`@module/@provides/@uses/@depends`）は **`node tools/module-check.mjs --write` で実装に合わせる**。
     手で書かない。ズレていると関門が止める（`docs/maintainability-modularization-plan.md` Phase 1）
3. ブランチに push → **GitHub Actions が走る**
   - `gate` … 関門をもう一度回す。**PR が赤なら merge しない**。検査スクショは Artifacts に残る
   - `pages` … `/preview/<ブランチ名>/` に配置。**スマホで触って確かめてから main に出す**
4. 確認できたら PR → merge → main が `/`（本番URL）に出て、`release` がタグを打つ

### CI と手元を食い違わせない
検査に使う版は CI で固定してある（`playwright@1.56.1` / `typescript@5`）。
**ツールの中に絶対パスや「この環境なら在る」前提を書かない**（v0.3.117 で実際に2件踏んだ。§130）。

プレビュー一覧：`<Pagesのアドレス>/preview/` （ブックマーク1つで全ブランチに辿り着ける）。
本番と同じ origin なので**合言葉は入り直さなくてよい**。ブランチを消すとプレビューも自動で消える。

**プレビューは砂場**：自動保存の保存先は枝ごとに別（`mics009-preview-<枝>`）なので、
プレビューでいくら触っても本番のセッションは汚れない。スプラッシュに `PREVIEW · <枝名>` が出る（§131）。

## 4. タグは自動

main に入ると `.github/workflows/release.yml` が `version.json` を読んで **`v0.3.x` のタグと Release を作る**。
手で打つ必要はない。戻すのが一手になり、Releases に履歴が並ぶ。
過去の版にも打ちたいときは Actions → release → Run workflow → `backfill` にチェック（一度だけでよい）。

## 5. 宿題は Issues に

判断待ち・後回しは会話ではなく Issues に置く。ロール名（`role:qa` `role:player` `role:feel` …）の
ラベルを付けて、誰の目線の課題かを分かるようにする。

## なぜこうしたか

- 1ファイルは**配布**には最適だが、**共同作業**には向かない。5,500行の同じ場所を全員が触ると衝突する
- 範囲指定の削除で3バージョン潜伏したバグ（§96）は、部品が小さければ気づけた
- iOS 固有の不具合（全画面の高さ §125/§126、`.mics` の読み込み §128）は手元で再現できない。
  **実機で触れるプレビューが無いと、直すたびに本番へ出す往復が要る**。これが一番の無駄だった
