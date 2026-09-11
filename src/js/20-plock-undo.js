// ===== パラメーターロック（p-lock） =====
// 各パラメーターの範囲・既定（ドラッグ初期値）と表示フォーマット
const PLOCKS = {
  pitch:  {min:-12, max:12,   def:0,     color:"61,214,196",  fmt:v=>(v>0?"+":"")+Math.round(v)},                 // 半音
  level:  {min:-30, max:6,    def:-4,    color:"255,93,176",  fmt:v=>Math.round(v)},                              // dB
  filter: {min:200, max:18000,def:12000, log:true, color:"176,124,255", fmt:v=>v>=1000?(v/1000).toFixed(1)+"k":Math.round(v)}, // Hz(LPカットオフ)
  delay:  {min:0,   max:1,    def:0.3,   color:"95,211,95",   fmt:v=>Math.round(v*100)},                          // 送り%
  reverb: {min:0,   max:1,    def:0.3,   color:"90,169,255",  fmt:v=>Math.round(v*100)},                          // 送り%
  nudge:  {min:-50, max:50,   def:0,     color:"255,150,90",  fmt:v=>(v>0?"+":"")+Math.round(v)},                 // 前後タイミング(ms)。-=前ノリ/+=後ノリ
};
function lockKey(pat,bar,step){ return pat+"_"+bar+"_"+step; }
function getLockEdit(trackIdx, step){ const m=tracks[trackIdx].locks; return m && m[lockKey(editPat,editBar,step)]; }
function getLockPlay(trackIdx, pat, bar, step){ const m=tracks[trackIdx].locks; return m && m[lockKey(pat,bar,step)]; }
function setLockEdit(trackIdx, step, param, value){
  const t=tracks[trackIdx]; if(!t.locks) t.locks={};
  const k=lockKey(editPat,editBar,step);
  if(!t.locks[k]) t.locks[k]={};
  t.locks[k][param]=value;
}
function clearLockEdit(trackIdx, step){ const t=tracks[trackIdx]; if(t.locks) delete t.locks[lockKey(editPat,editBar,step)]; }
// 再生座標へp-lockを書く（演奏ライブ記録：再生中のプレイヘッドのステップにオートメーションを焼く）
function setLockPlay(trackIdx, pat, bar, step, param, value){
  const t=tracks[trackIdx]; if(!t.locks) t.locks={};
  const k=lockKey(pat,bar,step);
  if(!t.locks[k]) t.locks[k]={};
  t.locks[k][param]=value;
}
// 小節に音があるか／パターンの長さ（書いた分・最低1小節）
function patLength(p){ let last=0; for(let b=0;b<4;b++) if(barHasContent(p,b)) last=b; return last+1; }

// ===== UNDO（パターン編集＋各種操作を1手ずつ戻す） =====
const undoStack=[];
function snapshotState(){
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
      mute:t.mute,solo:t.solo,name:t.name,buffer:t.buffer,rawBuffer:t.rawBuffer,
      type:PADS[i].type,voice:PADS[i].voice,
      patterns:t.patterns.map(p=>p.map(b=>b.slice())),
      locks:JSON.parse(JSON.stringify(t.locks||{})),
    })),
  };
}
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
  tracks.forEach((t,i)=>{
    const x=s.tracks[i];
    t.vol=x.vol;t.tune=x.tune;t.start=x.start;t.end=x.end;t.loop=x.loop;t.loopStart=x.loopStart;
    t.filter=x.filter;t.cutoff=x.cutoff;t.reso=x.reso;t.choke=x.choke;t.scale=x.scale;t.attack=x.attack;t.fade=x.fade;t.delaySend=x.delaySend;t.reverbSend=x.reverbSend;t.outBus=x.outBus||"A";t.midiNote=x.midiNote??null;t.key=x.key??null;
    t.mute=x.mute;t.solo=x.solo;t.name=x.name;t.buffer=x.buffer;t.rawBuffer=x.rawBuffer;
    PADS[i].type=x.type;PADS[i].voice=x.voice;
    t.patterns=x.patterns;
    t.locks=x.locks?JSON.parse(JSON.stringify(x.locks)):{};
    const nm=padsEl.children[i]&&padsEl.children[i].querySelector(".nm");
    if(nm) nm.textContent=(t.name||PADS[i].name).slice(0,8).toUpperCase();
  });
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
  if(typeof buildAllTrackWaves==="function") buildAllTrackWaves();   // ステップ波形を再キャッシュ（読込/復元時）
}
function pushUndo(){ undoStack.push(snapshotState()); if(undoStack.length>40) undoStack.shift();
  if(typeof scheduleAutosave==="function") scheduleAutosave(); }   // 変更があったら自動保存を予約
function doUndo(){ const s=undoStack.pop(); if(!s) return; restoreState(s); }

// ===== 音階モード（モノ・ベース打ち込み） =====
const SCALES={ maj:[0,2,4,5,7,9,11], min:[0,2,3,5,7,8,10], pent:[0,3,5,7,10] };  // chroは半音=idx
const NOTE_NAMES=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
let melodicMode=false;   // 選択中パッドが音階モードか（SEQ盤面の表示を切替）
function isMelodic(i){ return !!(tracks[i] && tracks[i].scale && tracks[i].scale!=="off"); }
function scaleSemi(sc, idx){ if(sc==="chro"||!SCALES[sc]) return idx; const a=SCALES[sc]; return Math.floor(idx/a.length)*12 + a[idx%a.length]; }
function noteLabel(sc, idx){ const s=scaleSemi(sc,idx); return NOTE_NAMES[((s%12)+12)%12]+Math.floor(s/12); }
function setDrumRowLabels(){ for(let i=0;i<PADS.length;i++){ const rn=grid.children[i]&&grid.children[i].querySelector(".rn"); if(rn) rn.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b> ${tracks[i].name||PADS[i].name}`; } }
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

