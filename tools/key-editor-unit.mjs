// Run: node tools/key-editor-unit.mjs. Exercises real gesture handlers with a DOM
// test double, plus the physical renderer. Browser visual checks are separate.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map(),events={},history=[];
const noop=()=>{};
const drawing=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:20}):noop,set:()=>true});
function el(id){if(!elements.has(id))elements.set(id,{id,value:0,hidden:false,disabled:false,width:1000,height:1000,clientWidth:1150,clientHeight:350,scrollTop:0,scrollLeft:0,dataset:{},style:{},children:[],listeners:{},classList:{toggle:noop},setAttribute(k,v){this[k]=v;},appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},getContext:()=>drawing,getBoundingClientRect(){return {left:0,top:0,width:this.width,height:this.height,right:this.width,bottom:this.height};},addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);},focus:noop,setPointerCapture:noop,click(){for(const f of this.listeners.click||[])f({target:this});}});return elements.get(id);}
class Buffer {constructor(ch,len,rate){this.length=len;this.sampleRate=rate;this.duration=len/rate;this.a=new Float32Array(len);}getChannelData(){return this.a;}}
const context={console,Float32Array,Uint8Array,DataView,TextDecoder,Math,Number,JSON,Map,Set,WeakMap,Promise,setTimeout,clearTimeout,
 OfflineAudioContext:class{createBuffer(c,l,r){return new Buffer(c,l,r);}},
 AC:{currentTime:0,resume:async()=>{},createBufferSource:()=>({connect:noop,disconnect:noop,start:noop,stop:noop}),createGain:()=>({gain:{value:0},connect:noop,disconnect:noop})},masterGain:{},
 document:{getElementById:el,querySelector:s=>el(s),querySelectorAll:sel=>sel==='[data-key-motion]'?['tremolo','off','wah'].map(value=>{const b=el('motion-'+value);b.dataset.keyMotion=value;return b;}):sel==='[data-key-color]'?['chorus','off','phaser'].map(value=>{const b=el('color-'+value);b.dataset.keyColor=value;return b;}):[],createElement:()=>el('child'+Math.random()),activeElement:null},window:{addEventListener:(k,fn)=>(events[k]??=[]).push(fn)},
 tracks:[{padKind:'KEY',keyPhrase:{bars:2,notes:[]}}],PADS:[{}],NOTE_NAMES:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],bpmVal:100,peTarget:0,
 pushUndo:()=>history.push(JSON.parse(JSON.stringify(context.tracks[0].keyPhrase))),doUndo:()=>{context.tracks[0].keyPhrase=history.pop();context.tracks[0]._keySignature=null;},
 refreshPadDisplay:noop,scheduleAutosave:noop,scratchClose:noop,sampNameEl:{},paintPerf:noop,stopVoices:noop,previewVoiceFrom:noop,trigger:noop};
