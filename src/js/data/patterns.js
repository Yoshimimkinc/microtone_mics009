// @module data/patterns
// @provides _muteArr, copyBar, copyPattern, muteLoad, muteSync, setStep, setStepAt
// @uses clearLockEdit, editPat, getPattern, muteSlot, pushUndo, tracks
// @depends -
// ---------- パターン／小節のデータ更新：ステップの ON/OFF と COPY の実体（DOM を触らない） ----------
// 31-ui-copy.js から分離（v0.3.131 Phase 2 第2段）。呼び出し側（doCopy）が描画を行う。
// 編集中パターン（editPat/editBar）のステップを書く唯一の口（v0.3.135）。0=OFF / 1=ON / 2=アクセント / 音階モードは音程+1。
// OFF にしたらそのステップの p-lock も消す。undo（pushUndo）と描画は呼び出し側
function setStep(i, s, v){ getPattern(i)[s]=v; if(v===0) clearLockEdit(i, s); }
// 任意のパターン p・小節 b のステップを書く（● REC 中の手叩き＝鳴っている小節へ記録。p-lock は触らない）
function setStepAt(i, p, b, s, v){ tracks[i].patterns[p][b][s]=v; }
// ---------- ミュート / ソロは A B C D ごと（v0.3.149 §145）：「ミュートの記憶は、ABCD ごとにして欲しい。セットではない」 ----------
// 各トラックが t.mutes[4] / t.solos[4] を持つ。live の t.mute / t.solo は muteSlot のパターンの値（鳴らす・塗る・書くのは今までどおり live）。
// 別のパターンへ移るとき（muteLoad）に live を元のパターンへ書き戻してから、次のパターンの値を live に出す。DOM は触らない（塗りは呼び出し側）
function _muteArr(t){
  if(!Array.isArray(t.mutes)) t.mutes=[!!t.mute,!!t.mute,!!t.mute,!!t.mute];
  if(!Array.isArray(t.solos)) t.solos=[!!t.solo,!!t.solo,!!t.solo,!!t.solo];
}
function muteSync(){ tracks.forEach(t=>{ _muteArr(t); t.mutes[muteSlot]=!!t.mute; t.solos[muteSlot]=!!t.solo; }); }
// p のミュートを live へ。noSync：live をいま入れ直したばかり（undo・セット切替・読込）で、書き戻すと別のパターンを汚すとき
function muteLoad(p, noSync){
  if(!(p>=0&&p<4)) return;
  if(!noSync) muteSync();
  muteSlot=p;
  tracks.forEach(t=>{ _muteArr(t); t.mute=!!t.mutes[p]; t.solo=!!t.solos[p]; });
}
function copyPattern(src,dst){   // パターン src の全小節(＋p-lock)を dst へ。ミュート / ソロも写す（A を作って B に写し、ミュートで変化をつける v0.3.149）
  if(src===dst) return; pushUndo();
  muteSync();
  tracks.forEach(t=>{ t.mutes[dst]=t.mutes[src]; t.solos[dst]=t.solos[src]; });
  if(muteSlot===dst) muteLoad(dst, true);
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
