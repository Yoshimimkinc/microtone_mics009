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
