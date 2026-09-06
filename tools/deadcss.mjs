// 使われていないCSSセレクタを「実行時に」洗い出す
//   実行:  node tools/deadcss.mjs [port] | node tools/deadcss-filter.mjs
// 単体で使うと「どの状態でも0要素だったセレクタ」を並べる。0件＝未使用とは限らないので、
// 必ず deadcss-filter.mjs（識別子がHTML/JSに実在するかの二次フィルタ）を通すこと。
// 使われていないCSSセレクタを「実行時に」洗い出す。使い方: node deadcss.mjs [port]
import { chromium, unlock } from './pw.mjs';
const PORT=process.argv[2]||8137;
const br=await chromium.launch({...(process.env.PW_EXE?{executablePath:process.env.PW_EXE}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
const hit={};
async function pass(w,h,mobile,setup){
 const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:mobile,hasTouch:mobile}); await unlock(ctx);
 const p=await ctx.newPage();
 await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'}); await p.waitForTimeout(1700);
 await p.evaluate(()=>{document.getElementById('splash').style.display='none';});
 if(setup){ try{ await p.evaluate(setup); }catch(e){ console.log('setup skip:',String(e).slice(0,80)); } }
 await p.waitForTimeout(150);
 const r=await p.evaluate(()=>{
   const out={};
   for(const sheet of document.styleSheets){
     let rules; try{ rules=sheet.cssRules; }catch(e){ continue; }
     const walk=rs=>{ for(const r of rs){
       // CSS Nesting対応で CSSStyleRule も空の cssRules を持つ＝selectorText を先に見る
       if(r.cssRules && r.cssRules.length) walk(r.cssRules);
       if(!r.selectorText) continue;
       for(const sel of r.selectorText.split(',')){
         const s2=sel.trim(); if(!s2) continue;
         const probe=s2.replace(/::?(before|after|first-line|first-letter|placeholder|-webkit-[\w-]+|-moz-[\w-]+|backdrop|marker|selection)/g,'')
                       .replace(/:(hover|active|focus|focus-visible|focus-within|visited|target|disabled|checked|valid|invalid|placeholder-shown)\b/g,'');
         let n=0; try{ n=document.querySelectorAll(probe).length; }catch(e){ n=-1; }
         out[s2]=Math.max(out[s2]||0,n);
       }
     }};
     walk(rules);
   }
   return out;
 });
 for(const [k,v] of Object.entries(r)) hit[k]=Math.max(hit[k]||0,v);
 await ctx.close();
}
const states=[ null,
 ()=>{document.body.classList.add('step-on');},
 ()=>{document.getElementById('modeSeq').click();},
 ()=>{openPadEdit(0);},
 ()=>{document.querySelector('#clKeys .cl-key[data-pg="smpl"]').click();},
 ()=>{document.querySelector('#clKeys .cl-key[data-pg="asgn"]').click();},
 ()=>{document.querySelector('#clKeys .cl-key[data-pg="tone"]').click();},
 ()=>{document.body.classList.add('perf');},
 ()=>{armMode='edit'; if(typeof paintPerf==='function')paintPerf(); document.body.classList.add('rec-on');},
];
for(const st of states){ await pass(390,844,true,st); await pass(1280,800,false,st); await pass(700,900,false,st); }
await br.close();
console.log(Object.entries(hit).filter(([k,v])=>v===0).map(([k])=>k).sort().join('\n'));
