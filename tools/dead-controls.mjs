// 「押しても何も起きないコントロール」を総当りで見つける。
//   node tools/dead-controls.mjs [port]
// ハンドラを消してしまった事故（v0.3.96のSEQ小節バグ）はこれで即座に出る。
// 判定：クリック前後で「DOMの中身＋主要な状態」が1つも変わらなければ“無反応”。
// 落ちない（レポート専用）。無反応でも正しいもの（同じページの再タップ等）は下の EXPECT で除外する。
import { chromium } from './pw.mjs';
const PORT=process.argv[2]||8137;

// 押しても状態が変わらないのが正しいもの（理由を必ず書く）
const EXPECT=new Set([
  '#modePads',      // すでにPADSに居るので変化なしが正しい
  '#menuClose','#peClose',   // 閉じるボタン（開いていない状態では何も起きない）
  '#loadProjBtn','#loadBtn','#peLoadBtn',  // ファイル選択ダイアログ＝DOMに出ない
  '#samp','#projFile',
  '#saveBtn','#exportWavBtn',              // ダウンロード＝DOMに出ない
  '#gtrBtn','#scrBtn',                     // 別ページを開く
  '#resetBtn',                             // confirm を出す（自動では承認しない）
  '#tap',                                  // タップテンポは2回以上で効く
  '#undoBtn',                              // Undoスタックが空なら何も起きない（別途 check.mjs でUndoは検査）
  '#modeSeq',                              // SEQ画面で再タップ＝変化なしが正しい（PADS側は #modePads）
  '#perfSpare',                            // 空きスロット（意図した無効ボタン）
]);
// 「すでに選択中（.on）」のものは再タップで変化しないのが正しい＝個別登録せず一律で除外
// 「押した後に元へ戻す」もの：状態を汚さないために押した直後に戻す
const REVERT={ '#play':()=>{ if(playing) document.getElementById('play').click(); } };

const br=await chromium.launch({...(process.env.PW_EXE?{executablePath:process.env.PW_EXE}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const ctx=await br.newContext({viewport:{width:1280,height:900}});
const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(String(e)));
await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'});
// 起動完了を状態で待つ（固定sleepは並列検査の負荷でフレークする）
await p.waitForFunction(()=>typeof tracks!=='undefined' && tracks[0] && tracks[0].buffer, null, {timeout:20000});
await p.evaluate(()=>{const s=document.getElementById('splash'); if(s) s.style.display='none';});
await p.mouse.move(5,5); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600);

const fingerprint=()=>p.evaluate(()=>{
  const st=[typeof editPat!=='undefined'?editPat:'', typeof editBar!=='undefined'?editBar:'',
    typeof selected!=='undefined'?selected:'', typeof playing!=='undefined'?playing:'',
    typeof armMode!=='undefined'?armMode:'', typeof clPage!=='undefined'?clPage:'',
    typeof bpmVal!=='undefined'?bpmVal:'', typeof swingPct!=='undefined'?swingPct:'',
    typeof activeLock!=='undefined'?activeLock:'', typeof copyArm!=='undefined'?JSON.stringify(copyArm):''].join('|');
  // クラス構成＋表示状態＋テキストの粗いハッシュ
  let h=0; const s=document.querySelector('.unit').outerHTML;
  for(let i=0;i<s.length;i+=7){ h=(h*31 + s.charCodeAt(i))|0; }
  return st+'#'+h+'#'+document.body.className;
});

// 要素は再描画で作り直されることがある（paintSteps 等）。目印を付けても消えるので、
// 「idを持つ祖先 ＋ 子番号」の安定したCSSパスを作って、クリックのたびに引き直す。
const targets=async()=>p.evaluate(()=>{
  const cssPath=e=>{ const parts=[]; let n=e;
    while(n && n!==document.body){
      if(n.id){ parts.unshift('#'+CSS.escape(n.id)); break; }
      const i=[...n.parentElement.children].indexOf(n)+1;
      parts.unshift(`${n.tagName.toLowerCase()}:nth-child(${i})`); n=n.parentElement; }
    return parts.join('>'); };
  const sel='button,.loadbtn,.cl-par,.cl-key,.pad,.vdot,.patbtn,.stepbtn,.perf-pat,.perf-bar,.perf-plkbtn,.step,.msbtn,.modebtn';
  return [...document.querySelectorAll(sel)].filter(e=>{
    const r=e.getBoundingClientRect(); const c=getComputedStyle(e);
    return r.width>2&&r.height>2&&c.display!=='none'&&c.visibility!=='hidden'&&+c.opacity>0.05;
  }).map(e=>({path:cssPath(e), on:e.classList.contains('on'),
    name:(e.id?'#'+e.id:e.tagName.toLowerCase()+'.'+String(e.className).split(' ')[0])
      +(e.dataset.p!==undefined?`[p=${e.dataset.p}]`:'')+(e.dataset.b!==undefined?`[b=${e.dataset.b}]`:'')
      +(e.dataset.pg!==undefined?`[pg=${e.dataset.pg}]`:''), txt:(e.textContent||'').trim().slice(0,10)}));
});

const dead=[];
for(const view of ['viewPads','viewSeq']){
  await p.evaluate(v=>{ document.getElementById(v==='viewSeq'?'modeSeq':'modePads').click(); }, view);
  await p.waitForTimeout(350);
  const list=await targets();
  for(const t of list){
    if(EXPECT.has(t.name.split('[')[0]) || t.on) continue;
    const before=await fingerprint();
    // 実クリック（pointerdown/up/click を伴う）。パッドやステップは pointer 系でしか反応しない
    let hit=true;
    try{ await p.click(t.path,{timeout:1500,force:true}); }catch(e){ hit=false; }
    if(!hit){ dead.push(`${view}  ${t.name}  "${t.txt}"  ←クリックできず（パス: ${t.path}）`); continue; }
    await p.waitForTimeout(90);
    const after=await fingerprint();
    if(before===after) dead.push(`${view}  ${t.name}  "${t.txt}"`);
    const key=t.name.split('[')[0]; if(REVERT[key]) await p.evaluate(REVERT[key]);
  }
}
console.log(`=== 押しても何も起きないコントロール ${dead.length}件 ===`);
dead.forEach(d=>console.log('   '+d));
console.log('\n※ 同じページの再タップなど「変化しないのが正しい」ものは EXPECT に理由つきで登録する。');
console.log('※ それ以外がここに出たら、ハンドラを消した／壊した疑い。');
if(errs.length){ console.log('\n=== ページエラー ==='); errs.slice(0,8).forEach(e=>console.log('   '+e)); }
await br.close();
process.exit(dead.length?1:0);
