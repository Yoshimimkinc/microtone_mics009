// @module app/state
// @provides activeLock, armMode, assignTarget, bpmVal, copyArm, displayBar, displayPat, editBar, editDrag,
//    editPat, melodicMode, peOpenedAt, peTarget, peV0, peV1, perfDrag, perfLast, perfRecArm, perfSnap,
//    perfTapT, playBar, playPat, playStep, playing, queuedPat, recording, selected, stepIdx, swingPct
// @uses -
// @depends -
// ---------- アプリ状態（UI・再生・編集・演奏）。散らばっていた最上位の let をここに集めた（v0.3.133 Phase 3） ----------
// 規則（docs/maintainability-modularization-plan.md Phase 3）：
//   ・状態を書くのは各行の @writers に挙げたモジュールだけ（入口関数）。他から書くと module-check が止める
//   ・paint* 関数は状態を書かない。書いたら必要な再描画を入口関数が呼ぶ
//   ・「保存」欄：.mics と undo に入る状態（復元は plock-undo の restoreState と share-export の applyProject が直接書く）
//   ・tracks / PADS は音源と保存形式に密なので 00-boot / engine-fx に残す（計画書：最後に扱う）
// 変数の中身は動かしていない。宣言の場所を 13-engine-fx / 20-plock-undo / ui/pads-view / audio/transport から移しただけ

// --- 選択・モード（一時） ---
let selected = 0;       // 選択中パッド                                  @writers ui/pads-view
let armMode = null;     // null | "mute" | "solo" | "chop" | "edit" | "select"（chop＝COPY統合：複製/スライス、select＝選択のみ発音なし）  @writers ui-copy
let copyArm = null;     // COPY中の元 {type:"pad"|"pat"|"bar"|"note", idx}（汎用コピー）  @writers ui-copy
let melodicMode=false;  // 選択中パッドが音階モードか（SEQ盤面の表示を切替）  @writers plock-undo
let editDrag = null;    // EDIT中のパッド間ドラッグ並べ替え状態（移動/コピー）  @writers ui/pads-view
let assignTarget=-1;    // ASSIGN待機中のパッド（MIDI/PCキー共通）  @writers ui-window, midi, chop

// --- 再生（一時。bpm / swing は保存） ---
let playing = false;    // 再生中か  @writers ui/transport-view
let recording = false;  // ● REC（演奏をステップへ記録）  @writers ui/transport-view
let stepIdx = 0;        // スケジューラが次に予約するステップ  @writers audio/transport, ui/transport-view
let playStep = 0;       // 表示中のステップ（カーソル）  @writers ui/transport-view
let playPat = 0;        // 再生中パターン（スケジューラ用）  @writers audio/transport, ui/transport-view
let playBar = 0;        // 再生中の小節（スケジューラ用）  @writers audio/transport, ui/transport-view
let queuedPat = null;   // 予約中パターン（次の小節アタマで切替）  @writers pattern-master, audio/transport, ui/transport-view, share-export
let displayPat = 0;     // 表示中の再生パターン（drawLoop用）  @writers ui/transport-view
let displayBar = 0;     // 表示中の再生小節（drawLoop用）  @writers ui/transport-view
let bpmVal = 100;       // テンポ（保存）。書く入口は applyBpm（chop）  @writers chop, plock-undo, share-export
let swingPct = 50;      // スウィング（保存）。SP流 離散値: 50/54/58/63/67/71  @writers chop, plock-undo, share-export

// --- 編集（editPat / editBar は保存） ---
let editPat = 0;        // 編集中パターン 0-3 (A-D)。入口は setEditPat（pattern-master）  @writers pattern-master, plock-undo, share-export
let editBar = 0;        // 編集中の小節 0-3 (1-4)。入口は setEditBar（pattern-master）  @writers pattern-master, plock-undo, share-export
let peTarget=0;         // 波形エディタの対象パッド（窓とモーダルで共有する1実体）  @writers ui-window, edit-modal
let peOpenedAt=0;       // モーダルを開いた時刻。直後450msのクリックは「開いたタップの残り」なので無視する  @writers edit-modal
let peV0=0, peV1=1;     // 波形の表示窓（0..1正規化）。ホイール/ピンチでズーム、ダブルタップで全体へ  @writers ui-window, edit-modal

// --- P-LOCK・演奏（一時） ---
let activeLock = null;  // 選択中のp-lockパラメータ（null=ON/OFFトグル）。入口は setActiveLock（step-strip）  @writers step-strip
let perfDrag = null;    // Performance中のパッドドラッグ＝ライブ・モジュレート  @writers ui/performance-view
let perfRecArm = false; // Performance: REC ON=再生中いじりをステップへ記録（解放しても基本値を保持）/ OFF=解放で掛ける前へ戻る  @writers layout
let perfSnap = null;    // P-LOCK選択時に取った16パッドの「掛ける前の値」（解放でここへ戻る＝効果オフ／ダブルタップの基準）  @writers ui/performance-view, layout
let perfLast = {};      // P-LOCKごとの「最後にいじった16パッドの値」（もう一度押すと復活する記憶 v0.3.121）  @writers -
let perfTapT = [];      // 各パッドの直近タップ時刻（演奏P-LOCKのダブルタップ検出）  @writers -
