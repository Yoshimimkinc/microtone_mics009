# Changelog

## v0.3.190 (2026-10-26)
- SCR の波形面：指を離した所が上ほど再生の立ち上がりが早い（上端 0.03 秒・まん中 約 0.085 秒・下端 0.24 秒でモーターの速さへ）。投げた時の惰性はそのまま。

## v0.3.189 (2026-10-26)
- SCR のフェーダー：つまみが一定の速さで動くように開閉（全閉→全開 0.12 秒）。上の近い所を触るとすぐ開き、下の遠い所はゆっくり大きく開く。離して閉じるのも同じ速さ。
- SCR の波形面：上ほど感度が良く、下ほど鈍い（レコードの内側と外側のように。上端はまん中の 2 倍、下端は半分）。波形の表示も同じ目盛り（上は詰まり、下は伸びる）で、指の下に付いてくる。

## v0.3.188 (2026-10-26)
- SCR のフェーダー：触った場所まで一気に開き（線の下ほど大きく）、なぞれば付いてきて、離すと全閉。音は一瞬で切り替わらず、素早く動かしたフェーダーのように約 25ms で開閉する。

## v0.3.187 (2026-10-26)
- SET のパッドは「押して離した瞬間に鳴る」に。押しながら上下スワイプで音量を動かした時は鳴らさない（止めもしない）。離した後も鳴り続け、もう一度押して離すと止まる（「押している間だけ鳴る・1 拍でホールド」は廃止）。PC キー・MIDI も同じ（キーを離す／ノートオフで鳴る、押しながら ↑↓ で音量だけ）。

## v0.3.186 (2026-10-26)
- SCR をスケッチの形に：スクラッチ面とフェーダーを縦長に 2 列（上に ⇄ と ✕ CLOSE）。
- スクラッチ面は縦：指を奥（上）へ送るとフォワード、手前（下）でバック。波形は上へ流れる（下から次の音が来る）。
- フェーダーは奥から手前（下）へスワイプで開く。触っただけでは変わらず、離しても開いたまま（実物と同じ）。奥へ戻すと閉じる。PC キー／MIDI のパッドは押している間だけ全開（従来どおり）。
- 微妙な惰性：盤に少し重さ（指より少し遅れて付いてくる）、速く送って離すと 0.35 秒ほど惰性で回ってから 1 倍へ、遅い・逆向きで離すとモーターが 0.08 秒で引き戻す。

## v0.3.185 (2026-10-26)
- SCR を djay 型に作り直し：レコード盤（円周で擦る）をやめ、横一直線の波形面に。まん中の縦線がいま鳴っている所、指で波形を左右に擦ると音が指の下の波形に付いてくる（220px＝1 秒、縦の動きは無視）。面の中ならどこを押しても掴める（枠で範囲を表示、掴むと枠がオレンジ）。
- 上に全体の波形（鳴った所・いま見えている範囲・再生位置）。タップ／なぞるとその位置へ。
- フェーダー（押している間だけ開く）は面の横に縦長で。既定は左手スクラッチ・右手フェーダー、⇄ で入れ替え（端末に覚える）。

## v0.3.184 (2026-10-25)
- SEQ は情報ウィンドウ（と FX 列の場所）を出さず、その分をグリッドに（PC 1280×800 で 1 行 約 12px → 約 26px）。A B C D・BAR と 16 ステップの段は 3 モードで同じ位置のまま。

## v0.3.183 (2026-10-25)
- PADS / SEQ / SET の並びを共通に：窓 → 主面（パッド / グリッド / セット）→ A B C D・BAR → 16 ステップ。SEQ も窓が出て、A B C D・BAR はグリッドの下（スマホも）。3 モードで窓・主面・A B C D の位置が変わらない。
- SET の窓の中の A B C D を撤去（主面の下の A B C D と重複）。

## v0.3.182 (2026-10-25)
- 場所がある画面（768px 以上：PC・iPad 横）は A B C D をスワイプの裏に隠さず、常に横長で大きく出す（PC の split は FX の下に幅いっぱいの段、演奏画面は下の段の A B C D を大きく）。スマホはスワイプのまま。
- PC の縦長ウインドウ（幅 768px 以上）でも演奏画面に統一。パッド左・操作右の画面（split）は没にした画面なので出さない。縦長でも画面いっぱいにフィット。
- 演奏画面の FX 列の MUTE が黒文字で WIRE スキン（黒地）だと見えなかったのを修正（スマホの MUTE と同じ色）。

## v0.3.181 (2026-10-25)
- FX 列の A B C D 送りボタン（v0.3.179）を撤去。スワイプで A B C D が出せるようになったので不要（下段は MUTE FILTER DELAY REVERB EDIT の 5 つに戻る）。

## v0.3.180 (2026-10-25)
- FX 列の横スワイプ（FX ⇄ A B C D）が実機で効かなかったのを修正（スワイプ開始時にボタンの lostpointercapture を取消と取り違えていた）。どちら向きでも・24px で切替、指に合わせて動く。
- スマホの画面全体の横スワイプ（PADS / SEQ / SET の切替）を廃止（FX 列のスワイプで画面ごと SEQ へ飛んでいた）。

