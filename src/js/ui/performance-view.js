// @module ui/performance-view
// @provides FX_OFF, _fxTapL, _fxTapT, _fxmLog, _fxmUndo, fxBtnTap, fxClearPad, fxIsSet, fxModalClose,
//    fxModalOpen, fxPadSet, fxResetAll, fxmPaint, fxmParam, paintFxDots, perfFillPad, perfLockApply,
//    perfPadDown, perfPadEnd, perfPadMove, plockFillsOn, renderPerfFills
// @uses PADS, PERF_BASE, PLOCKS, activeLock, armMode, editPat, padsEl, paintPerf, perfDrag, perfRecArm,
//    perfResetPad, perfTapT, pushUndo, sampNameEl, setActiveLock, syncEditor, tracks
// @depends -
// ---------- Performance：P-LOCK 選択中のパッド操作（ライブ・モジュレート） ----------
// 30-ui-pads.js のパッド生成ループに埋まっていた処理を関数に切り出した（v0.3.130 Phase 2）。呼び出し順・中身は同じ。
// 表示側（perfFillPad／renderPerfFills／perfLockApply）も 61-layout.js からここへ寄せた（v0.3.131 Phase 2 第2段）
// パッドを押した：P-LOCK 選択中だけ受け持つ（true を返したらパッド側はそこで終わる）
function perfPadDown(e,i,d){
  // Performance：P-LOCK選択中はドラッグ＝ライブ・モジュレート。STEP(GRID)とは無関係＝最優先（記録可否は perf ● REC で決まる）
  if(!(activeLock && PERF_BASE[activeLock])) return false;   // P-LOCK選択中はドラッグ＝そのパッドの値（perf でもスマホの DELAY/REVERB でも）
  e.preventDefault();
  const now=Date.now();
  if(now-(perfTapT[i]||0) < 320){      // ダブルタップ＝そのパッドを基準値へ戻す
    perfTapT[i]=0; perfResetPad(i, activeLock); return true;
  }
  perfTapT[i]=now;
  perfDrag={pad:i, x0:e.clientX, param:activeLock, moved:false, orig:null, origFilter:null, undone:false};
  try{ d.setPointerCapture(e.pointerId); }catch(_){}
  return true;
}
// パッド上の横ドラッグ＝そのパッドの P-LOCK 値を生いじり（ステップ列と向きを統一：右で増加）
function perfPadMove(e,i){
  if(!perfDrag || perfDrag.pad!==i) return;
  const dx=e.clientX-perfDrag.x0;                       // 右で増加
  if(!perfDrag.moved && Math.abs(dx)>6){ perfDrag.moved=true; perfTapT[i]=0; }   // ドラッグはダブルタップ計測に含めない
  if(!perfDrag.moved) return;
  const t=tracks[i], spec=PLOCKS[perfDrag.param];
  const prop=PERF_BASE[perfDrag.param];
  if(perfDrag.orig===null){                             // 初回：相対ドラッグの基点＝現在値
    if(!perfDrag.undone){ pushUndo(); perfDrag.undone=true; }   // ドラッグ1回で1手。値は残るので UNDO で戻す（v0.3.168）
    perfDrag.orig = perfDrag.param==="filter"?t.cutoff : t[prop];
    if(perfDrag.param==="filter" && t.filter==="off") t.filter="lp";   // 音が出るようLPに（ダブルタップ／RESET で OFF へ）
  }
  let v;
  if(spec.log){ const lmin=Math.log(spec.min),lmax=Math.log(spec.max); let lv=Math.log(perfDrag.orig)+(dx/200)*(lmax-lmin); lv=Math.max(lmin,Math.min(lmax,lv)); v=Math.exp(lv); }
  else { v=perfDrag.orig+(dx/200)*(spec.max-spec.min); v=Math.max(spec.min,Math.min(spec.max,v)); }
  if(perfDrag.param==="pitch") t[prop]=Math.round(v);
  else t[prop]=v;                                       // filter(cutoff) / delay / reverb は連続値
  perfFillPad(i, perfDrag.param);                       // このパッドのフィルを更新（発音なし）
  const ps=document.getElementById("perfSel");          // 画面にライブ表示
  if(ps){ ps.textContent=String(i+1).padStart(2,"0")+" "+perfDrag.param.toUpperCase()+" ▸ "+spec.fmt(t[prop])+(perfRecArm?" ●REC":""); }
}
// 離した：値はそのまま残る（ボタンを解除しても残る v0.3.168）。ボタンのポッチ（設定あり）を更新
function perfPadEnd(e,i){
  if(!perfDrag || perfDrag.pad!==i) return;
  perfDrag=null;
  if(typeof syncEditor==="function") syncEditor();
  if(typeof paintPerf==="function") paintPerf();
  paintFxDots();
}

