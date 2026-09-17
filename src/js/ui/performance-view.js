// @module ui/performance-view
// @provides perfPadDown, perfPadEnd, perfPadMove
// @uses PERF_BASE, PLOCKS, activeLock, paintPerf, perfDrag, perfFillPad, perfRecArm, perfResetPad, perfTapT,
//    syncEditor, tracks
// @depends -
// ---------- Performance：P-LOCK 選択中のパッド操作（ライブ・モジュレート） ----------
// 30-ui-pads.js のパッド生成ループに埋まっていた処理を関数に切り出した（v0.3.130 Phase 2）。呼び出し順・中身は同じ。
// 表示側（perfFillPad／renderPerfFills／perfLockApply）はまだ 61-layout.js にある＝次の段で寄せる
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
