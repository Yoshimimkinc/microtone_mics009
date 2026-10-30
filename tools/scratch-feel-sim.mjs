// SCR の手触りの研究（v0.3.193 §182、docs/scratch-feel-research.md）。関門には入れない。
// 指のストローク（縦の往復）→ 実際の DSP（createScratchHead）→ 再生速度・遅れを測る。
// 使い方：node tools/scratch-feel-sim.mjs [now | w<Hz>（ばねの速さを変える）| ff | ff2:<Hz>:<gain> | ffh:<Hz>:<gain>（速さの先送り＝不採用）]
import fs from 'node:fs';import vm from 'node:vm';
const root=new URL('../src/js/',import.meta.url).pathname;
const src={};vm.createContext(src);vm.runInContext(fs.readFileSync(root+'audio/scratch-pad.js','utf8'),src);
const VARIANT=process.argv[2]||'now';
let code=vm.runInContext('createScratchHead.toString()',src);
if(VARIANT.startsWith('w')){const hz=+VARIANT.slice(1);code=code.replace("const w=2*Math.PI*16/rate","const w=2*Math.PI*"+hz+"/rate");}
if(VARIANT.startsWith('ffh')){const fc=+(VARIANT.split(':')[1]||20),g=+(VARIANT.split(':')[2]||1);
 code=code.replace("if(this.drag){const k=this.since++;","if(this.drag){this.svs=(this.svs||0)+((this.since<2*this.span?this.hand:0)-(this.svs||0))*(1-Math.exp(-2*Math.PI*"+fc+"/rate));const k=this.since++;");
 code=code.replace("this.vel+=w*w*(this.smooth-this.pos)-2*w*this.vel;","this.vel+=w*w*(this.smooth-this.pos)+2*w*("+g+"*this.svs-this.vel);");if(!code.includes('svs-this.vel'))throw 'patch3';}
if(VARIANT.startsWith('ff2')){const fc=+(VARIANT.split(':')[1]||20),g=+(VARIANT.split(':')[2]||1);
 code=code.replace("if(this.drag){const k=this.since++;if(k<this.span)this.est+=this.hv;else if(k<2*this.span)this.est+=this.hand;","if(this.drag){const k=this.since++,ev=k<this.span?this.hv:k<2*this.span?this.hand:0;this.est+=ev;this.svs=(this.svs||0)+(ev-(this.svs||0))*(1-Math.exp(-2*Math.PI*"+fc+"/rate));");
 code=code.replace("this.vel+=w*w*(this.smooth-this.pos)-2*w*this.vel;","this.vel+=w*w*(this.smooth-this.pos)+2*w*("+g+"*this.svs-this.vel);");if(!code.includes('svs-this.vel'))throw 'patch2';}
if(VARIANT==='ff'){code=code.replace("const est=this.est;this.smooth+=(est-this.smooth)*pre;this.vel+=w*w*(this.smooth-this.pos)-2*w*this.vel;","const est=this.est,ps=this.smooth;this.smooth+=(est-this.smooth)*pre;const sv=this.smooth-ps;this.vel+=w*w*(this.smooth-this.pos)+2*w*(sv-this.vel);");if(!code.includes('sv-this.vel'))throw 'patch';}
const createScratchHead=vm.runInContext('('+code+')',vm.createContext({Math,Number,Float32Array,Array}));
const RATE=48000;   // iPhone：1pt≈0.183mm → 54.6pt/cm
const ptcm=54.6,H=560; // スマホのスクラッチ面 ≈ 560pt
const T=(y,h)=>{const a=Math.log(4)/h,d=y-h/2;return (1-Math.exp(-a*d))/(a*220);};
function run({ampCm,hz,y0Frac=.5,touchHz=60,cycles=4}){
  const len=4096,data=new Float32Array(len).map((_,i)=>Math.sin(i*.05));
  const head=createScratchHead(data,RATE);const o=new Float32Array(128);
  for(let k=0;k<40;k++)head.render([o]);head.message({type:'hold',on:true});for(let k=0;k<20;k++)head.render([o]);
  const dur=cycles/hz,y0=y0Frac*H,amp=ampCm*ptcm/2,ft0=T(y0,H);
  let t=0,nextEv=0,maxSpeed=0,errs=[],lagSamples=[];const p0=head.pos;
  const ideal=tt=>{const y=y0-amp*Math.sin(2*Math.PI*hz*tt);return (ft0-T(y,H))*RATE;};   // 指どおりの位置（フレーム）
  while(t<dur){
    if(t>=nextEv){head.message({type:'drag',delta:ideal(t),t:t*1000});nextEv+=1/touchHz;}
    head.render([o]);t+=128/RATE;
    maxSpeed=Math.max(maxSpeed,Math.abs(head.vel));
    errs.push([t,head.pos-head.origin]);
  }
  // 遅れ（壁時計 ms）：pos(t) ≒ ideal(t-τ) となる τ を 0〜80ms で探す（最初の 1 周は除く）
  let best=1e99,lag=0;for(let tau=0;tau<=.08;tau+=.0005){let e=0,n=0;for(const [tt,p] of errs){if(tt<1/hz)continue;const d=p-ideal(tt-tau);e+=d*d;n++;}if(e/n<best){best=e/n;lag=tau;}}
  const resid=Math.sqrt(best)/RATE*1000;
  // 理想の最大速さ（倍）＝ 位置の微分
  let idealMax=0;for(let tt=0;tt<1/hz;tt+=1e-4)idealMax=Math.max(idealMax,Math.abs(ideal(tt+1e-4)-ideal(tt))/(1e-4*RATE));
  const audioSpan=(ideal(1/(4*hz))-ideal(3/(4*hz)))/RATE;
  return {ampCm,hz,y:y0Frac,touchHz,audioSpanS:+Math.abs(audioSpan).toFixed(3),idealPeakX:+idealMax.toFixed(2),gotPeakX:+maxSpeed.toFixed(2),lagMs:+(lag*1000).toFixed(1),residAudioMs:+resid.toFixed(1)};
}
const rows=[];
for(const ampCm of [1,2,3])for(const hz of [2,4,6])rows.push(run({ampCm,hz}));
for(const y of [.15,.85])rows.push(run({ampCm:2,hz:4,y0Frac:y}));
for(const touchHz of [60,120,240])rows.push(run({ampCm:2,hz:6,touchHz}));
console.table(rows);
// 実物：12 インチ盤・33⅓（1 周 1.8 秒）。半径 r の所で 1 秒の音＝ 2πr/1.8 cm
for(const r of [6,10,14])console.log(`vinyl r=${r}cm: 1 s of audio = ${(2*Math.PI*r/1.8).toFixed(1)} cm of hand travel`);
console.log('phone (center 220pt/s, 54.6pt/cm): 1 s of audio =',(220/ptcm).toFixed(2),'cm; top',(110/ptcm).toFixed(2),'cm; bottom',(440/ptcm).toFixed(2),'cm');
