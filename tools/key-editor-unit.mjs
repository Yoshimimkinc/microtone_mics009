// Run: node tools/key-editor-unit.mjs. Exercises real gesture handlers with a DOM
// test double, plus the physical renderer. Browser visual checks are separate.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const elements=new Map(),events={},history=[];
const noop=()=>{};
const drawing=new Proxy({},{get:(_,k)=>k==='measureText'?()=>({width:20}):noop,set:()=>true});
function el(id){if(!elements.has(id))elements.set(id,{id,value:0,hidden:false,disabled:false,width:1000,height:1000,clientWidth:1150,clientHeight:350,scrollTop:0,scrollLeft:0,dataset:{},style:{},children:[],listeners:{},classList:{toggle:noop},setAttribute(k,v){this[k]=v;},appendChild(e){this.children.push(e);},replaceChildren(){this.children=[];},getContext:()=>drawing,getBoundingClientRect(){return {left:0,top:0,width:this.width,height:this.height,right:this.width,bottom:this.height};},addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);},focus:noop,setPointerCapture:noop,click(){for(const f of this.listeners.click||[])f({target:this});},dispatchEvent(ev){for(const f of this.listeners[ev.type]||[])f({target:this,type:ev.type});}});return elements.get(id);}
class Buffer {constructor(ch,len,rate){this.length=len;this.sampleRate=rate;this.duration=len/rate;this.a=new Float32Array(len);}getChannelData(){return this.a;}}
const context={Event:class{constructor(type){this.type=type;}},Float32Array,Uint8Array,DataView,TextDecoder,Math,Number,JSON,Map,Set,WeakMap,Promise,setTimeout,clearTimeout,
 OfflineAudioContext:class{createBuffer(c,l,r){return new Buffer(c,l,r);}},
 AC:{currentTime:0,resume:async()=>{},createBuffer:(c,l,r)=>new Buffer(c,l,r),createBufferSource:()=>({connect:noop,disconnect:noop,start:noop,stop:noop}),createGain:()=>({gain:{value:0,setTargetAtTime:noop,setValueAtTime:noop,exponentialRampToValueAtTime:noop},connect:noop,disconnect:noop}),createOscillator:()=>({frequency:{value:0},connect:noop,disconnect:noop,start:noop,stop:noop})},masterGain:{},
 KEYMAP:['1','2','3','4','5','6','7','8','q','w','e','r','t','y','u','i'],requestAnimationFrame:()=>0,cancelAnimationFrame:noop,setInterval:()=>0,clearInterval:noop,
 document:{getElementById:el,querySelector:s=>el(s),querySelectorAll:sel=>sel==='[data-key-motion]'?['tremolo','off','wah'].map(value=>{const b=el('motion-'+value);b.dataset.keyMotion=value;return b;}):sel==='[data-key-color]'?['chorus','off','phaser'].map(value=>{const b=el('color-'+value);b.dataset.keyColor=value;return b;}):[],createElement:()=>el('child'+Math.random()),activeElement:null},window:{addEventListener:(k,fn)=>(events[k]??=[]).push(fn)},
 tracks:[{padKind:'KEY',keyPhrase:{bars:2,notes:[]}}],PADS:[{}],NOTE_NAMES:['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'],bpmVal:100,peTarget:0,
 pushUndo:()=>history.push(JSON.parse(JSON.stringify(context.tracks[0].keyPhrase))),doUndo:()=>{context.tracks[0].keyPhrase=history.pop();context.tracks[0]._keySignature=null;},
 refreshPadDisplay:noop,scheduleAutosave:noop,scratchClose:noop,sampNameEl:{},paintPerf:noop,stopVoices:noop,previewVoiceFrom:noop,trigger:noop};
