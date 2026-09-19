// @module engine-fx
// @provides LOFI, PERF_BASE, _ledT, applyFx, delaySend, echoFb, echoFbHP, echoFbLP, echoLfo, echoLfoDepth,
//    echoSat, echoWet, fxDelayAmt, fxDelayOn, fxReverbAmt, fxReverbOn, getPattern, getPlayPattern,
//    perfResetPad, reverb, reverbLP, reverbPre, reverbSend, reverbWet, setDelayTempo, tapeEcho, tracks
// @uses AC, PADS, PLOCKS, STEPS, bpmVal, editBar, editPat, finalClip, perfFillPad, perfSnap, playBar,
//    playPat, pushUndo, syncEditor, tapeDelay
// @depends boot, engine-core, engine-master
// ===== センドFX：RE-101風テープディレイ ＋ ホールリバーブ（マスター最終段からパラレル送り）=====
// --- テープディレイ（RE-101風：リピートが徐々に暗くもこもこ＋テープ飽和＋僅かな揺れ） ---
const delaySend = AC.createGain(); delaySend.gain.value = 0;     // FX量(0..1)
const tapeEcho  = AC.createDelay(2.0); tapeEcho.delayTime.value = 0.4;  // 後でテンポ追従
const echoFbLP  = AC.createBiquadFilter(); echoFbLP.type="lowpass";  echoFbLP.frequency.value=2600; echoFbLP.Q.value=0.2; // リピートで高域減衰=もこもこ
const echoFbHP  = AC.createBiquadFilter(); echoFbHP.type="highpass"; echoFbHP.frequency.value=180;  // テープらしく低域も少し削る
const echoSat   = AC.createWaveShaper(); echoSat.oversample="2x";  // テープ飽和
// 原点の傾き=1（利得を持たない）ソフト飽和。makeSatCurveは正規化(/tanh)で原点傾き>1のため
// フィードバックループに入れるとループ利得>1で自己発振する → 専用カーブで防止
(function(){ const n=1024,c=new Float32Array(n),k=2.2; for(let i=0;i<n;i++){ const x=i*2/n-1; c[i]=Math.tanh(x*k)/k; } echoSat.curve=c; })();
const echoFb    = AC.createGain(); echoFb.gain.value=0.4;        // リピート量（フィードバック）<1で安定
const echoWet   = AC.createGain(); echoWet.gain.value=0.9;
const echoLfo   = AC.createOscillator(); echoLfo.type="sine"; echoLfo.frequency.value=0.6;  // テープのワウ
const echoLfoDepth = AC.createGain(); echoLfoDepth.gain.value=0.0018;
echoLfo.connect(echoLfoDepth); echoLfoDepth.connect(tapeEcho.delayTime); echoLfo.start();
delaySend.connect(tapeEcho);
tapeEcho.connect(echoFbLP); echoFbLP.connect(echoFbHP); echoFbHP.connect(echoSat); echoSat.connect(echoFb); echoFb.connect(tapeEcho); // フィードバックループ(Delay内包で合法)
tapeEcho.connect(echoWet); echoWet.connect(finalClip);   // 最終段クリッパ経由
// テンポ追従（4分3連 = (60/bpm)*2/3）
function setDelayTempo(){
  const beat=60/((typeof bpmVal!=="undefined")?bpmVal:100);
  const t=Math.max(0.05, Math.min(1.9, beat*2/3));
  try{ tapeEcho.delayTime.setTargetAtTime(t, AC.currentTime, 0.06); }catch(e){ tapeEcho.delayTime.value=t; }
}

// --- ホールリバーブ（合成IRのConvolver） ---
const reverbSend = AC.createGain(); reverbSend.gain.value = 0;
const reverb = AC.createConvolver();
(function(){
  // モノ＆短め(1.5s)のIR：コンボルバは常時稼働するためCPU負荷を大きく削減（音色はほぼ同等）
  const dur=1.5, rate=AC.sampleRate, len=Math.floor(dur*rate);
  const ir=AC.createBuffer(1,len,rate);
  const d=ir.getChannelData(0);
  for(let i=0;i<len;i++){ const t=i/len; d[i]=(Math.random()*2-1)*Math.pow(1-t,2.2); }  // 指数減衰ノイズ=ホール
  reverb.buffer=ir;
})();
const reverbPre = AC.createDelay(0.1); reverbPre.delayTime.value=0.02;   // プリディレイ
const reverbLP  = AC.createBiquadFilter(); reverbLP.type="lowpass"; reverbLP.frequency.value=6500; // 空気感
const reverbWet = AC.createGain(); reverbWet.gain.value=0.9;
reverbSend.connect(reverbPre); reverbPre.connect(reverb); reverb.connect(reverbLP); reverbLP.connect(reverbWet); reverbWet.connect(finalClip);   // 最終段クリッパ経由

