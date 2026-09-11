// ---------- skin（AK / SP / RL）テーマ切替・選択を記憶 ----------
(function(){
  const seg=document.getElementById("themeSeg"), KEY="mics-skin";
  function apply(th){
    document.body.classList.remove("t-ak","t-sp","t-rl");
    document.body.classList.add("t-"+th);
    if(typeof drawAllPadWaves==="function") drawAllPadWaves();
    if(typeof buildAllTrackWaves==="function") buildAllTrackWaves();   // テーマ変更でink色が変わるので波形も再生成
    [...seg.children].forEach(b=>b.classList.toggle("on",b.dataset.th===th));
    try{ localStorage.setItem(KEY,th); }catch(e){}
  }
  seg.addEventListener("click",e=>{ const b=e.target.closest("button"); if(b) apply(b.dataset.th); });
  let saved="ak"; try{ saved=localStorage.getItem(KEY)||"ak"; }catch(e){}
  apply(saved);
})();

// ---------- バージョン確認（スプラッシュで新版があれば「タップで更新」表示） ----------
const APP_VERSION = "__APP_VERSION__";   // 軽微な修正ごとに +0.0.1（version.jsonと同値で更新）
(function(){
  const verEl=document.getElementById("splashVer"), upEl=document.getElementById("splashUpdate");
  if(verEl) verEl.textContent="v"+APP_VERSION;
  // 更新ボタンのタップはスプラッシュ起動に伝播させず、キャッシュバスター付きで最新を取得
  if(upEl) upEl.addEventListener("pointerdown",e=>{
    e.stopPropagation();
    const base=location.href.split('#')[0].split('?')[0];
    location.replace(base+'?v='+Date.now());
  });
  // semver比較（a>b か）。"0.2.10">"0.2.9" を正しく判定
  const verGt=(a,b)=>{ const pa=String(a).split('.').map(n=>parseInt(n,10)||0), pb=String(b).split('.').map(n=>parseInt(n,10)||0);
    for(let i=0;i<3;i++){ const x=pa[i]||0,y=pb[i]||0; if(x!==y) return x>y; } return false; };
  // 同じ場所のversion.jsonを取得して比較（file://やオフラインは黙って無視）。サーバ側が"本当に新しい"時だけ強調
  // プレビューで開いているときは枝名を出す＝本番と取り違えない（v0.3.118）
  try{
    const pv=(typeof previewName==="function") ? previewName() : null;
    const vEl=document.getElementById("splashVer");
    if(pv && vEl){ const b=document.createElement("div"); b.className="s-preview"; b.textContent="PREVIEW · "+pv; vEl.insertAdjacentElement("afterend", b); }
  }catch(e){}
  fetch("version.json?ts="+Date.now(),{cache:"no-store"})
    .then(r=>r.ok?r.json():null)
    .then(d=>{
      if(d && d.version && verGt(d.version, APP_VERSION) && upEl){
        upEl.textContent="● 新バージョン v"+d.version+" — 更新";
        upEl.classList.add("s-update-new");
      }
    }).catch(()=>{});
})();