vm.createContext(context);
const base=new URL('../src/js/',import.meta.url);
for(const file of ['data/key-phrase.js','data/key-presets.js','data/pads.js','audio/key-instrument.js','ui/key-entry.js','ui/pad-content.js'])vm.runInContext(fs.readFileSync(new URL(file,base),'utf8'),context,{filename:file});
const run=code=>vm.runInContext(code,context),flush=async()=>{await new Promise(r=>setTimeout(r,0));};
const phrase=()=>context.tracks[0].keyPhrase;
const ev=(id,type,x,y,extra={})=>{const e={currentTarget:el(id),target:el(id),clientX:x,clientY:y,pointerId:1,pointerType:'mouse',button:0,preventDefault:noop,stopImmediatePropagation:noop,...extra};for(const f of el(id).listeners[type]||[])f(e);};
const down=(x,y,extra)=>ev('keyRoll','pointerdown',x,y,extra),move=(x,y,extra)=>ev('keyRoll','pointermove',x,y,extra),up=(x,y)=>ev('keyRoll','pointerup',x,y);
const xy=(beat,pitch)=>({x:58+beat*run('_keyZoom'),y:run('_keyRowY('+pitch+')')+run('_keyRowH()')/2});
const gesture=async(a,b,extra)=>{down(a.x,a.y,extra);move(b.x,b.y,extra);up(b.x,b.y);await flush();};
let passed=0;function check(label,fn){fn();console.log('PASS '+label);passed++;}
run('keyEditorOpen(0)');
// v0.3.205 §194（C）：スケールは既定でオン＝外の音の行を畳む（C メジャー 3 オクターブ＝21 行・40px）。保存された OFF はそのまま
check('new phrases start with scale ON; a saved OFF stays OFF',()=>{assert.equal(context.normalizeKeyPhrase({}).editor.scaleEnabled,true);assert.equal(context.normalizeKeyPhrase({editor:{scaleEnabled:false}}).editor.scaleEnabled,false);});
const inC=Array.from({length:88},(_,k)=>21+k).filter(p=>[0,2,4,5,7,9,11].includes(p%12)).length;   // A0〜C8 の C メジャーの音（v0.3.212：ロールは全音域）
check('scale ON folds out-of-scale rows and makes rows taller',()=>{assert.equal(run('_keyRows().length'),inC);assert.equal(run('_keyRowH()'),40);assert.ok(run('_keyRows().every(p=>_keyInScale(p,_keyPhrase().editor))'));});
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
a=xy(3,61);down(a.x,a.y);up(a.x,a.y);await flush();
check('scale ON constrains new notes to C major',()=>assert.equal(phrase().notes[1].pitch,60));
el('keyScaleOn').click();await flush();a=xy(4,61);down(a.x,a.y);up(a.x,a.y);await flush();
check('scale OFF permits chromatic notes',()=>assert.equal(phrase().notes[2].pitch,61));
check('scale OFF shows all 12 semitones at 28px',()=>{assert.equal(run('_keyRows().length'),88);assert.equal(run('_keyRowH()'),28);});
el('keyScaleOn').click();await flush();
check('scale toggle never rewrites existing or imported pitches',()=>assert.equal(phrase().notes[2].pitch,61));
check('a used out-of-scale pitch keeps its row while folded',()=>{assert.ok(run('_keyRows().includes(61)'));assert.equal(run('_keyRows().length'),inC+1);});
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
// v0.3.205 §194（A）：PLAY＝エディタの中でループ再生（演奏の録音経路は通らない）、もう一度で止まる
el('keyPreview').click();for(let k=0;k<40&&!run('_keyLoop');k++)await new Promise(r=>setTimeout(r,5));
check('PLAY loops the phrase inside the editor, never the performance path',()=>{assert.ok(run('_keyLoop'));assert.equal(performanceCount,0);assert.equal(previewCount,0);});
el('keyPreview').click();check('pressing PLAY again stops the loop',()=>assert.equal(run('_keyLoop'),null));
// 鍵盤 4×4：スケールの音だけ、左下が一番低い
{Object.assign(context.tracks[0],{keyPhrase:{bars:2,notes:[]}});run('keyEditorOpen(0)');
 const grid=el('keyPadGrid'),pads=grid.children,padEv=(type,d,id)=>{for(const f of grid.listeners[type]||[])f({target:{closest:()=>pads[d]},pointerId:id,preventDefault:noop});};
 check('keyboard holds 16 in-scale notes, lowest at bottom-left',()=>{assert.equal(pads.length,16);const ps=run('_keyPadPitches()');assert.equal(ps.length,16);assert.ok(ps.every(p=>run('_keyInScale('+p+',_keyPhrase().editor)')));assert.equal(+pads[12].dataset.pitch,48);assert.equal(+pads[13].dataset.pitch,50);assert.equal(+pads[3].dataset.pitch,ps[15]);});
 const quiet=JSON.stringify(phrase());padEv('pointerdown',12,1);padEv('pointerup',12,1);await flush();
 check('playing the keyboard without REC/STEP only auditions',()=>assert.equal(JSON.stringify(phrase()),quiet));
 el('keyStep').click();const u0=history.length;
 padEv('pointerdown',12,1);padEv('pointerup',12,1);await flush();padEv('pointerdown',13,2);padEv('pointerup',13,2);await flush();
 check('STEP puts a 1/16 note at the cursor and advances one step',()=>{assert.deepEqual(phrase().notes.map(n=>[n.pitch,n.beat,n.length]),[[48,0,.25],[50,.25,.25]]);assert.equal(run('_keyStepAt'),.5);assert.equal(history.length,u0+2);});
 padEv('pointerdown',12,3);padEv('pointerdown',14,4);padEv('pointerup',12,3);check('STEP waits for every key to be released (chord)',()=>assert.equal(run('_keyStepAt'),.5));padEv('pointerup',14,4);await flush();
 check('STEP chord lands on one step',()=>{assert.deepEqual(phrase().notes.slice(2).map(n=>[n.pitch,n.beat]),[[48,.5],[52,.5]]);assert.equal(run('_keyStepAt'),.75);});
 el('keyStepRest').click();el('keyStepBack').click();el('keyStepBack').click();check('REST and BACK move the cursor by one step',()=>assert.equal(run('_keyStepAt'),.5));
 padEv('pointerdown',12,5);padEv('pointerup',12,5);await flush();check('STEP replaces the same pitch at the same step instead of stacking',()=>assert.equal(phrase().notes.filter(n=>n.beat===.5).length,2));
 el('keyStep').click();
 // REC：聞こえた拍（出力の遅れを引く）で記録、SNAP の細かさに揃える。長さは押していた長さ
 run('_keyRecOn=true;_keyLoop={target:0,t0:0,beats:8,len:8*_keyBeatSec(),next:99,click:99,nodes:new Set(),out:{gain:{setTargetAtTime(){}},disconnect(){}},timer:0,raf:0}');
 context.AC.currentTime=.6*2.1;padEv('pointerdown',15,6);context.AC.currentTime=.6*3.0;padEv('pointerup',15,6);await flush();
 check('REC records at the snapped beat with the held length',()=>assert.ok(phrase().notes.some(n=>n.pitch===53&&n.beat===2&&n.length===1),JSON.stringify(phrase().notes)));
 context.AC.outputLatency=.06;context.AC.currentTime=.6*4.1+.06;padEv('pointerdown',12,7);context.AC.currentTime=.6*4.3+.06;padEv('pointerup',12,7);await flush();
 check('REC subtracts output latency and keeps at least one grid step',()=>assert.ok(phrase().notes.some(n=>n.pitch===48&&n.beat===4&&n.length===.25),JSON.stringify(phrase().notes)));
 context.AC.outputLatency=0;context.AC.currentTime=.6*7.95;padEv('pointerdown',14,8);context.AC.currentTime=.6*8.6;padEv('pointerup',14,8);await flush();
 check('REC wraps a note pressed at the very end to the loop start',()=>assert.ok(phrase().notes.some(n=>n.pitch===52&&n.beat===0&&n.length===.75),JSON.stringify(phrase().notes)));
 run('_keyLoopStop()');check('stopping the loop also ends REC',()=>{assert.equal(run('_keyLoop'),null);assert.equal(run('_keyRecOn'),false);});
 context.AC.currentTime=0;run('keyEditorClose()');check('closing the editor releases held keys and stops entry modes',()=>{assert.equal(run('_keyLive.size'),0);assert.equal(run('_keyStepOn'),false);});
 run('keyEditorOpen(0)');}
