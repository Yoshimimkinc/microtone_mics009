// MICS009 v0.3.171 acceptance: imported by check.mjs, no live Dropbox mutations.
export async function checkPadContents({br,PORT,ready,unlock,eq,ok_}){
 for(const [w,h,mobile] of [[390,844,true],[1280,800,false]]){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile});await unlock(ctx);
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`);await ready(p);
  const label=`CONTENT ${w}`;
  const initial=await p.evaluate(()=>({kind:padKind(tracks[8]),source:tracks[8].buffer.length,fx:[...document.querySelectorAll('#perfPlk [data-lock]:not(.perf-mode),#perfMute')].map(b=>b.dataset.lock)}));
  eq(`${label} 既存パッドはSPL`,initial.kind,'SPL');eq(`${label} FX列`,initial.fx,['mute','filter','delay','reverb']);
  // Real pointer swipes use the same row on phone and desktop. No FX/modal
  // or pattern tap may leak through the gesture; explicit pattern tap still works.
  const fxRow=mobile?'.msbar':'#perfPlk';
  let strip=await p.locator(fxRow).boundingBox();
  const swipe=async(left)=>{const x=strip.x+strip.width*(left?.8:.2),to=strip.x+strip.width*(left?.2:.8),y=strip.y+strip.height/2;await p.mouse.move(x,y);await p.mouse.down();await p.mouse.move(to,y,{steps:8});await p.mouse.up();};
  if(mobile){
    const patternBefore=await p.evaluate(()=>editPat);await swipe(true);
    eq(`${label} 左スワイプでABCD・元のFXは誤作動しない`,await p.evaluate(sel=>({page:document.querySelector(sel).dataset.fxPage,count:[...document.querySelectorAll(sel+' .fx-pattern')].filter(b=>b.getBoundingClientRect().width>0).length,modal:fxmParam,pat:editPat}),fxRow),{page:'patterns',count:4,modal:null,pat:patternBefore});
    const targets=await p.locator(fxRow+' .fx-pattern').evaluateAll(bs=>bs.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));
    ok_(`${label} ABCDは均等幅・44px以上`,targets.every(b=>b.h>=44&&b.w>=44)&&Math.max(...targets.map(b=>b.w))-Math.min(...targets.map(b=>b.w))<2,JSON.stringify(targets));
    await p.click(fxRow+' .fx-pattern[data-p="1"]');eq(`${label} 大きいBは既存の切替経路`,await p.evaluate(()=>editPat),1);
    await p.click(fxRow+' .fx-pattern[data-p="0"]');strip=await p.locator(fxRow).boundingBox();await swipe(false);
    eq(`${label} 右スワイプでFXに復帰`,await p.evaluate(sel=>[document.querySelector(sel).dataset.fxPage,editPat,fxmParam],fxRow),['effects',0,null]);
  } else {
    // v0.3.182：場所がある画面（768px 以上）は A B C D が常に出ている＝FX 列はスワイプしない。下の段の A B C D は横長に大きく
    await swipe(true);
    eq(`${label} 広い画面は FX 列をスワイプしても FX のまま・誤作動しない`,await p.evaluate(sel=>({page:document.querySelector(sel).dataset.fxPage,modal:fxmParam,dots:getComputedStyle(document.querySelector(sel),'::after').display}),fxRow),{page:'effects',modal:null,dots:'none'});
    const big=await p.locator('#perfPats .perf-pat').evaluateAll(bs=>bs.map(b=>({w:b.getBoundingClientRect().width,h:b.getBoundingClientRect().height})));
    ok_(`${label} 下の段の A B C D は横長に大きい（72px 以上・均等）`,big.length===4&&big.every(b=>b.w>=72&&b.h>=44)&&Math.max(...big.map(b=>b.w))-Math.min(...big.map(b=>b.w))<2,JSON.stringify(big));
    await p.click('#perfPats .perf-pat[data-p="1"]');eq(`${label} 大きい B で切替`,await p.evaluate(()=>editPat),1);
    await p.click('#perfPats .perf-pat[data-p="0"]');
    // MUTE は色つき（v0.3.178–181 は既定の黒文字で WIRE の黒地に見えなかった）
    const mc=await p.evaluate(()=>{document.body.classList.add('t-wf');const c=getComputedStyle(document.getElementById('perfMute')).color;document.body.classList.remove('t-wf');return c;});
    ok_(`${label} MUTE の文字は黒ではない（WIRE でも見える）`,mc!=='rgb(0, 0, 0)'&&mc!=='rgb(16, 16, 16)',mc);
  }
  const mute=mobile?'#holdMute':'#perfMute';await p.click(mute);
  const before=await p.evaluate(()=>tracks[8].mute);await p.click('#pads .pad[data-i="8"]');
  eq(`${label} MUTEはパッドを発音せずミュートを切替`,await p.evaluate(()=>tracks[8].mute),!before);
  await p.click(mute);await p.evaluate(()=>doUndo());
  // Directly inspect the scheduled voice: old pitch/filter/delay/reverb locks cannot override live values.
  const live=await p.evaluate(()=>{
    const t=tracks[8],proto=AudioBufferSourceNode.prototype,orig=proto.start;let got;
    proto.start=function(...a){got=this.buffer;return orig.apply(this,a);};
    try{t.tune=0;t.filter='off';t.delaySend=0;t.reverbSend=0;playVoice(8,AC.currentTime+0.01,false,true,0,{pitch:12,filter:200,delay:1,reverb:1});stopVoices(t,AC.currentTime);return got===t.buffer;}
    finally{proto.start=orig;}
  });ok_(`${label} 旧pitchロックが発音バッファを変えない`,live,String(live));
  // Both axes share the same numeric parameter path, with one undo per gesture.
  await p.evaluate(()=>{clPage='tone';renderClPage();tracks[selected].cutoff=3200;paintClPage();});
  eq(`${label} CUTOFF整数Hz`,await p.evaluate(()=>CL_SPEC.cutoff.fmt(3200.8)),'3201');
  const g=await p.locator('.cl-par[data-p="cutoff"]').boundingBox();
  await p.mouse.move(g.x+g.width/2,g.y+g.height/2);await p.mouse.down();await p.mouse.move(g.x+g.width/2,g.y+g.height/2-20,{steps:4});await p.mouse.up();
  ok_(`${label} 上スワイプで増加`,await p.evaluate(()=>tracks[selected].cutoff>3200),'CUTOFFが増えない');
  // KEY render, preservation of original sample, note edit, undo, copy and serialization.
  await p.evaluate(async()=>{await setPadKind(8,'KEY');tracks[8].keyPhrase={bars:4,notes:[{pitch:60,beat:0,length:1,velocity:110},{pitch:64,beat:0,length:2,velocity:80},{pitch:67,beat:15,length:1,velocity:95}]};await prepareKeyTrack(tracks[8],bpmVal);keyEditorOpen(8);});
  const key=await p.evaluate(()=>{const t=tracks[8],data=t.buffer.getChannelData(0);let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));const saved=buildProject().sets[setCur].tracks[8];return {kind:t.padKind,notes:saved.keyPhrase.notes.length,bars:saved.keyPhrase.bars,len:t.buffer.duration,expected:16*60/bpmVal+1.2,peak,source:t.sampleState.buffer.length,type:saved.type,audio:saved.audio};});
  eq(`${label} KEY演奏データを保存`,[key.kind,key.notes,key.bars],['KEY',3,4]);
  ok_(`${label} KEY和音が非無音・クリップなし・4小節＋テール`,Math.abs(key.len-key.expected)<0.001&&key.peak>0.01&&key.peak<=0.901,JSON.stringify(key));
  eq(`${label} 元サンプルを保持`,key.source,initial.source);
  await p.screenshot({path:`tools/_shots/content-key-${w}.png`});
  // Actual pointer selection and numeric note edit, then the editor's accessible UNDO button.
  const note=await p.evaluate(()=>{const c=document.getElementById('keyRoll'),r=c.getBoundingClientRect();return {x:r.left+58+_keyZoom*.4,y:r.top+(_keyLow+35-60)*28+14};});
  await p.mouse.click(note.x,note.y);await p.fill('#keyLength','2');await p.locator('#keyLength').dispatchEvent('change');
  await p.waitForFunction(()=>tracks[8]._keySignature===JSON.stringify([normalizeKeyPhrase(tracks[8].keyPhrase),bpmVal]));
  eq(`${label} ピアノロールから音の長さを編集`,await p.evaluate(()=>tracks[8].keyPhrase.notes[0].length),2);
  await p.click('#keyUndo');eq(`${label} ピアノロールのUNDO`,await p.evaluate(()=>tracks[8].keyPhrase.notes[0].length),1);

  await p.evaluate(()=>keyEditorClose());
  const round=await p.evaluate(async()=>{const project=JSON.parse(JSON.stringify(buildProject()));await applyProject(project);await prepareKeyTrack(tracks[8],bpmVal);const a=[tracks[8].padKind,tracks[8].keyPhrase.notes.length,tracks[8].keyPhrase.bars];copyPadSound(8,9);const b=[tracks[9].padKind,tracks[9].keyPhrase.notes.length];tracks[9].keyPhrase.notes[0].pitch=72;const isolated=tracks[8].keyPhrase.notes[0].pitch;doUndo();const undone=padKind(tracks[9]);await setPadKind(8,'SPL');return {a,b,isolated,undone,source:tracks[8].buffer.length};});
  eq(`${label} KEY保存読込・コピー深複製・UNDO・SPL復帰`,round,{a:['KEY',3,4],b:['KEY',3],isolated:60,undone:'SPL',source:initial.source});
  const epoch=await p.evaluate(async()=>{await setPadKind(8,'KEY');const t=tracks[8];t.keyPhrase={bars:1,notes:[{pitch:60,beat:0,length:1,velocity:80}]};const pending=prepareKeyTrack(t,bpmVal);t._contentEpoch++;const old=t.buffer;await pending;return old===t.buffer;});
  ok_(`${label} 古い非同期renderが別状態を上書きしない`,epoch,String(epoch));
  // Minimal format-0 SMF with simultaneous E/C notes and note-off timings at PPQ96.
  const midi=await p.evaluate(()=>{
    const track=[0,0x90,60,100,0,0x90,64,80,96,0x80,60,0,0,0x80,64,0,0,0xff,0x2f,0];
    const file=[77,84,104,100,0,0,0,6,0,0,0,1,0,96,77,84,114,107,0,0,0,track.length,...track];
    const m=parseKeyMidi(new Uint8Array(file));let bad=false;try{parseKeyMidi(new Uint8Array(file.slice(0,-3)));}catch(_){bad=true;}
    return {notes:m.tracks[0].phrase.notes,bad};
  });eq(`${label} MIDI和音・長さ・velocity`,midi.notes,[{pitch:60,beat:0,length:1,velocity:100},{pitch:64,beat:0,length:1,velocity:80}]);eq(`${label} 破損MIDIを拒否`,midi.bad,true);
  await p.evaluate(async()=>{await setPadKind(8,'SCR');await scratchOpen(8);});
  eq(`${label} SCRは対象パッドから起動`,await p.evaluate(()=>[document.getElementById('scratchEditor').hidden,!!_scratchNode]),[false,true]);
  await p.screenshot({path:`tools/_shots/content-scr-${w}.png`});
  await p.evaluate(()=>scratchClose());
  eq(`${label} SCR終了でノード解放`,await p.evaluate(()=>_scratchNode),null);
  const recovery=await p.evaluate(async()=>{startTransport();audioSuspendScheduling();const paused=schedTimer===null;await audioRecover();const timer=schedTimer;await audioRecover();const single=timer===schedTimer,near=stepTimeClean(stepIdx)-AC.currentTime;stopTransport();return {paused,single,near,state:AC.state};});
  ok_(`${label} 復帰は時計を同期・タイマーを重複しない`,recovery.paused&&recovery.single&&recovery.near<0.5&&recovery.state==='running',JSON.stringify(recovery));
  // Invalid stage must not change current audio/comp before decoding succeeds.
  const loadFail=await p.evaluate(async()=>{const old=tracks[8].buffer,comp=compOn,f=buildProject();f.comp.on=!comp;f.sets[0].tracks[0].audio='not-a-wav';let bad=false;try{await applyProject(f);}catch(_){bad=true;}return bad&&old===tracks[8].buffer&&comp===compOn;});
  ok_(`${label} 破損ステージで現在の状態を維持`,loadFail,String(loadFail));
  // Dropbox is tested through a fake response only; no real OAuth, reads or writes.
  const db=await p.evaluate(async()=>{
    const orig=window.fetch,seen=[];sessionStorage.setItem(DB_SESSION_KEY,JSON.stringify({token:'test-token',expires:Date.now()+60000}));document.getElementById('dbFolder').value='/BAND';document.getElementById('dbFilename').value='stage-test.mics';
    window.fetch=async(url,o)=>{seen.push({url,arg:o.headers['Dropbox-API-Arg'],authorization:o.headers.Authorization});return new Response('{}',{status:409});};
    let conflict=false;try{await dropboxSave();}catch(e){conflict=/別名/.test(e.message);}finally{window.fetch=orig;dropboxDisconnect();}
    return {conflict,arg:JSON.parse(seen[0].arg),disconnected:!_dbSession()};
  });eq(`${label} Dropboxは同名ファイルを上書きしない`,db,{conflict:true,arg:{path:'/BAND/stage-test.mics',mode:'add',autorename:false,strict_conflict:true,mute:false},disconnected:true});
  eq(`${label} errors`,errs,[]);await ctx.close();
 }
}
