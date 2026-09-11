// ---------- UI build ----------
const padsEl = document.getElementById("pads");
const sampNameEl = document.getElementById("sampName");   // ステータス表示（多用するためキャッシュ）
// textContentがセットされたら数秒だけトースト表示→自動で消す（バーに常駐させない）
let _toastTimer=null;
new MutationObserver(()=>{
  const t=(sampNameEl.textContent||"").trim(), has=!!t;
  sampNameEl.classList.toggle("show",has);
  if(_toastTimer){ clearTimeout(_toastTimer); _toastTimer=null; }
  if(has){ _toastTimer=setTimeout(()=>{ sampNameEl.classList.remove("show"); _toastTimer=null; }, Math.min(6000, 2000+t.length*70)); }   // 長文ほど長く出す
  const cm=document.getElementById("clMsg"); if(cm) cm.textContent=t;   // 情報窓の1行に出す
  // 窓が見えていて1行に収まるならトーストは出さない（同じ文が2箇所に出ていた）。
  // 窓が無いSEQ画面と、窓で切れる長文だけトースト
  const winShown = cm && document.getElementById("viewPads") && document.getElementById("viewPads").classList.contains("active")
                   && cm.getBoundingClientRect().height>0;
  const fits = winShown && cm.scrollWidth<=cm.clientWidth+1;
  sampNameEl.classList.toggle("in-window", !!fits);
}).observe(sampNameEl,{childList:true,characterData:true,subtree:true});
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
    // Performance：P-LOCK選択中はドラッグ＝ライブ・モジュレート。STEP(GRID)とは無関係＝最優先（記録可否は perf ● REC で決まる）
    if(activeLock && PERF_BASE[activeLock]){   // P-LOCK選択中はドラッグ＝そのパッドの値（perf でもスマホの DELAY/REVERB でも）
      e.preventDefault();
      const now=Date.now();
      if(now-(perfTapT[i]||0) < 320){      // ダブルタップ＝そのパッドを基準値へ戻す
        perfTapT[i]=0; perfResetPad(i, activeLock); return;
      }
      perfTapT[i]=now;
      perfDrag={pad:i, x0:e.clientX, param:activeLock, moved:false, orig:null, origFilter:null, undone:false};
      try{ d.setPointerCapture(e.pointerId); }catch(_){}
      return;
    }
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
  // --- Performance：ライブ・モジュレート（横ドラッグでP-LOCKパラメータを生いじり。ステップ列と向きを統一） ---
  d.addEventListener("pointermove",(e)=>{
    if(!perfDrag || perfDrag.pad!==i) return;
    const dx=e.clientX-perfDrag.x0;                       // 右で増加
    if(!perfDrag.moved && Math.abs(dx)>6){ perfDrag.moved=true; perfTapT[i]=0; }   // ドラッグはダブルタップ計測に含めない
    if(!perfDrag.moved) return;
    const t=tracks[i], spec=PLOCKS[perfDrag.param];
    const prop=PERF_BASE[perfDrag.param];
    if(perfDrag.orig===null){                             // 初回：相対ドラッグの基点＝現在値
      perfDrag.orig = perfDrag.param==="filter"?t.cutoff : t[prop];
      if(perfDrag.param==="filter" && t.filter==="off") t.filter="lp";   // 音が出るようLPに（解放時に復帰）
    }
    let v;
    if(spec.log){ const lmin=Math.log(spec.min),lmax=Math.log(spec.max); let lv=Math.log(perfDrag.orig)+(dx/200)*(lmax-lmin); lv=Math.max(lmin,Math.min(lmax,lv)); v=Math.exp(lv); }
    else { v=perfDrag.orig+(dx/200)*(spec.max-spec.min); v=Math.max(spec.min,Math.min(spec.max,v)); }
    if(perfDrag.param==="pitch"||perfDrag.param==="level") t[prop]=Math.round(v);
    else t[prop]=v;                                       // filter(cutoff) / delay / reverb は連続値
    perfFillPad(i, perfDrag.param);                       // このパッドのフィルを更新（発音なし）
    const ps=document.getElementById("perfSel");          // 画面にライブ表示
    if(ps){ ps.textContent=String(i+1).padStart(2,"0")+" "+perfDrag.param.toUpperCase()+" ▸ "+spec.fmt(t[prop])+(perfRecArm?" ●REC":""); }
  });
  const endPerfDrag=(e)=>{                                 // 値はP-LOCKキーを持っている間は保持（発音しない）。復帰はキー解放時。
    if(!perfDrag || perfDrag.pad!==i) return;
    perfDrag=null;
    if(typeof syncEditor==="function") syncEditor();
    if(typeof paintPerf==="function") paintPerf();
  };
  d.addEventListener("pointerup",endPerfDrag);
  d.addEventListener("pointercancel",endPerfDrag);
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

// ---------- mute / solo ----------
let armMode = null;  // null | "mute" | "solo" | "chop" | "edit" | "select"（chop＝COPY統合：複製/スライス、select＝選択のみ発音なし）
let copyArm = null;  // COPY中の元 {type:"pad"|"pat"|"bar", idx}（汎用コピー）
let nextChokeGroup = 2;  // 1はHH用。チョッピーのスライス群は2以降を自動発行
// CHOPPYスライスの基準名（末尾の連番は剥がす＝再チョップでも増殖しない）
function chopBaseName(i){ return (tracks[i].name||PADS[i].name||"").replace(/\s*\d+$/,"").trim()||"SLICE"; }
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
function copyPadSound(src,dst){
  pushUndo();
  const s=tracks[src],d=tracks[dst];
  // バッファは参照共有（AudioBufferは再生で変化しないため安全）
  d.buffer=s.buffer; d.rawBuffer=s.rawBuffer;
  d.tune=s.tune; d.start=s.start; d.end=s.end;
  d.loop=s.loop; d.loopStart=s.loopStart;
  d.filter=s.filter; d.cutoff=s.cutoff; d.reso=s.reso;
  d.vol=s.vol; d.choke=s.choke; d.scale=s.scale; d.attack=s.attack; d.fade=s.fade; d.delaySend=s.delaySend; d.reverbSend=s.reverbSend; d.outBus=s.outBus||"A"; d.midiNote=s.midiNote??null; d.key=s.key??null;
  d.name=s.name;
  PADS[dst].type=PADS[src].type;
  PADS[dst].voice=PADS[src].voice;
  applyPadCategory(dst);
  const nm=padsEl.children[src].querySelector(".nm").textContent;
  padsEl.children[dst].querySelector(".nm").textContent=nm;
  // SEQ画面の行名も更新
  const rn=grid.children[dst].querySelector(".rn");
  if(rn) rn.innerHTML=`<b>${String(dst+1).padStart(2,"0")}</b> ${nm}`;
  drawPadWave(dst);
}