// v0.3.210 §199：MORE は大きなボタン。押すと隠れた入力（KEY / SCALE / BARS / TOOL）へ渡り、押された物＝いまの値。ページは覚える
{const more=(data)=>{for(const f of el('keyExtra').listeners.click||[])f({target:{closest:()=>({dataset:data})}});};
 context.tracks[0].keyPhrase={bars:1,notes:[{pitch:60,beat:0,length:1,velocity:90}]};run('keyEditorOpen(0)');
 more({root:'7'});await flush();more({scale:'dorian'});await flush();more({bars:'3'});await flush();more({tool:'right'});
 check('MORE buttons set key, scale, bars and tool',()=>{const p=phrase();assert.equal(p.editor.root,7);assert.equal(p.editor.scale,'dorian');assert.equal(p.bars,3);assert.equal(el('keyDragMode').value,'right');});
 more({moreTab:'view'});check('MORE remembers the page it was on',()=>assert.equal(run('_keyMoreTab'),'view'));
 more({moreTab:'chords'});run('_keyMoreShow(true)');more({preset:'komuro'});for(let k=0;k<40&&!run('_keyLoop');k++)await new Promise(r=>setTimeout(r,5));
 check('a chord button applies the progression and closes MORE',()=>{assert.equal(phrase().notes.length,16);assert.equal(el('keyExtra').hidden,true);});
 run('_keyLoopStop()');el('keyUndo').click();await flush();el('keyUndo').click();await flush();el('keyUndo').click();await flush();el('keyUndo').click();await flush();el('keyUndo').click();await flush();
 el('keyDragMode').value='auto';run('keyEditorOpen(0)');}
