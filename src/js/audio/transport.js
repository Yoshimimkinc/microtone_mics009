// @module audio/transport
// @provides INTERVAL, LOOKAHEAD, PPQ, TICKS_PER_16TH, _clickBuf, barStartTime, clickHi, clickLo, drawQueue,
//    driftSec, effectiveSwing, grooveFactor, laidbackSec, metroOn, schedTimer, scheduleClick, scheduleStep,
//    scheduler, staggerSec, startTransport, stepTimeClean, stopTransport, swingDelayTicks, tickDur
// @uses AC, PADS, PERF_BASE, STEPS, anySolo, bpmVal, displayBar, displayPat, editPat, getLockPlay,
//    getPlayPattern, isMelodic, mainOut, patLength, perfDrag, perfRecArm, perfSnap, playBar, playPat,
//    playStep, playVoice, playing, pushUndo, queuedPat, queuedSet, scaleSemi, setLockPlay, stepIdx,
//    stopAllVoices, stopVoices, swingPct, switchSetNow, tracks
// @depends -
// ---------- transport：スケジューラ（音）。tick 導出の絶対時刻・スウィング・ドリフト・先読み ----------
// 40-transport.js を音（ここ）と表示・ボタン（ui/transport-view）に分けた（v0.3.132 Phase 2 第3段）。中身はそのまま
// bpmVal / swingPct は app/state.js（書く入口は applyBpm と swing の change）

// SP-1200: シーケンサー解像度 24PPQ。16分音符 = 6tick。
// 全ステップの時刻をマスタークロック（tick）から絶対位置で導出する。
// 加算累積方式ではなく、ステップ番号×tick時間で計算（実機と同じ分周方式）。
const PPQ = 24;
const TICKS_PER_16TH = PPQ/4; // 6
function tickDur(bpm=bpmVal){ return (60/bpm)/PPQ; }   // bpm：同時に鳴っている他のセットは自分の BPM で（audio/set-players）      // 1tickの長さ（秒）
function swingDelayTicks(sw=swingPct){
  // 分数tickのまま返す（Math.roundすると54%→0=50%と同一、63%と67%→同2tickに縮退し6段階中2つが死ぬ。
  // 元ネタMPC60は96PPQで54/58/63/67/71がほぼ整数tickに乗る＝24PPQ丸めは本来の解像度を壊していた）
  return (2*sw/100 - 1) * TICKS_PER_16TH;
}
function effectiveSwing(){
  return Math.round((0.5 + swingDelayTicks()/TICKS_PER_16TH/2)*1000)/10; // %
}

// SP的微細ドリフト（タイミング揺れ）
// 実機はDAC/トリガーの遅延で±0.5ms程度のジッターがあったとされる
// グルーヴ量はシャッフル(swing)に連動：強くするほどレイドバック/スタッガー/ドリフトが増す
function grooveFactor(sw=swingPct){ return Math.min(1, Math.max(0,(sw-50)/21)); } // 0(50%)〜1(71%)
function driftSec(sw=swingPct){
  const ms = 0.7 + 0.8*grooveFactor(sw);        // ±0.7〜1.5ms
  return (Math.random()*2-1) * ms/1000;
}
function laidbackSec(sw=swingPct){ return 0.006 + 0.016*grooveFactor(sw); } // 2拍4拍: 6〜22ms
function staggerSec(sw=swingPct){  return 0.0015 + 0.003*grooveFactor(sw); } // 同時発音: 1.5〜4.5ms/音

const LOOKAHEAD = 0.1;      // sec, how far ahead we schedule（25ms→100ms：メインスレッドが詰まっても発音が遅れないように）
const INTERVAL = 25;        // ms timer
let schedTimer = null;
let drawQueue = [];         // {step, time, hits}
let barStartTime = 0;       // 現在のループの開始時刻（tick導出の基準）

function scheduleStep(stepNo, when){
  const hits=[];
  let n=0;  // 同時発音のスタッガー順（若い番号＝Kick→Snare…から先に発音）
  const stg=staggerSec();
  const soloActive=anySolo();   // ループ外で一度だけ評価（毎ステップ最大16×16=256回の冗長スキャンを解消）
  for(let i=0;i<PADS.length;i++){
    const t=tracks[i];
    const aud = !t.mute && (!soloActive || t.solo);   // audible(i) と同等
    // 鳴っているループ系がミュート/ソロ外しで聞こえなくなったら確実に止める（垂れ流し防止）
    if(t.loop && t.loopPlaying && !aud){ stopVoices(t, when); t.loopPlaying=false; }
    const v=getPlayPattern(i)[stepNo];
    if(v>0 && aud){
      // 演奏ライブ記録：REC ON中、ドラッグ中のパッドのこのトリガにp-lockを焼く（GRIDと同一データ）
      if(perfRecArm && perfDrag && perfDrag.moved && perfDrag.pad===i && perfDrag.param){
        if(perfSnap && !perfSnap.recorded){ pushUndo(); perfSnap.recorded=true; }
        const pp=perfDrag.param, pv=(pp==="filter")?t.cutoff:t[PERF_BASE[pp]];
        setLockPlay(i, playPat, playBar, stepNo, pp, pv);
      }
      const lk=getLockPlay(i, playPat, playBar, stepNo);   // そのステップのp-lock
      // NUDGE p-lock：このトリガだけ前後にずらす（ms→sec）。LOOKAHEAD(100ms)内なので前ノリも予約可。過去には出さない
      const nudgeSec=(lk && typeof lk.nudge==="number") ? lk.nudge/1000 : 0;
      const wn=Math.max(when + n*stg + nudgeSec, AC.currentTime);
      if(t.loop){
        // ループ系はシーケンス上でトグル：トリガが来るたびに ON→OFF→ON…（負荷もかからない）
        if(t.loopPlaying){ stopVoices(t, when); t.loopPlaying=false; }
        else { playVoice(i, wn, false, true, isMelodic(i)?scaleSemi(t.scale, v-1):0, lk); t.loopPlaying=true; hits.push({pad:i, acc:false}); n++; }
      } else {
        if(isMelodic(i)) playVoice(i, wn, false, true, scaleSemi(t.scale, v-1), lk);
        else playVoice(i, wn, v===2, true, 0, lk);
        hits.push({pad:i, acc:isMelodic(i)?false:v===2}); n++;
      }
    }
  }
  drawQueue.push({step:stepNo, time:when, hits, pat:playPat, bar:playBar});
}