vm.createContext(context);
const base=new URL('../src/js/',import.meta.url);
for(const file of ['data/key-phrase.js','audio/key-instrument.js','ui/pad-content.js'])vm.runInContext(fs.readFileSync(new URL(file,base),'utf8'),context,{filename:file});
const run=code=>vm.runInContext(code,context),flush=async()=>{await new Promise(r=>setTimeout(r,0));};
const phrase=()=>context.tracks[0].keyPhrase;
const ev=(id,type,x,y,extra={})=>{const e={currentTarget:el(id),target:el(id),clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,preventDefault:noop,stopImmediatePropagation:noop,...extra};for(const f of el(id).listeners[type]||[])f(e);};
const down=(x,y,extra)=>ev('keyRoll','pointerdown',x,y,extra),move=(x,y,extra)=>ev('keyRoll','pointermove',x,y,extra),up=(x,y)=>ev('keyRoll','pointerup',x,y);
const xy=(beat,pitch)=>({x:58+beat*run('_keyZoom'),y:(run('_keyLow')+35-pitch)*28+14});
const gesture=async(a,b,extra)=>{down(a.x,a.y,extra);move(b.x,b.y,extra);up(b.x,b.y);await flush();};
let passed=0;function check(label,fn){fn();console.log('PASS '+label);passed++;}
run('keyEditorOpen(0)');
let a=xy(0,60),b=xy(.75,60);await gesture(a,b);
check('draw note by dragging; one undo entry',()=>{assert.equal(phrase().notes.length,1);assert.equal(phrase().notes[0].length,1);assert.equal(history.length,1);});
a=xy(.5,60);b=xy(1,62);await gesture(a,b);
check('move time and pitch without changing length',()=>{assert.equal(phrase().notes[0].beat,.5);assert.equal(phrase().notes[0].pitch,62);assert.equal(phrase().notes[0].length,1);assert.equal(history.length,2);});
a=xy(1.5,62);a.x-=2;b={...a,x:a.x+run('_keyZoom')*.5};await gesture(a,b);
check('right edge resizes duration',()=>assert.equal(phrase().notes[0].length,1.5));
a=xy(.5,62);a.x+=2;b={...a,x:a.x+run('_keyZoom')*.25};await gesture(a,b);
check('left edge resizes start while retaining end',()=>{assert.equal(phrase().notes[0].beat,.75);assert.equal(phrase().notes[0].length,1.25);});
a=xy(.75,62);ev('keyVelocityRoll','pointerdown',a.x,88-95/126*72);ev('keyVelocityRoll','pointermove',a.x,80);ev('keyVelocityRoll','pointerup',a.x,80);await flush();
check('velocity lane changes strength directly',()=>assert.ok(phrase().notes[0].velocity<40));
el('keySnap').click();await flush();a=xy(1.1,62);b={...a,x:a.x+run('_keyZoom')*.137};await gesture(a,b);
check('snap OFF permits time between sixteenths',()=>assert.ok(Math.abs(phrase().notes[0].beat*4-Math.round(phrase().notes[0].beat*4))>.05));
el('keySnap').click();await flush();a=xy(phrase().notes[0].beat+.4,62);b={...a,x:a.x+run('_keyZoom')*.163};await gesture(a,b);
check('snap ON aligns move to 1/16 grid',()=>assert.equal(phrase().notes[0].beat*4,Math.round(phrase().notes[0].beat*4)));
el('keyScaleOn').click();await flush();a=xy(3,61);down(a.x,a.y);up(a.x,a.y);await flush();
check('scale ON constrains new notes to C major',()=>assert.equal(phrase().notes[1].pitch,60));
el('keyScaleOn').click();await flush();a=xy(4,61);down(a.x,a.y);up(a.x,a.y);await flush();
check('scale OFF permits chromatic notes',()=>assert.equal(phrase().notes[2].pitch,61));
el('keyScaleOn').click();await flush();
check('scale toggle never rewrites existing or imported pitches',()=>assert.equal(phrase().notes[2].pitch,61));
check('editor preferences survive JSON save/load',()=>{const x=context.normalizeKeyPhrase(JSON.parse(JSON.stringify(phrase())));assert.equal(x.editor.scaleEnabled,true);assert.equal(x.editor.snap,true);assert.equal(x.instrument,'rhodes-tine-v2');});
const before=JSON.stringify(phrase()),undos=history.length;a=xy(1.2,62);b=xy(2,67);down(a.x,a.y);move(b.x,b.y);ev('keyRoll','pointercancel',b.x,b.y);await flush();
check('cancel gesture preserves data and undo history',()=>{assert.equal(JSON.stringify(phrase()),before);assert.equal(history.length,undos);});
el('keyDragMode').value='move';
run('_keySelection=new Set([0,1]);_keySelected=0;');a=xy(1.2,62);b={...a,x:a.x+run('_keyZoom')*.25};const gap=phrase().notes[1].beat-phrase().notes[0].beat;await gesture(a,b);
check('multi-note move retains relative timing',()=>assert.equal(phrase().notes[1].beat-phrase().notes[0].beat,gap));
run('_keySelection=new Set([2]);_keySelected=2;');el('keyDuplicate').click();await flush();
check('duplicate makes independent editable notes',()=>{assert.equal(phrase().notes.length,4);assert.notEqual(phrase().notes[2],phrase().notes[3]);});
el('keyDelete').click();await flush();check('delete selected duplicate only',()=>assert.equal(phrase().notes.length,3));
el('keyUndo').click();await flush();check('undo restores deleted note',()=>assert.equal(phrase().notes.length,4));
// A phone can explicitly choose a drag action, avoiding tiny edge hit targets.
el('keyDragMode').value='right';run('_keySelect(0)');
a=xy(phrase().notes[0].beat+.3,phrase().notes[0].pitch);b={...a,x:a.x+run('_keyZoom')*.5};const oldLength=phrase().notes[0].length;
await gesture(a,b,{pointerType:'touch'});
check('touch Length mode resizes from note body',()=>assert.equal(phrase().notes[0].length,oldLength+.5));
// v0.3.193 §181：スマホ（指）は何も無い所を動かす＝スクロール（ノートは描かない）、動かさずに離す＝そこへノート
{el('.key-scroll').scrollTop=300;el('keyHorizontal').scrollLeft=200;const before=JSON.stringify(phrase()),count=phrase().notes.length,p0=xy(6,70);
 await gesture(p0,{x:p0.x-40,y:p0.y-60},{pointerType:'touch'});
 check('finger drag on empty roll scrolls with the finger and draws nothing',()=>{assert.equal(JSON.stringify(phrase()),before);assert.equal(el('.key-scroll').scrollTop,360);assert.equal(el('keyHorizontal').scrollLeft,240);});
 down(p0.x,p0.y,{pointerType:'touch'});up(p0.x,p0.y);await flush();
 check('finger tap on empty roll places a note there',()=>{assert.equal(phrase().notes.length,count+1);assert.ok(phrase().notes.some(n=>Math.abs(n.pitch-70)<=1&&Math.abs(n.beat-6)<1e-9),JSON.stringify(phrase().notes));});
 run('_keyGesture=null');el('.key-scroll').scrollTop=300;down(20,p0.y,{pointerType:'touch'});move(20,p0.y+50,{pointerType:'touch'});up(20,p0.y+50);await flush();
 check('finger drag on the keyboard scrolls pitch',()=>assert.equal(el('.key-scroll').scrollTop,250));}
