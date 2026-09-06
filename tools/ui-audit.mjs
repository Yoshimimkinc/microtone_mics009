// 楽器UIの基準値を実測する監査。docs/ui-rules.md の数字はこれで出す。
//   node tools/ui-audit.mjs [port]
// 落ちない（レポート専用）。合否判定は check.mjs 側で行う。
import { chromium } from './pw.mjs';
const PORT=process.argv[2]||8137;
const br=await chromium.launch({...(process.env.PW_EXE?{executablePath:process.env.PW_EXE}:{}),
  args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});

const AUDIT=()=>{
  const vis=e=>{const r=e.getBoundingClientRect(); const c=getComputedStyle(e);
    return r.width>0&&r.height>0&&c.visibility!=='hidden'&&c.display!=='none'&&+c.opacity>0.05;};
  // 色は [r,g,b,a] に正規化して「重ねて」から測る。
  // 半透明の背景や opacity を無視すると、実際は読める文字を 1:1 と誤判定する（測定器側の罠）
  // Chromeは color(srgb 0.25 0.66 0.35) 形式も返す（0-1）。これを255系と読むと真っ黒になる
  const rgba=c=>{
    if(!c) return [0,0,0,0];
    if(/^#/.test(c)){ const h=c.slice(1); const n=h.length===3? h.split('').map(x=>parseInt(x+x,16)):[0,2,4].map(i=>parseInt(h.substr(i,2),16));
      return [n[0],n[1],n[2],1]; }
    const srgb=/color\(\s*srgb/.test(c);
    const m=c.match(/[\d.]+/g); if(!m) return [0,0,0,0];
    const k=srgb?255:1;
    return [+m[0]*k,+m[1]*k,+m[2]*k, m.length>3?+m[3]:1];};
  // 背景がグラデーション（background-image）のときは、その最初の色を不透明な層として使う
  const bgLayer=n=>{const c=getComputedStyle(n); const col=rgba(c.backgroundColor);
    if(col[3]>=1) return col;
    const img=c.backgroundImage;
    if(img&&img!=='none'){
      // グラデーションは「色味レイヤー」が先頭に来ることがある（alpha 0.09 など）。
      // それを不透明と見なすと、実際は読める文字を低コントラストと誤判定する。
      // 十分に濃い色（alpha>=0.5）だけを地の色として採用する。
      const all=img.match(/(?:rgba?\([^)]*\)|color\(srgb[^)]*\)|#[0-9a-fA-F]{3,8})/g)||[];
      for(const t of all){ const g=rgba(t); if(g[3]>=0.5) return [g[0],g[1],g[2],1]; } }
    return col;};
  const over=(f,b)=>{const a=f[3]; return [f[0]*a+b[0]*(1-a), f[1]*a+b[1]*(1-a), f[2]*a+b[2]*(1-a), 1];};
  const lum=c=>{const f=[0,1,2].map(i=>{let v=c[i]/255;
    return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);});
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2];};
  // 祖先をたどって背景を実際に合成する（不透明に達したら終わり）
  const bgOf=e=>{const stack=[]; let n=e;
    while(n&&n!==document.documentElement){ const c=bgLayer(n);
      if(c[3]>0) stack.push(c); if(c[3]>=1) break; n=n.parentElement; }
    let out=[255,255,255,1];
    for(let i=stack.length-1;i>=0;i--) out=over(stack[i],out);
    return out;};
  // opacity は祖先ぶんも掛かる（.cl-key の opacity:.5 など）
  const opac=e=>{let o=1,n=e; while(n&&n!==document.documentElement){o*=+getComputedStyle(n).opacity; n=n.parentElement;} return o;};
  const ratioOf=e=>{const bg=bgOf(e); const c=rgba(getComputedStyle(e).color); c[3]*=opac(e);
    const fg=over(c,bg); const L1=lum(fg),L2=lum(bg);
    return +(((Math.max(L1,L2)+0.05)/(Math.min(L1,L2)+0.05))).toFixed(2);};

  // 1) 文字の大きさ（見えていて文字を持つ要素）
  const texts=[...document.querySelectorAll('body *')].filter(e=>vis(e)
    && [...e.childNodes].some(n=>n.nodeType===3 && n.textContent.trim()));
  // 役割で基準が違う。値＝読めないと演奏できない / ラベル＝場所を示すだけ / 装飾＝雰囲気
  const roleOf=e=>{const c=String(e.className||''); const px=parseFloat(getComputedStyle(e).fontSize);
    // 装飾の判定を先に。<b> を無条件に値とすると、ロゴの micro<b>tone</b> まで値になる
    if(/brand|model|cap|hint/.test(c)) return 'deco';
    if(e.closest('.logo,.s-logo,.model,.cl-brand')) return 'deco';
    if(/cl-num|\bv\b|nm|readout/.test(c)||e.tagName==='B'||px>=13) return 'value';
    return 'label';};
  const fonts=texts.map(e=>({sel:(e.tagName+(e.id?'#'+e.id:'')+(e.className&&typeof e.className==='string'?'.'+e.className.split(' ')[0]:'')),
    px:Math.round(parseFloat(getComputedStyle(e).fontSize)*10)/10,
    cr:ratioOf(e), role:roleOf(e), t:e.textContent.trim().slice(0,14)}));

  // 2) 触れる要素の大きさ
  const PLAY='.pad,.cl-key,.cl-par,.msbtn,.modebtn,.loadbtn,.perf-plkbtn,.transport .t,#play,#rec,#undoBtn,#menuBtn';
  const hit=[...document.querySelectorAll('button,.cl-par,.pad,.loadbtn,.cl-key,.modebtn,.msbtn,.step,.stepbtn,select,input[type=range],.toggle,.handle,.perf-plkbtn')]
    .filter(vis).map(e=>{const r=e.getBoundingClientRect();
      return {sel:(e.id?'#'+e.id:e.tagName+'.'+String(e.className).split(' ')[0]),
        play:e.matches(PLAY),
        w:Math.round(r.width),h:Math.round(r.height),cx:Math.round(r.x+r.width/2),cy:Math.round(r.y+r.height/2)};});

  // 3) 常時動いているもの（点滅/アニメ）
  const anim=[...document.querySelectorAll('body *')].filter(e=>vis(e)
    && getComputedStyle(e).animationName!=='none' && getComputedStyle(e).animationIterationCount==='infinite')
    .map(e=>(e.id?'#'+e.id:e.tagName+'.'+String(e.className).split(' ')[0]));

  // 4) 親指の届く範囲（画面下2/3・下端から）
  const H=innerHeight, W=innerWidth;
  const pads=[...document.querySelectorAll('#pads .pad')].filter(vis).map(e=>e.getBoundingClientRect());
  const reach=pads.length? Math.round(Math.min(...pads.map(r=>r.y))) : null;

  return {vp:[W,H], fonts, hit, anim, reach,
    padArea: pads.length? +(pads.reduce((a,r)=>a+r.width*r.height,0)/(W*H)*100).toFixed(1) : 0,
    screenArea: (()=>{const e=document.querySelector('.perf-screen'); if(!e) return 0;
      const r=e.getBoundingClientRect(); return +(r.width*r.height/(W*H)*100).toFixed(1);})()};
};

