// @module data/patterns
// @provides copyBar, copyPattern
// @uses editPat, pushUndo, tracks
// @depends -
// ---------- パターン／小節のデータ更新：COPY の実体（DOM を触らない） ----------
// 31-ui-copy.js から分離（v0.3.131 Phase 2 第2段）。呼び出し側（doCopy）が描画を行う。
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
