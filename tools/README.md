# tools — 出す前に回す2本

どちらも Playwright で**実機と同じ描画**を測る。目視やgrepでは出ない類のバグを拾うために置いてある。

## 準備
```sh
npm i -D playwright && npx playwright install chromium   # 初回だけ
python3 -m http.server 8137                              # リポジトリ直下で
```
chromium の場所が特殊な環境では `PW_EXE` / `PW_PLAYWRIGHT` で明示できる。

## `check.mjs` — 回帰チェック
```sh
node tools/check.mjs           # 既定ポート 8137
node tools/check.mjs 8080
```
390×844 / 520×900 / 700×900 / 1024×768 / 1280×800 の5幅で以下を通す。1つでも落ちれば exit 1。

- 情報窓の**表示幅が値で動かない**（PITCH/LEVEL/BPM/STEP）
- **状態が変わっても寸法が1pxも動かない**（窓・メニュー・キー1枚・パッド／幅も高さも）
  検査する状態：5ページの切替 ＋ 長文メッセージ表示 ＋ ヒント表示 ＋ 素
  ← 何度も再発させたクラス。v0.3.89でメニュー幅、v0.3.90で窓の高さを落としている
- **5ページ**（MAIN/SAMPLE/TONE/FX/ASSIGN）の切替と欄の並び
- 横ドラッグ＝データホイール／列挙欄のタップ送り／**ダブルクリックで0**
- SCALE変更が**SEQの音階表示に連動**する
- BPMドラッグがスライダー・readout・LCDと一致／ダブルクリックで100
- **ラーニング一巡**（LEARN→PCキー→MIDI→CLEAR）が表画面だけで完結する
- 波形エディタが**1実体のまま**窓とモーダルを行き来する（所在を全遷移で追跡）
- 波形ハンドル↔数値欄の**双方向同期**
- **モーダルにノブ/セレクトが1つも無い**（音作りが裏に戻っていないことの担保）
- SEQ往復 / UNDO / 縦スクロールなし / **0 errors**

スクリーンショットは `tools/_shots/`（gitignore済み）。

## `ui-audit.mjs` — UI規則のスコアを測る
```sh
node tools/ui-audit.mjs
```
`docs/ui-rules.md` の基準（役割別の文字サイズ/コントラスト、演奏系44px・二次32pxの触れる大きさ、
常時アニメの数、パッドと情報窓の面積）を実測してスコアを出す。**落ちない**（レポート専用）。
合否は `check.mjs` 側の役割。

## `deadcss.mjs` — 使われていないCSSを洗う
```sh
node tools/deadcss.mjs | node tools/deadcss-filter.mjs
```
1段目が全セレクタを**9状態×3幅**で `querySelectorAll` して0要素のものを出し、
2段目が識別子のHTML/JS実在で絞る。2段目を通さないと、実行時に付く状態クラス
（`.pad.hit` `.toast.show` など）を大量に誤検出する。

**注意**: 「0件」は「未使用」ではない。クラスを**付ける側**のコードを必ず目視で確認すること。
v0.3.84 で `.perf-rotate` を未使用と誤判定し、要素ごと消しかけた（`updatePerf()` が付けていた）。

## 落とし穴メモ
- 起動直後のタップは、スプラッシュ後に張られる**450msの透明シールド**に飲まれる。
  テストは初回ジェスチャのあと600ms待つこと（`check.mjs` はそうしている）。
- CSS Nesting対応で `CSSStyleRule` も空の `cssRules` を持つ。
  `if(r.cssRules){recurse;continue;}` と書くと全ルールを取りこぼす。`selectorText` を先に見る。
