# MICS009 画面・モード 要件定義書（Screen / Mode Spec）

> このドキュメントの目的：PADS の **レイアウトモード（8×2 / 4×4）** と **3画面（PADS / SEQ / MIX）** の
> 用途・表示・機能を一覧化し、現状（As-Is）の不整合を洗い出して、目標（To-Be）を定義する。
> 実装前の「正」を1か所に置く＝後から全員が同じ理解で開発できる。

## 0. 要件定義の進め方（学習メモ）
1. **As-Is（現状）を観測**：コードと挙動から「いま何がどうなっているか」を事実として書き出す（憶測を混ぜない）。
2. **不変条件（invariant）を言語化**：例「MIXのグリッドはPADSのグリッドと一致する」。守られていない箇所＝バグ/負債。
3. **状態 × 画面のマトリクス**：状態（モード/デバイス）を縦、画面を横に取ると、抜け・矛盾が可視化できる。
4. **To-Be（目標）を定義** → 差分が「やることリスト」になる。
5. ドキュメントを**単一の正（single source of truth）**にして、実装・レビューはここを参照する。

---

## 1. 用語・前提
| 用語 | 定義 |
|------|------|
| デバイス境界 | `@media(max-width:600px)` を境に **Desktop（>600px）/ Mobile（≤600px）** |
| レイアウトモード | PADSのパッド配置。**8×2（cols8）** / **4×4**。`#layoutSeg` で切替（**Desktopのみ表示**、Mobileは非表示で常時4×4） |
| 既定値 | 起動時は **8×2**（HTML `class="pads cols8"`、`#layoutSeg` の「8×2」が `on`） |
| split | 4×4選択時に viewPads に付く `.split` クラス。S2400風の左右分割レイアウト |
| 不変条件 | CLAUDE.md「MIX grid matches PADS grid layout」＝MIXのチャンネル列数はPADSの列数に一致すべき |
| 2つの再生ボタン | ヘッダ `#play`（▶ Play）と pad内 `#padPlay`（▶ START、padTransport）。どちらも再生 |

---

## 2. レイアウトモードの用途定義
| モード | 想定用途 | 配置の特徴 |
|--------|----------|-----------|
| **8×2（既定/Desktop）** | 波形を見ながら広く一覧・ブラウズ。横長で全16パッドを2段に。 | 上に strip（選択パッドの波形＋LOAD/SMPL/EDIT）、下に 8列×2行のワイドパッド。縦積み（block）。`#padPlay`は非表示＝ヘッダ`#play`で再生。 |
| **4×4（Desktop）** | 指ドラム/演奏。MPC・S2400的にパッドを正方形で左に、操作を右に。 | `.split`：左=4×4パッド、右に strip / msbar / 大きな START(`#padPlay`) を縦に。MIXは4列に追従。 |
| **Mobile（常時4×4相当）** | スマホ縦持ちの主環境。 | `#layoutSeg`非表示。flex縦：strip→パッド(4×4で高さフィル)→msbar→START。モードタブは廃止しスワイプ＋ドットで切替。MASTERバーはMIX時のみ表示。 |

---

## 3. 画面 × モード マトリクス（表示差分）
| 観点 | 8×2 (Desktop) | 4×4 (Desktop) | Mobile |
|------|---------------|---------------|--------|
| PADS パッド | 8列×2行・横長 | 4列×4行・正方形・**split** | 4列×4行・高さフィル |
| PADS strip位置 | 上・全幅 | 右カラム | 上 |
| PADS 再生ボタン | ヘッダ`#play`のみ | 右下の大START`#padPlay` | 大START`#padPlay`＋ヘッダ |
| PADS MUTE/SOLO | 表示 | 表示 | **非表示**（M/SはMIXへ集約）。EDITのみ |
| SEQ | 16×16グリッド（共通） | 16×16グリッド（共通） | 16×16・**内部縦スクロール** |
| **MIX チャンネル列** | **8列** | **4列(mix4)** | **8列**（=cols8クラス残存。**4×4のパッドと不一致**） |
| MIX Groups/FX | 2列pad-grid | 2列pad-grid | 2列pad-grid |
| MASTERバー | 常時 | 常時 | **MIX時のみ** |
| モード切替UI | タブ(modebar) | タブ(modebar) | スワイプ＋ドット |

> 太字＝モードで**見た目が変わる**ところ。ユーザーが「SEQ/MIXに行くと見た目が違う」と感じる主因は **MIXの列数がPADSモードに連動** すること。SEQは構造的には共通。

---

## 4. 機能要件一覧（画面ごとに「何ができるか」）
### PADS
- パッド：タップ=発音＋選択（手叩きは軽量selectで連打もたつき回避）
- strip：選択パッドの波形表示／LOAD（ファイル取込）／SMPL（録音→取込先PAD表示）／EDIT（編集モーダル）／トラック名・stepnav
- msbar：MUTE / SOLO（Desktopのみ）/ EDIT（トグル式）。EDIT中＝タップ編集・ドラッグ入替・長押しコピー
- GRID(step-on)：Recボタンで打ち込みON/OFF。p-lock 5種（pitch/level/filter/delay/reverb）を横ドラッグ記録
- 再生：Play/Stop、Tap tempo、Undo

### SEQ
- パターン A/B/C/D 選択、BAR（小節1-4）選択、DUP（複製）
- 16トラック×16ステップのトグル入力、行名＝パッド名
- melodicパッドはスケールに沿ったノート入力
- レイアウトモードに**非依存**（常に16×16）

### MIX
- Groups：4グループフェーダー（音量／M/S）
- FX：テープディレイ／リバーブ（送り量・ON/OFF）
- Channel levels：16ch フェーダー＋VU＋M/S（折りたたみ既定）。**列数がPADSモードに連動**
- Master：マスター音量、COMP（threshold/drive）、DAC 2段ローファイ等のA/B
- 取込先・破壊操作のトースト（「↩で戻せる」）

---

## 5. 非機能・一貫性ルール（invariant）
- **R1: MIXのチャンネル列数 = PADSの列数**（spatial memory）。現状 Desktop は満たすが **Mobile で破れている**。
- **R2: パッド番号は自然順（左上=1）**。3画面で一致（達成済み）。
- **R3: モードボタンはトグル式**（MUTE/SOLO/EDIT）。
- **R4: 破壊操作（TRIM/CHOP/MOVE/上書き）はUndo可能＋可視化**（トースト）。
- **R5: 手叩きの発音は最優先・低レイテンシ**（重い再描画は選択変化時のみ）。

---

## 6. As-Is の不整合（論点）と To-Be 推奨
| # | 論点（As-Is） | 影響 | To-Be 推奨 |
|---|---------------|------|-----------|
| I1 | **Mobileで MIX=8列 / PADS=4×4** が不一致（R1違反）。`cols8`クラスがMobileでも残るため | スマホでMIXがPADSと空間的に対応しない・8列で窮屈 | Mobileは強制4列にして R1 を満たす（`syncMixLayout`をデバイス考慮 or Mobile用CSSで4列固定） |
| I2 | **8×2 と 4×4 で再生ボタンの位置が違う**（ヘッダ`#play` vs 右下`#padPlay`） | どこで再生するか迷う | 役割を定義：例「START/STOPは常に同じ位置（または両方を常設で同一見た目）」 |
| I3 | `.split` クラスが**ビュー切替後も viewPads に残る** | 害は小だが状態が暗黙的 | 仕様として「splitは4×4の時だけ」を明文化（現状動作はOK、ドキュメント化） |
| I4 | **8×2/4×4 の用途がUI上どこにも説明されない** | ユーザーが選ぶ基準を持てない | セグメントに用途ヒント（例 8×2=ブラウズ / 4×4=演奏）or 初回トースト |
| I5 | MIX列数が**PADSモードに連動して変わる**のが直感に反する場合がある | 「画面で見た目が違う」の主因 | 設計判断：(a) R1を貫き連動を正とする＋説明 / (b) MIXは常に固定列にして独立させる ←要決定 |
| I6 | 極小フォント（8px）＋`user-scalable=no` | 視認性/アクセシビリティ | 常時表示の極小ラベルを微増（別途UIレビュー済み） |

---

## 7. 次アクション（このSpecを承認後）
1. **I5 を決定**（MIXはPADS連動 or 固定列）← ここが設計の分岐点。プロデューサー判断。
2. 決定に沿って **I1（Mobile MIX列）** を修正＝R1を全環境で満たす。
3. **I2（再生ボタン位置）** の役割定義と統一。
4. I3/I4 はドキュメント明文化＋軽微UI。
5. 本Specを CLAUDE.md から参照（single source of truth）。

> 変更は1項目ずつ。各修正後に headless 検証→`+0.0.1`→main。仕様変更があれば**まずこのSpecを更新**してから実装する（spec-first）。

---

## 8. 【決定 2026-06】MIX画面を廃止（To-Be）
**背景**：MIXの大半は per-pad パラメータの重複（16chフェーダー=EDIT Level/P-LOCK、ch毎M/S=PADSのMUTE/SOLO、Master/COMP=メニュー）。
同じ状態を複数UIから触る＝二重管理＝同期バグの温床（DRY違反）。固有価値は **Group音量** と **グローバルFX** のみ。
→ プロデューサー判断：**A. MIX画面を廃止**。これにより I1/I5（MIX⇔PADS不整合）も消滅する。

### To-Be 構成（3画面→2画面）
- **画面は PADS / SEQ の2つ**（MIXタブ・ドット・スワイプ対象から除外）。
- **per-pad ミックス**：音量＝EDITのLevel＋P-LOCK level。ミュート/ソロ＝PADSの **MUTE/SOLO モード**（モバイルでも復活）。
- **Group音量（4）** と **FX（delay/reverb 量・ON/OFF）** と **Master音量** は **メニュー（⋮）内**へ移設（Master/Comp/Sound A/B と同居）。
- **撤去**：16chフェーダー＋ch毎VU＋`syncMixLayout`/`mix4`、`#viewMix`、MIXモードボタン/ドット。
- **音声配線は不変**：`groupBus`/`GROUP_OF`/FXノード/masterGain はそのまま。**UIだけ移設**。

### 影響（R: 不変条件への影響）
- R1（MIX=PADS列）：MIX消滅で**論点ごと消える**。
- M/S の行き場：モバイルで隠していた MUTE/SOLO を PADS に**戻す**（必須）。
- VU：チャンネルVUは廃止。マスターVUはメニュー内に残す（任意）。

### 実装順（1項目ずつ・各回 headless 検証）
1. Group/FX/Master の各ブロックを `#viewMix`/ヘッダから **メニューへ物理移動**（`makeMixPad` は id 参照なので流用可）。
2. 16chミキサー（`#mixer` 構築ループ・`chEls`・チャンネルVU・`paintMixer`のch部・`chToggle`）を撤去。
3. ナビからMIX除外（`modeMix`・viewdots・swipe `order`・`switchView`の`viewMix`分岐・`mix-on`）。
4. `#viewMix` 空コンテナ削除、`syncMixLayout`/`mix4` 撤去。
5. モバイルの `#holdMute,#holdSolo{display:none}` を解除＝PADSでM/S復活。
6. 検証→`+0.0.1`→main。


---

## 9. 【決定】Performance Mode（4×4 = 演奏専用デバイス / PC・iPad 横向き限定）
**狙い**：4×4を「編集の片手間」でなく、ハードのグルーヴボックス（MPC/Launchkey系）的な**演奏専用面**に全振り。中央に16パッドをできるだけ大きく、左右に操作列、リアルタイム重視。
**発動条件**：PC/iPad幅（`min-width:768px`）× **横向き** × レイアウト4×4選択。**縦向き時は回転オーバーレイ**「↻ 横向きにしてください」。スマホ（≤600px）は対象外＝今の縦4×4のまま。8×2はブラウズ/編集用のまま。

### ガワ↔機能マッピング（画像の機種固有機能はうちの実機能に置換。無いものは作らない）
| 画像の領域 | ハードの機能 | → MICS009の割当（実機能） |
|---|---|---|
| 中央 4×4 | 大きいカラフルパッド | **#pads を最大化**（カテゴリ色・左上=1のうち流儀） |
| 上部エンコーダ列 | CCノブ | **Group音量×4 + FX(delay/reverb) + Master + Swing**（=8ノブ、実値に直結）※v1は省略可 |
| 左列 | Octave/Mute/Preset/Repeat/Clips/Scenes/音価 | **MUTE / SOLO / EDIT（既存モード）+ BPM + SWING + TAP**（Octave/Clips/Scenes等は非対応＝載せない） |
| 右列・下 | Replace/Load, Mode(Add/Split/Chord), Focus(Song/Plugin/Mix), 矢印, Undo/Loop/Redo/Click, ▶■● | **Pattern A/B/C/D ライブ切替 + PLAY/STOP + REC + Undo + ⋮メニュー** |
| 右上 画面 | バンク/値表示 | **小スクリーン**：BPM・現在パターン・選択パッド名 |
| 右上 大ノブ | マスター等 | Master音量（or 省略） |

### 設計原則（DRYを死守）
- **状態の二重管理を作らない**：値編集UI（音量スライダー等）は複製しない。演奏ボタンは「**既存関数を呼ぶ/既存要素をproxyクリック**」、値は**読み取り表示**（単一の真＝bpmVal/swingPct/editPat等）に留める。
- 既存ハンドラを最大限再利用。演奏面はガワ（CSSレイアウト＋装飾）が主。

### 実装イテレーション
- **v1（骨格）**：横向き4×4で3カラム化（左/中央大パッド/右）＋ダーク・デバイス装飾＋回転オーバーレイ。中央=#pads最大化、左=MUTE/SOLO/EDIT+BPM/SWING/TAP、右=Pattern A-D+PLAY/STOP+REC+Undo+⋮、上=小スクリーン。**非対応の機種固有ボタンは載せない**。
- v2：上部エンコーダ（Group/FX/Master/Swing）、色・質感の作り込み（artware）、パッドのベロシティ表現等。

---

## 10. 【決定】Performance P-LOCK（演奏中いじり）＝2パターンを1ジェスチャに
歴史的背景：**SP-1200**＝音色をライブで触る（記録しない＝瞬間）。**Elektron/S2400**＝ステップ毎p-lockに記録。現場ではこの2つが両方要る。
→ 統一モデル：**パラメータ選択（PITCH/LEVEL/FILTER, `activeLock`をGRIDと共有）× パッド縦ドラッグ × REC-armで分岐**。
- **REC OFF＝瞬間**：ベース値(tune/vol/cutoff)を生でいじり、**離すと復帰**。保存に触れない。
- **REC ON＝記録（実装済み v0.2.19）**：
  - **再生中**にドラッグ＝**プレイヘッドが通過したそのトラックのトリガ（v>0）に、ライブ値をp-lockとして生記録**（`setLockPlay(playPat,playBar,step)`＝GRIDの`locks`と完全同一データ・同一`playVoice`適用）。ループの度に最新値で上書き＝オーバーダブ。記録セッション開始時に一度だけ`pushUndo`（取り消し可）。離す/パラメータ解放で**ベース値は復帰**（オートメーションは`locks`に在るため二重適用しない）。
  - **停止中**にドラッグ＝記録対象が無いので**ベース保持**（音作り用）。
- 5パラメータ（pitch/level/filter/delay/reverb）すべてper-padベース（tune/vol/cutoff/delaySend/reverbSend）を持つので**5つとも同じ挙動**。
整合性：`activeLock`・PLOCKS spec・`locks`保存/`playVoice`適用を**すべて再利用**＝二重管理なし。
※ ダブルタップ・リセット（v0.2.16）はベース値を基準へ戻すのみ。記録済み`locks`は消さない（GRIDで打ったp-lockを壊さないため）。

## 11. 【実装 v0.2.24】キーボード演奏（PCキーボード＝鍵盤）
方針：演奏はMIDIパッドよりPCキーボードが本機に合う（スライス＝時間順＝キー列の左右と一致／ハード不要）。**スライスとクロマチックを両立、切替はパッド毎の `scale`**。

- **スライス（既存）**：数字行 `1-8`＝パッド1-8、`Q-I`＝パッド9-16。長い素材を16分割して左→右に走らせる＝スライスプレーヤーの核。`KEYMAP` 維持。
- **クロマチック/音階（新規）**：選択中パッドが**音階パッド**（`scale!=="off"`＝`isMelodic`）のとき、**ホーム行 `A S D F G H J K L ;`** がそのパッドの鍵盤になる。左→右でデグリー0..9＝`scaleSemi(scale, idx)` を `playVoice(sel,…,semi)` に渡す（SEQの行クリック式メロディ奏法と同一ロジック）。`chro`＝半音、`maj/min/pent`＝音階。
- **両立**：別キー行なので数字/Q行のスライスとホーム行の音階は同時に成立。**パッド毎の切替＝そのパッドの `scale` 設定**（EDIT/peScale。単一状態＝二重管理なし）。
- discoverability：音階パッドを選ぶと「ホーム行 A〜; ＝音階キー」を一度提示。発音時は `NN 名前 ♪ +semi` を表示。
- 未対応（次段候補）：オクターブ切替、押下キーのビジュアル鍵盤表示、Web MIDI（外部鍵盤）、和音のグルーピング。

## 12. 【実装 v0.2.26】NUDGE p-lock（ステップを前後にずらす＝マイクロタイミング）
6つ目のp-lockパラメータ **NUDGE**（ms単位・`-50〜+50`・既定0／`-`=前ノリ・`+`=後ノリ）。`PLOCKS.nudge` を足すだけで、GRIDの横ドラッグ編集・`lockfill`表示・トグルUIは既存の汎用ロジックがそのまま処理（DRY）。
- **適用**：`scheduleStep` で `lk.nudge/1000` をそのトリガの発音時刻に加算（`when + n*stg + nudge`）。`LOOKAHEAD=100ms` 内なので前ノリ（負値）も予約可。`Math.max(…, currentTime)` で過去発音は防止。
- **見た目はグリッドのまま**：`drawQueue` の visual は `when`（公称）基準なのでカーソルは動かさず、**音だけ**前後する＝SP/Elektronのマイクロタイミングと同じ「ノリ」操作。
- **対象外**：演奏ライブ・モジュレート（`PERF_BASE`）には載せない（基準トラック値を持たないパラメータのため）。NUDGEは**GRIDステップ編集のp-lock専用**。
- 他5つ（pitch/level/filter/delay/reverb）と完全同一の操作系：NUDGE選択→ステップ横ドラッグで±msを記録。

