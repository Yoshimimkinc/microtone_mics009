// @module data/patterns
// @provides copyBar, copyPattern, setStep, setStepAt
// @uses clearLockEdit, editPat, getPattern, pushUndo, tracks
// @depends -
// ---------- パターン／小節のデータ更新：ステップの ON/OFF と COPY の実体（DOM を触らない） ----------
// 31-ui-copy.js から分離（v0.3.131 Phase 2 第2段）。呼び出し側（doCopy）が描画を行う。
// 編集中パターン（editPat/editBar）のステップを書く唯一の口（v0.3.135）。0=OFF / 1=ON / 2=アクセント / 音階モードは音程+1。
// OFF にしたらそのステップの p-lock も消す。undo（pushUndo）と描画は呼び出し側
function setStep(i, s, v){ getPattern(i)[s]=v; if(v===0) clearLockEdit(i, s); }
// 任意のパターン p・小節 b のステップを書く（● REC 中の手叩き＝鳴っている小節へ記録。p-lock は触らない）
function setStepAt(i, p, b, s, v){ tracks[i].patterns[p][b][s]=v; }
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
