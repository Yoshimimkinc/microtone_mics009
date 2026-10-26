import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';
const audioText=fs.readFileSync(new URL('../src/js/audio/scratch-pad.js',import.meta.url),'utf8');let registered,passed=0;
const sourceContext={};vm.createContext(sourceContext);vm.runInContext(audioText,sourceContext);
const dspContext={Float32Array,Math,Number,sampleRate:26000,AudioWorkletProcessor:class{constructor(){this.port={postMessage(){}};}},registerProcessor:(name,ctor)=>registered=ctor};vm.createContext(dspContext);vm.runInContext(vm.runInContext('_scratchCode',sourceContext),dspContext);
const check=(label,fn)=>{fn();console.log('PASS '+label);passed++;};const data=Float32Array.from({length:2600},(_,i)=>Math.sin(i*.1));
const head=new registered({processorOptions:{data}}),out=()=>{const o=[[new Float32Array(128)]];const alive=head.process([],o);return {samples:o[0][0],alive};},message=m=>head.port.onmessage({data:m});
let block=out();check('motor advances sample head at normal speed',()=>{assert.equal(head.head.pos,128);assert.ok(block.samples.some(x=>x!==0));});
// v0.3.179：掴むと手の止まる所まで数 ms で減速して止まる（一瞬で止めるとクリック）。止まったら完全に無音
message({type:'hold',on:true});const held=head.head.pos;for(let k=0;k<30;k++)block=out();const settled=head.head.pos;out();
check('holding record decelerates smoothly and then stays silent without a jump',()=>{assert.ok(settled>held&&settled-held<400);assert.equal(head.head.pos,settled);assert.ok(block.samples.every(x=>x===0));});
message({type:'drag',delta:1000});out();check('forward platter motion reads forward',()=>assert.ok(head.head.pos>held));
message({type:'drag',delta:-1000});for(let i=0;i<25;i++)block=out();check('backward motion crosses sample start without wrap-target jumps',()=>{assert.ok(head.head.pos<0);assert.ok(block.samples.every(Number.isFinite));});
const before=head.head.pos;message({type:'hold',on:false});out();const early=head.head.pos;for(let k=0;k<200;k++)out();
check('release winds the motor back up from the scratched position (no click)',()=>{assert.ok(early>before&&early-before<128);assert.equal(head.head.vel,1);});
// v0.3.186 惰性：速く送って離すとすぐ 1 倍に戻らず、摩擦で少しずつ落ちる
message({type:'hold',on:true});for(let k=0;k<4;k++){message({type:'drag',delta:(k+1)*400,t:k*5});out();}const flung=head.head.vel;message({type:'hold',on:false});for(let k=0;k<20;k++)out();const coasting=head.head.vel;
check('a fast push keeps spinning a little after release (throw inertia)',()=>{assert.ok(flung>2,String(flung));assert.ok(coasting>1.2&&coasting<flung,String(coasting));});
for(let k=0;k<800;k++)out();check('the thrown record settles back to motor speed',()=>assert.equal(head.head.vel,1));
message({type:'motor',on:false});for(let k=0;k<200;k++)block=out();const paused=head.head.pos;block=out();check('paused motor brakes to a stop and emits silence without DC',()=>{assert.equal(head.head.pos,paused);assert.ok(block.samples.every(x=>x===0));});
message({type:'hold',on:true});message({type:'drag',delta:200});block=out();check('manual scratching works while motor is paused',()=>assert.ok(block.samples.some(x=>Math.abs(x)>.001)));
message({type:'hold',on:false});out();check('release respects paused motor state',()=>assert.equal(head.head.motor,false));
message({type:'cue'});check('CUE seeks to sample start and releases hold',()=>{assert.equal(head.head.pos,0);assert.equal(head.head.drag,false);});
message({type:'seek',frame:1300});check('overview seek jumps the head when not held',()=>assert.equal(head.head.pos,1300));
message({type:'hold',on:true});message({type:'seek',frame:10});check('seek is ignored while the waveform is held',()=>assert.equal(head.head.pos,1300));message({type:'hold',on:false});
message({type:'stop'});check('closing the scratch processor releases its audio thread',()=>assert.equal(out().alive,false));

