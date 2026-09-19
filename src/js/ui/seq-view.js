// @module ui/seq-view
// @provides _padCurStep, _seqCurStep, _stripCurStep, colnums, curStepFor, grid, moveCursors, paintSteps,
//    rowEls
// @uses AC, PADS, STEPS, applyWaveSEQ, applyWaveStrip, armMode, clearLockEdit, copyTap, displayBar,
//    displayPat, editBar, editPat, getPattern, melodicMode, paintMelodic, paintPatBar, paintStepStrip,
//    playStep, playVoice, playing, pushUndo, scaleSemi, selectPad, selected, stepBtns, stopVoices, tracks,
//    trigger, viewSeqEl, vuHit
// @depends boot, app/state
// ---------- SEQ 画面：16×16 グリッドの生成・ステップ表示・再生カーソル ----------
// 30-ui-pads.js から分離（v0.3.130 Phase 2）。paintSteps/moveCursors は表示更新だけ（データは触らない）
// column numbers (1..16)
const colnums=document.getElementById("colnums");
colnums.appendChild(Object.assign(document.createElement("div"),{className:"cn"}));
for(let s=0;s<STEPS;s++){
  const c=document.createElement("div");c.className="cn";c.textContent=s+1;colnums.appendChild(c);
}

// 16-row grid
const grid=document.getElementById("grid");
const rowEls=[];        // rowEls[i] = array of 16 step divs
PADS.forEach((p,i)=>{
  const row=document.createElement("div");
  row.className="row"+(i===selected?" sel":"");
  row.dataset.i=i;

  const rn=document.createElement("div");
  rn.className="rn";
  rn.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b> ${p.name}`;
  rn.addEventListener("click",async()=>{
    if(AC.state!=="running")await AC.resume();
    if(melodicMode){
      const pitchIdx=(PADS.length-1)-i, sel=selected, t=tracks[sel];
      if(t.loop && t.loopPlaying){ stopVoices(t, AC.currentTime); t.loopPlaying=false; }   // 発音中の再トリガ＝止まる
      else { playVoice(sel, AC.currentTime, false, false, scaleSemi(t.scale, pitchIdx)); if(t.loop) t.loopPlaying=true; if(typeof vuHit==="function") vuHit(sel, false); }
    }
    else { trigger(i); selectPad(i,true); }
  });
  row.appendChild(rn);

  const cells=[];
  for(let s=0;s<STEPS;s++){
    const st=document.createElement("div");st.className="step";st.dataset.s=s;
    st.addEventListener("click",(e)=>{
      if(armMode==="chop"){ copyTap("note",{t:i,s}); return; }   // COPY中＝ノート(値+P-LOCK)の元→先
      pushUndo();   // 1手ずつ戻せるよう編集前に記録
      if(melodicMode){
        const pitchIdx=(PADS.length-1)-i;                       // 行→音程
        const cur=getPattern(selected)[s];
        const nv=(cur===pitchIdx+1)?0:pitchIdx+1;               // モノ：その列の音程をセット/解除
        getPattern(selected)[s]=nv;
        if(nv===0) clearLockEdit(selected, s);                  // OFFにしたらp-lockも消す
      } else {
        const cur=getPattern(i)[s];
        const nv = e.shiftKey ? (cur===2?0:2) : (cur?0:1);
        getPattern(i)[s]=nv;
        if(nv===0) clearLockEdit(i, s);                         // OFFにしたらp-lockも消す
      }
      paintSteps(); paintPatBar();   // 中身ドット・小節長を更新
      if(typeof applyWaveSEQ==="function") applyWaveSEQ();   // 発音セルのみ波形を更新
      if(typeof applyWaveStrip==="function") applyWaveStrip();
    });
    row.appendChild(st);cells.push(st);
  }
  rowEls.push(cells);
  grid.appendChild(row);
});

// 再生カーソルの現在位置キャッシュ（毎ステップの全面塗り直しを避けるため）
let _seqCurStep=-1, _padCurStep=-1, _stripCurStep=-1;
function curStepFor(){ return (playing && editPat===displayPat && editBar===displayBar) ? playStep : -1; }
function paintSteps(){
  if(typeof paintStepStrip==="function") paintStepStrip();             // 常時表示の16ステップ列（1画面化）を毎回同期（早期returnより前）
  {   // 情報窓のSTEP/STATEをライブ更新（軽量）。v0.3.79で窓を全レイアウト共通にした後も perf 限定のまま残り、
      // スマホ・PC狭幅では再生中も「--」「■ STOP」だった（規則§1「嘘をつかない」違反・v0.3.98で修正）
    const _cs=document.getElementById("clStep"); if(_cs) _cs.textContent=playing?(String(playStep+1).padStart(2,"0")+"/16"):"--";
    const _sc=document.querySelector(".perf-screen"); if(_sc) _sc.classList.toggle("playing",playing);
  }
  if(!viewSeqEl.classList.contains("active")) return;   // SEQ非表示なら重い16×16グリッド更新は不要（毎ステップの負荷を削減）
  if(melodicMode){ paintMelodic(); return; }
  const cs=curStepFor();
  for(let i=0;i<PADS.length;i++){
    const pat=getPattern(i);
    rowEls[i].forEach((el,s)=>{
      el.classList.toggle("on",pat[s]>0);
      el.classList.toggle("acc",pat[s]===2);
      el.classList.toggle("cursor",s===cs);
    });
  }
  [...grid.children].forEach((row,i)=>row.classList.toggle("sel",i===selected));
  _seqCurStep=cs;   // 全面塗り直し後はカーソルキャッシュも同期
}
// 毎ステップの軽量更新：ON/ACCは編集時しか変わらないので、動くカーソルだけを差分更新する
function moveCursors(){
  // 常時表示の16ステップ列：再生ヘッド（明るい枠）を毎フレーム更新
  if(typeof stepBtns!=="undefined" && stepBtns.length){
    const ns=curStepFor();
    if(ns!==_stripCurStep){
      if(_stripCurStep>=0 && stepBtns[_stripCurStep]) stepBtns[_stripCurStep].classList.remove("cur");
      if(ns>=0 && stepBtns[ns]) stepBtns[ns].classList.add("cur");
      _stripCurStep=ns;
    }
  }
  if(viewSeqEl.classList.contains("active")){
    if(melodicMode){ paintMelodic(); return; }
    const ns=curStepFor();
    if(ns!==_seqCurStep){
      if(_seqCurStep>=0){ for(let i=0;i<PADS.length;i++){ const c=rowEls[i][_seqCurStep]; if(c) c.classList.remove("cursor"); } }
      if(ns>=0){ for(let i=0;i<PADS.length;i++){ const c=rowEls[i][ns]; if(c) c.classList.add("cursor"); } }
      _seqCurStep=ns;
    }
  }
}
