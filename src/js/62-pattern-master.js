// @module pattern-master
// @provides _barTapB, _barTapT, barSeg, barTapHold, chainLatencyMs, clearBarHold, clearBarIndicator,
//    clearPatIndicator, compToggle, editBars, firstPlayBar, heldBars, kickVu, masterVuEl, masterVuLevel,
//    nextPlayBar, paintLatency, paintMixer, paintPatBar, patSeg, refreshStepWaves, setEditBar, setEditPat,
//    toggleBarHold, updateBarIndicator, updatePatIndicator, vuHit, vuLoop, vuRaf
// @uses AC, PADS, applyWaveSEQ, applyWaveStrip, barHasContent, barHold, compDrive, compMakeup, compNode,
//    compOn, compThr, compThreshold, copyTap, dbToGain, displayPat, editBar, editPat, finalClip, isMelodic,
//    makeSatCurve, makeupGain, masterGain, paintPadStates, paintPerf, paintSteps, patHasContent, patLength,
//    patLoad, playing, pushUndo, queuedPat, sampNameEl, saturator, selectPad, setCompBypass, tapeDelay,
//    tracks
// @depends -
// ---------- pattern selector / chain ----------
const patSeg=document.getElementById("patSeg");
const barSeg=document.getElementById("barSeg");

// 音階モード：← DRUMS で復帰（SCALEの選択は情報窓のMAINページ）
document.getElementById("meloExit").addEventListener("click",()=>{
  let d=0; for(let i=0;i<PADS.length;i++){ if(!isMelodic(i)){ d=i; break; } }  // 最初の非音階パッドへ
  selectPad(d);
});

