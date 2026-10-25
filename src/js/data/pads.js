// @module data/pads
// @provides chopBaseName, clearPadSound, copyPadSound, nextChokeGroup, swapPads
// @uses AC, PADS, normalizeKeyPhrase, patSync, pushUndo, stopVoices, tracks
// @depends -
// ---------- パッドのデータ更新：コピー・スライス名・チョークグループの発行 ----------
// 30-ui-pads.js から分離（v0.3.130 Phase 2）。UI の描画とデータ更新を分ける入口。
// copyPadSound / swapPads はデータだけ動かす。描画は呼び出し側が refreshPadDisplay（ui/pads-view）で行う（v0.3.131）
let nextChokeGroup = 2;  // 1はHH用。チョッピーのスライス群は2以降を自動発行
// CHOPPYスライスの基準名（末尾の連番は剥がす＝再チョップでも増殖しない）
function chopBaseName(i){ return (tracks[i].name||PADS[i].name||"").replace(/\s*\d+$/,"").trim()||"SLICE"; }
function copyPadSound(src,dst){
  pushUndo();
  if(typeof patSync==="function") patSync();   // 写す前に live を今のパターンへ書き戻す（エフェクトは A B C D ごと v0.3.150）
  const s=tracks[src],d=tracks[dst];
  // バッファは参照共有（AudioBufferは再生で変化しないため安全）
  d.buffer=s.buffer; d.rawBuffer=s.rawBuffer;
  d._contentEpoch=(d._contentEpoch||0)+1;d._keySignature=s._keySignature||null;d.padKind=s.padKind||"SPL";d.keyPhrase=normalizeKeyPhrase(s.keyPhrase);d.sampleState=s.sampleState?Object.assign({},s.sampleState):null;
  d.tune=s.tune; d.start=s.start; d.end=s.end;
  d.loop=s.loop; d.loopStart=s.loopStart;
  d.filter=s.filter; d.cutoff=s.cutoff; d.reso=s.reso;
  d.vol=s.vol; d.choke=s.choke; d.scale=s.scale; d.attack=s.attack; d.fade=s.fade; d.delaySend=s.delaySend; d.reverbSend=s.reverbSend; d.outBus=s.outBus||"A"; d.midiNote=s.midiNote??null; d.key=s.key??null;
  d.name=s.name;
  if(Array.isArray(s.patFx)) d.patFx=s.patFx.map(o=>Object.assign({},o));   // エフェクトは A B C D ごと（v0.3.150）＝4 つとも写す
  PADS[dst].type=PADS[src].type;
  PADS[dst].voice=PADS[src].voice;
}
// パッドの音を消す（EDIT の DELETE、v0.3.160）：空のパッドに戻す。打ち込み・音量・ミュート・エフェクトは残す（音が無ければ鳴らない）。↩ で戻せる
function clearPadSound(i){
  const t=tracks[i]; if(!t) return;
  pushUndo();
  stopVoices(t, AC.currentTime); t.loopPlaying=false;
  t._contentEpoch=(t._contentEpoch||0)+1;t.padKind="SPL";t.keyPhrase=null;t.sampleState=null;t._keySignature=null;
  t.buffer=null; t.rawBuffer=null; t.start=0; t.end=1; t.loop=false; t.loopStart=0; t.tune=0;
  t.name="PAD "+(i+1);
  PADS[i].type="empty"; PADS[i].voice=null; PADS[i].name="PAD "+(i+1);
}
// パッドの音色設定をまるごと入れ替え（EDITドラッグの移動）。バッファ差替でピッチキャッシュは自動破棄。
function swapPads(a,b){
  if(a===b) return;
  pushUndo();
  if(typeof patSync==="function") patSync();   // 入れ替える前に live を今のパターンへ書き戻す
  const ta=tracks[a], tb=tracks[b];
  ta._contentEpoch=(ta._contentEpoch||0)+1;tb._contentEpoch=(tb._contentEpoch||0)+1;
  for(const k of ["_keySignature","padKind","keyPhrase","sampleState","buffer","rawBuffer","tune","start","end","loop","loopStart","filter","cutoff","reso","vol","choke","name","scale","attack","fade","delaySend","reverbSend","outBus","midiNote","key"]){
    const tmp=ta[k]; ta[k]=tb[k]; tb[k]=tmp;
  }
  { const f=ta.patFx; ta.patFx=tb.patFx; tb.patFx=f; }   // A B C D ごとのエフェクトも一緒に（v0.3.150。live は入替前に patSync 済み）
  let t=PADS[a].type;  PADS[a].type=PADS[b].type;   PADS[b].type=t;
  t=PADS[a].voice;     PADS[a].voice=PADS[b].voice;  PADS[b].voice=t;
}

