// @module ui/key-entry
// @provides _keyAllNotesOff, _keyBeatSec, _keyChopMode, _keyChopPaint, _keyChopPlan, _keyClick,
//    _keyEntryPaint, _keyGridBeat, _keyLive, _keyLiveBuffer, _keyLiveCache, _keyLoop, _keyLoopBeat,
//    _keyLoopStart, _keyLoopStop, _keyLoopTick, _keyMorePaint, _keyMoreTab, _keyMoreTabSet, _keyNativeSet,
//    _keyNoteName, _keyNoteOff, _keyNoteOn, _keyPadLow, _keyPadPitches, _keyPadRoot, _keyPadsLit,
//    _keyPlayheadFrame, _keyPref, _keyPutNote, _keyRecCommit, _keyRecOn, _keySetPref, _keyStepAt,
//    _keyStepHeld, _keyStepMove, _keyStepOn, _keyStepPut, _keyWarmPads, keyApplyPreset, keyChop,
//    keyChopBeats, keyEntryClose, keyEntryOpen
// @uses AC, KEYMAP, KEY_PRESETS, NOTE_NAMES, _keyBuffers, _keyGesture, _keyInScale, _keyMoreShow,
//    _keyPhrase, _keyPoint, _keySelected, _keySelection, _keySound, _keyTarget, _keyUpdate, _keyZoom,
//    bpmVal, chopKeyToPads, keyApplyEffects, keyEditorClose, keyPresetPhrase, keyTineNote, masterGain,
//    padKind, paintPerf, prepareKeyTrack, pushUndo, refreshPadDisplay, sampNameEl, scheduleAutosave,
//    selectPad, stopVoices, syncPadContentEditor, tracks, wakeSync
// @depends data/key-presets, plock-undo
// v0.3.205 §194（A）：KEY を弾いて入れる。スケールの鍵盤 4×4（左下が一番低い・スケールの音だけ）、
// PLAY＝ループ再生とプレイヘッド、REC＝ループしながら弾いた音を記録（クリック付き・SNAP の細かさに揃える）、
// STEP＝鍵盤を押すたびにカーソルの位置へ 1/16 の音を入れ、全部離したら 1 マス進む（同時に押せば和音）。
let _keyPadLow=48, _keyPadRoot=0, _keyLoop=null, _keyRecOn=false, _keyStepOn=false, _keyStepAt=0, _keyStepHeld=0;
const _keyLive=new Map(), _keyLiveCache=new Map();
function _keyPadPitches(){
  const e=_keyPhrase().editor,out=[];
  for(let p=_keyPadLow;out.length<16&&p<=108;p++)if(!e.scaleEnabled||_keyInScale(p,e))out.push(p);
  return out;
}
function _keyNoteName(p){return NOTE_NAMES[p%12]+(Math.floor(p/12)-1);}
function _keyPref(name,def){try{const v=localStorage.getItem('mics.key'+name);return v===null?def:v==='1';}catch(_){return def;}}
function _keySetPref(name,on){try{localStorage.setItem('mics.key'+name,on?'1':'0');}catch(_){}}
// 鍵盤の 1 音（試し弾き）：エレピの物理モデルをその場で 1 音だけ作り（2.5 秒押さえた形・1 音 30ms ほど）、押している間鳴らす。
// 鍵盤の 16 音は開いた時に少しずつ先に作っておく（押した瞬間に作らない）
function _keyLiveBuffer(pitch,velocity){
  const fx=_keyPhrase().effects,key=pitch+'|'+velocity+'|'+JSON.stringify(fx);
  if(_keyLiveCache.has(key))return _keyLiveCache.get(key);
  const rate=26000,data=keyApplyEffects(keyTineNote(pitch,velocity,2.5,rate),rate,fx),buffer=AC.createBuffer(1,data.length,rate);
  buffer.getChannelData(0).set(data);_keyLiveCache.set(key,buffer);
  while(_keyLiveCache.size>48)_keyLiveCache.delete(_keyLiveCache.keys().next().value);
  return buffer;
}
function _keyWarmPads(){const list=_keyPadPitches();let k=0;const next=()=>{if(_keyTarget<0||k>=list.length)return;_keyLiveBuffer(list[k++],96);setTimeout(next,20);};setTimeout(next,60);}
function _keyBeatSec(){return 60/Math.max(40,Math.min(250,+bpmVal||100));}
function _keyGridBeat(){return _keyPhrase().editor.snap?.25:1/96;}
// ループの中の今の拍。耳に届く遅れ（出力の遅れ）だけ前に戻す＝聞こえた拍に合わせて弾いた所に入る
function _keyLoopBeat(){
  const L=_keyLoop;if(!L)return 0;const lat=Math.min(.2,(AC.outputLatency||0)+(AC.baseLatency||0));
  const b=(AC.currentTime-lat-L.t0)/_keyBeatSec();return ((b%L.beats)+L.beats)%L.beats;
}
function _keyNoteOn(pitch,id,velocity=96){
  if(_keyTarget<0||_keyLive.has(id))return;
  try{AC.resume();}catch(_){}
  const src=AC.createBufferSource(),gain=AC.createGain();src.buffer=_keyLiveBuffer(pitch,velocity);gain.gain.value=.27;src.connect(gain);gain.connect(masterGain);src.start();
  const v={pitch,velocity,src,gain,beat:_keyRecOn&&_keyLoop?_keyLoopBeat():null,step:_keyStepOn};
  _keyLive.set(id,v);
  if(v.step){_keyStepHeld++;_keyStepPut(pitch,velocity);}
  _keyPadsLit();
}
function _keyNoteOff(id){
  const v=_keyLive.get(id);if(!v)return;_keyLive.delete(id);
  const now=AC.currentTime;try{v.gain.gain.setTargetAtTime(0,now,.03);v.src.stop(now+.25);}catch(_){}
  if(v.beat!==null&&_keyLoop)_keyRecCommit(v);
  if(v.step){_keyStepHeld=Math.max(0,_keyStepHeld-1);if(!_keyStepHeld)_keyStepMove(1);}
  _keyPadsLit();
}
function _keyAllNotesOff(){for(const id of [..._keyLive.keys()])_keyNoteOff(id);_keyStepHeld=0;}
// 同じ高さ・同じ位置の音は置き換える（重ねない）
function _keyPutNote(p,note){
  const i=p.notes.findIndex(n=>n.pitch===note.pitch&&Math.abs(n.beat-note.beat)<1/192);
  if(i>=0)p.notes[i]=note;else if(p.notes.length<512)p.notes.push(note);
}
function _keyRecCommit(v){
  const beats=_keyLoop.beats,q=_keyGridBeat();let length=_keyLoopBeat()-v.beat;if(length<0)length+=beats;
  let beat=Math.round(v.beat/q)*q;if(beat>=beats-1e-9)beat=0;
  length=Math.max(q,Math.round(length/q)*q);
  _keyUpdate(p=>_keyPutNote(p,{pitch:v.pitch,beat,length:Math.min(length,p.bars*4-beat),velocity:v.velocity}));
}
function _keyStepPut(pitch,velocity){
  _keyUpdate(p=>{const end=p.bars*4;if(_keyStepAt>=end)_keyStepAt=0;_keyPutNote(p,{pitch,beat:_keyStepAt,length:Math.min(.25,end-_keyStepAt),velocity});});
}
function _keyStepMove(dir){
  const end=_keyPhrase().bars*4;_keyStepAt=((_keyStepAt+dir*.25)%end+end)%end;_keyEntryPaint();
  const h=document.getElementById('keyHorizontal'),x=58+_keyStepAt*_keyZoom;
  if(x>h.scrollLeft+h.clientWidth-40||x<h.scrollLeft+58)h.scrollLeft=Math.max(0,x-58);
}
// ループ再生：拍の時計から先読みで並べる（KEY の音は小節ぶん＋余韻なので、次の周と少し重なって自然に響く）
function _keyClick(when,accent){
  const o=AC.createOscillator(),g=AC.createGain();o.frequency.value=accent?1760:1320;g.gain.setValueAtTime(accent?.22:.12,when);g.gain.exponentialRampToValueAtTime(.0005,when+.04);
  o.connect(g);g.connect(masterGain);o.start(when);o.stop(when+.05);o.onended=()=>{o.disconnect();g.disconnect();};
}
function _keyLoopTick(){
  const L=_keyLoop;if(!L)return;
  if(_keyTarget!==L.target){_keyLoopStop();return;}
  const beats=_keyPhrase().bars*4;if(beats!==L.beats||Math.abs(beats*_keyBeatSec()-L.len)>1e-6){_keyLoopStop(true);_keyLoopStart();return;}
  const now=AC.currentTime,ahead=now+.12,bs=_keyBeatSec();
  while(L.t0+L.next*L.len<ahead){
    const when=L.t0+L.next*L.len,t=tracks[L.target],buf=t&&_keyBuffers.has(t.buffer)?t.buffer:null;
    if(buf&&when>=now-.01){const s=AC.createBufferSource();s.buffer=buf;s.connect(L.out);s.start(Math.max(when,now));L.nodes.add(s);s.onended=()=>{s.disconnect();L.nodes.delete(s);};}
    L.next++;
  }
  while(L.t0+L.click*bs<ahead){const when=L.t0+L.click*bs;if(_keyRecOn&&when>=now-.01)_keyClick(when,L.click%4===0);L.click++;}
}
function _keyPlayheadFrame(){
  const L=_keyLoop,ph=document.getElementById('keyPlayhead');if(!L){ph.hidden=true;return;}
  const x=58+_keyLoopBeat()*_keyZoom;ph.hidden=false;ph.style.transform='translateX('+x+'px)';
  const h=document.getElementById('keyHorizontal');if(!_keyGesture&&(x>h.scrollLeft+h.clientWidth-24||x<h.scrollLeft+58))h.scrollLeft=Math.max(0,x-58);
  L.raf=requestAnimationFrame(_keyPlayheadFrame);
}
async function _keyLoopStart(){
  if(_keyTarget<0||_keyLoop)return;const i=_keyTarget;
  try{await AC.resume();await prepareKeyTrack(tracks[i],bpmVal);}catch(e){document.getElementById('keyStatus').textContent=e.message;}
  if(_keyTarget!==i||_keyLoop)return;
  const out=AC.createGain();out.gain.value=1;out.connect(masterGain);
  const beats=_keyPhrase().bars*4;
  _keyLoop={target:i,t0:AC.currentTime+.06,beats,len:beats*_keyBeatSec(),out,next:0,click:0,nodes:new Set(),timer:0,raf:0};
  _keyLoopTick();_keyLoop.timer=setInterval(_keyLoopTick,25);_keyLoop.raf=requestAnimationFrame(_keyPlayheadFrame);_keyEntryPaint();
  if(typeof wakeSync==='function')wakeSync();   // ループ中も画面をスリープさせない（v0.3.209）
}
function _keyLoopStop(keepRec=false){
  const L=_keyLoop;if(!L)return;_keyLoop=null;clearInterval(L.timer);cancelAnimationFrame(L.raf);
  const now=AC.currentTime;try{L.out.gain.setTargetAtTime(0,now,.02);}catch(_){}
  for(const s of L.nodes){try{s.stop(now+.12);}catch(_){}}setTimeout(()=>{try{L.out.disconnect();}catch(_){}},200);
  if(!keepRec)_keyRecOn=false;document.getElementById('keyPlayhead').hidden=true;_keyEntryPaint();
}
function _keyEntryPaint(){
  if(_keyTarget<0)return;
  const e=_keyPhrase().editor;
  if(e.root!==_keyPadRoot){_keyPadLow+=e.root-_keyPadRoot;_keyPadRoot=e.root;}
  for(const [id,on,label] of [['keyPreview',!!_keyLoop,_keyLoop?'■ STOP':'▶ PLAY'],['keyRec',_keyRecOn,'● REC'],['keyStep',_keyStepOn,'STEP']]){const b=document.getElementById(id);b.setAttribute('aria-pressed',String(on));b.textContent=label;}
  document.getElementById('keyRec').classList.toggle('rec',_keyRecOn);
  const pads=_keyPadPitches(),grid=document.getElementById('keyPadGrid');
  if(grid.children.length!==16)for(let d=0;d<16;d++){const b=document.createElement('button');b.type='button';b.className='key-pad';b.dataset.slot=d;grid.appendChild(b);}
  [...grid.children].forEach((b,d)=>{const k=(3-Math.floor(d/4))*4+d%4,p=pads[k];b.dataset.pitch=p??'';b.textContent=p===undefined?'':_keyNoteName(p);b.disabled=p===undefined;b.classList.toggle('root',p!==undefined&&e.scaleEnabled&&p%12===e.root);});
  document.getElementById('keyPadsRange').textContent=pads.length?_keyNoteName(pads[0])+'–'+_keyNoteName(pads.at(-1))+(e.scaleEnabled?' · '+NOTE_NAMES[e.root]+' '+document.querySelector('#keyScaleType option[value="'+e.scale+'"]')?.textContent:''):'';
  document.getElementById('keyPads').classList.toggle('stepping',_keyStepOn);
  const cur=document.getElementById('keyStepCursor');cur.hidden=!_keyStepOn;cur.style.transform='translateX('+(58+_keyStepAt*_keyZoom)+'px)';cur.style.width=Math.max(3,_keyZoom/4)+'px';
  _keyPadsLit();_keyMorePaint();
}
// v0.3.210 §199：MORE のページ（CHORDS / KEY・SCALE / EDIT / VIEW）。最後に開いたページを端末ごとに覚える。押されている物＝いまの値
let _keyMoreTab=(()=>{try{return localStorage.getItem('mics.keyMoreTab')||'chords';}catch(_){return 'chords';}})();
function _keyMoreTabSet(tab){_keyMoreTab=tab;try{localStorage.setItem('mics.keyMoreTab',tab);}catch(_){}_keyMorePaint();}
function _keyMorePaint(){
  if(_keyTarget<0)return;const p=_keyPhrase(),e=p.editor,tool=document.getElementById('keyDragMode').value||'auto';
  document.querySelectorAll('#keyExtra [data-more-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.moreTab===_keyMoreTab)));
  document.querySelectorAll('#keyExtra [data-more-page]').forEach(pg=>pg.hidden=pg.dataset.morePage!==_keyMoreTab);
  for(const [sel,key,val] of [['[data-root]','root',String(e.root)],['[data-scale]','scale',e.scale],['[data-bars]','bars',String(p.bars)],['[data-tool]','tool',tool]])
    document.querySelectorAll('#keyExtra '+sel).forEach(b=>b.setAttribute('aria-pressed',String(b.dataset[key]===val)));
  _keyChopPaint();
}
// v0.3.211 §200：KEY の CHOP。切れ目（拍）は打ち込みから：chord＝音の出だしごと（和音は 1 つ）、bar / half / beat＝小節・2 拍・1 拍ごと。最大 16
let _keyChopMode='chord';
function keyChopBeats(p,mode){
  const end=p.bars*4;let b;
  if(mode==='chord')b=[...new Set(p.notes.map(n=>Math.round(n.beat*96)/96))].sort((x,y)=>x-y);
  else{const step={bar:4,half:2,beat:1}[mode]||4;b=[];for(let x=0;x<end-1e-9;x+=step)b.push(x);}
  return b.filter(x=>x>=0&&x<end).slice(0,16);
}
function _keyChopPlan(){const p=_keyPhrase(),beats=keyChopBeats(p,_keyChopMode),N=beats.length;return {beats,N,anchor:Math.max(0,Math.min(_keyTarget,16-N))};}
async function keyChop(){
  if(_keyTarget<0)return;const i=_keyTarget,t=tracks[i],plan=_keyChopPlan();if(!plan.N)return;
  if(_keyLoop)_keyLoopStop();
  const b=(await prepareKeyTrack(t,bpmVal))||(_keyBuffers.has(t.buffer)?t.buffer:null);
  if(!b||_keyTarget!==i||padKind(t)!=='KEY')return;
  // KEY の印が付かない別の波形へ写す（v0.3.206 の「波形にする」と同じ）
  const buf=AC.createBuffer(1,b.length,b.sampleRate);buf.getChannelData(0).set(b.getChannelData(0));
  const spb=60/Math.max(40,Math.min(250,+bpmVal||100)),bounds=plan.beats.map(x=>Math.min(1,x*spb/b.duration)).concat([1]);
  pushUndo();for(let k=0;k<plan.N;k++)stopVoices(tracks[plan.anchor+k],AC.currentTime);
  const r=chopKeyToPads(i,buf,bounds);
  keyEditorClose();
  for(let k=0;k<r.N;k++)refreshPadDisplay(r.anchor+k);
  syncPadContentEditor(i);selectPad(r.anchor);paintPerf();scheduleAutosave();
  sampNameEl.textContent='KEY の CHOP → PAD '+String(r.anchor+1).padStart(2,'0')+'–'+String(r.anchor+r.N).padStart(2,'0')+'  ↩で戻せる · 打ち込みは窓の KEY で戻せる';
}
function _keyChopPaint(){
  const plan=_keyChopPlan(),info=document.getElementById('keyChopInfo'),btn=document.getElementById('keyChopApply'),pad=n=>String(n+1).padStart(2,'0');
  document.querySelectorAll('#keyExtra [data-chop]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.chop===_keyChopMode)));
  btn.disabled=!plan.N;btn.textContent=plan.N?'✂ CHOP → PAD '+pad(plan.anchor)+'–'+pad(plan.anchor+plan.N-1):'✂ CHOP';
  info.textContent=plan.N?plan.N+' つに分けて PAD '+pad(plan.anchor)+'–'+pad(plan.anchor+plan.N-1)+' へ（そのパッドの音は置き換え・UNDO で戻せる）。このパッドは SAMPLE になり、打ち込みは窓の KEY で戻せます':'分けるノートがありません';
}
function _keyNativeSet(id,value){const el=document.getElementById(id);el.value=value;el.dispatchEvent(new Event('change'));}
function _keyPadsLit(){const held=new Set([..._keyLive.values()].map(v=>v.pitch));document.querySelectorAll('#keyPadGrid .key-pad').forEach(b=>b.classList.toggle('on',held.has(+b.dataset.pitch)&&b.dataset.pitch!==''));}
function keyEntryOpen(){
  _keyAllNotesOff();_keyRecOn=false;_keyStepOn=false;_keyStepAt=0;
  const e=_keyPhrase().editor,notes=_keyPhrase().notes;_keyPadRoot=e.root;
  _keyPadLow=Math.max(21,Math.min(84,(notes.length?Math.floor(Math.min(...notes.map(n=>n.pitch))/12)*12:48)+e.root));
  _keyEntryPaint();_keyWarmPads();
  document.getElementById('keyStatus').textContent=notes.length?'鍵盤＝試し弾き · REC＝ループしながら録音 · STEP＝1 マスずつ入れる · ロールをタップ＝その場所に置く':'空のフレーズ · MORE → CHORDS で定番の進行を入れられます · 鍵盤＝試し弾き · REC / STEP で入れる';
}
// v0.3.207 §196：CHORDS＝定番の進行をいまの KEY（ルート）で入れる。いまのノートは置き換え（UNDO で戻せる）、SCALE もその進行に合わせ、すぐループで鳴らす
async function keyApplyPreset(id){
  if(_keyTarget<0)return;const e=_keyPhrase().editor,q=keyPresetPhrase(id,e.root);if(!q)return;
  const p0=KEY_PRESETS.find(x=>x.id===id);
  if(_keyLoop)_keyLoopStop();_keySelection.clear();_keySelected=-1;
  await _keyUpdate(p=>{p.bars=q.bars;p.notes=q.notes;p.editor.scale=q.scale;p.editor.scaleEnabled=true;});
  if(_keyTarget<0)return;
  document.getElementById('keyStatus').textContent='CHORDS · '+NOTE_NAMES[e.root]+' · '+p0.name+'（'+p0.degrees+'）· UNDO で元に戻せます';
  await _keyLoopStart();
}
function keyEntryClose(){_keyAllNotesOff();_keyLoopStop();_keyRecOn=false;_keyStepOn=false;}
(function(){
  // MORE：進行のボタン（グループごと）・主音 12 個。押した物は隠れた入力（KEY / SCALE / BARS / TOOL）へ渡す＝処理は 1 か所
  const list=document.getElementById('keyChordList'),roots=document.getElementById('keyRootGrid');
  for(const g of [...new Set(KEY_PRESETS.map(p=>p.group))]){const h=document.createElement('b');h.className='key-more-label';h.textContent=g;list.appendChild(h);const box=document.createElement('div');box.className='key-grid key-chord-grid';
    for(const p of KEY_PRESETS.filter(x=>x.group===g)){const b=document.createElement('button');b.type='button';b.dataset.preset=p.id;const nm=document.createElement('span'),dg=document.createElement('small');nm.textContent=p.name;dg.textContent=p.degrees;b.appendChild(nm);b.appendChild(dg);box.appendChild(b);}list.appendChild(box);}
  NOTE_NAMES.forEach((n,k)=>{const b=document.createElement('button');b.type='button';b.dataset.root=k;b.textContent=n;roots.appendChild(b);});
  document.getElementById('keyExtra').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;const d=b.dataset;
    if(d.moreTab)_keyMoreTabSet(d.moreTab);
    else if(d.preset){_keyMoreShow(false);keyApplyPreset(d.preset);}
    else if(d.root!==undefined)_keyNativeSet('keyScaleRoot',d.root);
    else if(d.scale)_keyNativeSet('keyScaleType',d.scale);
    else if(d.bars)_keyNativeSet('keyBars',d.bars);
    else if(d.tool){_keyNativeSet('keyDragMode',d.tool);_keyMorePaint();}
    else if(d.chop){_keyChopMode=d.chop;_keyChopPaint();}
    else if(b.id==='keyChopApply')keyChop().catch(err=>{document.getElementById('keyStatus').textContent=err.message;});
  });
  document.getElementById('keyMoreClose').addEventListener('click',()=>_keyMoreShow(false));
  // MORE が開いている間に外側を触った＝閉じる。ロール・鍵盤なら閉じるだけ（その場所にノートを置かない・鳴らさない）
  // （名前の段・道具の段のボタンはそのまま働く。ロールと鍵盤への指は閉じるだけに使う）
  document.querySelector('#keyEditor .key-panel').addEventListener('pointerdown',e=>{if(document.getElementById('keyExtra').hidden||e.target.closest('#keyExtra,#keyMore'))return;_keyMoreShow(false);if(e.target.closest('#keyHorizontal,#keyPads')){e.preventDefault();e.stopPropagation();}},true);
  const preset=document.getElementById('keyChordPreset');
  for(const g of [...new Set(KEY_PRESETS.map(p=>p.group))]){const og=document.createElement('optgroup');og.label=g;for(const p of KEY_PRESETS.filter(x=>x.group===g)){const o=document.createElement('option');o.value=p.id;o.textContent=p.name+' · '+p.degrees;og.appendChild(o);}preset.appendChild(og);}
  preset.addEventListener('change',()=>{const id=preset.value;preset.value='';if(!id)return;_keyMoreShow(false);keyApplyPreset(id);});
  const grid=document.getElementById('keyPadGrid');
  grid.addEventListener('pointerdown',e=>{const b=e.target.closest('.key-pad');if(!b||b.disabled||b.dataset.pitch==='')return;e.preventDefault();try{b.setPointerCapture(e.pointerId);}catch(_){}_keyNoteOn(+b.dataset.pitch,'p'+e.pointerId);});
  for(const type of ['pointerup','pointercancel','lostpointercapture'])grid.addEventListener(type,e=>_keyNoteOff('p'+e.pointerId));
  grid.addEventListener('contextmenu',e=>e.preventDefault());
  document.getElementById('keyPreview').addEventListener('click',()=>{if(_keyLoop)_keyLoopStop();else _keyLoopStart();});
  document.getElementById('keyRec').addEventListener('click',()=>{_keyRecOn=!_keyRecOn;if(_keyRecOn){_keyStepOn=false;if(!_keyLoop)_keyLoopStart();else if(_keyLoop)_keyLoop.click=Math.ceil((AC.currentTime-_keyLoop.t0)/_keyBeatSec());}_keyEntryPaint();});
  document.getElementById('keyStep').addEventListener('click',()=>{_keyStepOn=!_keyStepOn;if(_keyStepOn)_keyRecOn=false;_keyStepHeld=0;_keyEntryPaint();document.getElementById('keyStatus').textContent=_keyStepOn?'STEP · 鍵盤を押すとカーソルの位置へ入って 1 マス進む · 同時に押せば和音 · 上の目盛りをタップで位置':'';});
  document.getElementById('keyStepBack').addEventListener('click',()=>_keyStepMove(-1));
  document.getElementById('keyStepRest').addEventListener('click',()=>_keyStepMove(1));
  document.getElementById('keyPadsDown').addEventListener('click',()=>{_keyPadLow=Math.max(21,_keyPadLow-12);_keyEntryPaint();_keyWarmPads();});
  document.getElementById('keyPadsUp').addEventListener('click',()=>{_keyPadLow=Math.min(96,_keyPadLow+12);_keyEntryPaint();_keyWarmPads();});
  document.getElementById('keyRuler').addEventListener('pointerdown',e=>{if(!_keyStepOn||_keyTarget<0)return;const pt=_keyPoint(e,e.currentTarget),end=_keyPhrase().bars*4;_keyStepAt=Math.max(0,Math.min(end-.25,Math.floor((pt.x-58)/_keyZoom*4)/4));_keyEntryPaint();});
  // PC：鍵盤 4×4 は演奏画面のパッドと同じキー（1-8 / Q-I）。スペース＝PLAY / STOP
  window.addEventListener('keydown',e=>{
    if(_keyTarget<0||_keySound||e.ctrlKey||e.metaKey||e.altKey||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName))return;
    if(e.key===' '){if(e.target.tagName==='BUTTON')return;e.preventDefault();e.stopImmediatePropagation();document.getElementById('keyPreview').click();return;}
    const d=KEYMAP.indexOf(e.key.toLowerCase());if(d<0)return;e.preventDefault();e.stopImmediatePropagation();if(e.repeat)return;
    const b=grid.children[d];if(b&&!b.disabled&&b.dataset.pitch!=='')_keyNoteOn(+b.dataset.pitch,'k'+e.code);
  },true);
  window.addEventListener('keyup',e=>{if(_keyLive.has('k'+e.code)){e.stopImmediatePropagation();_keyNoteOff('k'+e.code);}},true);
  window.addEventListener('blur',_keyAllNotesOff);
})();