// パターン/小節選択：SEQとGRIDで共有
function refreshStepWaves(){ if(typeof applyWaveSEQ==="function") applyWaveSEQ(); if(typeof applyWaveStrip==="function") applyWaveStrip(); }  // パターン/小節切替で発音セルの波形を更新
function setEditPat(p){
  editPat=p;
  if(playing) queuedPat = (p===displayPat) ? null : p;  // 今のを再タップ＝予約キャンセル
  else { patLoad(p); paintPadStates(); if(typeof paintPerf==="function") paintPerf(); }   // 止まっていればミュート / エフェクトも p のものに（鳴っていれば切り替わる小節頭で。v0.3.149 / v0.3.150）
  paintSteps(); paintPatBar(); refreshStepWaves();
}
function setEditBar(b){ editBar=b; paintSteps(); paintPatBar(); refreshStepWaves(); }
// ---------- BAR のホールド（v0.3.161 §155）：「BAR はシングル＝従来どおり選択、ダブルクリック＝ホールドして繰り返す、
// 複数ホールドされてると選択したとこだけ順番に繰り返す」。ホールドは鳴っているパターンに効く。切替は小節の終わりで（audio/transport が nextPlayBar を聞く）
function heldBars(){ return [0,1,2,3].filter(b=>barHold[b]); }
// 打ち込みの書き先（v0.3.166 §159）：「HOLD した小節では、グリッドに音を置いたら同じ個所すべてに反映。Excel で選択したシートすべてに入るのと同じ」。
// 編集中の小節がホールドされていれば、ホールドした小節すべて。そうでなければ編集中の小節だけ
function editBars(){ return barHold[editBar] ? heldBars() : [editBar]; }
function toggleBarHold(b){ const h=barHold.slice(); h[b]=!h[b]; barHold=h; }
function clearBarHold(){ if(barHold.some(Boolean)) barHold=[false,false,false,false]; }
function firstPlayBar(){ const h=heldBars(); return h.length ? h[0] : 0; }
function nextPlayBar(p, cur){
  const h=heldBars();
  if(h.length){ const n=h.find(b=>b>cur); return n!=null ? n : h[0]; }
  return (cur+1>=patLength(p)) ? 0 : cur+1;
}
// 同じ BAR を 350ms 以内にもう一度＝ダブルタップ（iOS は dblclick が当てにならないので自前で）。1 回目の選択はそのまま効く
let _barTapT=-1e9, _barTapB=-1;
function barTapHold(b){
  const now=performance.now();
  if(b===_barTapB && now-_barTapT<350){ _barTapT=-1e9; _barTapB=-1; toggleBarHold(b);
    const h=heldBars();
    sampNameEl.textContent = h.length ? "BAR HOLD ▸ "+h.map(x=>x+1).join(" → ")+"（ここだけ"+(h.length>1?"順番に":"")+"くり返す"+(h.length>1?"・打ち込みは "+h.map(x=>x+1).join("・")+" に同時に入る":"")+"）" : "BAR HOLD 解除（全部の小節を順に）";
    paintPatBar(); return true; }
  _barTapB=b; _barTapT=now; return false;
}
// SEQ/GRIDのパターンA-D・小節1-4を押して選ぶ（COPY中は元→先でコピー）
[[patSeg,"p",setEditPat,"pat"],[barSeg,"b",setEditBar,"bar"]].forEach(([seg,k,fn,ct])=>{
  if(!seg) return;
  seg.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    if(copyTap(ct,+b.dataset[k])) return; fn(+b.dataset[k]);
    if(ct==="bar") barTapHold(+b.dataset[k]); });   // BAR のダブルタップ＝ホールド（v0.3.161）
});
function updatePatIndicator(p){
  [patSeg].forEach(seg=>[...seg.children].forEach((b,j)=>{ b.classList.toggle("playing", j===p); if(j===p) b.classList.remove("queued"); }));
  document.querySelectorAll("#perfPats .perf-pat").forEach(b=>{ const on=+b.dataset.p===p; b.classList.toggle("playing",on); if(on) b.classList.remove("queued"); });
}
function clearPatIndicator(){ [patSeg].forEach(seg=>[...seg.children].forEach(b=>b.classList.remove("playing","queued"))); document.querySelectorAll("#perfPats .perf-pat").forEach(b=>b.classList.remove("playing","queued")); }
function updateBarIndicator(bar){ [barSeg].forEach(seg=>[...seg.children].forEach((b,j)=>b.classList.toggle("playing", j===bar))); document.querySelectorAll("#perfPats .perf-bar").forEach(b=>b.classList.toggle("playing",+b.dataset.b===bar)); }
function clearBarIndicator(){ [barSeg].forEach(seg=>[...seg.children].forEach(b=>b.classList.remove("playing"))); document.querySelectorAll("#perfPats .perf-bar").forEach(b=>b.classList.remove("playing")); }
// 編集状態・中身ドット・予約点滅・ループ外小節をまとめて反映
function paintPatBar(){
  [patSeg].forEach(seg=>[...seg.children].forEach((b,j)=>{
    b.classList.toggle("on", j===editPat);
    b.classList.toggle("has", patHasContent(j));
    b.classList.toggle("queued", playing && queuedPat===j);
  }));
  [barSeg].forEach(seg=>[...seg.children].forEach((b,j)=>{
    b.classList.toggle("on", j===editBar);
    b.classList.toggle("has", barHasContent(editPat,j));
    b.classList.toggle("dim", j>=patLength(editPat) && !barHasContent(editPat,j));
    b.classList.toggle("hold", !!barHold[j]);
  }));
  document.querySelectorAll("#perfPats .perf-bar").forEach(b=>b.classList.toggle("hold", !!barHold[+b.dataset.b]));
  const anyHold=barHold.some(Boolean);   // ホールドがある間は、ホールドしていない小節を薄く（v0.3.164）
  if(barSeg) barSeg.classList.toggle("has-hold", anyHold);
  const pp=document.getElementById("perfPats"); if(pp) pp.classList.toggle("has-hold", anyHold);
}

// ---------- Master（メニュー内）----------
// Group/FXのメニューUIは廃止（音量・FX値は .mics から applyGroupVol/applyFx で読込・適用され続ける）。
// per-pad音量はEDIT/P-LOCK、M/SはPADSのMUTE/SOLOへ集約（DRY＝状態の単一管理）。
let masterVuLevel=0;