## 13. 【整理 v0.2.27】5Sクリーンアップ＋MENUのMIX(Groups/FX)廃止＋onset吸着の復活
- **整理（死蝕コード除去）**：未参照を grep で確証してから削除。CSS `.pat-indicator`/`.master-section`/`.mshint`、JS `stepDur`/`PAT_NAMES`。
- **MENUのMIX廃止**：MIX画面廃止時にメニューへ移していた **Groups（グループ音量×4）と FX（delay/reverb）のパッドUIを撤去**（producer判断＝Groups+FXのみ／Master・COMPは残す）。
  - 値は引き続き `.mics` から `applyGroupVol`/`applyFx` で**読込・適用**される（音は不変）。編集UIのみ削除。
  - 連動して `makeMixPad`/`mixPads`/`paintAll`/`paintGroups`/`MIX_GROUPS`/`grpRow`/`fxRow` と `.mpad*`/`.pad-grid` CSS を一掃。`paintMixer()` は呼び出し元互換のため **no-op** で残置。
- **onset吸着の復活**：`snapStartToOnset` が未接続（死蝕）だったのを `snapStartToOnset(idx)` 化し、**EDITの開始点ハンドルを離した瞬間**に最寄りアタックへ±12ms吸着するよう再接続（CLAUDE.md設計ルール「Start point snaps to attack transients」を実態に復帰）。
- **躾（ドキュメント整合）**：CLAUDE.md Key Functions の誤記（存在しない `findNextOnset`→実在の `detectOnsets`、`snapStartToOnset` 署名）を修正。
- **起動デフォルトソング差し替え**：`default.mics` をユーザー提供の最新ビート（v2 / BPM94.5 / 16トラック）に更新。

## 14. 【実装 v0.2.28】SP-1200風「出力チャンネル別フィルター」（グループバス）
SP-1200の太さは①ピッチ変更のエイリアシング（既存`pitchBufferNN`）②12bit/26kHz（既存`makeLofi`）③**出力ch別フィルター差**の重なり。③が穴だったので4グループバスに実装。
- routing：`voice → env → groupBus[g](音量) → grpFilters[g](SPフィルター) → masterGain`。bypass時は `groupBus[g] → masterGain` 直結（`applySpChFilter`が切替、フィルター末端→masterは常時接続）。
- ゾーン（`SP_CH`）：g0 SMP1-4=15k 1極（明るい/ザラ残す）、g1 SMP5-8=12k 1極、g2 DR9-12=5.2k 2極(≈4極)+レゾ0.95+**発音毎ダイナミック開閉(+3.8k→60ms時定数で閉)**、g3 DR13-16=6.2k 2極固定。
- ダイナミックフィルター：`playVoice`で dyn>0 のグループのみ、`when`に`setValueAtTime(cut+dyn)`→`setTargetAtTime(cut)`（クリック無し）。共有ノードを発音毎に再トリガ＝ch1-2の時間変化フィルター相当。
- UI：メニューSoundに `SP チャンネルフィルター` トグル（既定ON・runtime・非保存＝DAC/loopSnapと同方針）。マッピングは`SP_CH`で後から調整可。
- 注：SSM2044の厳密回路再現ではなく「4極・丸み・粘り」の質感近似。コンパンディング等は別途要検討。

## 15. 【実装 v0.2.29】SSM2044 回路モデリング（AudioWorklet）
v0.2.28のbiquad近似を本物の回路モデルへ置換。SP-1200の出力chに載る **SSM2044＝4極OTAローパスVCF(24dB/oct)** をモデリング。
- **なぜWorklet**：ネイティブBiquadFilterではラダーのゼロ遅延帰還が作れない（ノード経由帰還=128サンプル遅延で破綻）。サンプル単位で解く必要があり AudioWorklet `ssm-2044` で実装。
- **モデル**：OTAラダー＝1次LP×4段直列＋最終段→入力への共振帰還。各段に `tanh` 非線形(OTAの transconductance 飽和)＝SSM2044のクリーミーな歪み/粘り/自己発振。2xオーバーサンプリングで非線形の折返し低減。tanhが全段を有界化し数値的に安定（res<4で無入力時は零収束）。
- **パラメータ**(AudioParam)：`cutoff`(a-rate＝ダイナミック自動化用) / `reso`(0..4) / `drive`(入力ドライブ)。グループ毎の値は `SP_CH`。
- **割り当て**：g0/g1サンプル群=明るい(高cut/低res)、g2/g3ドラム群=丸める(低cut/レゾ)。g2のみ発音毎に `spDynOpen` でcutが開閉。
- **ルーティング**：`groupBus[g] → (ssmNode[g] | grpBiquad[g]) → grpOut[g] → masterGain`。`grpOut`が安定末端でフィルタ実体を差し替えても再配線不要。
- **フォールバック**：AudioWorklet非対応/ロード失敗時は biquad直列(`grpBiquad`)へ自動。初期は同期的にbiquadで鳴り、worklet成功で各グループをssmへ差し替え→`applySpChFilter()`再ルーティング。
- **注意/未対応**：g≈2πfc/fsの明示オイラー積分（厳密なZDF/Huovilainen熱電圧チューニングは未採用＝高cutで僅かなチューニング誤差）。SPICEレベルのネットリスト再現ではなく「4極・OTA tanh・共振」の挙動モデル。コンパンディングは別検討。

## 16. 【廃止 v0.2.30】8×2パッドレイアウトモードを撤去（4×4一本化）
2レイアウト両立の維持コストが見合わないと判断し、8×2（browse）を廃止。**パッドは4×4固定**。
- HTML: `#viewPads` に `split` を常時付与（S2400風スプリット既定）、`#pads` から `cols8` 除去、`#layoutSeg`(8×2/4×4トグル) 削除。
- JS: `layoutSeg` クリックハンドラ削除（cols8/splitトグルの分岐ごと撤去）。
- CSS: `.pads.cols8*` ルール群・`#layoutSeg` 参照（perf内margin/モバイル非表示/min-height）を削除。`.pads` 既定が `repeat(4,1fr)` なのでそのまま4×4。
- 影響：デスクトップは常にS2400スプリット表示＝横向き≥768でPerformance Mode（`perfFourUp`は`split`常時trueで成立）。モバイルは従来どおりメディアクエリで4×4強制（変更なし）。
- 保存/読込：レイアウト選択は元々 .mics/localStorage に保存しておらず、永続化の変更なし。

## 17. 【1画面化 v0.3.0 / Phase 1】常時表示の16ステップ列（pads＋シーケンス同居）
Model:Samples/S2400流の「1枚縛り」へ向けた第一歩。Performance Mode（＝デスクトップ既定）にあった穴＝「ステップ打ち込み列が無い」を埋めた。
- 追加：`#stepStrip`（16ボタン）。選択トラックの現在 `editPat`/`editBar` のステップを常時表示。タップ=ON/OFF、Shift=アクセント（SEQと同操作）。
- 流用：`toggleStepAt` / `getPattern(selected)` / `curStepFor`（再生ヘッド）をそのまま使用＝状態の二重管理なし。`paintStepStrip()` を `paintSteps()` 冒頭と `selectPad` 末尾にフック（毎更新で選択トラック・小節・再生ヘッドに追従）。
- レイアウト：split グリッドと perf グリッドに full-width の `steps` 行を追加（pads と P-LOCK 行の間）。モバイルは flex 最下段(order:5)。
- 操作モデル確定：**パッド＝トラック選択/発音、下の16ステップ＝そのトラックの打ち込み**（ユーザー指示どおり）。
- 旧 SEQ(16×16)画面はフォールバックとして残置（Phase 3 で撤去予定）。
- 残タスク：Phase 2＝パッド8×2化／パラメータ行に COMP・NUDGE・EDIT 追加／トランスポート行（● ▶ ■ UNDO）／情報窓のコマンドライン化。Phase 3＝SEQ撤去・完全1枚化。

