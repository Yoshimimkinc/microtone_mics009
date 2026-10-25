// @module ui/performance-view
// @provides FX_OFF, _fxPadGesture, _fxTapL, _fxTapT, _fxmLog, _fxmUndo, fxBtnTap, fxClearPad, fxIsSet,
//    fxModalClose, fxModalOpen, fxPadSet, fxResetAll, fxmPaint, fxmParam, paintFxDots, perfFillPad,
//    perfLockApply, perfPadDown, perfPadEnd, perfPadMove, plockFillsOn, renderPerfFills
// @uses PADS, PERF_BASE, PLOCKS, activeLock, arm, armMode, editPat, padsEl, paintPerf, pushUndo, sampNameEl,
//    scheduleAutosave, setActiveLock, syncEditor, tracks
// @depends -
// ---------- Performance：P-LOCK 選択中のパッド操作（ライブ・モジュレート） ----------
// 30-ui-pads.js のパッド生成ループに埋まっていた処理を関数に切り出した（v0.3.130 Phase 2）。呼び出し順・中身は同じ。
// 表示側（perfFillPad／renderPerfFills／perfLockApply）も 61-layout.js からここへ寄せた（v0.3.131 Phase 2 第2段）
// パッドを押した：P-LOCK 選択中だけ受け持つ（true を返したらパッド側はそこで終わる）
// Live pad parameter editing only. Never writes step locks or records automation.
let _fxPadGesture=null;
function perfPadDown(e,i,d){
  if(!FX_OFF[activeLock]||armMode)return false;
  e.preventDefault();const t=tracks[i],param=activeLock;
  _fxPadGesture={pad:i,id:e.pointerId,track:t,epoch:t._contentEpoch||0,param,x:e.clientX,y:e.clientY,axis:null,orig:param==='filter'?t.cutoff:t[PERF_BASE[param]],changed:false};
  try{d.setPointerCapture(e.pointerId);}catch(_){}
  return true;
}
function perfPadMove(e,i){
  const g=_fxPadGesture;if(!g||g.pad!==i||g.id!==e.pointerId)return;
  if(tracks[i]!==g.track||(g.track._contentEpoch||0)!==g.epoch){_fxPadGesture=null;return;}
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!g.axis){if(Math.max(Math.abs(dx),Math.abs(dy))<6)return;g.axis=Math.abs(dx)>=Math.abs(dy)?'x':'y';}
  e.preventDefault();const delta=g.axis==='x'?dx:-dy,spec=PLOCKS[g.param],t=g.track,prop=PERF_BASE[g.param];
  let value=spec.log?Math.exp(Math.log(Math.max(spec.min,g.orig))+(delta/200)*(Math.log(spec.max)-Math.log(spec.min))):g.orig+(delta/200)*(spec.max-spec.min);
  value=Math.max(spec.min,Math.min(spec.max,value));
  if(value===t[prop]&&!(g.param==='filter'&&t.filter==='off'))return;
  if(!g.changed){pushUndo();g.changed=true;}
  if(g.param==='filter'&&t.filter==='off')t.filter='lp';t[prop]=value;perfFillPad(i,g.param);
}
function perfPadEnd(e,i){
  const g=_fxPadGesture;if(!g||g.pad!==i||g.id!==e.pointerId)return;_fxPadGesture=null;
  if(g.changed)scheduleAutosave();
  if(typeof syncEditor==='function')syncEditor();if(typeof paintPerf==='function')paintPerf();paintFxDots();
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
  return !!FX_OFF[activeLock]&&!armMode; // Live pad values, never step locks
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
// 押す＝パッドを左右／上下に動かして現在値を調整。再押下＝選択解除（値は保持）。
// 設定ありはボタンにポッチ。EDIT中だけ詳細設定。全リセットは詳細設定のRESETから。
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
// Normal tap selects live pad values; EDIT+tap opens parameter settings. No step recording.
let _fxTapT=-1e9, _fxTapL=null;
function fxBtnTap(effect){
  if(effect==="mute"){setActiveLock(null);perfLockApply();arm("mute",armMode!=="mute");return;}
  if(!FX_OFF[effect]) return;
  if(armMode==='edit'){setActiveLock(null);perfLockApply();fxModalOpen(effect);return;}
  if(armMode)arm(armMode,false);
  setActiveLock(effect);perfLockApply();
  sampNameEl.textContent=activeLock?effect.toUpperCase()+' · PADを左右／上下に動かして調整':effect.toUpperCase()+' · 選択解除（設定値は保持）';
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
