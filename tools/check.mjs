// MICS009 回帰チェック（Playwright）
//   起動:  npx http-server -p 8137 .    （または python3 -m http.server 8137）
//   実行:  node tools/check.mjs [port]
//   環境変数: SHOT=出力先ディレクトリ（既定 ./tools/_shots）
// 環境ごとに違うのは chromium の場所だけ。PW_EXE で上書きできる。
import { chromium, unlock } from './pw.mjs';
const PORT=process.argv[2]||8137;
const SHOT=process.env.SHOT||'./tools/_shots';
await (await import('node:fs/promises')).mkdir(SHOT,{recursive:true});
const br=await chromium.launch({...(process.env.PW_EXE?{executablePath:process.env.PW_EXE}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const fail=[];
const eq=(label,got,want)=>{ const ok=JSON.stringify(got)===JSON.stringify(want); if(!ok) fail.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); return ok; };
const ok_=(label,cond,info)=>{ if(!cond) fail.push(`${label}: ${info}`); };

// 起動完了を「時間」でなく「状態」で待つ。固定sleepだとCPU負荷（並列検査など）でフレークする
async function ready(p){
  await p.waitForFunction(()=>typeof tracks!=='undefined' && tracks[0] && tracks[0].buffer && typeof paintPerf==='function', null, {timeout:20000});
  await p.evaluate(()=>{const s=document.getElementById('splash'); if(s) s.style.display='none';});
  await p.mouse.move(5,5); await p.mouse.down(); await p.mouse.up();
  await p.waitForTimeout(600);   // 起動タップ直後450msの入力シールドを消化（これは仕様なので時間待ち）
}
async function run(w,h,mobile){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const V=`${w}x${h}`;
  const page=async id=>{ await p.click(`#clKeys .cl-key[data-pg="${id}"]`); await p.waitForTimeout(120); return p.evaluate(()=>clPage); };
  const box=s=>p.$eval(s,e=>{const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2,w:Math.round(r.width),h:Math.round(r.height)};});
  const drag=async(sel,dx)=>{const b=await box(sel); await p.mouse.move(b.x,b.y); await p.mouse.down(); await p.mouse.move(b.x+dx,b.y,{steps:8}); await p.mouse.up(); await p.waitForTimeout(90);};
  const dbl=async sel=>{const b=await box(sel); await p.mouse.dblclick(b.x,b.y); await p.waitForTimeout(90);};

  // 1) 表示幅が値で動かない
  const wid=await p.evaluate(async()=>{
    const s=ms=>new Promise(r=>setTimeout(r,ms)); const out={};
    const W=sel=>Math.round(document.querySelector(sel).getBoundingClientRect().width);
    const g=[]; for(const v of[0,3,-12,12,-5]){tracks[selected].tune=v;paintPerf();await s(15);g.push(W('.cl-par[data-p="pitch"]'));}
    out.pitch=new Set(g).size===1;
    const l=[]; for(const v of[0,-4,-30,6]){tracks[selected].vol=v;paintPerf();await s(15);l.push(W('.cl-par[data-p="level"]'));}
    out.level=new Set(l).size===1;
    const b=[]; for(const v of[94.5,100,247.5,60]){bpmVal=v;paintPerf();await s(15);b.push(W('#perfBpm'));}
    out.bpm=new Set(b).size===1;
    const st=[]; playing=false;paintPerf();await s(15);st.push(W('#clStep'));
    playing=true;playStep=0;paintPerf();await s(15);st.push(W('#clStep'));
    playStep=15;paintPerf();await s(15);st.push(W('#clStep')); playing=false;
    out.step=new Set(st).size===1;
    bpmVal=100;tracks[selected].tune=0;tracks[selected].vol=-4;paintPerf();
    return out;
  });
  eq(`${V} 固定幅`, wid, {pitch:true,level:true,bpm:true,step:true});

  // 2) 5ページが出る
  const fields={};
  for(const id of['main','smpl','tone','asgn']){ eq(`${V} ページ切替 ${id}`, await page(id), id);
    fields[id]=await p.$$eval('#clPage .cl-par',e=>e.map(x=>x.dataset.p)); }
  eq(`${V} MAIN欄`,fields.main,['pitch','scale','level','delay','reverb']);   // FXはMAINの2行目（v0.3.108）
  eq(`${V} SAMPLE欄`,fields.smpl,['start','end','loop']);
  eq(`${V} TONE欄`,fields.tone,['filter','cutoff','reso','attack','fade']);
  eq(`${V} ASSIGN欄`,fields.asgn,['choke','out','midi','key']);

  // 2b) ★ページを移しても寸法が1pxも動かない（幅も高さも／窓・メニュー・キー・パッド）
  //    このクラスの不具合を何度も出しているので、ここで丸ごと止める
  const geo=[];
  for(const id of['main','smpl','tone','asgn']){ await page(id);
    geo.push([id, await p.evaluate(()=>{const r=x=>{const e=document.querySelector(x); if(!e) return null;
        const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height),Math.round(b.x),Math.round(b.y)];};
      return {scr:r('.perf-screen'), keys:r('#clKeys'), key1:r('#clKeys .cl-key'), pad:r('#pads .pad'), pads:r('#pads')};})]); }
  // メッセージ／ヒントの出入りでも動かない（トーストのたびに窓が伸び縮みしていた）
  const snap=async lbl=>geo.push([lbl, await p.evaluate(()=>{const r=x=>{const e=document.querySelector(x); if(!e) return null;
      const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height),Math.round(b.x),Math.round(b.y)];};
    return {scr:r('.perf-screen'), keys:r('#clKeys'), key1:r('#clKeys .cl-key'), pad:r('#pads .pad'), pads:r('#pads')};})]);
  await p.evaluate(()=>{sampNameEl.textContent="長文テスト：MIDI STORM 自動OFF 1秒に45ノート超えたので入力を切りました"; paintPerf();});
  await p.waitForTimeout(120); await snap('長文メッセージ');
  await p.evaluate(()=>{sampNameEl.textContent=""; armMode='edit'; paintPerf();});
  await p.waitForTimeout(120); await snap('ヒント表示');
  await p.evaluate(()=>{armMode=null; paintPerf();}); await p.waitForTimeout(120); await snap('素');
  for(const k of ['scr','keys','key1','pad','pads']){
    const vals=geo.map(([id,g])=>[id,JSON.stringify(g[k])]);
    const uniq=new Set(vals.map(v=>v[1]));
    ok_(`${V} ${k} の寸法が状態で動かない`, uniq.size===1, vals.map(v=>v.join('=')).join(' '));
  }
  await page('main');

  // 2c) ソフトキーは「現在地を示す値」＋演奏系（ui-rules.md §2/§3）
  const keyGeo=await p.evaluate(()=>{const k=document.querySelector('#clKeys .cl-key');
    const b=k.getBoundingClientRect(); return {h:Math.round(b.height), px:parseFloat(getComputedStyle(k).fontSize)};});
  ok_(`${V} ソフトキーの高さ44px以上`, keyGeo.h>=44, `${keyGeo.h}px`);
  ok_(`${V} ソフトキーの文字11px以上`, keyGeo.px>=11, `${keyGeo.px}px`);

  // 3) ドラッグ／列挙タップ／ダブルクリックで0
  await page('main');
  await drag('.cl-par[data-p="pitch"]',70);
  ok_(`${V} PITCHドラッグ`, await p.evaluate(()=>tracks[selected].tune)===5, 'tune!==5');
  const sc0=await p.evaluate(()=>tracks[selected].scale);
  await p.click('.cl-par[data-p="scale"]'); await p.waitForTimeout(90);
  ok_(`${V} SCALEタップ`, (await p.evaluate(()=>tracks[selected].scale))!==sc0, '変化なし');
  ok_(`${V} SCALE→SEQ連動`, await p.evaluate(()=>melodicMode)===true, 'melodicMode false');
  await dbl('.cl-par[data-p="pitch"]');
  ok_(`${V} PITCHダブルクリック=0`, await p.evaluate(()=>tracks[selected].tune)===0, '0でない');
  await page('main'); await drag('.cl-par[data-p="delay"]',80);
  ok_(`${V} DELAY（旧・入口なし）`, (await p.evaluate(()=>tracks[selected].delaySend))>0, '0のまま');
  await dbl('.cl-par[data-p="delay"]');
  ok_(`${V} DELAYを0へ`, await p.evaluate(()=>tracks[selected].delaySend)===0, '0でない');

  // 4) テンポ／スウィング
  await page('main');
  const b0=await p.evaluate(()=>bpmVal); await drag('.cl-par[data-p="bpm"]',100);
  const b1=await p.evaluate(()=>({v:bpmVal,slider:+document.getElementById('bpm').value,read:document.getElementById('bpmRead').textContent}));
  ok_(`${V} BPMドラッグ`, b1.v===b0+10 && b1.slider===b1.v && b1.read===b1.v.toFixed(1), JSON.stringify(b1));
  await dbl('.cl-par[data-p="bpm"]');
  ok_(`${V} BPMダブルクリック=100`, await p.evaluate(()=>bpmVal)===100, '100でない');
  const sw0=await p.evaluate(()=>swingPct);
  await p.click('.cl-par[data-p="swing"]'); await p.waitForTimeout(90);
  ok_(`${V} SWGタップ`, (await p.evaluate(()=>swingPct))!==sw0, '変化なし');

  // 5) ラーニング（表画面で完結）
  await p.evaluate(()=>{selectPad(2); selectPadHeavy();});
  await page('asgn'); await p.click('#clLearn'); await p.waitForTimeout(80);
  ok_(`${V} LEARN待機`, await p.evaluate(()=>assignTarget)===2, 'assignTarget!==2');
  await p.keyboard.press('KeyQ'); await p.waitForTimeout(90);
  const lr=await p.evaluate(()=>({key:tracks[2].key,at:assignTarget,f:document.querySelector('.cl-par[data-p="key"] b').textContent}));
  eq(`${V} PCキー学習`, lr, {key:'q',at:-1,f:'Q'});
  await p.click('#clLearn'); await p.waitForTimeout(60);
  await p.evaluate(()=>handleMIDI(new Uint8Array([0x90,64,100]))); await p.waitForTimeout(90);
  const mr=await p.evaluate(()=>({n:tracks[2].midiNote,f:document.querySelector('.cl-par[data-p="midi"] b').textContent}));
  eq(`${V} MIDI学習`, mr, {n:64,f:'E4'});
  await p.click('#clClear'); await p.waitForTimeout(80);
  eq(`${V} CLEAR`, await p.evaluate(()=>[tracks[2].midiNote,tracks[2].key]), [null,null]);

  // 6) 波形は1実体：窓とモーダルを行き来する
  const where=()=>p.evaluate(()=>{const b=document.getElementById('peWaveBox');return b?b.parentElement.id:'?';});
  eq(`${V} 波形の所在(ASSIGN中)`, await where(), 'peWaveHome');
  await page('smpl'); eq(`${V} 波形の所在(SAMPLE)`, await where(), 'clWaveSlot');
  await page('tone'); eq(`${V} 波形の所在(TONE)`, await where(), 'peWaveHome');
  await page('smpl');
  const st0=await p.evaluate(()=>tracks[selected].start);
  await drag('#peStart',60);
  const st1=await p.evaluate(()=>({s:tracks[selected].start,f:document.querySelector('.cl-par[data-p="start"] b').textContent}));
  ok_(`${V} ハンドル→数値欄`, st1.s>st0 && st1.f===(st1.s*100).toFixed(1), JSON.stringify(st1));
  const hx=await p.$eval('#peStart',e=>Math.round(e.getBoundingClientRect().x));
  await drag('.cl-par[data-p="start"]',60);
  ok_(`${V} 数値欄→ハンドル`, (await p.$eval('#peStart',e=>Math.round(e.getBoundingClientRect().x)))!==hx, 'ハンドル動かず');
  if(!mobile){ const wv=await box('.cl-waveslot .pe-wave'), fl=await box('.cl-par[data-p="start"]');
    ok_(`${V} 波形は欄の右`, wv.x>fl.x, `${wv.x} <= ${fl.x}`); }

  // 6b) 再生位置カーソル（v0.3.103）：SAMPLEページで手叩き／再生中に走り、他ページでは出ない
  {
    const ph=()=>p.evaluate(()=>{const e=document.getElementById('pePlayhead'); return {op:e.style.opacity, left:parseFloat(e.style.left)||0};});
    await page('smpl'); await p.evaluate(()=>{ selectPad(3); selectPadHeavy(); });
    await p.evaluate(()=>trigger(3));
    let hit=null; for(let k=0;k<24;k++){ await p.waitForTimeout(50); const r=await ph(); if(r.op==='1'){ hit=r; break; } }
    ok_(`${V} SAMPLEで叩くと再生カーソル`, !!hit, 'カーソルが出ない');
    await p.evaluate(()=>{ const t=tracks[3]; t.patterns[editPat][editBar].fill(0); t.patterns[editPat][editBar][0]=1; t.patterns[editPat][editBar][8]=1; document.getElementById('play').click(); });
    let seen=false; for(let k=0;k<30;k++){ await p.waitForTimeout(60); const r=await ph(); if(r.op==='1'&&r.left>0){ seen=true; break; } }
    await p.evaluate(()=>{ document.getElementById('play').click(); tracks[3].patterns[editPat][editBar].fill(0); });
    ok_(`${V} 再生中も再生カーソル`, seen, '再生中にカーソルが出ない');
    await page('tone'); await p.evaluate(()=>trigger(3)); await p.waitForTimeout(150);
    ok_(`${V} 波形が無いページではカーソルを出さない`, (await ph()).op!=='1', '出ている');
    await page('smpl');   // 次の検査（TRIM/CHOP モーダル）は SAMPLE ページの ✂ から開く
  }

  // 6c) 低い画面で中身がスクロールしても情報窓は上に貼り付く（波形の上が欠けない。v0.3.105）
  if(mobile){
    const st=await p.evaluate(()=>{const vp=document.getElementById('viewPads'); const scr=document.querySelector('.perf-screen');
      const rel=()=>Math.round(scr.getBoundingClientRect().top-vp.getBoundingClientRect().top);
      const b=rel(); vp.scrollTop=9999; const a=rel(); const wave=document.querySelector('.cl-waveslot .pe-wave');
      const wt=wave?Math.round(wave.getBoundingClientRect().top-vp.getBoundingClientRect().top):0; vp.scrollTop=0;
      return {before:b, after:a, waveTop:wt, bodyH:document.body.style.height};});
    ok_(`${V} スクロールしても窓が上に貼り付く`, st.before===0 && st.after===0 && st.waveTop>0, JSON.stringify(st));
    ok_(`${V} スマホの高さは可視高さに追従`, /px$/.test(st.bodyH), st.bodyH);
    // 下段（MUTE/DELAY/REVERB）はスクロールしなくても見える（v0.3.107：sticky bottom）
    const ms=await p.evaluate(()=>{const vp=document.getElementById('viewPads').getBoundingClientRect(); const m=document.querySelector('#viewPads>.msbar').getBoundingClientRect();
      return {inView: m.bottom<=vp.bottom+1 && m.top>=vp.top, h:Math.round(m.height)};});
    ok_(`${V} 下段がスクロール無しで見える`, ms.inView && ms.h>=44, JSON.stringify(ms));
  }

  // 6e) スマホ：16枚のパッドがスクロール無しで下段の上に収まる（v0.3.111：ロゴ行の統合＋パッド下限44px）。ロゴは行を変えても画面に残る
  {
    const g=await p.evaluate(()=>{const pads=[...document.querySelectorAll('#pads .pad')].map(e=>e.getBoundingClientRect());
      const m=document.querySelector('#viewPads>.msbar').getBoundingClientRect(); const lg=document.querySelector('.logo'); const lr=lg.getBoundingClientRect();
      return {n:pads.length, lastBot:Math.round(Math.max(...pads.map(r=>r.bottom))), minH:Math.round(Math.min(...pads.map(r=>r.height))), msTop:Math.round(m.top),
        logoIn:lg.closest('#viewDots')?'dots':(lg.closest('.top')?'top':'?'), logoVis:lr.width>0&&lr.height>0&&lr.bottom<=innerHeight};});
    const stacked=w<=767;   // 積み上げレイアウト（media query と relocateLogo の境界）。touch 有無とは別
    if(stacked){ ok_(`${V} 16枚のパッドが下段の上に収まる（スクロール無し）`, g.n===16 && g.lastBot<=g.msTop, JSON.stringify(g)); ok_(`${V} パッド高さ ≥44px`, g.minH>=44, g.minH); }
    ok_(`${V} ロゴが画面に残る（${stacked?'PADS/SEQ行':'ヘッダ'}）`, g.logoVis && g.logoIn===(stacked?'dots':'top'), JSON.stringify(g));
  }
  // 6d) スマホの下段は [MUTE][DELAY][REVERB]（SOLO/EDIT は出さない）。DELAY→パッド左右ドラッグで送り量（v0.3.106）
  if(mobile){
    const vis=await p.evaluate(()=>{const g=id=>{const e=document.getElementById(id); const r=e.getBoundingClientRect(); return r.height>0&&getComputedStyle(e).display!=='none'?Math.round(r.height):0;};
      return {mute:g('holdMute'), solo:g('holdSolo'), edit:g('holdEdit'), delay:g('fxDelay'), reverb:g('fxReverb')};});
    ok_(`${V} 下段は MUTE/DELAY/REVERB`, vis.mute>=44 && vis.delay>=44 && vis.reverb>=44 && vis.solo===0 && vis.edit===0, JSON.stringify(vis));
    await p.evaluate(()=>{ selectPad(4); selectPadHeavy(); tracks[4].delaySend=0; });
    await p.click('#fxDelay'); await p.waitForTimeout(80);
    eq(`${V} DELAYボタンで activeLock`, await p.evaluate(()=>activeLock), 'delay');
    const pb=await box('#pads .pad:nth-child(5)');
    await p.mouse.move(pb.x,pb.y); await p.mouse.down(); await p.mouse.move(pb.x+60,pb.y,{steps:8}); await p.mouse.up(); await p.waitForTimeout(120);
    const ds=await p.evaluate(()=>tracks[4].delaySend);
    ok_(`${V} DELAY中にパッド左右ドラッグで送り量`, ds>0, `delaySend=${ds}`);
    await p.waitForTimeout(400);
    ok_(`${V} 離しても戻らない`, (await p.evaluate(()=>tracks[4].delaySend))===ds, '戻った');
    await p.click('#fxDelay'); await p.waitForTimeout(80);
    eq(`${V} もう一度で解除`, await p.evaluate(()=>activeLock), null);
    await p.evaluate(()=>{ tracks[4].delaySend=0; });
  }

  // 7) モーダルは「入り組んだ設定」だけ
  await p.click('#clWave'); await p.waitForTimeout(600);   // 開いて450msはクリックを飲む（ゴーストクリック対策）
  eq(`${V} モーダル中の波形`, await where(), 'peWaveHome');
  const md=await p.evaluate(()=>{const m=document.getElementById('padEditModal');
    return {disp:getComputedStyle(m).display, ranges:m.querySelectorAll('input[type=range]').length,
            selects:m.querySelectorAll('select').length,
            btns:[...m.querySelectorAll('button,.loadbtn')].map(b=>(b.id||b.textContent.trim()).slice(0,12))};});
  eq(`${V} モーダルにノブ/セレクトが無い`, [md.ranges,md.selects], [0,0]);
  ok_(`${V} モーダルは表示できる`, md.disp==='flex', md.disp);
  await p.click('#peClose'); await p.waitForTimeout(400);
  eq(`${V} 閉じたら窓へ戻る`, await where(), 'clWaveSlot');

  // 7b) ★SEQ/GRIDのパターンA-D・小節1-4が「押して選べる」
  //     v0.3.84の範囲削除でこのクリック登録が丸ごと消えていた（v0.3.96で復元）
  await p.evaluate(()=>{ document.getElementById('modeSeq').click(); });
  await p.waitForTimeout(250);
  await p.evaluate(()=>{ setEditPat(0); setEditBar(0); });
  await p.click('#barSeg button[data-b="1"]'); await p.waitForTimeout(120);
  eq(`${V} SEQでBAR2を選べる`, await p.evaluate(()=>editBar), 1);
  await p.click('#patSeg button[data-p="2"]'); await p.waitForTimeout(120);
  eq(`${V} SEQでPAT Cを選べる`, await p.evaluate(()=>editPat), 2);
  await p.evaluate(()=>{ setEditPat(0); setEditBar(0); document.getElementById('modePads').click(); });
  await p.waitForTimeout(200);

  // 7c) ★タッチ：EDIT→パッドでモーダルが開いた直後のゴーストクリックが TRIM を誤発動しない（W1・v0.3.98）
  if(mobile){
    const before=await p.evaluate(()=>tracks[3].buffer.length);
    // スマホに EDIT ボタンは無い（v0.3.106）。モーダルは SAMPLE ページの ✂ から開く＝その直後のゴーストクリックを見る
    await p.evaluate(()=>{ selectPad(3); selectPadHeavy(); });
    await page('smpl'); await p.tap('#clWave'); await p.waitForTimeout(350);
    const g=await p.evaluate(()=>({modal:document.getElementById('padEditModal').style.display, len:tracks[3].buffer.length}));
    ok_(`${V} タッチでEDIT→パッド：モーダルが開いたまま`, g.modal==='flex', g.modal);
    ok_(`${V} タッチでEDIT→パッド：TRIMが誤発動しない`, g.len===before, `${before}→${g.len}`);
    await p.waitForTimeout(500);   // 開いてから450msはクリックを飲む（ゴーストクリック対策）ので、その後に閉じる
    await p.evaluate(()=>{ document.getElementById('peClose').click(); if(armMode) arm('edit',false); });
    await p.waitForTimeout(200);
  }
  // 7h) ★情報窓：ドラッグ直後に掴み直しても0に飛ばない／ASSIGNで奪った割当がUndoで戻る（W3・v0.3.98）
  await p.evaluate(()=>{ const vp=document.getElementById('viewPads'); if(vp) vp.scrollTop=0; });   // 低い画面では 7c のパッド tap で内側がスクロールしている
  await page('main');
  {
    await p.evaluate(()=>{ tracks[selected].tune=0; paintPerf(); });   // 既定プロジェクトの tune に依存しない
    const b=await box('.cl-par[data-p="pitch"]');
    await p.mouse.move(b.x,b.y); await p.mouse.down(); await p.mouse.move(b.x+71,b.y,{steps:4}); await p.mouse.up();
    await p.mouse.move(b.x+20,b.y); await p.mouse.down(); await p.waitForTimeout(30);
    const v=await p.evaluate(()=>tracks[selected].tune); await p.mouse.up(); await p.waitForTimeout(80);
    ok_(`${V} ドラッグ直後の掴み直しで0に飛ばない`, v===5, `tune=${v}`);
    await dbl('.cl-par[data-p="pitch"]');
  }
  // パッド右下のキー表示（v0.3.102）：既定は 1-8/Q-I、ASSIGN で変えたら追従、Undoで戻る
  eq(`${V} パッド右下のキー表示`, await p.evaluate(()=>{ tracks.forEach(t=>{t.key=null;}); paintPadStates();
    const a=[...document.querySelectorAll('#pads .pad .k')].map(e=>e.textContent).join('');
    assignTo(4,'key','z','Z'); const b=document.querySelectorAll('#pads .pad .k')[4].textContent; doUndo(); paintPadStates();
    const c=document.querySelectorAll('#pads .pad .k')[4].textContent; return [a,b,c]; }), ['12345678QWERTYUI','Z','5']);
  eq(`${V} 奪った割当がUndoで戻る`, await p.evaluate(()=>{ tracks.forEach(t=>{t.key=null;t.midiNote=null;}); tracks[2].key='q';
    assignTo(7,'key','q','Q'); const a=[tracks[7].key,tracks[2].key]; doUndo(); return [...a,tracks[7].key,tracks[2].key]; }), ['q',null,null,'q']);
  // 7d) ★perf の ●REC が存在してトグルできる（W5 NG-B・v0.3.98）
  if(await p.evaluate(()=>document.body.classList.contains('perf'))){
    await p.click('#perfRec'); await p.waitForTimeout(80);
    eq(`${V} ●REC でP-LOCK記録を有効化できる`, await p.evaluate(()=>perfRecArm), true);
    await p.click('#perfRec'); await p.waitForTimeout(80);
  }
  // 7e) ★手叩きの記録先は「表示中の小節」（W5 NG-C・v0.3.98）
  eq(`${V} 小節末の手叩きが次小節に入らない`, await p.evaluate(()=>{
    const sv=tracks[0].patterns[0].map(b=>b.slice());
    playing=true; recording=true; displayPat=0; displayBar=0; playPat=0; playBar=1; playStep=15;
    trigger(0); const r=[tracks[0].patterns[0][0][15], tracks[0].patterns[0][1][15]];
    playing=false; recording=false; tracks[0].patterns[0]=sv; return r; }), [1,0]);
  // 7f) ★BPM変更で「次のステップの時刻」が動かない＝無音も飛びも出ない（W5 NG-A・v0.3.98）
  ok_(`${V} BPM変更で位相が保たれる`, await p.evaluate(()=>{
    playing=true; barStartTime=AC.currentTime+1; stepIdx=5; const b0=bpmVal; applyBpm(180);
    const t0=stepTimeClean(5); applyBpm(60); const t1=stepTimeClean(5); applyBpm(b0); playing=false;
    return Math.abs(t1-t0)<1e-6; }), 'stepTimeClean が動いた');
  // 7g) ★空パッドとして保存されたものを読むと前の音が消える（W4 NG-3・v0.3.98）
  eq(`${V} 空パッドのLoadで幽霊サンプルが残らない`, await p.evaluate(async()=>{
    const pr=JSON.parse(JSON.stringify(buildProject())); pr.tracks[1].audio=null; pr.tracks[1].type='empty'; pr.tracks[1].name='EMPTY';
    await applyProject(pr); return [!!tracks[1].buffer, PADS[1].type]; }), [false,'empty']);
  await p.evaluate(async()=>{ await applyProject(JSON.parse(JSON.stringify(buildProject()))); });

  // 7i) ★どのレイアウトでも再生中は STEP/STATE が生きている（W6 NG-1・v0.3.98。perf限定で「--」「■ STOP」のままだった）
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(700);
  const live=await p.evaluate(()=>({step:document.getElementById('clStep').textContent, playing:document.querySelector('.perf-screen').classList.contains('playing')}));
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
  ok_(`${V} 再生中にSTEPが進む表示`, /^\d\d\/16$/.test(live.step), live.step);
  ok_(`${V} 再生中は窓が点く（.playing）`, live.playing===true, 'playing クラスが無い');   // 文字の ▶ PLAY は撤去（▶ボタンと二重）

  // 8) 既存機能が生きている
  const misc=await p.evaluate(()=>{
    const r={};
    try{ document.getElementById('modeSeq').click(); r.seq='ok'; document.getElementById('modePads').click(); }catch(e){ r.seq=String(e); }
    const v0=tracks[selected].tune; pushUndo(); tracks[selected].tune=7; doUndo(); r.undo=tracks[selected].tune===v0;
    return r;
  });
  ok_(`${V} SEQ往復`, misc.seq==='ok', misc.seq);
  ok_(`${V} UNDO`, misc.undo===true, 'undoで戻らない');

  // 9) 寸法
  const dim=await p.evaluate(()=>{const pd=document.querySelector('#pads .pad').getBoundingClientRect();
    return {pad:Math.round(pd.height), scr:Math.round(document.querySelector('.perf-screen').getBoundingClientRect().height),
            docH:document.documentElement.scrollHeight, winH:innerHeight};});
  ok_(`${V} ページ全体は縦スクロールしない`, dim.docH<=dim.winH+1, `${dim.docH}>${dim.winH}`);
  ok_(`${V} PCの縦長でも回転オーバーレイで塞がない`, !(await p.evaluate(()=>document.body.classList.contains('perf-rotate'))) || mobile, 'perf-rotate が付いている');
  ok_(`${V} パッド高（下限44px＝演奏系タップの規則値。足りなければ内側で縦スクロール）`, dim.pad>=44, `${dim.pad}px`);
  eq(`${V} 0 errors`, errs, []);
  await p.screenshot({path:`${SHOT}/shot-${w}.png`});

  // 10) ★自動保存：更新やリロードで読み込んだ音とパターンが消えない（データ消失は再発が致命的）
  await p.evaluate(()=>{ pushUndo(); tracks[0].name="CHKTAKE"; tracks[0].tune=9; tracks[0].patterns[0][0][5]=1; bpmVal=111.5; });
  const wrote=await p.evaluate(async()=>{ await autosaveNow(true);
    const r=await idbOp("readonly",st=>st.get(AUTOSAVE.key)); return !!(r&&r.json&&r.json.length>1000); });
  ok_(`${V} 自動保存が書かれる`, wrote, '書かれていない');
  await p.reload({waitUntil:'load'}); await ready(p);
  const restored=await p.evaluate(()=>({name:tracks[0].name, tune:tracks[0].tune,
    step:tracks[0].patterns[0][0][5], bpm:bpmVal, buf:!!tracks[0].buffer}));
  eq(`${V} リロードで復元`, restored, {name:"CHKTAKE",tune:9,step:1,bpm:111.5,buf:true});
  // 10b) ★Load した .mics は自動保存に乗る＝次回起動で「読む前」に戻らない（W4 NG-1・v0.3.98）
  {
    const B=await p.evaluate(()=>{const pr=buildProject(); pr.tracks[0].name='LOADED1'; return JSON.stringify(pr);});
    const fsP=await import('node:fs/promises'); const f=`${SHOT}/projB.mics`; await fsP.writeFile(f,B);
    await p.setInputFiles('#projFile',f); await p.waitForTimeout(900);
    const saved=await p.evaluate(async()=>{ const r=await idbOp("readonly",st=>st.get(AUTOSAVE.key)); return !!(r&&r.json&&r.json.includes('"LOADED1"')); });
    ok_(`${V} Loadした.micsが自動保存に書かれる`, saved, '書かれていない');
    eq(`${V} LoadはUndoで戻れる`, await p.evaluate(()=>{ doUndo(); return tracks[0].name; }), "CHKTAKE");
  }
  await p.evaluate(()=>clearAutosave());

  // 11) ★ウィンドウの高さを変えたらSEQも追従する
  //     （PADSへ往復するまで古い高さのままだったバグの再発防止。v0.3.97）
  await p.evaluate(()=>document.getElementById('modeSeq').click()); await p.waitForTimeout(300);
  const seqBox=()=>p.evaluate(()=>{const b=document.getElementById('viewSeq').getBoundingClientRect();
    return [Math.round(b.width),Math.round(b.height)];});
  await p.setViewportSize({width:Math.max(360,w-160), height:Math.max(460,h-220)});
  await p.waitForTimeout(500);
  const afterResize=await seqBox();
  await p.evaluate(()=>{document.getElementById('modePads').click(); document.getElementById('modeSeq').click();});
  await p.waitForTimeout(400);
  eq(`${V} SEQがウィンドウ変更に追従`, afterResize, await seqBox());
  await p.setViewportSize({width:w,height:h});
  await p.evaluate(()=>document.getElementById('modePads').click());
  await p.waitForTimeout(200);
  await ctx.close();
  return {V, dim, md:md.btns};
}
// 12) ★入口の合言葉（v0.3.104）：解錠していない端末では合言葉を通るまで始まらない。通ったら覚える
async function passGate(){
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});   // unlock しない
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await p.waitForFunction(()=>typeof tracks!=='undefined' && tracks[0] && tracks[0].buffer, null, {timeout:20000});
  // 通った後は start() が splash を DOM から外す（400ms後）ので null を「隠れた」と読む
  const st=()=>p.evaluate(()=>{const sp=document.getElementById('splash');
    const g=x=>{const e=document.querySelector(x); return e?getComputedStyle(e).display:'none';};
    return {locked:!!sp&&sp.classList.contains('locked'), prompt:g('#splash .s-prompt'), form:g('#splashPassForm'),
      msg:(document.getElementById('splashPassMsg')||{}).textContent||'', hidden:!sp||sp.classList.contains('hide'),
      saved:(()=>{try{return localStorage.getItem('mics009.pass');}catch(e){return null;}})()};});
  const s0=await st();
  ok_(`合言葉 施錠中は TAP TO START を出さない`, s0.locked && s0.prompt==='none' && s0.form!=='none', JSON.stringify(s0));
  await p.mouse.click(200,600); await p.waitForTimeout(400);   // 画面をタップしても始まらない
  ok_(`合言葉 施錠中はタップで始まらない`, !(await st()).hidden, '始まってしまった');
  await p.fill('#splashPass','wrongword'); await p.press('#splashPass','Enter'); await p.waitForTimeout(300);
  const s1=await st(); ok_(`合言葉 違うと通さない`, !s1.hidden && /違/.test(s1.msg), JSON.stringify(s1));
  ok_(`合言葉 純JSのSHA-256が subtle と一致`, await p.evaluate(()=>typeof sha256js==='function' ? sha256js('akaiTower')==='1043819599ce5f51aa0d72251e2b5a18aa239fba8838621e6252032317d30f0f' : true), '不一致');
  await p.fill('#splashPass','akaiTower'); await p.press('#splashPass','Enter'); await p.waitForTimeout(600);
  const s2=await st(); ok_(`合言葉 合えば始まる＋覚える`, s2.hidden && s2.saved && s2.saved.length===64, JSON.stringify(s2));
  await p.reload({waitUntil:'load'});
  await p.waitForFunction(()=>typeof tracks!=='undefined' && tracks[0] && tracks[0].buffer, null, {timeout:20000});
  const s3=await st(); ok_(`合言葉 次回から聞かない`, !s3.locked && s3.form==='none' && s3.prompt!=='none', JSON.stringify(s3));
  eq(`合言葉 0 errors`, errs, []);
  await ctx.close();
}
// §13 レイテンシ予算（v0.3.110）：手叩き→発音の内部固定遅延と、コンプ差し替えの音量整合
async function latency(){
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const loaded=await p.waitForFunction(()=>typeof compNode!=='undefined' && !!compNode, null, {timeout:8000}).then(()=>true).catch(()=>false);
  ok_(`レイテンシ 先読みなしコンプ(worklet)がロードされる`, loaded, 'compNode が null');
  const r=await p.evaluate(async()=>{
    const out={tape:tapeDelay.delayTime.value, chain:chainLatencyMs()};
    const sr=AC.sampleRate;
    const mk=async(len)=>{ const o=new OfflineAudioContext(2,len,sr); await o.audioWorklet.addModule(URL.createObjectURL(new Blob([SP_COMP_CODE],{type:'application/javascript'}))); return o; };
    const render=async(sig,build)=>{ const o=await mk(sig.length); const b=o.createBuffer(2,sig.length,sr); b.getChannelData(0).set(sig); b.getChannelData(1).set(sig);
      const s=o.createBufferSource(); s.buffer=b; const n=build(o); s.connect(n); n.connect(o.destination); s.start(0); return (await o.startRendering()).getChannelData(0); };
    const native=o=>{ const c=o.createDynamicsCompressor(); c.threshold.value=-12;c.knee.value=12;c.ratio.value=4;c.attack.value=0.008;c.release.value=0.12; return c; };
    const work=o=>new AudioWorkletNode(o,'sp-comp',{outputChannelCount:[2]});
    const imp=new Float32Array(1024); imp[0]=1;
    const first=d=>{ let i=0; while(i<d.length&&Math.abs(d[i])<1e-4) i++; return i; };
    out.compFrames=first(await render(imp,work)); out.nativeFrames=first(await render(imp,native));
    // 実素材（ドラムパッド9-12の2小節）で標準コンプとRMSを比べる
    const bpm=92, step=60/bpm/4, len=Math.floor(sr*step*32), sig=new Float32Array(len);
    const hit=(ti,st,acc)=>{ const t=tracks[ti]; if(!t.buffer) return; const d=t.buffer.getChannelData(0); const g=Math.pow(10,(t.vol+(acc?3:0))/20);
      const s0=Math.floor(t.start*d.length), s1=Math.floor(t.end*d.length), at=Math.floor(st*step*sr); for(let i=s0;i<s1&&at+i-s0<len;i++) sig[at+i-s0]+=d[i]*g; };
    for(let bar=0;bar<2;bar++){ const o=bar*16; hit(8,o,1);hit(8,o+8,0);hit(8,o+10,0); hit(9,o+4,1);hit(9,o+12,1); for(let q=0;q<16;q+=2) hit(10,o+q,q%4===0); hit(11,o+14,0); }
    const rms=d=>{ let a=0; for(let i=0;i<d.length;i++) a+=d[i]*d[i]; return 10*Math.log10(a/d.length+1e-12); };
    out.rmsDiff=+(rms(await render(sig,work))-rms(await render(sig,native))).toFixed(2);
    // 出力段まるごとの複製（shelf→comp→sat→makeup→tape ＋ 低域経路 → finalClip）：全体の先頭遅延と FAT BASS の低域持ち上げ
    const chain=async(input,fat)=>{ const o=await mk(input.length); const b=o.createBuffer(2,input.length,sr); b.getChannelData(0).set(input); b.getChannelData(1).set(input);
      const s=o.createBufferSource(); s.buffer=b; const sh=o.createBiquadFilter(); sh.type='lowshelf'; sh.frequency.value=fatShelf.frequency.value; sh.gain.value=fat?FAT_SHELF_DB:0;
      const c=work(o), si=o.createGain(); si.gain.value=0.5; const sa=o.createWaveShaper(); sa.curve=saturator.curve; sa.oversample=saturator.oversample; const mkp=o.createGain(); mkp.gain.value=1.2;
      const tp=o.createDelay(0.05); tp.delayTime.value=tapeDelay.delayTime.value; const lp=o.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=150; lp.Q.value=0.7;
      const bs=o.createWaveShaper(); bs.curve=bassSat.curve; const dc=o.createBiquadFilter(); dc.type='highpass'; dc.frequency.value=25; const bg=o.createGain(); bg.gain.value=fat?FAT_BASS_MIX:THIN_BASS_MIX;
      const fc=o.createWaveShaper(); fc.curve=finalClip.curve; fc.oversample=finalClip.oversample;
      s.connect(sh); sh.connect(c); c.connect(si); si.connect(sa); sa.connect(mkp); mkp.connect(tp); sh.connect(lp); lp.connect(bs); bs.connect(dc); dc.connect(bg); bg.connect(tp); tp.connect(fc); fc.connect(o.destination);
      s.start(0); return (await o.startRendering()).getChannelData(0); };
    out.chainFrames=first(await chain(imp,true));
    const band=async(d,lo,hi)=>{ const o=new OfflineAudioContext(1,d.length,sr); const b=o.createBuffer(1,d.length,sr); b.getChannelData(0).set(d); const s=o.createBufferSource(); s.buffer=b;
      const h=o.createBiquadFilter(); h.type='highpass'; h.frequency.value=lo; h.Q.value=0.7; const l=o.createBiquadFilter(); l.type='lowpass'; l.frequency.value=hi; l.Q.value=0.7; s.connect(h); h.connect(l); l.connect(o.destination); s.start(0); return rms((await o.startRendering()).getChannelData(0)); };
    const fatD=await chain(sig,true), thinD=await chain(sig,false);
    out.subLift=+((await band(fatD,30,90))-(await band(thinD,30,90))).toFixed(2); out.midShift=+((await band(fatD,400,3000))-(await band(thinD,400,3000))).toFixed(2);
    // キーボード→発音予約のJSコスト（中央値）
    const os=AudioBufferSourceNode.prototype.start; let ts=0; AudioBufferSourceNode.prototype.start=function(w,...a){ ts=performance.now(); return os.call(this,w,...a); };
    const js=[]; for(let k=0;k<7;k++){ const t0=performance.now(); window.dispatchEvent(new KeyboardEvent('keydown',{key:'1',code:'Digit1',bubbles:true})); js.push(ts-t0); await new Promise(r=>setTimeout(r,70)); }
    AudioBufferSourceNode.prototype.start=os;
    out.jsMedian=+js.sort((a,b)=>a-b)[3].toFixed(2);
    return out;
  });
  ok_(`レイテンシ テープ基底遅延 ≤1.1ms`, r.tape<=0.0011, r.tape);
  ok_(`レイテンシ 内部固定遅延 <5ms (量子+テープ+コンプ)`, r.chain<5, r.chain);
  ok_(`レイテンシ コンプ先読み 0 frames（標準は${r.nativeFrames}）`, r.compFrames===0, r.compFrames);
  ok_(`レイテンシ コンプ差し替えのRMS差 ≤1dB`, Math.abs(r.rmsDiff)<=1, r.rmsDiff+' dB');
  ok_(`レイテンシ 出力段まるごとの先頭遅延 ≤ テープ1ms+1（WaveShaper 2x の隠れ遅延なし）`, r.chainFrames<=Math.ceil(0.001*44100)+1, r.chainFrames+' frames');
  ok_(`FAT BASS 30〜90Hz が +0.5〜+1.5dB 持ち上がる`, r.subLift>=0.5 && r.subLift<=1.5, r.subLift+' dB');
  ok_(`FAT BASS 中域はほぼ不変（|Δ|≤0.5dB）`, Math.abs(r.midShift)<=0.5, r.midShift+' dB');
  ok_(`レイテンシ キー→発音予約のJS中央値 <2ms`, r.jsMedian<2, r.jsMedian+' ms');
  await p.click('#menuBtn'); await p.waitForTimeout(150);
  const lat=await p.$eval('#vLat',e=>e.textContent);
  ok_(`レイテンシ メニューに内部/出力の表示`, /\d+ ms 内部 \/ \d+ ms 出力/.test(lat), lat);
  eq(`レイテンシ 0 errors`, errs, []);
  console.log(`レイテンシ 内部${r.chain.toFixed(1)}ms コンプ${r.compFrames}f(標準${r.nativeFrames}f) 出力段${r.chainFrames}f RMS差${r.rmsDiff}dB FAT sub+${r.subLift}dB mid${r.midShift}dB JS${r.jsMedian}ms  menu: ${lat}`);
  await ctx.close();
}
// §14 iOS：.mics の読み込み（v0.3.115）。iPhone の UA では projFile の accept 制限が外れる（.mics が Files で灰色になる対策）。他では残る
async function iosLoad(){
  for(const [ua,expectAccept] of [["Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1", false],[null, true]]){
    const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,...(ua?{userAgent:ua}:{})}); await unlock(ctx);
    const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
    await p.waitForFunction(()=>typeof tracks!=='undefined' && tracks[0] && tracks[0].buffer, null, {timeout:20000});
    const acc=await p.$eval('#projFile',e=>e.getAttribute('accept'));
    ok_(`iOS読込 ${ua?'iPhone UA では accept 制限なし':'他では accept 制限あり'}`, expectAccept ? (acc||'').includes('.mics') : acc===null, JSON.stringify(acc));
    // 中身の検証は残る：壊れたファイルは弾き、正しい .mics は読める
    const r=await p.evaluate(async()=>{ const inp=document.getElementById('projFile'); const fire=f=>{ const dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files; inp.dispatchEvent(new Event('change')); };
      fire(new File(['not json'],'broken.mics')); await new Promise(r=>setTimeout(r,300)); const bad=sampNameEl.textContent;
      const proj=buildProject(); proj.bpm=123.5; fire(new File([JSON.stringify(proj)],'x.mics')); await new Promise(r=>setTimeout(r,800)); return {bad, bpm:bpmVal, msg:sampNameEl.textContent}; });
    ok_(`iOS読込 壊れたファイルは弾く`, /FAILED/.test(r.bad), r.bad);
    ok_(`iOS読込 正しい .mics は読める`, r.bpm===123.5 && /LOADED/.test(r.msg), JSON.stringify(r));
    eq(`iOS読込 0 errors`, errs, []);
    await ctx.close();
  }
}
await passGate();
await iosLoad();
await latency();
const res=[];
for(const [w,h,m] of [[390,844,true],[390,664,true],[520,900,true],[700,900,false],[960,1040,false],[1024,768,false],[1280,800,false]]) res.push(await run(w,h,m));
await br.close();
res.forEach(r=>console.log(`${r.V}  パッド${r.dim.pad}px 窓${r.dim.scr}px`));
console.log(`モーダルの中身: [${res[0].md.join(' ')}]`);
console.log(fail.length? "\n❌ 失敗 "+fail.length+"件\n  "+fail.join("\n  ") : "\n✅ 全項目パス");
process.exit(fail.length?1:0);
