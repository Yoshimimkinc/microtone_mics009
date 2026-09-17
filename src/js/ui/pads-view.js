// @module ui/pads-view
// @provides _selHeavyRAF, applyPadCategory, armMode, copyArm, flashPad, padCategory, padKeyLabel, padsEl,
//    paintPadStates, selectPad, selectPadHeavy, viewPadsEl, viewSeqEl
// @uses AC, KEYMAP, PADS, applyWaveStrip, arm, assignMS, clRetargetLearn, clSyncWave, copyPadSound, copyTap,
//    editDrag, isMelodic, openPadEdit, padAtPoint, paintMixer, paintPerf, paintStepStrip, perfPadDown,
//    perfPadEnd, perfPadMove, refreshSeqMode, sampNameEl, selected, swapPads, syncEditor, tracks, trigger
// @depends boot, engine-fx
// ---------- パッド画面（PADS）：パッドの DOM・選択・状態表示・EDIT中の並べ替え ----------
// 30-ui-pads.js を責務で分割（v0.3.130 Phase 2、docs/modularization-log.md）。
//   ui/status           … sampNameEl（トースト）
//   ui/pads-view        … ここ。padsEl／パッド生成／selectPad／paintPadStates／armMode
//   ui/performance-view … P-LOCK 選択中のパッド操作（perfPadDown/Move/End）
//   ui/seq-view         … SEQ グリッド／再生カーソル（paintSteps/moveCursors）
//   data/pads           … パッドのデータ更新（copyPadSound／chopBaseName／nextChokeGroup）
// ---------- UI build ----------
const padsEl = document.getElementById("pads");
const viewPadsEl = document.getElementById("viewPads");
const viewSeqEl  = document.getElementById("viewSeq");     // 毎ステップ描画の可視判定に使う
// パッドの種別カテゴリ（色分け用）：ドラム/ベース/サンプル/空
function padCategory(i){
  const p=PADS[i];
  if(p.voice==="sinbass") return "bass";
  if(p.type==="sample") return "sample";
  if(p.type==="synth") return "drum";
  return "empty";
}
function applyPadCategory(i){
  const el=padsEl.children[i]; if(!el) return;
  el.classList.remove("pcat-drum","pcat-bass","pcat-sample","pcat-empty");
  el.classList.add("pcat-"+padCategory(i));
}
PADS.forEach((p,i)=>{
  const d=document.createElement("div");
  d.className="pad pcat-"+padCategory(i)+(i===selected?" sel":"");
  d.innerHTML=`<canvas class="pad-wave"></canvas><div class="lockfill"></div><div class="nm">${p.name}</div><div class="n">${String(i+1).padStart(2,"0")}</div><div class="k"></div><div class="stepn">${i+1}</div><div class="lockv"></div>`;
  d._lockfill=d.querySelector(".lockfill"); d._lockv=d.querySelector(".lockv");   // 毎ステップ描画でquerySelectorしないよう参照をキャッシュ
  d.dataset.i=i;
  d.setAttribute("role","button");
  d.setAttribute("aria-label", p.name+" pad");
  d.addEventListener("pointerdown",async(e)=>{
    if(armMode==="select"){ e.preventDefault(); selectPad(i); arm("select",false); return; }   // SELECT＝ワンショット：1パッド選択でトグル消費＆自動解除
    if(e.altKey){ e.preventDefault(); selectPad(i); return; }                                  // Alt+PAD＝選択のみ・発音なし（Ctrlはブラウザ衝突のためAlt）
    if(e.shiftKey){ e.preventDefault(); tracks[i].mute=!tracks[i].mute; paintPadStates(); if(typeof paintMixer==="function") paintMixer(); return; }   // Shift+PAD＝ミュート（既定）
    if(perfPadDown(e,i,d)) return;   // Performance：P-LOCK選択中はドラッグ＝ライブ・モジュレート（ui/performance-view）
    if(armMode==="edit"){                  // EDIT中：タップ=編集モーダル / ドラッグ=並べ替え（移動）/ 長押し→ドラッグ=コピー（発音なし）
      e.preventDefault();
      editDrag={pad:i, x0:e.clientX, y0:e.clientY, moved:false, copy:false, over:-1, timer:0};
      d.classList.add("dragsrc");
      try{ d.setPointerCapture(e.pointerId); }catch(_){}
      editDrag.timer=setTimeout(()=>{       // 動かさず長押し＝コピー待機（黄枠）
        if(editDrag && editDrag.pad===i && !editDrag.moved){ editDrag.copy=true; d.classList.remove("dragsrc"); d.classList.add("copyarm"); }
      }, 260);
      return;
    }
    if(armMode==="chop"){ copyTap("pad", i); return; }   // COPY：元→先でパッド(音色+FX)をコピー（発音なし）
    if(armMode){ assignMS(i); return; }   // MUTE/SOLOホールド中は割当
    if(AC.state!=="running")await AC.resume();
    // 空パッドの「＋」(中央40%)タップ＝ワンタップで音入れ（Koala流・案1）。端のタップは選択＋案内のみ
    if(PADS[i].type==="empty" && !tracks[i].buffer){
      const r=d.getBoundingClientRect();
      const dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
      const rad=Math.min(24, r.height*0.45);   // 円の見た目と同じ判定。低いパッドでも破綻しない
      if(Math.hypot(dx,dy)<=rad){ selectPad(i); flashPad(i); openPadEdit(i); return; }
    }
    trigger(i);selectPad(i,true);
  });
  // --- EDIT中のドラッグ並べ替え（移動/コピー）---
  d.addEventListener("pointermove",(e)=>{
    if(!editDrag || editDrag.pad!==i) return;
    const dx=e.clientX-editDrag.x0, dy=e.clientY-editDrag.y0;
    if(!editDrag.moved && Math.hypot(dx,dy)>(e.pointerType==="touch"?16:8)) editDrag.moved=true;   // 太い指の8pxは普通のタップ
    const tgt=padAtPoint(e.clientX,e.clientY);
    if(tgt!==editDrag.over){
      if(editDrag.over>=0 && padsEl.children[editDrag.over]) padsEl.children[editDrag.over].classList.remove("droptgt");
      editDrag.over=tgt;
      if(tgt>=0 && tgt!==i && padsEl.children[tgt]) padsEl.children[tgt].classList.add("droptgt");
    }
  });
  const endEditDrag=(e)=>{
    if(!editDrag || editDrag.pad!==i) return;
    if(editDrag.timer) clearTimeout(editDrag.timer);
    d.classList.remove("dragsrc","copyarm");
    if(editDrag.over>=0 && padsEl.children[editDrag.over]) padsEl.children[editDrag.over].classList.remove("droptgt");
    const tgt=editDrag.over, copy=editDrag.copy, moved=editDrag.moved;
    editDrag=null;
    if(!moved){                                   // 動かさず離した＝タップ：編集モーダル（従来挙動）
      selectPad(i); openPadEdit(i); arm("edit", false);
      return;
    }
    if(tgt>=0 && tgt!==i){
      if(copy){ copyPadSound(i,tgt); sampNameEl.textContent="COPY → "+String(tgt+1).padStart(2,"0")+"  ↩で戻せる"; }
      else    { swapPads(i,tgt);     sampNameEl.textContent="MOVE "+String(i+1).padStart(2,"0")+" ⇄ "+String(tgt+1).padStart(2,"0")+"  ↩で戻せる"; }
      flashPad(tgt);
    }
    // ドロップ先なし＝何もしない（EDITは維持して続けて並べ替え可）
  };
  d.addEventListener("pointerup",endEditDrag);
  d.addEventListener("pointercancel",endEditDrag);
  // --- Performance：ライブ・モジュレート（本体は ui/performance-view。ここは配線だけ） ---
  d.addEventListener("pointermove",(e)=>perfPadMove(e,i));
  d.addEventListener("pointerup",(e)=>perfPadEnd(e,i));
  d.addEventListener("pointercancel",(e)=>perfPadEnd(e,i));
  padsEl.appendChild(d);
});
function flashPad(i,accent){
  const el=padsEl.children[i];el.classList.add("hit");
  if(accent) el.classList.add("hit-acc");
  setTimeout(()=>{el.classList.remove("hit");el.classList.remove("hit-acc");},110);
}
let _selHeavyRAF=0;
function selectPadHeavy(){   // selectPad の重いUI同期（エディタ/ステップ列/波形）。演奏タップ時は rAF で集約して呼ぶ。
  const i=selected;
  refreshSeqMode();
  if(isMelodic(i) && typeof sampNameEl!=="undefined" && sampNameEl)
    sampNameEl.textContent="♪ "+PADS[i].name+"：ホーム行 A〜; ＝音階キー（"+tracks[i].scale+"）";
  if(typeof syncEditor==="function") syncEditor();
  if(typeof paintStepStrip==="function") paintStepStrip();             // 16ステップ列を選択トラックへ追従
  if(typeof applyWaveStrip==="function") applyWaveStrip();             // 下段ステップ列の波形を選択トラックへ
  if(typeof clRetargetLearn==="function") clRetargetLearn();           // ASSIGN待機中はいま選んだパッドへ的を移す
  if(typeof clSyncWave==="function") clSyncWave();                     // SAMPLEページの波形も選択パッドへ
  if(typeof paintPerf==="function") paintPerf();                       // 情報窓を選択パッドへ追従（MPC式）
}
function selectPad(i, light){
  const changed = selected!==i;
  selected=i;
  // 軽い更新（毎回）：選択ハイライト＋トラック名/音量表示
  for(let idx=0;idx<padsEl.children.length;idx++){ const el=padsEl.children[idx]; el.classList.toggle("sel",idx===i); el.setAttribute("aria-current", idx===i?"true":"false"); }
  document.getElementById("vol").value=tracks[i].vol;
  document.getElementById("volVal").textContent=tracks[i].vol;
  // 同じパッド連打は重い更新を完全スキップ
  if(light && !changed) return;
  if(light){   // 演奏タップ（指弾き）：重いUI同期は次フレームに1回だけ集約＝連打しても発音が軽い
    if(!_selHeavyRAF) _selHeavyRAF=requestAnimationFrame(()=>{ _selHeavyRAF=0; selectPadHeavy(); });
    return;
  }
  // 編集系の選択（undo/load/SELECT/Alt等）は即同期。保留中のrAFがあれば破棄。
  if(_selHeavyRAF){ cancelAnimationFrame(_selHeavyRAF); _selHeavyRAF=0; }
  selectPadHeavy();
}

// ---------- mute / solo ----------
let armMode = null;  // null | "mute" | "solo" | "chop" | "edit" | "select"（chop＝COPY統合：複製/スライス、select＝選択のみ発音なし）
let copyArm = null;  // COPY中の元 {type:"pad"|"pat"|"bar", idx}（汎用コピー）
function padKeyLabel(i){ const k=tracks[i].key || KEYMAP[i]; return k ? String(k).toUpperCase() : ""; }   // ASSIGN優先、無ければ既定キー
function paintPadStates(){
  for(let i=0;i<PADS.length;i++){
    const el=padsEl.children[i];
    const kEl=el.querySelector(".k"); if(kEl){ const lb=padKeyLabel(i); if(kEl.textContent!==lb) kEl.textContent=lb; }
    el.classList.toggle("muted",tracks[i].mute);
    el.classList.toggle("soloed",tracks[i].solo);
    el.classList.toggle("copysrc", !!copyArm && copyArm.type==="pad" && copyArm.idx===i);
  }
}