// ---------- スプラッシュ → 最初のタップで全画面＋音声起動 ----------
// （ブラウザ仕様上、全画面化には必ず1回のユーザー操作が必要。
//   起動画面を全面に出すことで、その最初のタップで全画面に入る）
(function(){
  let done=false;
  const splash=document.getElementById("splash");
  function start(){
    if(done) return; done=true;
    const el=document.documentElement;
    const req=el.requestFullscreen||el.webkitRequestFullscreen||el.mozRequestFullScreen||el.msRequestFullscreen;
    if(req){ try{ const p=req.call(el); if(p&&p.catch) p.catch(()=>{}); }catch(e){} }  // 全画面が拒否されてもエラーにしない
    try{
      if(typeof AC!=="undefined"){
        if(AC.state!=="running") AC.resume();
        // 音声スレッドを先に起こす（無音1フレーム）→最初の発音の遅延を削減
        const b=AC.createBuffer(1,1,AC.sampleRate);
        const s=AC.createBufferSource(); s.buffer=b; s.connect(AC.destination); s.start(0);
      }
    }catch(e){}
    if(splash){ splash.classList.add("hide"); setTimeout(()=>splash.remove(),400); }
    // 開始タップの直後に続くtouchend/clickが下のUI（SCALE等）を誤爆しないよう一瞬だけ入力を遮断
    const shield=document.createElement("div");
    shield.style.cssText="position:fixed;inset:0;z-index:99999;background:transparent;";
    const swallow=e=>{ e.stopPropagation(); e.preventDefault(); };
    ["pointerdown","pointerup","mousedown","mouseup","click","touchstart","touchend"]
      .forEach(ev=>shield.addEventListener(ev,swallow,true));
    document.body.appendChild(shield);
    setTimeout(()=>shield.remove(),450);
    window.removeEventListener("pointerdown",start);
    window.removeEventListener("keydown",start);
  }
  // ===== 入口の合言葉 =====
  // 合言葉はソースに置かない（SHA-256のハッシュだけ）。通ったら端末に覚える（localStorage）。
  // ※ これは「メンバー以外がうっかり入らない」ためのもの。単一HTMLなので本気の鍵にはならず、
  //    本当に閉じるならサーバ側（WordPressのページパスワード / Basic認証）で。
  const PASS_HASH="1043819599ce5f51aa0d72251e2b5a18aa239fba8838621e6252032317d30f0f";
  const PASS_KEY="mics009.pass";
  const splashEl=document.getElementById("splash"), passForm=document.getElementById("splashPassForm"),
        passIn=document.getElementById("splashPass"), passMsg=document.getElementById("splashPassMsg");
  let unlocked=false; try{ unlocked = localStorage.getItem(PASS_KEY)===PASS_HASH; }catch(_){}
  if(splashEl) splashEl.classList.toggle("locked",!unlocked), splashEl.classList.toggle("unlocked",unlocked);
  async function sha256(str){
    if(crypto&&crypto.subtle){ const b=await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
      return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join(""); }
    return sha256js(str);   // http（非セキュア文脈）向けの保険
  }
  // 純JS SHA-256（crypto.subtle が無い http 環境用・短い入力専用）
  function sha256js(str){
    const K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    let H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    const bytes=new TextEncoder().encode(str), l=bytes.length, bits=l*8;
    const N=((l+9+63)>>6)<<6, m=new Uint8Array(N); m.set(bytes); m[l]=0x80;
    const dv=new DataView(m.buffer); dv.setUint32(N-4, bits>>>0); dv.setUint32(N-8, Math.floor(bits/4294967296));
    const R=(x,n)=>(x>>>n)|(x<<(32-n)), W=new Uint32Array(64);
    for(let o=0;o<N;o+=64){
      for(let i=0;i<16;i++) W[i]=dv.getUint32(o+i*4);
      for(let i=16;i<64;i++){ const s0=R(W[i-15],7)^R(W[i-15],18)^(W[i-15]>>>3), s1=R(W[i-2],17)^R(W[i-2],19)^(W[i-2]>>>10); W[i]=(W[i-16]+s0+W[i-7]+s1)>>>0; }
      let [a,b,c,d,e,f,g,h]=H;
      for(let i=0;i<64;i++){ const S1=R(e,6)^R(e,11)^R(e,25), ch=(e&f)^(~e&g), t1=(h+S1+ch+K[i]+W[i])>>>0, S0=R(a,2)^R(a,13)^R(a,22), mj=(a&b)^(a&c)^(b&c), t2=(S0+mj)>>>0;
        h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0; }
      H=[(H[0]+a)>>>0,(H[1]+b)>>>0,(H[2]+c)>>>0,(H[3]+d)>>>0,(H[4]+e)>>>0,(H[5]+f)>>>0,(H[6]+g)>>>0,(H[7]+h)>>>0];
    }
    return H.map(x=>x.toString(16).padStart(8,"0")).join("");
  }
  async function tryPass(){
    const v=(passIn.value||"").trim(); if(!v) return;
    const h=await sha256(v);
    if(h===PASS_HASH){
      unlocked=true; try{ localStorage.setItem(PASS_KEY,h); }catch(_){}
      splashEl.classList.remove("locked"); splashEl.classList.add("unlocked"); passMsg.textContent="";
      start();
    } else {
      passMsg.textContent="合言葉が違います"; passIn.value=""; passIn.focus();
      passForm.classList.remove("shake"); void passForm.offsetWidth; passForm.classList.add("shake");
    }
  }
  if(passForm){
    passForm.addEventListener("submit",e=>{ e.preventDefault(); e.stopPropagation(); tryPass(); });
    passForm.addEventListener("pointerdown",e=>e.stopPropagation());   // 入力欄のタップで start が走らないように
    passForm.addEventListener("keydown",e=>e.stopPropagation());
  }
  const gate=e=>{ if(unlocked){ start(); return; } if(passIn) passIn.focus(); };   // 通るまでは開始しない
  window.addEventListener("pointerdown",gate);
  window.addEventListener("keydown",gate);
})();
