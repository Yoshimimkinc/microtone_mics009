// @module audio/key-instrument
// @provides _keyBuffers, _keyCache, _keyDryCache, _keyJobs, _keyWarmTimer, keyApplyEffects, keyTineNote,
//    prepareKeyTrack, renderKeyDry, renderKeyPhrase, warmKeyTracks
// @uses bpmVal, normalizeKeyPhrase, sampNameEl, tracks
// @depends -
const _keyCache=new Map(), _keyDryCache=new Map(), _keyJobs=new WeakMap(), _keyBuffers=new WeakSet();
let _keyWarmTimer=null;
// Reduced modal model: finite hammer pulse -> damped tine/tonebar modes ->
// nonlinear magnetic flux -> induced voltage (d flux / dt) -> pickup lowpass.
// Parameters are voiced by ear, not fitted to an individual Rhodes instrument.
// 2x internal rate, then lowpass/decimate. No FM oscillator or recorded sample.
function keyTineNote(pitch,velocity,hold,rate=26000){
  const sr=rate*2,freq=440*2**((pitch-69)/12),v=Math.max(1,Math.min(127,velocity))/127;
  const length=Math.ceil((hold+1.2)*sr),output=new Float32Array(Math.ceil(length/2));
  const contact=Math.max(12,Math.round(Math.min(sr/freq*.65,sr*(.0024-.0012*v)*Math.sqrt(261.626/freq)))),impulse=Math.PI/(2*contact);
  const amplitude=.10+.52*v**1.65,modes=[];
  // Beam modes of the tine and a nearby, weakly coupled tonebar mode.
  for(const [ratio,weight,decay] of [[1,1,3.2],[6.267,.035+.16*v*v,.26],[17.55,.016*v*v,.065],[1.003,.055,1.4]]){
    const f=freq*ratio;if(f>sr*.42)continue;const w=2*Math.PI*f/sr,r=Math.exp(-1/(sr*decay*(1.1-.4*pitch/108)));
    modes.push({a:2*r*Math.cos(w),b:r*r,g:Math.sin(w)*weight*amplitude,y:0,z:0});
  }
  // Second order Butterworth, 9 kHz at the oversampled rate, before decimation.
  const k=Math.tan(Math.PI*Math.min(9000,rate*.35)/sr),norm=1/(1+Math.SQRT2*k+k*k),b0=k*k*norm,b1=2*b0,b2=b0,a1=2*(k*k-1)*norm,a2=(1-Math.SQRT2*k+k*k)*norm;
  let fluxPrev=1/(.9*.9+.6*.6)**1.5,dcIn=0,dcOut=0,x1=0,x2=0,y1=0,y2=0;
  const off=Math.round(hold*sr),release=.075+.045*(1-pitch/108);
  let damping=1;const damper=Math.exp(-1/(sr*release));
  for(let i=0;i<length;i++){
    const force=i<contact?Math.sin(Math.PI*(i+.5)/contact)*impulse:0;let displacement=0;
    for(const m of modes){const y=m.a*m.y-m.b*m.z+m.g*force;m.z=m.y;m.y=y;displacement+=y;}
    if(i>=off)damping*=damper;displacement*=damping;
    // Fixed pickup offset turns the tine motion into asymmetric flux and bark.
    const distance=.6-displacement,flux=1/(.9*.9+distance*distance)**1.5;
    const induced=(flux-fluxPrev)*sr/(2*Math.PI*freq);fluxPrev=flux;
    const high=induced-dcIn+.997*dcOut;dcIn=induced;dcOut=high;
    const low=b0*high+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=high;y2=y1;y1=low;
    if(i%2===0)output[i/2]=low*.6;
  }
  return output;
}
function renderKeyDry(src,bpm){
  const p=normalizeKeyPhrase(src),tempo=Math.max(40,Math.min(250,+bpm||100));
  // Editor preferences cannot change the sound or create duplicate render jobs.
  const key=JSON.stringify([p.bars,p.instrument,p.notes,tempo]);if(_keyDryCache.has(key))return _keyDryCache.get(key);
  const job=(async()=>{
    const rate=26000,beat=60/tempo,duration=p.bars*4*beat+1.2;
    const ctx=new OfflineAudioContext(1,Math.ceil(duration*rate),rate),buf=ctx.createBuffer(1,Math.ceil(duration*rate),rate),a=buf.getChannelData(0);
    for(let ni=0;ni<p.notes.length;ni++){
      const n=p.notes[ni],note=keyTineNote(n.pitch,n.velocity,n.length*beat,rate),start=Math.round(n.beat*beat*rate);
      for(let j=0;j<note.length&&start+j<a.length;j++)a[start+j]+=note[j]*.42;
      // Yield between small batches so mobile editing can still respond.
      if(ni%4===3)await new Promise(resolve=>setTimeout(resolve,0));
    }
    let peak=0;for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]));
    // Fixed soft limiter preserves velocity contrasts, unlike per-phrase normalisation.
    if(peak>.86)for(let i=0;i<a.length;i++)a[i]=.9*Math.tanh(a[i]/.9);
    return buf;
  })();
  _keyDryCache.set(key,job);while(_keyDryCache.size>8)_keyDryCache.delete(_keyDryCache.keys().next().value);
  job.catch(()=>{if(_keyDryCache.get(key)===job)_keyDryCache.delete(key);});return job;
}
// Two independent insertion slots, inspired by CP-style controls. These are
// original DSP approximations, not Yamaha VCM models. Effects are baked/cached
// after the physical voice, never solved by the live sequencer.
function keyApplyEffects(input,rate,effects){
  const fx=normalizeKeyPhrase({effects}).effects;
  if((fx.motion==='off'||fx.motionDepth===0)&&(fx.color==='off'||fx.colorDepth===0))return input;
  const out=new Float32Array(input.length),delay=new Float32Array(Math.ceil(rate*.06)),apIn=new Float64Array(4),apOut=new Float64Array(4);
  let write=0,ic1=0,ic2=0,feedback=0,envelope=0;
  const readDelay=samples=>{let position=write-samples;while(position<0)position+=delay.length;const i=Math.floor(position),f=position-i;return delay[i]*(1-f)+delay[(i+1)%delay.length]*f;};
  for(let i=0;i<input.length;i++){
    let x=input[i];const time=i/rate;
    if(fx.motion==='tremolo'&&fx.motionDepth>0)x*=1-fx.motionDepth*.5+fx.motionDepth*.5*Math.sin(2*Math.PI*fx.motionRate*time);
    else if(fx.motion==='wah'&&fx.motionDepth>0){
      // Resonant TPT state-variable bandpass. Touch envelope and LFO sweep the
      // cutoff together; DEPTH controls both sweep and wet mix, RATE the LFO Hz.
      const mag=Math.abs(x),coef=Math.exp(-1/(rate*(mag>envelope ? .008 : .14)));envelope=coef*envelope+(1-coef)*mag;
      const sweep=.5+.5*Math.sin(2*Math.PI*fx.motionRate*time),touch=Math.min(1,envelope*8),cutoff=350*2**(fx.motionDepth*(sweep*2.2+touch*1.2));
      const g=Math.tan(Math.PI*Math.min(rate*.3,cutoff)/rate),k=.8,a=1/(1+g*(g+k)),v1=a*(ic1+g*(x-ic2)),v2=ic2+g*v1;ic1=2*v1-ic1;ic2=2*v2-ic2;
      x=x*(1-fx.motionDepth)+v1*k*fx.motionDepth;
    }
    if(fx.color==='chorus'&&fx.colorDepth>0){
      delay[write]=x;const phase=2*Math.PI*fx.colorRate*time,base=rate*.016,depth=rate*.006*fx.colorDepth;
      const wet=(readDelay(base+depth*Math.sin(phase))+readDelay(base+depth*Math.sin(phase+Math.PI*.65)))*.5,mix=fx.colorDepth*.5;
      x=x*(1-mix)+wet*mix;write=(write+1)%delay.length;
    }else if(fx.color==='phaser'&&fx.colorDepth>0){
      const f=250*2**((.5+.5*Math.sin(2*Math.PI*fx.colorRate*time))*fx.colorDepth*3),g=Math.tan(Math.PI*f/rate),a=(1-g)/(1+g);let wet=x+feedback*.28*fx.colorDepth;
      for(let stage=0;stage<4;stage++){const y=-a*wet+apIn[stage]+a*apOut[stage];apIn[stage]=wet;apOut[stage]=y;wet=y;}
      feedback=wet;x=x*(1-fx.colorDepth*.5)+wet*fx.colorDepth*.5;
    }
    out[i]=x;
  }
  return out;
}
function renderKeyPhrase(src,bpm){
  const p=normalizeKeyPhrase(src),tempo=Math.max(40,Math.min(250,+bpm||100)),key=JSON.stringify([p.bars,p.instrument,p.notes,p.effects,tempo]);
  if(_keyCache.has(key))return _keyCache.get(key);
  const job=(async()=>{
    const dry=await renderKeyDry(p,tempo),processed=keyApplyEffects(dry.getChannelData(0),dry.sampleRate,p.effects);
    if(processed===dry.getChannelData(0))return dry;
    const ctx=new OfflineAudioContext(1,dry.length,dry.sampleRate),buffer=ctx.createBuffer(1,dry.length,dry.sampleRate),out=buffer.getChannelData(0);out.set(processed);
    let peak=0;for(let i=0;i<out.length;i++)peak=Math.max(peak,Math.abs(out[i]));if(peak>.9)for(let i=0;i<out.length;i++)out[i]=.9*Math.tanh(out[i]/.9);
    return buffer;
  })();
  _keyCache.set(key,job);while(_keyCache.size>12)_keyCache.delete(_keyCache.keys().next().value);
  job.catch(()=>{if(_keyCache.get(key)===job)_keyCache.delete(key);});return job;
}
async function prepareKeyTrack(t,bpm){
  const phrase=normalizeKeyPhrase(t.keyPhrase), signature=JSON.stringify([phrase,bpm]);
  if(t.padKind!=='KEY')return null;
  if(t._keySignature===signature&&t.buffer&&_keyBuffers.has(t.buffer))return t.buffer;
  const token={},epoch=t._contentEpoch||0;_keyJobs.set(t,token);
  const buffer=await renderKeyPhrase(phrase,bpm);
  if(_keyJobs.get(t)!==token||t.padKind!=='KEY'||(t._contentEpoch||0)!==epoch||JSON.stringify([normalizeKeyPhrase(t.keyPhrase),bpm])!==signature)return null;
  _keyBuffers.add(buffer);
  t.keyPhrase=phrase;t.buffer=buffer;t.rawBuffer=buffer;t.start=0;t.end=1;t.loop=false;t.loopStart=0;t._keySignature=signature;
  return buffer;
}
function warmKeyTracks(){
  clearTimeout(_keyWarmTimer);
  _keyWarmTimer=setTimeout(()=>{
    const ts=tracks.slice(),tempo=bpmVal;
    for(const t of ts)if(t.padKind==='KEY')prepareKeyTrack(t,tempo).catch(e=>{sampNameEl.textContent='KEY生成失敗：'+e.message;});
  },120); // BPMドラッグ中に大量のOfflineAudioContextを作らない
}