el('keyNav').click();const untouched=JSON.stringify(phrase());a=xy(5,72);await gesture(a,xy(6,74),{pointerType:'touch'});
check('scroll mode cannot accidentally edit notes',()=>assert.equal(JSON.stringify(phrase()),untouched));el('keyNav').click();
const zoomBefore=run('_keyZoom');el('keyHorizontal').clientWidth=750;for(const fn of events.resize||[])fn();
check('fit zoom follows viewport resize',()=>assert.notEqual(run('_keyZoom'),zoomBefore));
el('keyZoom').value=128;for(const fn of el('keyZoom').listeners.input||[])fn({target:el('keyZoom')});el('keyHorizontal').clientWidth=600;for(const fn of events.resize||[])fn();
check('manual zoom survives viewport resize',()=>assert.equal(run('_keyZoom'),128));
const samples=[];for(const pitch of [21,48,60,84,108])for(const vel of [24,90,127]){const buf=context.keyTineNote(pitch,vel,.6);let sum=0,peak=0;for(const x of buf){assert.ok(Number.isFinite(x));sum+=x*x;peak=Math.max(peak,Math.abs(x));}samples.push({pitch,vel,rms:Math.sqrt(sum/buf.length),peak});}
check('tine model remains finite across A0–C8',()=>assert.ok(samples.every(s=>s.peak>0&&s.peak<2)));
check('velocity preserves dynamic range',()=>{for(const pitch of [21,48,60,84,108])assert.ok(samples.find(s=>s.pitch===pitch&&s.vel===127).rms>samples.find(s=>s.pitch===pitch&&s.vel===24).rms*2);});
const note=context.keyTineNote(60,100,.5),rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length);
check('damper suppresses note after key release',()=>assert.ok(rms(note.slice(26000*.9,26000*1.1))<rms(note.slice(26000*.1,26000*.3))*.03));
const rendered=await context.renderKeyPhrase({bars:4,notes:[{pitch:60,beat:0,length:1,velocity:96},{pitch:64,beat:0,length:1,velocity:80},{pitch:67,beat:1,length:2,velocity:120}]},100);
check('phrase renderer preserves four bars plus release tail',()=>{assert.equal(rendered.duration,10.8);assert.ok(rms(rendered.a)>.001);assert.ok(Math.max(...rendered.a.slice(0,20000))<=.9);});
const first=context.renderKeyPhrase({bars:1,notes:[],editor:{snap:true}},100),second=context.renderKeyPhrase({bars:1,notes:[],editor:{snap:false,scaleEnabled:true}},100);
check('editor toggles reuse sound cache',()=>assert.equal(first,second));
function spectrum(a,f){let real=0,imag=0;const start=520,end=5200;for(let i=start;i<end;i++){real+=a[i]*Math.cos(2*Math.PI*f*i/26000);imag+=a[i]*Math.sin(2*Math.PI*f*i/26000);}return real*real+imag*imag;}
const f0=440*2**((60-69)/12),soft=context.keyTineNote(60,30,1),hard=context.keyTineNote(60,127,1);
check('hard hammer strikes produce stronger pickup harmonics',()=>assert.ok(spectrum(hard,f0*2)/spectrum(hard,f0)>spectrum(soft,f0*2)/spectrum(soft,f0)));
let measured=0,power=-1;for(let f=255;f<=268;f+=.25){const p=spectrum(hard,f);if(p>power){power=p;measured=f;}}
check('modal fundamental tracks MIDI pitch within 5 cents',()=>assert.ok(Math.abs(1200*Math.log2(measured/f0))<5));
// Cursor and toolbar behaviour use the same handlers as the shipping editor.
for(const [tool,cursor] of [['move','move'],['left','w-resize'],['right','e-resize'],['velocity','ns-resize'],['auto','crosshair']]){
 el('keyDragMode').value=tool;for(const fn of el('keyDragMode').listeners.change||[])fn({target:el('keyDragMode')});
 check('tool '+tool+' sets cursor '+cursor,()=>assert.equal(el('keyRoll').style.cursor,cursor));
}
const n=phrase().notes[0];el('keyDragMode').value='auto';run('_keyNavigate=false');
a=xy(n.beat+n.length*.5,n.pitch);ev('keyRoll','pointermove',a.x,a.y);
check('Auto hover on note body shows move cursor',()=>assert.equal(el('keyRoll').style.cursor,'move'));
a=xy(n.beat+n.length,n.pitch);ev('keyRoll','pointermove',a.x-1,a.y);
check('Auto hover on right edge shows resize cursor',()=>assert.equal(el('keyRoll').style.cursor,'e-resize'));
el('keyNav').click();check('navigation shows grab cursor',()=>assert.equal(el('keyRoll').style.cursor,'grab'));el('keyNav').click();
const notesBefore=JSON.stringify(phrase().notes);el('keyTabSound').click();
check('SOUND tab preserves notes and exposes sound controls',()=>{assert.equal(el('keyNotePanel').hidden,true);assert.equal(el('keySoundPanel').hidden,false);assert.equal(JSON.stringify(phrase().notes),notesBefore);});
el('motion-tremolo').click();el('color-phaser').click();await flush();
check('both effect slots can be used together',()=>{assert.equal(phrase().effects.motion,'tremolo');assert.equal(phrase().effects.color,'phaser');});
const h=history.length;el('keyMotionDepth').value=.73;for(const fn of el('keyMotionDepth').listeners.input||[])fn({target:el('keyMotionDepth')});
check('effect drag previews percentage without multiple undo entries',()=>{assert.equal(history.length,h);assert.equal(el('keyMotionDepthRead').textContent,'73%');});
for(const fn of el('keyMotionDepth').listeners.change||[])fn({target:el('keyMotionDepth')});await flush();
check('one released effect gesture is one undo',()=>{assert.equal(history.length,h+1);assert.equal(phrase().effects.motionDepth,.73);});
el('keyTabNotes').click();check('NOTES tab returns to editing',()=>assert.equal(el('keyNotePanel').hidden,false));
check('effect settings serialize and normalize independently',()=>{const a=context.normalizeKeyPhrase(phrase()),b=context.normalizeKeyPhrase(JSON.parse(JSON.stringify(a)));a.effects.motion='off';assert.equal(b.effects.motion,'tremolo');assert.equal(b.effects.color,'phaser');assert.equal(b.effects.motionDepth,.73);});
const signal=new Float32Array(52000);for(let i=0;i<signal.length;i++)signal[i]=.25*Math.sin(2*Math.PI*261.626*i/26000)+.08*Math.sin(2*Math.PI*523.252*i/26000);
const original=signal.slice();
check('FX OFF and zero depth are bit-identical bypasses',()=>{assert.equal(context.keyApplyEffects(signal,26000,{}),signal);assert.equal(context.keyApplyEffects(signal,26000,{motion:'wah',motionDepth:0,color:'phaser',colorDepth:0}),signal);});
for(const motion of ['off','tremolo','wah'])for(const color of ['off','chorus','phaser']){
 const a=context.keyApplyEffects(signal,26000,{motion,color,motionDepth:.8,colorDepth:.8});
 check('DSP '+motion+' / '+color+' stays finite and bounded',()=>{assert.equal(a.length,signal.length);assert.ok(a.every(x=>Number.isFinite(x)&&Math.abs(x)<2));if(motion!=='off'||color!=='off')assert.ok(a.some((x,i)=>Math.abs(x-signal[i])>.001));});
}
check('effect processing never mutates the dry voice',()=>assert.deepEqual(signal,original));
const dryCount=run('_keyDryCache.size');await context.renderKeyPhrase({bars:4,notes:[{pitch:60,beat:0,length:1,velocity:96},{pitch:64,beat:0,length:1,velocity:80},{pitch:67,beat:1,length:2,velocity:120}],effects:{motion:'tremolo',color:'chorus'}},100);
check('effect changes reuse physical voice cache',()=>assert.equal(run('_keyDryCache.size'),dryCount));
let previewCount=0,performanceCount=0;context.previewVoiceFrom=()=>previewCount++;context.trigger=()=>performanceCount++;
await el('keyPreview').listeners.click[0]();check('editor preview bypasses performance recording path',()=>{assert.equal(previewCount,1);assert.equal(performanceCount,0);});
// Regression: returning to KEY after restoring its original sample must not
// accept that SPL buffer just because the old KEY signature is still present.
const sample=new Buffer(1,128,26000);sample.a[0]=.8;
Object.assign(context.tracks[0],{padKind:'SPL',buffer:sample,rawBuffer:sample,_keySignature:null,sampleState:null,start:0,end:1,loop:false,loopStart:0,keyPhrase:{bars:1,notes:[{pitch:60,beat:0,length:1,velocity:96}]}});context.PADS[0]={type:'sample',voice:null};
await context.setPadKind(0,'KEY');const keyAudio=context.tracks[0].buffer;
await context.setPadKind(0,'SPL');check('KEY→SPL restores the original sample',()=>assert.equal(context.tracks[0].buffer,sample));
await context.setPadKind(0,'KEY');check('KEY→SPL→KEY reuses KEY audio, never SPL',()=>{assert.notEqual(context.tracks[0].buffer,sample);assert.equal(context.tracks[0].buffer,keyAudio);});
for(const kind of ['SCR','SPL','SCR']){await context.setPadKind(0,kind);await context.setPadKind(0,'KEY');}
check('repeated KEY/SCR/SPL changes retain the KEY phrase and voice',()=>{assert.equal(context.tracks[0].buffer,keyAudio);assert.equal(context.tracks[0].keyPhrase.notes[0].pitch,60);});
context.tracks[0].buffer=sample;context.tracks[0].rawBuffer=sample;await context.prepareKeyTrack(context.tracks[0],100);
check('stale matching signature cannot authorize a sample buffer as KEY',()=>assert.equal(context.tracks[0].buffer,keyAudio));
// Thumbnail uses pitch and note duration; rendered samples must never be read.
context.getComputedStyle=()=>({getPropertyValue:()=> '#fff'});vm.runInContext(fs.readFileSync(new URL('32-ui-wave.js',base),'utf8'),context);
const thumbnail=context.keyPadGeometry({bars:2,notes:[{pitch:60,beat:0,length:1,velocity:40},{pitch:72,beat:4,length:2,velocity:127}]},120,100);
check('KEY thumbnail preserves pitch, start and duration',()=>{const [a,b]=thumbnail.notes;assert.ok(a.y>b.y);assert.ok(b.x>a.x);assert.ok(b.width>a.width);assert.ok(thumbnail.notes.every(n=>n.x>=thumbnail.left&&n.x+n.width<=thumbnail.left+thumbnail.width));});
check('empty KEY thumbnail is an empty note grid',()=>assert.equal(context.keyPadGeometry({notes:[]},80,64).notes.length,0));
context.padsEl={children:[{clientWidth:120,clientHeight:100,querySelector:()=>el('padThumbnail')}]};context.tracks[0].padKind='KEY';context.tracks[0].buffer={getChannelData(){throw Error('KEY must not read audio for its thumbnail');}};
check('KEY pad drawing bypasses waveform sampling',()=>context.drawPadWave(0));
// Exercise the real playback entry guard with a deliberately inconsistent track.
// The rest of the voice graph must never be reached for an old SPL buffer.
const voiceText=fs.readFileSync(new URL('21-voice.js',base),'utf8'),voiceGuard=voiceText.slice(voiceText.indexOf('function playVoice('),voiceText.indexOf('function hitVoice('));
let repairRequests=0;const badTrack={padKind:'KEY',buffer:sample,keyPhrase:context.normalizeKeyPhrase({notes:[]})};badTrack._keySignature=JSON.stringify([badTrack.keyPhrase,100]);
const guardContext={tracks:[badTrack],bpmVal:100,normalizeKeyPhrase:context.normalizeKeyPhrase,_keyBuffers:new WeakSet(),prepareKeyTrack:()=>{repairRequests++;return Promise.resolve(null);},sampNameEl:{textContent:''},liveCompDuck:()=>{throw Error('stale SPL reached voice playback');}};vm.createContext(guardContext);vm.runInContext(voiceGuard,guardContext);
check('live and sequenced playback reject SPL with a stale KEY signature',()=>{guardContext.playVoice(0,0,false,false);guardContext.playVoice(0,0,false,true);assert.equal(repairRequests,2);});
console.log('All '+passed+' checks passed.');
