// @module data/key-phrase
// @provides normalizeKeyPhrase, parseKeyMidi
// @uses -
// @depends -
// 演奏位置は拍単位。サンプルやBPMを含めず再編集可能な正データを保存する。
function normalizeKeyPhrase(src){
  const bars=Math.max(1,Math.min(4,Math.round(+src?.bars||1))), end=bars*4;
  const notes=(Array.isArray(src?.notes)?src.notes:[]).slice(0,512).filter(n=>Number.isFinite(+n.pitch)&&Number.isFinite(+n.beat)&&Number.isFinite(+n.length)&&+n.beat>=0&&+n.beat<end&&+n.length>0).map(n=>({pitch:Math.max(21,Math.min(108,Math.round(+n.pitch))),beat:Math.round(+n.beat*96)/96,length:Math.min(end-+n.beat,Math.max(1/96,+n.length)),velocity:Math.max(1,Math.min(127,Math.round(+n.velocity||96)))})).filter(n=>n.beat<end).map(n=>({...n,length:Math.min(n.length,end-n.beat)}));
  const e=src?.editor||{};
  const editor={root:Math.max(0,Math.min(11,Math.round(+e.root||0))),scale:['major','minor','dorian','mixolydian','pentatonic','minorPentatonic','chromatic'].includes(e.scale)?e.scale:'major',scaleEnabled:!!e.scaleEnabled,snap:e.snap!==false};
  const fx=src?.effects||{}, clamp=(v,lo,hi,def)=>Number.isFinite(+v)?Math.max(lo,Math.min(hi,+v)):def;
  const effects={motion:['off','tremolo','wah'].includes(fx.motion)?fx.motion:'off',motionDepth:clamp(fx.motionDepth,0,1,.5),motionRate:clamp(fx.motionRate,.1,10,3),color:['off','chorus','phaser'].includes(fx.color)?fx.color:'off',colorDepth:clamp(fx.colorDepth,0,1,.5),colorRate:clamp(fx.colorRate,.05,5,.8)};
  return {bars,instrument:'rhodes-tine-v2',notes,editor,effects};
}
// SMF format 0/1, PPQ。SMPTE/format 2は明確なエラーにする。
function parseKeyMidi(bytes){
  const u=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
  if(u.length>2*1024*1024) throw new Error('MIDIは2MB以内にしてください');
  const d=new DataView(u.buffer,u.byteOffset,u.byteLength); let at=0;
  const need=n=>{if(at+n>u.length)throw new Error('MIDIが途中で切れています');};
  const text=n=>{need(n);let s='';while(n--)s+=String.fromCharCode(u[at++]);return s;};
  const num=n=>{need(n);let x=0;while(n--)x=x*256+u[at++];return x;};
  if(text(4)!=='MThd') throw new Error('MIDIヘッダがありません');
  const hlen=num(4);if(hlen<6)throw new Error('MIDIヘッダが不正です');
  const format=num(2), count=num(2), ppq=num(2);
  if(format>1||(ppq&32768)||!ppq||count>128)throw new Error('対応するMIDIはformat 0/1、PPQ形式です');
  need(hlen-6);at+=hlen-6;
  const tracks=[], warnings=new Set(['演奏は本体BPM・4/4拍子で取り込みます']);
  for(let ti=0;ti<count;ti++){
    if(text(4)!=='MTrk')throw new Error('MIDIトラックが不正です');
    const size=num(4);need(size);const end=at+size, active=new Map(),notes=[];let tick=0,status=0,name='TRACK '+(ti+1),events=0;
    const vlq=()=>{let x=0;for(let j=0;j<4;j++){if(at>=end)throw new Error('MIDIイベントが不正です');const b=u[at++];x=(x<<7)|(b&127);if(!(b&128))return x;}throw new Error('MIDIの可変長数値が不正です');};
    while(at<end){
      if(++events>200000)throw new Error('MIDIイベント数が多すぎます');
      tick+=vlq();let st=u[at];if(st&128){at++;if(st<240)status=st;}else{if(!status)throw new Error('MIDI running statusが不正です');st=status;}
      if(st===255){status=0;if(at>=end)throw new Error('MIDI metaが不正です');const type=u[at++],len=vlq();if(at+len>end)throw new Error('MIDI meta長が不正です');if(type===3)name=new TextDecoder().decode(u.slice(at,at+len)).slice(0,40);if(type===88&&len>=2&&(u[at]!==4||u[at+1]!==2))warnings.add('4/4以外の拍子指定は反映していません');at+=len;continue;}
      if(st===240||st===247){status=0;const len=vlq();if(at+len>end)throw new Error('SysEx長が不正です');at+=len;continue;}
      if(st>=240)throw new Error('未対応のMIDIシステムイベントです');
      const kind=st>>4,ch=st&15,n=kind===12||kind===13?1:2;if(at+n>end)throw new Error('MIDIイベント長が不正です');
      const a=u[at++],b=n===2?u[at++]:0;if(a>127||b>127)throw new Error('MIDIデータが不正です');
      const key=ch+':'+a;
      if(kind===9&&b){if(!active.has(key))active.set(key,[]);active.get(key).push({tick,velocity:b});}
      else if(kind===8||(kind===9&&!b)){const q=active.get(key),on=q?.shift();if(on)notes.push({pitch:a,beat:on.tick/ppq,length:(tick-on.tick)/ppq,velocity:on.velocity});}
      else if(kind===11&&a===64)warnings.add('サステインペダルは未対応です');
    }
    if(active.size&&[...active.values()].some(q=>q.length))warnings.add('終了していないノートは取り込んでいません');
    if(notes.length){if(notes.length>512)warnings.add('1パッドあたり最大512ノートです');if(notes.some(n=>n.beat+n.length>16))warnings.add('4小節を超える部分は取り込みません');if(notes.some(n=>n.pitch<21||n.pitch>108))warnings.add('音域はA0〜C8へ補正します');tracks.push({name,phrase:normalizeKeyPhrase({bars:Math.max(1,Math.min(4,Math.ceil(Math.max(...notes.map(n=>n.beat+n.length))/4))),notes})});}
  }
  if(!tracks.length)throw new Error('ノートを含むトラックがありません');
  return {tracks,warnings:[...warnings]};
}
