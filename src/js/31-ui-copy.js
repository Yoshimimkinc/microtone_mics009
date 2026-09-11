// ===== 汎用COPY：COPY中に「元→先」でパッド(音色+FX)/パターンA-D/小節1-4 をコピー。DUPの上位互換 =====
function copyPattern(src,dst){   // パターン src の全小節(＋p-lock)を dst へ
  if(src===dst) return; pushUndo();
  for(let i=0;i<tracks.length;i++){ const t=tracks[i];
    for(let bar=0;bar<t.patterns[src].length;bar++) t.patterns[dst][bar]=t.patterns[src][bar].slice();
    if(t.locks){ Object.keys(t.locks).forEach(k=>{ if(k.indexOf(dst+"_")===0) delete t.locks[k]; });
      Object.keys(t.locks).forEach(k=>{ if(k.indexOf(src+"_")===0) t.locks[dst+k.slice(String(src).length)]=JSON.parse(JSON.stringify(t.locks[k])); }); }
  }
}
function copyBar(src,dst){   // 現パターン(editPat)内の小節 src を dst へ（DUPの汎用版）
  if(src===dst) return; pushUndo();
  const ps=editPat+"_"+src+"_", pd=editPat+"_"+dst+"_";
  for(let i=0;i<tracks.length;i++){ const t=tracks[i];
    t.patterns[editPat][dst]=t.patterns[editPat][src].slice();
    if(t.locks){ Object.keys(t.locks).forEach(k=>{ if(k.indexOf(pd)===0) delete t.locks[k]; });
      Object.keys(t.locks).forEach(k=>{ if(k.indexOf(ps)===0) t.locks[pd+k.slice(ps.length)]=JSON.parse(JSON.stringify(t.locks[k])); }); }
  }
}
const COPY_LABEL={pad:"パッド",pat:"パターン",bar:"小節",note:"ノート"};
function copyName(type,idx){
  if(type==="note") return String(idx.t+1).padStart(2,"0")+"·"+(idx.s+1);   // 「トラック·ステップ」
  return type==="pad"?String(idx+1).padStart(2,"0"):(type==="pat"?"ABCD"[idx]:String(idx+1));
}
function doCopy(type,src,dst){
  if(type==="pad") copyPadSound(src,dst);
  else if(type==="pat") copyPattern(src,dst);
  else if(type==="bar") copyBar(src,dst);
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
  hit("#perfPats .perf-pat","pat","p"); hit("#perfPats .perf-bar","bar","b");
  hit("#patSeg button","pat","p");
  hit("#barSeg button","bar","b");
  const isNote=!!copyArm && copyArm.type==="note";
  document.querySelectorAll("#stepStrip .stepbtn").forEach((b,si)=>
    b.classList.toggle("copysrc", isNote && copyArm.idx.t===selected && copyArm.idx.s===si));
  document.querySelectorAll("#grid .row").forEach((row,ti)=>
    row.querySelectorAll(".step").forEach((c,si)=>
      c.classList.toggle("copysrc", isNote && copyArm.idx.t===ti && copyArm.idx.s===si)));
}
function refreshAfterCopy(type){ if(type==="pad") return;   // pad は copyPadSound が描画
  if(typeof paintSteps==="function") paintSteps(); if(typeof paintPatBar==="function") paintPatBar();
  if(typeof paintPerf==="function") paintPerf(); if(typeof applyWaveSEQ==="function") applyWaveSEQ(); if(typeof applyWaveStrip==="function") applyWaveStrip();
}
// COPY中の要素タップ。元→先で実行。armModeがchop以外なら false（通常動作へ）。
function copyTap(type,idx){
  if(armMode!=="chop") return false;
  if(!copyArm){ copyArm={type,idx}; sampNameEl.textContent="COPY元 "+COPY_LABEL[type]+" "+copyName(type,idx)+" → コピー先をタップ"; }
  else if(copyArm.type===type && (type==="note" ? (copyArm.idx.t===idx.t&&copyArm.idx.s===idx.s) : copyArm.idx===idx)){ copyArm=null; sampNameEl.textContent="COPY 取消"; }
  else if(copyArm.type===type){ const s=copyArm.idx; doCopy(type,s,idx); sampNameEl.textContent="COPY "+COPY_LABEL[type]+" "+copyName(type,s)+"→"+copyName(type,idx)+"  ↩で戻せる"; copyArm=null; refreshAfterCopy(type); arm("chop",false); return true; }  /* 元→先 完了でCOPYをトグル消費＝自動オフ */
  else { // 種別が違うタップは「無言で元を差し替え」ない＝ノートを移すつもりでパッドを潰す事故を防ぐ
    sampNameEl.textContent="COPY中は "+COPY_LABEL[copyArm.type]+" どうしを選ぶ — 種類を変えるならCOPYをもう一度押す"; }
  paintCopyHL();
  return true;
}
// 座標下のパッド番号（EDITドラッグのドロップ判定）。pads以外は-1。
function padAtPoint(x,y){
  const el=document.elementFromPoint(x,y);
  const pad=el&&el.closest&&el.closest(".pad");
  if(!pad || pad.parentElement!==padsEl) return -1;
  return +pad.dataset.i;
}
// パッドの音色設定をまるごと入れ替え（EDITドラッグの移動）。バッファ差替でピッチキャッシュは自動破棄。
function swapPads(a,b){
  if(a===b) return;
  pushUndo();
  const ta=tracks[a], tb=tracks[b];
  for(const k of ["buffer","rawBuffer","tune","start","end","loop","loopStart","filter","cutoff","reso","vol","choke","name","scale","attack","fade","delaySend","reverbSend","outBus","midiNote","key"]){
    const tmp=ta[k]; ta[k]=tb[k]; tb[k]=tmp;
  }
  let t=PADS[a].type;  PADS[a].type=PADS[b].type;   PADS[b].type=t;
  t=PADS[a].voice;     PADS[a].voice=PADS[b].voice;  PADS[b].voice=t;
  refreshPadDisplay(a); refreshPadDisplay(b);
}
// パッドの表示（カテゴリ色・名前・SEQ行名・波形）をトラック状態から再描画
function refreshPadDisplay(i){
  applyPadCategory(i);
  const nm=tracks[i].name||PADS[i].name||"";
  const ne=padsEl.children[i]&&padsEl.children[i].querySelector(".nm");
  if(ne) ne.textContent=nm.slice(0,8).toUpperCase();
  const rn=grid.children[i]&&grid.children[i].querySelector(".rn");
  if(rn) rn.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b> ${nm}`;
  drawPadWave(i);
  if(typeof buildTrackWave==="function"){ buildTrackWave(i); if(typeof applyWaveSEQ==="function") applyWaveSEQ(); if(typeof applyWaveStrip==="function") applyWaveStrip(); }  // 音色変更でステップ波形を再キャッシュ
}

function assignMS(i){
  if(armMode==="mute"){ tracks[i].mute=!tracks[i].mute; }
  else if(armMode==="solo"){ tracks[i].solo=!tracks[i].solo; }
  paintPadStates();
  if(typeof scheduleAutosave==="function") scheduleAutosave();   // .mics に入る状態なので自動保存にも乗せる
}
function arm(mode,on){
  armMode = on?mode:null;
  if(armMode!=="chop"){ copyArm=null; if(typeof paintCopyHL==="function") paintCopyHL(); }   // COPYから離れたら必ず元をリセット（他モードへ切替でも）
  document.getElementById("holdMute").classList.toggle("armed",armMode==="mute");
  document.getElementById("holdSolo").classList.toggle("armed",armMode==="solo");
  document.getElementById("holdEdit").classList.toggle("armed",armMode==="edit");
  const _cpBtn=document.getElementById("holdCopy"); if(_cpBtn) _cpBtn.classList.toggle("armed",armMode==="chop");
  const _selBtn=document.getElementById("holdSelect"); if(_selBtn) _selBtn.classList.toggle("armed",armMode==="select");
  document.body.classList.toggle("edit-arm",armMode==="edit");
  document.body.classList.toggle("select-arm",armMode==="select");
  // EDITの隠れジェスチャを初回だけ案内（タップ=編集 / ドラッグ=入替 / 長押し=コピー）
  if(armMode==="edit"){ sampNameEl.textContent="EDIT: タップ=ひらく / ドラッグ=いれかえ / 長おし=コピー"; }   // 毎回表示（初回だけだと2回目のakiに無情報）
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
bindHold("holdMute","mute");
bindHold("holdSolo","solo");
bindHold("holdEdit","edit");
bindHold("holdSelect","select");
bindHold("holdCopy","chop");   // COPY＝既存chop armモード（音色コピー）
// （トグル式のため自動解除は行わない。ESCで全モード解除）
window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&armMode) arm(armMode,false); });

// pad layout：4×4固定（8×2レイアウトは廃止＝#viewPadsに常時split／#padsはcols4既定）