// v0.3.211 §200：KEY の CHOP の切れ目は打ち込みから（和音は 1 つ・最大 16）
{const q=context.keyPresetPhrase('komuro',0),p=context.normalizeKeyPhrase({bars:q.bars,notes:q.notes});
 check('CHOP by chord cuts at each chord change',()=>assert.equal(JSON.stringify(context.keyChopBeats(p,'chord')),'[0,4,8,12]'));
 check('CHOP by bar / 2 beats / beat',()=>{assert.equal(JSON.stringify(context.keyChopBeats(p,'bar')),'[0,4,8,12]');assert.equal(context.keyChopBeats(p,'half').length,8);assert.equal(context.keyChopBeats(p,'beat').length,16);});
 const arp=context.normalizeKeyPhrase({bars:4,notes:Array.from({length:40},(_,k)=>({pitch:60+k%5,beat:k*.25,length:.25,velocity:90}))});
 check('CHOP never makes more than 16 slices',()=>assert.equal(context.keyChopBeats(arp,'chord').length,16));
 check('an empty phrase has nothing to CHOP',()=>assert.equal(context.keyChopBeats(context.normalizeKeyPhrase({bars:2,notes:[]}),'chord').length,0));}
// v0.3.212 §201：START / END（拍）。既定は全体、END が最後なら null（余韻まで）。パッドの START / END に写る・CHOP は範囲の中・並べ方は KEY のパッドを触らない
{const N=context.normalizeKeyPhrase;
 check('range defaults to the whole phrase',()=>assert.equal(JSON.stringify(N({bars:2}).range),'{"start":0,"end":null}'));
 check('range is clamped when bars shrink and END at the end means to the tail',()=>{assert.equal(JSON.stringify(N({bars:1,range:{start:2,end:7}}).range),'{"start":2,"end":null}');assert.equal(JSON.stringify(N({bars:2,range:{start:1,end:5}}).range),'{"start":1,"end":5}');});
 const t={padKind:'KEY',keyPhrase:{bars:2,notes:[{pitch:60,beat:0,length:1,velocity:90}],range:{start:1,end:5}}};await context.prepareKeyTrack(t,100);
 check('START / END become the pad start and end',()=>{assert.ok(Math.abs(t.start-.6/t.buffer.duration)<1e-9);assert.ok(Math.abs(t.end-3/t.buffer.duration)<1e-9);});
 t.keyPhrase.range={start:0,end:null};await context.prepareKeyTrack(t,100);check('the whole phrase plays to the end of the tail',()=>{assert.equal(t.start,0);assert.equal(t.end,1);});
 const q=context.keyPresetPhrase('komuro',0),p=N({bars:q.bars,notes:q.notes,range:{start:4,end:12}});
 check('CHOP cuts only inside START / END',()=>{assert.equal(JSON.stringify(context.keyChopBeats(p,'chord')),'[4,8]');assert.equal(JSON.stringify(context.keyChopBeats(p,'beat')),'[4,5,6,7,8,9,10,11]');});
 check('CHOP never overwrites the KEY pad: right side, else left side, else the larger side',()=>{assert.equal(JSON.stringify(context.keyChopLayout(4,4)),'{"anchor":5,"N":4}');assert.equal(JSON.stringify(context.keyChopLayout(14,4)),'{"anchor":10,"N":4}');assert.equal(JSON.stringify(context.keyChopLayout(7,16)),'{"anchor":8,"N":8}');assert.equal(JSON.stringify(context.keyChopLayout(10,16)),'{"anchor":0,"N":10}');});
 run('_keyLoop={rs:4,beats:8,t0:0,next:99,click:99}');context.AC.currentTime=.6*9.5;check('the loop clock runs from START',()=>assert.ok(Math.abs(run('_keyLoopBeat()')-5.5)<1e-9));run('_keyLoop=null');context.AC.currentTime=0;}
