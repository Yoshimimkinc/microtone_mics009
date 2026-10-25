// Live pad FX vs EDIT configuration. No step automation is involved.
import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
let undos=0,saves=0;const noop=()=>{};
const buttons=['filter','delay','reverb','mute'].map(lock=>({dataset:{lock},flags:{},classList:{toggle(k,v){buttons.find(b=>b.dataset.lock===lock).flags[k]=v;}}}));
const pads=Array.from({length:2},()=>({_lockfill:{style:{}},_lockv:{textContent:''}}));
const tracks=Array.from({length:2},()=>({filter:'off',cutoff:3200,delaySend:.2,reverbSend:.3,_contentEpoch:0,locks:{legacy:{delay:.9}}}));
const context={console,Math,Number,Date,performance:{now:()=>1000},tracks,PADS:[{},{}],padsEl:{children:pads},activeLock:null,armMode:null,editPat:0,
 PERF_BASE:{filter:'cutoff',delay:'delaySend',reverb:'reverbSend'},PLOCKS:{filter:{min:200,max:18000,log:true,color:'1,2,3',fmt:v=>String(Math.round(v))},delay:{min:0,max:1,color:'1,2,3',fmt:v=>String(Math.round(v*100))},reverb:{min:0,max:1,color:'1,2,3',fmt:v=>String(Math.round(v*100))}},
 document:{body:{classList:{toggle:noop}},querySelectorAll:()=>buttons,getElementById:()=>null},window:{addEventListener:noop},pushUndo:()=>undos++,scheduleAutosave:()=>saves++,syncEditor:noop,paintPerf:noop,sampNameEl:{textContent:''},arm:(mode,on)=>context.armMode=on?mode:null};
vm.createContext(context);vm.runInContext(fs.readFileSync(new URL('../src/js/ui/performance-view.js',import.meta.url),'utf8'),context);
const strip=fs.readFileSync(new URL('../src/js/41-step-strip.js',import.meta.url),'utf8'),start=strip.indexOf('function setActiveLock(');vm.runInContext(strip.slice(start,strip.indexOf('// スマホ',start)),context);
const run=code=>vm.runInContext(code,context),tap=p=>context.fxBtnTap(p),event=(x,y)=>({clientX:x,clientY:y,pointerId:1,preventDefault:noop});
let passed=0;function check(label,fn){fn();console.log('PASS '+label);passed++;}
const original=JSON.stringify(tracks);tap('filter');
check('normal FILTER selects live control without opening EDIT modal',()=>{assert.equal(context.activeLock,'filter');assert.equal(run('fxmParam'),null);assert.equal(buttons[0].flags.on,true);});
tap('filter');check('second tap deselects and preserves all current settings',()=>{assert.equal(context.activeLock,null);assert.equal(JSON.stringify(tracks),original);});
tap('delay');tap('delay');check('rapid normal taps never reset effect values',()=>assert.equal(JSON.stringify(tracks),original));
for(const effect of ['filter','delay','reverb']){context.armMode='edit';tap(effect);check('EDIT + '+effect+' opens its own parameter configuration',()=>assert.equal(run('fxmParam'),effect));}
run('fxmParam=null');context.armMode=null;tap('delay');
context.perfPadDown(event(100,100),0,{setPointerCapture:noop});context.perfPadMove(event(150,100),0);context.perfPadMove(event(170,100),0);context.perfPadEnd(event(170,100),0);
check('normal pad drag edits the persistent current value',()=>assert.ok(Math.abs(tracks[0].delaySend-.55)<1e-9));
check('one gesture is one undo and one autosave request',()=>{assert.equal(undos,1);assert.equal(saves,1);});
context.perfPadDown(event(100,100),0,{setPointerCapture:noop});context.perfPadMove(event(102,60),0);context.perfPadMove(event(220,60),0);context.perfPadEnd(event(220,60),0);
check('upward adjustment locks its axis and never double counts diagonals',()=>assert.ok(Math.abs(tracks[0].delaySend-.75)<1e-9));
const locks=JSON.stringify(tracks.map(t=>t.locks));check('live adjustment never writes step parameter locks',()=>assert.equal(locks,JSON.stringify([{legacy:{delay:.9}},{legacy:{delay:.9}}])));
tap('filter');context.perfPadDown(event(0,0),0,{setPointerCapture:noop});context.perfPadMove(event(40,0),0);context.perfPadEnd(event(40,0),0);
check('FILTER drag activates LP and adjusts cutoff',()=>{assert.equal(tracks[0].filter,'lp');assert.ok(tracks[0].cutoff>3200);assert.ok(tracks[0].cutoff<=18000);});
const cutoff=tracks[0].cutoff;context.perfPadDown(event(0,0),0,{setPointerCapture:noop});tracks[0]._contentEpoch++;context.perfPadMove(event(100,0),0);context.perfPadEnd(event(100,0),0);
check('a drag cannot write into a replaced or switched track',()=>assert.equal(tracks[0].cutoff,cutoff));
context.armMode='edit';check('EDIT pad gesture is left to the pad editor',()=>assert.equal(context.perfPadDown(event(0,0),0,{setPointerCapture:noop}),false));
tap('mute');check('MUTE stays a performance toggle and clears live FX selection',()=>{assert.equal(context.armMode,'mute');assert.equal(context.activeLock,null);assert.equal(run('fxmParam'),null);});
tap('mute');check('MUTE toggles off normally',()=>assert.equal(context.armMode,null));
tap('pitch');check('removed PITCH effect cannot select a live parameter',()=>assert.equal(context.activeLock,null));
console.log('All '+passed+' FX interaction checks passed.');
