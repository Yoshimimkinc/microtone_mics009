// @module plock-undo
// @provides NOTE_NAMES, PLOCKS, SCALES, applyTrackSnapshot, clearLockEdit, clearUndo, dbToGain, doUndo,
//    getLockEdit, isMelodic, lockKey, noteLabel, paintMelodic, patLength, pushUndo, refreshSeqMode,
//    restoreState, scaleSemi, setDrumRowLabels, snapshotState, stripLegacyLocks, undoStack
// @uses PADS, applyFx, applyGroupVol, applyPadCategory, barHasContent, bpmVal, buildAllTrackWaves,
//    compDrive, compMakeup, compOn, compThreshold, displayBar, displayPat, drawAllPadWaves, editBar,
//    editPat, fxDelayAmt, fxDelayOn, fxReverbAmt, fxReverbOn, getPattern, grid, groupVol, makeSatCurve,
//    masterGain, melodicMode, nextChokeGroup, normalizeKeyPhrase, paintMixer, paintPadName, paintPadStates,
//    paintPatBar, paintSteps, patLoad, patRead, patSlot, patSync, playPat, playStep, playing, rowEls,
//    saturator, scheduleAutosave, selectPad, selected, setCompBypass, swingPct, tracks, warmKeyTracks
// @depends -
// ===== パラメーターロック（p-lock） =====
// 各パラメーターの範囲・既定（ドラッグ初期値）と表示フォーマット。LEVEL は v0.3.124 で廃止（音量は EDIT の Level だけ＝単一の真 §135）
const PLOCKS = {
  pitch:  {min:-12, max:12,   def:0,     color:"61,214,196",  fmt:v=>(v>0?"+":"")+Math.round(v)},                 // 半音
  filter: {min:200, max:18000,def:12000, log:true, color:"176,124,255", fmt:v=>Math.round(v)}, // Hz(LPカットオフ)
  delay:  {min:0,   max:1,    def:0.3,   color:"95,211,95",   fmt:v=>Math.round(v*100)},                          // 送り%
  reverb: {min:0,   max:1,    def:0.3,   color:"90,169,255",  fmt:v=>Math.round(v*100)},                          // 送り%
  nudge:  {min:-50, max:50,   def:0,     color:"255,150,90",  fmt:v=>(v>0?"+":"")+Math.round(v)},                 // 前後タイミング(ms)。-=前ノリ/+=後ノリ
};
// 古い .mics に残る廃止済みの P-LOCK（level: v0.3.124）を読み込み時に捨てる。空になったステップは丸ごと消す
function stripLegacyLocks(){ return {}; } // v0.3.171: 古いステップの自動化は再生しない
function lockKey(pat,bar,step){ return pat+"_"+bar+"_"+step; }
function getLockEdit(){ return undefined; } // 旧コピー経路の読込互換。新規ロックは作らない
function clearLockEdit(){ } // ステップ削除との旧契約（保存されるロックは常に空）
// 小節に音があるか／パターンの長さ（書いた分・最低1小節）
function patLength(p){ let last=0; for(let b=0;b<4;b++) if(barHasContent(p,b)) last=b; return last+1; }

