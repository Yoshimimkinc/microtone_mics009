// @module audio/scratch-pad
// @provides _scratchCode, _scratchCut, _scratchDragging, _scratchDuration, _scratchFader, _scratchFrame,
//    _scratchFrameAt, _scratchGraph, _scratchModule, _scratchMotor, _scratchNode, _scratchPos,
//    _scratchToken, createScratchHead, scratchClose, scratchCue, scratchDrag, scratchFallbackNode,
//    scratchHold, scratchMotor, scratchOpen, scratchSetFader, scratchState
// @uses AC, GROUP_OF, dbToGain, groupBus, multiOut, outBGain, reverbPre, sampNameEl, scratchHide,
//    scratchShow, setCur, setLevelLin, stopVoices, tapeEcho, tracks
// @depends -
// Audio unit: resampling, tape-head worklet, routing and scratch control state.
// UI/platter gestures live in ui/scratch-view.js. Backing transport is untouched.
let _scratchGraph=[],_scratchModule=null,_scratchNode=null,_scratchCut=null,_scratchToken=0;
let _scratchPos=0,_scratchFrame=0,_scratchFrameAt=0,_scratchDuration=0,_scratchMotor=true,_scratchDragging=false,_scratchFader=0;
// One tape-head calculation shared by the worklet and compatibility driver.
function createScratchHead(data,rate){
 return {data,pos:0,target:0,origin:0,drag:false,motor:true,stopped:false,dcIn:0,dcOut:0,speed:0,
  message(m){if(m.type==='stop')this.stopped=true;if(m.type==='hold'){this.drag=!!m.on;this.origin=this.pos;this.target=this.pos;}if(m.type==='drag'&&this.drag&&Number.isFinite(m.delta))this.target=this.origin+m.delta;if(m.type==='motor')this.motor=!!m.on;if(m.type==='cue'){this.pos=0;this.target=0;this.origin=0;this.drag=false;}},
  state(){const N=this.data.length;return {frame:this.pos,position:N?((this.pos%N)+N)%N/N:0,speed:this.speed};},
  render(out){if(this.stopped||!this.data.length){out.fill(0);return false;}const d=this.data,N=d.length,follow=1-Math.exp(-1/(rate*.006));
   for(let j=0;j<out.length;j++){const speed=this.drag?Math.max(-24,Math.min(24,(this.target-this.pos)*follow)):(this.motor?1:0);this.speed=speed;this.pos+=speed;
    const p=((this.pos%N)+N)%N,k=Math.floor(p),f=p-k,value=(d[k]*(1-f)+d[(k+1)%N]*f)*.7,high=value-this.dcIn+.997*this.dcOut;this.dcIn=value;this.dcOut=high;out[j]=Math.abs(speed)<.00001?0:high;
   }return true;
  }
 };
}
const _scratchCode=`const createScratchHead=${createScratchHead.toString()};
class PadTapeHead extends AudioWorkletProcessor{
 constructor(o){super();this.head=createScratchHead(o.processorOptions.data,sampleRate);this.count=0;this.port.onmessage=e=>this.head.message(e.data);}
 process(i,o){if(!this.head.render(o[0][0]))return false;if(++this.count%8===0)this.port.postMessage(this.head.state());return true;}
}registerProcessor('mics-pad-tape-head',PadTapeHead);`;
function scratchFallbackNode(data){
 const node=AC.createScriptProcessor(512,0,1),head=createScratchHead(data,AC.sampleRate);
 node.port={onmessage:null,postMessage:m=>head.message(m),close:()=>{node.onaudioprocess=null;}};
 node.onaudioprocess=e=>{head.render(e.outputBuffer.getChannelData(0));if(node.port.onmessage)node.port.onmessage({data:head.state()});};return node;
}
function scratchState(){return {position:_scratchPos,frame:_scratchFrame+(!_scratchDragging&&_scratchMotor&&_scratchNode?(AC.currentTime-_scratchFrameAt)*AC.sampleRate:0),duration:_scratchDuration,motor:_scratchMotor,dragging:_scratchDragging,fader:_scratchFader,rate:AC.sampleRate};}
function scratchHold(on){if(!_scratchNode)return;_scratchDragging=!!on;_scratchNode.port.postMessage({type:'hold',on:!!on});}
function scratchDrag(frames){if(_scratchNode&&Number.isFinite(frames))_scratchNode.port.postMessage({type:'drag',delta:frames});}
function scratchMotor(on){_scratchMotor=!!on;if(_scratchNode)_scratchNode.port.postMessage({type:'motor',on:_scratchMotor});}
function scratchCue(){_scratchDragging=false;_scratchFrame=0;_scratchPos=0;_scratchFrameAt=AC.currentTime;if(_scratchNode)_scratchNode.port.postMessage({type:'cue'});}
function scratchSetFader(value){_scratchFader=Math.max(0,Math.min(1,+value||0));if(_scratchCut)_scratchCut.gain.setTargetAtTime(_scratchFader,AC.currentTime,.003);}
function scratchClose(){
 _scratchToken++;
 if(_scratchNode){_scratchNode.port.postMessage({type:'stop'});_scratchNode.port.onmessage=null;_scratchNode.port.close();_scratchNode.disconnect();_scratchNode=null;}
 _scratchGraph.forEach(n=>n.disconnect());_scratchGraph=[];_scratchCut=null;_scratchDragging=false;
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
 const src=t.buffer,from=Math.max(0,Math.min(src.length-1,Math.floor((t.start||0)*src.length))),to=Math.min(src.length,Math.max(from+1,Math.ceil((t.end??1)*src.length)));
 const raw=src.getChannelData(0),len=Math.max(1,Math.round((to-from)*AC.sampleRate/src.sampleRate)),data=new Float32Array(len);
 for(let j=0;j<len;j++){const x=Math.min(to-1,from+j*src.sampleRate/AC.sampleRate),k=Math.floor(x),f=x-k;data[j]=raw[k]*(1-f)+(raw[Math.min(k+1,to-1)]||0)*f;}
 const node=useWorklet?new AudioWorkletNode(AC,'mics-pad-tape-head',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{data}}):scratchFallbackNode(data);
 _scratchNode=node;_scratchPos=0;_scratchFrame=0;_scratchFrameAt=AC.currentTime;_scratchDuration=len/AC.sampleRate;_scratchMotor=true;_scratchDragging=false;_scratchFader=0;
 node.port.onmessage=e=>{if(node!==_scratchNode||!Number.isFinite(e.data?.frame))return;_scratchFrame=e.data.frame;_scratchPos=e.data.position;_scratchFrameAt=AC.currentTime;};
 const cut=AC.createGain(),gain=AC.createGain();cut.gain.value=0;_scratchCut=cut;gain.gain.value=dbToGain(t.vol||0)*setLevelLin(setCur);_scratchGraph.push(cut,gain);
 let head=node;if(t.filter!=='off'){const filter=AC.createBiquadFilter();filter.type=t.filter==='lp'?'lowpass':'highpass';filter.frequency.value=t.cutoff;filter.Q.value=t.reso;node.connect(filter);head=filter;_scratchGraph.push(filter);}head.connect(cut);cut.connect(gain);
 if(multiOut&&t.outBus==='B')gain.connect(outBGain);
 else{gain.connect(groupBus[GROUP_OF[i]]);for(const [amount,target] of [[t.delaySend||0,tapeEcho],[Math.sqrt(t.reverbSend||0),reverbPre]])if(amount>0){const send=AC.createGain();send.gain.value=amount;gain.connect(send);send.connect(target);_scratchGraph.push(send);}}
 scratchShow(i);
 document.getElementById('scratchStatus').textContent=useWorklet?'PADキー／MIDI／HOLDを押している間だけ':'PADキー／MIDI／HOLDを押している間だけ（互換再生）';
}
