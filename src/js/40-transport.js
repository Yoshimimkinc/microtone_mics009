// ---------- transport (self-scheduling, lookahead) ----------
let bpmVal = 100;
let swingPct = 50;          // SP流 離散値: 50/54/58/63/67/71

// SP-1200: シーケンサー解像度 24PPQ。16分音符 = 6tick。
// 全ステップの時刻をマスタークロック（tick）から絶対位置で導出する。
// 加算累積方式ではなく、ステップ番号×tick時間で計算（実機と同じ分周方式）。
const PPQ = 24;
const TICKS_PER_16TH = PPQ/4; // 6
function tickDur(){ return (60/bpmVal)/PPQ; }      // 1tickの長さ（秒）
function swingDelayTicks(){
  // 分数tickのまま返す（Math.roundすると54%→0=50%と同一、63%と67%→同2tickに縮退し6段階中2つが死ぬ。
  // 元ネタMPC60は96PPQで54/58/63/67/71がほぼ整数tickに乗る＝24PPQ丸めは本来の解像度を壊していた）
  return (2*swingPct/100 - 1) * TICKS_PER_16TH;
}
function effectiveSwing(){
  return Math.round((0.5 + swingDelayTicks()/TICKS_PER_16TH/2)*1000)/10; // %
}

// SP的微細ドリフト（タイミング揺れ）
// 実機はDAC/トリガーの遅延で±0.5ms程度のジッターがあったとされる
// グルーヴ量はシャッフル(swing)に連動：強くするほどレイドバック/スタッガー/ドリフトが増す
function grooveFactor(){ return Math.min(1, Math.max(0,(swingPct-50)/21)); } // 0(50%)〜1(71%)
function driftSec(){
  const ms = 0.7 + 0.8*grooveFactor();        // ±0.7〜1.5ms
  return (Math.random()*2-1) * ms/1000;
}
function laidbackSec(){ return 0.006 + 0.016*grooveFactor(); } // 2拍4拍: 6〜22ms
function staggerSec(){  return 0.0015 + 0.003*grooveFactor(); } // 同時発音: 1.5〜4.5ms/音

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
    }
    if(++guard > STEPS) break;   // 1tickで最大1小節分まで（暴走防止）
  }
}
function drawLoop(){
  const now = AC.currentTime;
  let cur=null;
  while(drawQueue.length && drawQueue[0].time < now){
    const ev=drawQueue.shift();
    cur=ev.step;
    if(ev.hits) ev.hits.forEach(h=>{flashPad(h.pad,h.acc);if(typeof vuHit==="function")vuHit(h.pad,h.acc);});
    if(ev.pat!==undefined){ displayPat=ev.pat; displayBar=ev.bar; updatePatIndicator(ev.pat); updateBarIndicator(ev.bar); }
  }
  if(cur!==null){ playStep=cur; moveCursors(); }
  if(playing) requestAnimationFrame(drawLoop);
}

const playBtn=document.getElementById("play");
playBtn.addEventListener("click",async()=>{
  if(AC.state!=="running") await AC.resume();
  playing=!playing;
  playBtn.classList.toggle("on",playing);
  playBtn.textContent=playing?"■":"▶";   // アイコンのみ（文字なし）
  if(playing){
    stepIdx=0; playStep=0; drawQueue.length=0;
    playPat=editPat; playBar=0; queuedPat=null; displayPat=editPat; displayBar=0;
    tracks.forEach(t=>t.loopPlaying=false);   // ループのトグル状態をリセット
    barStartTime=AC.currentTime+0.05;
    schedTimer=setInterval(scheduler, INTERVAL);
    requestAnimationFrame(drawLoop);
    if(typeof kickVu==="function") kickVu();   // VUループ起動（停止中はアイドルで止まっている）
  } else {
    clearInterval(schedTimer); schedTimer=null;
    drawQueue.length=0; playStep=0; paintSteps();
    clearPatIndicator(); clearBarIndicator();   // 停止したら再生中の外枠を消す
    tracks.forEach(t=>{ stopVoices(t, AC.currentTime); t.loopPlaying=false; });   // ループ音を止めてトグル状態もリセット
  }
});
const recBtn=document.getElementById("rec");
function updateRecBtnLabel(){
  recBtn.textContent = recording ? "■" : "●"; recBtn.classList.toggle("on",recording); recBtn.classList.toggle("rec-live",recording);   // アイコンのみ
}
recBtn.addEventListener("click",()=>{
  recording=!recording; if(recording) pushUndo(); updateRecBtnLabel();
  if(recording&&!playing) sampNameEl.textContent="● 記録待機 — ▶を押すと演奏を記録";
});

