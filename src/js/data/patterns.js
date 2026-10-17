// @module data/patterns
// @provides PAT_FX, _fxOf, _patArr, copyBar, copyPattern, patLoad, patRead, patSync, patWrite, setStep,
//    setStepAt
// @uses clearLockEdit, editPat, getPattern, patSlot, pushUndo, tracks
// @depends -
// ---------- パターン／小節のデータ更新：ステップの ON/OFF と COPY の実体（DOM を触らない） ----------
// 31-ui-copy.js から分離（v0.3.131 Phase 2 第2段）。呼び出し側（doCopy）が描画を行う。
// 編集中パターン（editPat/editBar）のステップを書く唯一の口（v0.3.135）。0=OFF / 1=ON / 2=アクセント / 音階モードは音程+1。
// OFF にしたらそのステップの p-lock も消す。undo（pushUndo）と描画は呼び出し側
function setStep(i, s, v){ getPattern(i)[s]=v; if(v===0) clearLockEdit(i, s); }
// 任意のパターン p・小節 b のステップを書く（● REC 中の手叩き＝鳴っている小節へ記録。p-lock は触らない）
function setStepAt(i, p, b, s, v){ tracks[i].patterns[p][b][s]=v; }
// ---------- パターンごとに覚える状態（A B C D）：ミュート / ソロ（v0.3.149 §146）とエフェクト（v0.3.150 §146） ----------
// 「ミュートの記憶は、ABCD ごとにして欲しい。セットではない」「パターンにエフェクトの状況も保管して欲しい」。
// 各トラックが t.mutes[4] / t.solos[4] / t.patFx[4]（PAT_FX の値）を持つ。live の t.mute / t.solo / t.delaySend … は patSlot のパターンの値
// （鳴らす・塗る・書くのは今までどおり live）。別のパターンへ移るとき（patLoad）に live を元のパターンへ書き戻してから、次のパターンの値を live に出す。
// DOM は触らない（塗りは呼び出し側）
const PAT_FX=["delaySend","reverbSend","filter","cutoff","reso"];   // パターンごとに覚えるエフェクト：DELAY / REVERB の送り・FILTER（種類・カットオフ・レゾ）
function _fxOf(t){ const o={}; PAT_FX.forEach(k=>{ o[k]=t[k]; }); return o; }
function _patArr(t){
  if(!Array.isArray(t.mutes)) t.mutes=[!!t.mute,!!t.mute,!!t.mute,!!t.mute];
  if(!Array.isArray(t.solos)) t.solos=[!!t.solo,!!t.solo,!!t.solo,!!t.solo];
  if(!Array.isArray(t.patFx) || t.patFx.length!==4) t.patFx=[0,1,2,3].map(()=>_fxOf(t));
}
// live → パターン p ／ パターン p → live（1 トラック）。他のセットの再生（audio/set-players）も patRead で鳴らすパターンの値にする
function patWrite(t,p){ _patArr(t); t.mutes[p]=!!t.mute; t.solos[p]=!!t.solo; t.patFx[p]=_fxOf(t); }
function patRead(t,p){ _patArr(t); t.mute=!!t.mutes[p]; t.solo=!!t.solos[p]; const f=t.patFx[p]||{}; PAT_FX.forEach(k=>{ if(f[k]!==undefined) t[k]=f[k]; }); }
function patSync(){ tracks.forEach(t=>patWrite(t,patSlot)); }
// p の状態を live へ。noSync：live をいま入れ直したばかり（undo・セット切替・読込）で、書き戻すと別のパターンを汚すとき
function patLoad(p, noSync){
  if(!(p>=0&&p<4)) return;
  if(!noSync) patSync();
  patSlot=p;
  tracks.forEach(t=>patRead(t,p));
}
function copyPattern(src,dst){   // パターン src の全小節(＋p-lock)を dst へ。ミュート / ソロ / エフェクトも写す（A を作って B に写し、変化をつける）
  if(src===dst) return; pushUndo();
  patSync();
  tracks.forEach(t=>{ t.mutes[dst]=t.mutes[src]; t.solos[dst]=t.solos[src]; t.patFx[dst]=Object.assign({}, t.patFx[src]); });
  if(patSlot===dst) patLoad(dst, true);
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