for(const [w,h,m] of [[390,844,true],[1280,800,false]]){
  const ctx=await br.newContext({viewport:{width:w,height:h},isMobile:m,hasTouch:m});
  const p=await ctx.newPage();
  await p.goto(`http://localhost:${PORT}/mics-609bc14b.html`,{waitUntil:'load'}); await p.waitForTimeout(1800);
  await p.evaluate(()=>{document.getElementById('splash').style.display='none';});
  await p.mouse.move(5,5); await p.mouse.down(); await p.mouse.up(); await p.waitForTimeout(600);
  const r=await p.evaluate(AUDIT);
  const NEED={value:4.5,label:3,deco:2}, MINPX={value:11,label:9,deco:8};
  const small=r.fonts.filter(f=>f.px<MINPX[f.role]).sort((a,b)=>a.px-b.px);
  const lowCR=r.fonts.filter(f=>f.cr<NEED[f.role]).sort((a,b)=>a.cr-b.cr);
  const badVal=lowCR.filter(f=>f.role==='value');
  const playSmall=r.hit.filter(t=>t.play && Math.min(t.w,t.h)<44).sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h));
  const subSmall =r.hit.filter(t=>!t.play && Math.min(t.w,t.h)<32);
  const tiny=r.hit.filter(t=>Math.min(t.w,t.h)<44); const under36=r.hit.filter(t=>Math.min(t.w,t.h)<36);
  console.log(`\n===== ${w}x${h} =====`);
  console.log(`文字     : ${r.fonts.length}個（値${r.fonts.filter(f=>f.role==='value').length}/ラベル${r.fonts.filter(f=>f.role==='label').length}/装飾${r.fonts.filter(f=>f.role==='deco').length}） 役割別の最小pxを下回る ${small.length}個`);
  if(small.length) console.log('           ' + small.slice(0,8).map(f=>`${f.px}px ${f.role} ${f.sel}"${f.t}"`).join(' | '));
  console.log(`コントラスト: 役割別の基準未満 ${lowCR.length}個（うち値 ${badVal.length}個）`);
  if(badVal.length) console.log('   値で不足: ' + badVal.slice(0,8).map(f=>`${f.cr} ${f.sel}"${f.t}"`).join(' | '));
  console.log(`触れる要素: ${r.hit.length}個 / 演奏系44px未満 ${playSmall.length}個 / 二次32px未満 ${subSmall.length}個`);
  if(playSmall.length) console.log('   演奏系  : ' + playSmall.slice(0,8).map(t=>`${t.w}x${t.h} ${t.sel}`).join(' | '));
  console.log(`常時アニメ: ${r.anim.length}個 ${r.anim.slice(0,5).join(' ')}`);
  console.log(`面積      : パッド ${r.padArea}% / 情報窓 ${r.screenArea}%   パッド上端 y=${r.reach}（画面の${Math.round(r.reach/h*100)}%）`);
  // ---- スコア（docs/ui-rules.md の定義）。減点法・下限0 ----
  const legibility=Math.max(0, 100 - badVal.length*6 - (lowCR.length-badVal.length)*1 - small.length*4);
  const touch=Math.max(0, 100 - playSmall.length*4 - subSmall.length*1);
  const quiet=Math.max(0, 100 - Math.max(0,r.anim.length-1)*20);
  const budget=Math.max(0, 100 - Math.max(0, 30-r.padArea)*2 - Math.max(0, r.screenArea-25)*2);
  console.log(`スコア    : 視認性 ${legibility} / 触れる ${touch} / 静けさ ${quiet} / 画面予算 ${budget}`);
  await ctx.close();
}
await br.close();