// ステップの絶対時刻をtickから導出（加算累積しない = ドリフトしない）
function stepTimeClean(stepNo){
  const baseTick = stepNo * TICKS_PER_16TH;
  const swTicks = (stepNo%2===1) ? swingDelayTicks() : 0;
  let t = barStartTime + (baseTick + swTicks) * tickDur();
  if(stepNo % 8 === 4) t += laidbackSec();   // 2拍・4拍を少し後ろへ＝バックビートのレイドバック
  return t;
}

// ===== メトロノーム：拍頭クリック（destination直結＝FX/lofi/書き出しタップに乗らない） =====
let metroOn=false, clickHi=null, clickLo=null;
function _clickBuf(f,len){ const n=Math.round(AC.sampleRate*len), b=AC.createBuffer(1,n,AC.sampleRate), d=b.getChannelData(0);
  for(let i2=0;i2<n;i2++) d[i2]=Math.sin(2*Math.PI*f*i2/AC.sampleRate)*Math.pow(1-i2/n,3)*0.5; return b; }
function scheduleClick(when, acc){
  if(!clickHi){ clickHi=_clickBuf(1568,0.05); clickLo=_clickBuf(1046,0.04); }
  const s2=AC.createBufferSource(); s2.buffer=acc?clickHi:clickLo;
  const g=AC.createGain(); g.gain.value=0.7;
  s2.connect(g); g.connect(mainOut); s2.start(Math.max(when,AC.currentTime));
}
// 再生の開始／停止（状態とスケジューラだけ。ボタンの表示・カーソル・VU は ui/transport-view が呼んだ後に描く）
// v0.3.133 までは ▶ ボタンのハンドラが状態を直接書いていた。入口をここに置き、app/state の再生系は audio/transport だけが書く（Phase 3 第2段）
function startTransport(){
  playing=true;
  stepIdx=0; playStep=0; drawQueue.length=0;
  playPat=editPat; playBar=0; queuedPat=null; displayPat=editPat; displayBar=0;
  tracks.forEach(t=>t.loopPlaying=false);   // ループのトグル状態をリセット
  // ポン出し（v0.3.146 §145）：小節頭は「いま」。最初の scheduler を timer（25ms 後）を待たずに同期で回す。
  // v0.3.145 までは +50ms の余裕＋timer 待ちで、▶ から音まで 50〜75ms あった。scheduleStep は過去を AC.currentTime に丸めるので余裕は 5ms で足りる
  barStartTime=AC.currentTime+0.005;
  schedTimer=setInterval(scheduler, INTERVAL);
  scheduler();
}
// keepVoices：SET のミックスで、いまのセットを「他のセットの再生」へ引き継ぐとき（audio/set-players の sideTakeCurrent）は音を止めない
function stopTransport(keepVoices){
  playing=false;
  clearInterval(schedTimer); schedTimer=null;
  drawQueue.length=0; playStep=0;
  if(!keepVoices) stopAllVoices(AC.currentTime);   // ループ音を止めてトグル状態もリセット（voice）
}
function scheduler(){
  // メインスレッドが詰まって大きく遅延した時は、過去ステップを一気に発音（バースト＝デススパイラル）させず、
  // バー基準を現在時刻へ引き直して取り戻す
  const behind = (AC.currentTime - stepTimeClean(stepIdx));
  if(behind > 0.12){ barStartTime += behind; }
  let guard = 0;
  while(stepTimeClean(stepIdx) < AC.currentTime + LOOKAHEAD){
    // SP的微細ドリフトはスケジュール時のみ適用
    const when = stepTimeClean(stepIdx) + driftSec();
    if(metroOn && stepIdx%4===0) scheduleClick(when, stepIdx===0);   // 拍頭（小節頭はアクセント）
    scheduleStep(stepIdx, when);
    stepIdx++;
    if(stepIdx >= STEPS){
      stepIdx = 0;
      barStartTime += STEPS * TICKS_PER_16TH * tickDur();
      // 小節アタマ：予約があれば次パターンへ切替、無ければ同パターン内の次小節（書いた分でループ）
      if(queuedPat !== null){ playPat = queuedPat; playBar = 0; queuedPat = null; }
      else { playBar++; if(playBar >= patLength(playPat)) playBar = 0; }
      // SET：予約された枠へは小節頭で差し替える（音は barStartTime で止める。dec 済みなので同期＝予約は遅れない）
      if(queuedSet !== null){ switchSetNow(queuedSet, barStartTime); playPat = 0; playBar = 0; }
    }
    if(++guard > STEPS) break;   // 1tickで最大1小節分まで（暴走防止）
  }
}