## 18. 【1画面化 v0.3.2 / Phase 2a】モック準拠：パッド8×2＋パラメータ行8ボタン＋全幅化
Performance Mode を Excel モックの全幅1カラム・縦積みに再構成。
- グリッド：`repeat(8,1fr)` の全幅。行＝screen(情報) / plk(パラメータ8) / pads(8×2) / [msbar(M/S) ＋ pats(A-D)] / steps。
- パッド：perf で `repeat(8,1fr)×repeat(2,1fr)`＝8×2（モック準拠）。非perf/モバイルは従来4×4のまま。
- パラメータ行(8)：PITCH/LEVEL/FILTER/DELAY/REVERB/**COMP**/NUDGE/**EDIT**。
  - 6つ(pitch〜nudge)＝既存P-LOCKを `#plockRow` へproxy（activeLock共有）。
  - COMP＝`setCompBypass(!compOn)` で master comp トグル（単一状態）。EDIT＝`#holdEdit` をproxy（armモード共有＝EDIT+PADで中身編集）。`.perf-mode` 印で P-LOCK proxy から除外。
  - 旧 `● REC`(perfRec) はパラメータ行から撤去（RECはヘッダ ●Rec／transport 側）。msbar の EDIT は perf で非表示（パラメータ行へ集約）。
- A-D は2×2→横一列。M/S は msbar(横並び)で温存（モックには無いが機能維持＝暫定）。
- 残：パターン行に BAR(1-4)＋DUP、情報窓のコマンドライン化、トランスポート行化。SEQ(16×16)は俯瞰打ち込み用に残置（ユーザー方針）。
- verify(1280×800)：pad 8col×2row / param 8ボタン(順序一致) / COMPトグル / EDIT arm / 0 page errors。

## 19. 【1画面化 v0.3.4 / Phase 2b】PAD/SEQ セクション見出し＋SEQ操作行完成（BAR+DUP）
モック確定版（PAD/SEQ 2セクション）へ。
- perfグリッドに見出し行 `padlbl`/`seqlbl`（PAD/SEQ・左に縦アクセント）を追加。行順：screen/padlbl/plk/pads/seqlbl/pats/steps。
- SEQ操作行(`#perfPats`)を **A-D / 小節1-4 / DUP► / SELECT** に完成。小節=既存 `setEditBar`、DUP=`dupBarNext` を再利用（状態の二重管理なし）。`paintPerf` で editBar を `.perf-bar.on` に反映。
- MUTE/SOLO はモックでトランスポート行へ移る方針 → perf では msbar を一旦非表示（非perfには温存）。
- 残：トランスポート行に MUTE/SOLO/COPY 移設＋MENUを⋮へ（ヘッダ改修）、情報窓のコマンドライン化。
- verify(1280×800)：PAD/SEQ見出し表示／SEQ行=A B C D 1 2 3 4 DUP► SELECT／小節クリック反映／0 page errors。

## 20. 【v0.3.5】MUTE/SOLO/COPYをトランスポートへ＋iPad縦フィット
- **MUTE/SOLO/COPY をトランスポート行へ移設**（モック準拠）。MUTE/SOLO は msbar から移動（id維持で arm() がそのまま機能）、COPY は新規。
- **COPY＝既存 chop armモード**に配線（`bindHold("holdCopy","chop")`）。pad pointerdown に2タップ動作を実装：1タップ目=コピー元(copySrc)、2タップ目=`copyPadSound` でコピー先へ（発音なし／同一再タップで取消）。armed=アンバー。
- 非perf用に EDIT は msbar に残置（perf は perfEdit が proxy）。
- **iPad(4:3)で縦が余る問題**：`.body` が素の grid で画面高を使えず perf が viewH≈355・パッド118×45で平板だった。`body.perf` で `.unit/.body/#viewPads` を flex で画面高いっぱいに → viewH≈505・パッド118×120 にバランス改善。perf(≥768横)限定スコープで非perf/モバイルは不変。
- verify(iPad 1194×834)：transport=COPY/MUTE/SOLO／viewH 355→505／pad 45→120h／MUTE arm／0 errors。
- 残：TAP/TEMPO/SWING の整理（メニュー格納 案a 未確定）、MENU→⋮、情報窓コマンドライン化。

## 21. 【v0.3.6】情報窓をコマンドライン風パネルに（上段の空き解消）
「上がすかすか」＝薄い1行の情報バーを、複数行のターミナル風表示へ。
- `#perfScreen` を4行構成に：①`MICS009 // PERFORM` ＋ 状態(■STOP/▶PLAY/●REC) ②BPM/SWG/PAT/BAR/STEP ③TRK(選択トラック) ④プロンプト `> <status> _`(点滅カーソル)。monospace。
- 既存の蛍光LCD演出(走査線＋グロー)はそのまま適用＝緑のターミナル質感。
- `paintPerf` で各フィールド更新。STEP/STATE は `paintSteps`（毎ステップ）でライブ更新（軽量getElementById）。プロンプトは `sampNameEl` のステータスを反映。
- 高さ ≈113px の4行パネルで上段が埋まり、iPadでも間延びしない。
- verify(1194×834)：screenH 113・4行・全フィールド表示・0 errors。

## 22. 【v0.3.7】perf上下バランス調整（上スカスカ/下ぎゅうぎゅう）
上段チャム（でかいロゴ＋タブの余白）が画面の~48%を食い、下段(パッド/SEQ)が詰まっていた。
- perf限定で `.top`(padding/margin 32→12px)・`.brand .logo`(30→17px)・`.modebar-row`(margin 36→10px)・`.modebar`・`.modebtn` を圧縮。LCDも少し詰め。
- perfグリッドの行gap 6→9pxで下段に息継ぎ。
- 結果(1194×834)：上段チャム下端 399→320px、パッド 204→265px(padH 115)。
- 残レバー：ヘッダ(115px)＝transportがTAP/TEMPO/SWING＋7ボタンで2行化。これをメニュー格納すれば `● ▶ ■ UNDO COPY MUTE SOLO ⋮` の1行になりさらに~60px回収可。

## 23. 【v0.3.8】TEMPO/SWING/TAPをメニューへ→transport1行化→上下バランス確定
ヘッダ(115px)の主因＝transportが TAP/TEMPO/SWING＋7ボタンで2行折返し。
- **TAP・Tempoスライダ・Swing を メニュー(⋮)の「Tempo / Swing」節へ移設**（id維持＝bpm/swing/tap の配線そのまま）。transport は `▶ ● UNDO COPY MUTE SOLO ⋮` の1行に。
- BPM/SWINGは情報窓(LCD)に常時表示。メニューで変更時に `paintPerf()` を呼んでLCD即同期（bpm input / swing change）。
- 結果(1194×834)：ヘッダ 115→42px、パッド 265→338px(padH 115→152)。上段の空き解消＋下段に十分な高さ。
- verify：transport=▶/●/Undo/COPY/MUTE/SOLO/⋮、BPMメニュー変更→LCD 128.0反映、TAPはメニュー内、0 page errors。

## 24. 【v0.3.9】再生ヘッド可視化＋ステップのドット＋キーボード打ち込み＋コマンドライン解説
実機フィードバック対応。
- **再生ヘッド**：`moveCursors()` が新しい16ステップ列を更新してなかった（再生中ヘッドが動かない主因）→ `_stripCurStep` で毎フレーム更新。`.stepbtn.cur` を明るいアンバーの枠＋グローに（「以前の枠表示」復活）。
- **ドット**：空ステップに薄いドット（16スロット常時可視）、打ち込み済みははっきりドット＝判別補助。
- **キーボード打ち込み**：A-K=ステップ1-8 / Z-,=9-16（Shift=アクセント）。`STEP_KEYS`。スケール鍵盤(MELO_KEYS)より優先（ドラムもスケール持ち=melodic判定のため、優先しないとホーム行が鍵盤に取られる）。
- **SHIFT+PAD=SELECT**：発音せず選択のみ（SELECTボタンと同義）。
- **コマンドライン**：5行化（+解説行 clHint）。clHint は現在のモード（SELECT/MUTE/SOLO/EDIT/COPY/P-LOCK）の操作説明を表示。`clMsg` は sampNameEl のステータスを逐次反映（操作内容をどんどん表示）。
- verify(1194×834)：再生でヘッド移動（curIdx進行）、A/Z打ち込みラウンドトリップOK、SHIFT+PAD=無音選択、5行表示、0 errors。

## 25. 【v0.3.10】A-D/小節1-4に「中身あり」ドット
SEQ操作行のパターン(A-D)と小節(1-4)に、打ち込みの有無を示すアンバーのドットを追加。
- `patHasContent(p)`＝パターンp（全トラック・全小節）にステップ>0があるか。`barHasContent(p,b)`＝小節b。
- paintPerfで `.has` を付与→`::after` のドット表示。toggleStepAt でも paintPerf を呼んで即更新。
- verify(1194×834)：A=has(既定曲に中身)/B-D=空、小節1-2=has/3-4=空、0 errors。

## 26. 【v0.3.11】STEP(stepMode)廃止＋P-LOCKをステップ列へ（Digitaktモデル確定）
ユーザー指示「STEPボタン＆周辺機能は不要・シーケンス16パッドで全部可能／P-LOCKは発音PADでなくシーケンス側」。
- **P-LOCK on step strip**：パラメータ選択中、下段ステップを左右ドラッグ＝そのステップだけの値(per-step automation)。タップ＝ON/OFF。各ステップに値フィル(`.sfill`)＋数値(`.slv`)、P-LOCK有り＝`.haslock`の角ドット。`stripDrag` で既存 `setLockEdit`/`PLOCKS` を流用。
- **発音PADの左右スライド＝基本値(#8) は維持**：既存 `perfDrag`(perf+activeLock+PERF_BASE) がそのまま＝PAD=トラック基本値、STEP=per-step、の Digitakt 完全モデル。
- **STEP廃止**：`recMode` 既定を "real" に、メニューの Rec Mode(REAL/GRID) 節を削除。stepMode は常に false（dead branch はガード残置）。Recボタンは常に ●Rec（リアルタイム録音）。
- 情報窓ヒント：「PITCH：PAD左右=基本値 / 下段ステップ左右=そのステップだけ(P-LOCK)」。
- verify(1194×834)：rec=●Rec／recModeSeg無し／PITCH選択→ステップ3ドラッグで +7・フィル79%・plk付与／0 errors。

## 27. 【v0.3.12】PADS⇔SEQ 切替で縦幅がジャンプする問題を修正
全画面フィットを `body.perf`（PADS時のみ）に紐付けていたため、SEQ表示で perf が外れ→高さが縮んでジャンプしていた。
- 高さフィットを `body.perf` から **`@media (min-width:768px) and (orientation:landscape)`** へ移動＝ビューに依らずサイズで適用。`.body>.view.active{flex:1}` で PADS/SEQ どちらの active ビューも画面高いっぱいに。
- verify(1194×834)：PADS/SEQ とも `.unit` 高さ 798px で一致（ジャンプ無し）、0 errors。

## 28. 【v0.3.14】選択のみ操作を再設計（SELECT=ワンショット / Alt+PAD / Shift+PAD=MUTE）
- **SELECT＝ワンショット**：押す→パッドを1つ選ぶと選択(無音)して**自動解除**（トグル消費）。`arm("select",false)` を選択直後に呼ぶ。
- **Alt+PAD＝選択のみ**（無音）。Ctrlはブラウザのタブ切替等と衝突するため Alt 採用（クリック＋キーボード）。
- **Shift+PAD＝MUTE（既定）**に戻す（クリック＋キーボード）。v0.3.13で一旦SELECTにしたのを撤回。
- 情報窓ヒント更新：「選択のみ=SELECT or Alt+PAD / Shift+PAD=MUTE」。
- verify(1194×834)：SELECTワンショット(選択→自動解除・無音)、Alt+PAD(選択・無音)、Shift+PAD(ミュート・無音)、0 errors。

## 29. 【v0.3.15】PADS/SEQタブ(modebar)が切替でサイズ変化する問題を修正
ヘッダ/タブの圧縮を `body.perf`（PADS時のみ）に紐付けていたため、SEQで perf が外れ→modebtn が元サイズに戻り、タブが大きくなっていた。
- `.top`/`.brand .logo`/`.brand .model`/`.modebar-row`/`.modebar`/`.modebtn` の圧縮を `body.perf` → `@media(min-width:768px and orientation:landscape)` へ移動＝両ビュー共通。
- perf-screen(LCD)はperf専用なので body.perf のまま。
- verify(1194×834)：modeSeqボタン PADS/SEQ とも 105×37 で一致、0 errors。

## 30. 【v0.3.16】COMPを表から撤去（跡は空きスロット）＋EDIT+PADで発音させない
- **COMPボタン撤去**：パラメータ行から COMP を削除（COMPはメニュー Master 内で操作可）。撤去跡は `.perf-spare`（無効・dim）の空きボタンで埋め、8スロットの並びを維持。
- **EDIT+PAD で発音しない**：EDITモードのパッド pointerdown から `trigger(i)` を除去（タップ=編集モーダルのみ、無音）。
- verify(1194×834)：param行=PITCH/LEVEL/FILTER/DELAY/REVERB/(空き)/NUDGE/EDIT（8）、EDIT+PAD で start() 0回、0 errors。

## 31. 【v0.3.17】iPad横でスクロール/ラバーバンドする問題を修正（凡事徹底）
landscape≥768 のメディアクエリで html もスクロール停止＋ラバーバンド抑止。
- `html{height:100%;overflow:hidden;}`（iOSは html 要素が動くため）、`body{overflow:hidden;overscroll-behavior:none;padding:0;}`（paddingでのはみ出しも除去、慣性/バウンス停止）。
- verify：iPad各サイズ(1194×834 / 1080×810 / 1024×768 / 1133×744)で canScroll=false（html/bodyともオーバーフロー0）、html overflow=hidden 確認。

## 32. 【v0.3.18】ステップキーに薄い波形（軽量キャッシュ）
SEQグリッド(16×16)と下段16ステップ列のキーに、トラック波形を薄く敷く。
- **演奏負荷ゼロ設計**：トラック毎に波形を1回だけ透明PNGの data-URL 化してキャッシュ(`trackWaveURL`)。各セルへ CSS背景(`background-size:1600% 100%`＋`background-position`)で 1/16 ずつ割り当て＝drawImageもrAFも使わない。再生中は一切再描画しない。
- 透明背景＋`globalAlpha 0.5` の線＝セルの on/off 色を潰さず薄く重なる。`.step` は `background`(色) shorthand だが inline の `background-image` が勝つ。
- 再生成タイミング：読込/復元(`buildAllTrackWaves`)・音色変更(`refreshPadDisplay`)・テーマ変更(ink色)。選択トラック変更で下段ストリップのみ再割当(`applyWaveStrip`)。
- verify(1194×834)：SEQセル/ストリップに data-URL背景、再生1.2sで toDataURL 呼び出し増加なし(12→12)＝再描画ゼロ、0 errors。

## 33. 【v0.3.19】ステップ波形を「各セルに全波形（再生範囲）」へ（演奏用PADと同じ）
v0.3.18は全波形を16セルにスライスして敷いていたが、意味が違うと指摘。各セル＝そのトラックの再生範囲(start..end)の全波形を丸ごと表示（演奏用PADと同義＝そのステップが鳴らす音の形）。
- `setCellWave` を `background-size:1600%`(1/16スライス) → `100% 100%`(セルいっぱいに全波形) に変更。`buildTrackWave` のキャッシュ(再生範囲のdata-URL)はそのまま流用＝負荷ゼロ設計も不変。
- verify(1194×834)：SEQセル bgSize=100% 100%・全波形表示、0 errors。

## 34. 【v0.3.20】波形は「発音セル(ON)だけ」に表示
全セルに波形を敷くと埋もれるので、ONのステップだけ波形を出す（OFFはクリーン）。
- `applyWaveSEQ`/`applyWaveStrip` を `pat[s]>0` で分岐＝ONセルのみ波形、OFFセルは backgroundImage:none。
- ON/OFFは編集/パターン切替でのみ変化（再生中は不変）→ 再適用は toggleStepAt(変わった1セルのみ)・SEQセルクリック・setEditPat/Bar・dupBarNext・読込/復元 だけ。**再生中は再適用しない＝負荷ゼロ維持**。
- verify(1194×834)：KICK行 ON3セルに波形/OFF13セルは無し、0 errors。

## 35. 【v0.3.21】演奏（キー発音）が重い問題を修正：selectPadの重いUI同期をrAF集約
指弾き（別パッド連打）で selectPad の重いUI同期(refreshSeqMode/syncEditor/paintStepStrip/applyWaveStrip)が毎回走り、1タップ3.67msでラグっていた。
- 重い部分を `selectPadHeavy()` に分離。演奏タップ(light)では `requestAnimationFrame` で1フレームに1回だけ集約（連打を合体）。編集系(非light: SELECT/Alt/undo/load)は即同期＋保留rAFを破棄。
- 結果(1194×834)：別パッド連打 3.67ms → **0.40ms**（9倍）。ステップ列は選択に追従（1フレーム内）。

## 36. 【v0.3.22】perfの小節/パターンに「再生位置」枠（再生中表示）
SEQ画面の barSeg/patSeg は `.playing` 枠があったが、perf(1画面)の perf-bar/perf-pat は再生位置インジケータ関数に含まれておらず、再生中どの小節/パターンかが出なかった。
- `updateBarIndicator`/`updatePatIndicator`/`clear*` に `#perfPats .perf-bar` / `.perf-pat` を追加（displayBar/displayPat に追従、停止でクリア）。
- CSS：`.perf-bar.playing`/`.perf-pat.playing` ＝ アンバーの枠（編集中の緑 `.on` とは別物・最前面）。
- verify(1194×834)：再生中 bar1/PatA に playing 枠、停止で全クリア、0 errors。

## 37. 【v0.3.23】レイテンシ対策：上物(サンプル群g0/g1)のSSM2044をバイパス
JS発音は0.07msで問題なし＝残りは音声スレッド負荷由来のレイテンシ。SSM2044を4グループ×2倍オーバーサンプリングで回していた負荷を削減。
- `loadSSM`：サンプル群(g0/g1=PAD上段)は SSM2044 worklet を作らず `grpInputNode=grpOut` で直結バイパス。ドラム群(g2/g3)のみ SSM2044。worklet数 4→2＝音声スレッドCPU半減。
- g0/g1 は元々ほぼ素通し設定(高cut/低res)なので聴感の変化は最小。spDynOpenはg2のみ(dyn>0)なので影響なし。biquadフォールバック時もg0/g1はbiquad(軽量native)のまま。
- verify(1194×834)：ssm-2044 worklet生成 4→**2**、サンプルPAD/ドラムPADとも発音（バイパス経路で音は出る）、0 errors。

## 38. 【v0.3.24】P-LOCKを操作・見た目とも水平に統一
パッド(基本値)ドラッグが縦・ステップのフィルが縦でバラバラだったのを、全て水平に統一。
- パッド perfDrag：`y0/clientY`(縦) → `x0/clientX`(横)。右で増加。
- ステップ `.sfill`：`bottom/width:100%/height`(縦バー) → `top/bottom/width`(横バー)。`paintStepStrip` の `_fill.style.height` → `width`。
- パッドのフィル(.lockfill)は元々 width(横)。→ パッドもステップも「横ドラッグ＝横バー」で一致。
- verify(1194×834)：step fill width 87.5%(横)/pad横ドラッグでPITCH +8。**perf回帰チェック（毎デプロイ実施ルール）：warm発音0.077ms・別パッド連打0.09ms＝回帰なし**、0 errors。

## 39. 【v0.3.25】下段16ステップをSEQ画面とデザイン統一（頭拍アクセント）
PADモード下段ストリップを、SEQ画面(16×16)と同じ見た目に。
- OFFガイド：拍内4ステップを暗→明グラデ（`nth-child(4n+1)`=頭拍=#353a42暗 … `4n`=拍尻=#aab1bc明）。頭拍(1/5/9/13)に `border-left:2px` の区切り線＝頭拍アクセント。
- ON=`var(--amber)`、アクセント(acc.on)=白（SEQと同色）。旧teal/pink・中央ドットは廃止。
- 波形(ONセル)・再生ヘッド枠・P-LOCK横フィルは維持。
- verify(1194×834)：頭拍border-left 2px／拍尻#aab1bc／ON amber、**perf回帰チェック：別パッド連打0.26ms＝回帰なし**、0 errors。

## 40. 【v0.3.26】iPhone(モバイル縦)でパッド右に空きができる問題を修正
原因：`.split` を常時付与しているため、デスクトップ分割用の `#viewPads.split .pads{align-self:start}` がモバイルの flex 縦でも効き、パッドが幅いっぱいに伸びず右に空きができていた（#pads 339px / 利用可 364px）。
- モバイルメディアクエリの `#viewPads>.pads` に `align-self:stretch!important`（`.split .pads` の方が特異度が高いため!important で上書き）。
- 結果(iPhone 390×844)：#pads 339→364px、pad右の空き 38→13px（＝全要素共通の端margin）＝右の空き解消。
- perf回帰チェック：別パッド連打0.26ms＝回帰なし、0 errors。

## 41. 【v0.3.27】iPhoneは縦に一本化（横向きは回転プロンプト）
iPhone横(844×390)は幅768超でperfが出るが高さ390で潰れて酷い。「どっちかでOK」につき縦に固定。
- `#phoneRotate` オーバーレイ＋`@media (orientation:landscape) and (max-height:500px)`：横向き短画面で `.unit`/`#splash` を隠し「↻ 縦にしてください」を全画面表示。
- 判定はCSSメディアクエリのみ（JS不要）。iPad横は高さ≥768>500なので非対象＝perf維持。iPhone縦(高さ844)も非対象＝通常表示。
- verify：iPhone横=overlay表示/unit非表示、iPhone縦=通常、iPad横=影響なし。CSSのみ＝音声/JS経路に変更なし＝perf不変。

## 42. 【v0.3.28】右下のSTART/STOPボタンを廃止
`#padPlay`(.big-play)はヘッダ ▶PLAY を呼ぶだけのプロキシ＝重複だったので削除。
- HTML `#padTransport`/`#padPlay` 除去。JS参照2箇所（再生トグルのSTART⇔STOP同期／クリック配線 `()=>playBtn.click()`）も除去。
- 再生/停止はヘッダ ▶PLAY ＋スペースキーで継続。perfでは元々非表示で影響なし。残CSS(.padTransport/.big-play)はdead（無害）。
- verify(1194×834)：padPlay消去・ヘッダPLAYでトグルOK・0 errors。perf回帰チェック：連打0.52ms＝回帰なし。

## 43. 【v0.3.29】COPYを汎用化（PAD/パターン/小節）＋DUP廃止
COPYボタン(chop armモード)を、要素を問わず「元→先」でコピーする汎用ツールに。
- `copyArm={type,idx}`（type: pad/pat/bar）。`copyTap(type,idx)` が COPY中のタップを処理（1つ目=元、同種2つ目=実行、同一=取消、別種=元取り直し）。元は黄リング(.copysrc)。
- **PAD**＝`copyPadSound`（音色＋FX：filter/cutoff/reso/delaySend/reverbSend 等も含む＝エフェクト設定コピーも兼ねる）。**パターンA-D**＝`copyPattern`（全小節＋p-lock）。**小節1-4**＝`copyBar`（現パターン内、DUPの汎用版）。
- 配線：perf-pat/perf-bar・SEQ patSeg/barSeg のクリック先頭で copyTap 割り込み（COPY時のみ）。
- **DUP廃止**：COPYの小節→小節がDUP(今の小節を次へ)を内包＝冗長。perfDup/dupBar/gDupBar のボタン＋配線を撤去。
- verify(1194×834)：DUP消去、COPY元ハイライト、パターンA→Cコピー成功(onA=onC=3)、perf回帰チェック0.68ms＝回帰なし、0 errors。

## 44. 【v0.3.30】スマホtransport整列＋PLAY/REC/UNDOアイコン化
iPhone縦のtransportバーがぐちゃっとしていた問題を解消。「PLAY/RECは文字不要」「ボタンの大きさは美しくそろう」に対応。
- PLAY=▶/■、REC=●/■、UNDO=↩ のアイコンのみ表記（テキスト撤去）。
- スマホ(`@media max-width:600px`)で `.transport button.t{flex:1 1 0;min-width:0;...}` ＝7ボタン等幅1行。
- **不具合修正**：`#rec{min-width:96px}`（旧「●Rec/■Step」用の固定幅、IDセレクタ=高詳細度でmobile override(min-width:0)に勝ち、RECだけ96pxで不揃いだった）を削除。REC実装はアイコン1文字で●⇔■も幅不変＝固定不要。
- スマホでは `#stepStrip` を `display:none`（SEQ画面があるので冗長）。
- verify(390×844 mobile)：labels=[▶ ● ↩ COPY MUTE SOLO ⋮]、widths全て27px＝uniform:true・1行、stepStrip非表示、0 errors。perf回帰チェック：trigger median 0.1ms＝回帰なし。

## 45. 【v0.3.31】スマホ：MUTE/SOLOを下段EDITの横へ（transportを5ボタンに）
「MUTE SOLOは下のEDITの横でもOK」に対応。スマホ縦のtransportをさらに空けるため、MUTE/SOLOを下段に移動。
- `relocateMuteSolo()`：同一DOMノード(`#holdMute`/`#holdSolo`)を親替えするだけ。スマホ(<600px)は`.msbar`(EDIT行)へ＝[MUTE SOLO EDIT]、それ以外はヘッダ`.transport`へ戻す。load/resizeで判定。
- ID参照(arm配線・armed状態トグル)は不変＝機能影響なし。スマホはperf非該当なので、perf(ヘッダtransport依存)のMUTE/SOLOにも影響なし。
- CSS：`#viewPads>.msbar .ms-in-edit{flex:1 1 0;min-width:0!important;min-height:34px;...}`でEDITと均等3分割。
- verify：スマホ=transport[▶ ● ↩ COPY ⋮]5個均等22px/1行、EDIT行[MUTE SOLO EDIT]均等47px/1行。デスクトップ=MUTE/SOLOはtransportに復帰(従来通り)、perfはmsbar非表示で従来通り。0 errors。perf回帰：trigger median 0.1ms＝回帰なし。

## 46. 【v0.3.32】スマホtransportを全幅・均等割りに（押しやすく）
v0.3.31でボタンが各22pxまで潰れて押しにくかった。原因＝`.top`でロゴ「microtone」が幅を食い、transportが残り半分しか使えていなかった。
- スマホ`.transport{flex-basis:100%;width:100%}`＝ロゴと別行に落として全幅化。5ボタンを`flex:1 1 0`で均等割り→各**68px**(22px→約3倍)・高さ50px＝指で押しやすい。COPYの文字切れも解消。
- verify(390×844)：transport 5個=68px均等/1行、0 errors。perf回帰：trigger median 0.1ms＝回帰なし。desktop/perfは影響なし。

## 47. 【v0.3.33】スマホ：MENUモーダルの崩れ修正（設定行を縦積み）
スマホ縦でMENU(⋮)の TEMPO/MASTER/COMP 行が横並びのまま潰れ、ラベルとスライダーが重なっていた。
- `.modal` スコープで縦積み化（specificityでグローバル `.tempo-row` を上書き）：
  - `.modal .tempo-row{flex-direction:column;align-items:stretch}` ＋ TEMPO/SWING/TAP を全幅、bpmスライダー `max-width:none`。
  - `.modal .master-bar{flex-direction:column}`＝VUメーター全幅＋ノブ全幅。`.modal .master-ctrls{flex-direction:column}` で COMP/THRESHOLD/DRIVE を各全幅。
  - `.modal .master-ctrls .knob{flex:1 1 auto;max-width:none;width:100%}`。
- verify(390×844)：全セクションが縦に整列・スライダー全幅・重なりなし、0 errors。perf回帰：trigger median 0.1ms＝回帰なし。CSSのみ＝音声/JS経路不変。

## 48. 【v0.3.34】COPYは「元→先」完了でトグル消費＝自動オフ
COPYで元→先のコピーを実行したら、COPY armモードを自動解除（ボタンOFF）。連続コピーの誤爆を防ぎ、1回1動作で完結。
- `copyTap()` のコピー実行ブランチ末尾に `arm("chop",false)` を追加（copyArmリセット＋ボタンの.armed解除＋armMode=null）。
- 取消（同一を再タップ）や元の取り直しは従来通り（armは維持）。実行時のみ消費。
- verify：COPYボタンclick→armed、copyTap(pad,0)=元、copyTap(pad,1)=実行→ボタンarmed:false・copyArm:null、0 errors。perf回帰：trigger median 0.1ms＝回帰なし。

## 49. 【v0.3.35】サンプル追加の導線をEDITモーダルへ（perfでも届く）
Performance Mode（PC/iPad横の1画面）では編集ストリップごと隠していた（`body.perf …>.strip{display:none}`）ため、LOAD/● SMPL がどこにも出ず「サンプルをどこで足すの？」状態だった。設計原則「PADの中身は EDIT＋PAD で統一」に沿って、EDITモーダルに追加。
- EDITモーダル先頭に `⤓ LOAD` / `● SMPL` を追加（`.pe-sample`）。編集中パッド `peTarget` を取り込み先にして既存フロー（samp入力 / recOverlay / finalizeRec）を再利用。
- 録音/抽出オーバーレイ（`#recOverlay`/`#extractOverlay`）＋トースト（`#sampName`）を `.strip` の外（position:fixed）へ移設＝perfで `.strip` を隠してもサンプリングUIが出る。z-index 9991>モーダル9990でモーダル上に表示。
- 取り込み完了で `refreshOpenPadEdit()` がモーダルの波形/タイトルを更新。既存の波形ストリップ LOAD/SMPL（狭幅/縦画面）はそのまま。
- verify(1280×800 perf)：modal LOAD/SMPL表示、SMPLでoverlayがモーダル上に表示、overlay親=.strip外、0 errors。perf回帰：trigger median 0.2ms＝回帰なし。

## 50. 【v0.3.36】iPhone実機対応：セーフエリア / スクロール止め / strip-head全幅
実機(iOS Safari)でPCプレビューに無い崩れ3点を修正。
- **セーフエリア**：`viewport-fit=cover`＋`black-translucent`なのに`env(safe-area-inset-*)`未対応で、ロゴがステータスバー時刻に重なっていた。body paddingに safe-area inset を加算（max-width:600 / 400 / landscape の3ブロック全部）。
- **スクロール**：portraitは`body{overflow:hidden}`だけで`html`が`auto`→iOS Safariはhtmlが動いてスクロールしていた。mobileに`html{overflow:hidden}`を追加。
- **strip-head全幅**：`#viewPads.split.active`の`align-items:start`(デスクトップ用)がモバイルのflex列にも残り、padsだけ`align-self:stretch!important`で全幅・stripはstartのまま中身幅(354px)でpads(364px)より狭かった。mobileのflex列に`align-items:stretch`を追加＝strip/msbar等も全幅に。strip-actionsを`flex:1`、LOAD/●SMPLを`flex:1 1 0`で右端まで均等フィル（「LOAD SMPLの行を横幅いっぱいに」）。
- verify：strip.w==pads.w(364)・scrollPx0・0 errors、trigger median 0.1ms＝回帰なし。desktop/perfは無変更。

## 51. 【v0.3.37】Mic録音で全体音量が落ちるバグ修正（AECダッキング）
`recMic` の `getUserMedia({audio:true})` は echoCancellation/autoGainControl/noiseSuppression が全部デフォルトON。
ONだとChrome系がマイク使用中＝「通話中」とみなし、AECがスピーカー出力全体をダッキング（音量低下）。
→ 3つとも `false` に。ダッキング解消＋録り音もクリーン（サンプラーは生信号が欲しい）。
getDisplayMedia(screen録音)側はAEC無関係なので変更なし。

## 52. 【v0.3.38】Mic録音「表示されるが鳴らない」対策（無音ガード＋フォーカス統一）
v0.3.37のAEC OFFで録り音は正常化（harness実測 peak≈1.0/50273smp）。加えて保険を追加:
- 録音デコード後に `isSilent`(閾0.0009) を判定。無音なら **pushUndo前にreturn** して既存パッドを潰さず、「録音が無音でした（マイク権限・入力レベルを確認）」を表示。
- finalizeRecに `selectPad(selected)` を追加（ファイル読込と挙動を統一＝録音先へフォーカス）。

## 53. 【v0.3.39】EDITモーダル：CHOP行を1行化＋Pitch/Levelを全幅
- **CHOP行**：`.pe-chop`を`flex-wrap:nowrap`にし、セグ(TIME/ATK・2/4/8/16)を圧縮(padding 6px)、Applyボタンを`flex:1 1 auto`で残り幅にフィット。ラベルを「CHOP → 09–16 (8)」→「CHOP 09–16」に短縮(個数はセグ選択で自明)。393/375で範囲まで全表示、≤360はellipsisで安全側(折返さない)。
- **Pitch/Level全幅**：`.pe-basic`を再構成。Loop＋Scaleを上段、Pitch・Levelを各々`.pe-row.pe-full`＋`.knob.mini.pe-wide`(max-width解除)でスライダー横幅一杯に。狭幅(≤380)グリッドでも`pe-full`は1カラムで全幅維持。
- verify：modal 393/375 で CHOP 1行(クリップなし)・Pitch/Level幅=行幅・0 errors。

## 54. 【v0.3.40】録音オーバーレイをモーダルと重ねても崩れない中央ダイアログに
EDITモーダルからSMPLを開くと、`.rec-overlay`/`.toast`が`top:84px`固定でモーダルヘッダーに重なって見切れていた。
- `.rec-overlay`を`inset:0`の中央寄せ＋`::before`背面ディマー（z-index 9995＝modal 9990より上）に変更。
- `.rec-panel`を縦並びの自立パネル(bg/border/影)化。取り込み先ラベルを浮きトースト(sampName)からパネル内`#recTarget`へ移動＝モーダルと重ならない。
- extractOverlayも同経路で中央化。録音フロー(メイン/モーダル両方)・録音結果は不変。
- verify：modal上でpanel中央(centerY一致)・z 9995・録音1サイクル peak1.07/type=sample・0 errors。

## 55. 【v0.3.41】モバイル：選択矢印(◀▶)とLOAD/SMPLの重なり修正＋レトロ文書
`.strip-head .who{flex:0 0 130px}`（固定幅・縮まない）＋`.strip-actions`にmin-width:0が無い（flex既定min-width:auto＝nowrapテキスト以下に縮めない）→狭幅・長い名前で重なり。
モバイルで .who を flex:1 1 auto + min-width:0 + ellipsis（名前側が譲る）、actions/loadbtn に min-width:0 を付与。320pxで最長名でも重なりゼロを実測。docs/issues-retrospective.md 追加。

## 56. 【v0.3.42】録音を生PCM直採りに全面書き換え（実機の録音不能対策）
MediaRecorder→Blob→decodeAudioData の3段はコーデック/デコードがブラウザ依存（iOS Safariで沈黙する報告が続いた）。
→ createMediaStreamSource→ScriptProcessor(4096)で Float32 を直接収集し AC.createBuffer に積む方式へ。
- デコード工程ゼロ＝「録れたのに変換で死ぬ」が原理的に消える。SRも常にAC.sampleRateで一致
- iOS対策：録音開始/終了で AC.resume()（マイク取得時のオーディオセッション切替でACが止まり全体無音になる問題）
- 60s安全上限（メモリ保護）、ゼロゲインでtap駆動＝ハウリング防止
- 完了トーストはKB→秒表示。Tab Audio も同経路

## 57. 【v0.3.43】取り込み後に即EDIT＝範囲指定の導線
録音・ファイル読込の完了後に openPadEdit(target) を自動で開く（従来はモーダルが既に開いている時だけ更新）。
→ 取り込み→波形のSTRT/ENDハンドルで範囲指定→TRIMで確定、が1つの流れに（「取り込みの時範囲を指定したい」）。

## 58. 【v0.3.44】EDITモーダル：全スライダーを1本＝1行の全幅に
「レバーが短くて使いにくい」対応。モバイル(≤600)で #padEditModal 内の .knob(:not(.has-dial)) を flex:1 1 100%＋grid-column:1/-1（≤380のgrid化でも全幅）。
Pitch/Level/Cutoff/Reso/Attack/Fade 全て308px(390px端末)＝従来比約2.5倍。モーダルはoverflow-y:autoなので縦伸びは安全。

## 59. 【v0.3.45】レイテンシ改善：latencyHint:0＋等倍ショートカット＋pitch事前焼き込み
- `AudioContext({latencyHint:0})`＝取り得る最小バッファを要求。Chrome系でbaseLatency 5.8ms→**2.9ms(半減)**。Safariはヒント無視＝無害（try/catchで"interactive"フォールバック）
- `getPitchedBuffer(t,0)`は`t.buffer`を直返し（ratio=1の焼き込みは恒等コピー）＝チューン無しパッドの初回ヒットの全長コピー(実測3.2ms)を丸ごと省く
- tune変更時に`warmPitch()`(150ms debounce)で先回り焼き込み＝変更後の初回ヒットも0ms
- 実測: trigger median 0ms / 録音回帰なし / 0 errors。残る差はブラウザ出力段（outputLatency 9ms＋Safariの固定分）とCOMP ON時の先読み(約6ms)

## 60. 【v0.3.46】ライブ叩き中はコンプを自動バイパス（リアルタイムに切る）
DynamicsCompressorの先読み(約6ms)はライブ演奏のレイテンシに直結。手叩き(fromSeq=false)の瞬間に
コンプ経路→バイパス経路へゲインクロスフェード(4ms)で切替え、手が止まって1.5s後にゆっくり(50ms)復帰。
- 経路は常時両接続＝ゲインだけの切替でクリックなし
- SEQ由来の発音では切らない／ユーザーがCOMP OFFなら関与しない／手動切替(setCompBypass)は自動予約より優先(cancelScheduledValues)
- verify: live→byp1 / 2s後→byp0・mk1.2復帰 / seq→不変 / OFF中→不干渉 / 0 errors

## 61. 【v0.3.47】音源5点（6ロールレビュー・音源担当分）
1. チョーク/再トリガのクリック音: stopVoicesのcancelScheduledValuesがフェード予約中に直前peakへ跳ねる仕様罠→cancelAndHoldAtTime優先＋現在値ホールドのフォールバック
2. スウィング縮退: 24PPQ整数丸めで54%=50%、63%=67%だった→分数tick化（6段階が全て生きる。MPC60の96PPQ相当の解像度）
3. 最終段ソフトクリッパ: tape/echo/reverbの3系統をfinalClip(|x|<0.7透過→tanhで±0.93漸近, 2xオーバーサンプル)経由に。実測: COMP OFF+ドラム8発アクセント連打でピーク0.901＝デジタルクリップ消滅
4. loopZeroSnap既定ON（トグルHTML初期もon）＝設定なしでループ継ぎ目のプツ抑制
5. アクセント=音量+3dBだけ→spDynOpenにaccent連動(1.5倍開く)＋g3にdyn:1500付与＝「大きい」でなく「強い」音

## 62. 【v0.3.48】操作感＋感性9点（6ロールレビュー・feel/artware分）
- 空パッド: 招待の「＋」透かし＋タップで案内トースト→もう一度タップでEDIT（無音の行き止まり解消）
- ●REC: 停止中に押すと「● 記録待機 — ▶を押すと演奏を記録」、録音中は●点滅(.rec-live)
- 録音中レベルメーター（rec-meter、ScriptProcessorのpeak間引き→100ms描画、>0.9で赤）
- ストリップのSMPL/LOADは選択パッドが非空なら最初の空きパッドへ自動振替（上書き事故防止。EDITモーダル内は明示対象なので従来通り）
- EDITドラッグ閾値: touch時8→16px（誤入替防止）＋ヒントを毎回表示
- LED色のスキン変数化: --hit-c2/--hit-glow-a/--hit-ink。AK=Akaiレッド/TR=808オレンジ/SP=現状。step LED系8箇所も一括変数化
- ヘッダーに機種銘板「MICS009」（CSSは既製）＋titleをv0.1表記から修正
- エラー文言を機材コンソール調に統一（NO SIGNAL/MIC OFFLINE/SILENT TAKE 等 — 英ステータス+日ヒント）
- 録音名をREC固定→TAKE連番、Savedトーストにファイル名表示、DACトグルを銘板語化

## 63. 【v0.3.49】UI4点（6ロールレビュー・UI担当分）
- デスクトップsplitグリッド一式を@media(min-width:601px)に隔離＝「デスクトップCSSのモバイル漏れ」の発生源を根絶（レトロB系の構造対策）
- I6: SEQの7px/8pxを排除。行名10px・列番号9px＋拍頭(1,5,9,13)のみ表示、行名列32→44px
- on状態のteal/red直書き(perf-pat/perf-bar/big-play/vd-dot)をcolor-mixでスキン追従に
- --dimのコントラスト改善: root #8b919a / AK #5a5546 / SP #c8cdd2（全スキンでWCAG 4.5:1超）
- 未着手として持ち越し: モバイルPADSの現在地表示(mob-now)、601-767pxの谷間ゾーン、makeLofiの小数位相S&H

## 64. 【v0.3.50】録音後に低音が減る問題（iOSオーディオセッション対策）＝バグフィックスループ#1
実測でアプリ内DSPは無罪を証明（makeLofi 60Hz通過率1.000、再生チェーン全体で60Hzは1kHz比+1.5dB）。
正体はiOS：マイク使用でセッションが通話モードに切替→解放後もレシーバ出力(低音の出ない経路)に残る。
→録音終了時にAC.suspend()→resume()で出力経路を再交渉。iOS/iPadOS限定ゲート（Chromiumは不要＝リスクゼロ）。
Chromium回帰実測: KICK再生 baseline 0.311 = 録音後 0.311 = 追加サイクル後 0.322＝無影響。

## 65. 【v0.3.51】バグフィックス10回ループの結果
系統的に10領域を検査。R1のみ実バグ（iOSセッション→v0.3.50）、R2-R10は全てクリーンを実測で確認:
R2 SAVE/LOAD往復(16項目完全復元) / R3 CHOP(8連続スライス+choke+undo) / R4 P-LOCK配送(pitch/level/filter) /
R5 スキン(切替・LED変数・永続化) / R6 キーボード(a行/z行マップ) / R7 TRIM(誤差ゼロ+raw+undo) /
R8 パターン予約A→B(境界切替・音漏れなし) / R9 COPY pad/pat/bar / R10 メニュートグル・FX・スモーク。
掃除: favicon 404をdata-URI SVG(4パッドアイコン)で解消、CLAUDE.mdの古いchainLen記述をpatLength導出に更新。

## 66. 【v0.3.52】EDITモーダル：波形ズーム（ボタン無し＝aki rule準拠）
表示窓 peV0/peV1（0..1正規化・最大250倍）を導入。既存のドラッグ操作は peNorm 1関数の窓変換だけで
ズーム内でも精密動作（波形描画・ハンドル/シェード・CHOP境界・再生ヘッドも窓マッピング）。
- ホイール縦=カーソル支点ズーム / 横=パン（PC）
- 2本指ピンチ=ズーム＆パン（中点支点。1本目のタップで動いたハンドルは自動復元）
- ダブルタップ/ダブルクリック=全体表示（タップで動いた分も復元。ドラッグはタップに数えない=誤発動ガード）
- ズーム中は下端3pxのミニマップバー（teal）表示。別パッドを開くと窓リセット、同パッド更新は窓維持
- verify: 3.2倍ズームでENDドラッグ0.0124刻み・ダブルタップ後もドラッグ結果保持・0 errors

## 67. 【v0.3.53】波形の操作モデル刷新：掴んだ時だけ動く＋1本指パン（小画面の誤操作対策）
「2本タップするとSTART/ENDが動く」報告。原因は旧設計「波形のどこをタップしても最寄りハンドルが移動」＝
ピンチ1本目の着地・誤タップが全部ハンドル移動になる。ズーム導入で旧設計の存在理由（掴みやすさ）は消えたため刷新：
- ハンドルは画面上±26px以内を「掴んだ」時だけドラッグ（閾値はズーム倍率に自動追従）。掴んだ瞬間に指位置へ跳ねない（オフセット保持）
- 何もない場所の1本指ドラッグ＝ズーム中のパン（ピンチ無しで移動できる）
- ピンチ1本目が万一ハンドルを掴んでいた場合のみ復元（従来の全復元は不要に）
- verify: 空タップ不動 / 2本指タップ不動 / 掴みジャンプなし(0.375維持→+0.0974追従) / パン0.2→0.26 / 0 errors

## 68. 【v0.3.54】CHOP分割線のドラッグ調整＋パッド左端カラーバーのズレ修正
- **CHOP線ドラッグ**: 2/4/8/16すべての内側の線を、ハンドルと同じ「±26pxで掴む」方式でドラッグ可能に
  （隣の線±0.002でクランプ・上端に掴めるサインのドット・ピンチ開始時は復元）。
  ✂CHOP実行時のcomputeChopBounds再計算を「対象不一致/境界なし時のみ」に変更＝**手動調整を破棄しない**。
  verify: div2/4/16の左右ドラッグ・クランプ・調整どおりの適用、全pass
- **カラーバーのズレ**: .pad::before(幅3px)にborder-radius:9px→半径が幅を超えて潰れ、パッド角丸(内側8px)と
  不一致＝スマホ高DPRで線ズレ。親.padにoverflow:hiddenを与えバーは角丸なし＝クリップで完全一致（3x DPR確認）

## 69. 【v0.3.55】波形編集を2レーン方式に刷新（概観＋拡大：Serato/TwistedWave/Logic系の定番）
「ズーム・スクロール・チョップ選択が至極やりにくい」→ 隠しジェスチャ（ピンチ/ホイール）依存をやめ、
業界標準の「概観レーン＋表示窓」方式へ。
- 上：概観レーン(36px)＝全体波形（キャッシュ描画）＋CHOPティック＋teal窓フレーム（端に掴みグリップ）
- 窓ドラッグ=スクロール / 端±14pxをつまむ=ズーム（全体表示中も可＝最初の入口） / 窓外タップ=ジャンプ（全体中は半幅窓を作成）
- 下：拡大ビュー＝ハンドル/CHOP線の掴み専用（v0.3.53の±26pxグラブ）。ピンチ/ダブルタップ/1本指パンは併存
- 旧3pxズームバーは撤去（概観レーンが継承）
- verify: 端ズーム0→0.4 / 窓パンspan維持 / 外タップジャンプ / 左端縮小 / CHOP線ドラッグ / ダブルタップ復帰、全pass・0 errors

## 70. 【v0.3.56】競合ギャップP1：WAV書き出し・リサンプル・リバース・メトロノーム
docs/roadmap-competitive.md 参照（Koala/SP-404MK2/EP-133/Digitakt比の計画）。
- WAV書き出し: メニューProject「WAV ↓」＝編集中パターンを頭から1ループ、finalClipを実時間キャプチャ→bufToWav。頭の無音自動トリム＋0.6sテール
- リサンプル: 録音ダイアログに「Resample」＝マスター出力を専用タップ(Gain)経由でpcm直採り（SP-404流）。verify: 実捕音peak0.387
- リバース: EDITに「⇄ REV」＝破壊的反転(undo可)。start/end鏡映・新バッファ＝キャッシュ自動無効化。verify: サンプル鏡映一致
- メトロノーム: メニューSoundのトグル＝拍頭クリック(小節頭アクセント)。destination直結＝FX/lofi/書き出しに乗らない
- verify: 4機能全pass・mic録音回帰なし・0 errors

## 71. 【v0.3.57】共有シート対応＝メンバーでやり取り（Web Share API）
- shareOrDownload(): File+navigator.canShare→共有シート（iPhone=AirDrop/LINE等へ直接）。非対応/キャンセルはDLへフォールバック
- Save(.mics)はクリック＝ユーザー操作中なのでそのまま共有シート
- WAVはキャプチャ完了がジェスチャ外＝share不可のため2タップ方式：1タップ目=書き出し→ボタンが「↑ 共有 / 保存」に→2タップ目=共有シート
- verify: フォールバックDL(.mics/.wav 224KB)・2タップ遷移・ボタン復帰・0 errors

## 72. 【v0.3.58】iPhoneマイク録音が小さい/変 → テイク自動ノーマライズ
v0.3.37でAGCを切った(ダッキング対策)ため生マイク＝レベル小。さらに小信号の12bit量子化はザラつく（「変」の正体）。
→ finalizeRecでピークを-1dBFS(0.9)へ自動増幅（上限+30dB・SILENT TAKEガードは増幅前に判定＝無音は増幅しない）。
Resampleは「聴こえたままの音量」が正なので対象外（_lastRecWasResample判定）。
verify: 0.05→0.900正規化 / Resample0.3維持 / 無音ガード維持・0 errors

## 73. 【v0.3.59】CHOPは既定OFF（開いた時は線を出さない）
分割セグに「OFF」を追加し既定に。EDITを開いた直後は波形がクリーン、2/4/8/16かATKを選んだ瞬間だけ線が出る。
OFFのまま✂を押しても「まず分割数を選ぶ」の案内のみ（誤チョップ防止）。OFFに戻すと線が消える。

## 74. 【prototype】guitar-strum.html — ギターストロークシミュレーター
Karplus-Strong物理モデリング（ノイズバースト→ディレイループ＝撥弦）。サンプル不要・合成はバッファ焼き込み＝発音はBufferSourceのみで軽量。
- 開放コード8種（C/G/Am/F/Em/D/A/E・ミュート弦も再現）
- 6本の弦を指でなぞる＝ストローク（なぞる速さ→強さ、方向はなぞり順で自然に）。タップ＝単音。同一弦は再発音でチョーク
- 弦の太さ（低音弦ほど太い）・振動アニメ・箱鳴りLPF
- 本体アプリとは独立ファイル（APP_VERSION対象外）。将来はMICS009のResampleで録ってパッドへ、が動線

## 75. 【v0.3.60】メニューにGTR入口
メニュー(⋮)Project行に「GTR 🎸」＝guitar-strum.htmlを新しいタブで開く（作業中のビートを失わない）。

## 76. 【GTR】STEEL/NYLON トーン切替
Karplus-Strongの材質パラメータ化：NYLON=励起ノイズを一次LP(0.30)で丸め（指の腹）＋高域ブレンド0.20（早い減衰）
＋ピックノイズほぼ無し＋胴LPF 3300Hz。材質でレベルが変わるためバッファ正規化を追加。
実測: 高域率 steel 0.394 → nylon 0.086（約4.5倍丸い）。

## 77. 【v0.3.61】GTRボタンにキャッシュバスター
guitar-strum.htmlには本体のversion.json更新検知が無く、iPhoneのキャッシュで旧版が出続ける（NYLONが見えない報告）。
→ メニューのGTRボタンは ?v=APP_VERSION 付きで開く＝本体更新のたびにGTRも必ず最新。直接URLの場合は?任意文字列で回避。

## 78. 【v0.3.62】GTR: STEEL/NYLONの差を拡大（57倍）
「あんまり音の差ない」→ steel blend0.70/damp0.9975/pick0.35/胴6500（ピックの煌めき・長サステイン）、
nylon blend0.12/damp0.992/pick0.02/励起LP0.18/仕上げpostLP0.22(≈2kHz)/胴2600。
実測: 高域率 steel 0.629 vs nylon 0.011＝57倍差（旧4.5倍）。GTRキャッシュバスト用に本体版番も更新。

## 79. 【v0.3.63】GTR: 奏法バリエーション（位置トーン＋ブラッシング）
「ジャラジャラ鳴らすだけ」→ ボタン追加なしで奏法3種（実物と同じ理屈のジェスチャ）:
- 弾く位置(X)＝音色: per-voice LP 900+x^1.4*8000Hz。実測 ネック1473Hz vs ブリッジ3279Hz
- ブラッシング: 静止指(>120ms,<12px)を置いたままなぞる＝チャカ（20msでゲート+LP2800上限+150ms停止）。実測 残響ゼロ
- アルペジオ: ゆっくりなぞる（既存機能をヒント文で明示）。本体版番はGTRキャッシュバスト用に更新

## 80. 【v0.3.64】GTR: 両手持ちレイアウト（GarageBand/Real Guitar系）
- 2カラム化: 左84px=コード縦1列（左手親指の可動域に8個・flexで全高フィル）/ 右=ストローク面（右手）
- 低い弦を手前(下)に反転＝構えたギターを覗き込んだ見え方。弦名ラベル(E A D G B e、下=低E)追加
- ストローク/ミュート/位置トーン全て回帰OK。本体版番はGTRキャッシュバスト用に更新

## 81. 【v0.3.65】Guitar→パッド録音の導線＋GTR大幅強化
ユーザー設計の導線を実装:「空きパッド＋→音源を選ぶ(Mic/読込/Resample/Guitar)→Guitarは演奏画面で●録音→演奏→■→パッドに入って波形編集」
- MICS009: 録音ダイアログに「Guitar 🎸」→GTRを同一オリジンiframeで全画面表示（画面遷移なし＝ビート保持）。
  PCMはpostMessage(transferable)で受領→pcmChunks経由でfinalizeRec共通経路（makeLofi→パッド→EDITモーダル）→名前「GTR <コード名>」
- GTR: ?embed=1で●録音バー表示（body1出力をSPで捕音・60s上限・■完了でpost・✕でキャンセル）
- GTR: 12キー×ダイアトニック8コード（I IV V vi ii iii bVII V7）＝E型バレーの音程計算で全キー。◀KEY▶で切替、コード名自動表示。バッファはキャッシュ＝押下即応
- GTR: コードは「押さえている間だけ実音」離すと全弦ミュート（押弦の物理）。左手を離した状態のストロークはブラッシング
- verify: keyC=C F G Am Dm Em Bb G7 / keyG転調正確 / hold実音0.995→離すと残響0 / e2e: pad6に「GTR C」peak0.824・EDITモーダル自動オープン・iframe撤去・0 errors

## 82. 【v0.3.66】GTR: 7th/リアルミュート/ビートモニター＋DJスクラッチ(SCR)プロト
- 7thトグル: maj→M7/min→m7(V7維持)。E型maj7/m7ボイシング追加。CM7にB3(maj7th)を確認
- ミュート音を物理モデル化: 強ダンピングKS(0.88)+丸め励起+爪の「チッ」=専用0.22sバッファ（ゲート切り廃止）
- ▶ビート: GTR埋め込み中にpostMessageで親トランスポート操作＝ビートを聴きながらギター録音（別ACなので録音にビートは混ざらない）
- dj-scratch.html: テープヘッド方式（posを指へのバネ追従、逆再生自在）。素材はフォルマント合成の「アー」＋ハット。メニューにSCR💿

## 83. 【v0.3.67】Web MIDI入力（USB鍵盤/パッドコントローラー対応）
requestMIDIAccessで全入力を購読＋statechangeでホットプラグ。Note Onのみ処理（Note Off無視＝画面パッドと同じ挙動）。
- 60-75(C4=中央のド=パッド1)→trigger(パッド1-16)、vel>=100でアクセント
- それ以外→playVoice(selected, semi=note-60)＝選択パッドを半音演奏。SCALE設定はnoteSemi経由で有効
- 接続時トースト表示。iOS SafariはWeb MIDI非対応（PC/Mac Chrome・Edge・Android Chromeで動作）

## 84. 【v0.3.68】空パッド：「＋」タップ＝ワンタップで音入れ（案1・Koala流）
パッド中央40%×40%の「＋」ゾーンをタップ→即EDITモーダル（音源選択）。端のタップは選択＋案内トーストのみ。
従来のダブルタップも併存（寛容）。＋の視認性を強化(30px/opacity .5)。

## 85. 【v0.3.69】空パッドのダブルタップ遷移を廃止（＋ワンタップに一本化）
同じ操作の入口が2つ（＋タップ/ダブルタップ）＝重複はバグの温床の原則に従い、ダブルタップを撤去。
端タップは案内トーストのみ。_emptyTapI/_emptyTapT状態も削除。

## 86. 【方針転換→v0.3.70実装】D&Dコピーは中止 → COPYボタン機能拡張に一本化
D&D仕様（旧§86）はユーザー判断で中止・削除。理由: 既存COPYボタンの「元をタップ→先をタップ」1操作に統一する方が
入口が増えず（重複=バグの温床の原則）、学習コストも既存のまま。
実装: copyTapに type "note" を追加＝COPY中にstepStrip/SEQグリッドのセルをタップで元→先。
- ノートコピーは値＋P-LOCK全パラメータ引き継ぎ（doCopy noteブランチ・pushUndo・別トラック行も可）
- パッド/パターン/BARは既存のまま＝これで4種すべて同じ操作
- 同一セル2度タップ=取消（note座標比較）。トースト表記「05·3」=トラック·ステップ

## 87. 【v0.3.71】マルチアウト：パッドごとに OUT A/B（外部ミキサー2系統）
KO Sidekick等の4ch以上USB出力機器向け。destination.maxChannelCount>=4でChannelMerger(4)に差し替え:
- OUT A = ch1/2 ＝ 従来のマスター経路（SSM/コンプ/テープFX込み）
- OUT B = ch3/4 ＝ ドライ送り（12bit/パッドフィルター/エンベロープ後、グループFX前）＝外部ミキサーで処理する前提。FXセンドも送らない
- 最終段をmainOut集約（finalClip/ヒス/メトロノームclick）＝差し替え点を1箇所に
- EDITモーダルADVに「OUT A|B」セグ。未接続時も設定可（トーストで「現在はAで出力」と明示）。.micsに保存(outBus)
- ステレオ機器では全パッドA＝従来どおり。実測: フォールバック発音/保存往復/UI同期 pass・0 errors
- 実機確認事項: Sidekick接続のChrome(PC/Mac)でch3/4分離・levels

## 88. 【v0.3.72】S2400接続時のシステム巻き込みフリーズ＋勝手に同期再生の対策
原因分析: ①S2400はUSBオーディオ機器でもある→v0.3.71の起動時マルチアウト自動検出がchannelCount/discreteを
強制しドライバを巻き込んだ疑い ②S2400シーケンサーのMIDIノートをv0.3.67のMIDI入力が全部受信して発音（「同期」の正体）
＋クロック0xF8が毎秒48-120通流入。
対策（教訓「自動化は楽器の敵」を自分に適用）:
- マルチアウトは起動時自動→メニュー明示ON（multiOutToggle）に変更。動作中の解除は再読み込み（配線替えの危険回避）
- MIDI: リアルタイム系(>=0xF8)を先頭で即捨て / handleMIDI関数化 / メニューにMIDI入力トグル（既定ON）
- ノート洪水ガード: 1秒45ノート超＝外部シーケンサーと判定して自動OFF＋トースト（発音エンジン保護）
verify: クロック2000通0.6ms・50連射自動OFF・トグル復帰・ステレオ環境で正直な不検出・0 errors

## 89. 【v0.3.73-74】MIDI SYNC（外部クロック追従）＋ライブ・ダッキングのマイルド化
**MIDI SYNC（要明示ON・既定OFF）**: 0xF8を24個/拍として平均間隔からBPM推定（40-250BPMのみ採用・0.3BPM以上の差で更新・
外れ値/途切れはリセット）。0xFA/0xFB=Start→再生、0xFC=Stop→停止。SYNC OFF時はクロックを従来どおり即捨て。
S2400等に「合わせる」作業自体を消す。verify: OFF時無視 / 147BPMクロックに145.7で追従 / Start・Stop連動。

**ライブ・ダッキングのマイルド化**: 旧実装は完全バイパス（threshold→0/makeup→0/bypass→1.0を4msで）＝
コンプが効いている瞬間の切替で **実測-3.9dB** の段差が出て「変なダッキング」に聞こえていた。
→ パラレルコンプ方式へ: 閾値は動かさず（コンプの効きは保つ）ドライを LIVE_DRY=0.35 だけ混ぜる。
アタックはドライ経路から先に届くので先読み遅延の体感は消えるまま、段差は **実測-1.0dB**（約1/4）。
ramp 25ms in / 180ms out・hold 1200ms。復帰は実測0.00dB（完全に戻る）。

## 90. 【v0.3.75】敵対的UIレビュー（UI/操作感/感性の3隊）→ P0一括修正
3隊が独立に同じ場所を指した収束点: ①メニュー「Sound (A/B 試聴)」に音色/編集/クリック/出力配線/MIDIが同居＝増築の歪み
②GTR🎸/SCR💿がProject（自分のデータの列）に混在＋ファイル中カラー絵文字はこの3個だけ ③SYNCトーストの毎秒連発。

**採用・修正（13件）**
- outBusが swapPads/copyPadSound/snapshotState/restoreState に無い＝UNDOが嘘をつき、OUT B設定が別パッドに取り残される → 4経路に追加
- MIDI入力が既定ON（§88の教訓がMIDIに未適用）＋ストームガード45notes/sは通常ビート(8notes/s)を素通り → **既定OFF**に
- `if(!midiEnabled) return;` がクロック処理より前＝MIDI入力OFF/ストーム自動OFFでSYNCも黙って死ぬ（点灯が嘘） → 順序を入替えSYNCを独立
- SYNCトーストが毎秒上書き（唯一のフィードバック窓を潰す） → 初回1回だけ告知、BPM表示は静かに追従＋paintPerf()
- BPMスライダー min60/max180 vs SYNC追従域40-250＝黙ってクランプ→次に触ると飛ぶ → 40-250に統一
- GTR全画面に親側の✕とESCが無い＝iframeが死ぬと操作不能（beforeunload無し＝リロードで全消失） → ✕とESCを追加
- multiOutToggleがOFFにできない（押せないスイッチ＝嘘・プロジェクト規約「全モードはトグル」違反） → merger付け外しで実際にOFF可能に（channelCountには触らない）
- WAV書き出し/OUT Bのパッドが無警告で欠落 → 書き出し中だけ outBGain→finalClip 合流
- peOutSegが multiOut=false でもB点灯＝100%嘘 → `.inert`表示＋`→A`バッジ＋ヒント文を動的化。無変更pushUndoも抑止
- トースト `white-space:nowrap`+`max-width:80vw`＝390px端末で約24文字、MIDI STORM(約510px必要)等が構造的に読めない → 折返し可・文字数連動表示時間
- OSのalert()でデバッグダンプ（MIME/バイト数/decodeNG）を客に見せていた2箇所 → console.warnへ落とし機材語トースト1行に
- paintCopyHLが#perfPats（横向き専用）しか塗らない＝スマホでCOPY元が完全に不可視。`.patbtn.copysrc`のCSSはあるのに付与コードが存在しなかった → SEQ/GRIDのA-D・小節・ノートセルまで拡張
- COPYの異種タップが無言で元を差し替え→次のタップでパッドを丸ごと上書きする破壊経路 → 拒否＋案内に変更。arm()はCOPY離脱時に必ず元をリセット
- 空パッドの「＋」: 固定30pxグリフ vs 可変高さ40%判定の不一致 → 44px円の実体＋半径判定に統一。着地先のEDITも空パッド時はLOAD/SMPLの2枚だけに（v0.3.65設計と実装がようやく一致）
- メニュー再編: Sound / Timing / I/O / Source / Project の5セクションへ。ラベルから括弧の言い訳を削除、絵文字ゼロ

**却下（操作感隊の反対意見を採用）**: SPP対応等のSYNC高機能化（土台に位相補正が無い状態で積まない）／COPYへの種別追加（種別混在が事故源）／OUT BのFX経路選択肢（設定が増えるだけ）

**次回への持ち越し**: MIDI SYNCの位相補正（現状はBPM推定のみ・小節頭は合わない）／Perf LCDのターミナル調（`//`・`> ready _`・常時ヒント・トースト二重表示）／Perf+P-LOCK中にパッドが鳴らない／Master VUが合成値／トグルのa11y（role=switch）／COPYボタンだけtransportに残る配置／メニューのGTRはembed無しで録音できない入口の不統一

## 91. 【v0.3.76】MIDIをプログラマブルに（ASSIGN学習）＋着信インジケーター
- **ASSIGN学習**: EDITモーダルADVに「MIDI」行（ASSIGN / NOTE表示 / CLEAR）。ASSIGN→鍵盤を押す→`tracks[i].midiNote`に記憶。
  学習中は発音しない。同じ鍵盤の二重割り当ては作らない（先に持っていたパッドを自動解除）。もう一度ASSIGNで取消。
  **MIDI入力OFFでも学習できる**（明示操作なので驚きが無い）。割り当ては既定マッピング(60-75=パッド1-16)より優先。
- **着信インジケーター**: ⋮ボタン右上のLED＋メニューI/Oの`MIDI IN <note>`モニタが130ms点灯。
  **入力OFFでも光る**＝ケーブル/機器が生きているか目で分かる（クロックでは光らせない＝S2400接続時に点きっぱなしにしない）。
- 状態同期は**最初から全経路**に通した（v0.3.75のoutBus事故の教訓）: swapPads/copyPadSound/snapshotState/restoreState/.mics保存/読込。
- verify: LED点灯・消灯 / 学習(無発音・NOTE表示・トースト) / 割り当て優先 / 二重防止 / copy・swap・UNDO追従 / CLEAR / .mics往復 — 12+1項目pass・0 errors

## 92. 【v0.3.77】ASSIGNを一般化：MIDI鍵盤とPCキーを同じ1操作で学習
入口を増やさず（重複＝バグの温床の原則）、ASSIGNを「**次に押されたものを覚える**」に一般化。
- EDIT ADVの行を `MIDI` → `ASSIGN`（MIDI / KEY の2値を表示、CLEARは両方消す）
- ASSIGN押下 → 次に来た **MIDIノート** or **PCキー** のどちらでも `tracks[i].midiNote` / `tracks[i].key` に記憶。
  学習中は発音しない。Escapeで取消。修飾キー単独は無視。二重割り当ては自動解除（assignTo()に共通化）
- **明示割り当ては既定キーより優先**: STEP_KEYS/MELO_KEYS/KEYMAP より先に判定。
  例）"a"をPAD3に割り当てるとステップ入力ではなくPAD3発音になる（実測でステップ値が変化しないことを確認）
- 状態同期は `key` も最初から全経路（swap/copy/snapshot/restore/.mics保存/読込）
- verify: 学習(無発音・KEY表示・トースト) / 学習キーで発音 / 既定より優先 / 二重防止 / MIDIとキーの併用 /
  .mics往復 / copy・swap・UNDO追従 / CLEARで両方消去 — 11項目pass・0 errors

## 93. 【v0.3.78】PC横幅の谷間ゾーン（601〜767px）で画面が破綻する問題を修正
splitの2カラムは右カラムが`minmax(300px,...)`を要求するため、601〜767pxで発動すると左のパッドが潰れる。
実測: 620px→パッド43×43px（指で押せない）/ 700px→63px / 760px→77px。
→ splitの開始を **768px**（Performance Modeと同じ閾値）へ引き上げ、積み上げレイアウトを **767px** まで伸ばして隙間なく接続。
実測（修正後）: 620px→137px / 700px→157px / 760px→172px。820px(perf)・1100pxは無変更で健全。

## 94. 【v0.3.79 / MPC式 第1段】情報窓を全レイアウトへ＋選択パッドの値を窓で直接編集
案3（MPC式）採用。「EDITモーダルではパッドを跨ぐ連続編集がやりにくい」の根治として、
**固定ディスプレイ＋常時叩けるパッド**というハード機の形へ段階移行する。その第1段。
- `.perf-screen` を `body.perf` 限定から解放し**全レイアウトで常時表示**（`#viewPads`直下・モバイルは`order:0`で最上部）
- モバイル縦は2行に圧縮（head/TRK/msgを隠す＝TRK名はstrip-headが表示済みで二重表示にしない）。実測56px
  → 積み残しだった「モバイルPADSに現在地(BPM/PAT/BAR)表示」も同時に解決
- **選択パッド追従**: `paintPerf()`の`body.perf`早期returnを撤去し、`selectPadHeavy()`から呼ぶ＝**叩く＝選ぶ＝編集対象**
- **窓の中で直接編集**: `PITCH`/`LEVEL` を横ドラッグ（MPCのデータホイール相当。pitch=14px/半音、level=8px/dB）。
  ドラッグ1回で1手のUndo、`warmPitch`連動、EDITモーダルを開いていれば追従
- 敵対的レビュー（感性隊）のターミナル臭を同時に是正: `MICS009 // PERFORM`→`MICS009`、`> ready _`プロンプト撤去、
  常時ヒント→アーム中のみ、メッセージ/ヒント行は空なら行ごと消す
- verify: 表示・最上部配置・2行56px・現在地表示・選択追従・ドラッグ(-5→-2)・Undo復帰・ターミナル臭ゼロ・0 errors

## 95. 【仕様・実装前】MPC式 第2段/第3段 — 情報窓のページ化とモーダル廃止
スペック駆動: 実装前にここを確定させ、受け入れ条件を満たしたら次段へ進む。

### 目的
EDITモーダルの開閉をゼロにし、「パッドを叩く → 窓に出る → その場でいじる → 次のパッドを叩く」を途切れさせない。

### 第2段: 情報窓をページ化（モーダルは残す＝安全網）
- 窓に**ページタブ**を追加。ページは4つ:
  | ページ | 内容 | 備考 |
  |---|---|---|
  | `SAMPLE` | 波形（概観＋拡大）/ STRT・END / TRIM / REV | 第1段の波形編集資産をそのまま移設 |
  | `TUNE` | PITCH / LEVEL / SCALE / LOOP | 第1段のPITCH/LEVELはここへ集約 |
  | `TONE` | FILTER種別 / CUTOFF / RESO / ATTACK / FADE | |
  | `ASSIGN` | MIDI / KEY（ASSIGN・CLEAR）/ CHOKE / OUT A-B | v0.3.76-77の資産を移設 |
- 操作: タブをタップで切替。値は第1段と同じ**横ドラッグ**。トグル類はタップ。
- **CHOPは移設しない**（分割線ドラッグは広い面積が要る）＝モーダル側に残す。
- 高さ制約: モバイル縦で窓は**最大140px**（パッドを88px以上に保つ）。超える場合はページを分割する。

### 第3段: モーダル廃止
- EDITボタンの役割を「モーダルを開く」→「**窓を編集ページに切り替える**」に変更
- 空パッドの「＋」は `SAMPLE` ページ（LOAD/SMPL）へ直行
- `padEditModal` とその CSS/JS を削除。CHOPは `SAMPLE` ページ内の全画面オーバーレイに退避

### 受け入れ条件（各段で満たすこと）
1. **連続編集**: パッドA→B→Cと叩いて、窓が毎回追従し、途中でモーダルの開閉が発生しない
2. **高さ**: iPhone縦(390×844)でパッド1枚が88px以上を保つ
3. **状態同期**: 窓で変えた値が `.mics`保存 / UNDO / copy / swap に正しく乗る（outBus事故の再発防止）
4. **単一の真実**: 同じ値をモーダルと窓の両方から編集できる期間は第2段のみ。第3段で必ず片方を消す
5. **0 errors**、既存の発音レイテンシ（trigger median 0ms）を悪化させない

### 却下済み（案1/案2）
- 案1（モーダルに◀▶）: 逐次移動のみ・モーダルのままでは音を聴きながら編集できない
- 案2（モーダル内にミニ4×4）: 本物のパッドとの**二重表示**＝「入口の重複＝バグの温床」に抵触

## 96. サンプル編集の棚卸し＋MPC1000式ページ化（v0.3.81 / 第2段）
「MPC1000のEDITが最高」＝**下端のソフトキー(F1-F6)でページを切り替え、カーソルで欄を選び、
データホイールで値を回す**。この操作モデルをタッチに翻訳して情報窓に載せた。

### 96-1. 棚卸し（パッド1枚が持つ編集項目の全数）
`tracks[i]` の編集可能プロパティを1つ残らず並べ、カテゴリと入口を突き合わせた表。

| # | 値 | 型/範囲 | ページ | 従来の入口 | 備考 |
|---|---|---|---|---|---|
| 1 | `tune` | -12..+12 st | MAIN | strip / モーダル / 窓 | **3箇所**あった |
| 2 | `scale` | off/chro/maj/min/pent | MAIN | strip / モーダル | |
| 3 | `vol` | -30..+6 dB | MAIN | strip / モーダル / 窓 | **3箇所**あった |
| 4 | `start` | 0..1 | SAMPLE | 波形ハンドルのみ | 数値で追い込めなかった |
| 5 | `end` | 0..1 | SAMPLE | 波形ハンドルのみ | 同上 |
| 6 | `loop` | bool | SAMPLE | strip / モーダル | |
| 7 | `loopStart` | 0..1 | （なし） | 波形ハンドル | loop ONで自動追従。欄は作らない |
| 8 | `filter` | off/lp/hp | TONE | strip / モーダル | |
| 9 | `cutoff` | 200..18000 Hz | TONE | strip / モーダル | |
| 10 | `reso` | 0.1..14 | TONE | strip / モーダル | |
| 11 | `attack` | 0..200 ms | TONE | モーダルのみ | |
| 12 | `fade` | 0..500 ms | TONE | モーダルのみ | |
| 13 | `delaySend` | 0..1 | FX | **入口なし** | 保存もされ再生でも効くのに触れなかった（P-LOCKのみ） |
| 14 | `reverbSend` | 0..1 | FX | **入口なし** | 同上 |
| 15 | `choke` | 0..8 | ASSIGN | strip / モーダル | |
| 16 | `outBus` | A/B | ASSIGN | モーダルのみ | |
| 17 | `midiNote` | 0..127 | ASSIGN | モーダルのみ | LEARNで記憶（表示専用欄） |
| 18 | `key` | PCキー | ASSIGN | モーダルのみ | 同上 |
| — | `buffer`/`rawBuffer` | 音源 | SAMPLE | LOAD / SMPL / GTR | `WAVE ▸`からモーダル |
| — | `mute`/`solo` | bool | （PADSモード） | MUTE/SOLOボタン | 演奏操作なので窓に置かない |
| — | 破壊編集 | TRIM/REV/CHOP | （モーダル） | `WAVE ▸` | 面積が要るので第3段まで据置 |

**棚卸しで出た事実**
1. `delaySend`/`reverbSend` は**モデルにも保存にも再生にも居るのに、UIだけが無かった**（13/14）。FXページで解消。
2. `start`/`end` は波形ドラッグでしか動かせず、数値で詰められなかった（4/5）。
3. 同じ値が strip・モーダル・窓の**3箇所**から編集できていた（1/3）＝過去に何度もやった同期バグの構図。
   第2段の間は許容（§95 受入条件4）、第3段で strip とモーダルを畳んで1本にする。

### 96-2. ページ構成（§95からの変更点と理由）
| ソフトキー | 欄 |
|---|---|
| `MAIN` | PITCH / SCALE / LEVEL |
| `SAMPLE` | START / END / LOOP ＋ `WAVE ▸`（波形・TRIM・REV・CHOPのモーダル） |
| `TONE` | FILTER / CUTOFF / RESO / ATTACK / FADE |
| `FX` | DELAY / REVERB |
| `ASSIGN` | CHOKE / OUT / MIDI / KEY ＋ `LEARN` `CLEAR` |

- §95案の `TUNE` を **`MAIN`** に改名し PITCH/LEVEL を残した：第1段でこの2つは常時表示だった。
  タブに沈めると一番使う操作が1タップ増える。MPC1000も MAIN ページが既定。
- **`FX` ページを追加**（§95には無かった）：棚卸しで見つかった入口なしの2値のため。
- タブは上ではなく**窓の下端のソフトキー**（MPC1000のF1-F6）。ページ名＝キーの真上、という機械の作法。

### 96-3. 操作（タッチへの翻訳）
| MPC1000 | MICS009 |
|---|---|
| カーソルキーで欄を選ぶ | 欄をタップ＝カーソル（`.cl-par.sel` が点灯） |
| データホイールで値を回す | 欄を**横ドラッグ**（`px`＝1目盛に要るpx。pitch14 / level8 / cutoff2 …） |
| INC/DEC で列挙を送る | 列挙欄（SCALE/FILTER/LOOP/OUT）は**タップで1つ送る** |
| F1-F6 でページ | 下端の5ソフトキー |

- 実装は `CL_SPEC`（欄の定義）＋ `CL_PAGES`（ページの定義）の2つのテーブルだけ。
  欄を足す＝テーブルに1行足す。描画は `renderClPage()`、値の更新は `paintClPage()`（`paintPerf()`から毎回）。
- ドラッグ1回＝Undo1手。変更後は `syncEditor()`＋`refreshOpenPadEdit()` で strip とモーダルも追従。
- 表示幅は v0.3.80 の固定幅ルール（`.cl-num` ＋ `min-width:Nch`）に乗せる＝値を回しても欄が動かない。

### 96-4. verify（Playwright）
- 5ページの切替と全18欄の描画：0 errors
- PITCH 横ドラッグ +70px → `tune=5` / LOOP タップ → `false→true` / DELAY ドラッグ → `delaySend=0.2`（**初めてUIから触れた**）
- 390×844：窓 110px（§95の上限140px内）/ パッド 97px（≥88px）/ ページスクロールなし
- 1280×800（perf）：窓175px、ソフトキー34px
- v0.3.80の固定幅測定も再実行し全項目 stable のまま

## 97. ゾンビUIの撤去 — strip-ctrls の編集ノブ群を削除（v0.3.82 / 第3段-前半）
§96のページ化で「窓が全項目をカバーした」ので、重複入口を畳む番。畳む前に**実際に見えているか**を測った。

### 判明したこと：見えていなかった
`.strip-ctrls` の Loop / FILTER / Choke / Pitch / Scale / Cutoff / Reso / Level は、
CSSの2行によって**どのレイアウト・どのモードでも表示されない**状態だった。

```
body:not(.step-on) #viewPads .strip-ctrls{display:none!important;}  ← 通常時は行ごと非表示
body.step-on #viewPads .strip-ctrls>:not(.gridctrls){display:none;} ← GRID時はgridctrls以外を非表示
```

Playwright で 390×844 / 700×900 / 1280×800 の通常時と `step-on` の計6条件を測り、
12個すべて `hidden`、`gridCtrls` だけが GRID 時に `VISIBLE` であることを確認した。

つまり §96-1 の表で「strip / モーダル / 窓の3箇所」と書いた重複は、実際には
**モーダルと窓の2箇所＋"見えないのに値だけ書かれるDOM"**だった。
`syncEditor()` は再描画のたびにこの見えないノブへ8回書き戻し、`bindKnob`/`makeDial` は
発火しようのないポインタ操作を待ち続けていた。

### 撤去したもの
- HTML: `loopToggle` `filtSeg` `chokeSel` `kTune` `kScale` `kCut` `kRes` `kLvl`（＋各`.v`表示）
- JS: 上記のイベント登録一式、`bindKnob`、円形ノブ機構（`makeDial`/`dials`/`refreshDials`、約45行）
- CSS: `.dial` 一式（`::before`のconic-gradient目盛、`::after`の指針、`.dial-val`）と `.knob.has-dial`、
  スマホ用 `.strip-ctrls .adv{display:none!important}`
- `syncEditor()` は「パッド名＋パッド内波形」だけになった（値のUIは情報窓のページ1本）

`.strip-ctrls` の箱は残す＝GRID（Digitakt式）の PAT/BAR＋P-LOCK 行がそこに居るため。

### 引き継ぎ
SCALE は `kScale` の change ハンドラで `refreshSeqMode()` を呼んでいた。
窓の SCALE 欄の setter に同じ呼び出しを移設し、SEQの音階表示が連動することを実測で確認。

### verify（Playwright / 390・700・1280の3幅）
5ページ切替・SCALEタップ→`chro`かつ`melodicMode=true`→1周して`off`復帰・`syncEditor`・
`openPadEdit`開閉・GRIDのPAT/BAR表示・SEQ往復・UNDO復帰・パッド97px・スクロールなし・**0 errors**。
§96/§80の測定（ページ描画・固定幅）も再実行して不変。

### 残り（第3段-後半）
`padEditModal` 本体（波形・TRIM/REV・CHOP・LOAD/SMPL）の移設。面積が要るので、
SAMPLEページからの全画面オーバーレイとして設計してから着手する。

## 98. 未使用行の全数検出と撤去／ラーニングを表画面へ／ダブルクリックで0（v0.3.84）

### 98-1. 検出のやり方（静的解析だけでは足りなかった）
静的grepで出たのは2件だけ（`dupBarNext` / `_editHintShown`）。実際に効いたのは**実行時に測る**方法。

1. 全CSSルールのセレクタを `document.styleSheets` から取り出し、
   **7状態 × 3画面幅**（通常 / step-on / SEQ / モーダル / モーダルADV / perf / EDITアーム、390・700・1280）で
   `querySelectorAll(sel).length` を測る → どの状態でも0件のセレクタ 141/533 を抽出。
2. 141件の大半は「実行時に付く状態クラス」（`.pad.hit` `.toast.show` など）＝生きている。
   そこで各セレクタの識別子が **HTML/JSに単語として存在するか** で二次フィルタ → 20件に絞れた。
3. `getElementById("X")` の X がHTMLに無いものも突き合わせ → `recModeSeg` `perfRec` を発見。

**落とし穴**: CSS Nesting対応で `CSSStyleRule` も空の `cssRules` を持つため、
`if(r.cssRules){recurse; continue;}` と書くと全ルールを取りこぼして「0件」になる。selectorTextを先に見る。

### 98-2. 撤去したもの
| 対象 | 実体 |
|---|---|
| `.padTransport` / `.big-play` | 大きなSTART廃止時にCSSだけ残っていた（要素なし） |
| `.perf-rec` 一式 | perfのRECボタンが無いのにCSS・待機ランプ・鼓動アニメが残存 |
| `.perf-dup` / `.dupbar` / `.perf-plk-label` | 同上 |
| `.perf-plkbtn[data-lock="comp"]` | COMPをP-LOCKから外した時の残り |
| `dupBarNext()` | どこからも呼ばれない小節複写（約20行） |
| `_editHintShown` | 書かれるだけで読まれない |
| `recModeSeg` のIIFE | セグメントUIが無く `if(!seg) return` で毎回抜けていた |

**過剰に消しかけた例**: `.perf-rotate` を「未使用」と判断して要素ごと削除したが、
`body.perf-rotate` は `updatePerf()` が付けていた（grepを `head -5` で切っていて見落とし）。復元済み。
**教訓**: 「CSSセレクタが0件」は「使われていない」ではない。クラスを**付ける側**のコードを必ず確認する。

### 98-3.〈訂正〉最初のタップが効かない原因は入力シールドだった
当初「窓が起動直後だけ2行ぶん高く、縮んでページがずれるせい」と書いたが**誤り**。実際は
`start()` がスプラッシュのタップ直後に張る **450msの透明シールド**（`position:fixed;z-index:99999`、
開始タップに続く touchend/click が下のUIを誤爆しないためのもの＝意図した仕様）で、
そのタップだけが飲まれていた。Playwrightで `elementFromPoint` を辿って特定。
テスト側は初回ジェスチャ後に600ms待つのが正しい。

メッセージ行/ヒント行を既定 `display:none` にした変更自体は入れてあるが（初回paint前の状態を
HTMLと一致させる保険）、窓の高さは前後とも110pxで**見た目は変わっていない**。

### 98-4. ラーニング（ASSIGN）を表画面で完結させる
- `assignTo()` が `if(pad===peTarget) syncAssignUI(...)` でしかUIを更新しておらず、
  **窓から学習するとMIDI/KEY欄が更新されなかった**。窓側は常に更新するよう分離。
- ASSIGNページに**着信ランプ** `#clMon` を追加。MIDIノートもPCキーも同じ `inBlink()` で光る
  ＝メニューを開かずに「繋がっている／効いている」が分かる。割り当て済みキーで鳴らした時も光る。
- 学習待機中に別のパッドを選んだら**的をそちらへ移す**（`clRetargetLearn()`）。
  窓は選択パッドを映しているので、的がズレたままだと表示が嘘になる。
- Escape取消も窓に反映。
- 副産物のバグ修正: `assignTarget` の宣言がファイル後方にあり、`selectPadHeavy()` から参照した瞬間に
  **TDZで起動が丸ごと停止**した。状態はstateブロックで宣言する。

### 98-5. パラメータはダブルクリックで0（全箇所共通）
- 情報窓の**数値欄**：ダブルクリック／ダブルタップ（320ms以内）で **0**。
  0が範囲外の `CUTOFF`(200Hz〜) と `RESO`(0.1〜) だけ一番0に近い値。欄ごとの既定値テーブルは作らない。
- EDITモーダルのスライダーも**同じ作法**（`input[type=range]` 共通ハンドラ）。
- **列挙欄（SCALE/FILTER/LOOP/OUT）は対象外**：タップで送るのが主操作で、素早い2連打を
  リセットと誤認すると「送ったのに戻る」になる。OFFへは数タップで届く。
  （実装当初これで SCALE の周回が壊れ、smokeテストが `off` に戻らず検出）
- ドラッグ同様、リセットも1手＝Undo1回。

### 98-6. verify
`width`(固定幅) / `pg`(5ページ・ドラッグ・列挙タップ) / `smoke`(SCALE連動・モーダル・GRID・SEQ・UNDO) /
`learn`(LEARN→PCキー→MIDI→的の移動→CLEAR→発音ランプ) / `zero`(14欄すべて0・モーダルのスライダー・Undo復帰)
を 390/700/1280 で実行、**全て0 errors**。

## 99. テンポ／スウィングも表画面で（v0.3.85）
情報窓の上段 `BPM` `SWG` は表示専用だった＝テンポを変えるにはメニューを開くしかなかった。
パッドのパラメータと**同じ作法**で窓から直接いじれるようにした。

- `BPM`：横ドラッグ＝データホイール（10pxで0.5、範囲40–250）。ダブルクリック／ダブルタップで **100**。
  テンポに「0」は無いので、`zero:` を持つ欄だけの例外として既定値へ戻す（他の数値欄は一律0のまま）。
- `SWG`：列挙欄。タップで 50→54→58→63→67→71→50 と送る（他の列挙欄と同じくリセット対象外）。
- **書き込みは既存のメニューUI経由**：`#bpm` / `#swing` に値を入れて `input`/`change` を発火させる。
  こうすると `bpmVal`・readout・`setDelayTempo()`・`paintPerf()` が既存ハンドラでまとめて走り、
  経路が2本にならない（同期バグの再発防止）。
- `CL_SPEC` に `g:1`（パッドではなく本体の状態）を追加し、`GET/SET` で分岐。欄の定義は1行のまま。
- 上段の欄も指で掴めるよう `.cl-par` に `min-height:30px`。カーソル（`.sel`）は窓全体で1つに統一。

verify：ドラッグ右+100px→94.5→104.5（スライダー・readout・LCDが一致）／左-60→100／
ダブルクリック→100／SWGタップで71、6タップで一周／UNDO復帰／**再生中の変更も追従**（100→104）。
390・1280で0 errors。

## 100. SAMPLEページに波形を出す — モーダルへ行かずに切れる（v0.3.86 / 第3段-後半その1）
「SAMPLEのエディットは右に波形を出せばモーダルに行かずともできるのでは」に対応。

### 方針：複製しない、移動する
波形エディタ（概観レーン＋波形＋START/END/LOOPハンドル＋プレイヘッド）は**1実体のまま**、
情報窓のSAMPLEページと EDITモーダルの間を `appendChild` で行き来させる。
- 既存のハンドラは全て `document.getElementById("peWave").parentElement` と
  `getBoundingClientRect()` で座標を出しているので、**移動先でそのまま動く**（書き換え不要だった）
- `#peWaveBox` にまとめ、モーダル側の帰り先を `#peWaveHome` として明示
- 対象は `peTarget`。SAMPLEページを開いている間は選択パッドに追従（`clSyncWave()`）
- モーダルを開く時は必ず回収し、閉じた時にSAMPLEページなら返す

これで「同じ波形エディタが2つある」状態を作らずに済む（§96-1で潰した重複入口の再生産をしない）。

### レイアウト：窓の高さを増やさない
最初 `#clPage` の中にスロットを置いたら、行が1つ増えて**窓が175→259pxに膨らみパッドが57pxまで潰れた**。
スロットを情報窓の直下に常設し、SAMPLE中だけ `.perf-screen.has-wave` で**2カラムのグリッド**にして、
波形を既存の行の右側に立てる形に変更。結果：**窓 187→193px（+6）／パッド 90px**。

**ハマり2つ**
1. `.pe-wave` はモーダル用に `height:128px` 固定。窓側で `height:auto` にすると中の canvas の
   属性サイズ（dpr倍）が効いて列ごと伸び、窓が396pxまで膨張した。窓では明示的に低い値を指定し、
   canvas は `position:absolute` にしてレイアウトに寸法を主張させない。
2. `grid-row:1/-1` は**暗黙行しか無いと1行しか指さない**（`-1`＝1本目の線）。その1行だけが波形の高さまで
   膨らんだ。`span N` に変更。ただし N を大きくし過ぎると空行のgapぶん窓が伸びる（span 20 で+32px）。
   行数ぶん（span 7）が正解。

### モバイル（≤767px）
横に並べる幅が無いので1カラムに戻し、概観レーンを畳んで波形46px。
START/END/LOOPの3欄は390pxでは1行に収まらず2行になるため、**SAMPLEページの間だけパッドが71px**になる。
§95の受入条件「パッド88px以上」はSAMPLEページを除外して読む（編集中は演奏面積を譲る）。
細かい追い込みは `✂ CHOP` ボタンからモーダルへ。

### 双方向の同期
- 波形のハンドルを動かす → `paintClPage()` で START/END/LOOP 欄の数値が追従
- 窓の欄をドラッグ → `renderPeWave()` でハンドルが動く
- どちらも1手＝Undo1回

### verify（390 / 1280）
箱の所在：起動=modal → SAMPLE=窓 → TONE=modal → SAMPLE=窓 → CHOPで modal → 閉じて窓、と全遷移を追跡。
ハンドルD&D→`start=0.108`／欄に `10.8` 反映。欄D&D→ハンドル移動。選択パッド変更で `peTarget` 追従。
1280で波形は欄の右（x=800 vs 140）。ページスクロールなし、**0 errors**。既存6本のテストも全て0 errors。

### 残り
`padEditModal` にはまだ CHOP / TRIM / REV / 試聴 / ADV（FILTER・CHOKE・ASSIGN・ATTACK/FADE）が残る。
ADVの中身は情報窓の TONE/ASSIGN ページと**重複**しているので、次はそこを畳む。

## 101. モーダルは「入り組んだ設定」だけに — 音作りは全部おもて（v0.3.87 / 第3段-後半その2）
「CHOP / TRIM / REV / モーダルは入り組んだ設定だけで音作りは表に出す」に対応。
§96の棚卸しで作った情報窓のページが全項目をカバーしたので、モーダル側の重複UIを畳んだ。

### 消したもの（すべて情報窓に同じ値がある）
| モーダルの区画 | 中身 | 移った先 |
|---|---|---|
| `.pe-basic` | Loop / Scale / Pitch / Level | MAIN・SAMPLE ページ |
| `.pe-adv` FILTER | 種別 / Cutoff / Reso | TONE ページ |
| `.pe-adv` CHOKE | ON / グループ1-8 | ASSIGN ページ |
| `.pe-adv` ASSIGN | ASSIGN / MIDI / KEY / CLEAR | ASSIGN ページ |
| `.pe-adv` OUT | A / B | ASSIGN ページ |
| `.pe-adv` ATTACK·FADE | Attack / Fade | TONE ページ |
| `#peAdvToggle` | ADV開閉 | （ページ切替が代わり） |

JS側も一緒に撤去：`bindPeKnob` とその6呼び出し、`peScale`/`peLoopToggle`/`peFilt`/`peMidiLearn`/
`peMidiClear`/`peOutSeg`/`peChokeSel`/`peChokeToggle` のハンドラ、`openPadEdit` の書き戻し20行、
ADVトグル、モーダル用のダブルタップ0（rangeが無くなったので不要）。
`syncAssignUI()` は `paintClPage()` の別名に痩せたので関数ごと畳んだ。

### 残ったモーダル＝波形をいじる道具だけ
`LOAD / SMPL`（音源の差し替え）・波形・`PLAY`（試聴）・`TRIM`・`REV`・`CHOP`。
見出しも役割どおり **`TRIM · CHOP`** に改名。
実測で **`input[type=range]` 0個 / `select` 0個** ＝ 音作りのつまみはモーダルに1つも残っていない。

### 連鎖して死んだCSSも掃除
§98の検出器（実行時に全セレクタを9状態×3幅で照合→識別子の実在で二次フィルタ）を再実行し、
`.pe-basic` `.pe-adv` `.pe-adv-toggle` `.pe-row` `.pe-hint` `.pe-wide` `.pe-full` `.knob.mini`
`#peOutSeg.inert` `#peMidiLearn.learn-on` など **22ルール**を削除。
`.knob` `.toggle` の素の定義はメニュー側で生きているので残す。

### 回帰テストを1本に統合
散らばっていた7本（width/pg/smoke/learn/zero/tempo/wave）を `check.mjs` にまとめた。
390×844 / 700×900 / 1280×800 で、固定幅・5ページ・ドラッグ・列挙タップ・ダブルクリック0・
BPM/SWG・ラーニング一巡・波形の所在遷移・双方向同期・**モーダルにノブが無いこと**・
SEQ往復・UNDO・縦スクロールなし・0 errors を一括検証する。**全項目パス**。

パッド高：390=71px（SAMPLEページ表示中）／700=95px／1280=81px。

## 102. ページを移すとメニューの幅が変わる問題（v0.3.89）
「LCDのメニューを動かすと幅の大きさが変わるのダメ」。実測すると 1280px 幅で、
SAMPLEページに移った瞬間だけ **ソフトキー行が 1000px→648px（1キー 197→126px）** に縮んでいた。

§100 で波形を右に出すため `.perf-screen` を2カラムにした際、
`.cl-row` と `.cl-keys` をまとめて `grid-column:1` に押し込んでいたのが原因。
波形の列ぶんだけメニューまで痩せていた。

**直し方**：行だけを `.cl-body` で束ね、グリッドを名前付き領域にした。
```
grid-template-areas: "body wave"
                     "keys keys";
```
ソフトキー行は常に窓の全幅。数値欄の列（`#clPage`）だけが波形のぶん狭くなる（これは意図どおり）。

`tools/check.mjs` に「窓の幅 / メニューの幅 / キー1枚の幅が、5ページを通して一定」の判定を追加。
実測：390も1280も全ページで `keys=1000px` `key1=197px` 固定。

## 103. 窓の寸法は状態で動かない（v0.3.90）— 「同じ類」を止める
「Sample Assign を選ぶと窓の高さが変わる」。実測すると全幅で高さが揺れていた。

| 幅 | main | smpl | tone | fx | asgn |
|---|---|---|---|---|---|
| 390 | 125 | **215** | 163 | 125 | **167** |
| 700 | 125 | **175** | 125 | 125 | 127 |
| 1280 | 187 | 191 | 187 | 187 | 189 |

原因は2つ。**欄が折り返して行が増える**（TONE/ASSIGNは2行）ことと、
**狭い幅では波形が下に積まれる**こと。さらに調べると3つ目があった——
**メッセージ/ヒント行が空なら畳まれる**ので、トーストが出るたびに窓が伸び縮みしていた。

### 直し方：予約制にする
- `--cl-page-h` … 欄の行に必ず確保する高さ（一番混むページに合わせる。<768pxでは2行ぶん78px）
- `--cl-wave-h` … 狭い幅でSAMPLEに積む波形の高さ。**予約の内数**にする
  （`.has-wave #clPage{min-height:calc(var(--cl-page-h) - var(--cl-wave-h) - 2px)}`）
- 広い幅では波形は右カラム。列の高さは `.cl-body` が決め、波形は
  `flex:1 1 auto` で残りを埋める＝**波形が窓を押し広げない**（canvasは`position:absolute`で寸法を主張させない）
- メッセージ行とヒント行を**1行に統合**し、空でも高さを確保。長文は折り返さず端で切る
  （全文はトースト側に出る）。折り返しを許すと長文のたびに窓が伸びる

結果：390/520/700/1024/1280 のすべてで、5ページ・長文メッセージ・ヒント・素の**全状態で高さが同一**。

### 途中で作った不具合（実測で発見）
CHOPボタンを波形の隣に置いたら、狭い幅で **波形が幅2pxまで潰れた**。
`#peWaveBox` に `min-width:0` と `flex:1 1 auto` が無く、flexの取り合いにボタンが勝っていた。
ボタンは狭い幅でアイコン（✂）だけに縮め、波形に310pxを返した。

### 再発防止（これが本題）
`tools/check.mjs` に「**状態が変わっても寸法が1pxも動かない**」を入れた。
比較対象は 窓 / メニュー / キー1枚 / パッド1枚 / パッド全体 の **[幅, 高さ, x, y]**。
検査する状態は **5ページの切替 ＋ 長文メッセージ ＋ ヒント ＋ 素** の8通り、これを**5幅**で回す。
1つでもズレたら exit 1。

このクラス（レイアウトが状態で跳ねる）は目視で見落とすうえ、
「特定の幅の特定のページだけ」という条件付きで出るため、
以後は必ずこの判定で止める。値の書式や欄を足すときも、まずここを通すこと。

## 104. TRIM/CHOPをLOOPの横へ／波形を大きく（v0.3.91）
「TRIM CHOPはLOOPの横にボタンを置いて 波形が小さすぎる」。

- `✂ TRIM/CHOP` を波形の隣から**欄の行（START / END / LOOP の横）**へ移した。
- 波形は **モバイル 40→74px / デスクトップ 96→122px**。

**高さの出どころ**：SAMPLEページの間だけ上段のBPM行（`.cl-stat`）を畳み、その高さを波形に回す。
編集中に BPM/SWG/PAT/BAR/STEP は要らないので、窓の高さを増やさずに波形だけ大きくできる。
§103の「窓の寸法は状態で動かない」は維持（5幅すべてで全ページ同一）。

**電話幅で1行に収める**：390pxで START/END/LOOP/✂ が2行に折り返すと、波形に回せる高さが半分になる。
≤520pxでは欄の間隔とパディングを詰め、START/END の `%` を省いた（値が0-100なので自明）。
実測 349px→321px（360px端末でも1行）。ボタンは ≤767px でアイコン `✂` のみ。

## 105. UI規則の宿題1と4を潰す（v0.3.93）
`docs/ui-rules.md` §11 の宿題から、指名された2件。

### 宿題1：パッド名が読めない（2.53:1 → 5.15:1）
`.pad.pcat-empty .nm{opacity:.55}` が原因。「空」であることは中央の＋アイコンが示しているので、
名前まで薄くする理由が無かった。撤去して基準（値は4.5:1）を満たす。
あわせて `.pad .nm` にパッド面色のハローを敷いた。コントラスト計算には出ないが、
**実際に読みにくかったのは波形の上に名前が載る所**だったので、ここが本命の修正。

### 宿題4：デスクトップのパッド面積 15.2% → 21.6%
情報を持っていない行を perf で畳み、その高さをパッドへ回した。
- 情報窓のブランド行（`MICS009` の表示。アプリのヘッダに既にある）→ 畳む
- `PAD` / `SEQ` のセクション見出し（2行×15px）→ 畳む
- `■ STOP` は情報を持つので捨てず、上段の BPM/SWG/PAT/BAR/STEP 行へ移した
- perfのパッドの隙間 10→6px

結果：パッド1枚の高さ **83→115px**（1024幅では 67→99px）、情報窓は 25.5%→20.6% で予算内。
モードボタンの非選択色も 3.96→合格へ（`--dim` のままだと明るい盤で足りない）。

### 予算そのものを見直した
横widescreenで30%に届かないのは形の問題。16パッドを8×2に広げると1枚が横長になり、
面積を稼ぐには縦を食うしかない。上の計器を全部残したまま800px高で取れる上限が実測21.6%だったので、
**縦持ち30%／Performance Mode 20%** の2本立てに改めた（根拠つきで `ui-rules.md` に記載）。

### 測定器を3回直した
最初のスコアは全項目0点で、原因は全部測る側だった：Chromeが返す `color(srgb …)` 表記の誤読、
グラデーション背景を透明と見なす、**先頭のalpha 0.09の色味レイヤーを地の色として採用**、
ロゴの `<b>` を「値」と判定。**スコアが悪いときはまず測り方を疑う**を `ui-rules.md` §12 に明記した。

## 106. 波形を空きいっぱいへ／更新で音が消えないように（v0.3.94）

### 波形 340×40 → 548×95（デスクトップ）
**§105の「デスクトップの波形122px」は誤報だった**。122pxはスロット（列）の高さで、
波形そのものは **40px** しか無かった。原因は `#peWaveBox` が flex コンテナでないこと。
`.pe-wave{flex:1 1 auto}` を書いても、親がただのブロックなのでモーダル用の `min-height:40px` が残っていた。

- `#peWaveBox` を flex 列にして、波形が列の高さを埋めるようにした
- 列幅を固定%（34%）から `minmax(0,1fr)` ＝「欄の右の空き全部」に変更。
  グリッドは `auto minmax(0,1fr)` なので、左は欄の内容ぶん、残りは全部波形

結果：画面比 1.33% → **5.08%**（3.8倍）。窓の高さは 204px のまま（§103の不変性は維持）。
モバイルは 342×74（7.69%）で変わらず＝縦は既に空きが無い。

### 更新やリロードで読み込んだ音が消える問題
更新ボタンはキャッシュバスト付きリロードなので、メモリ上のサンプルが全部消えていた。

- **IndexedDB に丸ごと1件だけ自動保存**（localStorageは数MBで足りない。WAVを積むと数十MB）
- 保存内容は `.mics` と**同じ形式**。`buildProject()` に切り出して Save と共用＝形式が食い違わない
- 起動時に自動保存があればそれを復元し、無ければ `default.mics`。復元したら窓に一言出す
- **演奏中は絶対に書かない**（全パッドのWAVエンコード＝重い。音が飛ぶ）。
  `pushUndo()` で「変更あり」の印だけ立て、5秒ごとに「止まっていて・前回から15秒以上・暇」なら書く。
  離脱時（`visibilitychange` / `pagehide`）だけは条件を無視して書く
- メニューに **RESET**（自動保存を消して初期状態へ。確認ダイアログつき）

### 再発防止
`tools/check.mjs` に**リロードで復元されること**を追加（名前・tune・ステップ・BPM・バッファの有無）。
データ消失は再発が致命的なので、5幅すべてで毎回検査する。

## 107. ソフトキーの文字を大きく — 規則側の曖昧さを先に直す（v0.3.95）
「MAIN SAMPLE … のメニューの文字はもう少し大きくても　規則参照」。
規則を読み直したら、**規則の側が曖昧だった**。

`MAIN / SAMPLE / TONE / FX / ASSIGN` は10pxで、`ui-rules.md` §3の分類では「ラベル（9px/3:1）」に
落ちていて**合格扱い**になっていた。だが実際には「名前が付いた飾り」ではなく
**「いまどのページに居るか」という状態の表示**で、読めなければ迷子になる。

### 規則を明確化（§3）
> **現在地を示すラベルは「値」**（11px / 4.5:1）。ソフトキーやモードボタンが該当する。
> 欄の見出し（PITCH / BPM など）だけが「ラベル」。
> 非選択のものも読める濃さにすること（`opacity` で薄くして基準を割らない）。

### 実装
- 文字 10px → **12px**
- 高さ 34px → **44px**（演奏系の触れる大きさ＝§2。宿題3の解消）
- 非選択の `opacity` .5 → **.72**（薄すぎて基準割れしていた）

窓 189→199px / 204→214px、パッド 78→75px / 115→110px。窓の高さは全ページ同一のまま（§103維持）。

### 再発防止
`tools/check.mjs` に「ソフトキーの高さ44px以上・文字11px以上」を追加。5幅で毎回検査する。

### スコア
| | 390 | 1280 |
|---|---|---|
| 視認性 | 68 → **72** | 50 → **54** |
| 触れる | 44 → **64** | 24 → **44** |

残る演奏系の44px未満は情報窓の欄（`.cl-par` 30〜32px＝宿題2）とトランスポート（35〜38px）。

## 108. トランスポート等を44pxへ／SEQの小節が選べないバグ（v0.3.96）

### 触れる大きさを規則どおりに
| 対象 | 前 | 後 |
|---|---|---|
| トランスポート（▶ ● ↩ COPY ⋮）デスクトップ | 35px | **44px** |
| MUTE / SOLO / EDIT（モバイル） | 34px・文字9〜10px | **44px・11px** |
| LOAD / SMPL（モバイル） | 38px | **44px**（`span`はinlineのまま min-height が効かず38pxだった） |
| PADS / SEQ ドット | 28px | **36px**（二次操作＝32px以上） |
| モードボタン（デスクトップ） | 37px | **44px** |
| 情報窓の欄 `.cl-par` | 30px | **34px** |

**規則を精密化（§2）**：`44×44` は「狙って指を置く」タップの基準。
**横ドラッグが主操作の欄は「高さ32px以上＋面積1936px²以上」で可**とした。
緩めていいのはドラッグの的だけで、タップで押すものは例外なく44px。

増えたぶんは**機能ではなく余白から返した**（`.top` / `.modebar` / `.msbar` / `.strip` の
padding・margin）。結果、モバイルのパッド面積は 30.6% で予算内を維持。
スコア：触れる 390:44→**98** / 1280:24→**100**。

### SEQでパターン/小節が選べないバグ
**`#patSeg` / `#barSeg` のクリック登録が丸ごと消えていた。**
v0.3.84 の「未使用行の撤去」で `function dupBarNext(){` 〜 次の `function` までを範囲指定で
削除した際、その間にあった `[[patSeg…]] [[barSeg…]]` の登録と
`const gPatSeg / gBarSeg` を巻き込んでいた。

気づけなかった理由：**id を持つ要素は `window` の暗黙グローバルになる**ので、
宣言が消えても `gPatSeg` の参照だけは動き、エラーも出なかった。3バージョン潜伏していた。

### 全体検査の結果
`bef65de`(v0.3.80) と現在で、消えた**リスナ登録22件・関数6件・要素参照11件**を全数照合。
**意図しない削除はこの1件だけ**で、他は全部（stripのノブ群・モーダルの音作りUI・円形ノブ機構）意図どおり。

### 再発防止
- `tools/lost-listeners.mjs` を追加。前の版と比べて消えたリスナ/関数/要素参照を並べる
- `tools/check.mjs` に「SEQでBAR2とPAT Cを押して選べる」を追加（5幅で毎回）
- 教訓を `docs/issues-retrospective.md` へ：**範囲指定でコードを消さない**。
  消す文字列そのものを書いて1件ずつ消し、消したら `lost-listeners.mjs` を回す

## 109. SEQの高さがウィンドウに追従しない／関門と再編成（v0.3.97）

### SEQの高さ追従
「SEQモードでウィンドウサイズ追従が動かない。一度切り替えて戻すと直る」。
再現：1280×800 でSEQを開き、高さ560にリサイズ → `#viewSeq` は 605px のまま（往復すると 365px）。
幅は追従していた。**高さだけ**が追従しない。

原因は `lockViewHeight()` が **PADS表示中しか高さを測り直さない**こと。SEQ表示中は
`refViewH` に古い値が残り、`.body` の `min-height` が窓の高さより大きいままだった。
SEQ表示中は窓の残り（`.body` の上端〜下端）から求めるようにし、`orientationchange` も拾うようにした。
リサイズ時に `paintSteps()` も通す（往復と同じ経路）。

再発防止：`check.mjs` に「ウィンドウを変えたあとの SEQ の寸法 ＝ PADS↔SEQ 往復後の寸法」を追加。

### 関門（gate）— 記憶に頼らない再発防止
`tools/gate.mjs` を作り、`.githooks/pre-push` から自動で呼ぶ。check / dead-controls / lost-listeners の
どれかが落ちたら push できない。`tools/dead-controls.mjs`（押しても何も起きないコントロールの総当り）を
新設。v0.3.96 の「ハンドラが消えた」バグはこれで即座に出る。誤検知（再描画で目印が消える／
`.click()` では pointer 系が動かない／選択済みの再タップ）を潰して 0 件にした。

関門の初回実行で check.mjs が1件落ちたが単独再実行では通った。6ワーカー並列検査の負荷による
時間切れ（フレーク）と判断し、起動待ちを固定 sleep から「`tracks[0].buffer` が揃うまで待つ」に変更。
**フレークする関門は信用を失う**ので、時間待ちは仕様上必要な450msシールドだけに限定した。

### チーム再編成（8ロール）
v0.3.96 まで**検査を持つ役が居なかった**。`qa`（検査）と `player`（演奏＝叩いて気持ちいいか）を新設し、
既存5ロールの brief に道具と数値規則を接続。Definition of Done を CLAUDE.md に明記。

## 110. 全件検査（6ワーカー並列）で出た16件を潰す（v0.3.98）
「全体的に挙動が変　全体検査をかけてください」→「配下にワーカーを複数立ち上げて、各セクションごとに検査」。
PADS / SEQ / 情報窓 / トランスポート・保存 / 再生・タイミング / レイアウト・コード整合 の6セクションに分けて
並列検査し、ここで指揮を取って修正した。**ワーカーは報告のみ、修正は1本化**。

### 見つかった不具合と修正（重要度順）
| # | 担当 | 重要度 | 症状 | 原因 → 修正 |
|---|---|---|---|---|
| 1 | W1 | 高 | タッチで EDIT→パッドを叩くとモーダルが即閉じ／**✂TRIM が勝手に発火**（70560→35280フレーム） | touchend後にブラウザが合成する click が「指の位置で再ヒットテスト」されモーダル上に落ちる。開いてから450msはモーダル内のclickを飲む |
| 2 | W3 | 高 | 情報窓でドラッグ直後に同じ欄を掴み直すと**値が0に飛ぶ** | ドラッグした押下も「タップ」に数えていて2連打と誤認。動かした押下は lastTap を消す |
| 3 | W4 | 高 | Load した .mics が自動保存に乗らず、**次回起動で読む前に戻る** | Load経路に pushUndo が無く dirty が立たなかった。Load前に pushUndo、Load後に即 autosaveNow(true) |
| 4 | W6 | 高 | スマホ・PC狭幅では再生中も STEP「--」STATE「■ STOP」 | ライブ更新が perf 限定のまま。全レイアウトで更新（規則§1「嘘をつかない」） |
| 5 | W6 | 高 | PCの縦長ウィンドウ（960×1040等）が「横向きにしてください」で**操作不能** | 回転案内はタッチ端末（pointer:coarse）だけに。PCは split で動かす |
| 6 | W6 | 高 | 実機Safari相当（390×664）でパッドが**29px** | パッドが唯一の伸縮要素で余りを全部吸収。下限56pxを持たせ、足りなければ `#viewPads` 内で縦スクロール |
| 7 | W4 | 中〜高 | 演奏しながら編集→タブを閉じると**全部消える** | 演奏中は書かない＋pagehideは非同期IDBを待たない。WAVエンコードをキャッシュして buildProject を軽くし、演奏中も書く。変更から5秒で必ず一度書く |
| 8 | W5 | 中 | 再生中にBPMを下げると**最大1小節近い無音** | barStartTime を張り替えず小節頭から新テンポで再計算。`applyBpm()` で「次ステップの時刻」を据え置いて位相維持（2583→336ms） |
| 9 | W5 | 中 | perf の **●REC が DOM に無く**、ライブP-LOCK記録が到達不能 | v0.3.84以前から欠落（CSSだけ残っていたのを v0.3.84 で「未使用」と削除）。空きスロットに ●REC を復活 |
| 10 | W5 | 中 | 小節末の手叩きが**次の小節／次パターン**の step16 に記録 | playPat/playBar はスケジューラが100ms先行。記録先を displayPat/displayBar に |
| 11 | W4 | 中 | 空パッドを含む .mics を Load しても旧サンプルが鳴る（幽霊） | `audio:null` で buffer を消していなかった。`type==="empty"` なら null に |
| 12 | W3 | 中 | END のダブルタップが毎回 Undo を2手積み、1回で戻らない。START も動けなくなる | END の「0」は無音で意味が無い＝戻し先を末尾(1)に（BPM→100 と同じ「0が無い欄」の例外）。同一欄の500ms内の再発火は1手 |
| 13 | W3 | 中 | ASSIGN で他パッドから奪った割当が Undo で戻らない | 奪う前に pushUndo |
| 14 | W6 | 中 | 320〜360幅で窓の高さがページで動く | 360：欄の間隔 8→6px で SAMPLE の4項目を1行に（特異度に注意）。**320は対象外**（最小サポート幅360） |
| 15 | W6 | 中 | ≥768 の縦長 split で窓の高さがページで動く | split グリッドに `screen` 領域が無く右カラム（408px）に自動配置されていた。全幅の最上段へ |
| 16 | W3/W5/W6 | 低 | 2本指で別欄を触ると先の指の移動が後の欄に効く／列挙欄の往復で戻らない／nextChokeGroup が Undo で戻らない／barHasContent の二重定義／paintAll の死んだガード／MUTE・SOLO が自動保存に乗らない | それぞれ修正（pointerId 照合、d=0 で元値、snapshot に追加、先の定義を削除、ガード削除、scheduleAutosave） |

### 仕様として据え置いたもの（判断待ち）
- 予約中PATの再押しでは予約が解除されない（解除は「再生中PAT」の押下。コード通り）
- スマホの SEQ グリッドからアクセント（値2）を打つ手段が無い（Shift+クリックのみ）
- 全パッドが音階モードのとき `← DRUMS` が効かない
- 停止しても `recording` が true のまま（MPC的にはREC待機維持）
- VINTAGE DAC / SP CH FILTER / メトロノーム / MIDI SYNC 等の設定はリロードで既定に戻る（.mics に入っていない）
- 1280 perf では LOAD/SMPL/◀▶ が画面に無い（EDIT→パッド→モーダル経由のみ）
- `.perf-pat`/`.perf-bar` 選択中 4.26:1（アートウェア判断待ち）

### 再発防止に足したもの
- `tools/static-check.mjs`（W6の検出器を取り込み）：暗黙グローバル・不在id・版3点一致。関門の最初に走る
- `tools/dead-controls.mjs` の非決定性を修正（`.on` はクリック直前に引き直す）
- `tools/check.mjs`：タッチのゴーストクリック／●REC／記録先／BPM位相／空パッドLoad／Load→自動保存／
  掴み直し／奪った割当のUndo／非perf再生表示／PC縦長で回転案内が出ない／パッド下限56。
  幅に **390×664（実機Safari）** と **960×1040（PC縦長）** を追加して7幅に
- 起動待ちを固定sleepから状態待ちへ（並列検査の負荷でフレークしていた）

## 111. LCDから「MICS009」表記を外す（v0.3.99）
情報窓の最上段にあったブランド行（`.cl-head` / `.cl-brand`）を撤去。perf とスマホでは既に畳んでいて、
split 幅（768〜1100）でだけ出ていた。ブランドはアプリのヘッダに既にある＝窓に要らない。
行ごと消したので CSS も4規則を削除（残すと未使用CSSで関門に出る）。窓の高さは split 幅で 23px 縮む。

## 112. 既定プロジェクトを差し替え（v0.3.100）
`default.mics` を 2026-09-06 のセッション書き出し（`mics0092609061616.mics`）に差し替え。
BPM 87.5 / SWG 63%、16パッド全部に音声（PHRASE 1-4、TAKE 1-4、Bill Withe 1-4、claps、RIM/TOM/SINBASS）、
打ち込み47ステップ。4.86MB（前は4.31MB）。起動→全パッド揃うまで実測 1.3s。
`fetch("default.mics?v="+APP_VERSION)` なので版を上げれば古いキャッシュを引かない。
**自動保存がある端末では自動保存が優先される**＝新しい既定を見るにはメニューの RESET。

## 113. 表記・情報の重複を全部排除（v0.3.101）
qa ワーカーの重複検査（3レイアウト × PADS/SEQ × 停止/再生 × 窓5ページ）で出た **同時可視9件・開いた時6件・曖昧ラベル8件・副次2件** を、
プロデューサー判断「全部排除」で処理。

### 同時に見えていたもの
| 情報 | 前 | 後 |
|---|---|---|
| 選択トラック名 | 窓TRK＋strip＋パッド枠（PC splitで3か所） | 窓TRKは **perf でだけ**（stripが無い時）。他は strip＋パッド枠 |
| メッセージ本文 | トースト＋窓の1行に毎回両方 | **窓に収まる時はトーストを出さない**。窓が無いSEQ画面と、窓で切れる長文だけトースト |
| 再生状態「■ STOP / ▶ PLAY / ● REC」 | 窓の文字＋▶ボタン＋RECボタン | 窓の文字を撤去。▶ボタン・RECボタン・窓の色変化（`.playing`）で足りる |
| 窓の PAT/BAR | 再生中も**編集位置**（2小節目が鳴っていても BAR 1、予約しただけで PAT B） | 再生中は**鳴っている場所**、停止中は編集位置（§0-3「嘘をつかない」） |
| P-LOCK名＝窓の欄名 | 同じ綴りが縦150pxに2回、役割名なし | P-LOCK行に縦書きの「P-LOCK」見出し |

### 開いた時に重複していたもの
- メニューの **Tempo スライダー／Swing セレクト**：窓と入口が2つ（§2違反）→ 見せない（`applyBpm` と窓SWG欄が書く唯一の経路として要素は残す）。メニューには TAP だけ
- メニューの MIDI IN モニタ → 撤去（窓 ASSIGN の着信ランプに一本化。ランプに「IN」見出し）
- TRIM/CHOP モーダルの見出しからトラック名を外す（背後に3つある）。開いている間は窓の ✂ ボタンを隠す
- 「Master」見出し＋「Master」ノブ → ノブは「Volume」

### 語彙・記号
PATTERN→PAT／Pads·Seq→PADS·SEQ／常に非表示だった `PAD`·`SEQ` 見出しを削除／◀▶（トラック送り）→ ‹ ›（▶は再生だけ）／
試聴「▶ PLAY」→「PREVIEW」／「● REC」→「REC」、「● SMPL」は色で区別／SEQ の常時ヒント削除（§8）／
SWG の単位を `<u>%</u>` に分離（他の欄と同じ作法）／`#trackName`（display:none の三重管理）を削除

### 副次：到達不能だった GRID を撤去
`recMode="real"` 固定で `body.step-on` に入る経路が無く、`#gridCtrls`（PAT/BAR＋P-LOCK行）は**一度も表示されない**死にUIだった
（v0.3.96で「復元」した `gPatSeg` のリスナも、この表示されないボタンのもの）。
HTML・`setStepMode`/`paintStepPads`/`clearStepPadClasses`・`stepMode`/`stepDrag`/`recMode`・step-on の CSS 47規則を撤去。
perf の P-LOCK ボタンは隠しボタンへの `click()` 代理をやめ `setActiveLock()` を直接呼ぶ。
**宿題**：PC split とスマホには P-LOCK の選択子が1つも無い（撤去前から）。

削除は全部 exact-string で1件ずつ。`lost-listeners` の結果（row [click] / 3関数 / 5参照）は `tools/removals-ok.txt` に理由つきで記録。
