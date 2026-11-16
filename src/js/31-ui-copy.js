// @module ui-copy
// @provides COPY_LABEL, arm, assignMS, bindHold, copyClear, copyName, copyPadSource, copyTap, doCopy,
//    padAtPoint, paintCopyHL, refreshAfterCopy
// @uses applyWaveSEQ, applyWaveStrip, armMode, clearLockEdit, copyArm, copyBar, copyPadSound, copyPattern,
//    copySet, editBar, editPat, getLockEdit, getPattern, hintsOn, lockKey, padsEl, paintPadStates,
//    paintPatBar, paintPerf, paintStepStrip, paintSteps, pushUndo, refreshPadDisplay, sampNameEl,
//    scheduleAutosave, selected, setMode, tracks
// @depends -
// ===== 汎用COPY：COPY中に「元→先」でパッド(音色+FX)/パターンA-D/小節1-4 をコピー。DUPの上位互換 =====
// データ更新（copyPattern / copyBar → data/patterns、copyPadSound / swapPads → data/pads）と
// 描画（refreshPadDisplay → ui/pads-view）は v0.3.131（Phase 2 第2段）で外へ出した。ここは COPY の操作と表示だけ。
const COPY_LABEL={pad:"パッド",pat:"パターン",bar:"小節",note:"ノート",set:"セット"};
function copyName(type,idx){
  if(type==="note") return String(idx.t+1).padStart(2,"0")+"·"+(idx.s+1);   // 「トラック·ステップ」
  return (type==="pad"||type==="set")?String(idx+1).padStart(2,"0"):(type==="pat"?"ABCD"[idx]:String(idx+1));
}
function doCopy(type,src,dst){
  if(type==="pad"){ copyPadSound(src,dst); refreshPadDisplay(dst); }   // データ更新（data/pads）→ 描画（ui/pads-view）
  else if(type==="pat") copyPattern(src,dst);
  else if(type==="bar") copyBar(src,dst);
  else if(type==="set") return copySet(src,dst);   // v0.3.241 §231：任意のセット → セット（data/set）
  else if(type==="note"){   // ノート＝値＋P-LOCK全パラメータを引き継ぐ（別トラックへも可）
    pushUndo();
    getPattern(dst.t)[dst.s]=getPattern(src.t)[src.s];
    const lk=getLockEdit(src.t,src.s);
    if(lk){ const tt=tracks[dst.t]; if(!tt.locks) tt.locks={}; tt.locks[lockKey(editPat,editBar,dst.s)]=JSON.parse(JSON.stringify(lk)); }
    else clearLockEdit(dst.t,dst.s);
    if(typeof paintStepStrip==="function") paintStepStrip();
  }
}
function paintCopyHL(){
  paintPadStates();
  const hit=(sel,ty,key)=>document.querySelectorAll(sel).forEach(b=>
    b.classList.toggle("copysrc", !!copyArm && copyArm.type===ty && copyArm.idx===+b.dataset[key]));
  hit("#perfPats .perf-pat, .fx-pattern","pat","p"); hit("#perfPats .perf-bar","bar","b");
  hit("#patSeg button","pat","p");
  hit("#setGrid .setpad","set","k");
  hit("#barSeg button","bar","b");
  const isNote=!!copyArm && copyArm.type==="note";
  document.querySelectorAll("#stepStrip .stepbtn").forEach((b,si)=>
    b.classList.toggle("copysrc", isNote && copyArm.idx.t===selected && copyArm.idx.s===si));
  document.querySelectorAll("#grid .row").forEach((row,ti)=>
    row.querySelectorAll(".step").forEach((c,si)=>
      c.classList.toggle("copysrc", isNote && copyArm.idx.t===ti && copyArm.idx.s===si)));
}
function refreshAfterCopy(type){ if(type==="pad") return;   // pad は doCopy が refreshPadDisplay で描画済み
  if(typeof paintSteps==="function") paintSteps(); if(typeof paintPatBar==="function") paintPatBar();
  if(typeof paintPerf==="function") paintPerf(); if(typeof applyWaveSEQ==="function") applyWaveSEQ(); if(typeof applyWaveStrip==="function") applyWaveStrip();
}
// EDIT中の要素タップ（v0.3.240 §230：COPY を EDIT に統合。armMode "chop" は無くなった）。元→先で実行。EDIT 以外なら false（通常動作へ）。
// パッドは EDIT のタップ＝編集画面なので、ここへは長押しで元を決めたあと（ui/pads-view の endEditDrag）だけ来る
function copyTap(type,idx){
  if(armMode!=="edit") return false;
  if(!copyArm){ copyArm={type,idx}; sampNameEl.textContent="COPY元 "+COPY_LABEL[type]+" "+copyName(type,idx)+" → コピー先をタップ"; }
  else if(copyArm.type===type && (type==="note" ? (copyArm.idx.t===idx.t&&copyArm.idx.s===idx.s) : copyArm.idx===idx)){ copyArm=null; sampNameEl.textContent="COPY 取消"; }
  else if(copyArm.type===type){ const s=copyArm.idx; const r=doCopy(type,s,idx);
    if(type==="set" && r!==true){ sampNameEl.textContent = r==="cur" ? "COPY：いまのセットには写せない（別のセットへ）" : "COPY できなかった"; paintCopyHL(); return true; } sampNameEl.textContent="COPY "+COPY_LABEL[type]+" "+copyName(type,s)+"→"+copyName(type,idx)+(type==="set"?"":"  ↩で戻せる"); copyArm=null; refreshAfterCopy(type); paintCopyHL(); return true; }  /* EDIT は続ける（入れ替えと同じ。抜けるのは EDIT / Esc。v0.3.240 §230） */
  else { // 種別が違うタップは「無言で元を差し替え」ない＝ノートを移すつもりでパッドを潰す事故を防ぐ
    sampNameEl.textContent="COPY元は "+COPY_LABEL[copyArm.type]+" — 同じ種類を選ぶ（やめるなら元をもう一度押す）"; }
  paintCopyHL();
  return true;
}
// EDIT のパッドの長押し（動かさず離した）＝パッドを COPY 元にする（v0.3.240 §230）。copyArm の書き手は ui-copy だけ（app/state の @writers）
function copyPadSource(i,type="pad"){ if(armMode!=="edit") return; copyArm={type,idx:i}; sampNameEl.textContent="COPY元 "+COPY_LABEL[type]+" "+String(i+1).padStart(2,"0")+" → コピー先の"+COPY_LABEL[type]+"をタップ"; paintCopyHL(); }
function copyClear(){ copyArm=null; paintCopyHL(); }
// 座標下のパッド番号（EDITドラッグのドロップ判定）。pads以外は-1。
function padAtPoint(x,y){
  const el=document.elementFromPoint(x,y);
  const pad=el&&el.closest&&el.closest(".pad");
  if(!pad || pad.parentElement!==padsEl) return -1;
  return +pad.dataset.i;
}

