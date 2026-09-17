// @module data/pads
// @provides chopBaseName, copyPadSound, nextChokeGroup
// @uses PADS, applyPadCategory, drawPadWave, grid, padsEl, pushUndo, tracks
// @depends -
// ---------- パッドのデータ更新：コピー・スライス名・チョークグループの発行 ----------
// 30-ui-pads.js から分離（v0.3.130 Phase 2）。UI の描画とデータ更新を分ける入口。
// copyPadSound はまだパッド名・SEQ 行名・波形の描画も自分で行う（次の段で paint 側へ寄せる）
let nextChokeGroup = 2;  // 1はHH用。チョッピーのスライス群は2以降を自動発行
// CHOPPYスライスの基準名（末尾の連番は剥がす＝再チョップでも増殖しない）
function chopBaseName(i){ return (tracks[i].name||PADS[i].name||"").replace(/\s*\d+$/,"").trim()||"SLICE"; }
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
