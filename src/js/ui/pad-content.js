// @module ui/pad-content
// @provides KEY_SCALES, _keyAudition, _keyAuditionNode, _keyAuditionToken, _keyAutoFit, _keyDeleteSelection,
//    _keyDraft, _keyDragType, _keyDuplicate, _keyEndGesture, _keyFit, _keyFxLabel, _keyGesture, _keyHover,
//    _keyInScale, _keyLow, _keyMidi, _keyMulti, _keyNavigate, _keyPaint, _keyPhrase, _keyPoint,
//    _keyScalePitch, _keySelect, _keySelected, _keySelection, _keySetCursor, _keySnapBeat, _keySound,
//    _keyTarget, _keyUpdate, _keyZoom, _sampleState, keyEditorClose, keyEditorOpen, padKind, setPadKind,
//    syncPadContentEditor
// @uses AC, NOTE_NAMES, PADS, bpmVal, doUndo, masterGain, normalizeKeyPhrase, paintPerf, parseKeyMidi,
//    peTarget, prepareKeyTrack, previewVoiceFrom, pushUndo, refreshPadDisplay, renderKeyPhrase, sampNameEl,
//    scheduleAutosave, scratchClose, stopVoices, tracks
// @depends plock-undo
function padKind(t){ return ['SPL','KEY','SCR'].includes(t.padKind)?t.padKind:'SPL'; }
function _sampleState(t,i){ return {buffer:t.buffer,rawBuffer:t.rawBuffer,start:t.start,end:t.end,loop:t.loop,loopStart:t.loopStart,type:PADS[i].type,voice:PADS[i].voice}; }
async function setPadKind(i,kind){
  if(!['SPL','KEY','SCR'].includes(kind))return;
  const t=tracks[i];if(padKind(t)===kind)return;
  pushUndo();stopVoices(t,AC.currentTime);t.loopPlaying=false;t._contentEpoch=(t._contentEpoch||0)+1;
  if(kind==='KEY'&&padKind(t)!=='KEY')t.sampleState=_sampleState(t,i);
  if(padKind(t)==='KEY'&&kind!=='KEY'&&t.sampleState){Object.assign(t,t.sampleState);PADS[i].type=t.sampleState.type;PADS[i].voice=t.sampleState.voice;}
  t._keySignature=null; // Restoring SPL replaces buffer: never retain a KEY readiness stamp.
  t.padKind=kind;
  if(kind==='KEY'){
    t.keyPhrase=normalizeKeyPhrase(t.keyPhrase);PADS[i].type='sample';PADS[i].voice=null;
    const epoch=t._contentEpoch;sampNameEl.textContent='KEYを生成中…';const ready=await prepareKeyTrack(t,bpmVal);
    if(t._contentEpoch!==epoch||t.padKind!=='KEY')return;
    if(ready)sampNameEl.textContent=t.keyPhrase.notes.length?'KEY · フレーズを演奏できます':'KEY · PIANO ROLLでノートを入力してください';
  }else sampNameEl.textContent=kind==='SCR'?'SCR · パッドを押すとスクラッチ':'SPL · サンプルを再生';
  refreshPadDisplay(i);syncPadContentEditor(i);paintPerf();scheduleAutosave();
}
function syncPadContentEditor(i){
  const kind=padKind(tracks[i]);
  document.getElementById('padEditModal').dataset.padKind=kind;
  document.querySelectorAll('#peKinds button').forEach(b=>b.classList.toggle('on',b.dataset.kind===kind));
  document.getElementById('peKeyOpen').hidden=kind!=='KEY';
  document.querySelectorAll('#pads .pad').forEach((el,j)=>el.dataset.kind=padKind(tracks[j]));
}
let _keyTarget=-1, _keySelected=-1, _keyLow=48, _keyMidi=null;
let _keySelection=new Set(), _keyDraft=null, _keyGesture=null, _keyZoom=128, _keySound=false, _keyAutoFit=true, _keyNavigate=false, _keyMulti=false, _keyAuditionNode=null, _keyAuditionToken=0;
const KEY_SCALES={major:[0,2,4,5,7,9,11],minor:[0,2,3,5,7,8,10],dorian:[0,2,3,5,7,9,10],mixolydian:[0,2,4,5,7,9,10],pentatonic:[0,2,4,7,9],minorPentatonic:[0,3,5,7,10],chromatic:[0,1,2,3,4,5,6,7,8,9,10,11]};
function _keyPhrase(){return _keyDraft||normalizeKeyPhrase(tracks[_keyTarget]?.keyPhrase);}
function _keyInScale(pitch,e){return KEY_SCALES[e.scale].includes(((pitch-e.root)%12+12)%12);}
function _keyScalePitch(pitch,e){pitch=Math.max(21,Math.min(108,Math.round(pitch)));if(!e.scaleEnabled)return pitch;for(let d=0;d<12;d++){if(pitch-d>=21&&_keyInScale(pitch-d,e))return pitch-d;if(pitch+d<=108&&_keyInScale(pitch+d,e))return pitch+d;}return pitch;}
function _keySnapBeat(beat,e,bypass=false){return Math.round(beat*(e.snap&&!bypass?4:96))/(e.snap&&!bypass?4:96);}
function _keySelect(i,extend=false){if(!extend)_keySelection.clear();if(extend&&_keySelection.has(i))_keySelection.delete(i);else _keySelection.add(i);_keySelected=_keySelection.has(i)?i:([..._keySelection].at(-1)??-1);}
function _keyFit(){const box=document.getElementById('keyHorizontal'),bars=_keyPhrase().bars;_keyZoom=Math.max(32,Math.min(384,Math.floor((box.clientWidth-58)/(bars*4))));_keyPaint();}
function keyEditorOpen(i){
  _keyTarget=i;_keySound=false;_keyAutoFit=true;_keySelected=-1;_keySelection.clear();_keyDraft=null;_keyGesture=null;_keyNavigate=false;_keyMulti=false;
  const notes=normalizeKeyPhrase(tracks[i].keyPhrase).notes;_keyLow=notes.length?Math.max(21,Math.min(73,Math.floor((Math.min(...notes.map(n=>n.pitch))-12)/12)*12)):48;
  document.getElementById('keyEditor').hidden=false;document.getElementById('keyExtra').open=window.innerWidth>600;document.getElementById('keyDragMode').value='auto';_keyFit();
  const scroll=document.querySelector('.key-scroll');scroll.scrollTop=Math.max(0,(_keyLow+35-(notes[0]?.pitch||60))*28-scroll.clientHeight/2);document.getElementById('keyHorizontal').scrollLeft=0;
}
function keyEditorClose(){_keyAuditionToken++;_keyGesture=null;_keyDraft=null;_keySelection.clear();document.getElementById('keyEditor').hidden=true;_keyTarget=-1;if(_keyAuditionNode){try{_keyAuditionNode.stop();}catch(_){}_keyAuditionNode=null;}}
function _keyDragType(n,x,pointerType,tool,alt){
  if(tool&&tool!=='auto')return tool;
  const start=58+n.beat*_keyZoom,width=n.length*_keyZoom,edge=Math.min(pointerType==='touch'?14:8,width/3);
  return x>=start+width-edge?'right':x<=start+edge?'left':alt?'velocity':'move';
}
function _keySetCursor(type){
  const tool=document.getElementById('keyDragMode').value||'auto';
  const mode=_keyNavigate?(_keyGesture?'grabbing':'grab'):type||_keyGesture?.type||tool;
  const cursor={auto:'crosshair',draw:'crosshair',move:'move',left:'w-resize',right:'e-resize',velocity:'ns-resize',grab:'grab',grabbing:'grabbing'}[mode]||'crosshair';
  document.getElementById('keyRoll').style.cursor=cursor;return cursor;
}
function _keyHover(e){
  if(_keyTarget<0)return;const pt=_keyPoint(e,e.currentTarget),p=_keyPhrase();
  if(pt.x<58&&!_keyNavigate){_keySetCursor();e.currentTarget.style.cursor='pointer';return;}
  const pitch=_keyLow+35-Math.floor(pt.y/28),beat=(pt.x-58)/_keyZoom;
  for(let i=p.notes.length-1;i>=0;i--){const n=p.notes[i];if(n.pitch===pitch&&beat>=n.beat-3/_keyZoom&&beat<=n.beat+n.length+3/_keyZoom){_keySetCursor(_keyDragType(n,pt.x,e.pointerType,document.getElementById('keyDragMode').value,e.altKey));return;}}
  _keySetCursor();
}
function _keyFxLabel(id,value){const output=document.getElementById(id+'Read');output.textContent=id.endsWith('Depth')?Math.round(value*100)+'%':(+value).toFixed(id==='keyColorRate'?2:1)+' Hz';}
function _keyPaint(){
  if(_keyTarget<0)return;
  const t=tracks[_keyTarget],p=_keyPhrase(),cv=document.getElementById('keyRoll'),c=cv.getContext('2d'),width=Math.round(58+p.bars*4*_keyZoom);
  document.getElementById('keyNotePanel').hidden=_keySound;document.getElementById('keySoundPanel').hidden=!_keySound;
  document.getElementById('keyTabNotes').setAttribute('aria-selected',String(!_keySound));document.getElementById('keyTabSound').setAttribute('aria-selected',String(_keySound));
  for(const [id,prop] of [['keyMotionDepth','motionDepth'],['keyMotionRate','motionRate'],['keyColorDepth','colorDepth'],['keyColorRate','colorRate']]){document.getElementById(id).value=p.effects[prop];_keyFxLabel(id,p.effects[prop]);}
  document.querySelectorAll('[data-key-motion]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.keyMotion===p.effects.motion)));document.querySelectorAll('[data-key-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.keyColor===p.effects.color)));_keySetCursor();
  document.getElementById('keyTitle').textContent='KEY · '+(t.name||'PAD '+(_keyTarget+1));document.getElementById('keyBars').value=p.bars;document.getElementById('keyZoom').value=_keyZoom;
  for(const [id,v] of [['keySnap',p.editor.snap],['keyScaleOn',p.editor.scaleEnabled],['keyNav',_keyNavigate],['keyMulti',_keyMulti]]){const b=document.getElementById(id);b.setAttribute('aria-pressed',String(v));b.textContent=({keySnap:'SNAP 1/16',keyScaleOn:'SCALE',keyNav:'SCROLL',keyMulti:'MULTI'})[id]+(v?' ON':' OFF');}
  document.querySelector('.key-panel').classList.toggle('is-navigating',_keyNavigate);document.getElementById('keyScaleRoot').value=p.editor.root;document.getElementById('keyScaleType').value=p.editor.scale;
  if(cv.width!==width)cv.width=width;if(cv.height!==36*28)cv.height=36*28;
  c.font='11px sans-serif';c.textBaseline='middle';
  for(let row=0;row<36;row++){
    const pitch=_keyLow+35-row,y=row*28,black=[1,3,6,8,10].includes(pitch%12),allowed=_keyInScale(pitch,p.editor);
    c.fillStyle=black?'#a4a9ad':'#bdc1c3';if(p.editor.scaleEnabled)c.fillStyle=allowed?'#b9cac5':'#999ea1';c.fillRect(58,y,width-58,28);
    if(p.editor.scaleEnabled&&pitch%12===p.editor.root){c.fillStyle='#9eb9b2';c.fillRect(58,y,width-58,28);}
    c.strokeStyle='#91989c';c.beginPath();c.moveTo(58,y+27.5);c.lineTo(width,y+27.5);c.stroke();
    c.fillStyle=black?'#333b40':'#e9eae4';c.fillRect(0,y,57,27);c.fillStyle=black?'#f4f5f2':'#263037';c.fillText(NOTE_NAMES[pitch%12]+(Math.floor(pitch/12)-1),6,y+14);
  }
  for(let step=0;step<=p.bars*16;step++){const x=58+step*_keyZoom/4;c.strokeStyle=step%16===0?'#56636b':step%4===0?'#7a858b':'#9da4a8';c.beginPath();c.moveTo(x+.5,0);c.lineTo(x+.5,cv.height);c.stroke();}
  p.notes.forEach((n,j)=>{
    const y=(_keyLow+35-n.pitch)*28;if(y<0||y>=cv.height)return;const x=58+n.beat*_keyZoom,w=Math.max(4,n.length*_keyZoom),selected=_keySelection.has(j);
    c.fillStyle=selected?'#ffb24a':'hsl(168 48% '+(74-n.velocity*.26)+'%)';c.fillRect(x+1,y+3,w-2,22);c.strokeStyle=selected?'#6b3c0f':'#246255';c.strokeRect(x+1.5,y+3.5,Math.max(1,w-3),21);
    c.save();c.beginPath();c.rect(x+2,y+3,Math.max(1,w-4),22);c.clip();c.fillStyle='#122923';if(w>35)c.fillText(NOTE_NAMES[n.pitch%12]+(Math.floor(n.pitch/12)-1),x+7,y+14);c.restore();
    if(selected&&w>14){c.fillStyle='#68451c';c.fillRect(x+4,y+8,2,12);c.fillRect(x+w-6,y+8,2,12);}
  });
  const ruler=document.getElementById('keyRuler');if(ruler.width!==width)ruler.width=width;if(ruler.height!==28)ruler.height=28;const rc=ruler.getContext('2d');rc.fillStyle='#67747b';rc.fillRect(0,0,width,28);rc.font='11px sans-serif';rc.fillStyle='#fff';rc.fillText('4/4',10,18);for(let b=0;b<p.bars*4;b++){const x=58+b*_keyZoom;rc.fillText((Math.floor(b/4)+1)+'.'+(b%4+1),x+5,18);}
  const vel=document.getElementById('keyVelocityRoll');if(vel.width!==width)vel.width=width;if(vel.height!==100)vel.height=100;const vc=vel.getContext('2d');vc.fillStyle='#bdc1c3';vc.fillRect(0,0,width,100);vc.font='10px sans-serif';vc.fillStyle='#334049';vc.fillText('VEL',9,17);vc.fillText('127',9,31);vc.fillText('1',18,90);vc.strokeStyle='#929a9f';for(const y of [16,88]){vc.beginPath();vc.moveTo(58,y+.5);vc.lineTo(width,y+.5);vc.stroke();}
  const drawVelocity=(n,j)=>{const x=58+n.beat*_keyZoom,y=88-(n.velocity-1)/126*72,sel=_keySelection.has(j);vc.strokeStyle=sel?'#9a5514':'#246d61';vc.lineWidth=sel?3:2;vc.beginPath();vc.moveTo(x,88);vc.lineTo(x,y);vc.stroke();vc.fillStyle=sel?'#ffb24a':'#318775';vc.beginPath();vc.arc(x,y,sel?5:4,0,Math.PI*2);vc.fill();if(sel){vc.fillStyle='#243138';vc.fillText(n.velocity,x+7,Math.max(12,y+3));}};
  p.notes.forEach((n,j)=>{if(!_keySelection.has(j))drawVelocity(n,j);});p.notes.forEach((n,j)=>{if(_keySelection.has(j))drawVelocity(n,j);});
  const n=p.notes[_keySelected],fields={keyPitch:n?.pitch??60,keyBeat:n?.beat??0,keyLength:n?.length??0.25,keyVelocity:n?.velocity??96};
  for(const [id,v] of Object.entries(fields)){const el=document.getElementById(id);el.value=typeof v==='number'?+v.toFixed(4):v;el.disabled=!n;}
  document.getElementById('keyDelete').disabled=!_keySelection.size;document.getElementById('keyDuplicate').disabled=!_keySelection.size;
  document.getElementById('keySelectionInfo').textContent=n?(_keySelection.size>1?_keySelection.size+' NOTES · ':'')+NOTE_NAMES[n.pitch%12]+(Math.floor(n.pitch/12)-1)+' · '+n.length.toFixed(2)+' beats · VEL '+n.velocity:'ノートを追加';
}
async function _keyUpdate(change){
  if(_keyTarget<0)return;const i=_keyTarget,t=tracks[i],epoch=t._contentEpoch||0;
  const before=normalizeKeyPhrase(t.keyPhrase),p=normalizeKeyPhrase(t.keyPhrase);change(p);const next=normalizeKeyPhrase(p);
  if(JSON.stringify(before)===JSON.stringify(next)){_keyPaint();return;}
  pushUndo();t.keyPhrase=next;_keyPaint();scheduleAutosave();
  const status=document.getElementById('keyStatus');status.textContent='音声を生成中…';
  try{const result=await prepareKeyTrack(t,bpmVal);if(result&&(t._contentEpoch||0)===epoch){refreshPadDisplay(i);if(_keyTarget===i)status.textContent='TINE MODEL · 再生できます';}}
  catch(e){if(_keyTarget===i)status.textContent='生成失敗：'+e.message;}
}
async function _keyAudition(pitch,velocity=96){
  if(_keyTarget<0)return;const target=_keyTarget,token=++_keyAuditionToken;try{await AC.resume();const buffer=await renderKeyPhrase({bars:1,notes:[{pitch,beat:0,length:.5,velocity}],effects:_keyPhrase().effects},bpmVal);if(_keyTarget!==target||token!==_keyAuditionToken)return;if(_keyAuditionNode){try{_keyAuditionNode.stop();}catch(_){}}const node=AC.createBufferSource(),gain=AC.createGain();gain.gain.value=.65;node.buffer=buffer;node.connect(gain);gain.connect(masterGain);node.onended=()=>{node.disconnect();gain.disconnect();if(_keyAuditionNode===node)_keyAuditionNode=null;};node.start();_keyAuditionNode=node;}catch(e){document.getElementById('keyStatus').textContent=e.message;}
}
function _keyPoint(e,canvas){const r=canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*canvas.width/r.width,y:(e.clientY-r.top)*canvas.height/r.height};}
function _keyEndGesture(cancel=false){
  const g=_keyGesture;if(!g)return;_keyGesture=null;const next=_keyDraft;_keyDraft=null;
  if(!cancel&&next&&g.target===_keyTarget&&tracks[_keyTarget]===g.track&&(g.track._contentEpoch||0)===g.epoch)_keyUpdate(p=>Object.assign(p,next));else _keyPaint();
}
function _keyDuplicate(){if(!_keySelection.size)return;_keyUpdate(p=>{const selected=[..._keySelection].sort((a,b)=>a-b).map(i=>p.notes[i]),offset=Math.max(...selected.map(n=>n.beat+n.length))-Math.min(...selected.map(n=>n.beat)),end=p.bars*4;if(p.notes.length+selected.length>512||selected.some(n=>n.beat+offset+n.length>end)){document.getElementById('keyStatus').textContent='複製先が小節の範囲外か、512ノートの上限です';return;}_keySelection.clear();for(const n of selected){_keySelection.add(p.notes.length);p.notes.push({...n,beat:n.beat+offset});}_keySelected=[..._keySelection][0];});}
function _keyDeleteSelection(){if(!_keySelection.size)return;_keyUpdate(p=>{p.notes=p.notes.filter((_,i)=>!_keySelection.has(i));_keySelection.clear();_keySelected=-1;});}
(function(){
  const root=document.getElementById('keyScaleRoot');NOTE_NAMES.forEach((name,i)=>{const opt=document.createElement('option');opt.value=i;opt.textContent=name;root.appendChild(opt);});
  document.getElementById('keyTabNotes').addEventListener('click',()=>{_keyEndGesture(true);_keySound=false;_keyPaint();if(_keyAutoFit)_keyFit();});
  document.getElementById('keyTabSound').addEventListener('click',()=>{_keyEndGesture(true);_keySound=true;_keyPaint();});
  document.querySelectorAll('[data-key-motion]').forEach(b=>b.addEventListener('click',()=>_keyUpdate(p=>p.effects.motion=b.dataset.keyMotion)));
  document.querySelectorAll('[data-key-color]').forEach(b=>b.addEventListener('click',()=>_keyUpdate(p=>p.effects.color=b.dataset.keyColor)));
  for(const [id,prop] of [['keyMotionDepth','motionDepth'],['keyMotionRate','motionRate'],['keyColorDepth','colorDepth'],['keyColorRate','colorRate']]){
    const control=document.getElementById(id);control.addEventListener('input',e=>_keyFxLabel(id,+e.target.value));control.addEventListener('change',e=>_keyUpdate(p=>p.effects[prop]=+e.target.value));
  }
  document.getElementById('peKinds').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(b)setPadKind(peTarget,b.dataset.kind).catch(e=>sampNameEl.textContent=e.message);});
  document.getElementById('peKeyOpen').addEventListener('click',()=>keyEditorOpen(peTarget));
  document.getElementById('keyClose').addEventListener('click',keyEditorClose);
  document.getElementById('keyUndo').addEventListener('click',()=>{_keyEndGesture(true);doUndo();_keySelection.clear();_keySelected=-1;if(_keyTarget>=0&&padKind(tracks[_keyTarget])==='KEY')_keyPaint();else keyEditorClose();});
  document.getElementById('keyPreview').addEventListener('click',async()=>{if(_keyTarget<0)return;const i=_keyTarget;await AC.resume();await prepareKeyTrack(tracks[i],bpmVal);if(_keyTarget===i)previewVoiceFrom(i,null);});
  document.getElementById('keyBars').addEventListener('change',e=>{const bars=Math.max(1,Math.min(4,+e.target.value||1));if(_keyTarget<0)return;const p=_keyPhrase();if(p.notes.some(n=>n.beat+n.length>bars*4)&&!confirm('小節数を減らすと範囲外の音が切り詰められます。続けますか？')){_keyPaint();return;}_keyUpdate(p=>{p.bars=bars;_keySelection.clear();_keySelected=-1;});});
  document.getElementById('keyDelete').addEventListener('click',_keyDeleteSelection);document.getElementById('keyDuplicate').addEventListener('click',_keyDuplicate);
  document.getElementById('keySelectAll').addEventListener('click',()=>{_keySelection=new Set(_keyPhrase().notes.map((_,i)=>i));_keySelected=[..._keySelection][0]??-1;_keyPaint();});
  document.getElementById('keyNav').addEventListener('click',()=>{_keyEndGesture(true);_keyNavigate=!_keyNavigate;_keyPaint();});document.getElementById('keyMulti').addEventListener('click',()=>{_keyMulti=!_keyMulti;_keyPaint();});
  document.getElementById('keySnap').addEventListener('click',()=>_keyUpdate(p=>p.editor.snap=!p.editor.snap));
  document.getElementById('keyScaleOn').addEventListener('click',()=>_keyUpdate(p=>p.editor.scaleEnabled=!p.editor.scaleEnabled));
  root.addEventListener('change',e=>_keyUpdate(p=>p.editor.root=+e.target.value));document.getElementById('keyScaleType').addEventListener('change',e=>_keyUpdate(p=>p.editor.scale=e.target.value));
  for(const [id,prop] of [['keyPitch','pitch'],['keyBeat','beat'],['keyLength','length'],['keyVelocity','velocity']])document.getElementById(id).addEventListener('change',e=>_keyUpdate(p=>{const n=p.notes[_keySelected];if(!n)return;const value=+e.target.value;if(!Number.isFinite(value))return;n[prop]=prop==='pitch'?_keyScalePitch(value,p.editor):value;}));
  document.getElementById('keyOctaveDown').addEventListener('click',()=>{_keyLow=Math.max(21,_keyLow-12);_keyPaint();});document.getElementById('keyOctaveUp').addEventListener('click',()=>{_keyLow=Math.min(73,_keyLow+12);_keyPaint();});
  document.getElementById('keyDragMode').addEventListener('change',()=>{_keyEndGesture(true);_keySetCursor();document.getElementById('keyStatus').textContent='DRAG · '+document.getElementById('keyDragMode').value;});
  document.getElementById('keyZoom').addEventListener('input',e=>{_keyAutoFit=false;_keyZoom=+e.target.value;_keyPaint();});document.getElementById('keyFit').addEventListener('click',()=>{_keyAutoFit=true;_keyFit();});
  window.addEventListener('resize',()=>{if(_keyTarget>=0&&_keyAutoFit)_keyFit();});
  const roll=document.getElementById('keyRoll'),velocity=document.getElementById('keyVelocityRoll');
  function begin(e,isVelocity){
    if(_keyTarget<0||_keyNavigate||e.button>0||_keyGesture)return;
    const canvas=e.currentTarget,point=_keyPoint(e,canvas),p=_keyPhrase(),beat=(point.x-58)/_keyZoom,pitch=_keyLow+35-Math.floor(point.y/28);
    if(point.x<58){if(!isVelocity)_keyAudition(pitch);return;}e.preventDefault();canvas.focus({preventScroll:true});
    let index=-1,type='move';
    if(isVelocity){let best=20;for(let i=p.notes.length-1;i>=0;i--){const n=p.notes[i],dx=Math.abs((n.beat-beat)*_keyZoom),dy=Math.abs(88-(n.velocity-1)/126*72-point.y),distance=Math.hypot(dx,dy*.2);if(dx<14&&distance<best){index=i;best=distance;}}type='velocity';if(index<0)return;}
    else{for(let i=p.notes.length-1;i>=0;i--){const n=p.notes[i];if(n.pitch===pitch&&beat>=n.beat-3/_keyZoom&&beat<=n.beat+n.length+3/_keyZoom){index=i;break;}}}
    if(index>=0){
      if(e.shiftKey||_keyMulti){_keySelect(index,true);_keyPaint();if(!_keySelection.has(index))return;}
      else if(!_keySelection.has(index))_keySelect(index);else _keySelected=index;
      if(!isVelocity){const n=p.notes[index],x=58+n.beat*_keyZoom,w=n.length*_keyZoom,edge=Math.min(e.pointerType==='touch'?14:8,w/3);type=_keyDragType(n,point.x,e.pointerType,document.getElementById('keyDragMode').value,e.altKey);}
    }else{
      if(_keyMulti||e.shiftKey){_keySelection.clear();_keySelected=-1;_keyPaint();return;}
      if(p.notes.length>=512||beat<0||beat>=p.bars*4)return;
      const start=Math.max(0,Math.min(p.bars*4-1/96,_keySnapBeat(beat,p.editor,e.metaKey))),note={pitch:_keyScalePitch(pitch,p.editor),beat:start,length:Math.min(.25,p.bars*4-start),velocity:96};
      index=p.notes.length;p.notes.push(note);_keySelect(index);type='draw';
    }
    _keyDraft=p;_keyGesture={id:e.pointerId,target:_keyTarget,track:tracks[_keyTarget],epoch:tracks[_keyTarget]._contentEpoch||0,canvas,index,type,x:e.clientX,y:e.clientY,point,before:normalizeKeyPhrase(p),moved:false};canvas.setPointerCapture(e.pointerId);_keyPaint();if(!isVelocity)_keyAudition(p.notes[index].pitch,p.notes[index].velocity);
  }
  function move(e){const g=_keyGesture;if(!g){if(e.currentTarget===roll)_keyHover(e);return;}if(g.id!==e.pointerId)return;e.preventDefault();const pt=_keyPoint(e,g.canvas),dx=pt.x-g.point.x,dy=pt.y-g.point.y;if(Math.hypot(e.clientX-g.x,e.clientY-g.y)<3&&!g.moved)return;g.moved=true;
    const p=normalizeKeyPhrase(g.before),n=p.notes[g.index],end=p.bars*4,ids=[..._keySelection],bypass=e.metaKey;
    if(g.type==='move'){
      let delta=_keySnapBeat(n.beat+dx/_keyZoom,p.editor,bypass)-n.beat;delta=Math.max(-Math.min(...ids.map(i=>p.notes[i].beat)),Math.min(delta,end-Math.max(...ids.map(i=>p.notes[i].beat+p.notes[i].length))));
      let transpose=_keyScalePitch(n.pitch-Math.round(dy/28),p.editor)-n.pitch;transpose=Math.max(21-Math.min(...ids.map(i=>p.notes[i].pitch)),Math.min(transpose,108-Math.max(...ids.map(i=>p.notes[i].pitch))));
      ids.forEach(i=>{p.notes[i].beat+=delta;p.notes[i].pitch=_keyScalePitch(p.notes[i].pitch+transpose,p.editor);});
    }else if(g.type==='right'||g.type==='draw'){
      const desired=_keySnapBeat(n.beat+n.length+dx/_keyZoom,p.editor,bypass),delta=desired-n.beat-n.length,group=g.type==='draw'?[g.index]:ids;
      const d=Math.max(Math.max(...group.map(i=>1/96-p.notes[i].length)),Math.min(delta,Math.min(...group.map(i=>end-p.notes[i].beat-p.notes[i].length))));group.forEach(i=>p.notes[i].length+=d);
    }else if(g.type==='left'){
      const desired=_keySnapBeat(n.beat+dx/_keyZoom,p.editor,bypass),delta=desired-n.beat,d=Math.max(-Math.min(...ids.map(i=>p.notes[i].beat)),Math.min(delta,Math.min(...ids.map(i=>p.notes[i].length-1/96))));ids.forEach(i=>{p.notes[i].beat+=d;p.notes[i].length-=d;});
    }else if(g.type==='velocity'){
      let delta=Math.round(-dy*127/(g.canvas===velocity?72:160));delta=Math.max(1-Math.min(...ids.map(i=>p.notes[i].velocity)),Math.min(delta,127-Math.max(...ids.map(i=>p.notes[i].velocity))));ids.forEach(i=>p.notes[i].velocity+=delta);
    }
    _keyDraft=normalizeKeyPhrase(p);_keyPaint();
    const scroll=document.querySelector('.key-scroll'),r=scroll.getBoundingClientRect(),h=document.getElementById('keyHorizontal'),hr=h.getBoundingClientRect();if(g.canvas===roll){if(e.clientY<r.top+24)scroll.scrollTop-=14;else if(e.clientY>r.bottom-24)scroll.scrollTop+=14;}if(e.clientX>hr.right-24)h.scrollLeft+=12;else if(e.clientX<hr.left+80)h.scrollLeft-=12;
  }
  for(const canvas of [roll,velocity]){canvas.addEventListener('pointerdown',e=>begin(e,canvas===velocity));canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',e=>{if(_keyGesture?.id===e.pointerId)_keyEndGesture();});canvas.addEventListener('pointercancel',()=>_keyEndGesture(true));canvas.addEventListener('lostpointercapture',()=>_keyEndGesture(true));}
  roll.addEventListener('dblclick',e=>{if(_keyNavigate||_keyTarget<0)return;const pt=_keyPoint(e,roll),pitch=_keyLow+35-Math.floor(pt.y/28),beat=(pt.x-58)/_keyZoom,p=_keyPhrase();const i=p.notes.findIndex(n=>n.pitch===pitch&&beat>=n.beat&&beat<n.beat+n.length);if(i>=0){_keySelect(i);_keyDeleteSelection();}});
  document.getElementById('keyMidiFile').addEventListener('change',async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;const target=_keyTarget;
    try{const midi=parseKeyMidi(await f.arrayBuffer());if(target!==_keyTarget)return;_keyMidi=midi;const list=document.getElementById('keyMidiTracks');list.replaceChildren();midi.tracks.forEach(t=>{const b=document.createElement('button');b.textContent=t.name;b.addEventListener('click',()=>_keyUpdate(p=>{const editor=p.editor;Object.assign(p,t.phrase);p.editor=editor;_keySelection.clear();_keySelected=-1;}));list.appendChild(b);});document.getElementById('keyStatus').textContent=midi.warnings.join(' / ')+' — 取り込むトラックを選択';}
    catch(e){document.getElementById('keyStatus').textContent=e.message;}
  });
  window.addEventListener('keydown',e=>{
    if(e.key==='Escape'){_keyEndGesture(true);keyEditorClose();scratchClose();return;}
    if(_keyTarget<0||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    const command=e.ctrlKey||e.metaKey;
    if(command&&e.key.toLowerCase()==='a'){e.preventDefault();e.stopImmediatePropagation();document.getElementById('keySelectAll').click();}
    else if(command&&e.key.toLowerCase()==='d'){e.preventDefault();e.stopImmediatePropagation();_keyDuplicate();}
    else if(command&&e.key.toLowerCase()==='z'){e.preventDefault();e.stopImmediatePropagation();document.getElementById('keyUndo').click();}
    else if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();e.stopImmediatePropagation();_keyDeleteSelection();}
    else if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)&&_keySelection.size){e.preventDefault();e.stopImmediatePropagation();_keyUpdate(p=>{const ids=[..._keySelection],step=p.editor.snap?.25:1/96;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){let d=e.key==='ArrowLeft'?-step:step;d=Math.max(-Math.min(...ids.map(i=>p.notes[i].beat)),Math.min(d,p.bars*4-Math.max(...ids.map(i=>p.notes[i].beat+p.notes[i].length))));ids.forEach(i=>p.notes[i].beat+=d);}else{const d=e.key==='ArrowUp'?1:-1;ids.forEach(i=>{const n=p.notes[i];if(command)n.velocity=Math.max(1,Math.min(127,n.velocity+d));else{let pitch=n.pitch+(e.shiftKey?12:d);if(e.shiftKey&&d<0)pitch=n.pitch-12;if(p.editor.scaleEnabled&&!e.shiftKey){while(pitch>21&&pitch<108&&!_keyInScale(pitch,p.editor))pitch+=d;}n.pitch=_keyScalePitch(pitch,p.editor);}});}});}
    // Do not let the sampler's global keyboard bindings play pads while editing.
    else if(!command)e.stopImmediatePropagation();
  },true);
})();