function assignMS(i){
  if(armMode==="mute"){ pushUndo(); tracks[i].mute=!tracks[i].mute; }
  else if(armMode==="solo"){ tracks[i].solo=!tracks[i].solo; }
  paintPadStates();
  if(typeof scheduleAutosave==="function") scheduleAutosave();   // .mics に入る状態なので自動保存にも乗せる
}
function arm(mode,on){
  armMode = on?mode:null;
  if(armMode!=="edit"){ copyArm=null; if(typeof paintCopyHL==="function") paintCopyHL(); }   // EDIT から離れたら必ず COPY 元をリセット（他モードへ切替でも）
  document.querySelectorAll('[data-lock="mute"]').forEach(b=>{ b.classList.toggle("armed",armMode==="mute"); b.classList.toggle("on",armMode==="mute"); });
  document.getElementById("holdSolo").classList.toggle("armed",armMode==="solo");
  document.getElementById("holdEdit").classList.toggle("armed",armMode==="edit");
  const _selBtn=document.getElementById("holdSelect"); if(_selBtn) _selBtn.classList.toggle("armed",armMode==="select");
  document.body.classList.toggle("edit-arm",armMode==="edit");
  document.body.classList.toggle("select-arm",armMode==="select");
  // EDITの隠れジェスチャを初回だけ案内（タップ=編集 / ドラッグ=入替 / 長押し=コピー）
  if(armMode==="edit"){ const sm=(typeof setMode!=="undefined"&&setMode);
    sampNameEl.textContent=!(typeof hintsOn!=="function"||hintsOn()) ? "EDIT"
      : sm ? "EDIT：セット タップ=ひらく（PADS）/ ドラッグ=いれかえ / 長おし=コピー"
      : "EDIT：パッド タップ=ひらく / ドラッグ=いれかえ / 長おし=コピー ・ A B C D・小節・ステップ＝元→先でコピー"; }   // 毎回表示（初回だけだと2回目のakiに無情報）
  if(armMode==="select") sampNameEl.textContent="SELECT：パッドを選ぶだけ（発音なし）";
  paintPadStates();
  if(typeof paintPerf==="function") paintPerf();   // 情報窓の解説行(clHint)をモードに追従
}
function bindHold(btnId,mode){
  const b=document.getElementById(btnId);
  // トグル式：クリックでON/OFF（マウスでも使える）。他モードONで切替
  b.addEventListener("click",e=>{
    e.preventDefault();
    arm(mode, armMode!==mode);
  });
}
// MUTEはエフェクト列の共通fxBtnTapからarmへ。二重登録しない。
bindHold("holdSolo","solo");
bindHold("holdEdit","edit");
bindHold("holdSelect","select");
// COPY（#holdCopy, armMode "chop"）は v0.3.240 §230 で EDIT に統合（再生まわりの段の EDIT＝#holdEdit）
// （トグル式のため自動解除は行わない。ESCで全モード解除）
window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&armMode) arm(armMode,false); });

// pad layout：4×4固定（8×2レイアウトは廃止＝#viewPadsに常時split／#padsはcols4既定）