// Integration: real audio-unit open, gain routing, controls, stale-work guard.
const gains=[],nodes=[];let shown=0,hidden=0;
function gain(){const n={gain:{value:1,setValueAtTime(v){this.value=v;},linearRampToValueAtTime(v,t){this.value=v;this.rampEnd=t;}},connections:[],connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;}};gains.push(n);return n;}
const ctx={console,Math,Number,Float32Array,Promise,URL:{createObjectURL:()=> 'blob:qa',revokeObjectURL(){}},Blob,
 AC:{sampleRate:48000,currentTime:10,resume:async()=>{},audioWorklet:{addModule:async()=>{}},createGain:gain},
 AudioWorkletNode:class{constructor(ac,name,options){this.options=options;this.connections=[];this.messages=[];this.port={postMessage:m=>this.messages.push(m),close:()=>this.closed=true,onmessage:null};nodes.push(this);}connect(n){this.connections.push(n);}disconnect(){this.disconnected=true;}},
 tracks:[{padKind:'SCR',buffer:{length:data.length,sampleRate:26000,getChannelData:()=>data},start:0,end:1,vol:-4,filter:'off',delaySend:.2,reverbSend:.3,_contentEpoch:0}],GROUP_OF:[0],groupBus:[{}],multiOut:false,outBGain:{},tapeEcho:{},reverbPre:{},setCur:0,setLevelLin:()=>1,dbToGain:db=>10**(db/20),stopVoices(){},sampNameEl:{},scratchShow:()=>shown++,scratchHide:()=>hidden++,document:{getElementById:()=>({textContent:''})},stopTransport(){throw Error('scratch must not stop backing');}};
vm.createContext(ctx);vm.runInContext(audioText,ctx);await ctx.scratchOpen(0);
check('SCR opens the platter and resamples into the shared context rate',()=>{assert.equal(shown,1);assert.equal(nodes[0].options.processorOptions.levels[0][0].length,4800);assert.equal(ctx.scratchState().duration,.1);});
check('SCR keeps band-limited copies for fast scratching (1/2 … 1/16)',()=>{const L=nodes[0].options.processorOptions.levels[0];assert.equal(L.length,5);assert.equal(L[1].length,2400);assert.equal(L[4].length,300);});
const cut=gains[0],volume=gains[1];check('crossfader sits before dry and FX sends, outside the backing bus',()=>{assert.equal(cut.gain.value,0);assert.equal(nodes[0].connections[0],cut);assert.equal(cut.connections[0],volume);assert.ok(volume.connections.includes(ctx.groupBus[0]));assert.equal(volume.connections.length,3);});
const volumeBefore=volume.gain.value;ctx.scratchSetFader(0);check('fader cuts only scratch audio',()=>{assert.equal(cut.gain.value,0);assert.equal(volume.gain.value,volumeBefore);});
{const near=ctx.scratchSetFader(.2),back=ctx.scratchSetFader(0),far=ctx.scratchSetFader(1);ctx.scratchSetFader(0);
 check('fader cap travels at a steady speed: a near (top) point opens fast, a far (bottom) point slowly — never an instant switch',()=>{assert.ok(Math.abs(near-.024)<1e-9,String(near));assert.ok(Math.abs(far-.12)<1e-9,String(far));assert.ok(back>=.003);assert.ok(Math.abs(cut.gain.rampEnd-(10+back))<1e-9||cut.gain.rampEnd>10);});}