// ---------- P-LOCK の塗り（.lockfill/.lockv）と、掛ける前の値の控え／復帰（61-layout.js から移動） ----------
// P-LOCKパラメータ・ページ：選択中は16パッドを「効果量のフィル」表示（発音せず）、キー解放で元値へ復帰
function perfFillPad(i, param){
  if(!param || !PERF_BASE[param]) return;
  const el=padsEl.children[i]; if(!el) return;
  const spec=PLOCKS[param], val = param==="filter"?tracks[i].cutoff : tracks[i][PERF_BASE[param]];
  let norm = spec.log ? (Math.log(val)-Math.log(spec.min))/(Math.log(spec.max)-Math.log(spec.min)) : (val-spec.min)/(spec.max-spec.min);
  norm=Math.max(0,Math.min(1,norm));
  if(el._lockfill){ el._lockfill.style.width=(norm*100).toFixed(1)+"%"; el._lockfill.style.background="rgb("+spec.color+")"; }
  if(el._lockv) el._lockv.textContent=spec.fmt(val);
}
// P-LOCK の塗り（.lockfill/.lockv）を出す条件。PC は演奏(body.perf)のとき、スマホは msbar の DELAY/REVERB が見えているとき。
// v0.3.121 までは body.perf だけを見ていたので、スマホで送り量をドラッグしても塗りも数字も出なかった（§133）。
function plockFillsOn(){
  if(!(activeLock && PERF_BASE[activeLock])) return false;
  if(document.body.classList.contains("perf")) return true;
  const b=document.querySelector(".msbar .msbtn.fx[data-lock]");
  return !!b && getComputedStyle(b).display!=="none";
}
function renderPerfFills(){
  const param=plockFillsOn()?activeLock:null;
  for(let i=0;i<padsEl.children.length;i++){
    if(param) perfFillPad(i, param);
    else { const el=padsEl.children[i]; if(el._lockfill) el._lockfill.style.width="0%"; if(el._lockv) el._lockv.textContent=""; }
  }
  paintFxDots();
}
// エフェクトのボタン（PITCH / FILTER / DELAY / REVERB）の動き（v0.3.168 §162）：
// **押す＝パッドを左右にドラッグして掛ける／もう一度押す＝ボタンを解除するだけ（値は残る）**。
// 一度掛けたエフェクトはボタンにポッチ（設定あり）が残る。ダブルタップ＝そのエフェクトを全パッドから外す。EDIT 中に押す＝詳しい設定のモーダル。
// v0.3.121〜168 は「押した時の値を控え、解除でそこへ戻す」形だったので、解除すると消え、SET を替えて解除すると
// 前のセットの値を新しいセットへ書き込んでいた（控えはセットを知らない）。値をそのまま tracks に置くので、セット / パターンの退避にもそのまま乗る
function perfLockApply(){
  document.body.classList.toggle("perf-plock", plockFillsOn());
  renderPerfFills();
  if(typeof syncEditor==="function") syncEditor();
}
// 「設定あり」：どれか 1 つのパッドに掛かっている（掛かっていない値＝ FX_OFF と違う）。
// ポッチ・ダブルタップのリセット・EDIT のモーダルは A B C D ごとのエフェクト（FILTER / DELAY / REVERB、§146）だけ。
// PITCH はパッドの音程（EDIT の TUNE と同じ値）で、最初の音から +2 などが入っているので「設定あり」にもリセットにもしない（解除しても値は残るのは同じ）
const FX_OFF = {filter:{filter:"off", cutoff:12000}, delay:{delaySend:0}, reverb:{reverbSend:0}};
function fxPadSet(i, param){ const t=tracks[i];
  return param==="filter" ? t.filter!=="off" : (t[PERF_BASE[param]]||0)!==0; }
