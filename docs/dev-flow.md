# 開発の流れ（v0.3.116〜）

**開発はモジュール、公開は1ファイル。** 触るのは `src/`、出るのは `mics-609bc14b.html`。
動くプログラムが1つという強み（依存ゼロ・起動が速い・壊れにくい）は変えずに、
読む単位と直す単位だけを小さくする。

```
src/ ──(tools/build.mjs)──▶ mics-609bc14b.html ──▶ GitHub ──▶ Pages
 45部品                        1ファイル（コミットする生成物）
```

## 1. どこを触るか

| 触る場所 | 中身 |
|---|---|
| `src/shell/` | `<head>` / `</style></head><body>` / `<script>` / 末尾。触ることはほぼ無い |
| `src/css/` | 9枚：base / theme / window / artware / seq / controls / editor / responsive / small-splash |
| `src/body/` | 7枚：splash / header / menu-modal / pad-edit-modal / viewdots / view-pads / view-seq |
| `src/js/` | 25枚：boot / engine-* / voice / presets / ui-* / transport / menu / edit-modal / chop / autosave / layout / sampling / save-load / midi / share-export / skin-version-splash |
| `src/manifest.json` | 連結する順番。部品を足す/消すときだけ触る |

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
3. ブランチに push → **GitHub Actions が2本走る**
   - `gate` … 関門をもう一度回す。**PR が赤なら merge しない**。検査スクショは Artifacts に残る
   - `pages` … `/preview/<ブランチ名>/` に配置。**スマホで触って確かめてから main に出す**
4. 確認できたら PR → merge → main が `/`（本番URL）に出る

プレビュー一覧：`<Pagesのアドレス>/preview/` （ブックマーク1つで全ブランチに辿り着ける）。
本番と同じ origin なので合言葉は入り直さなくてよい。ブランチを消すとプレビューも自動で消える。

## 4. タグ

main に出したら `v0.3.116` の形でタグを打つ。戻すのが一手になり、Releases に履歴が並ぶ。

## 5. 宿題は Issues に

判断待ち・後回しは会話ではなく Issues に置く。ロール名（`role:qa` `role:player` `role:feel` …）の
ラベルを付けて、誰の目線の課題かを分かるようにする。

## なぜこうしたか

- 1ファイルは**配布**には最適だが、**共同作業**には向かない。5,500行の同じ場所を全員が触ると衝突する
- 範囲指定の削除で3バージョン潜伏したバグ（§96）は、部品が小さければ気づけた
- iOS 固有の不具合（全画面の高さ §125/§126、`.mics` の読み込み §128）は手元で再現できない。
  **実機で触れるプレビューが無いと、直すたびに本番へ出す往復が要る**。これが一番の無駄だった