// v0.3.207 §196：CHORDS＝定番の進行のプリセット。どのキーでも正しいフレーズ・いまの KEY へ移す・SCALE も合わせる・UNDO 1 回で戻る
check('every chord preset is a valid phrase in every key',()=>{for(const p of run('KEY_PRESETS'))for(const r of [0,2,5,6,11]){const q=context.keyPresetPhrase(p.id,r),n=context.normalizeKeyPhrase({bars:q.bars,notes:q.notes});assert.equal(n.notes.length,q.notes.length,p.id+' '+r);assert.ok(q.notes.every(x=>x.pitch>=28&&x.pitch<=84&&x.beat+x.length<=q.bars*4+1e-9),p.id+' '+r);}});
check('the preset menu lists every progression',()=>{const groups=el('keyChordPreset').children.filter(c=>c.label!==undefined||c.children.length);assert.equal(groups.reduce((s,g)=>s+g.children.length,0),run('KEY_PRESETS.length'));});
{context.tracks[0].keyPhrase={bars:1,notes:[{pitch:72,beat:0,length:1,velocity:90}],editor:{root:2,scale:'minor'}};run('keyEditorOpen(0)');const u0=history.length;
 await run('keyApplyPreset("twofive")');
 check('a preset replaces the notes in the current key and sets its scale',()=>{const p=phrase();assert.equal(p.bars,4);assert.equal(p.editor.root,2);assert.equal(p.editor.scale,'major');assert.equal(p.editor.scaleEnabled,true);assert.equal(Math.min(...p.notes.map(n=>n.pitch)),38);assert.ok(!p.notes.some(n=>n.pitch===72&&n.beat===0));assert.equal(history.length,u0+1);});
 check('applying a preset starts the loop so it is heard',()=>assert.ok(run('_keyLoop')));run('_keyLoopStop()');
 el('keyUndo').click();await flush();check('one UNDO brings back the previous notes',()=>assert.deepEqual(phrase().notes.map(n=>n.pitch),[72]));
 run('keyEditorOpen(0)');}