// マスター最終段(tapeDelay)からFXへ送る
tapeDelay.connect(delaySend);
tapeDelay.connect(reverbSend);

// FX量(0..1)とON/OFF
let fxDelayAmt=0, fxReverbAmt=0, fxDelayOn=false, fxReverbOn=false;   // FXはデフォルトOFF（ONボタンで有効化）
function applyFx(){
  delaySend.gain.value  = fxDelayOn  ? fxDelayAmt  : 0;
  reverbSend.gain.value = fxReverbOn ? fxReverbAmt : 0;
}

// --- per-pad state ---
const tracks = PADS.map((p,i)=>({
  // patterns[パターン0-3(A-D)][小節0-3(1-4)][ステップ0-15]
  patterns:Array.from({length:4},()=>Array.from({length:4},()=>new Array(STEPS).fill(0))),
  vol:-4,            // dB
  scale:"off",       // 音階モード: off / chro / maj / min / pent
  loopPlaying:false, // ループ系のトグル状態（ON/OFF交互）
  buffer:null,       // AudioBuffer (12bit-processed; preset or loaded sample)
  rawBuffer:null,    // 加工前バッファ（再12bit化や設定変更時の元）
  tune:0,            // semitones
  start:0,           // 0..1 再生開始
  end:1,             // 0..1 再生終了
  loop:false,        // ループon/off
  loopStart:0,       // 0..1 ループ戻り先
  filter:"off",      // "off" | "lp" | "hp"
  cutoff:12000,      // Hz
  reso:0.7,          // Q
  attack:0,          // ms 頭フェードイン
  fade:3,            // ms 終端フェードアウト
  delaySend:0,       // 0..1 per-padのテープディレイ送り（常時）
  reverbSend:0,      // 0..1 per-padのリバーブ送り（常時）
  choke: (p.voice==="hat"||p.voice==="ohat") ? 1 : 0,
  mute:false,
  solo:false,
  activeVoices:[],
  name:p.name,
  locks:{},           // パラメーターロック: "pat_bar_step" → {pitch,level,filter,delay,reverb}
}));

// SP風 12bit Lo-Fi 設定（全音源共通）
const LOFI = { bits:12, targetRate:26040 }; // SP-1200 ≒ 26kHz

// UI・再生・編集・演奏の状態（selected / playing / editPat / activeLock / perf* …）は app/state.js へ移した（v0.3.133）
let _ledT=null;   // ASSIGN の LED 点滅タイマ
const PERF_BASE = {pitch:"tune", filter:"cutoff", delay:"delaySend", reverb:"reverbSend"};  // 4つとも演奏のパラメータ・ページで同等に扱う（LEVEL は v0.3.124 で P-LOCK から廃止 §135）
// 演奏P-LOCK：パッドを基準値へ戻す（基準＝選択時スナップショット、無ければPLOCKS既定）
function perfResetPad(i, param){
  if(!param || !PERF_BASE[param]) return;
  const t=tracks[i], prop=PERF_BASE[param];
  const hasSnap = perfSnap && perfSnap.param===param;
  pushUndo();
  if(param==="filter"){
    t.cutoff = hasSnap ? perfSnap.vals[i] : PLOCKS.filter.def;
    if(hasSnap) t.filter = perfSnap.filt[i];
  } else {
    t[prop] = hasSnap ? perfSnap.vals[i] : PLOCKS[param].def;
  }
  perfFillPad(i, param);
  if(typeof syncEditor==="function") syncEditor();
}

// 編集中（パターン×小節）へのアクセサ
function getPattern(trackIdx){ return tracks[trackIdx].patterns[editPat][editBar]; }
// 再生中（パターン×小節）へのアクセサ
function getPlayPattern(trackIdx){ return tracks[trackIdx].patterns[playPat][playBar]; }