// ===== UNDO（パターン編集＋各種操作を1手ずつ戻す） =====
const undoStack=[];
function snapshotState(){
  if(typeof patSync==="function") patSync();   // live のミュートを今のパターンへ書き戻してから（A B C D ごと v0.3.149）
  const km=document.getElementById("kMaster");
  return {
    bpm:(typeof bpmVal!=="undefined"?bpmVal:100),
    swing:(typeof swingPct!=="undefined"?swingPct:50),
    compOn:(typeof compOn!=="undefined"?compOn:true),
    compThreshold:(typeof compThreshold!=="undefined"?compThreshold:-12),
    compDrive:(typeof compDrive!=="undefined"?compDrive:1.5),
    masterVol:(km?+km.value:0),
    editPat, editBar, selected,
    nextChokeGroup:(typeof nextChokeGroup!=="undefined"?nextChokeGroup:2),
    groupVol:(typeof groupVol!=="undefined"?groupVol.slice():[0,0,0,0]),
    fxDelayAmt:(typeof fxDelayAmt!=="undefined"?fxDelayAmt:0),
    fxReverbAmt:(typeof fxReverbAmt!=="undefined"?fxReverbAmt:0),
    fxDelayOn:(typeof fxDelayOn!=="undefined"?fxDelayOn:true),
    fxReverbOn:(typeof fxReverbOn!=="undefined"?fxReverbOn:true),
    tracks: tracks.map((t,i)=>({
      vol:t.vol,tune:t.tune,start:t.start,end:t.end,loop:t.loop,loopStart:t.loopStart,
      filter:t.filter,cutoff:t.cutoff,reso:t.reso,choke:t.choke,scale:t.scale,attack:t.attack,fade:t.fade,delaySend:t.delaySend,reverbSend:t.reverbSend,outBus:t.outBus||"A",midiNote:t.midiNote??null,key:t.key??null,
      mute:t.mute,solo:t.solo,mutes:(t.mutes||[t.mute,t.mute,t.mute,t.mute]).slice(),solos:(t.solos||[t.solo,t.solo,t.solo,t.solo]).slice(),
      patFx:Array.isArray(t.patFx)?t.patFx.map(o=>Object.assign({},o)):null,name:t.name,buffer:t.buffer,rawBuffer:t.rawBuffer,
      type:PADS[i].type,voice:PADS[i].voice,
      _keySignature:t._keySignature||null,padKind:t.padKind||"SPL",keyPhrase:normalizeKeyPhrase(t.keyPhrase),sampleState:t.sampleState?Object.assign({},t.sampleState):null,
      patterns:t.patterns.map(p=>p.map(b=>b.slice())),
      locks:{},
    })),
  };
}
// 1 トラックを snapshotState の形から戻す（undo の復元と、セット切替（data/set）で共用。v0.3.144）
function applyTrackSnapshot(i,x){
  const t=tracks[i];
  t._contentEpoch=(t._contentEpoch||0)+1;t._keySignature=x._keySignature||null;
  t.padKind=x.padKind||"SPL";t.keyPhrase=normalizeKeyPhrase(x.keyPhrase);t.sampleState=x.sampleState?Object.assign({},x.sampleState):null;
  t.vol=x.vol;t.tune=x.tune;t.start=x.start;t.end=x.end;t.loop=x.loop;t.loopStart=x.loopStart;
  t.filter=x.filter;t.cutoff=x.cutoff;t.reso=x.reso;t.choke=x.choke;t.scale=x.scale;t.attack=x.attack;t.fade=x.fade;t.delaySend=x.delaySend;t.reverbSend=x.reverbSend;t.outBus=x.outBus||"A";t.midiNote=x.midiNote??null;t.key=x.key??null;
  t.mutes=Array.isArray(x.mutes)?x.mutes.map(Boolean):[!!x.mute,!!x.mute,!!x.mute,!!x.mute];   // ミュートは A B C D ごと（v0.3.149）。古い snapshot は全パターン同じ
  t.solos=Array.isArray(x.solos)?x.solos.map(Boolean):[!!x.solo,!!x.solo,!!x.solo,!!x.solo];
  t.patFx=Array.isArray(x.patFx)&&x.patFx.length===4 ? x.patFx.map(o=>Object.assign({},o)) : null;   // エフェクトも A B C D ごと（v0.3.150）。無ければ下の patRead が今の値で 4 つ作る
  t.mute=t.mutes[patSlot];t.solo=t.solos[patSlot];t.name=x.name;t.buffer=x.buffer;t.rawBuffer=x.rawBuffer;
  PADS[i].type=x.type;PADS[i].voice=x.voice;PADS[i].name=x.name||PADS[i].name;
  t.patterns=x.patterns.map(p=>p.map(b=>b.slice()));
  t.locks={};
  t.loopPlaying=false;
  if(typeof patRead==="function") patRead(t, patSlot);   // いまのパターンの値を live へ（ミュート / ソロ / エフェクト）
  paintPadName(i);   // パッド名と SEQ 行名（ui/pads-view）
}
function clearUndo(){ undoStack.length=0; }   // セットを切り替えたら（別のセットの状態へ戻すのは事故）
function restoreState(s){
  if(typeof bpmVal!=="undefined") bpmVal=s.bpm;
  if(typeof swingPct!=="undefined") swingPct=s.swing;
  if(typeof compOn!=="undefined") compOn=s.compOn;
  if(typeof compThreshold!=="undefined") compThreshold=s.compThreshold;
  if(typeof compDrive!=="undefined") compDrive=s.compDrive;
  // メイクアップゲインはしきい値から再計算（undoでコンプの音量補償がズレないように）
  if(typeof compMakeup!=="undefined") compMakeup = 1 + Math.abs(compThreshold)/30*0.8;
  editPat=s.editPat; editBar=s.editBar;
  if(typeof nextChokeGroup!=="undefined" && s.nextChokeGroup!==undefined) nextChokeGroup=s.nextChokeGroup;
  tracks.forEach((t,i)=>applyTrackSnapshot(i, s.tracks[i]));
  if(typeof patLoad==="function") patLoad(playing?playPat:editPat, true);   // 戻した editPat のミュートを live へ
  const $=id=>document.getElementById(id);
  if($("bpm")){ $("bpm").value=s.bpm; $("bpmRead").textContent=s.bpm.toFixed(1); }
  if($("swing")) $("swing").value=s.swing;
  if($("compToggle")) $("compToggle").classList.toggle("on",s.compOn);
  if($("kComp")){ $("kComp").value=s.compThreshold; $("vComp").textContent=s.compThreshold; }
  if($("kDrive")){ $("kDrive").value=Math.round(s.compDrive*10); $("vDrive").textContent=s.compDrive.toFixed(1); }
  if(typeof setCompBypass==="function") setCompBypass(s.compOn);
  if(typeof saturator!=="undefined" && typeof makeSatCurve==="function") saturator.curve=makeSatCurve(s.compDrive);
  if($("kMaster") && typeof masterGain!=="undefined"){ $("kMaster").value=s.masterVol; masterGain.gain.value=Math.pow(10,s.masterVol/20); $("vMaster").textContent=s.masterVol+" dB"; }
  if(typeof groupVol!=="undefined" && s.groupVol){ for(let g=0;g<4;g++) groupVol[g]=s.groupVol[g]; if(typeof applyGroupVol==="function") applyGroupVol(); }
  if(s.fxDelayAmt!==undefined){ fxDelayAmt=s.fxDelayAmt; fxReverbAmt=s.fxReverbAmt; fxDelayOn=s.fxDelayOn; fxReverbOn=s.fxReverbOn; if(typeof applyFx==="function") applyFx(); }
  if(typeof selectPad==="function") selectPad(s.selected);   // editor同期＋盤面再描画
  if(typeof paintPadStates==="function") paintPadStates();
  if(typeof paintMixer==="function") paintMixer();
  if(typeof paintPatBar==="function") paintPatBar();
  if(typeof applyPadCategory==="function") for(let i=0;i<PADS.length;i++) applyPadCategory(i);
  if(typeof drawAllPadWaves==="function") drawAllPadWaves();
  if(typeof buildAllTrackWaves==="function") buildAllTrackWaves();
  if(typeof warmKeyTracks==="function") warmKeyTracks();   // ステップ波形を再キャッシュ（読込/復元時）
}
function pushUndo(){ undoStack.push(snapshotState()); if(undoStack.length>40) undoStack.shift();
  if(typeof scheduleAutosave==="function") scheduleAutosave(); }   // 変更があったら自動保存を予約
