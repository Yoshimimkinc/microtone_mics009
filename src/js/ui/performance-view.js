// @module ui/performance-view
// @provides perfFillPad, perfLockApply, perfPadDown, perfPadEnd, perfPadMove, perfReadVals, perfRevertSnap,
//    plockFillsOn, renderPerfFills
// @uses PERF_BASE, PLOCKS, activeLock, padsEl, paintPerf, perfDrag, perfLast, perfRecArm, perfResetPad,
//    perfSnap, perfTapT, syncEditor, tracks
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
    perfDrag.orig = perfDrag.param==="filter"?t.cutoff : t[prop];
    if(perfDrag.param==="filter" && t.filter==="off") t.filter="lp";   // 音が出るようLPに（解放時に復帰）
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
// 離した：// 値はP-LOCKを持っている間は保持（発音しない）。解放で掛ける前へ戻り、次に押すと復活
function perfPadEnd(e,i){
  if(!perfDrag || perfDrag.pad!==i) return;
  perfDrag=null;
  if(typeof syncEditor==="function") syncEditor();
  if(typeof paintPerf==="function") paintPerf();
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
}
function perfRevertSnap(){    // perfSnap（掛ける前の値）へ16パッドを戻す＝効果オフ
  if(!perfSnap) return;
  const p=perfSnap.param;
  for(let i=0;i<16;i++){ const t=tracks[i];
    if(p==="filter"){ t.cutoff=perfSnap.vals[i]; t.filter=perfSnap.filt[i]; } else t[PERF_BASE[p]]=perfSnap.vals[i];
  }
}
function perfReadVals(p){     // いまの16パッドの値を控える（filter は cutoff と種別の両方）
  const o={vals:[],filt:[]};
  for(let i=0;i<16;i++){ const t=tracks[i]; o.vals[i]= p==="filter"?t.cutoff : t[PERF_BASE[p]]; o.filt[i]=t.filter; }
  return o;
}
function perfLockApply(prev){
  // 動き（v0.3.121）：**解放＝掛ける前の値へ戻る（効果オフ）／もう一度押す＝最後にいじった値が復活**。
  // v0.3.118 までは解放で戻るが記憶が無く「もう一度押すと素の値」だった。v0.3.119 は逆に解放しても残す形にしたが、
  // 求められていたのは「エフェクトのON/OFF＋つまみ位置の記憶」。REC ON のときは従来どおり解放しても基本値を保持する。
  if(perfSnap && prev && perfSnap.param===prev && prev!==activeLock){
    perfLast[prev]=perfReadVals(prev);                          // 最後にいじった値を覚える
    if(!perfRecArm || perfSnap.recorded) perfRevertSnap();      // 掛ける前へ戻す（REC ON で未記録なら保持）
    perfSnap=null;
  }
  // 新しいP-LOCKが有効＝掛ける前の値を控えてから、前回の記憶があれば復活させる
  if(activeLock && PERF_BASE[activeLock] && (!perfSnap || perfSnap.param!==activeLock)){
    perfSnap={param:activeLock, recorded:false, ...perfReadVals(activeLock)};
    const last=perfLast[activeLock];
    if(last){ for(let i=0;i<16;i++){ const t=tracks[i];
      if(activeLock==="filter"){ t.cutoff=last.vals[i]; t.filter=last.filt[i]; } else t[PERF_BASE[activeLock]]=last.vals[i]; } }
  }
  if(!(activeLock && PERF_BASE[activeLock])) perfSnap=null;
  document.body.classList.toggle("perf-plock", plockFillsOn());
  renderPerfFills();
  if(typeof syncEditor==="function") syncEditor();
}