function fxIsSet(param){ for(let i=0;i<tracks.length;i++) if(fxPadSet(i,param)) return true; return false; }
function paintFxDots(){
  document.querySelectorAll('#perfPlk .perf-plkbtn[data-lock], .msbar .msbtn.fx[data-lock]').forEach(b=>{
    const p=b.dataset.lock; b.classList.toggle("fxset", !!FX_OFF[p] && fxIsSet(p)); });
}
// 1 パッド / 全パッドから外す（素の値へ）。UNDO で戻せる
function fxClearPad(i, param){ Object.assign(tracks[i], FX_OFF[param]); }
function fxResetAll(param){
  if(!FX_OFF[param]) return;
  pushUndo();
  for(let i=0;i<tracks.length;i++) fxClearPad(i, param);
  renderPerfFills();
  if(typeof syncEditor==="function") syncEditor();
  if(typeof paintPerf==="function") paintPerf();
  if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent=param.toUpperCase()+" をリセット（全パッド・UNDO で戻せる）";
}
// エフェクトのボタンを押した（PC の #perfPlk とスマホの .msbar から）。350ms 以内にもう一度＝ダブルタップ（iOS は dblclick が当てにならない）
let _fxTapT=-1e9, _fxTapL=null;
function fxBtnTap(lock){
  if(FX_OFF[lock] && typeof armMode!=="undefined" && armMode==="edit"){ fxModalOpen(lock); return; }
  const now=performance.now();
  if(FX_OFF[lock] && lock===_fxTapL && now-_fxTapT<350){
    _fxTapT=-1e9;
    if(activeLock===lock) setActiveLock(lock);    // 1 回目で点いた分を戻す＝ダブルタップの後は解除
    perfLockApply(); fxResetAll(lock);
    return;
  }
  _fxTapT=now; _fxTapL=lock;
  setActiveLock(lock);
  perfLockApply();
}
// ---------- EDIT → エフェクトのボタン＝詳しい設定のモーダル（v0.3.168）：パッドごとの量、FILTER は種類も、RESET ----------
let fxmParam=null, _fxmUndo=false;
const _fxmLog=(spec,u)=>Math.exp(Math.log(spec.min)+u*(Math.log(spec.max)-Math.log(spec.min)));
function fxmPaint(){
  const list=document.getElementById("fxmList"); if(!list||!fxmParam) return;
  const p=fxmParam, spec=PLOCKS[p], prop=PERF_BASE[p];
  document.getElementById("fxmTitle").textContent=p.toUpperCase();
  document.getElementById("fxmLabel").textContent = "パッドごと（パターン "+"ABCD"[editPat]+"）";
  if(!list.children.length){
    list.innerHTML=tracks.map((t,i)=>`<div class="fxm-row" data-i="${i}"><span class="fxm-n"></span>`+
      `<button class="fxm-type" data-i="${i}"></button><input type="range" data-i="${i}" aria-label="pad ${i+1}"><span class="fxm-v"></span></div>`).join("");
  }
  list.classList.toggle("filt", p==="filter");
  [...list.children].forEach((row,i)=>{ const t=tracks[i], inp=row.querySelector("input"), v=p==="filter"?t.cutoff:t[prop];
    row.querySelector(".fxm-n").textContent=String(i+1).padStart(2,"0")+" "+(t.name||PADS[i].name||"").slice(0,8).toUpperCase();
    if(spec.log){ inp.min=0; inp.max=1000; inp.step=1; inp.value=Math.round((Math.log(v)-Math.log(spec.min))/(Math.log(spec.max)-Math.log(spec.min))*1000); }
    else { inp.min=spec.min; inp.max=spec.max; inp.step=0.01; inp.value=v; }
    row.querySelector(".fxm-type").textContent=p==="filter"?t.filter.toUpperCase():"";
    row.querySelector(".fxm-v").textContent=(p==="filter"&&t.filter==="off")?"–":spec.fmt(v);
    row.classList.toggle("set", fxPadSet(i,p));
  });
}
function fxModalOpen(param){
  fxmParam=param; fxmPaint();
  const m=document.getElementById("fxModal"); if(m){ m.style.display="flex"; document.getElementById("fxmClose").focus(); }
}
function fxModalClose(){ const m=document.getElementById("fxModal"); if(m) m.style.display="none"; fxmParam=null; }
(function(){
  const m=document.getElementById("fxModal"), list=document.getElementById("fxmList"); if(!m||!list) return;
  document.getElementById("fxmClose").addEventListener("click", fxModalClose);
  m.addEventListener("click",e=>{ if(e.target===m) fxModalClose(); });   // 背景クリックで閉じる
  window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&m.style.display==="flex") fxModalClose(); });
  document.getElementById("fxmReset").addEventListener("click",()=>{ if(fxmParam){ fxResetAll(fxmParam); fxmPaint(); } });
  // スライダー＝そのパッドの量（ドラッグ1回で1手）。FILTER が OFF なら LP で掛ける
  list.addEventListener("input",e=>{ const inp=e.target.closest("input"); if(!inp||!fxmParam) return;
    if(!_fxmUndo){ pushUndo(); _fxmUndo=true; }
    const i=+inp.dataset.i, t=tracks[i], p=fxmParam, spec=PLOCKS[p];
    if(p==="filter"){ t.cutoff=_fxmLog(spec, +inp.value/1000); if(t.filter==="off") t.filter="lp"; }
    else t[PERF_BASE[p]] = +inp.value;
    fxmPaint(); renderPerfFills(); if(typeof syncEditor==="function") syncEditor();
  });
  list.addEventListener("change",()=>{ _fxmUndo=false; if(typeof paintPerf==="function") paintPerf(); });
  // FILTER の種類：OFF → LP → HP → OFF
  list.addEventListener("click",e=>{ const b=e.target.closest(".fxm-type"); if(!b||fxmParam!=="filter") return;
    const t=tracks[+b.dataset.i]; pushUndo(); t.filter={off:"lp", lp:"hp", hp:"off"}[t.filter]||"off";
    fxmPaint(); renderPerfFills(); if(typeof syncEditor==="function") syncEditor(); if(typeof paintPerf==="function") paintPerf();
  });
})();
