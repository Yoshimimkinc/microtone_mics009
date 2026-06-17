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
