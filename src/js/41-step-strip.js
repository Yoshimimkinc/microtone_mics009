// ===== GRID（Digitakt式）ステップ入力 =====
function stepTrackName(){ const t=tracks[selected]; return String(selected+1).padStart(2,"0")+" "+((PADS[selected].type==="sample"&&t.name)?t.name:PADS[selected].name); }
function toggleStepAt(s, accent){
  pushUndo();
  const pat=getPattern(selected); const cur=pat[s]||0;
  const nv = accent ? (cur===2?0:2) : (cur?0:1);
  pat[s]=nv;
  if(nv===0) clearLockEdit(selected, s);   // OFFにしたらそのステップのp-lockも消す
  if(typeof paintSteps==="function") paintSteps(); if(typeof paintPatBar==="function") paintPatBar();
  if(typeof paintPerf==="function") paintPerf();   // A-D/小節の「中身あり」ドットを更新
  if(typeof setCellWave==="function"){              // 発音セルのみ波形：変わった1セルだけ更新（軽量）
    const _u=(trackWaveURL[selected]||"");
    if(typeof rowEls!=="undefined" && rowEls[selected]) setCellWave(rowEls[selected][s], (nv>0)?_u:"", s);
    if(typeof stepBtns!=="undefined" && stepBtns[s]) setCellWave(stepBtns[s], (nv>0)?_u:"", s);
  }
}
// ===== 常時表示の16ステップ列：選択トラックの打ち込み（1画面化 v0.3.0）=====
// パッド＝トラック選択／発音、この列＝そのトラックの現在パターン(editPat)・小節(editBar)のステップ。
// 既存の toggleStepAt / getPattern / curStepFor をそのまま流用＝状態の二重管理なし。
const stepStripEl=document.getElementById("stepStrip");
const stepBtns=[];
let stripDrag=null;
if(stepStripEl){
  for(let s=0;s<STEPS;s++){
    const b=document.createElement("button");
    b.className="stepbtn"+((s%4===0)?" beat":"");
    b.dataset.s=s; b.type="button";
    const fill=document.createElement("div"); fill.className="sfill"; b.appendChild(fill); b._fill=fill;   // P-LOCK値フィル
    const lv=document.createElement("div"); lv.className="slv"; b.appendChild(lv); b._lv=lv;               // P-LOCK値の数値
    stepStripEl.appendChild(b); stepBtns.push(b);
  }
  // P-LOCK選択中：ステップを左右ドラッグ＝そのステップだけの値(per-step automation) / タップ＝ON-OFF。未選択時：タップ＝ON-OFF。
  stepStripEl.addEventListener("pointerdown",e=>{
    const b=e.target.closest(".stepbtn"); if(!b) return;
    e.preventDefault();
    const s=+b.dataset.s;
    if(armMode==="chop"){ copyTap("note",{t:selected,s}); return; }   // COPY中＝ノート(値+P-LOCK)の元→先
    if(activeLock && PLOCKS[activeLock]){
      const spec=PLOCKS[activeLock], lk=getLockEdit(selected,s);
      const startVal=(lk&&lk[activeLock]!=null)?lk[activeLock]:spec.def;
      stripDrag={s, x0:e.clientX, moved:false, startVal, undone:false};
      try{ stepStripEl.setPointerCapture(e.pointerId); }catch(_){}
    } else {
      toggleStepAt(s, e.shiftKey);
    }
  });
  stepStripEl.addEventListener("pointermove",e=>{
    if(!stripDrag || !activeLock || !PLOCKS[activeLock]) return;
    const dx=e.clientX-stripDrag.x0;
    if(!stripDrag.moved && Math.abs(dx)>5) stripDrag.moved=true;
    if(stripDrag.moved){
      if(!stripDrag.undone){ pushUndo(); stripDrag.undone=true; }
      const spec=PLOCKS[activeLock]; let v;
      if(spec.log){ const lmin=Math.log(spec.min),lmax=Math.log(spec.max); let l=Math.log(stripDrag.startVal)+(dx/180)*(lmax-lmin); l=Math.max(lmin,Math.min(lmax,l)); v=Math.exp(l); }
      else { v=stripDrag.startVal+(dx/180)*(spec.max-spec.min); v=Math.max(spec.min,Math.min(spec.max,v)); if(activeLock==="pitch"||activeLock==="level"||activeLock==="nudge") v=Math.round(v); }
      const pat=getPattern(selected); if(!(pat[stripDrag.s]>0)) pat[stripDrag.s]=1;   // 値を入れたら自動ON
      setLockEdit(selected, stripDrag.s, activeLock, v);
      paintStepStrip();
      sampNameEl.textContent="STEP "+String(stripDrag.s+1).padStart(2,"0")+" "+activeLock.toUpperCase()+" "+spec.fmt(v)+"  · "+stepTrackName();
    }
  });
  const stripEnd=e=>{ if(!stripDrag) return; if(!stripDrag.moved) toggleStepAt(stripDrag.s, e&&e.shiftKey); stripDrag=null; };
  stepStripEl.addEventListener("pointerup",stripEnd);
  stepStripEl.addEventListener("pointercancel",()=>{ stripDrag=null; });
}
function paintStepStrip(){
  if(!stepStripEl) return;
  const pat=getPattern(selected);
  const cur=(typeof curStepFor==="function")?curStepFor():-1;
  const spec=activeLock?PLOCKS[activeLock]:null;
  for(let s=0;s<STEPS;s++){
    const v=pat[s]||0, el=stepBtns[s]; if(!el) continue;
    el.classList.toggle("on", v>0);
    el.classList.toggle("acc", v===2);
    el.classList.toggle("cur", s===cur);
    const lk=getLockEdit(selected,s);
    el.classList.toggle("haslock", !!(lk && Object.keys(lk).length) && v>0);
    const lockedActive=!!(spec && lk && lk[activeLock]!=null && v>0);
    el.classList.toggle("plk", lockedActive);
    if(el._fill && el._lv){
      if(lockedActive){
        const val=lk[activeLock];
        let norm=spec.log?(Math.log(val)-Math.log(spec.min))/(Math.log(spec.max)-Math.log(spec.min)):(val-spec.min)/(spec.max-spec.min);
        norm=Math.max(0,Math.min(1,norm));
        el._fill.style.width=(norm*100).toFixed(1)+"%"; el._fill.style.background="rgb("+spec.color+")";
        el._lv.textContent=spec.fmt(val);
      } else { el._fill.style.width="0%"; el._lv.textContent=""; }
    }
  }
  _stripCurStep=cur;   // moveCursors(再生中の差分更新)とカーソルキャッシュを同期
}
paintStepStrip();   // ボタン生成直後の初期描画（起動時の最初のpaintStepsはこの行より前に走るため）
// p-lock ツールバー（1つだけ点灯／再押しで解除）
// P-LOCK の選択（perf の #perfPlk から）。以前は隠れた #plockRow のボタンを click() で代理していた
function setActiveLock(p){
  activeLock=(activeLock===p)?null:p;
  document.querySelectorAll('#perfPlk .perf-plkbtn[data-lock], .msbar .msbtn.fx[data-lock]').forEach(x=>x.classList.toggle("on",x.dataset.lock===activeLock));
}
// スマホの DELAY / REVERB：押す→パッドを左右にドラッグでそのパッドの送り量（perfLockApply は呼ばない＝離しても戻らない、Undoで戻す）
document.querySelectorAll(".msbar .msbtn.fx").forEach(b=>b.addEventListener("click",()=>{
  setActiveLock(b.dataset.lock);
  if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent = activeLock ? (b.textContent.trim()+"：パッドを左右にドラッグ＝送り量 / もう一度で解除") : "";
  if(typeof paintPerf==="function") paintPerf();
}));
function stepShift(d){ selectPad((selected+d+PADS.length)%PADS.length); }
document.getElementById("stepPrev").addEventListener("click",()=>stepShift(-1));
document.getElementById("stepNext").addEventListener("click",()=>stepShift(1));
updateRecBtnLabel();
document.getElementById("undoBtn").addEventListener("click", doUndo);
