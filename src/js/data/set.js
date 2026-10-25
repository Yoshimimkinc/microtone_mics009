// @module data/set
// @provides SET_TRACK_DEFAULT, _cloneSnap, _defaultTrackSnap, _emptyPatterns, _setStart, applySetSnapshot,
//    copySetTo, decodeSetData, defaultSetSnapshot, focusSet, loadSetData, queueSet, resetSet, setElapsed,
//    setName, setRename, setsFromProject, snapshotSet, switchSetNow
// @uses AC, PADS, PRESET_BUFS, STEPS, applyPadCategory, applyTrackSnapshot, b64ToUint8, bpmVal,
//    buildAllTrackWaves, clearBarHold, clearUndo, decodeAudio, drawAllPadWaves, editBar, editPat, makeLofi,
//    normalizeKeyPhrase, paintMixer, paintPadStates, paintPatBar, paintPerf, paintSet, paintSteps, patLoad,
//    playing, prepareKeyTrack, queuedPat, queuedSet, scheduleAutosave, selectPad, selected, setCur,
//    setDelayTempo, setLevels, setSetLevel, setSlots, sideStop, snapshotState, stopAllVoices,
//    stripLegacyLocks, swingPct, tracks, warmKeyTracks
// @depends -
// ---------- SET：ファイル全体 = 16 セット × 16 パッド × 4 シーケンス。SET モードではパッドがセットの「ポン出し」になる ----------
// v0.3.144 §145。セットは最初から 16 ある（空という状態は無い。新しいセットは既定のキット＝1-8 空・9-16 プリセット）。
// いまのセット（setCur）は live の tracks / PADS / bpmVal / swingPct が正。他のセットは setSlots[k] に snapshotSet の形で持つ。
// 切替 = いまのを snapshot に退避 → 次の snapshot を tracks へ（音は復号済みの参照なので同期）。再生中は小節頭（queuedSet）。
// DOM は触らない（表示は ui/set-view）。
let _setStart=0;   // いまのセットが始まった時刻（performance.now）。経過表示用
const SET_TRACK_DEFAULT={vol:-4,tune:0,scale:"off",start:0,end:1,loop:false,loopStart:0,filter:"off",cutoff:12000,reso:0.7,attack:0,fade:3,delaySend:0,reverbSend:0,outBus:"A",midiNote:null,key:null,choke:0,mute:false,solo:false};
function _emptyPatterns(){ return Array.from({length:4},()=>Array.from({length:4},()=>new Array(STEPS).fill(0))); }
// 既定のキット（1-8 空、9-16 プリセット）の 1 トラック snapshot
function _defaultTrackSnap(i){
  const p=PADS[i], pr=(typeof PRESET_BUFS!=="undefined")&&PRESET_BUFS[i];
  const synth = i>=8 && pr;
  return Object.assign({}, SET_TRACK_DEFAULT, {
    name: synth ? (["KICK","SNARE","HAT","OHAT","CLAP","RIM","TOM","SINBASS"][i-8]||p.name) : ("PAD "+(i+1)),
    type: synth ? "synth" : "empty", voice: synth ? ["kick","snare","hat","ohat","clap","rim","tom","sinbass"][i-8] : null,
    buffer: synth ? pr.buf : null, rawBuffer: synth ? pr.raw : null,
    start: synth ? pr.start : 0, end: synth ? pr.end : 1, loop: synth ? pr.loop : false, loopStart: synth ? pr.loopStart : 0,
    choke: (synth && (i===10||i===11)) ? 1 : 0, scale: (synth && i===15) ? "chro" : "off",
    mutes:[false,false,false,false], solos:[false,false,false,false],   // ミュート / ソロは A B C D ごと（v0.3.149）
    patFx:[0,1,2,3].map(()=>({delaySend:0, reverbSend:0, filter:"off", cutoff:12000, reso:0.7})),   // エフェクトも A B C D ごと（v0.3.150）
    patterns:_emptyPatterns(), locks:{} });
}
function defaultSetSnapshot(k){ return {name:"SET "+(k+1), bpm:100, swing:67, tracks:PADS.map((_,i)=>_defaultTrackSnap(i))}; }
// いまのセット（live）を snapshot に
function snapshotSet(){ return {name:(setSlots[setCur]&&setSlots[setCur].name)||("SET "+(setCur+1)), bpm:bpmVal, swing:swingPct, tracks:snapshotState().tracks}; }
function _cloneSnap(s){ return {name:s.name, bpm:s.bpm, swing:s.swing, tracks:s.tracks.map(x=>Object.assign({}, x, {mutes:(x.mutes||[]).slice(), solos:(x.solos||[]).slice(), patFx:Array.isArray(x.patFx)?x.patFx.map(o=>Object.assign({},o)):null, activeVoices:[], loopPlaying:false, patterns:x.patterns.map(p=>p.map(b=>b.slice())), locks:{},keyPhrase:normalizeKeyPhrase(x.keyPhrase),sampleState:x.sampleState?Object.assign({},x.sampleState):null}))}; }
// .mics のセット（v3 の sets[k]、または v2 のファイル丸ごと）を snapshot に（音を復号。audio の無い synth はプリセット）
async function decodeSetData(sd,k){
  const snap=defaultSetSnapshot(k);
  if(!sd||!Array.isArray(sd.tracks)) return snap;
  snap.name=String(sd.name||("SET "+(k+1))).slice(0,24); snap.bpm=+sd.bpm||100; snap.swing=+sd.swing||50;
  for(let i=0;i<Math.min(sd.tracks.length,16);i++){ const pt=sd.tracks[i]; if(!pt) continue; const x=snap.tracks[i], pr=(typeof PRESET_BUFS!=="undefined")&&PRESET_BUFS[i];
    x.padKind=["SPL","KEY","SCR"].includes(pt.padKind)?pt.padKind:"SPL";x.keyPhrase=normalizeKeyPhrase(pt.keyPhrase);
    x.name=pt.name||x.name; x.type=pt.type||"empty"; x.voice=pt.voice||null;
    x.vol=pt.vol??-4; x.tune=pt.tune??0; x.scale=pt.scale??"off";
    x.filter=pt.filter??"off"; x.cutoff=pt.cutoff??12000; x.reso=pt.reso??0.7;
    x.attack=pt.attack??0; x.fade=pt.fade??3; x.delaySend=pt.delaySend??0; x.reverbSend=pt.reverbSend??0; x.outBus=pt.outBus||"A"; x.midiNote=pt.midiNote??null; x.key=pt.key??null;
    x.choke=pt.choke??0; x.mute=pt.mute??false; x.solo=pt.solo??false;
    // ミュート / ソロは A B C D ごと（v0.3.149）。それより前のファイルは全パターンに同じ値
    x.mutes=Array.isArray(pt.mutes)?[0,1,2,3].map(p=>!!pt.mutes[p]):[x.mute,x.mute,x.mute,x.mute];
    x.solos=Array.isArray(pt.solos)?[0,1,2,3].map(p=>!!pt.solos[p]):[x.solo,x.solo,x.solo,x.solo];
    // エフェクト（DELAY / REVERB の送り・FILTER）も A B C D ごと（v0.3.150）。それより前のファイルは全パターンに同じ値
    const fx0={delaySend:x.delaySend, reverbSend:x.reverbSend, filter:x.filter, cutoff:x.cutoff, reso:x.reso};
    x.patFx=[0,1,2,3].map(p=>{ const f=Array.isArray(pt.patFx)&&pt.patFx[p]; return f ? {delaySend:f.delaySend??fx0.delaySend, reverbSend:f.reverbSend??fx0.reverbSend, filter:f.filter??fx0.filter, cutoff:f.cutoff??fx0.cutoff, reso:f.reso??fx0.reso} : Object.assign({},fx0); });
    // パターン（新形式: patterns[p][小節][step] / 旧形式: patterns[p]=16数値 を1小節として吸収）
    x.patterns=_emptyPatterns();
    if(pt.patterns) for(let p=0;p<4;p++){ const pat=pt.patterns[p]; if(!Array.isArray(pat)) continue;
      if(typeof pat[0]==="number"){ x.patterns[p][0]=pat.slice(0,STEPS); }
      else for(let bar=0;bar<4&&bar<pat.length;bar++) if(Array.isArray(pat[bar])) x.patterns[p][bar]=pat[bar].slice(0,STEPS);
      for(let bar=0;bar<4;bar++) while(x.patterns[p][bar].length<STEPS) x.patterns[p][bar].push(0); }
    x.locks=stripLegacyLocks(pt.locks ? JSON.parse(JSON.stringify(pt.locks)) : {});
    if(pt.audio){ const wav=b64ToUint8(pt.audio); const ab=wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength);
      const raw=await decodeAudio(ab); x.rawBuffer=raw; x.buffer=makeLofi(raw);
      x.start=pt.start??0; x.end=pt.end??1; x.loop=pt.loop??false; x.loopStart=pt.loopStart??0; }
    else if(x.type==="synth" && pr){ x.buffer=pr.buf; x.rawBuffer=pr.raw;   // 同梱しないプリセット＝起動時の音。未指定の値はプリセット既定
      x.start=pt.start??pr.start; x.end=pt.end??pr.end; x.loop=pt.loop??pr.loop; x.loopStart=pt.loopStart??pr.loopStart; }
    else { x.buffer=null; x.rawBuffer=null; x.start=pt.start??0; x.end=pt.end??1; x.loop=pt.loop??false; x.loopStart=pt.loopStart??0; }   // 空パッド（幽霊サンプル防止）
  }
  for(let i=0;i<snap.tracks.length;i++){const x=snap.tracks[i];if(x.padKind==="KEY"){x.sampleState={buffer:x.buffer,rawBuffer:x.rawBuffer,start:x.start,end:x.end,loop:x.loop,loopStart:x.loopStart,type:x.type,voice:x.voice};await prepareKeyTrack(x,snap.bpm);x.type="sample";x.voice=null;}}
  return snap;
}
// ファイル → 16 の snapshot と cur（v3 は sets、v2 / 既定プロジェクトは丸ごと SET 1）。cur から復号する
async function setsFromProject(proj){
  const v3 = proj && Array.isArray(proj.sets);
  const sets = v3 ? proj.sets : [proj];
  let cur = v3 ? (+proj.cur||0) : 0; if(!(cur>=0&&cur<16)) cur=0;
  const slots=new Array(16).fill(null);
  slots[cur]=await decodeSetData(sets[cur],cur);
  for(let k=0;k<16;k++){ if(k===cur) continue; slots[k]=await decodeSetData(sets[k],k); }
  return {slots, cur};
}
// snapshot を live（tracks / PADS / bpm / swing）へ。opts: deferPaint（重い再描画は次フレーム）/ keepSel（選択パッド・編集位置を保つ）
function applySetSnapshot(s, opts){
  const keepSel=!!(opts&&opts.keepSel), selWas=selected;
  for(let i=0;i<16;i++) applyTrackSnapshot(i, s.tracks[i]);
  bpmVal=s.bpm||100; swingPct=s.swing||50;
  const $=id=>document.getElementById(id);
  if($("bpm")){ $("bpm").value=bpmVal; $("bpmRead").textContent=bpmVal.toFixed(1); }
  if($("swing")) $("swing").value=swingPct;
  if(typeof setDelayTempo==="function") setDelayTempo();
  if(!keepSel){ editPat=0; editBar=0; patLoad(0, true); }   // セットの頭は A＝ミュートも A のもの
  if(typeof warmKeyTracks==="function") warmKeyTracks();
  for(let i=0;i<PADS.length;i++) applyPadCategory(i);
  const paint=()=>{ selectPad(keepSel?selWas:0); paintPadStates(); paintSteps(); paintMixer(); paintPatBar(); drawAllPadWaves(); buildAllTrackWaves(); if(typeof paintPerf==="function") paintPerf(); if(typeof paintSet==="function") paintSet(); };
  if(opts&&opts.deferPaint) requestAnimationFrame(paint); else paint();
}
// 切替の実体（スケジューラが小節頭に呼ぶ／止まっているときは queueSet から直接）。いまのを退避 → 次を live へ。音は stopAt で止める
function switchSetNow(k, stopAt){
  if(!(k>=0&&k<16)||k===setCur) return;
  if(typeof sideStop==="function") sideStop(k, stopAt);   // 他のセットとして鳴っていたら止めてから（いまのセットは transport が鳴らす）
  if(!setSlots[k]) setSlots[k]=defaultSetSnapshot(k);
  setSlots[setCur]=snapshotSet();                 // いまのセットを退避（live が正だったぶんを書き戻す）
  stopAllVoices(stopAt||AC.currentTime); queuedPat=null;
  setCur=k; queuedSet=null; _setStart=performance.now();
  if(typeof clearBarHold==="function") clearBarHold();
  applySetSnapshot(setSlots[k], {deferPaint:true});
  clearUndo();                                     // 別のセットの状態へ戻すのは事故
  if(typeof scheduleAutosave==="function") scheduleAutosave();
}
// セットのファイル（.mics の 1 セット）をいまのセットへ読み込む（v0.3.162 §156）。音は復号。undo と塗りは呼び出し側
async function loadSetData(sd){
  const snap=await decodeSetData(sd, setCur);
  stopAllVoices(AC.currentTime);
  setSlots[setCur]=snap;   // 名前など（いまのセットの中身は live が正。切替のときに snapshotSet で書き戻る）
  applySetSnapshot(snap, {});
  if(typeof setSetLevel==="function") setSetLevel(setCur, +(sd&&sd.level)||0);
}
// SET のポン出し（v0.3.147）：k をいまのセット（PADS / SEQ の対象）にする。音は止めない＝いま鳴っている声とループの状態は
// 退避先の snapshot へ引き継ぐ（いまのセットが鳴っていれば、呼ぶ前に audio/set-players の sideTakeCurrent で「他のセットの再生」に移してある）
function focusSet(k){
  if(!(k>=0&&k<16)||k===setCur) return;
  if(typeof sideStop==="function") sideStop(k);
  if(!setSlots[k]) setSlots[k]=defaultSetSnapshot(k);
  const snap=snapshotSet();
  tracks.forEach((t,i)=>{ const x=snap.tracks[i]; x.activeVoices=t.activeVoices||[]; x.loopPlaying=!!t.loopPlaying; t.activeVoices=[]; t.loopPlaying=false; });
  setSlots[setCur]=snap;
  queuedPat=null; setCur=k; queuedSet=null; _setStart=performance.now();
  if(typeof clearBarHold==="function") clearBarHold();   // BAR ホールドは別の曲には持ち越さない（v0.3.161）
  applySetSnapshot(setSlots[k], {deferPaint:true});
  clearUndo();
  if(typeof scheduleAutosave==="function") scheduleAutosave();
}
// セットを叩く：止まっていれば今すぐ差し替え、鳴っていれば次の小節頭で（同じセットをもう一度＝予約取消）。NOW を叩いても何もしない（false）
function queueSet(k){
  if(!(k>=0&&k<16)) return false;
  if(playing){ if(k===setCur&&queuedSet===null) return false; queuedSet = (queuedSet===k) ? null : k; return true; }
  if(k===setCur) return false;
  switchSetNow(k, AC.currentTime); return true;
}
// いまのセットを k にコピー（COPY モード＋セットを叩く）。名前はコピー先の番号
function copySetTo(k){ if(!(k>=0&&k<16)||k===setCur) return false; if(typeof sideStop==="function") sideStop(k); const s=snapshotSet(); s.name="SET "+(k+1); setSlots[k]=_cloneSnap(s); if(typeof setSetLevel==="function") setSetLevel(k, setLevels[setCur]); if(typeof scheduleAutosave==="function") scheduleAutosave(); return true; }
// セットを既定のキットに戻す（長押し 2 回）。NOW には使わない
function resetSet(k){ if(!(k>=0&&k<16)||k===setCur) return false; if(typeof sideStop==="function") sideStop(k); setSlots[k]=defaultSetSnapshot(k); if(typeof setSetLevel==="function") setSetLevel(k, 0); if(typeof scheduleAutosave==="function") scheduleAutosave(); return true; }
function setRename(k,name){ const nm=(name||"").trim(); if(!nm||!(k>=0&&k<16)) return; if(!setSlots[k]) setSlots[k]=defaultSetSnapshot(k); setSlots[k].name=nm.slice(0,24); if(typeof scheduleAutosave==="function") scheduleAutosave(); }
function setName(k){ return (setSlots[k]&&setSlots[k].name)||("SET "+(k+1)); }
function setElapsed(){ return (performance.now()-_setStart)/1000; }