ctx.scratchSetFader(2);check('fader clamps to its valid range',()=>assert.equal(ctx.scratchState().fader,1));
ctx.scratchHold(true);ctx.scratchDrag(-2400);ctx.scratchMotor(false);check('audio controls send independent hold, drag and motor commands',()=>assert.deepEqual(nodes[0].messages.slice(-3).map(m=>m.type),['hold','drag','motor']));
ctx.scratchClose();check('close disconnects source, sends and fader',()=>{assert.ok(nodes[0].closed&&nodes[0].disconnected);assert.ok(gains.every(n=>n.disconnected));assert.ok(hidden>=1);});
vm.runInContext('_scratchModule=null',ctx);let release,started;const moduleStarted=new Promise(r=>started=r);ctx.AC.audioWorklet.addModule=()=>{started();return new Promise(r=>release=r);};const pending=ctx.scratchOpen(0);await moduleStarted;ctx.tracks[0]._contentEpoch++;release();await pending;
check('late worklet load cannot open a replaced pad',()=>assert.equal(nodes.length,1));

// The compatibility driver runs exactly the same core and control protocol.
const fallbackNodes=[];ctx.AC.audioWorklet=null;ctx.AC.createScriptProcessor=()=>{const n={connections:[],connect(to){this.connections.push(to);},disconnect(){this.disconnected=true;}};fallbackNodes.push(n);return n;};
await ctx.scratchOpen(0);const fallback=fallbackNodes[0],fbOut=new Float32Array(512);fallback.onaudioprocess({outputBuffer:{getChannelData:()=>fbOut}});
check('compatibility path opens and produces scratch audio',()=>{assert.equal(fallbackNodes.length,1);assert.ok(fbOut.some(x=>Math.abs(x)>.001));});
ctx.scratchHold(true);for(let k=0;k<8;k++)fallback.onaudioprocess({outputBuffer:{getChannelData:()=>fbOut}});check('compatibility record hold uses the same silent-stop core',()=>assert.ok(fbOut.every(x=>x===0)));
ctx.scratchClose();check('compatibility close releases callback and graph',()=>{assert.equal(fallback.onaudioprocess,null);assert.equal(fallback.disconnected,true);});
// UI: vertical strip / swipe fader (v0.3.186) and a second pointer's fader do not disturb platter capture.
const els=new Map(),noop=()=>{},drawing=new Proxy({},{get:()=>noop,set:()=>true});
function el(id){if(!els.has(id))els.set(id,{id,hidden:false,clientWidth:300,width:0,height:0,value:1,listeners:{},classList:{set:new Set(),toggle(k,on){on?this.set.add(k):this.set.delete(k);},contains(k){return this.set.has(k);}},style:{setProperty(k,v){this[k]=v;}},setAttribute(k,v){this[k]=v;},addEventListener(k,f){this.listeners[k]=f;},getContext:()=>drawing,getBoundingClientRect:()=>({left:0,top:0,width:300,height:300}),setPointerCapture:noop});return els.get(id);}
const state={position:.2,frame:520,duration:.1,motor:true,dragging:false,fader:1,rate:26000,wave:new Float32Array(2600).map((_,k)=>Math.sin(k/9))},moves=[],seeks=[];let cancels=0;
const ui={console,Math,Number,window:{devicePixelRatio:2,addEventListener:()=>{}},document:{getElementById:el},requestAnimationFrame:()=>1,cancelAnimationFrame:()=>cancels++,tracks:[{name:'SCR TEST'}],scratchState:()=>state,scratchHold:on=>state.dragging=on,scratchDrag:d=>moves.push(d),scratchMotor:on=>state.motor=on,scratchSetFader:v=>state.fader=Math.max(0,Math.min(1,v)),scratchCue:()=>{state.frame=0;state.dragging=false;},scratchSeek:f=>seeks.push(f),scratchClose:()=>ui.scratchHide()};
vm.createContext(ui);vm.runInContext(fs.readFileSync(new URL('../src/js/ui/scratch-view.js',import.meta.url),'utf8'),ui);
ui.scratchShow(0);const cv=el('scratchDeck'),e=(x,y,id=1)=>({clientX:x,clientY:y,pointerId:id,preventDefault:noop});const T=y=>ui.scratchStripTime(y,300);
check('the middle of the strip is 220 px = 1 s; the top is twice as sensitive, the bottom half',()=>{const slope=y=>(T(y+.01)-T(y-.01))/.02*220;assert.ok(Math.abs(slope(150)-1)<1e-6);assert.ok(Math.abs(slope(0)-2)<1e-3);assert.ok(Math.abs(slope(300)-.5)<1e-3);});
cv.onpointerdown(e(150,240));cv.onpointermove(e(20,196));
check('pushing the strip away (up) moves forward, locked to the waveform under the finger, sideways ignored',()=>{assert.equal(state.dragging,true);assert.ok(Math.abs(moves[0]-(T(240)-T(196))*26000)<1e-6);assert.ok(moves[0]>0);});
cv.onpointermove(e(150,284));check('pulling toward you (down) plays backwards',()=>assert.ok(moves[1]<0&&Math.abs(moves[1]-(T(240)-T(284))*26000)<1e-6));
check('the same 44 px stroke moves more audio near the top than near the bottom',()=>assert.ok((T(60)-T(16))>2*(T(284)-T(240))));moves.length=1;
check('peaks are normalised per 64-frame block',()=>{const P=ui.scratchPeaks(state.wave);assert.equal(P.peak.length,Math.ceil(2600/64));assert.ok(Math.abs(Math.max(...P.peak)-1)<1e-6);});
cv.onpointerdown(e(240,150,2));cv.onpointermove(e(150,60,2));check('second platter pointer cannot steal the held record',()=>assert.equal(moves.length,1));
const gate=el('scratchFader');   // 高さ 300：上から 18%（54px）が全閉の線、下端で全開
gate.listeners.pointerdown(e(0,177,2));check('touching the fader opens it to that point while another pointer holds the record',()=>{assert.equal(state.dragging,true);assert.ok(Math.abs(state.fader-.5)<1e-9);assert.equal(el('scratchFaderRead').textContent,'VOL 50%');});
gate.listeners.pointermove(e(0,400,2));check('sliding toward you follows the finger and clamps at fully open',()=>assert.equal(state.fader,1));
gate.listeners.pointermove(e(0,20,2));check('above the line is closed',()=>assert.equal(state.fader,0));gate.listeners.pointermove(e(0,300,2));
gate.listeners.pointerup(e(0,300,2));check('releasing the fader closes it fully, the platter stays held',()=>{assert.equal(state.dragging,true);assert.equal(state.fader,0);assert.equal(el('scratchFaderRead').textContent,'CLOSED');});
gate.listeners.pointerdown(e(0,250,2));gate.listeners.pointercancel(e(0,250,2));check('cancelled touch cannot leave the fader open',()=>assert.equal(state.fader,0));
const key={code:'Space',repeat:false,preventDefault:noop,stopPropagation:noop};gate.listeners.keydown(key);check('keyboard hold opens the gate',()=>assert.equal(state.fader,1));gate.listeners.keyup(key);check('keyboard release closes the gate',()=>assert.equal(state.fader,0));
gate.listeners.keydown(key);gate.listeners.blur();check('focus loss closes a held key gate',()=>assert.equal(state.fader,0));
cv.onpointerup(e(240,150));check('record release ends hold without resetting the fader',()=>{assert.equal(state.dragging,false);assert.equal(state.fader,0);});
const ov=el('scratchOverview');ov.onpointerdown(e(75,10,3));check('tapping the overview seeks to that point',()=>assert.ok(Math.abs(seeks[0]-.25*2599)<1e-6));ov.onpointerup(e(75,10,3));
el('scratchHand').listeners.click();check('hand swap moves the fader to the left side',()=>{assert.equal(el('scratchSurface').classList.contains('swap'),true);assert.equal(el('scratchHand')['aria-pressed'],'true');});el('scratchHand').listeners.click();check('hand swap toggles back',()=>assert.equal(el('scratchSurface').classList.contains('swap'),false));
el('scratchPlay').listeners.click();check('UI motor button pauses independently',()=>assert.equal(state.motor,false));ui.scratchHide();check('UI close clears capture handlers and animation',()=>{assert.equal(el('scratchEditor').hidden,true);assert.equal(cv.onpointerdown,null);assert.ok(cancels>0);});
const app=fs.readFileSync(new URL('../mics-609bc14b.html',import.meta.url),'utf8');check('retired guitar entry and message receiver are absent from the app',()=>{assert.ok(!app.includes('id="gtrBtn"')&&!app.includes('id="recGtr"'));assert.ok(!app.includes('gtr-take'));});
// External pad controls: real UI unit, startup races, independent MIDI channels.
ui.tracks[0].padKind='SCR';let resolveOpen,openCount=0;
ui.scratchOpen=i=>{openCount++;ui.scratchHide();return new Promise(resolve=>{resolveOpen=()=>{ui.scratchShow(i);resolve();};});};
check('SPL pads remain on the normal trigger path',()=>{ui.tracks.push({padKind:'SPL'});assert.equal(ui.scratchPadInputDown(1,'key:Digit2'),false);});
ui.scratchPadInputDown(0,'key:Digit1');ui.scratchPadInputUp('key:Digit1');resolveOpen();await Promise.resolve();
check('release before worklet startup cannot leave sound open',()=>assert.equal(state.fader,0));
ui.scratchPadInputDown(0,'key:Digit1');check('assigned PC pad key opens the current platter without restarting',()=>{assert.equal(state.fader,1);assert.equal(openCount,1);});
ui.scratchPadInputDown(0,'key:Digit1');check('repeated Note On/key down does not restart the platter',()=>assert.equal(openCount,1));
ui.scratchPadInputDown(0,'midi:0:60');ui.scratchPadInputUp('key:Digit1');check('one released source does not cut another held source',()=>assert.equal(state.fader,1));
ui.scratchPadInputDown(0,'midi:1:60');ui.scratchPadInputUp('midi:0:60');check('identical notes on different MIDI channels are independent',()=>assert.equal(state.fader,1));
ui.scratchPadInputUp('midi:1:60');check('last external release closes the gate and leaves the record open',()=>{assert.equal(state.fader,0);assert.equal(el('scratchEditor').hidden,false);});
ui.scratchHide();ui.scratchPadInputDown(0,'key:Digit1');ui.scratchPadInputDown(0,'midi:0:60');resolveOpen();await Promise.resolve();
check('simultaneous sources share one pending platter startup',()=>{assert.equal(openCount,2);assert.equal(state.fader,1);});
ui.scratchGateRelease();check('blur/close releases all external gate sources',()=>assert.equal(state.fader,0));
// Exercise the actual PC/MIDI entry points, rather than only the UI helper.
const inputs=[],releases=[],triggered=[],selectedPads=[],keyEvents={};
const inputCtx={console,performance:{now:()=>0},document:{activeElement:null,getElementById:()=>({classList:{remove:noop}})},window:{addEventListener:(type,fn)=>keyEvents[type]=fn},navigator:{},
 tracks:Array.from({length:16},()=>({})),KEYMAP:['1','2','3','4','5','6','7','8','q','w','e','r','t','y','u','i'],CODEMAP:[],STEP_KEYS:[],MELO_KEYS:[],assignTarget:-1,setMode:false,selected:0,
 AC:{state:'running',currentTime:0,resume:async()=>{}},scratchPadInputDown:(i,id)=>{inputs.push([i,id]);return i===0;},scratchPadInputUp:id=>releases.push(id),
 trigger:i=>triggered.push(i),selectPad:i=>selectedPads.push(i),inBlink:noop,isMelodic:()=>false,midiBlink:noop,setPadUp:noop,_ledT:0,setTimeout:()=>0,clearTimeout:noop};
