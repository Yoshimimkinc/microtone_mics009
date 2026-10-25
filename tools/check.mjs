// MICS009 回帰チェック（Playwright）
//   起動:  npx http-server -p 8137 .    （または python3 -m http.server 8137）
//   実行:  node tools/check.mjs [port]
//   環境変数: SHOT=出力先ディレクトリ（既定 ./tools/_shots）
// 環境ごとに違うのは chromium の場所だけ。PW_EXE で上書きできる。
import { chromium, unlock } from './pw.mjs';
import { checkPadContents } from './pad-content-check.mjs';
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
// 全画面から抜ける。Chromium 153 以降は全画面のまま setViewportSize すると
// 「To resize minimized/maximized/fullscreen window, restore it to normal state first」で落ちる
async function unFull(p){
  try{ await p.evaluate(async()=>{ if(document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen().catch(()=>{}); }); }catch(e){}
  await p.waitForTimeout(120);
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
  eq(`${V} SAMPLE欄`,fields.smpl,['loop']);   // START/END の数値欄は撤去（v0.3.126 §138）
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
  // BPM カードを叩く＝タップテンポ（v0.3.126 §137）。2連打は 100 へのリセットにならない
  { await p.evaluate(()=>{ applyBpm(90); });
    // 計算は時計を固定して決定的に（実時間で叩くと負荷で間隔が伸びて揺れる）：500ms×4 → 120.0
    const calc=await p.evaluate(()=>{ const orig=performance.now; let t=1000; performance.now=()=>t;
      try{ taps.length=0; for(let i=0;i<4;i++){ tapTempoDown(); t+=500; } return tapTempoUp(); } finally { performance.now=orig; taps.length=0; } });
    ok_(`${V} タップテンポの計算（500ms×4 → 120.0）`, calc===120, `bpm=${calc}`);
    // 配線は実際に叩いて確認：BPM カードを2回叩くとテンポが 90 から動く（値は環境の間隔次第なので範囲だけ）
    await p.evaluate(()=>{ applyBpm(90); });
    const bb=await box('.cl-par[data-p="bpm"]');
    for(let i=0;i<3;i++){ await p.mouse.move(bb.x,bb.y); await p.mouse.down(); await p.mouse.up(); if(i<2) await p.waitForTimeout(400); }
    await p.waitForTimeout(100);
    const tb=await p.evaluate(()=>bpmVal);
    ok_(`${V} BPMカードを叩く＝タップテンポ（配線）`, tb!==90 && tb>=60 && tb<=180, `bpm=${tb}`);
    await dbl('.cl-par[data-p="bpm"]'); await p.waitForTimeout(100);
    ok_(`${V} BPMの2連打は100へ戻さない`, (await p.evaluate(()=>bpmVal))!==100, '100に戻った');
    ok_(`${V} メニューの TAP ボタンは無い`, !(await p.$('#tap')), '残っている'); }
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
  const st1=await p.evaluate(()=>({s:tracks[selected].start, fields:document.querySelectorAll('.cl-par[data-p="start"],.cl-par[data-p="end"]').length}));
  ok_(`${V} ハンドル→t.start（数値欄は無い v0.3.126 §138）`, st1.s>st0 && st1.fields===0, JSON.stringify(st1));
  if(!mobile){ const wv=await box('.cl-waveslot .pe-wave'), fl=await box('.cl-par[data-p="loop"]');
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
  // 6d) スマホの下段は MUTE/FILTER/DELAY/REVERB/EDIT。SOLOはヘッダに残す。
  if(mobile){
    const vis=await p.evaluate(()=>{const g=id=>{const e=document.getElementById(id); if(!e)return 0; const r=e.getBoundingClientRect(); return r.height>0&&getComputedStyle(e).display!=='none'?Math.round(r.height):0;};
      return {mute:g('holdMute'), solo:g('holdSolo'), edit:g('holdEdit'), pitch:g('fxPitch'), filter:g('fxFilter'), delay:g('fxDelay'), reverb:g('fxReverb'), levelBtns:document.querySelectorAll('[data-lock="level"]').length};});
    ok_(`${V} 下段は MUTE/FILTER/DELAY/REVERB/EDIT`, vis.mute>=44 && vis.pitch===0 && vis.filter>=44 && vis.delay>=44 && vis.reverb>=44 && vis.solo>=44 && vis.edit>=44, JSON.stringify(vis));
    // スマホは strip（‹名前› LOAD SMPL）を出さない。LOAD/SMPL は EDIT モーダルにある（v0.3.125 §136）
    { const st=await p.evaluate(()=>{ const s=document.querySelector('#viewPads>.strip'); const pad=document.querySelector('#pads .pad').getBoundingClientRect();
        return {strip:getComputedStyle(s).display, padH:Math.round(pad.height), samp:!!document.getElementById('samp')}; });
      ok_(`${V} スマホは strip を出さない`, st.strip==='none' && st.samp, JSON.stringify(st));
      // SAMPLE ページのボタンは文字「EDIT」（旧 ✂、v0.3.127→128 §139）：13px 以上・幅 56px 以上・他の欄と同じ 34px 高
      await page('smpl');
      const cw=await p.evaluate(()=>{ const b=document.getElementById('clWave'); const r=b.getBoundingClientRect();
        return {h:Math.round(r.height), w:Math.round(r.width), t:b.textContent.trim(), fs:parseFloat(getComputedStyle(b).fontSize)}; });
      ok_(`${V} EDIT ボタンは文字「EDIT」・13px・幅 56px 以上・34px 高`, cw.t==='EDIT' && cw.fs>=13 && cw.h>=34 && cw.w>=56, JSON.stringify(cw));   // SAMPLE のまま次（EDIT からモーダル）へ
      ok_(`${V} 浮いた高さがパッドへ（390×844 で 100px 以上）`, h<700 || st.padH>=100, `padH=${st.padH}`);
      await p.evaluate(()=>{ selectPad(0); openPadEdit(0); }); await p.waitForTimeout(600);
      const pe=await p.evaluate(()=>{ const g=id=>{ const e=document.getElementById(id); const r=e.getBoundingClientRect(); return getComputedStyle(e).display!=='none' && r.height>0 && r.width>0; }; return {load:g('peLoadBtn'), smpl:g('peSmplBtn')}; });
      ok_(`${V} EDIT モーダルに LOAD と SMPL が出る`, pe.load && pe.smpl, JSON.stringify(pe));
      await p.click('#peClose'); await p.waitForTimeout(300); }
    eq(`${V} 古いステップロックはすべて読み込みで捨てる`, await p.evaluate(()=>stripLegacyLocks({a:{level:-10},b:{level:-10,pitch:2},c:null})), {});
    ok_(`${V} LEVEL の P-LOCK はどこにも無い（v0.3.124 §135）`, vis.levelBtns===0 && !(await p.evaluate(()=>('level' in PERF_BASE)||('level' in PLOCKS))), JSON.stringify(vis));
    // 6つが1行に収まり、幅44px以上・文字が溢れない（幅を2/3以下に詰めた分の検査）
    const row=await p.evaluate(()=>{ const bs=[...document.querySelectorAll('#viewPads>.msbar button')].filter(b=>getComputedStyle(b).display!=='none');
      return {n:bs.length, rows:new Set(bs.map(b=>Math.round(b.getBoundingClientRect().top))).size, minW:Math.min(...bs.map(b=>b.getBoundingClientRect().width)), over:bs.filter(b=>b.scrollWidth>b.clientWidth).map(b=>b.textContent.trim())}; });
    ok_(`${V} 下段5つが1行・幅44px以上・溢れなし`, row.n===5 && row.rows===1 && row.minW>=44 && row.over.length===0, JSON.stringify(row));
    // Normal FX is a live value selection; only EDIT+FX opens parameters.
    for(const fx of ['filter','delay','reverb']){
      const button='#fx'+fx[0].toUpperCase()+fx.slice(1);
      await p.click(button);
      eq(`${V} ${fx}通常タップは選択・モーダルなし`,await p.evaluate(()=>[activeLock,fxmParam]),[fx,null]);
      await p.click(button);eq(`${V} 再タップは選択解除`,await p.evaluate(()=>activeLock),null);
      await p.click('#holdEdit');await p.click(button);
      eq(`${V} EDITと${fx}で詳細設定`,await p.$eval('#fxModal',e=>e.style.display),'flex');
      eq(`${V} EDIT中はライブFX選択なし`,await p.evaluate(()=>activeLock),null);
      await p.click('#fxmClose');await p.click('#holdEdit');
    }

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
  eq(`${V} 演奏用PITCH・ロックRECが存在しない`, await p.evaluate(()=>document.querySelectorAll('[data-lock="pitch"],#perfRec').length), 0);
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
    const pr=JSON.parse(JSON.stringify(buildProject())); const tr=pr.sets[pr.cur].tracks; tr[1].audio=null; tr[1].type='empty'; tr[1].name='EMPTY';
    await applyProject(pr); return [!!tracks[1].buffer, PADS[1].type]; }), [false,'empty']);
  await p.evaluate(async()=>{ await applyProject(JSON.parse(JSON.stringify(buildProject()))); });

  // 7i) ★どのレイアウトでも再生中は STEP/STATE が生きている（W6 NG-1・v0.3.98。perf限定で「--」「■ STOP」のままだった）
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(700);
  const live=await p.evaluate(()=>({step:document.getElementById('clStep').textContent, playing:document.querySelector('.perf-screen').classList.contains('playing')}));
  const tpOn=await p.evaluate(()=>({playing, sched:schedTimer!==null, btn:document.getElementById('play').textContent}));
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
  const tpOff=await p.evaluate(()=>({playing, sched:schedTimer, step:playStep, btn:document.getElementById('play').textContent, cur:document.querySelectorAll('#grid .step.cursor').length}));
  ok_(`${V} ▶ で startTransport（playing・スケジューラ・ボタン）`, tpOn.playing===true && tpOn.sched===true && tpOn.btn==='■', JSON.stringify(tpOn));
  ok_(`${V} ■ で stopTransport（playing・スケジューラ・カーソル・ボタン）`, tpOff.playing===false && tpOff.sched===null && tpOff.step===0 && tpOff.btn==='▶' && tpOff.cur===0, JSON.stringify(tpOff));
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
    const B=await p.evaluate(()=>{const pr=buildProject(); pr.sets[pr.cur].tracks[0].name='LOADED1'; return JSON.stringify(pr);});
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
  await unFull(p);   // 起動タップで全画面に入っているとウィンドウを変えられない（CIのChromium 153で発覚 v0.3.117）
  await p.setViewportSize({width:Math.max(360,w-160), height:Math.max(460,h-220)});
  await p.waitForTimeout(500);
  const afterResize=await seqBox();
  await p.evaluate(()=>{document.getElementById('modePads').click(); document.getElementById('modeSeq').click();});
  await p.waitForTimeout(400);
  eq(`${V} SEQがウィンドウ変更に追従`, afterResize, await seqBox());
  await unFull(p);
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
    // v0.3.156：長押しで拡大鏡・長押しメニューが出ない（全要素 user-select:none・入力欄だけ選べる・パッドの格子は touchstart の既定動作を止める）
    const lp=await p.evaluate(()=>{ const nm=document.querySelector('#pads .pad .nm'), sg=document.querySelector('#setGrid .setpad'), inp=document.querySelector('input[type=text],textarea')||document.createElement('input');
      const fire=el=>{ const t=new Touch({identifier:1,target:el,clientX:10,clientY:10}); const ev=new TouchEvent('touchstart',{cancelable:true,bubbles:true,touches:[t],targetTouches:[t],changedTouches:[t]}); el.dispatchEvent(ev); return ev.defaultPrevented; };
      if(!inp.isConnected) document.body.appendChild(inp);
      return {nm:getComputedStyle(nm).userSelect, btn:getComputedStyle(document.getElementById('play')).userSelect, inp:getComputedStyle(inp).userSelect, padTouch:fire(nm), setTouch:fire(sg), playTouch:fire(document.getElementById('play'))}; });
    ok_(`長押し ${ua?'iPhone':'他'}：文字は選べない（パッド・ボタン）・入力欄は選べる・パッドの格子だけ touch の既定動作を止める`, lp.nm==='none' && lp.btn==='none' && lp.inp!=='none' && lp.padTouch && lp.setTouch && !lp.playTouch, JSON.stringify(lp));
    // v0.3.157：ダブルタップで拡大しない（どこでも touch-action:manipulation。パッドは none のまま）
    const ta=await p.evaluate(()=>({html:getComputedStyle(document.documentElement).touchAction, win:getComputedStyle(document.querySelector('.perf-screen')||document.body).touchAction, txt:getComputedStyle(document.getElementById('sampName')||document.body).touchAction, pad:getComputedStyle(document.querySelector('#pads .pad')).touchAction}));
    ok_(`ダブルタップ ${ua?'iPhone':'他'}：どこでも拡大しない（manipulation）・パッドは none のまま`, ta.html==='manipulation' && ta.win==='manipulation' && ta.txt==='manipulation' && ta.pad==='none', JSON.stringify(ta));
    const accS=await p.$eval('#samp',e=>e.getAttribute('accept'));   // v0.3.155：音の取り込みも（クラウドにしか無いファイルが灰色になる対策）
    ok_(`iOS読込 音の取り込みも ${ua?'iPhone UA では accept 制限なし':'他では audio/* の制限あり'}`, expectAccept ? (accS||'').includes('audio/*') : accS===null, JSON.stringify(accS));
    // 中身の検証は残る：壊れたファイルは弾き、正しい .mics は読める
    const r=await p.evaluate(async()=>{ const inp=document.getElementById('projFile'); const fire=f=>{ const dt=new DataTransfer(); dt.items.add(f); inp.files=dt.files; inp.dispatchEvent(new Event('change')); };
      fire(new File(['not json'],'broken.mics')); await new Promise(r=>setTimeout(r,300)); const bad=sampNameEl.textContent;
      const proj=buildProject(); proj.sets[proj.cur].bpm=123.5; fire(new File([JSON.stringify(proj)],'x.mics')); await new Promise(r=>setTimeout(r,800)); return {bad, bpm:bpmVal, msg:sampNameEl.textContent}; });
    ok_(`iOS読込 壊れたファイルは弾く`, /FAILED/.test(r.bad), r.bad);
    ok_(`iOS読込 正しい .mics は読める`, r.bpm===123.5 && /LOADED/.test(r.msg), JSON.stringify(r));
    eq(`iOS読込 0 errors`, errs, []);
    await ctx.close();
  }
}
// §15 プレビュー分離（v0.3.118）：/preview/<枝>/ で開いた時は自動保存の保存先が本番と別になる
async function previewIsolated(){
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await p.waitForFunction(()=>typeof autosaveDbName==='function' && typeof previewName==='function', null, {timeout:20000});
  const r=await p.evaluate(()=>({
    root: autosaveDbName('/microtone_mics009/mics-609bc14b.html'),
    prev: autosaveDbName('/microtone_mics009/preview/claude-x/mics-609bc14b.html'),
    live: AUTOSAVE.db,
    name: previewName('/a/preview/foo-bar/x.html'),
    none: previewName('/microtone_mics009/mics-609bc14b.html')}));
  ok_(`プレビュー分離 本番は mics009`, r.root==='mics009', r.root);
  ok_(`プレビュー分離 枝ごとに別のDB`, r.prev==='mics009-preview-claude-x', r.prev);
  ok_(`プレビュー分離 いま開いているのは本番扱い`, r.live==='mics009', r.live);
  ok_(`プレビュー分離 枝名を取り出せる`, r.name==='foo-bar' && r.none===null, JSON.stringify([r.name,r.none]));
  eq(`プレビュー分離 0 errors`, errs, []);
  await ctx.close();
}
// §16 P-LOCK（v0.3.121）：解除＝掛ける前の値へ戻る（効果オフ）／もう一度押す＝最後にいじった値が復活。PC(perf) とスマホで同じ
async function plockKeeps(){
  // v0.3.175: 通常はライブ現在値、EDIT時だけ詳細設定。ステップ記録は廃止のまま。
  for(const [w,h,mobile,sel] of [[1280,800,false,'#perfPlk [data-lock="delay"]'],[390,844,true,'.msbar [data-lock="delay"]']]){
    const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile});await unlock(ctx);
    const p=await ctx.newPage();const errs=[];p.on('pageerror',e=>errs.push(String(e)));await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`);await ready(p);
    await p.click(sel);
    eq(`FX ${w} 通常タップは選択`,await p.evaluate(()=>[activeLock,fxmParam]),['delay',null]);
    await p.click(sel);
    await p.click(mobile?'#holdEdit':'#perfEdit');await p.click(sel);
    eq(`FX ${w} EDIT時だけ直接編集`,await p.$eval('#fxModal',e=>e.style.display),'flex');
    await p.evaluate(()=>{const el=document.querySelector('#fxmList input[data-i="0"]');el.value=0.7;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});
    await p.click('#fxmClose');
    eq(`FX ${w} 閉じても現在値を維持`,await p.evaluate(()=>[tracks[0].delaySend,activeLock,Object.keys(tracks[0].locks||{}).length]),[0.7,null,0]);
    await p.click(sel);await p.click('#fxmReset');
    eq(`FX ${w} RESET`,await p.evaluate(()=>tracks.some(t=>t.delaySend>0)),false);
    await p.click('#fxmClose');await p.evaluate(()=>doUndo());
    eq(`FX ${w} RESETをUNDO`,await p.evaluate(()=>tracks[0].delaySend),0.7);
    eq(`FX ${w} errors`,errs,[]);await ctx.close();
  }
}
// §17 サンプル名の変更（v0.3.120）：EDITモーダルの名前行が唯一の入口。パッド・SEQ行ラベル・窓が追従する
async function renameFlow(){
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(()=>{ selectPad(0); openPadEdit(0); });
  await p.waitForTimeout(600);   // モーダルは開いた直後450msのクリックを捨てる仕様（peOpenedAt）
  const shown=await p.$eval('#peName',e=>e.textContent.trim());
  ok_(`名前変更 モーダルに名前が出る`, /^01\s+\S/.test(shown), shown);
  ok_(`名前変更 入力箱は最初は隠れている`, await p.$eval('#peNameIn',e=>e.hidden), '出たまま');
  await p.click('#peNameEdit'); await p.waitForTimeout(150);
  ok_(`名前変更 ✎で入力箱が出る`, !(await p.$eval('#peNameIn',e=>e.hidden)), '出ない');
  ok_(`名前変更 入力は16px（iOSが拡大しない）`, await p.$eval('#peNameIn',e=>parseFloat(getComputedStyle(e).fontSize)>=16), 'font-size<16px');
  // Escape＝取消。モーダルは閉じない
  await p.fill('#peNameIn','ZZZ'); await p.press('#peNameIn','Escape'); await p.waitForTimeout(150);
  const esc=await p.evaluate(()=>({name:tracks[0].name, open:document.getElementById('padEditModal').style.display}));
  ok_(`名前変更 Escapeで取消・モーダルは閉じない`, esc.name!=='ZZZ' && esc.open==='flex', JSON.stringify(esc));
  // Enter＝確定。パッド・SEQ行ラベル・窓が追従する
  await p.click('#peNameEdit'); await p.fill('#peNameIn','VERSE 1'); await p.press('#peNameIn','Enter');
  await p.waitForTimeout(250);
  const r=await p.evaluate(()=>({
    name:tracks[0].name, pads:PADS[0].name,
    pad:document.querySelector('#pads .pad .nm').textContent.trim(),
    row:(document.querySelector('#grid .rn')||{}).textContent||'',
    label:document.getElementById('peName').textContent.trim(),
    boxHidden:document.getElementById('peNameIn').hidden}));
  ok_(`名前変更 保存される`, r.name==='VERSE 1' && r.pads==='VERSE 1', JSON.stringify(r));
  ok_(`名前変更 パッドが追従`, r.pad==='VERSE 1', r.pad);
  ok_(`名前変更 SEQの行ラベルが追従`, /VERSE 1/.test(r.row), r.row);
  ok_(`名前変更 行の表示と入力箱の畳み`, /VERSE 1/.test(r.label) && r.boxHidden===true, JSON.stringify(r));
  // 空欄は無視（名前を消せない）
  await p.click('#peNameEdit'); await p.fill('#peNameIn','   '); await p.press('#peNameIn','Enter');
  await p.waitForTimeout(200);
  ok_(`名前変更 空欄は無視`, (await p.evaluate(()=>tracks[0].name))==='VERSE 1', await p.evaluate(()=>tracks[0].name));
  eq(`名前変更 0 errors`, errs, []);
  await ctx.close();
}
// §140 文字は選べない（楽器の画面）／Phase 2 第2段：COPY・MOVE はデータ更新（data/）→ 描画（refreshPadDisplay）の順で見た目が追従する
async function copyPaint(){
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const us=await p.evaluate(()=>{ const g=s=>{ const el=document.querySelector(s); return el?getComputedStyle(el).userSelect:'(none)'; };
    const inp=document.createElement('input'); inp.type='password'; document.body.appendChild(inp); const pass=getComputedStyle(inp).userSelect; inp.remove();   // 合言葉欄は起動後に消えるので同型で測る
    return {body:g('body'), nm:g('#pads .pad .nm'), name:g('#peNameIn'), pass, rn:g('#grid .rn'), win:g('#clHint')}; });
  ok_(`文字選択 本体・パッド・SEQ行名・窓は選べない`, us.body==='none' && us.nm==='none' && us.rn==='none' && us.win==='none', JSON.stringify(us));
  ok_(`文字選択 入力欄（名前・合言葉）は選べる`, us.name==='text' && us.pass==='text', JSON.stringify(us));
  // COPY（COPYモードの元→先＝doCopy）：名前・パッド表示・SEQ行名が先へ写る
  await p.evaluate(()=>{ tracks[0].name='KICK X'; refreshPadDisplay(0); doCopy('pad',0,5); });
  const c=await p.evaluate(()=>({ name:tracks[5].name, nm:document.querySelectorAll('#pads .pad')[5].querySelector('.nm').textContent, rn:document.querySelectorAll('#grid .rn')[5].textContent }));
  ok_(`COPY パッド→パッドで名前・表示・行名が写る`, c.name==='KICK X' && c.nm==='KICK X' && /KICK X/.test(c.rn), JSON.stringify(c));
  // MOVE（EDIT中のドラッグ）：入れ替え後に両方のパッド表示が追従
  await p.evaluate(()=>{ tracks[6].name='SNARE Y'; refreshPadDisplay(6); arm('edit',true); });
  const pads=await p.$$('#pads .pad'); const a=await pads[5].boundingBox(), b=await pads[6].boundingBox();
  await p.mouse.move(a.x+a.width/2, a.y+a.height/2); await p.mouse.down();
  for(let k=1;k<=6;k++) await p.mouse.move(a.x+a.width/2+(b.x-a.x)*k/6, a.y+a.height/2+(b.y-a.y)*k/6);
  await p.mouse.up(); await p.waitForTimeout(150);
  const m=await p.evaluate(()=>({ n5:tracks[5].name, n6:tracks[6].name, nm5:document.querySelectorAll('#pads .pad')[5].querySelector('.nm').textContent, nm6:document.querySelectorAll('#pads .pad')[6].querySelector('.nm').textContent,
    rn5:document.querySelectorAll('#grid .rn')[5].textContent, rn6:document.querySelectorAll('#grid .rn')[6].textContent, arm:armMode }));
  ok_(`MOVE ドラッグで入れ替え＝データと表示が両方追従`, m.n5==='SNARE Y' && m.n6==='KICK X' && m.nm5==='SNARE Y' && m.nm6==='KICK X' && /SNARE Y/.test(m.rn5) && /KICK X/.test(m.rn6), JSON.stringify(m));
  const u=await p.evaluate(()=>{ doUndo(); return { n5:tracks[5].name, n6:tracks[6].name, nm5:document.querySelectorAll('#pads .pad')[5].querySelector('.nm').textContent, rn6:document.querySelectorAll('#grid .rn')[6].textContent }; });
  ok_(`MOVE ↩ で戻る（データも表示も）`, u.n5==='KICK X' && u.n6==='SNARE Y' && u.nm5==='KICK X' && /SNARE Y/.test(u.rn6), JSON.stringify(u));
  // LOAD（#samp）：名前・パッド表示・SEQ 行名・カテゴリが揃う（v0.3.131 までは SEQ 行名とステップ波形が古いままだった）
  const fsp=await import('node:fs/promises'); const wavPath='/tmp/ZEBRA.wav';
  { const sr=8000, n=sr/2, b=Buffer.alloc(44+n*2); b.write('RIFF',0); b.writeUInt32LE(36+n*2,4); b.write('WAVEfmt ',8); b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22);
    b.writeUInt32LE(sr,24); b.writeUInt32LE(sr*2,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(n*2,40);
    for(let i=0;i<n;i++) b.writeInt16LE(Math.round(Math.sin(i/sr*2*Math.PI*440)*12000),44+i*2); await fsp.writeFile(wavPath,b); }
  await p.evaluate(()=>{ arm('edit',false); selectPad(9); tracks[9].tune=2; });
  await p.setInputFiles('#samp', wavPath); await p.waitForTimeout(1500);
  const l=await p.evaluate(()=>({ name:tracks[9].name, type:PADS[9].type, tune:tracks[9].tune, nm:document.querySelectorAll('#pads .pad')[9].querySelector('.nm').textContent, rn:document.querySelectorAll('#grid .rn')[9].textContent, cat:document.querySelectorAll('#pads .pad')[9].className }));
  ok_(`LOAD 名前・パッド表示・SEQ 行名が揃う`, l.name==='ZEBRA.wav' && l.nm==='ZEBRA.WA' && /ZEBRA\.wav/.test(l.rn) && l.type==='sample', JSON.stringify(l));
  ok_(`LOAD 新しい音は PITCH 0 から（前の +2 を引き継がない v0.3.170）`, l.tune===0, JSON.stringify(l));
  // Phase 3：EDIT モーダルの ● SMPL / LOAD は selected を直書きせず selectPad（入口）を通る＝エディタ側の選択表示も追従
  await p.evaluate(()=>{ document.getElementById('peClose').click(); selectPad(0); openPadEdit(4); });
  await p.waitForTimeout(600);
  const sm=await p.evaluate(()=>{ document.getElementById('peSmplBtn').click();
    const r={ sel:selected, pe:peTarget, selCls:document.querySelectorAll('#pads .pad')[4].classList.contains('sel'), ov:document.getElementById('recOverlay').classList.contains('show') };
    document.getElementById('recCancel').click(); return r; });
  ok_(`モーダルの ● SMPL は selectPad 経由（選択表示も追従）`, sm.sel===4 && sm.pe===4 && sm.selCls===true && sm.ov===true, JSON.stringify(sm));
  // Phase 3 第3段：loopPlaying は音側（hitVoice / scheduler）だけが書く。setStep はステップの唯一の書き口（OFF で p-lock も消える）
  const lp=await p.evaluate(()=>{ const t=tracks[0]; const was=t.loop; t.loop=true; t.loopPlaying=false;
    const a=hitVoice(0), s1=t.loopPlaying, b=hitVoice(0), s2=t.loopPlaying;      // 1回目＝鳴る（true）、2回目＝止まる（false）
    hitVoice(0); stopAllVoices(AC.currentTime); const s3=t.loopPlaying; t.loop=was; return {a,s1,b,s2,s3}; });
  ok_(`hitVoice ループ系は手叩きでトグル／stopAllVoices で全部戻る`, lp.a===true && lp.s1===true && lp.b===false && lp.s2===false && lp.s3===false, JSON.stringify(lp));
  const ss=await p.evaluate(()=>{ setStep(1, 5, 2); tracks[1].locks={'0_0_5':{pitch:3}}; const v1=getPattern(1)[5], l1=!!getLockEdit(1,5);
    setStep(1, 5, 0); const v0=getPattern(1)[5], l0=!!getLockEdit(1,5); return {v1,l1,v0,l0}; });
  ok_(`setStep ON/OFF・旧ロックは参照しない`, ss.v1===2 && ss.l1===false && ss.v0===0 && ss.l0===false, JSON.stringify(ss));
  eq(`COPY/MOVE 0 errors`, errs, []);
  await ctx.close();
}
// Phase 4：開発用プレビュー（tools/dev.html＝src/ を個別に読む）が公開物と同じに起動する。
// 公開物の検査はこのファイルの他の項目が全部やる。ここは「dev.html が壊れていない」ことだけ見る（部品を足した時に落ちる）
async function devShell(){
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e))); p.on('console',m=>{ if(m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text().slice(0,120)); });
  await p.goto(`http://localhost:${PORT}/tools/dev.html`,{waitUntil:'load'});
  await ready(p);
  const man=JSON.parse(await (await import('node:fs/promises')).readFile('src/manifest.json','utf8'));
  const ver=JSON.parse(await (await import('node:fs/promises')).readFile('version.json','utf8')).version;
  const d=await p.evaluate(()=>({ shell:window.__DEV_SHELL__, ver:APP_VERSION, pads:document.querySelectorAll('#pads .pad').length, rows:document.querySelectorAll('#grid .row').length,
    styles:document.querySelectorAll('style[data-src]').length, scripts:document.querySelectorAll('script[data-src]').length, b0:!!tracks[0].buffer, b9:!!tracks[9].buffer, perf:document.body.classList.contains('perf') }));
  const css=man.parts.filter(x=>x.endsWith('.css')).length, js=man.parts.filter(x=>x.endsWith('.js')).length;
  ok_(`dev.html 部品が manifest どおり（CSS ${css} / JS ${js}）`, d.styles===css && d.scripts===js && d.shell && d.shell.parts===man.parts.length-4, JSON.stringify(d.shell)+` styles=${d.styles} scripts=${d.scripts}`);
  ok_(`dev.html バージョン差し込み・起動・default.mics`, d.ver===ver && d.pads===16 && d.rows===16 && d.b0 && d.b9, JSON.stringify(d));
  ok_(`dev.html load 待ちの処理も走る（1280×800 は perf）`, d.perf===true, 'body.perf が無い');
  eq(`dev.html 0 errors`, errs, []);
  await ctx.close();
}
// §145 SET モード：ファイル全体 = 16 セット。上段スイッチで情報窓が SET 演奏モード・格子が 16 セットのポン出し。
// 叩く＝切替（鳴っていれば小節頭）＋止まっていれば ▶。切替で前のセットの変更は残る（退避）。v3 の保存/読込・v2 の読込・リロード・COPY
async function setMode(){
  for(const [w,h,mobile] of [[390,844,true],[1280,800,false]]){
    const V=`SET ${w}x${h}`;
    const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile}); await unlock(ctx);
    const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
    await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
    await ready(p);
    await p.evaluate(async()=>{ await clearAutosave(); });
    const dims=()=>p.evaluate(()=>{ const r=s=>{ const e=document.querySelector(s); if(!e) return null; const b=e.getBoundingClientRect(); return [Math.round(b.width),Math.round(b.height)]; };
      return {scr:r('.perf-screen'), pad:r('#pads .pad'), setpad:r('#setGrid .setpad')}; });
    const d0=await dims();
    const boot=await p.evaluate(()=>({cur:setCur, n:setSlots.filter(Boolean).length, names:[setName(0),setName(1),setName(15)], fresh1:!!setSlots[1] && setSlots[1].tracks[8].buffer===PRESET_BUFS[8].buf && setSlots[1].tracks[0].buffer===null}));
    ok_(`${V} 起動時から 16 セット（SET 1 = 既定プロジェクト、他は既定のキット）`, boot.cur===0 && boot.n===16 && boot.names.join(',')==='SET 1,SET 2,SET 16' && boot.fresh1, JSON.stringify(boot));
    // 上段スイッチ（スマホ=vdot / PC=modebar）で SET へ：1 タップ
    await p.click(mobile ? '#viewDots .vdot[data-view="viewSet"]' : '#modeSet'); await p.waitForTimeout(250);
    const st=await p.evaluate(()=>({mode:setMode, body:document.body.classList.contains('setmode'), page:clPage, cells:document.querySelectorAll('#setGrid .setpad').length, fresh:document.querySelectorAll('#setGrid .setpad.fresh').length,
      padsHidden:getComputedStyle(document.getElementById('pads')).display==='none', keysSet:getComputedStyle(document.getElementById('clKeysSet')).display, keys:getComputedStyle(document.getElementById('clKeys')).display, bar:getComputedStyle(document.querySelector('#viewPads>.msbar')).display,
      sel:document.querySelector('#setGrid .setpad.on .n span').textContent, tag:document.querySelector('#setGrid .setpad.on .tag').textContent}));
    ok_(`${V} スイッチ 1 タップで SET（窓=SET ページ・16 セット・SET 1 が SEL・15 は既定のまま）`, st.mode && st.body && st.page==='set' && st.cells===16 && st.fresh===15 && st.padsHidden && st.keysSet==='grid' && st.keys==='none' && st.bar==='none' && st.sel==='01' && st.tag==='SEL', JSON.stringify(st));
    const map=()=>p.evaluate(()=>{ const r={}; for(const sel of ['#viewDots .setmap','#modeSet .setmap']){ const m=document.querySelector(sel); const c=[...m.children];
      r[sel]={n:c.length, cur:c.findIndex(i=>i.classList.contains('cur')), play:c.map((i,k)=>i.classList.contains('play')?k:-1).filter(k=>k>=0).join(), held:c.map((i,k)=>i.classList.contains('held')?k:-1).filter(k=>k>=0).join()}; }
      return {maps:r, no:[...document.querySelectorAll('.setno')].map(b=>b.textContent).join()}; });
    const mp0=await map();
    ok_(`${V} SET の切替ボタンに 16 セットの地図と番号（スマホのタブ・PC のボタンの両方。いまは 01）`, Object.values(mp0.maps).every(m=>m.n===16 && m.cur===0 && m.play==='') && mp0.no==='01,01', JSON.stringify(mp0));
    const d1=await dims();
    ok_(`${V} 窓の高さは PADS と同じ（不変性）`, d0.scr && d1.scr && d0.scr[1]===d1.scr[1] && d0.scr[0]===d1.scr[0], `${JSON.stringify(d0.scr)} → ${JSON.stringify(d1.scr)}`);
    ok_(`${V} セットの幅はパッドと同じ・高さは下段ぶん広い（44px 以上）`, d0.pad && d1.setpad && Math.abs(d0.pad[0]-d1.setpad[0])<=1 && d1.setpad[1]>=d0.pad[1]-1 && d1.setpad[1]>=44, `${JSON.stringify(d0.pad)} vs ${JSON.stringify(d1.setpad)}`);
    // v0.3.147：押す＝鳴る／離す＝止まる／1 小節押し続ける＝ホールド／ホールド中を叩く＝止まる／同時鳴らし（ミックス）／■ は全部止める
    const sp=k=>p.evaluate(k=>{ const b=document.querySelector(`#setGrid .setpad[data-k="${k}"]`).getBoundingClientRect(); return [b.left+b.width/2, b.top+b.height/2]; }, k);
    const down=async k=>{ const c=await sp(k); await p.mouse.move(c[0],c[1]); await p.mouse.down(); };
    const ui=()=>p.evaluate(()=>({cur:setCur, playing, sides:[...sidePlayers.keys()], held:[0,1,2,3].filter(k=>isSetHeld(k)), lit:[...document.querySelectorAll('#setGrid .setpad.playing')].map(d=>+d.dataset.k), btn:document.getElementById('play').textContent, mix:document.getElementById('clSetNext').textContent}));
    // SET 1 に印（名前・BPM・ステップ）→ SET 2 を押す（pointerdown）＝ポン出し
    await p.evaluate(()=>{ tracks[0].name='S1'; paintPadName(0); applyBpm(60); setStep(8,0,1); setSlots[1].bpm=60; });   // 1 拍＝1 秒（v0.3.153 でホールドが 1 拍に。押して離す確認が間に合うように）
    await down(1);
    const s2dn=await p.evaluate(()=>({playingAtDown:playing, lead:barStartTime-AC.currentTime, firstStep:stepIdx}));
    await p.waitForTimeout(300);
    const s2=await p.evaluate(()=>({cur:setCur, playing, name:tracks[0].name, type0:PADS[0].type, buf0:!!tracks[0].buffer, kick:!!tracks[8].buffer && tracks[8].buffer===PRESET_BUFS[8].buf, bpm:bpmVal, steps:tracks.reduce((a,t)=>a+t.patterns.flat(2).filter(Boolean).length,0),
      saved:setSlots[0].tracks[0].name, savedBpm:setSlots[0].bpm, savedStep:setSlots[0].tracks[8].patterns[0][0][0], tag:document.querySelector('#setGrid .setpad[data-k="1"] .tag').textContent, undo:undoStack.length}));
    const lit=await p.evaluate(()=>{ const d=document.querySelector('#setGrid .setpad[data-k="1"]'); const cs=getComputedStyle(d); return {cls:d.className, bg:cs.backgroundImage||cs.backgroundColor, glow:cs.boxShadow}; });
    ok_(`${V} ポン出しは pointerdown（指を離す前に鳴り始め、小節頭は先置きしない・最初のステップは timer を待たず予約）`, s2dn.playingAtDown && s2dn.lead<=0.02 && s2dn.lead>-0.5 && s2dn.firstStep>=1 && s2dn.firstStep<=2, JSON.stringify(s2dn));
    ok_(`${V} 押している間（ホールド前）は薄い色（playing・held でない・外光 12px で 26px は無し）`, /\bplaying\b/.test(lit.cls) && !/\bheld\b/.test(lit.cls) && /linear-gradient/.test(lit.bg) && /12px/.test(lit.glow) && !/26px/.test(lit.glow), JSON.stringify(lit));
    ok_(`${V} 地図と番号はいまのセットに追従（02）`, await p.evaluate(()=>[...document.querySelectorAll('.setno')].every(b=>b.textContent==='02') && document.querySelector('#viewDots .setmap').children[1].classList.contains('cur')), 'map not following');
    ok_(`${V} 押す＝ポン出し（SET 2 へ切替・鳴る・既定のキット）／SET 1 の変更は退避される／undo は空`, s2.cur===1 && s2.playing===true && s2.name==='PAD 1' && s2.type0==='empty' && !s2.buf0 && s2.kick && s2.bpm===60 && s2.steps===0 && s2.saved==='S1' && s2.savedBpm===60 && s2.savedStep===1 && s2.tag==='NOW' && s2.undo===0, JSON.stringify(s2));
    await p.evaluate(()=>{ setStep(9,4,1); });   // SET 2 に 1 ステップ（退避されるか）
    await p.mouse.up(); await p.waitForTimeout(150);
    const u1=await ui();
    ok_(`${V} 離す＝止まる（1 拍に届かない）／SET 2 は選ばれたまま・オレンジは消える・▶`, u1.cur===1 && !u1.playing && u1.sides.length===0 && u1.lit.length===0 && u1.held.length===0 && u1.btn==='▶' && await p.evaluate(()=>document.querySelector('#setGrid .setpad.on .tag').textContent==='SEL'), JSON.stringify(u1));
    // ホールド：SET 3 を 1 拍押し続ける（BPM 240 ＝ 250ms）→ 離しても鳴り続ける
    await p.evaluate(()=>{ setSlots[2].bpm=240; });
    await down(2); await p.waitForTimeout(600);   // BPM 240 の 1 拍＝250ms
    const h1=await ui();
    const litH=await p.evaluate(()=>{ const d=document.querySelector('#setGrid .setpad[data-k="2"]'); const cs=getComputedStyle(d); return {cls:d.className, bg:cs.backgroundImage, glow:cs.boxShadow}; });
    ok_(`${V} ホールドになると今の色で光る（held・面塗り・外光 26px）`, /\bheld\b/.test(litH.cls) && /linear-gradient/.test(litH.bg) && /26px/.test(litH.glow), JSON.stringify(litH));
    await p.evaluate(()=>{ for(let s=0;s<16;s++) setStep(8,s,1); });   // SET 3 の 9 番を 16 分で（ミックスで鳴っているか見る）
    await p.mouse.up(); await p.waitForTimeout(200);
    const h2=await ui();
    ok_(`${V} 1 拍押し続ける＝ホールド（HOLD の印・離しても鳴り続ける・窓の MIX に H）`, h1.cur===2 && h1.playing && h1.held.includes(2) && h2.playing && h2.held.includes(2) && h2.lit.join()==='2' && /^03H$/.test(h2.mix) && await p.evaluate(()=>document.querySelector('#setGrid .setpad[data-k="2"] .tag').textContent==='HOLD'), JSON.stringify({h1,h2}));
    // ミックス：ホールド中に SET 1 を押す → SET 1 がいまのセットになって鳴り、SET 3 は止まらずに鳴り続ける
    await down(0); await p.waitForTimeout(400);
    const m1=await ui();
    // v0.3.151：押しながら下へスワイプ＝そのセットの音量を下げる（8px の遊び＋5px で 1 dB → 58px で -10 dB）。鳴りは続く
    { const c0=await sp(0); await p.mouse.move(c0[0], c0[1]+58, {steps:6}); await p.waitForTimeout(80); }
    const vol=await p.evaluate(()=>{ const d=document.querySelector('#setGrid .setpad[data-k="0"]'), f=d.querySelector('.lvfill');
      return {db:setLevels[0], lin:setLevelLin(0), node:!!setLevelNode(0), lv:d.querySelector('.lv').textContent, lvShown:getComputedStyle(d.querySelector('.lv')).display!=='none', playing, other:setLevels[2],
        fill:getComputedStyle(f).display!=='none' ? f.getBoundingClientRect().height/d.getBoundingClientRect().height : -1, otherFill:getComputedStyle(document.querySelector('#setGrid .setpad[data-k="5"] .lvfill')).display}; });
    ok_(`${V} 押しながら下へスワイプ＝そのセットの音量だけ下がる（約 -10 dB・パッドに表示・鳴りは続く）`, Math.abs(vol.db+10)<=0.5 && Math.abs(vol.lin-Math.pow(10,vol.db/20))<0.001 && vol.lin<0.34 && vol.node && vol.lv===vol.db.toFixed(1)+'dB' && vol.lvShown && vol.playing && vol.other===0, JSON.stringify(vol));
    ok_(`${V} 音量は下からの塗り潰しで見える（高さ＝(dB+40)/46・0 dB のセットには出ない）`, Math.abs(vol.fill-(vol.db+40)/46)<0.04 && vol.otherFill==='none', JSON.stringify(vol));
    const m1d=await p.evaluate(()=>({name:tracks[0].name, bpm:bpmVal, step:tracks[8].patterns[0][0][0], side3:sidePlayers.get(2)&&sidePlayers.get(2).bpm, v3:setSlots[2].tracks[8].activeVoices.length, s3step:setSlots[2].tracks[8].patterns[0][0][5], s2step:setSlots[1].tracks[9].patterns[0][0][4]}));
    ok_(`${V} 同時鳴らし：SET 1 を押すと SET 1 がいまのセット、SET 3 は自分の BPM で鳴り続ける（両方オレンジ・MIX に 2 つ）`, m1.cur===0 && m1.playing && m1.sides.join()==='2' && m1.lit.join()==='0,2' && /01/.test(m1.mix) && /03H/.test(m1.mix) && m1d.name==='S1' && m1d.bpm===60 && m1d.step===1 && m1d.side3===240 && m1d.v3>0 && m1d.s3step===1 && m1d.s2step===1, JSON.stringify({m1,m1d}));
    const mp1=await map();
    ok_(`${V} 地図：いまのセット（01）・鳴っているセット（01 と 03）・ホールド（03）が分かる`, Object.values(mp1.maps).every(m=>m.cur===0 && m.play==='0,2' && m.held==='2') && mp1.no==='01,01', JSON.stringify(mp1));
    await p.mouse.up(); await p.waitForTimeout(150);
    const m2=await ui();
    ok_(`${V} SET 1 を離す＝SET 1 だけ止まる（SET 3 は鳴り続ける・■ のまま）`, m2.cur===0 && !m2.playing && m2.sides.join()==='2' && m2.lit.join()==='2' && m2.btn==='■', JSON.stringify(m2));
    // ホールド中の SET 3 を押して上へスワイプ＝音量だけ上がる（離しても止まらない）
    const c3=await sp(2); await p.mouse.move(c3[0],c3[1]); await p.mouse.down(); await p.mouse.move(c3[0], c3[1]-30, {steps:5}); await p.mouse.up(); await p.waitForTimeout(150);
    const hv=await p.evaluate(()=>({db:setLevels[2], playing:sidePlaying(2), held:isSetHeld(2)}));
    ok_(`${V} ホールド中を押して上へスワイプ＝音量だけ上がる（+4.5 dB・離しても止まらない）`, hv.db===4.5 && hv.playing && hv.held, JSON.stringify(hv));
    // ホールド中の SET 3 は「押して離す」で止まる（押した瞬間には止まらない）
    await p.mouse.move(c3[0],c3[1]); await p.mouse.down(); await p.waitForTimeout(120);
    const t0=await p.evaluate(()=>sidePlaying(2));
    await p.mouse.up(); await p.waitForTimeout(150);
    const t1=await ui();
    ok_(`${V} ホールド中のセットは押した瞬間には止まらない`, t0===true, String(t0));
    ok_(`${V} ホールド中のセットを押して離す＝止まる（トグル）／いまのセットは SET 1 のまま`, t1.cur===0 && !t1.playing && t1.sides.length===0 && t1.lit.length===0 && t1.held.length===0 && t1.btn==='▶' && t1.mix==='—', JSON.stringify(t1));
    // ▶ で鳴らしたセットはホールド扱い。打ち込みは止めても残る。■ は鳴っているセットを全部止める
    await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
    await p.evaluate(()=>{ setStep(3,7,1); });
    const pl=await ui();
    await down(1); await p.waitForTimeout(250);
    const pl2=await ui();
    await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
    await p.mouse.up(); await p.waitForTimeout(100);
    const st1=await ui();
    ok_(`${V} ▶＝ホールド扱い／もう 1 つ押すと 2 つ鳴る／■ で全部止まる`, pl.playing && pl.held.includes(0) && pl2.cur===1 && pl2.sides.join()==='0' && pl2.lit.join()==='0,1' && !st1.playing && st1.sides.length===0 && st1.lit.length===0 && st1.held.length===0 && st1.btn==='▶', JSON.stringify({pl,pl2,st1}));
    // SET 1 に戻す（押して離す）：鳴らしている間の打ち込みは残る
    const c1=await sp(0); await p.mouse.click(c1[0],c1[1]); await p.waitForTimeout(250);
    ok_(`${V} 打ち込みは止めても残る（他のセットへ移って戻っても）`, await p.evaluate(()=>setCur===0 && getPattern(3)[7]===1 && !playing), 'reverted');
    ok_(`${V} 止まるとオレンジは消える（SEL のティール枠に戻る）`, await p.evaluate(()=>{ const d=document.querySelector('#setGrid .setpad.on'); return !d.classList.contains('playing') && d.querySelector('.tag').textContent==='SEL' && !document.querySelector('#setGrid .setpad.playing'); }), 'still lit');
    // COPY：COPY を押してセットを叩く＝いまのセットを写す
    await p.evaluate(()=>arm('chop',true)); await p.click('#setGrid .setpad[data-k="4"]'); await p.waitForTimeout(150);
    const cp=await p.evaluate(()=>({name:setSlots[4].tracks[0].name, bpm:setSlots[4].bpm, step:setSlots[4].tracks[3].patterns[0][0][7], arm:armMode, cur:setCur, setname:setName(4)}));
    ok_(`${V} COPY ＋セット＝いまのセットを写す（名前・BPM・ステップ）`, cp.name==='S1' && cp.bpm===60 && cp.step===1 && cp.arm===null && cp.cur===0 && cp.setname==='SET 5', JSON.stringify(cp));
    // v3 の保存 → 読込（16 セットが戻る。触っていないプリセットは音を同梱しない）
    const rt=await p.evaluate(async()=>{ const f=buildProject(); const txt=JSON.stringify(f); const size=txt.length;
      const presetAudio=f.sets[1].tracks[8].audio; await applyProject(JSON.parse(txt));
      return {v:f.version, cur:f.cur, n:f.sets.length, presetAudio, size, back:tracks[0].name, s2:setSlots[1].tracks[9].patterns[0][0][4], s5:setSlots[4].tracks[0].name, bpm:bpmVal, lv0:f.sets[0].level, lv2:f.sets[2].level, back0:setLevels[0], back2:setLevels[2]}; });
    ok_(`${V} .mics v3 往復（16 セット・cur・各セットの中身・ミックス音量・プリセットは同梱しない）`, rt.v===3 && rt.cur===0 && rt.n===16 && rt.presetAudio===null && rt.back==='S1' && rt.s2===1 && rt.s5==='S1' && rt.bpm===60 && Math.abs(rt.lv0+10)<=0.5 && rt.lv2===4.5 && rt.back0===rt.lv0 && rt.back2===4.5, JSON.stringify(rt));
    // v2（旧ファイル）＝丸ごと SET 1、他は既定のキット
    const v2=await p.evaluate(async()=>{ const f=buildProject(); const old={version:2, bpm:95, swing:63, comp:f.comp, masterVol:f.masterVol, tracks:f.sets[0].tracks}; old.tracks[0].name='OLD1';
      await applyProject(old); return {cur:setCur, name:tracks[0].name, bpm:bpmVal, s2fresh:setSlots[1].tracks[0].buffer===null && setSlots[1].tracks[9].patterns[0][0][4]===0}; });
    ok_(`${V} v2 の .mics は SET 1 に入り、他は既定のキット`, v2.cur===0 && v2.name==='OLD1' && v2.bpm===95 && v2.s2fresh, JSON.stringify(v2));
    // リロード：自動保存（v3）で 16 セットが戻る
    await p.evaluate(async()=>{ await applyProject(JSON.parse(JSON.stringify(buildProject()))); setRename(2,'THIRD'); await autosaveNow(true); });
    await p.reload({waitUntil:'load'}); await ready(p);
    ok_(`${V} リロードで 16 セットが戻る（名前も）`, await p.evaluate(()=>setSlots.filter(Boolean).length===16 && setName(2)==='THIRD' && tracks[0].name==='OLD1'), await p.evaluate(()=>setSlots.filter(Boolean).length+'/'+setName(2)+'/'+tracks[0].name));
    // 戻る：PADS に 1 タップ
    await p.click(mobile ? '#viewDots .vdot[data-view="viewSet"]' : '#modeSet'); await p.waitForTimeout(150);
    await p.click(mobile ? '#viewDots .vdot[data-view="viewPads"]' : '#modePads'); await p.waitForTimeout(200);
    const back=await p.evaluate(()=>({mode:setMode, page:clPage, pads:getComputedStyle(document.getElementById('pads')).display, grid:getComputedStyle(document.getElementById('setGrid')).display}));
    ok_(`${V} PADS へ戻る（窓は MAIN・格子は #pads）`, back.mode===false && back.page==='main' && back.pads!=='none' && back.grid==='none', JSON.stringify(back));
    await p.evaluate(async()=>{ await clearAutosave(); });
    eq(`${V} 0 errors`, errs, []);
    await ctx.close();
  }
}
async function setNameTest(){
  // v0.3.167：セットの名前を ✎ で変える（情報窓の SET ページ）。打った文字で SET のキーが動かない
  const V='SETNAME 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); });
  await p.click('#viewDots .vdot[data-view="viewSet"]'); await p.waitForTimeout(250);
  await p.click('#clSetRename'); await p.waitForTimeout(100);
  const o=await p.evaluate(()=>{ const i=document.getElementById('clSetNameIn'); return {vis:!i.hidden && getComputedStyle(i).display!=='none', val:i.value, focus:document.activeElement===i, nameHidden:getComputedStyle(document.getElementById('clSetName')).display==='none'}; });
  await p.keyboard.press('Control+A'); await p.keyboard.type('VERSE CITY'); await p.keyboard.press('Enter'); await p.waitForTimeout(150);
  const a=await p.evaluate(()=>({name:setName(0), pad:document.querySelector('#setGrid .setpad[data-k="0"] .nm').textContent, win:document.getElementById('clSetName').textContent, inHidden:document.getElementById('clSetNameIn').hidden, playing, sides:sideCount(), file:buildSaveFile('set').obj.set.name}));
  ok_(`${V} ✎ で入力欄（いまの名前が入っている）`, o.vis && o.val==='SET 1' && o.focus && o.nameHidden, JSON.stringify(o));
  ok_(`${V} Enter で確定＝パッド・窓・ファイルの名前が変わる／打った文字で SET のキー（E・R …）は動かない`, a.name==='VERSE CITY' && a.pad==='VERSE CITY' && a.win==='VERSE CITY' && a.inHidden && !a.playing && a.sides===0 && a.file==='VERSE CITY', JSON.stringify(a));
  await p.click('#clSetRename'); await p.keyboard.type('XX'); await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok_(`${V} Escape は取消`, await p.evaluate(()=>setName(0)==='VERSE CITY' && document.getElementById('clSetNameIn').hidden), 'renamed');
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function wireSkin(){
  // v0.3.163：スキン WIRE（黒地＋線だけのワイヤーフレーム）
  const V='WIRE 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const r=await p.evaluate(()=>{ document.querySelector('#themeSeg button[data-th="wf"]').click();
    const cs=sel=>getComputedStyle(document.querySelector(sel));
    return {cls:document.body.className.match(/t-\w+/g).join(), ls:localStorage.getItem('mics-skin'), on:document.querySelector('#themeSeg button.on').dataset.th,
      bg:cs('body').backgroundColor, pad:cs('#pads .pad').backgroundImage+'|'+cs('#pads .pad').backgroundColor, step:(document.querySelector('#stepStrip .stepbtn:not(.on)')?cs('#stepStrip .stepbtn:not(.on)').backgroundColor:'-') }; });
  ok_(`${V} スキン WIRE：黒地・パッドとステップは塗らない（線だけ）・選んだスキンを覚える`, r.cls==='t-wf' && r.ls==='wf' && r.on==='wf' && r.bg==='rgb(0, 0, 0)' && /none\|rgb\(0, 0, 0\)/.test(r.pad) && (r.step==='-'||r.step==='rgb(0, 0, 0)'), JSON.stringify(r));
  await p.evaluate(()=>{ document.querySelector('#themeSeg button[data-th="ak"]').click(); });
  ok_(`${V} AK に戻せる`, await p.evaluate(()=>document.body.classList.contains('t-ak') && !document.body.classList.contains('t-wf')), 'stuck');
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function saveScopeTest(){
  // v0.3.162：SAVE / LOAD をステージ・セット・シーケンス単位で
  const V='SAVESCOPE 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const r=await p.evaluate(async()=>{ await clearAutosave(); const out={};
    tracks.forEach(t=>t.patterns.forEach(pt=>pt.forEach(b=>b.fill(0))));
    setEditPat(0); tracks[8].patterns[0][0][0]=1; tracks[8].patterns[0][1][2]=1; tracks[8].mute=true; tracks[9].patterns[1][0][4]=1;
    tracks[0].name='SS1'; paintPadName(0); applyBpm(91);
    // SEQ：書き出し → A を消して読む（単位 STAGE でもファイルが SEQ なら編集中のパターンへ）→ B へも読める → ↩
    const fq=buildSaveFile('seq'); out.seqFile={kind:fq.obj.kind, k8:fq.obj.tracks[8].patterns[0][0], k8b:fq.obj.tracks[8].patterns[1][2], mute:fq.obj.tracks[8].mute, audio:JSON.stringify(fq.obj).includes('"audio"'), name:/set01A-.*\.micseq$/.test(fq.name)};
    tracks[8].patterns[0][0][0]=0; tracks[8].patterns[0][1][2]=0; tracks[8].mute=false;
    await loadFileData(JSON.parse(JSON.stringify(fq.obj)),'stage');
    out.seqBack={a0:tracks[8].patterns[0][0][0], a1:tracks[8].patterns[0][1][2], mute:tracks[8].mute, b:tracks[9].patterns[1][0][4]};
    setEditPat(1); await loadFileData(JSON.parse(JSON.stringify(fq.obj)),'seq');
    out.seqToB={b8:tracks[8].patterns[1][0][0], b9:tracks[9].patterns[1][0][4], a0:tracks[8].patterns[0][0][0]};
    doUndo(); out.undoB={b9:tracks[9].patterns[1][0][4], b8:tracks[8].patterns[1][0][0]};
    setEditPat(0);
    // SET：書き出し → 変えて読む（単位 SET）→ 名前・BPM・音量が戻る。他のセットは触らない
    setSetLevel(0,-6); const fs=buildSaveFile('set'); out.setFile={kind:fs.obj.kind, n:fs.obj.set.tracks.length, level:fs.obj.set.level, bpm:fs.obj.set.bpm, name:/set01-.*\.micset$/.test(fs.name)};
    tracks[0].name='X'; applyBpm(150); setSetLevel(0,0); setSlots[3].name='KEEP3';
    await loadFileData(JSON.parse(JSON.stringify(fs.obj)),'set');
    out.setBack={name:tracks[0].name, bpm:bpmVal, level:setLevels[0], other:setSlots[3].name, a0:tracks[8].patterns[0][0][0]};
    // STAGE のファイルを単位 SET で → ファイルのいまのセットだけ。単位 SEQ で → 同じ文字のパターンだけ
    const stf=buildSaveFile('stage'); out.stageName=/^mics009-\d{6}-\d{4}\.mics$/.test(stf.name); const st=stf.obj; tracks[0].name='Y'; setSlots[5].name='KEEP5';
    await loadFileData(JSON.parse(JSON.stringify(st)),'set');
    out.stageSet={name:tracks[0].name, other:setSlots[5].name};
    tracks[8].patterns[0][0][0]=0; await loadFileData(JSON.parse(JSON.stringify(st)),'seq');
    out.stageSeq={a0:tracks[8].patterns[0][0][0], other:setSlots[5].name};
    try{ await loadFileData({version:3, kind:'seq'},'stage'); out.bad='accepted'; }catch(_){ out.bad='rejected'; }
    return out; });
  ok_(`${V} SEQ の書き出し：パターン 1 つ（4 小節のステップ・ミュート）・音は入れない・名前に set01A`, r.seqFile.kind==='seq' && r.seqFile.k8===1 && r.seqFile.k8b===1 && r.seqFile.mute && !r.seqFile.audio && r.seqFile.name, JSON.stringify(r.seqFile));
  ok_(`${V} SEQ を読む＝編集中のパターンへ（他のパターンは触らない）`, r.seqBack.a0===1 && r.seqBack.a1===1 && r.seqBack.mute && r.seqBack.b===1, JSON.stringify(r.seqBack));
  ok_(`${V} SEQ は別の文字（B）へも読める・↩ で戻る`, r.seqToB.b8===1 && r.seqToB.b9===0 && r.seqToB.a0===1 && r.undoB.b9===1 && r.undoB.b8===0, JSON.stringify({a:r.seqToB,b:r.undoB}));
  ok_(`${V} SET の書き出し・読み込み＝いまのセットだけ（名前・BPM・音量が戻る・他のセットは触らない）`, r.setFile.kind==='set' && r.setFile.n===16 && r.setFile.level===-6 && r.setFile.bpm===91 && r.setFile.name && r.setBack.name==='SS1' && r.setBack.bpm===91 && r.setBack.level===-6 && r.setBack.other==='KEEP3' && r.setBack.a0===1, JSON.stringify({f:r.setFile,b:r.setBack}));
  ok_(`${V} STAGE のファイルを SET / SEQ 単位で読む＝その単位だけ（他のセットは触らない）`, r.stageSet.name==='SS1' && r.stageSet.other==='KEEP5' && r.stageSeq.a0===1 && r.stageSeq.other==='KEEP5', JSON.stringify({a:r.stageSet,b:r.stageSeq}));
  ok_(`${V} 中身の無いファイルは読まない`, r.bad==='rejected', r.bad);
  ok_(`${V} 拡張子で単位が分かる：STAGE .mics／SET .micset／SEQ .micseq（v0.3.165）`, r.stageName && r.setFile.name && r.seqFile.name, JSON.stringify({stage:r.stageName, set:r.setFile.name, seq:r.seqFile.name}));
  // 単位のスイッチ（メニュー）
  const u=await p.evaluate(()=>{ document.querySelector('#saveScope button[data-u="seq"]').click(); const a={ls:localStorage.getItem('mics-save-scope'), on:document.querySelector('#saveScope button.on').dataset.u, scope:saveScope()};
    document.querySelector('#saveScope button[data-u="stage"]').click(); return a; });
  ok_(`${V} メニューの単位スイッチ（STAGE / SET / SEQ）を覚える`, u.ls==='seq' && u.on==='seq' && u.scope==='seq', JSON.stringify(u));
  await p.evaluate(async()=>{ await clearAutosave(); localStorage.removeItem('mics-save-scope'); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function barHoldTest(){
  // v0.3.161：BAR はシングル＝選択、ダブルタップ＝ホールド。ホールドがあればその小節だけを順番にくり返す
  const V='BARHOLD 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); switchView('viewSeq'); setEditPat(0); for(let b=0;b<4;b++) tracks[8].patterns[0][b][0]=1; applyBpm(240); paintPatBar(); });
  const bar=k=>`#barSeg button[data-b="${k}"]`;
  await p.click(bar(2)); await p.waitForTimeout(400);
  const s1=await p.evaluate(()=>({editBar, hold:barHold.join()}));
  ok_(`${V} シングルタップ＝選択だけ（ホールドしない）`, s1.editBar===2 && s1.hold==='false,false,false,false', JSON.stringify(s1));
  await p.click(bar(1)); await p.click(bar(1)); await p.waitForTimeout(100);
  const s2=await p.evaluate(()=>({editBar, hold:barHold.join(), cls:document.querySelector('#barSeg button[data-b="1"]').classList.contains('hold')}));
  ok_(`${V} ダブルタップ＝ホールド（印が付く）`, s2.editBar===1 && s2.hold==='false,true,false,false' && s2.cls, JSON.stringify(s2));
  const look=await p.evaluate(()=>{ const b=k=>document.querySelector(`#barSeg button[data-b="${k}"]`); const cs=getComputedStyle;
    return {loop:cs(b(1),'::before').content, held:+cs(b(1)).opacity, other:+cs(b(3)).opacity, frame:/inset/.test(cs(b(1)).boxShadow), segCls:document.getElementById('barSeg').classList.contains('has-hold')}; });
  ok_(`${V} 見た目：ホールドした小節は太い枠＋⟳、していない小節は薄く（v0.3.164）`, /⟳/.test(look.loop) && look.held===1 && look.other<0.5 && look.frame && look.segCls, JSON.stringify(look));
  // v0.3.166：ホールドした小節で打ち込む＝ホールドした小節すべての同じステップへ（Excel の複数シート選択のように）
  await p.click(bar(3)); await p.click(bar(3)); await p.waitForTimeout(50);   // BAR 2 と 4 をホールド
  await p.click(bar(1)); await p.waitForTimeout(400);                          // 編集は BAR 2（ホールド中）
  await p.click('#grid .row[data-i="9"] .step[data-s="6"]'); await p.waitForTimeout(80);
  const g1=await p.evaluate(()=>tracks[9].patterns[0].map(b=>b[6]).join());
  eq(`${V} ロック操作APIは廃止`,await p.evaluate(()=>typeof setLockEdit),'undefined');
  const lk=await p.evaluate(()=>Object.keys(tracks[9].locks||{}).filter(k=>/_6$/.test(k)).sort().join());
  await p.click('#grid .row[data-i="9"] .step[data-s="6"]'); await p.waitForTimeout(80);
  const g2=await p.evaluate(()=>({steps:tracks[9].patterns[0].map(b=>b[6]).join(), locks:Object.keys(tracks[9].locks||{}).filter(k=>/_6$/.test(k)).join()}));
  await p.click(bar(0)); await p.waitForTimeout(400);                          // 編集は BAR 1（ホールドしていない）
  await p.click('#grid .row[data-i="9"] .step[data-s="6"]'); await p.waitForTimeout(80);
  const g3=await p.evaluate(()=>tracks[9].patterns[0].map(b=>b[6]).join());
  ok_(`${V} ホールドした小節で打つ＝ホールドした小節すべての同じ所に入る・消すのも・P-LOCK も／ホールドしていない小節はそこだけ`, g1==='0,1,0,1' && lk==='' && g2.steps==='0,0,0,0' && g2.locks==='' && g3==='1,0,0,0', JSON.stringify({g1,lk,g2,g3}));
  await p.evaluate(()=>{ tracks[9].patterns[0][0][6]=0; });
  await p.click(bar(3)); await p.click(bar(3)); await p.waitForTimeout(400);   // 元に戻す（BAR 4 を外す＝BAR 2 だけホールド）
  const watch=ms=>p.evaluate(async ms=>{ const seen=new Set(); const t0=performance.now(); while(performance.now()-t0<ms){ seen.add(playBar); await new Promise(r=>setTimeout(r,40)); } return [...seen].sort().join(); }, ms);
  await p.evaluate(()=>document.getElementById('play').click());
  const w1=await watch(2600);
  ok_(`${V} 1 つホールド＝その小節だけをくり返す（BAR 2）`, w1==='1', w1);
  await p.click(bar(3)); await p.click(bar(3)); await p.waitForTimeout(50);
  const w2=await watch(3200);
  ok_(`${V} 2 つホールド＝その 2 つだけを順番に（BAR 2 → 4）`, w2==='1,3', w2);
  await p.click(bar(1)); await p.click(bar(1)); await p.waitForTimeout(400); await p.click(bar(3)); await p.click(bar(3)); await p.waitForTimeout(50);
  const s3=await p.evaluate(()=>barHold.join());
  const w3=await watch(4400);
  ok_(`${V} ホールドを全部外す＝全部の小節を順に`, s3==='false,false,false,false' && w3==='0,1,2,3', JSON.stringify({s3,w3}));
  await p.evaluate(()=>document.getElementById('play').click());
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function patSwitchEnd(){
  // v0.3.168：再生中に A→B を押したら、A を鳴らし切ってから B へ（3 小節目で押しても 4 小節目まで鳴る）
  const V='PATSWITCH 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); switchView('viewSeq'); setEditPat(0); for(let b=0;b<4;b++) tracks[8].patterns[0][b][0]=1; tracks[8].patterns[1][0][0]=1; applyBpm(240); });
  await p.evaluate(()=>document.getElementById('play').click());
  await p.waitForFunction(()=>playPat===0 && playBar===1, null, {timeout:5000});
  const seen=await p.evaluate(async()=>{ setEditPat(1); const seq=[]; const t0=performance.now();
    while(performance.now()-t0<3600){ const k=playPat+':'+playBar; if(seq[seq.length-1]!==k) seq.push(k); await new Promise(r=>setTimeout(r,30)); } return seq.join(' '); });
  ok_(`${V} 2 小節目で B を押す＝A の 3・4 小節目を鳴らしてから B の頭へ`, /^0:1 0:2 0:3 1:0/.test(seen), seen);
  await p.evaluate(()=>document.getElementById('play').click());
  // メニューの Timing で切替どきを選ぶ：BAR＝いまの小節の終わり／BEAT＝次の拍で、小節の中の位置はそのまま
  const mode=async(u, wantRe, label)=>{
    await p.evaluate(u=>{ document.querySelector(`#patSwitch button[data-u="${u}"]`).click(); setEditPat(0); for(let b=0;b<4;b++) tracks[8].patterns[1][b][0]=1; document.getElementById('play').click(); }, u);
    await p.waitForFunction(()=>playPat===0 && playBar===1 && stepIdx>=1 && stepIdx<=3, null, {timeout:6000, polling:5});
    const r=await p.evaluate(async()=>{ setEditPat(1); const seq=[]; const t0=performance.now(); let tb=null;
      while(performance.now()-t0<1400){ const k=playPat+':'+playBar; if(seq[seq.length-1]!==k){ seq.push(k); if(playPat===1&&tb===null) tb=Math.round(performance.now()-t0); } await new Promise(r=>setTimeout(r,10)); } return {seq:seq.join(' '), tb}; });
    await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(100);
    const on=await p.evaluate(u=>document.querySelector(`#patSwitch button[data-u="${u}"]`).classList.contains('on'), u);
    ok_(`${V} ${label}`, wantRe.test(r.seq) && on && (u!=='beat' || r.tb<400), JSON.stringify({...r, on}));
  };
  await mode('bar', /^0:1 1:0/, 'BAR：2 小節目で B を押す＝2 小節目の終わりで B の頭へ');
  await mode('beat', /^0:1 1:1/, 'BEAT：次の拍で B へ（小節の位置はそのまま＝B の 2 小節目）');
  // BAR 2・4 HOLD × 3 モード。時計を止め、実 scheduler/scheduleStep を1ステップずつ進める。
  // playBar は先読みで進むので、実際に発音予約された drawQueue を検査する（小節番号は0始まり）。
  const held=await p.evaluate(async()=>{
    await AC.suspend(); applyBpm(100); toggleBarHold(1); toggleBarHold(3);
    const out={};
    try{
      for(const u of ['end','bar','beat']){
        document.querySelector(`#patSwitch button[data-u="${u}"]`).click();
        setEditPat(0); playing=true; playPat=0; playBar=firstPlayBar(); displayPat=0;
        stepIdx=0; queuedPat=null; if(patSlot!==0) patLoad(0);
        const seq=[];
        for(let n=0;n<49;n++){
          // 今のステップだけを先読み窓へ入れる（100 BPM の次ステップは窓の外）。
          barStartTime=AC.currentTime+LOOKAHEAD-0.001-(stepTimeClean(stepIdx)-barStartTime);
          drawQueue.length=0; scheduler();
          seq.push(...drawQueue.map(q=>[q.pat,q.bar,q.step]));
          if(n===0) setEditPat(1);   // A の BAR 2・step 0 を予約した直後に B を選ぶ
        }
        out[u]={seq, hold:heldBars(), queued:queuedPat}; stopTransport();
      }
    }finally{ stopTransport(); clearBarHold(); await AC.resume(); }
    return out;
  });
  for(const [u,cut,bar,step] of [['end',32,1,0],['bar',16,1,0],['beat',4,1,4]]){
    const r=held[u], before=Array.from({length:cut},(_,n)=>[0,n<16?1:3,n%16]);
    eq(`${V} HOLD 2・4 ${u}：切替前の全ステップ（PATTERN は BAR 4 を最後まで）`, r.seq.slice(0,cut), before);
    eq(`${V} HOLD 2・4 ${u}：切替位置`, r.seq[cut], [1,bar,step]);
    eq(`${V} HOLD 2・4 ${u}：B でも HOLD 維持`, r.seq.slice(cut), Array.from({length:49-cut},(_,n)=>{
      const pos=step+n; return [1,Math.floor(pos/16)%2?3:1,pos%16];
    }));
    eq(`${V} HOLD 2・4 ${u}：HOLD 対象・予約消化`, [r.hold,r.queued], [[1,3],null]);
  }
  await p.evaluate(()=>{ document.querySelector('#patSwitch button[data-u="end"]').click(); });
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function fxKeep(){
  // v0.3.168：エフェクトは解除しても残る（ポッチ）／ダブルタップで外す／EDIT → ボタン＝モーダル／SET を替えて解除しても前のセットの値を書き込まない
  const V='FXKEEP 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); });
  const btn='#perfPlk .perf-plkbtn[data-lock="reverb"]';
  // SET：SET 1 で REVERB を掛けたまま SET 2 へ → 解除。v0.3.168 までは SET 1 の「掛ける前の値」を SET 2 に書き込んでいた
  await p.evaluate(()=>{ tracks[3].reverbSend=0; });
  await p.click(btn);
  const r=await p.evaluate(async()=>{ tracks[3].reverbSend=0.8; switchSetNow(1); tracks[3].reverbSend=0.25; _fxTapT=-1e9;
    document.querySelector('#perfPlk .perf-plkbtn[data-lock="reverb"]').click();
    const s2=tracks[3].reverbSend; switchSetNow(0); const s1=tracks[3].reverbSend; return {s1, s2, lock:activeLock}; });
  ok_(`${V} SET 1 で掛けて SET 2 へ移って解除：SET 2 は SET 2 の値・SET 1 は掛けた値のまま`, r.s1===0.8 && r.s2===0.25 && r.lock===null, JSON.stringify(r));
  await p.evaluate(()=>fxModalClose());
  const dot=await p.evaluate(b=>getComputedStyle(document.querySelector(b),'::before').content, btn);
  ok_(`${V} 掛けたボタンにポッチ`, dot!=='none' && dot!=='normal', dot);
  // EDIT 中にエフェクトのボタン＝モーダル（パッドごとの量・RESET）。ボタンは点かない
  await p.evaluate(()=>{ document.getElementById('perfEdit').click(); });
  await p.click(btn); await p.waitForTimeout(100);
  const m=await p.evaluate(()=>{ const md=document.getElementById('fxModal'); const rows=[...document.querySelectorAll('#fxmList .fxm-row')];
    return {open:getComputedStyle(md).display, title:document.getElementById('fxmTitle').textContent, rows:rows.length, v3:rows[3].querySelector('.fxm-v').textContent, set3:rows[3].classList.contains('set'), lock:activeLock}; });
  ok_(`${V} EDIT → REVERB＝モーダル（16 パッドの量・掛かっているパッドが分かる）`, m.open==='flex' && m.title==='REVERB' && m.rows===16 && m.v3==='80' && m.set3 && m.lock===null, JSON.stringify(m));
  await p.evaluate(()=>{ const inp=document.querySelector('#fxmList .fxm-row[data-i="5"] input'); inp.value=0.5; inp.dispatchEvent(new Event('input',{bubbles:true})); inp.dispatchEvent(new Event('change',{bubbles:true})); });
  const v5=await p.evaluate(()=>tracks[5].reverbSend);
  ok_(`${V} モーダルのスライダー＝そのパッドの量`, v5===0.5, String(v5));
  await p.click('#fxmReset');
  const rs=await p.evaluate(()=>({any:tracks.some(t=>t.reverbSend>0), dot:document.querySelector('#perfPlk .perf-plkbtn[data-lock="reverb"]').classList.contains('fxset'), v3:document.querySelector('#fxmList .fxm-row[data-i="3"] .fxm-v').textContent}));
  ok_(`${V} モーダルの RESET＝全パッドから外す・ポッチが消える`, !rs.any && !rs.dot && rs.v3==='0', JSON.stringify(rs));
  // FILTER：種類の切替（OFF → LP → HP）
  await p.click('#fxmClose'); await p.click('#perfPlk .perf-plkbtn[data-lock="filter"]'); await p.waitForTimeout(100);
  await p.click('#fxmList .fxm-type[data-i="2"]'); await p.click('#fxmList .fxm-type[data-i="2"]');
  const f=await p.evaluate(()=>({f:tracks[2].filter, open:document.getElementById('fxModal').style.display, dot:document.querySelector('#perfPlk .perf-plkbtn[data-lock="filter"]').classList.contains('fxset')}));
  ok_(`${V} FILTER のモーダル：種類 OFF→LP→HP・ポッチ`, f.f==='hp' && f.open==='flex' && f.dot, JSON.stringify(f));
  await p.keyboard.press('Escape');
  const closed=await p.evaluate(()=>document.getElementById('fxModal').style.display);
  ok_(`${V} Esc で閉じる`, closed==='none', closed);
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function longPitch(){
  // v0.3.169：ロングサンプルでピッチを変えても START がずれない（v0.3.168 までは 12 秒で打ち切ったバッファに START を掛けていた）
  const V='LONGPITCH 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  const r=await p.evaluate(()=>{
    const sr=44100, N=sr*60, raw=AC.createBuffer(1,N,sr), d=raw.getChannelData(0);
    for(let i=0;i<N;i++) d[i]=i/N;                                   // 値＝位置（0..1）のランプ
    const t=tracks[2]; t.rawBuffer=raw; t.buffer=makeLofi(raw); t.start=0.5; t.end=0.55; t.loop=false; t.attack=0; t.fade=3;
    const proto=AudioBufferSourceNode.prototype, orig=proto.start; let got=null;
    proto.start=function(w,off){ got={buf:this.buffer, off:off||0, loop:this.loop, ls:this.loopStart}; return orig.apply(this, arguments); };
    const at=tune=>{ t.tune=tune; got=null; playVoice(2, AC.currentTime+0.05, false, false, 0, null); stopVoices(t, AC.currentTime);
      const b=got.buf, k=Math.min(b.length-1, Math.round(got.off*b.sampleRate)+2); return +b.getChannelData(0)[k].toFixed(3); };
    const res={t0:at(0), up2:at(2), dn5:at(-5), up12:at(12)};
    t.loop=true; t.loopStart=0.52; t.tune=3; got=null; playVoice(2, AC.currentTime+0.05, false, false, 0, null); stopVoices(t, AC.currentTime);
    res.loopStart=+got.buf.getChannelData(0)[Math.min(got.buf.length-1, Math.round(got.ls*got.buf.sampleRate)+2)].toFixed(3);
    t.loop=false; proto.start=orig; return res; });
  const near=(v,x)=>Math.abs(v-x)<0.004;
  ok_(`${V} 60 秒のサンプルの START 0.5：ピッチ 0 / +2 / -5 / +12 で同じ所（30 秒目）から鳴る`, near(r.t0,0.5) && near(r.up2,0.5) && near(r.dn5,0.5) && near(r.up12,0.5), JSON.stringify(r));
  ok_(`${V} ループの戻り先もピッチでずれない`, near(r.loopStart,0.52), JSON.stringify(r));
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function editTools(){
  // v0.3.160：EDIT 中のドラッグ＝パッド入れ替え（P-LOCK を選んだままでも EDIT が先）／EDIT 画面の DELETE（2 回押す・↩ で戻せる）
  const V='EDITTOOLS 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); });
  const ctr=k=>p.evaluate(k=>{ const b=document.querySelectorAll('#pads .pad')[k].getBoundingClientRect(); return [b.left+b.width/2,b.top+b.height/2]; },k);
  const before=await p.evaluate(()=>{ setActiveLock('delay'); arm('edit',true); tracks[8].delaySend=0.23;tracks[12].delaySend=0.71;return {a:tracks[8].name, b:tracks[12].name, d8:tracks[8].delaySend,d12:tracks[12].delaySend, lock:activeLock}; });
  const a=await ctr(8), b=await ctr(12);
  await p.mouse.move(a[0],a[1]); await p.mouse.down(); await p.mouse.move(b[0],b[1],{steps:8}); await p.mouse.up(); await p.waitForTimeout(150);
  const after=await p.evaluate(()=>({a:tracks[8].name, b:tracks[12].name, d8:tracks[8].delaySend,d12:tracks[12].delaySend, msg:sampNameEl.textContent}));
  ok_(`${V} P-LOCK（DELAY）を選んだまま EDIT でドラッグ＝パッドの入れ替え（送り量は動かない）`, before.lock==='delay' && after.a===before.b && after.b===before.a && after.d8===before.d12 && after.d12===before.d8 && /MOVE 09/.test(after.msg), JSON.stringify({before,after}));
  await p.evaluate(()=>{ setActiveLock('delay'); arm('edit',false); doUndo(); });
  // DELETE：1 回目は「もう一度」、2 回目で空のパッドに。↩ で戻る
  const nm0=await p.evaluate(()=>{ selectPad(0); openPadEdit(0); return tracks[0].name; });
  await p.waitForTimeout(500);   // 開いた直後 450ms のゴーストクリック除け
  await p.click('#peDel'); await p.waitForTimeout(80);
  const d1=await p.evaluate(()=>({buf:!!tracks[0].buffer, armed:document.getElementById('peDel').classList.contains('armed'), msg:sampNameEl.textContent}));
  await p.click('#peDel'); await p.waitForTimeout(150);
  const d2=await p.evaluate(()=>({buf:!!tracks[0].buffer, type:PADS[0].type, name:tracks[0].name, steps:tracks[0].patterns.flat(2).filter(Boolean).length, padName:document.querySelector('#pads .pad[data-i="0"] .nm').textContent, msg:sampNameEl.textContent}));
  const d3=await p.evaluate(()=>{ doUndo(); return {buf:!!tracks[0].buffer, name:tracks[0].name, type:PADS[0].type}; });
  ok_(`${V} EDIT 画面の DELETE：1 回目は確認だけ・2 回目で空のパッド（打ち込みは残る）・↩ で戻る`, d1.buf && d1.armed && /もう一度/.test(d1.msg) && !d2.buf && d2.type==='empty' && d2.name==='PAD 1' && /DELETE/.test(d2.msg) && d3.buf && d3.name===nm0 && d3.type!=='empty', JSON.stringify({d1,d2,d3}));
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function peCueTest(){
  // v0.3.160：EDIT の試聴カーソル。波形をタップ／ドラッグした位置から PREVIEW（END まで）。鳴っている最中に動かすとそこから鳴らし直す
  const V='PECUE 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await AC.resume(); const n=AC.sampleRate*4, b=AC.createBuffer(1,n,AC.sampleRate), d=b.getChannelData(0); for(let k=0;k<n;k++) d[k]=Math.sin(k*0.05)*0.3;
    const t=tracks[0]; t.buffer=b; t.rawBuffer=b; t.start=0; t.end=1; t.loop=false; PADS[0].type='sample'; selectPad(0); openPadEdit(0); });
  await p.waitForTimeout(700);   // 開いた直後 450ms はゴーストクリック除けでタップを飲む（仕様）。CI は遅いので余裕を持つ
  const box=await p.evaluate(()=>{ const r=document.getElementById('peWave').parentElement.getBoundingClientRect(); return {x:r.left,y:r.top,w:r.width,h:r.height}; });
  const at=f=>[box.x+box.w*f, box.y+box.h*0.6];
  const ph=()=>p.evaluate(()=>{ const ph=document.getElementById('pePlayhead'), w=document.getElementById('peWave').parentElement.clientWidth; return {pos:parseFloat(ph.style.left||'0')/w, on:ph.style.opacity==='1', voices:tracks[0].activeVoices.length}; });
  let c=at(0.7); await p.mouse.click(c[0],c[1]); await p.waitForTimeout(100);
  const a=await p.evaluate(()=>({cue:peCue, from:peCueFrom(), show:document.getElementById('peCue').classList.contains('show'), start:tracks[0].start, undo:undoStack.length}));
  ok_(`${V} 波形の何もない所をタップ＝そこに試聴カーソル（START は動かない）`, Math.abs(a.cue-0.7)<0.02 && Math.abs(a.from-0.7)<0.02 && a.show && a.start===0, JSON.stringify(a));
  await p.click('#peAudition'); await p.waitForTimeout(250);
  const b=await ph();
  ok_(`${V} PREVIEW はカーソルから鳴る（再生位置が 70% 付近から進む）`, b.voices>0 && b.on && b.pos>0.69 && b.pos<0.8, JSON.stringify(b));
  c=at(0.7); const c2=at(0.3); await p.mouse.move(c[0],c[1]); await p.mouse.down(); await p.mouse.move(c2[0],c2[1],{steps:5}); await p.mouse.up(); await p.waitForTimeout(250);
  const d=await ph(); const dc=await p.evaluate(()=>peCue);
  ok_(`${V} 鳴っている最中にカーソルをドラッグ＝そこから鳴らし直す（30% 付近）`, Math.abs(dc-0.3)<0.03 && d.voices>0 && d.pos>0.29 && d.pos<0.4, JSON.stringify({dc,d}));
  await p.waitForTimeout(3200);
  const e=await ph();
  ok_(`${V} END で止まる`, e.voices===0, JSON.stringify(e));
  await p.evaluate(()=>{ tracks[0].start=0.5; renderPeWave(0); });
  c=at(0.2); await p.mouse.click(c[0],c[1]); await p.waitForTimeout(80);
  await p.click('#peAudition'); await p.waitForTimeout(200);
  const f=await ph(); const ff=await p.evaluate(()=>peCueFrom());
  ok_(`${V} START より前にカーソル＝START から鳴る`, ff===null && f.pos>0.49 && f.pos<0.6, JSON.stringify({ff,f}));
  const g=await p.evaluate(async()=>{ const raf=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    stopAllVoices(AC.currentTime); tracks[1].buffer=tracks[0].buffer; tracks[1].start=0; tracks[1].end=1; PADS[1].type='sample'; openPadEdit(1); await raf(); const c1=peCue; openPadEdit(0); await raf(); return {other:c1, back:peCue}; });
  ok_(`${V} パッドを替えるとカーソルは消える`, g.other===null && g.back===null, JSON.stringify(g));
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function setKeys(){
  // v0.3.159：SET のパッドをキーボード（1-8 / Q-I）と MIDI（C4〜D#5）から。押す＝鳴る／離す＝止まる／1 拍でホールド／押しながら ↑ ↓ ＝音量
  const V='SETKEYS 1280x800';
  const ctx=await br.newContext({viewport:{width:1280,height:800}}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); setSlots[0].bpm=60; setSlots[1].bpm=60; setSlots[2].bpm=240; document.activeElement&&document.activeElement.blur&&document.activeElement.blur(); });
  const st=()=>p.evaluate(()=>({mode:setMode, cur:setCur, playing, sides:[...sidePlayers.keys()].join(), held:[0,1,2].filter(k=>isSetHeld(k)).join(), lv0:setLevels[0]}));
  await p.keyboard.press('Tab'); await p.keyboard.press('Tab'); await p.waitForTimeout(150);
  const t0=await st();
  ok_(`${V} TAB で PADS → SEQ → SET`, t0.mode===true, JSON.stringify(t0));
  await p.keyboard.down('2'); await p.waitForTimeout(150); const a1=await st();
  await p.keyboard.up('2'); await p.waitForTimeout(120); const a2=await st();
  ok_(`${V} キー 2 を押す＝SET 02 が鳴る／離す＝止まる`, a1.cur===1 && a1.playing && a2.cur===1 && !a2.playing, JSON.stringify({a1,a2}));
  await p.keyboard.down('3'); await p.waitForTimeout(500); await p.keyboard.up('3'); await p.waitForTimeout(120); const b1=await st();
  ok_(`${V} キー 3 を 1 拍押し続ける＝ホールド（離しても鳴る）`, b1.cur===2 && b1.playing && b1.held==='2', JSON.stringify(b1));
  await p.keyboard.down('1'); await p.waitForTimeout(100);
  for(let n=0;n<3;n++){ await p.keyboard.press('ArrowDown'); }
  await p.waitForTimeout(60); const c1=await st();
  await p.keyboard.up('1'); await p.waitForTimeout(120); const c2=await st();
  ok_(`${V} ホールド中にキー 1 ＝ 2 つ鳴る／押しながら ↓ 3 回で -3 dB／離すと SET 01 だけ止まる`, c1.cur===0 && c1.playing && c1.sides==='2' && c1.lv0===-3 && !c2.playing && c2.sides==='2' && c2.lv0===-3, JSON.stringify({c1,c2}));
  await p.keyboard.down('3'); await p.waitForTimeout(100); const d0=await st(); await p.keyboard.up('3'); await p.waitForTimeout(120); const d1=await st();
  ok_(`${V} ホールド中のキー 3 は押した瞬間には止まらず、離すと止まる`, d0.sides==='2' && d1.sides==='' && d1.held==='', JSON.stringify({d0,d1}));
  await p.keyboard.down('2'); await p.waitForTimeout(100); await p.evaluate(()=>window.dispatchEvent(new Event('blur'))); await p.waitForTimeout(100); const e1=await st(); await p.keyboard.up('2');
  ok_(`${V} キーを押したまま窓を離れたら放す（鳴りっぱなしにしない）`, !e1.playing && e1.sides==='', JSON.stringify(e1));
  const m=await p.evaluate(async()=>{ midiEnabled=true; handleMIDI([0x90,62,100]); await new Promise(r=>setTimeout(r,120)); const on={cur:setCur, playing};
    handleMIDI([0x80,62,0]); await new Promise(r=>setTimeout(r,100)); const off={playing};
    handleMIDI([0x90,61,100]); await new Promise(r=>setTimeout(r,80)); handleMIDI([0x90,61,0]); await new Promise(r=>setTimeout(r,100)); const off2={cur:setCur, playing}; midiEnabled=false; return {on,off,off2}; });
  ok_(`${V} MIDI：D4 で SET 03 が鳴り、ノートオフで止まる（ベロシティ 0 のノートオンも）`, m.on.cur===2 && m.on.playing && !m.off.playing && m.off2.cur===1 && !m.off2.playing, JSON.stringify(m));
  await p.keyboard.press('Tab'); await p.waitForTimeout(120);
  ok_(`${V} SET で TAB ＝ PADS に戻る`, await p.evaluate(()=>!setMode && document.getElementById('viewPads').classList.contains('active')), 'still set');
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function splashAnim(){
  // v0.3.158：起動画面のアニメーション（16 セット → 拡大 → 16 パッド → A B C D）。メニューで OFF（次の起動から）
  const V='SPLASH 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await p.waitForTimeout(300);
  const a=await p.evaluate(()=>({host:!!document.getElementById('splashAnim'), cells:document.querySelectorAll('#splashAnim .sa-cell').length, pads:document.querySelectorAll('#splashAnim .sa-pad').length, keys:document.querySelectorAll('#splashAnim .sa-keys i').length, toggle:document.getElementById('splashAnimToggle').classList.contains('on')}));
  ok_(`${V} 起動画面に 16 セット・16 パッド・A B C D のアニメーション（既定 ON）`, a.host && a.cells===16 && a.pads===16 && a.keys===4 && a.toggle, JSON.stringify(a));
  await p.waitForFunction(()=>document.querySelector('#splashAnim .sa-pads.show') && document.querySelector('#splashAnim .sa-keys i.on'), null, {timeout:6000});
  const b=await p.evaluate(()=>({cap:document.querySelector('#splashAnim .sa-cap').textContent, key:[...document.querySelectorAll('#splashAnim .sa-keys i')].findIndex(i=>i.classList.contains('on')), zoom:document.querySelector('#splashAnim .sa-sets').classList.contains('zoom'), picked:document.querySelectorAll('#splashAnim .sa-cell.pick').length}));
  ok_(`${V} 1 つのセットが拡大して 16 パッドに → シーケンス A から鳴る`, /^SEQ [ABCD]$/.test(b.cap) && b.key>=0 && b.zoom && b.picked===1, JSON.stringify(b));
  // メニューで OFF → 次の起動から出ない
  await p.evaluate(()=>document.getElementById('splashAnimToggle').click());
  const off=await p.evaluate(()=>({on:document.getElementById('splashAnimToggle').classList.contains('on'), ls:localStorage.getItem('mics-splash-anim')}));
  await p.reload({waitUntil:'load'}); await p.waitForTimeout(300);
  const c=await p.evaluate(()=>({host:!!document.getElementById('splashAnim'), toggle:document.getElementById('splashAnimToggle').classList.contains('on')}));
  ok_(`${V} メニューの「起動アニメーション」で OFF → 次の起動から出ない（スイッチも OFF のまま）`, !off.on && off.ls==='0' && !c.host && !c.toggle, JSON.stringify({off,c}));
  await p.evaluate(()=>localStorage.removeItem('mics-splash-anim'));
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function patFx(){
  // v0.3.150：エフェクト（DELAY / REVERB の送り・FILTER 種類 / カットオフ / レゾ）も A B C D ごと
  const V='PATFX 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); });
  const r1=await p.evaluate(()=>{ selectPad(8); setEditPat(0); const t=tracks[8]; t.delaySend=0.5; t.reverbSend=0.3; paintPerf();
    setEditPat(1); const b={d:t.delaySend, r:t.reverbSend, f:t.filter}; t.filter='lp'; t.cutoff=2000; t.reso=4;
    setEditPat(0); const win=document.querySelector('.cl-par[data-p="delay"] b'); return {b, a:{d:t.delaySend, r:t.reverbSend, f:t.filter, c:t.cutoff}, win:win?win.textContent:null}; });
  ok_(`${V} A の DELAY / REVERB は B に出ない／B の FILTER は A に戻ると外れる／窓の値も A のもの`, r1.b.d===0 && r1.b.r===0 && r1.b.f==='off' && r1.a.d===0.5 && r1.a.r===0.3 && r1.a.f==='off' && r1.a.c===12000 && r1.win==='50', JSON.stringify(r1));
  const r2=await p.evaluate(()=>{ copyPattern(1,3); setEditPat(3); const t=tracks[8]; const c={f:t.filter, c:t.cutoff, q:t.reso}; setEditPat(0);
    copyPadSound(8,7); const t7=tracks[7]; const a7={d:t7.delaySend}; setEditPat(1); const b7={f:t7.filter, c:t7.cutoff}; setEditPat(0); return {c, a7, b7}; });
  ok_(`${V} パターンの COPY（B→D）でエフェクトも写る／パッドの COPY は A B C D 4 つとも写す`, r2.c.f==='lp' && r2.c.c===2000 && r2.c.q===4 && r2.a7.d===0.5 && r2.b7.f==='lp' && r2.b7.c===2000, JSON.stringify(r2));
  await p.evaluate(()=>{ applyBpm(240); for(const q of [0,1]) tracks[8].patterns[q][0][0]=1; setEditPat(0); document.getElementById('play').click(); });
  await p.waitForTimeout(200);
  const pa=await p.evaluate(()=>({pp:playPat, d:tracks[8].delaySend, f:tracks[8].filter}));
  await p.evaluate(()=>setEditPat(1));
  await p.waitForFunction(()=>playPat===1, null, {timeout:5000}); await p.waitForTimeout(100);
  const pb=await p.evaluate(()=>({pp:playPat, d:tracks[8].delaySend, f:tracks[8].filter, c:tracks[8].cutoff}));
  ok_(`${V} 再生中は小節頭で B のエフェクトに切り替わる`, pa.pp===0 && pa.d===0.5 && pa.f==='off' && pb.pp===1 && pb.d===0 && pb.f==='lp' && pb.c===2000, JSON.stringify({pa,pb}));
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
  const rt=await p.evaluate(async()=>{ setEditPat(0); const f=JSON.parse(JSON.stringify(buildProject())); const fx=f.sets[f.cur].tracks[8].patFx; await applyProject(f);
    const a={d:tracks[8].delaySend, f:tracks[8].filter}; setEditPat(1); const b={d:tracks[8].delaySend, f:tracks[8].filter, c:tracks[8].cutoff}; setEditPat(0);
    return {fx0:fx&&fx[0].delaySend, fx1:fx&&fx[1].filter, a, b}; });
  ok_(`${V} .mics に A B C D ごとのエフェクトが入り、読み込むと戻る`, rt.fx0===0.5 && rt.fx1==='lp' && rt.a.d===0.5 && rt.a.f==='off' && rt.b.d===0 && rt.b.f==='lp' && rt.b.c===2000, JSON.stringify(rt));
  const old=await p.evaluate(async()=>{ const f=JSON.parse(JSON.stringify(buildProject())); f.sets[f.cur].tracks.forEach(x=>{ delete x.patFx; }); f.sets[f.cur].tracks[10].reverbSend=0.4;
    await applyProject(f); const r=[]; for(let q=0;q<4;q++){ setEditPat(q); r.push(tracks[10].reverbSend); } setEditPat(0); return r; });
  ok_(`${V} エフェクトを A B C D で持たない古いファイルは、全パターンに同じ値`, old.join()==='0.4,0.4,0.4,0.4', JSON.stringify(old));
  const un=await p.evaluate(()=>{ setEditPat(0); pushUndo(); tracks[10].reverbSend=0.9; setEditPat(1); setEditPat(0); const before=tracks[10].reverbSend; doUndo(); return {before, after:tracks[10].reverbSend}; });
  ok_(`${V} undo でエフェクトも戻る`, un.before===0.9 && un.after===0.4, JSON.stringify(un));
  const pl=await p.evaluate(()=>{setEditPat(0);tracks[8].delaySend=0.6;setEditPat(1);tracks[8].delaySend=0.1;setEditPat(0);fxModalOpen('delay');const a=tracks[8].delaySend;setEditPat(1);fxmPaint();const b=tracks[8].delaySend;fxModalClose();setEditPat(0);return [a,b,tracks[8].delaySend,activeLock];});
  eq(`${V} FX編集とA/Bの現在値は独立・ロック選択なし`,pl,[0.6,0.1,0.6,null]);
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
async function patMute(){
  // v0.3.149：ミュート / ソロは A B C D ごと（セットではない）
  const V='PATMUTE 390x844';
  const ctx=await br.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true}); await unlock(ctx);
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await ready(p);
  await p.evaluate(async()=>{ await clearAutosave(); });
  const r1=await p.evaluate(()=>{ setEditPat(0); arm('mute',true); assignMS(8); arm('mute',false); const a8=tracks[8].mute;
    setEditPat(1); const b8=tracks[8].mute; arm('mute',true); assignMS(9); arm('mute',false); const b9=tracks[9].mute;
    setEditPat(0); return {a8, b8, b9, back8:tracks[8].mute, back9:tracks[9].mute, padMuted:document.querySelector('#pads .pad[data-i="8"]').classList.contains('muted'), pad9:document.querySelector('#pads .pad[data-i="9"]').classList.contains('muted')}; });
  ok_(`${V} A でミュートした 9 番は B では鳴る／B のミュート（10 番）は A に戻ると外れる／パッドの印も追従`, r1.a8 && !r1.b8 && r1.b9 && r1.back8 && !r1.back9 && r1.padMuted && !r1.pad9, JSON.stringify(r1));
  const r2=await p.evaluate(()=>{ setEditPat(2); const c0=tracks[8].mute; copyPattern(0,2); const c1=tracks[8].mute, c9=tracks[9].mute; setEditPat(0); return {c0,c1,c9}; });
  ok_(`${V} パターンの COPY（A→C）でミュートも写る`, !r2.c0 && r2.c1 && !r2.c9, JSON.stringify(r2));
  // 再生中：小節頭で A→B に切り替わると B のミュートで鳴る
  await p.evaluate(()=>{ applyBpm(240); for(const q of [0,1]){ tracks[8].patterns[q][0][0]=1; tracks[9].patterns[q][0][0]=1; } setEditPat(0); document.getElementById('play').click(); });
  await p.waitForTimeout(200);
  const pa=await p.evaluate(()=>({pp:playPat, m8:tracks[8].mute, m9:tracks[9].mute}));
  await p.evaluate(()=>setEditPat(1));
  const mid=await p.evaluate(()=>({pp:playPat, m8:tracks[8].mute}));
  await p.waitForFunction(()=>playPat===1, null, {timeout:5000}); await p.waitForTimeout(400);
  const pb=await p.evaluate(()=>({pp:playPat, m8:tracks[8].mute, m9:tracks[9].mute, pad9:document.querySelector('#pads .pad[data-i="9"]').classList.contains('muted'), pad8:document.querySelector('#pads .pad[data-i="8"]').classList.contains('muted')}));
  ok_(`${V} 再生中は鳴っているパターンのミュート（B を押しても小節頭までは A のまま）→ 小節頭で B のミュートに・印も`, pa.pp===0 && pa.m8 && !pa.m9 && mid.pp===0 && mid.m8 && pb.pp===1 && !pb.m8 && pb.m9 && pb.pad9 && !pb.pad8, JSON.stringify({pa,mid,pb}));
  await p.evaluate(()=>document.getElementById('play').click()); await p.waitForTimeout(150);
  // 保存 → 読込で A B C D のミュートが戻る
  const rt=await p.evaluate(async()=>{ setEditPat(0); const f=JSON.parse(JSON.stringify(buildProject())); const t8=f.sets[f.cur].tracks[8]; await applyProject(f);
    const a8=tracks[8].mute; setEditPat(1); const b9=tracks[9].mute, b8=tracks[8].mute; setEditPat(0); return {mutes:t8.mutes, a8, b9, b8, s2:setSlots[1].tracks[8].mutes.join()}; });
  ok_(`${V} .mics に A B C D ごとのミュートが入り、読み込むと戻る／他のセットは別（既定はミュート無し）`, JSON.stringify(rt.mutes)==='[true,false,true,false]' && rt.a8 && rt.b9 && !rt.b8 && rt.s2==='false,false,false,false', JSON.stringify(rt));
  // それより前のファイル（mutes が無い）は全パターン同じミュート
  const old=await p.evaluate(async()=>{ const f=JSON.parse(JSON.stringify(buildProject())); f.sets[f.cur].tracks.forEach(x=>{ delete x.mutes; delete x.solos; }); f.sets[f.cur].tracks[10].mute=true;
    await applyProject(f); const r=[]; for(let q=0;q<4;q++){ setEditPat(q); r.push(tracks[10].mute); } setEditPat(0); return r; });
  ok_(`${V} ミュートを A B C D で持たない古いファイルは、全パターンに同じミュート`, old.join()==='true,true,true,true', JSON.stringify(old));
  await p.evaluate(async()=>{ await clearAutosave(); });
  eq(`${V} 0 errors`, errs, []);
  await ctx.close();
}
await checkPadContents({br,PORT,ready,unlock,eq,ok_});
await passGate();
await copyPaint();
await devShell();
await setMode();
await patMute();
await patFx();
await splashAnim();
await setKeys();
await peCueTest();
await editTools();
await barHoldTest();
await patSwitchEnd();
await fxKeep();
await longPitch();
await saveScopeTest();
await wireSkin();
await setNameTest();
await renameFlow();
await plockKeeps();
await iosLoad();
await previewIsolated();
await latency();
const res=[];
for(const [w,h,m] of [[390,844,true],[390,664,true],[520,900,true],[700,900,false],[960,1040,false],[1024,768,false],[1280,800,false]]) res.push(await run(w,h,m));
await br.close();
res.forEach(r=>console.log(`${r.V}  パッド${r.dim.pad}px 窓${r.dim.scr}px`));
console.log(`モーダルの中身: [${res[0].md.join(' ')}]`);
console.log(fail.length? "\n❌ 失敗 "+fail.length+"件\n  "+fail.join("\n  ") : "\n✅ 全項目パス");
process.exit(fail.length?1:0);
