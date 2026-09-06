# tools — 出す前に回す2本

どちらも Playwright で**実機と同じ描画**を測る。目視やgrepでは出ない類のバグを拾うために置いてある。

## 準備
```sh
npm i -D playwright && npx playwright install chromium   # 初回だけ
python3 -m http.server 8137                              # リポジトリ直下で
```
chromium の場所が特殊な環境では `PW_EXE` / `PW_PLAYWRIGHT` で明示できる。

## `gate.mjs` — 出す前の関門（これ1本）
```sh
node tools/gate.mjs
```
check（合否）→ dead-controls（無反応コントロール）→ lost-listeners（消えた登録）を回し、
**1つでも落ちたら exit 1**。deadcss と ui-audit はレポートとして続けて出す。
`.githooks/pre-push` がこれを自動で呼ぶ（初回だけ `git config core.hooksPath .githooks`）。
どうしても飛ばすときは `SKIP_GATE=1 git push`（理由をコミットメッセージに書く）。
意図した撤去は `tools/removals-ok.txt` に理由つきで書かないと lost-listeners で止まる。

## `static-check.mjs` — 静的検査（ブラウザ不要・1秒）
```sh
node tools/static-check.mjs
```
1) **暗黙グローバル**：宣言されていないのに参照されている識別子（id持ち要素は `window` の暗黙グローバルに
なるので、宣言を消しても動いてしまう。v0.3.84〜0.3.95 の `gPatSeg` 事故はこれで即出る）
2) 存在しない id への参照（`getElementById` / `querySelector("#…")`、ガードの有無つき）
3) バージョン3点一致（`APP_VERSION` / `version.json` / `splashVer`）
検出器は検査ワーカーW6の TypeScript AST 版を取り込んだもの。関門の最初に走る。

## `dead-controls.mjs` — 押しても何も起きないコントロール
```sh
node tools/dead-controls.mjs
```
PADS/SEQ の可視コントロールを実クリックで総当りし、前後で状態が1つも変わらないものを並べる。
**ハンドラを消してしまった事故（v0.3.96）はこれで即座に出る。** 無反応が正しいもの
（閉じるボタン、ファイル選択、選択済みの再タップ）は EXPECT に理由つきで登録。

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

## `lost-listeners.mjs` — うっかり消した実行コードを見つける
```sh
node tools/lost-listeners.mjs            # 既定は origin/main と比較
node tools/lost-listeners.mjs bef65de    # 任意のリビジョンと比較
```
消えた **addEventListener 登録／関数宣言／要素参照** を前の版と全数比較して並べる。**落ちない**。
出たものが全部バグではない（意図した撤去も出る）が、**消したつもりが無いのに出ているもの**は巻き込み事故。

範囲指定でコードを消すと、隣の生きたコードを黙って巻き込む。v0.3.84 の削除が
SEQのパターン/小節のクリック登録を巻き込み、**3バージョン気づけなかった**
（id持ちの要素は `window` の暗黙グローバルになるので、参照だけは動いてエラーも出ない）。
コードを消したら必ずこれを回すこと。

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