function doUndo(){ const s=undoStack.pop(); if(!s) return; restoreState(s); }

// ===== 音階モード（モノ・ベース打ち込み） =====
const SCALES={ maj:[0,2,4,5,7,9,11], min:[0,2,3,5,7,8,10], pent:[0,3,5,7,10] };  // chroは半音=idx
const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
function isMelodic(i){ return !!(tracks[i] && tracks[i].scale && tracks[i].scale!=="off"); }
function scaleSemi(sc, idx){ if(sc==="chro"||!SCALES[sc]) return idx; const a=SCALES[sc]; return Math.floor(idx/a.length)*12 + a[idx%a.length]; }
function noteLabel(sc, idx){ const s=scaleSemi(sc,idx); return NOTE_NAMES[((s%12)+12)%12]+Math.floor(s/12); }
function setDrumRowLabels(){ for(let i=0;i<PADS.length;i++) paintPadName(i); }   // メロディ表示（音名）から行名へ戻す
function paintMelodic(){
  const pat=getPattern(selected);
  for(let r=0;r<PADS.length;r++){
    const pitchIdx=(PADS.length-1)-r;   // 下の行ほど低い音
    if(rowEls[r]) rowEls[r].forEach((el,s)=>{
      el.classList.toggle("on", pat[s]===pitchIdx+1);
      el.classList.remove("acc");
      el.classList.toggle("cursor", playing && editPat===displayPat && editBar===displayBar && s===playStep);
    });
    const rn=grid.children[r]&&grid.children[r].querySelector(".rn");
    if(rn) rn.textContent=noteLabel(tracks[selected].scale, pitchIdx);
  }
  [...grid.children].forEach(row=>row.classList.remove("sel"));
}
function refreshSeqMode(){
  melodicMode=isMelodic(selected);
  const banner=document.getElementById("meloBanner");
  if(banner) banner.style.display=melodicMode?"":"none";
  if(!melodicMode) setDrumRowLabels();
  paintSteps();
}

function dbToGain(db){ return Math.pow(10, db/20); }

