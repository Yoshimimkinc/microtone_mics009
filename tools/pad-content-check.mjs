// MICS009 v0.3.171 acceptance: imported by check.mjs, no live Dropbox mutations.
export async function checkPadContents({br,PORT,ready,unlock,eq,ok_}){
 for(const [w,h,mobile] of [[390,844,true],[1280,800,false]]){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile});await unlock(ctx);
  const p=await ctx.newPage(),errs=[];p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`);await ready(p);
  const label=`CONTENT ${w}`;
  const initial=await p.evaluate(()=>({kind:padKind(tracks[8]),source:tracks[8].buffer.length,fx:[...document.querySelectorAll('#perfPlk [data-lock]:not(.perf-mode),#perfMute')].map(b=>b.dataset.lock)}));
  eq(`${label} 既存パッドはSPL`,initial.kind,'SPL');
  // v0.3.192 §180：新しいセットの 8 番（演奏画面の右上）はスクラッチ用の C3 サイン波（SCR）。ループの継ぎ目で途切れない・保存に音を同梱しない。起動デモの SET 1 はファイルどおり
  const sine=await p.evaluate(async()=>{const pr=PRESET_BUFS[7],d=pr.raw.getChannelData(0),sr=pr.raw.sampleRate;let up=0;for(let n=1;n<d.length;n++)if(d[n-1]<0&&d[n]>=0)up++;
    const hz=up/(d.length/sr),step=2*Math.PI*130.81/sr*.7,seam=Math.abs(d[0]-d[d.length-1]),demo=[tracks[7].name,padKind(tracks[7])];
    const back=setCur,k=(back+5)%16;focusSet(k);await new Promise(r=>setTimeout(r,50));const t=tracks[7],saved=buildProject().sets[k].tracks[7];
    const out={hz,seam,step,dur:pr.raw.duration,demo,set:[padKind(t),t.name,t.loop,t.buffer===pr.buf,document.querySelectorAll('#pads .pad')[7].dataset.kind],saved:[saved.padKind,saved.type,saved.voice,saved.audio||null]};
    focusSet(back);await new Promise(r=>setTimeout(r,50));out.back=tracks[7].name;return out;});
  ok_(`${label} 新しいセットの 8 番は C3 のサイン波の SCR パッド（約 2 秒・ループの継ぎ目で途切れない）`,Math.abs(sine.hz-130.81)<1.5&&sine.seam<=sine.step*1.01&&sine.dur>1.9&&sine.dur<2.1&&JSON.stringify(sine.set)==='["SCR","SCR SINE",true,true,"SCR"]',JSON.stringify(sine));
  eq(`${label} 保存に音を同梱しない・起動デモの 8 番はそのまま`,[sine.saved,sine.back===sine.demo[0]],[['SCR','synth','scrsine',null],true]);
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
  const note=await p.evaluate(()=>{const c=document.getElementById('keyRoll'),r=c.getBoundingClientRect();return {x:r.left+58+_keyZoom*.4,y:r.top+_keyRowY(60)+_keyRowH()/2};});
  await p.mouse.click(note.x,note.y);await p.fill('#keyLength','2');await p.locator('#keyLength').dispatchEvent('change');
  await p.waitForFunction(()=>tracks[8]._keySignature===JSON.stringify([normalizeKeyPhrase(tracks[8].keyPhrase),bpmVal]));
  eq(`${label} ピアノロールから音の長さを編集`,await p.evaluate(()=>tracks[8].keyPhrase.notes[0].length),2);
  await p.click('#keyUndo');eq(`${label} ピアノロールのUNDO`,await p.evaluate(()=>tracks[8].keyPhrase.notes[0].length),1);

  // v0.3.205 §194：ロールが残りの高さを使う（B）・スケールの鍵盤 4×4 を実際に押して STEP で入る（A）・外の音の行は畳む（C）
  { const L=await p.evaluate(()=>{const r=s=>document.querySelector(s).getBoundingClientRect();const pads=[...document.querySelectorAll('#keyPadGrid .key-pad')].map(b=>b.getBoundingClientRect());
      return {roll:r('.key-scroll').height,panel:r('#keyEditor .key-panel').bottom,vh:innerHeight,pads:pads.length,padMin:Math.min(...pads.map(b=>Math.min(b.width,b.height))),over:document.documentElement.scrollWidth>innerWidth,rows:_keyRows().length,rowH:_keyRowH(),bar:r('#keyPreview').top===r('#keyMore').top};});
    ok_(`${label} KEY のロールが画面の高さを使う・鍵盤 16 個（44px 以上）・道具 1 段・横にはみ出さない`,L.roll>=(mobile?330:500)&&L.pads===16&&L.padMin>=44&&L.bar&&!L.over&&L.panel<=L.vh,JSON.stringify(L));
    eq(`${label} KEY はスケールの外の音の行を畳む（C メジャー＝21 行・40px）`,[L.rows,L.rowH],[21,40]);
    const n0=await p.evaluate(()=>tracks[8].keyPhrase.notes.length);await p.click('#keyStep');
    { const r=await p.evaluate(()=>{const b=document.getElementById('keyRuler').getBoundingClientRect();return {x:b.left+58+2*_keyZoom+3,y:b.top+14};});await p.mouse.click(r.x,r.y); }   // 目盛りをタップ＝STEP の位置（2 拍目の頭）
    for(const d of [12,13]){const b=await p.locator('#keyPadGrid .key-pad').nth(d).boundingBox();await p.mouse.move(b.x+b.width/2,b.y+b.height/2);await p.mouse.down();await p.waitForTimeout(40);await p.mouse.up();await p.waitForTimeout(120);}
    const st=await p.evaluate(()=>({n:tracks[8].keyPhrase.notes.length,at:_keyStepAt,cursor:!document.getElementById('keyStepCursor').hidden}));
    ok_(`${label} KEY の鍵盤を押すと STEP でカーソルの位置へ入って進む`,st.n===n0+2&&st.at===2.5&&st.cursor,JSON.stringify(st));
    await p.click('#keyStep');await p.click('#keyUndo');await p.click('#keyUndo');
    await p.click('#keyPreview');await p.waitForTimeout(400);const pl=await p.evaluate(()=>({loop:!!_keyLoop,head:!document.getElementById('keyPlayhead').hidden}));await p.click('#keyPreview');
    ok_(`${label} KEY の PLAY はループ再生とプレイヘッド`,pl.loop&&pl.head,JSON.stringify(pl)); }
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
  // v0.3.193 §181：スマホのピアノロールは指で動かす＝スクロール（ノートは描かない）、動かさずに離す＝ノート（実際のタッチで）
  if(mobile){await p.evaluate(async()=>{await setPadKind(4,'KEY');keyEditorOpen(4);});await p.waitForTimeout(300);
   const cdp=await ctx.newCDPSession(p),sc=await p.locator('.key-scroll').boundingBox(),rb=await p.locator('#keyRoll').boundingBox(),x=Math.min(rb.x+rb.width-20,sc.x+sc.width*.6),y=sc.y+sc.height/2;
   const st=()=>p.evaluate(()=>({top:document.querySelector('.key-scroll').scrollTop,notes:tracks[4].keyPhrase.notes.length}));const k0=await st();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});for(let k=1;k<=10;k++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-k*12}]});await p.waitForTimeout(16);}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(150);const k1=await st();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await p.waitForTimeout(300);const k2=await st();
   ok_(`${label} ピアノロールは指で上下にスクロール（ノートは描かない）・タップでノート`,k1.top-k0.top>=100&&k1.notes===k0.notes&&k2.notes===k0.notes+1,JSON.stringify({k0,k1,k2}));
   await p.evaluate(async()=>{keyEditorClose();await setPadKind(4,'SPL');});await cdp.detach();}
  // v0.3.203 §192：窓の SAMPLE ページの種類ボタン＝その種類にしてすぐその画面へ（KEY＝ピアノロール・SCRATCH＝スクラッチ）、タブの名前も種類に。EDIT＋タップも種類に合った画面
  { await p.evaluate(()=>{selectPad(5);}); await p.click('#clKeys .cl-key[data-pg="smpl"]'); await p.waitForTimeout(250);
    await p.click('#clPage .cl-kind[data-kind="KEY"]'); await p.waitForTimeout(500);
    const k1=await p.evaluate(()=>({kind:padKind(tracks[5]),roll:!document.getElementById('keyEditor').hidden,tab:document.querySelector('#clKeys .cl-key[data-pg="smpl"]').textContent,on:document.querySelector('#clPage .cl-kind.on')?.dataset.kind}));
    await p.evaluate(()=>keyEditorClose()); await p.waitForTimeout(150);
    await p.click('#clPage .cl-kind[data-kind="SCR"]'); await p.waitForTimeout(600);
    const k2=await p.evaluate(()=>({kind:padKind(tracks[5]),scr:!document.getElementById('scratchEditor').hidden,tab:document.querySelector('#clKeys .cl-key[data-pg="smpl"]').textContent}));
    await p.evaluate(()=>scratchClose()); await p.click('#clPage .cl-kind[data-kind="KEY"]'); await p.waitForTimeout(500); await p.evaluate(()=>keyEditorClose());
    await p.evaluate(()=>{arm('edit',true);}); const pr=await p.evaluate(()=>{const b=document.querySelectorAll('#pads .pad')[5].getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
    await p.mouse.click(pr[0],pr[1]); await p.waitForTimeout(500);
    const k3=await p.evaluate(()=>({roll:!document.getElementById('keyEditor').hidden,modal:getComputedStyle(document.getElementById('padEditModal')).display}));
    await p.evaluate(()=>keyEditorClose()); await p.click('#clPage .cl-kind[data-kind="SPL"]'); await p.waitForTimeout(300);
    const k4=await p.evaluate(()=>({kind:padKind(tracks[5]),tab:document.querySelector('#clKeys .cl-key[data-pg="smpl"]').textContent}));
    ok_(`${label} 窓の KEY＝KEY にしてピアノロールを開く・タブも KEY`, k1.kind==='KEY'&&k1.roll&&k1.tab==='KEY'&&k1.on==='KEY', JSON.stringify(k1));
    ok_(`${label} 窓の SCRATCH＝SCRATCH にしてスクラッチを開く・タブも SCRATCH`, k2.kind==='SCR'&&k2.scr&&k2.tab==='SCRATCH', JSON.stringify(k2));
    ok_(`${label} EDIT＋KEY のパッド＝ピアノロールを直接（EDIT の画面は出ない）`, k3.roll&&k3.modal==='none', JSON.stringify(k3));
    eq(`${label} 窓の SAMPLE＝サンプルに戻る・タブも SAMPLE`, k4, {kind:'SPL',tab:'SAMPLE'});
    // v0.3.206 §195：音の入った KEY から窓の SCRATCH／SAMPLE ＝ 聞く。「この KEY を波形にする」＝KEY の音がパッドの波形に・「やめる」＝そのまま・「元に戻す」＝元のサンプル
    await p.click('#clPage .cl-kind[data-kind="KEY"]'); await p.waitForTimeout(400); await p.evaluate(async()=>{keyEditorClose();tracks[5].keyPhrase={bars:1,notes:[{pitch:60,beat:0,length:1,velocity:100},{pitch:64,beat:1,length:1,velocity:90}]};await prepareKeyTrack(tracks[5],bpmVal);});
    const keyLen=await p.evaluate(()=>tracks[5].buffer.length);
    await p.click('#clPage .cl-kind[data-kind="SCR"]'); await p.waitForTimeout(250);
    const a1=await p.evaluate(()=>({ask:!document.getElementById('keyLeaveAsk').hidden,to:document.getElementById('keyLeaveTo').textContent,kind:padKind(tracks[5])}));
    await p.click('#keyLeaveAsk [data-leave=""]'); await p.waitForTimeout(150); const a2=await p.evaluate(()=>({ask:!document.getElementById('keyLeaveAsk').hidden,kind:padKind(tracks[5])}));
    await p.click('#clPage .cl-kind[data-kind="SCR"]'); await p.waitForTimeout(250); await p.click('#keyLeaveAsk [data-leave="bake"]'); await p.waitForTimeout(700);
    const a3=await p.evaluate(()=>{const d=tracks[5].buffer.getChannelData(0);let peak=0;for(const v of d)peak=Math.max(peak,Math.abs(v));return {kind:padKind(tracks[5]),len:tracks[5].buffer.length,peak:+peak.toFixed(3),scr:!document.getElementById('scratchEditor').hidden,notes:tracks[5].keyPhrase.notes.length};});
    await p.evaluate(()=>scratchClose());
    ok_(`${label} 音の入った KEY から SCRATCH＝聞く・やめる＝KEY のまま`, a1.ask&&a1.to==='SCRATCH'&&a1.kind==='KEY'&&!a2.ask&&a2.kind==='KEY', JSON.stringify({a1,a2}));
    ok_(`${label} 「この KEY を波形にする」＝KEY の音がスクラッチの波形に・打ち込みは残る`, a3.kind==='SCR'&&a3.len===keyLen&&a3.peak>0.01&&a3.scr&&a3.notes===2, JSON.stringify(a3));
    await p.evaluate(async()=>{await setPadKind(5,'SPL');});
    await p.click('#clKeys .cl-key[data-pg="main"]'); await p.waitForTimeout(150); }
  // v0.3.204 §193：SCRATCH のパッドを押しても画面は開かず、普通に鳴る（案内だけ出る）
  { await p.evaluate(async()=>{await setPadKind(6,'SCR');scratchClose();}); const pr=await p.evaluate(()=>{const b=document.querySelectorAll('#pads .pad')[6].getBoundingClientRect();return [b.left+b.width/2,b.top+b.height*.8];});
    await p.mouse.click(pr[0],pr[1]); await p.waitForTimeout(300);
    const s6=await p.evaluate(()=>({scr:!document.getElementById('scratchEditor').hidden,node:!!_scratchNode,voices:(tracks[6].activeVoices||[]).length,msg:sampNameEl.textContent,sel:selected}));
    ok_(`${label} SCRATCH のパッドを押しても画面は開かず普通に鳴る`, !s6.scr && !s6.node && s6.voices>0 && /SCRATCH/.test(s6.msg) && s6.sel===6, JSON.stringify(s6));
    await p.evaluate(async()=>{await setPadKind(6,'SPL');}); }
  await p.evaluate(async()=>{await setPadKind(8,'SCR');await scratchOpen(8);});
  eq(`${label} SCRは対象パッドから起動`,await p.evaluate(()=>[document.getElementById('scratchEditor').hidden,!!_scratchNode]),[false,true]);
  await p.screenshot({path:`tools/_shots/content-scr-${w}.png`});
  // v0.3.186 §174：縦一直線の波形面（奥へ＝フォワード）・奥から手前へスワイプで開くフェーダー・⇄ で左右入替（覚える）
  {const deck=await p.locator('#scratchDeck').boundingBox(),gate=await p.locator('#scratchFader').boundingBox(),hand=await p.locator('#scratchHand').boundingBox(),close=await p.locator('#scratchClose').boundingBox();
   ok_(`${label} SCR 面とフェーダーが縦長で画面内・既定はフェーダー右・⇄ は面の上・CLOSE はフェーダーの上`,deck.height>=300&&deck.height>deck.width&&gate.height>=300&&gate.x>deck.x&&deck.y+deck.height<=h&&hand.y+hand.height<=deck.y&&hand.x>=deck.x&&close.x>=gate.x-1&&close.y+close.height<=gate.y,JSON.stringify({deck,gate,hand,close}));
   await p.mouse.move(deck.x+deck.width-20,deck.y+deck.height/2);await p.mouse.down();await p.waitForTimeout(80);const f0=await p.evaluate(()=>scratchState().frame);
   for(let k=1;k<=8;k++){await p.mouse.move(deck.x+deck.width-20,deck.y+deck.height/2+k*12);await p.waitForTimeout(16);}await p.waitForTimeout(150);
   const f1=await p.evaluate(()=>[scratchState().frame,scratchState().dragging]);await p.mouse.up();
   ok_(`${label} SCR 面の端でも掴める・手前へ引くと戻る`,f1[1]===true&&f1[0]<f0-500,JSON.stringify({f0,f1}));
   await p.mouse.move(gate.x+gate.width/2,gate.y+gate.height*.59);await p.mouse.down();await p.waitForTimeout(60);const fo=await p.evaluate(()=>scratchState().fader);await p.mouse.up();await p.waitForTimeout(60);const fc=await p.evaluate(()=>scratchState().fader);
   ok_(`${label} フェーダーは触った所まで開き（真ん中≒50%）、離すと全閉`,Math.abs(fo-.5)<.06&&fc===0,JSON.stringify({fo,fc}));
   await p.click('#scratchHand');const g2=await p.locator('#scratchFader').boundingBox(),d2=await p.locator('#scratchDeck').boundingBox();
   ok_(`${label} ⇄ でフェーダーが左へ`,g2.x<d2.x,JSON.stringify({g2,d2}));
   eq(`${label} 左右入替を端末に覚える`,await p.evaluate(()=>localStorage.getItem('mics.scrHand')),'R');await p.click('#scratchHand');}
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
