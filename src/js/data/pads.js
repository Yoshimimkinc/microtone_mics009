// @module data/pads
// @provides chopBaseName, copyPadSound, nextChokeGroup, swapPads
// @uses PADS, pushUndo, tracks
// @depends -
// ---------- パッドのデータ更新：コピー・スライス名・チョークグループの発行 ----------
// 30-ui-pads.js から分離（v0.3.130 Phase 2）。UI の描画とデータ更新を分ける入口。
// copyPadSound / swapPads はデータだけ動かす。描画は呼び出し側が refreshPadDisplay（ui/pads-view）で行う（v0.3.131）
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
}
// パッドの音色設定をまるごと入れ替え（EDITドラッグの移動）。バッファ差替でピッチキャッシュは自動破棄。
function swapPads(a,b){
  if(a===b) return;
  pushUndo();
  const ta=tracks[a], tb=tracks[b];
  for(const k of ["buffer","rawBuffer","tune","start","end","loop","loopStart","filter","cutoff","reso","vol","choke","name","scale","attack","fade","delaySend","reverbSend","outBus","midiNote","key"]){
    const tmp=ta[k]; ta[k]=tb[k]; tb[k]=tmp;
  }
  let t=PADS[a].type;  PADS[a].type=PADS[b].type;   PADS[b].type=t;
  t=PADS[a].voice;     PADS[a].voice=PADS[b].voice;  PADS[b].voice=t;
}