// --- VUトリガー：発音時にマスターVUレベルを設定 ---
// メニューの Latency 表示：内部（音声経路の固定遅延）＋出力（OS/機器）。Bluetooth等の大きな出力遅延はここで分かる（v0.3.110）
function chainLatencyMs(){
  const q=128/AC.sampleRate;                                   // レンダ量子（発音予約→開始の最大待ち）
  const cmp=compNode?0:0.006;                                  // 標準コンプの先読み（worklet版はゼロ）
  const os=(saturator.oversample==="none"?0:54)+(finalClip.oversample==="none"?0:64);   // WaveShaper 2x の再標本化遅延（実測 frames）
  return (q + tapeDelay.delayTime.value + cmp + os/AC.sampleRate)*1000;
}
function paintLatency(){
  const el=document.getElementById("vLat"); if(!el) return;
  const out=(AC.outputLatency||0)*1000, inn=chainLatencyMs();
  el.textContent=Math.round(inn)+" ms 内部 / "+Math.round(out)+" ms 出力"+(out>60?"（Bluetooth?）":"");
}
function vuHit(padIdx, accent){
  const g=dbToGain(tracks[padIdx].vol + (accent?5:0));
  masterVuLevel=Math.min(1, masterVuLevel + g*0.4);
  if(typeof kickVu==="function") kickVu();   // 発音時にVUループを起こす（アイドル時は止まっている）
}

// --- VUアニメーションループ（アイドル時は自動停止＝メインスレッドを永久に起こさない） ---
const masterVuEl=document.getElementById("masterVu");
let vuRaf=null;
function vuLoop(){
  // マスターVU（メニュー内）。chフェーダーVUは撤去。
  const mw=Math.round(masterVuLevel*100);
  if(masterVuEl){ masterVuEl.style.width=mw+"%"; masterVuEl.classList.toggle("peak",masterVuLevel>0.85); }
  masterVuLevel*=0.92;
  // 再生中、またはまだレベルが残っている間だけ回す。無音アイドルでは停止
  if(playing || masterVuLevel>0.002){ vuRaf=requestAnimationFrame(vuLoop); }
  else { vuRaf=null; if(masterVuEl){ masterVuEl.style.width="0%"; masterVuEl.classList.remove("peak"); } }
}
function kickVu(){ if(vuRaf==null) vuRaf=requestAnimationFrame(vuLoop); }

// 旧ミキサーUI（16ch→グループ/FXパッド）は撤去。互換のため paintMixer は no-op で残す（呼び出し元はそのまま動く）。
function paintMixer(){}

// マスターボリューム
document.getElementById("kMaster").addEventListener("pointerdown",()=>pushUndo());
document.getElementById("kMaster").addEventListener("input",function(){
  masterGain.gain.value=Math.pow(10,this.value/20);
  document.getElementById("vMaster").textContent=this.value+" dB";
});

// コンプ/ドライブ（MIX画面に移動）
const compToggle=document.getElementById("compToggle");
compToggle.addEventListener("click",()=>{
  pushUndo();
  const on=!compOn;
  compToggle.classList.toggle("on",on);
  setCompBypass(on);
});
document.getElementById("kComp").addEventListener("pointerdown",()=>pushUndo());
document.getElementById("kComp").addEventListener("input",function(){
  compThreshold=+this.value;
  document.getElementById("vComp").textContent=this.value;
  if(compOn) compThr().value=compThreshold;
  compMakeup = 1 + Math.abs(compThreshold)/30*0.8;
  if(compOn) makeupGain.gain.value=compMakeup;
});
document.getElementById("kDrive").addEventListener("pointerdown",()=>pushUndo());
document.getElementById("kDrive").addEventListener("input",function(){
  compDrive=+this.value/10;
  document.getElementById("vDrive").textContent=compDrive.toFixed(1);
  saturator.curve=makeSatCurve(compDrive);
});