// Regression: returning to KEY after restoring its original sample must not
// accept that SPL buffer just because the old KEY signature is still present.
const sample=new Buffer(1,128,26000);sample.a[0]=.8;
Object.assign(context.tracks[0],{padKind:'SPL',buffer:sample,rawBuffer:sample,_keySignature:null,sampleState:null,start:0,end:1,loop:false,loopStart:0,keyPhrase:{bars:1,notes:[{pitch:60,beat:0,length:1,velocity:96}]}});context.PADS[0]={type:'sample',voice:null};
await context.setPadKind(0,'KEY');const keyAudio=context.tracks[0].buffer;
await context.setPadKind(0,'SPL');check('KEY→SPL restores the original sample',()=>assert.equal(context.tracks[0].buffer,sample));
await context.setPadKind(0,'KEY');check('KEY→SPL→KEY reuses KEY audio, never SPL',()=>{assert.notEqual(context.tracks[0].buffer,sample);assert.equal(context.tracks[0].buffer,keyAudio);});
for(const kind of ['SCR','SPL','SCR']){await context.setPadKind(0,kind);await context.setPadKind(0,'KEY');}
check('repeated KEY/SCR/SPL changes retain the KEY phrase and voice',()=>{assert.equal(context.tracks[0].buffer,keyAudio);assert.equal(context.tracks[0].keyPhrase.notes[0].pitch,60);});
// v0.3.206 §195：KEY → SAMPLE / SCRATCH で「この KEY を波形にする」＝KEY の音がそのパッドの波形に（KEY の印は付けない）。KEY に戻せば打ち込みはそのまま
for(const kind of ['SPL','SCR']){await context.setPadKind(0,kind,'bake');const t=context.tracks[0];
 check('KEY→'+kind+' bake turns the KEY audio into this pad\'s waveform',()=>{assert.equal(t.padKind,kind);assert.notEqual(t.buffer,keyAudio);assert.notEqual(t.buffer,sample);assert.equal(t.buffer.length,keyAudio.length);assert.deepEqual([...t.buffer.getChannelData(0).slice(0,4000)],[...keyAudio.getChannelData(0).slice(0,4000)]);assert.equal(t.rawBuffer,t.buffer);assert.equal(run('_keyBuffers.has(tracks[0].buffer)'),false);assert.equal(t._keySignature,null);});
 await context.setPadKind(0,'KEY');check('KEY after a '+kind+' bake still has the phrase',()=>assert.equal(context.tracks[0].keyPhrase.notes[0].pitch,60));}
await context.setPadKind(0,'SPL','restore');check('restore still brings back the sample saved before KEY',()=>assert.equal(context.tracks[0].buffer.length,context.tracks[0].sampleState.buffer.length));
await context.setPadKind(0,'KEY');
const asked=[];el('keyLeaveAsk').hidden=true;context.keyLeaveChoice(0,'SPL').then(v=>asked.push(v));
check('leaving a KEY with notes asks first',()=>{assert.equal(el('keyLeaveAsk').hidden,false);assert.equal(el('keyLeaveTo').textContent,'SAMPLE');});
el('keyLeaveAsk').listeners.click[0]({target:{closest:()=>({dataset:{leave:'bake'}})},currentTarget:el('keyLeaveAsk')});await flush();
check('choosing in the dialog answers and closes it',()=>{assert.deepEqual(asked,['bake']);assert.equal(el('keyLeaveAsk').hidden,true);});
context.keyLeaveChoice(0,'SCR').then(v=>asked.push(v));el('keyLeaveAsk').listeners.click[0]({target:{closest:()=>({dataset:{leave:''}})},currentTarget:el('keyLeaveAsk')});await flush();
check('CANCEL keeps the pad as it was',()=>{assert.deepEqual(asked,['bake',null]);assert.equal(context.tracks[0].padKind,'KEY');});
context.tracks[0].keyPhrase={bars:1,notes:[]};let quiet=null;await context.keyLeaveChoice(0,'SPL').then(v=>quiet=v);context.tracks[0].keyPhrase={bars:1,notes:[{pitch:60,beat:0,length:1,velocity:96}]};
check('an empty KEY does not ask',()=>assert.equal(quiet,'restore'));
await context.prepareKeyTrack(context.tracks[0],100);
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