vm.createContext(inputCtx);
const chop=fs.readFileSync(new URL('../src/js/52-chop.js',import.meta.url),'utf8');vm.runInContext(chop.slice(chop.indexOf('// keyboard'),chop.indexOf('// 全スライダー')),inputCtx);
const ke={key:'1',code:'Digit1',repeat:false,preventDefault:noop};await keyEvents.keydown(ke);keyEvents.keyup(ke);
check('default PC pad key routes press/release to SCR without sample trigger',()=>{assert.deepEqual(inputs.pop(),[0,'key:Digit1']);assert.equal(releases.pop(),'key:Digit1');assert.equal(triggered.length,0);});
inputCtx.tracks[0].key='x';await keyEvents.keydown({...ke,key:'x',code:'KeyX'});check('custom PC assignment routes to SCR before default step keys',()=>assert.deepEqual(inputs.pop(),[0,'key:KeyX']));
await keyEvents.keydown({...ke,key:'2',code:'Digit2'});check('ordinary sample pad keyboard playback is preserved',()=>assert.equal(triggered.pop(),1));
inputCtx.document.getElementById=()=>null;
vm.runInContext(fs.readFileSync(new URL('../src/js/72-midi.js',import.meta.url),'utf8'),inputCtx);vm.runInContext('midiEnabled=true',inputCtx);
inputCtx.handleMIDI([0x92,60,100]);inputCtx.handleMIDI([0x82,60,64]);check('MIDI default pad Note On/Off uses matching channel-aware gate source',()=>{assert.deepEqual(inputs.pop(),[0,'midi:2:60']);assert.equal(releases.pop(),'midi:2:60');assert.equal(triggered.length,0);});
inputCtx.tracks[0].midiNote=48;inputCtx.handleMIDI([0x90,48,100]);inputCtx.handleMIDI([0x90,48,0]);check('custom MIDI assignment and velocity-zero Note On close correctly',()=>{assert.deepEqual(inputs.pop(),[0,'midi:0:48']);assert.equal(releases.pop(),'midi:0:48');});
vm.runInContext('midiEnabled=false',inputCtx);inputCtx.handleMIDI([0x80,48,0]);check('MIDI Note Off is honored after input is disabled',()=>assert.equal(releases.pop(),'midi:0:48'));
// v0.3.179 §166 音質：手の速さが一定ならうなりが無い・速く擦っても折り返しノイズが出ない・ステレオ
{const rate=48000,N=rate*4,tone=f=>{const d=new Float32Array(N);for(let i=0;i<N;i++)d[i]=Math.sin(i*2*Math.PI*f/rate)*.5;return d;};
 const lv=d=>vm.runInContext('scratchLevels',ctx)({numberOfChannels:1,sampleRate:rate,length:N,getChannelData:()=>d},0,N,rate);
 const drive=(levels,speed)=>{const h=vm.runInContext('createScratchHead',ctx)(levels,rate),o=new Float32Array(128),vs=[];let acc=0,n=0,tot=0,t=0;
  h.message({type:'hold',on:true});for(let ev=0;ev<90;ev++){t+=1000/60;tot+=speed*rate/60;h.message({type:'drag',delta:tot,t});for(let b=0;b<6;b++){h.render([o]);if(ev>30){vs.push(h.speed);for(const x of o){acc+=x*x;n++;}}}}
  const m=vs.reduce((a,b)=>a+b,0)/vs.length;return {ripple:(Math.max(...vs)-Math.min(...vs))/m,rms:Math.sqrt(acc/n)};};
 const steady=drive(lv(tone(440)),1);check('steady hand at 1x plays without 60 Hz speed ripple (was 0.2–1.9x)',()=>assert.ok(steady.ripple<.05,String(steady.ripple)));
 const pass=drive(lv(tone(1000)),4),alias=drive(lv(tone(10000)),4);
 check('fast scratch keeps in-band tone and removes fold-back noise',()=>{assert.ok(pass.rms>.2,String(pass.rms));assert.ok(alias.rms<.02,String(alias.rms));});
 const st=vm.runInContext('scratchLevels',ctx)({numberOfChannels:2,sampleRate:rate,length:1000,getChannelData:c=>new Float32Array(1000).fill(c?-.5:.5)},0,1000,rate);
 check('stereo source keeps both channels',()=>{assert.equal(st.length,2);assert.ok(st[0][0][10]>.4&&st[1][0][10]<-.4);});}
console.log('All '+passed+' SCR checks passed.');
