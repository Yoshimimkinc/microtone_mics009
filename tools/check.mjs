// MICS009 回帰チェック（Playwright）
//   起動:  npx http-server -p 8137 .    （または python3 -m http.server 8137）
//   実行:  node tools/check.mjs [port]
//   環境変数: SHOT=出力先ディレクトリ（既定 ./tools/_shots）
// 環境ごとに違うのは chromium の場所だけ。PW_EXE で上書きできる。
import { chromium } from './pw.mjs';
const PORT=process.argv[2]||8137;
const SHOT=process.env.SHOT||'./tools/_shots';
await (await import('node:fs/promises')).mkdir(SHOT,{recursive:true});
const br=await chromium.launch({...(process.env.PW_EXE?{executablePath:process.env.PW_EXE}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const fail=[];
const eq=(label,got,want)=>{ const ok=JSON.stringify(got)===JSON.stringify(want); if(!ok) fail.push(`${label}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`); return ok; };
const ok_=(label,cond,info)=>{ if(!cond) fail.push(`${label}: ${info}`); };

async function run(w,h,mobile){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile});
  const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
  await p.waitForTimeout(1800);
  await p.evaluate(()=>{document.getElementById('splash').style.display='none';});
  await p.mouse.move(5,5); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600); // 450msの入力シールドを消化
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
  for(const id of['main','smpl','tone','fx','asgn']){ eq(`${V} ページ切替 ${id}`, await page(id), id);
    fields[id]=await p.$$eval('#clPage .cl-par',e=>e.map(x=>x.dataset.p)); }
  eq(`${V} MAIN欄`,fields.main,['pitch','scale','level']);
  eq(`${V} SAMPLE欄`,fields.smpl,['start','end','loop']);
  eq(`${V} TONE欄`,fields.tone,['filter','cutoff','reso','attack','fade']);
  eq(`${V} FX欄`,fields.fx,['delay','reverb']);
  eq(`${V} ASSIGN欄`,fields.asgn,['choke','out','midi','key']);

  // 2b) ★ページを移しても寸法が1pxも動かない（幅も高さも／窓・メニュー・キー・パッド）
  //    このクラスの不具合を何度も出しているので、ここで丸ごと止める
  const geo=[];
  for(const id of['main','smpl','tone','fx','asgn']){ await page(id);
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
  await page('fx'); await drag('.cl-par[data-p="delay"]',80);
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

  // 7) モーダルは「入り組んだ設定」だけ
  await p.click('#clWave'); await p.waitForTimeout(400);
  eq(`${V} モーダル中の波形`, await where(), 'peWaveHome');
  const md=await p.evaluate(()=>{const m=document.getElementById('padEditModal');
    return {disp:getComputedStyle(m).display, ranges:m.querySelectorAll('input[type=range]').length,
            selects:m.querySelectorAll('select').length,
            btns:[...m.querySelectorAll('button,.loadbtn')].map(b=>(b.id||b.textContent.trim()).slice(0,12))};});
  eq(`${V} モーダルにノブ/セレクトが無い`, [md.ranges,md.selects], [0,0]);
  ok_(`${V} モーダルは表示できる`, md.disp==='flex', md.disp);
  await p.click('#peClose'); await p.waitForTimeout(400);
  eq(`${V} 閉じたら窓へ戻る`, await where(), 'clWaveSlot');

  // 8) 既存機能が生きている
  const misc=await p.evaluate(()=>{
    const r={};
    try{ document.getElementById('modeSeq').click(); r.seq='ok'; document.getElementById('modePads').click(); }catch(e){ r.seq=String(e); }
    document.body.classList.add('step-on');
    r.grid=Math.round(document.getElementById('gridCtrls').getBoundingClientRect().width)>0;
    document.body.classList.remove('step-on');
    const v0=tracks[selected].tune; pushUndo(); tracks[selected].tune=7; doUndo(); r.undo=tracks[selected].tune===v0;
    return r;
  });
  ok_(`${V} SEQ往復`, misc.seq==='ok', misc.seq);
  ok_(`${V} UNDO`, misc.undo===true, 'undoで戻らない');

  // 9) 寸法
  const dim=await p.evaluate(()=>{const pd=document.querySelector('#pads .pad').getBoundingClientRect();
    return {pad:Math.round(pd.height), scr:Math.round(document.querySelector('.perf-screen').getBoundingClientRect().height),
            docH:document.documentElement.scrollHeight, winH:innerHeight};});
  ok_(`${V} 縦スクロールなし`, dim.docH<=dim.winH+1, `${dim.docH}>${dim.winH}`);
  ok_(`${V} パッド高`, dim.pad>=60, `${dim.pad}px`);
  eq(`${V} 0 errors`, errs, []);
  await p.screenshot({path:`${SHOT}/shot-${w}.png`});
  await ctx.close();
  return {V, dim, md:md.btns};
}
const res=[];
for(const [w,h,m] of [[390,844,true],[520,900,true],[700,900,false],[1024,768,false],[1280,800,false]]) res.push(await run(w,h,m));
await br.close();
res.forEach(r=>console.log(`${r.V}  パッド${r.dim.pad}px 窓${r.dim.scr}px`));
console.log(`モーダルの中身: [${res[0].md.join(' ')}]`);
console.log(fail.length? "\n❌ 失敗 "+fail.length+"件\n  "+fail.join("\n  ") : "\n✅ 全項目パス");
process.exit(fail.length?1:0);
