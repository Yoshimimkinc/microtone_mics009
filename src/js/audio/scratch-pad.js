// @module audio/scratch-pad
// @provides SCR_FADER_TAU, _scratchCode, _scratchCut, _scratchDragging, _scratchDuration, _scratchFader,
//    _scratchFrame, _scratchFrameAt, _scratchGraph, _scratchModule, _scratchMotor, _scratchNode,
//    _scratchPos, _scratchSpeed, _scratchToken, _scratchWave, createScratchHead, scratchClose, scratchCue,
//    scratchDrag, scratchFallbackNode, scratchHold, scratchLevels, scratchMotor, scratchOpen, scratchSeek,
//    scratchSetFader, scratchState
// @uses AC, GROUP_OF, dbToGain, groupBus, multiOut, outBGain, reverbPre, sampNameEl, scratchHide,
//    scratchShow, setCur, setLevelLin, stopVoices, tapeEcho, tracks
// @depends -
// Audio unit: resampling, tape-head worklet, routing and scratch control state.
// UI/platter gestures live in ui/scratch-view.js. Backing transport is untouched.
let _scratchGraph=[],_scratchModule=null,_scratchNode=null,_scratchCut=null,_scratchToken=0;
let _scratchPos=0,_scratchFrame=0,_scratchFrameAt=0,_scratchDuration=0,_scratchMotor=true,_scratchDragging=false,_scratchFader=0,_scratchSpeed=0,_scratchWave=null;
// One tape-head calculation shared by the worklet and compatibility driver.
// v0.3.179 §166 で音を作り直した（「スクラッチモードの音質悪すぎ」）。v0.3.178 までの弱点と対策：
//  1. 指の動き（60Hz 前後の pointer イベント）を一次遅れで追っていた＝イベントのたびに速度が跳ね、1 倍で動かしても 0.2〜1.9 倍を
//     60Hz で往復していた（ブザー状のうなり）。→ イベントの時刻（event.timeStamp）から手の速さを出し、「次のイベントの頃に手が居る所」へ
//     いまの位置から一直線に進む（イベントが届くのが遅れても位置は跳ばない）。その位置を一次ローパス＋臨界制動のばね（2 次）で追う＝速度が連続になる。
//  2. 高速時に間引くだけ（線形補間・最大 24 倍）でエイリアシング。→ 1/2・1/4・1/8・1/16 に前もって帯域を落とした段（mipmap）を持ち、
//     速さに応じて段を選んで（隣の段とクロスフェード）4 点エルミート補間で読む。最大 12 倍。
//  3. 掴む・離す・止めるで速度が一瞬で変わりクリック。→ 掴むと手の止まる所まで自然に減速、離すと 25ms でモーターの速さへ（v0.3.186 で惰性に：下の w / wind / coast）、PAUSE は 40ms で止まる。
//     とても遅い時は音量も下げる（実際のレコードもほぼ聞こえない）＝止まっている時は無音、DC も出ない。
//  4. モノ（左だけ）・12bit に潰した音を読んでいた。→ ステレオ・元の音（rawBuffer）。12bit / 26kHz の味は出口の SP-DAC 段で付く。
// data：Float32Array（1 段・モノ）か、[チャンネル][段] の配列（scratchLevels が作る）
function createScratchHead(data,rate){
 const lv=Array.isArray(data)?(Array.isArray(data[0])?data:[data]):[[data]],N=lv[0][0].length;
 // v0.3.186 §174「微妙な惰性は必要。タッチのままの再生だと感覚的におかしいと脳が感じる」：盤に少し重さ（ばね 30→16Hz）、
 // 離すと惰性（速く送って離す＝摩擦で 0.35 秒かけて落ちる／遅い・逆向き＝モーターが 0.08 秒で引き戻す）
 const w=2*Math.PI*16/rate,pre=1-Math.exp(-2*Math.PI*45/rate),wind=1-Math.exp(-1/(rate*.08)),coast=1-Math.exp(-1/(rate*.35)),brake=1-Math.exp(-1/(rate*.04));
 const read=(a,x)=>{const n=a.length,i=Math.floor(x),f=x-i;let i1=i%n;if(i1<0)i1+=n;   // 4 点エルミート（音声スレッドで関数を作らない）
  const i0=i1?i1-1:n-1,i2=i1+1<n?i1+1:0,i3=i2+1<n?i2+1:0,y0=a[i0],y1=a[i1],y2=a[i2],y3=a[i3];
  return y1+.5*f*(y2-y0+f*(2*y0-5*y1+4*y2-y3+f*(3*(y1-y2)+y3-y0)));};
 return {levels:lv,pos:0,vel:1,target:0,origin:0,smooth:0,drag:false,motor:true,stopped:false,dc:lv.map(()=>({i:0,o:0})),speed:1,
  message(m){if(m.type==='stop')this.stopped=true;
   if(m.type==='hold'){this.fling=this.drag&&!m.on;this.drag=!!m.on;this.lastT=null;this.hv=0;this.hand=0;this.since=0;this.span=0;if(this.drag){this.origin=this.pos+this.vel/w;this.target=this.origin;this.smooth=this.origin;this.est=this.origin;}}   // 掴んだ所から自然に止まる位置を基準に
   if(m.type==='drag'&&this.drag&&Number.isFinite(m.delta)){const tgt=this.origin+m.delta;   // 手の速さ＝前のイベントからの移動÷時間（時刻が無ければ 0＝位置だけ追う）
    if(Number.isFinite(m.t)&&this.lastT!=null&&m.t>this.lastT){const dt=(m.t-this.lastT)/1000*rate,hand=Math.max(-12,Math.min(12,(tgt-this.target)/dt));
     this.span=Math.max(64,Math.min(dt,rate*.05));this.hand=hand;this.hv=Math.max(-12,Math.min(12,(tgt+hand*this.span-this.est)/this.span));}   // 次のイベントの頃の手の位置へ一直線
    else{this.est=tgt;this.hv=0;this.hand=0;this.span=0;}
    this.lastT=Number.isFinite(m.t)?m.t:null;this.target=tgt;this.since=0;}
   if(m.type==='motor'){this.motor=!!m.on;this.fling=false;}
   if(m.type==='cue'){this.pos=0;this.target=0;this.origin=0;this.smooth=0;this.drag=false;}
   if(m.type==='seek'&&!this.drag&&Number.isFinite(m.frame)){this.pos=m.frame;this.target=this.origin=this.smooth=this.est=m.frame;}},   // 全体波形のタップ＝その位置へ（掴んでいる間は動かさない）
  state(){return {frame:this.pos,position:N?((this.pos%N)+N)%N/N:0,speed:this.speed};},
  sample(c,x,s){const L=this.levels[c];if(s<=1.0001||L.length<2)return read(L[0],x);   // 速さに応じた段（帯域を落としたもの）を読む
   const g=Math.min(L.length-1.0001,Math.log2(s)),k=Math.floor(g),f=g-k,a=read(L[k],x/2**k);return f>0&&k+1<L.length?a+(read(L[k+1],x/2**(k+1))-a)*f:a;},
  lastT:null,hv:0,hand:0,since:0,span:0,est:0,fling:false,
  render(outs){const chans=Array.isArray(outs)?outs:[outs],len=chans[0].length;
   if(this.stopped||!N){chans.forEach(o=>o.fill(0));return false;}
   const src=this.levels.length;
   for(let j=0;j<len;j++){
    // 掴んでいる：次のイベントが遅れたら手の速さのまま（1 区間ぶんまで）進め、その位置をばねで追う
    if(this.drag){const k=this.since++;if(k<this.span)this.est+=this.hv;else if(k<2*this.span)this.est+=this.hand;
     const est=this.est;this.smooth+=(est-this.smooth)*pre;this.vel+=w*w*(this.smooth-this.pos)-2*w*this.vel;   // 臨界制動のばね
     if(Math.abs(this.vel)<2e-3&&Math.abs(est-this.pos)<1&&Math.abs(est-this.smooth)<.01)this.vel=0;}   // 手が止まって追いついたら止める（1 フレーム未満の残りは鳴らさない）
    else{const goal=this.motor?1:0,throwing=this.fling&&(goal?this.vel>goal:this.vel!==0);   // 離した直後：モーターより速く回っていれば惰性で、遅ければモーターが引き戻す
     this.vel+=(goal-this.vel)*(throwing?coast:goal?wind:brake);if(Math.abs(goal-this.vel)<1e-3){this.vel=goal;this.fling=false;}}
    this.vel=Math.max(-12,Math.min(12,this.vel));this.pos+=this.vel;this.speed=this.vel;
    const s=Math.abs(this.vel),amp=Math.min(1,s/.02)*.7;
    for(let c=0;c<chans.length;c++){const sc=Math.min(c,src-1),d=this.dc[sc],v=amp?this.sample(sc,this.pos,s)*amp:0,
     hi=v-d.i+.997*d.o;d.i=v;d.o=hi;chans[c][j]=amp?hi:(d.o=0,d.i=0,0);}   // 止まっている時は完全に無音（DC を残さない）
   }return true;
  }
 };
}
// 元の音を AudioContext のレートへ（4 点エルミート）＋ 1/2 ずつ帯域を落として間引いた段を作る（31 タップの窓付き sinc、遮断 0.45×新ナイキスト）
function scratchLevels(src,from,to,rate,levels=5){
 const chs=Math.min(2,src.numberOfChannels||1),ratio=src.sampleRate/rate,len=Math.max(1,Math.round((to-from)/ratio)),taps=31,h=new Float32Array(taps);
 let sum=0;for(let k=0;k<taps;k++){const n=k-(taps-1)/2,x=2*Math.PI*.225*n;h[k]=(n?Math.sin(x)/(Math.PI*n):.45)*(.42-.5*Math.cos(2*Math.PI*k/(taps-1))+.08*Math.cos(4*Math.PI*k/(taps-1)));sum+=h[k];}for(let k=0;k<taps;k++)h[k]/=sum;
 const out=[];
 for(let c=0;c<chs;c++){const raw=src.getChannelData(c),last=to-1,at=k=>raw[Math.max(from,Math.min(last,k))],base=new Float32Array(len);
  for(let j=0;j<len;j++){const x=from+j*ratio,i=Math.floor(x),f=x-i,y0=at(i-1),y1=at(i),y2=at(i+1),y3=at(i+2);base[j]=y1+.5*f*(y2-y0+f*(2*y0-5*y1+4*y2-y3+f*(3*(y1-y2)+y3-y0)));}
  const L=[base];for(let l=1;l<levels&&L[l-1].length>=64;l++){const a=L[l-1],n=a.length,b=new Float32Array(Math.ceil(n/2));
   for(let j=0;j<b.length;j++){let acc=0;const c0=j*2-(taps-1)/2;for(let k=0;k<taps;k++){const q=c0+k;acc+=h[k]*a[((q%n)+n)%n];}b[j]=acc;}L.push(b);}
  out.push(L);}
 return out;
}
const _scratchCode=`const createScratchHead=${createScratchHead.toString()};
class PadTapeHead extends AudioWorkletProcessor{
 constructor(o){super();this.head=createScratchHead(o.processorOptions.levels||o.processorOptions.data,sampleRate);this.count=0;this.port.onmessage=e=>this.head.message(e.data);}
 process(i,o){if(!this.head.render(o[0]))return false;if(++this.count%2===0)this.port.postMessage(this.head.state());return true;}
}registerProcessor('mics-pad-tape-head',PadTapeHead);`;
function scratchFallbackNode(data){
 const node=AC.createScriptProcessor(512,0,2),head=createScratchHead(data,AC.sampleRate);
 node.port={onmessage:null,postMessage:m=>head.message(m),close:()=>{node.onaudioprocess=null;}};
 node.onaudioprocess=e=>{const b=e.outputBuffer;head.render(Array.from({length:b.numberOfChannels||1},(_,c)=>b.getChannelData(c)));if(node.port.onmessage)node.port.onmessage({data:head.state()});};return node;
}
// 表示の位置＝音声スレッドの最後の位置＋その時の速さ×経過（最大 0.1 秒。波形が指と音にぴったり付いて動く）
function scratchState(){return {position:_scratchPos,frame:_scratchFrame+(_scratchNode?_scratchSpeed*Math.min(.1,Math.max(0,AC.currentTime-_scratchFrameAt))*AC.sampleRate:0),duration:_scratchDuration,motor:_scratchMotor,dragging:_scratchDragging,fader:_scratchFader,rate:AC.sampleRate,speed:_scratchSpeed,wave:_scratchWave};}
function scratchHold(on){if(!_scratchNode)return;_scratchDragging=!!on;_scratchNode.port.postMessage({type:'hold',on:!!on});}
function scratchDrag(frames,t){if(_scratchNode&&Number.isFinite(frames))_scratchNode.port.postMessage({type:'drag',delta:frames,t});}   // t：指のイベントの時刻（ms）＝手の速さを出す
function scratchMotor(on){_scratchMotor=!!on;if(_scratchNode)_scratchNode.port.postMessage({type:'motor',on:_scratchMotor});}
function scratchCue(){_scratchDragging=false;_scratchFrame=0;_scratchPos=0;_scratchFrameAt=AC.currentTime;if(_scratchNode)_scratchNode.port.postMessage({type:'cue'});}
function scratchSeek(frame){if(!_scratchNode||_scratchDragging||!Number.isFinite(frame))return;_scratchFrame=frame;_scratchFrameAt=AC.currentTime;_scratchNode.port.postMessage({type:'seek',frame});}
// 一瞬で切り替えず、素早く動かしたフェーダーのように（時定数 8ms＝約 25ms でほぼ開き切る／閉じ切る。v0.3.188 §176）
const SCR_FADER_TAU=.008;
function scratchSetFader(value){_scratchFader=Math.max(0,Math.min(1,+value||0));if(_scratchCut){const g=_scratchCut.gain;if(g.cancelScheduledValues)g.cancelScheduledValues(AC.currentTime);g.setTargetAtTime(_scratchFader,AC.currentTime,SCR_FADER_TAU);}}
function scratchClose(){
 _scratchToken++;
 if(_scratchNode){_scratchNode.port.postMessage({type:'stop'});_scratchNode.port.onmessage=null;_scratchNode.port.close();_scratchNode.disconnect();_scratchNode=null;}
 _scratchGraph.forEach(n=>n.disconnect());_scratchGraph=[];_scratchCut=null;_scratchDragging=false;_scratchWave=null;
 if(typeof scratchHide==='function')scratchHide();
}
async function scratchOpen(i){
 scratchClose();const t=tracks[i];if(!t?.buffer){sampNameEl.textContent='SCR：サンプルを読み込んでください';return;}
 const token=++_scratchToken,epoch=t._contentEpoch||0;await AC.resume();
 let useWorklet=!!AC.audioWorklet;
 if(!useWorklet&&typeof AC.createScriptProcessor!=='function'){sampNameEl.textContent='このブラウザはスクラッチ音声に対応していません';return;}
 if(useWorklet&&!_scratchModule){const url=URL.createObjectURL(new Blob([_scratchCode],{type:'text/javascript'}));_scratchModule=AC.audioWorklet.addModule(url).finally(()=>URL.revokeObjectURL(url)).catch(e=>{_scratchModule=null;throw e;});}
 if(useWorklet)try{await _scratchModule;}catch(e){if(typeof AC.createScriptProcessor==='function')useWorklet=false;else{sampNameEl.textContent='SCRを開始できません：'+e.message;return;}}
 if(token!==_scratchToken||tracks[i]!==t||(t._contentEpoch||0)!==epoch||t.padKind!=='SCR')return;
 stopVoices(t,AC.currentTime);
 // 元の音（12bit に潰す前の rawBuffer。長さが違っても START / END は同じ割合）を読む
 const src=(t.rawBuffer&&t.rawBuffer.length)?t.rawBuffer:t.buffer,from=Math.max(0,Math.min(src.length-1,Math.floor((t.start||0)*src.length))),to=Math.min(src.length,Math.max(from+1,Math.ceil((t.end??1)*src.length)));
 const levels=scratchLevels(src,from,to,AC.sampleRate),len=levels[0][0].length;
 const node=useWorklet?new AudioWorkletNode(AC,'mics-pad-tape-head',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2],processorOptions:{levels}}):scratchFallbackNode(levels);
 _scratchNode=node;_scratchPos=0;_scratchFrame=0;_scratchFrameAt=AC.currentTime;_scratchDuration=len/AC.sampleRate;_scratchMotor=true;_scratchDragging=false;_scratchFader=0;_scratchSpeed=1;_scratchWave=levels[0][0];
 node.port.onmessage=e=>{if(node!==_scratchNode||!Number.isFinite(e.data?.frame))return;_scratchFrame=e.data.frame;_scratchPos=e.data.position;_scratchSpeed=Number.isFinite(e.data.speed)?e.data.speed:0;_scratchFrameAt=AC.currentTime;};
 const cut=AC.createGain(),gain=AC.createGain();cut.gain.value=0;_scratchCut=cut;gain.gain.value=dbToGain(t.vol||0)*setLevelLin(setCur);_scratchGraph.push(cut,gain);
 let head=node;if(t.filter!=='off'){const filter=AC.createBiquadFilter();filter.type=t.filter==='lp'?'lowpass':'highpass';filter.frequency.value=t.cutoff;filter.Q.value=t.reso;node.connect(filter);head=filter;_scratchGraph.push(filter);}head.connect(cut);cut.connect(gain);
 if(multiOut&&t.outBus==='B')gain.connect(outBGain);
 else{gain.connect(groupBus[GROUP_OF[i]]);for(const [amount,target] of [[t.delaySend||0,tapeEcho],[Math.sqrt(t.reverbSend||0),reverbPre]])if(amount>0){const send=AC.createGain();send.gain.value=amount;gain.connect(send);send.connect(target);_scratchGraph.push(send);}}
 scratchShow(i);
 document.getElementById('scratchStatus').textContent='フェーダーは触った所まで開き、離すと閉じる（PADキー／MIDIは押している間だけ全開）'+(useWorklet?'':'（互換再生）');
}