## v0.3.179 (2026-10-25)
- スマホの FX 列に A B C D 送りボタン（押すたびに次のパターン、再生中は予約で「A▸C」）。
- SCR の音質を作り直し：手の動きのうなり（速度ゆれ 206%→0%）・速く擦った時の折り返しノイズ・掴む / 離す時のクリックを解消。ステレオ・元の音で再生。

## v0.3.178 (2026-10-25)
- SPL／KEY／SCRのPAD定義、物理モデルのエレピとピアノロール、ノート長・強弱・スケール・スナップ編集。
- エレピにトレモロ／ワウ、コーラス／フェイザー。KEYパッドはノートの縮小表示。
- FX列の左スワイプで幅いっぱいのABCD。通常FXは演奏中の値調整、EDIT＋FXは各パラメーター設定。
- SCRは大きなレコードと押している間だけ開くゲート。PCキー／MIDIノートでも操作可能。ギター入口を廃止。
- KEY→SPL→KEY時の音源取り違え修正、音声復帰、保存／共有処理の改善。


## v0.1 beta (2026-06-14)

### Core Engine
- 16-pad MPC-style sampler with AudioBufferSourceNode playback (no synth-per-hit leak)
- 12-bit quantization + 26kHz sample rate (SP-1200 Lo-Fi emulation)
- 8 built-in drum presets rendered via OfflineAudioContext at startup
- Per-pad: volume, pitch (±12st), start/end points, loop, filter (OFF/LP/HP), choke groups
- Micro-fade (3ms) on start/end points to prevent clicks
- Start point snaps to attack transient (onset detection)
- Choke groups: pads in same group cut each other (HH default group 1)

### Sequencer
- 16 steps × 16 tracks, accent support (Shift+click)
- 4 patterns (A/B/C/D) with chain playback (1-4 patterns loop)
- SP-1200 groove: 24PPQ tick-quantized timing, 6 discrete swing values, ±0.4ms drift
- Real-time recording (Rec mode)
- Clear track per pattern

### UI
- 3 modes: PADS / SEQ / MIX with hardware-style mode buttons
- PADS: Koala-style layout (waveform strip top, pads bottom)
- Pad layout: drums on bottom row (8×2 default), 4×4 for performance
- Toggle-based pad operations: MUTE / SOLO / COPY / CHOPPY / EDIT
- Waveform display with draggable start/end/loop handles
- Playhead cursor on waveform during playback
- Pads flash on sequencer hits
- Keyboard: 1-8 / Q-I for pads, Space for play/stop, arrows for focused sliders

### CHOPPY (Auto-chop)
- Detects next strong attack transient (kick/snare level, minimum 1/32 of sample length skip)
- Auto-sets choke group for all slices from same source
- Auto-sets previous slice end point to next slice start
- Chain operation: source→dest, dest becomes next source

### Sampling
- Tab Audio capture (getDisplayMedia) + Mic input (getUserMedia)
- Recording overlay with timer, audio-only stream extraction
- Captured audio auto-processed through 12-bit Lo-Fi

### Mixer (MIX)
- 16ch vertical faders matching PADS grid layout (spatial consistency)
- VU meters embedded in faders (trigger-based, decay animation)
- Per-channel M/S (Mute/Solo) toggle buttons
- Master volume, compressor (threshold + soft knee), saturation (tanh drive)
- Master VU bar

### Master Audio Chain
- Dynamics compressor (soft knee 12dB, attack 8ms, release 120ms)
- Tanh saturation with 2x oversampling
- Tape wow/flutter (0.7Hz ±0.4ms + 4.5Hz ±0.08ms)
- Tape hiss (HP 4kHz, -62dB)
- Bass harmonic enhancer (150Hz LP → asymmetric waveshaper → parallel mix)
- Comp bypass maintains tape/bass processing

### Project Save/Load
- Save as .mics file (JSON + base64 WAV)
- Audio cropped to start-1s..end+1s on save for size optimization
- Loads all settings, patterns, audio, comp/drive state
- Load accepts .mics and .json

### Responsive
- All elements scale with window width
- No horizontal overflow (scrollbar-gutter stable)
- Media queries for 600px and 400px breakpoints
- SEQ/MIX horizontally scrollable on narrow screens

### Video import (mobile)
- LOAD accepts video files; audio extracted via decodeAudioData
- iOS fallback: tap "▶ extract" to play the video and capture its audio in real time
- Target pad is locked at the moment ▶ is pressed (selecting another pad mid-extraction no longer redirects it)

## Backlog / 今後の課題
- 範囲指定取り込み（動画/音声の任意区間だけを抽出して取り込む）。
  現状は実時間再生で全長を取り込むため、長い素材は待ち時間と末尾トリムが必要。
  抽出前に「何秒〜何秒」を指定できるUIを検討する。

## v0.3.171（ローカル候補・未公開）
- パッド種類SPL／KEY／SCR、ローズ風FM音源と4小節ピアノロール・MIDIインポート。
- SCRパッドのサンプルを同一AudioContext内でスクラッチ。別タブの旧入口を撤去。
- パラメーターロックを廃止。MUTEをPITCHの代わりにFX列へ。サンプルTUNEは維持。
- 数値の上下スワイプ、整数CUTOFF、REVERB低～中送りの改善。
- アプリ復帰時の音声時計の同期処理。iPhone実機確認は別途必要。
- Dropboxのステージ共有クライアント（外部App設定・実アカウントでの検証待ち）。
