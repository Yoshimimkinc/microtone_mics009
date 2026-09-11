// ---------- サンプル編集モーダル（EDIT＋パッド） ----------
// 対象パッドの編集をモーダルへ集約。波形ドラッグ＝START/END/LOOP、各ノブはtracksへ即反映。
// 選択範囲[start,end]でバッファを切り出し、外側を破棄。バッファ差替でピッチキャッシュは自動破棄。
function cropBufferToSelection(t){
  const buf=t.buffer; if(!buf) return;
  const N=buf.length;
  const a=Math.max(0, Math.min(N-1, Math.floor((t.start||0)*N)));
  const b=Math.max(a+1, Math.min(N, Math.floor((t.end??1)*N)));
  if(b-a<8) return;                     // 短すぎる選択は無視
  const cropOne=(src)=>{
    const sN=src.length, ratio=sN/N;    // rawとbufferで長さが違っても同じ正規化位置で切る
    const sa=Math.max(0,Math.floor(a*ratio)), sb=Math.min(sN,Math.ceil(b*ratio));
    const len=Math.max(1,sb-sa), ch=src.numberOfChannels;
    const out=AC.createBuffer(ch,len,src.sampleRate);
    for(let c=0;c<ch;c++){ const s=src.getChannelData(c), d=out.getChannelData(c); for(let n=0;n<len;n++) d[n]=s[sa+n]; }
    return out;
  };
  t.buffer=cropOne(buf);
  if(t.rawBuffer) t.rawBuffer=cropOne(t.rawBuffer);
  t.start=0; t.end=1; t.loopStart=0;
}
// 波形上の再生位置トレース（playbackRate=1なので経過秒＝バッファ秒で正確に追える）
let pePlayRAF=0;
// 波形エディタが画面に出ているか（モーダルが開いている／窓のSAMPLEページに居る）
function peWaveVisible(){
  const w=document.getElementById("peWave"); if(!w) return false;
  const r=w.parentElement.getBoundingClientRect(); return r.width>0 && r.height>0;
}
function pePlayheadRun(when, startSec, endSec, lsSec, dur, loop){
  const ph=document.getElementById("pePlayhead");
  const wrap=document.getElementById("peWave").parentElement;
  if(!ph||!wrap) return;
  cancelAnimationFrame(pePlayRAF);
  const span=Math.max(0.0001, endSec-startSec);
  const W=wrap.clientWidth;   // 幅は開始時に1回だけ測る（毎フレーム clientWidth を読むとレイアウト計算を強制する）
  const tick=()=>{
    // 波形が隠れた / 音が止まった(=チョーク/再トリガ/減衰) ら消す
    if(!peWaveVisible() || !tracks[peTarget] || tracks[peTarget].activeVoices.length===0){ ph.style.opacity="0"; return; }
    const el=AC.currentTime-when;
    if(el<0){ pePlayRAF=requestAnimationFrame(tick); return; }
    let posSec;
    if(!loop){
      if(el>=span){ ph.style.opacity="0"; return; }
      posSec=startSec+el;
    } else {
      if(el<span) posSec=startSec+el;
      else { const lp=Math.max(0.0001, endSec-lsSec); posSec=lsSec+((el-span)%lp); }
    }
    const px=(((posSec/dur)-peV0)/((peV1-peV0)||1))*W;
    if(px<0||px>W){ ph.style.opacity="0"; }
    else { ph.style.left=px+"px"; ph.style.opacity="1"; }
    pePlayRAF=requestAnimationFrame(tick);
  };
  tick();
}
let _ovCache=null;
function renderPeOver(i){
  const cv=document.getElementById("peOverCv"); if(!cv) return;
  const wrap=cv.parentElement, W=wrap.clientWidth, H=wrap.clientHeight;
  if(!W||!H) return;
  const dpr=window.devicePixelRatio||1;
  cv.width=W*dpr; cv.height=H*dpr;
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const buf=tracks[i]&&tracks[i].buffer; if(!buf) return;
  const mid=H/2;
  const cs=getComputedStyle(document.body);
  const acc=(cs.getPropertyValue("--teal").trim())||"#3dd6c4";
  const amber=(cs.getPropertyValue("--amber").trim())||"#ffb84d";
  if(!_ovCache || _ovCache.buf!==buf || _ovCache.W!==W){   // 全長スキャンはバッファ替え/リサイズ時だけ
    const data=buf.getChannelData(0), step=Math.max(1,Math.floor(data.length/W));
    const top=new Float32Array(W), bot=new Float32Array(W);
    for(let x=0;x<W;x++){ let mn=1,mx=-1; const o=x*step;
      for(let n=0;n<step;n++){ const v=data[o+n]||0; if(v<mn)mn=v; if(v>mx)mx=v; }
      top[x]=mx; bot[x]=mn; }
    _ovCache={buf, W, top, bot};
  }
  const {top,bot}=_ovCache;
  ctx.beginPath(); ctx.moveTo(0,mid-top[0]*mid*0.85);
  for(let x=1;x<W;x++) ctx.lineTo(x,mid-top[x]*mid*0.85);
  for(let x=W-1;x>=0;x--) ctx.lineTo(x,mid-bot[x]*mid*0.85);
  ctx.closePath(); ctx.globalAlpha=.45; ctx.fillStyle=acc; ctx.fill(); ctx.globalAlpha=1;
  if(i===chopTarget && chopBounds.length>2){   // CHOPティック（全体の中の刻み位置）
    ctx.strokeStyle=amber; ctx.lineWidth=1;
    for(let k=1;k<chopBounds.length-1;k++){ const x=chopBounds[k]*W;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  }
}
function syncPeOverWin(){
  const win=document.getElementById("peOverWin"), wrap=document.getElementById("peOver");
  if(!win||!wrap) return;
  const W=wrap.clientWidth;
  win.style.left=(peV0*W)+"px"; win.style.width=Math.max(10,(peV1-peV0)*W)+"px";
}
function renderPeWave(i){
  const cv=document.getElementById("peWave"); if(!cv) return;
  const wrap=cv.parentElement, W=wrap.clientWidth, H=wrap.clientHeight;
  if(!W||!H) return;
  const dpr=window.devicePixelRatio||1;
  cv.width=W*dpr; cv.height=H*dpr;
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);
  ctx.clearRect(0,0,W,H);
  const mid=H/2;
  ctx.strokeStyle="#2c333b"; ctx.beginPath(); ctx.moveTo(0,mid); ctx.lineTo(W,mid); ctx.stroke();
  const buf=tracks[i].buffer;
  const cs=getComputedStyle(document.body);   // テーマ色は1回だけ読む（ドラッグ追従のgetComputedStyle連発を回避）
  const acc=(cs.getPropertyValue("--teal").trim())||"#3dd6c4";
  const amber=(cs.getPropertyValue("--amber").trim())||"#ffb84d";
  if(buf){
    const data=buf.getChannelData(0);
    const i0=Math.floor(peV0*data.length), i1=Math.max(i0+2, Math.ceil(peV1*data.length));
    const spanS=i1-i0;
    const top=new Float32Array(W), bot=new Float32Array(W);
    for(let x=0;x<W;x++){ let mn=1,mx=-1;
      const a=i0+Math.floor(x*spanS/W), b2=Math.max(a+1, i0+Math.floor((x+1)*spanS/W));
      for(let n=a;n<b2 && n<i1;n++){ const v=data[n]||0; if(v<mn)mn=v; if(v>mx)mx=v; }
      top[x]=mid-mx*mid*0.92; bot[x]=mid-mn*mid*0.92; }
    ctx.beginPath(); ctx.moveTo(0,top[0]);
    for(let x=1;x<W;x++) ctx.lineTo(x,top[x]);
    for(let x=W-1;x>=0;x--) ctx.lineTo(x,bot[x]);
    ctx.closePath(); ctx.globalAlpha=.5; ctx.fillStyle=acc; ctx.fill(); ctx.globalAlpha=1;
    ctx.strokeStyle=acc; ctx.lineWidth=1.4; ctx.beginPath(); ctx.moveTo(0,top[0]);
    for(let x=1;x<W;x++) ctx.lineTo(x,top[x]); ctx.stroke();
  } else {
    ctx.fillStyle="#3a4149"; ctx.font="11px sans-serif"; ctx.fillText("no sample",10,mid);
  }
  // CHOPスライス境界線（編集対象パッドのときだけ）：分割プレビュー
  if(buf && i===chopTarget && chopBounds.length>2){
    ctx.strokeStyle=amber;
    ctx.lineWidth=1.5;
    ctx.fillStyle=amber;
    for(let k=1;k<chopBounds.length-1;k++){ const x=((chopBounds[k]-peV0)/((peV1-peV0)||1))*W; if(x<-2||x>W+2) continue;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke();
      ctx.beginPath(); ctx.arc(x,7,3.2,0,Math.PI*2); ctx.fill(); }   // 上端ドット＝掴めるサイン
  }
  // ハンドル/シェード位置（start/end/loop）
  const t=tracks[i], zs=(peV1-peV0)||1, nx=v=>((v-peV0)/zs)*W;
  const sx=nx(t.start||0), ex=nx(t.end??1), lx=nx(t.loopStart||0);
  document.getElementById("peStart").style.left=sx+"px";
  document.getElementById("peEnd").style.left=ex+"px";
  const pl=document.getElementById("peLoop"); pl.style.left=lx+"px"; pl.style.display=t.loop?"block":"none";
  const shL=document.getElementById("peShadeL"), shR=document.getElementById("peShadeR");
  const sxc=Math.max(0,Math.min(W,sx)), exc=Math.max(0,Math.min(W,ex));
  shL.style.left="0"; shL.style.width=sxc+"px"; shR.style.left=exc+"px"; shR.style.width=(W-exc)+"px";
  renderPeOver(i); syncPeOverWin();
}
// EDITモーダルが開いていて、取り込み先がその編集パッドなら波形/タイトルを更新
function refreshOpenPadEdit(i){
  const pem=document.getElementById("padEditModal");
  if(pem && pem.style.display==="flex" && i===peTarget) openPadEdit(i);
}
function openPadEdit(i){
  if(typeof clWaveTo==="function") clWaveTo("modal");   // 窓に出していた波形を回収してから開く
  if(peTarget!==i){ peV0=0; peV1=1; }   // 別パッドを開いたらズームは全体へ（同パッド更新は窓維持）
  peTarget=i;
  const t=tracks[i];
  cancelAnimationFrame(pePlayRAF); document.getElementById("pePlayhead").style.opacity="0";   // 前回のトレースを消す
  document.getElementById("peTitle").textContent="TRIM / CHOP";   // 名前は背後（窓・strip・パッド）に出ている＝ここには出さない
  // 音作り（PITCH/LEVEL/SCALE/LOOP/FILTER/CHOKE/ASSIGN/OUT/ATTACK/FADE）は情報窓のページが唯一の入口。
  // このモーダルに残るのは「入り組んだ設定」＝波形の切り出し（TRIM/REV/CHOP）と音源の差し替えだけ。
  document.getElementById("padEditModal").classList.toggle("pe-empty", !t.buffer);   // 空パッドは音源選択だけ見せる
  // CHOPプレビュー初期化（この編集パッドを対象に。既定 TIME / 8分割）
  chopTarget=i; chopMode="time"; chopDivN=0; chopSens="mid";   // 既定OFF＝開いた時は線を出さない（分割を選んだ瞬間だけ）
  syncChopSeg("edChopMode","mode",chopMode);
  syncChopSeg("edChopDiv","n",String(chopDivN));
  syncChopSeg("edChopSens","s",chopSens);
  document.getElementById("edChopDiv").style.display = chopMode==="time"?"":"none";
  document.getElementById("edChopSens").style.display = chopMode==="attack"?"":"none";
  computeChopBounds();
  const modal=document.getElementById("padEditModal");
  peOpenedAt=performance.now();
  document.body.classList.add("pe-open");   // 開いている間は窓の ✂ ボタンを隠す（二重）
  modal.style.display="flex";
  requestAnimationFrame(()=>renderPeWave(i));   // 表示後に正しい幅で描画
}
(function(){
  const modal=document.getElementById("padEditModal");
  const close=()=>{ modal.style.display="none"; document.body.classList.remove("pe-open"); if(typeof drawPadWave==="function") drawPadWave(peTarget); if(typeof syncEditor==="function") syncEditor();
    if(typeof clWaveTo==="function" && typeof clPage!=="undefined" && clPage==="smpl"){ clWaveTo("screen"); clSyncWave(); } };
  // タッチ端末では、パッドの pointerup でモーダルを開いた直後に、ブラウザが touchend から合成する click が
  // 「指の位置で再ヒットテスト」されてモーダルの上に落ちる（ゴーストクリック）。背景なら即閉じ、
  // ✂TRIM の上なら勝手に切り詰める（実測：70560→35280フレーム）。開いてから450msはクリックを飲む。
  modal.addEventListener("click",e=>{ if(performance.now()-peOpenedAt<450){ e.stopPropagation(); e.preventDefault(); } },true);
  document.getElementById("peClose").addEventListener("click",close);
  modal.addEventListener("click",e=>{ if(e.target===modal) close(); });
  document.getElementById("peAudition").addEventListener("click",async()=>{
    if(AC.state!=="running")await AC.resume(); trigger(peTarget);
  });
  // ハンドルは「±26pxで掴んだ時だけ」動く（どこでもタップ＝移動は廃止：ピンチ1本目や誤タップでSTRT/ENDが飛ぶため）。
  // 何もない場所の1本指ドラッグはズーム中のパン。精密配置はズームで＝掴みやすさはズームが担う
  const peWaveEl=document.getElementById("peWave").parentElement;
  let dragKind=null, dragOff=0, panLast=null;
  const peNorm=(clientX)=>{ const r=peWaveEl.getBoundingClientRect(); return Math.max(0,Math.min(1, peV0+((clientX-r.left)/r.width)*(peV1-peV0) )); };
  const pickHandle=(n)=>{
    const t=tracks[peTarget];
    const r=peWaveEl.getBoundingClientRect();
    const thr=(26/Math.max(1,r.width))*(peV1-peV0);   // 画面上26px以内だけ「掴んだ」扱い（ズーム倍率に自動追従）
    const cands=[["start",t.start||0],["end",t.end??1]];
    if(t.loop) cands.push(["loop",t.loopStart||0]);
    if(peTarget===chopTarget && chopBounds.length>2)   // CHOPの内側の線（両端はSTRT/ENDが担当）
      for(let k=1;k<chopBounds.length-1;k++) cands.push(["chop:"+k, chopBounds[k]]);
    let best=null, bd=thr;
    for(const [k,v] of cands){ const d=Math.abs(v-n); if(d<=bd){ bd=d; best=k; } }
    return best;
  };
  const peApply=(n)=>{
    const t=tracks[peTarget];
    if(dragKind && dragKind.indexOf("chop:")===0){
      const k=+dragKind.slice(5);
      chopBounds[k]=Math.max(chopBounds[k-1]+0.002, Math.min(chopBounds[k+1]-0.002, n));
      renderPeWave(peTarget); if(typeof paintClPage==="function") paintClPage(); return;
    }
    if(dragKind==="start")    t.start=Math.min(n,(t.end??1)-0.002);
    else if(dragKind==="end") t.end=Math.max(n,(t.start||0)+0.002);
    else                      t.loopStart=Math.max(0,Math.min(n,(t.end??1)));
    renderPeWave(peTarget);
  };
  peWaveEl.addEventListener("pointerdown",e=>{
    if(!tracks[peTarget]||!tracks[peTarget].buffer) return;   // 空パッドは無視
    e.preventDefault();
    const tt=tracks[peTarget];
    const n=peNorm(e.clientX); dragKind=pickHandle(n);
    if(dragKind){
      dragPrev={s:tt.start||0, e:tt.end??1, l:tt.loopStart||0,
        cb:(peTarget===chopTarget&&chopBounds.length>2)?chopBounds.slice():null};   // ピンチ開始時の復元用
      const gv=dragKind.indexOf("chop:")===0 ? chopBounds[+dragKind.slice(5)]
             : ({start:tt.start||0, end:tt.end??1, loop:tt.loopStart||0})[dragKind];
      dragOff=gv-n;   // 掴んだ瞬間に跳ねない
      pushUndo();
    } else if(peV1-peV0<0.999){
      panLast=e.clientX;   // ズーム中の何もない場所＝1本指パン
    }
    try{ peWaveEl.setPointerCapture(e.pointerId); }catch(_){}
  });
  peWaveEl.addEventListener("pointermove",e=>{
    if(pePtrs.size>=2) return;   // ピンチ中はズーム側に任せる
    if(dragKind){ peApply(peNorm(e.clientX)+dragOff); return; }
    if(panLast!=null){
      const r=peWaveEl.getBoundingClientRect(), sp=peV1-peV0;
      const d=((panLast-e.clientX)/r.width)*sp; panLast=e.clientX;
      peZoomTo(peV0+d, peV0+d+sp);
    }
  });
  // 開始点は離した瞬間に最寄りのアタックへ吸着（±12ms）。CLAUDE.md「Start point snaps to attack transients」
  const peUp=()=>{
    panLast=null;
    const wasStart=(dragKind==="start"); dragKind=null;
    if(wasStart){ snapStartToOnset(peTarget); renderPeWave(peTarget); if(typeof drawPadWave==="function") drawPadWave(peTarget); }
    if(typeof paintClPage==="function") paintClPage();   // 窓のSTART/END/LOOP欄も追従
  };
  peWaveEl.addEventListener("pointerup",peUp); peWaveEl.addEventListener("pointercancel",peUp);
  // ===== 波形ズーム：ホイール(縦)=カーソル支点ズーム / 横=パン / 2本指ピンチ=ズーム&パン / ダブルタップ=全体 =====
  let dragPrev=null, peLastTap=0, peTapPrev=null;
  const pePtrs=new Map();
  const peZoomTo=(v0,v1)=>{
    let sp=Math.max(0.004, Math.min(1, v1-v0));   // 最大250倍ズーム
    v0=Math.max(0, Math.min(1-sp, v0));
    peV0=v0; peV1=v0+sp; renderPeWave(peTarget);
  };
  peWaveEl.addEventListener("wheel",e=>{
    if(!tracks[peTarget]||!tracks[peTarget].buffer) return;
    e.preventDefault();
    const r=peWaveEl.getBoundingClientRect(), sp=peV1-peV0;
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){        // 横＝パン
      const d=(e.deltaX/r.width)*sp; peZoomTo(peV0+d, peV0+d+sp);
    } else {                                          // 縦＝ズーム（カーソル位置を支点）
      const anchor=peV0+((e.clientX-r.left)/r.width)*sp;
      const ns=sp*(e.deltaY<0?0.75:1/0.75);
      peZoomTo(anchor-(anchor-peV0)*(ns/sp), anchor+(peV1-anchor)*(ns/sp));
    }
  },{passive:false});
  peWaveEl.addEventListener("pointerdown",e=>{
    if(!tracks[peTarget]||!tracks[peTarget].buffer) return;
    pePtrs.set(e.pointerId,{x:e.clientX, x0:e.clientX});
    if(pePtrs.size===2){
      // 2本目の指＝ピンチ開始。1本目のタップで動いたハンドルは元に戻す
      if(dragKind && dragPrev){ const t=tracks[peTarget]; t.start=dragPrev.s; t.end=dragPrev.e; t.loopStart=dragPrev.l; if(dragPrev.cb) chopBounds=dragPrev.cb.slice(); dragPrev=null; }
      dragKind=null; panLast=null; renderPeWave(peTarget); return;
    }
    const now2=performance.now();
    if(now2-peLastTap<320){                            // ダブルタップ＝全体表示（タップで動いた分も復元）
      if(peTapPrev){ const t=tracks[peTarget]; t.start=peTapPrev.s; t.end=peTapPrev.e; t.loopStart=peTapPrev.l; }
      dragKind=null; peLastTap=0; peZoomTo(0,1); return;
    }
    peLastTap=now2; peTapPrev=dragPrev;
  });
  peWaveEl.addEventListener("pointermove",e=>{
    if(!pePtrs.has(e.pointerId)) return;
    const prev=[...pePtrs.values()];
    const rec=pePtrs.get(e.pointerId);
    pePtrs.set(e.pointerId,{x:e.clientX, x0:rec.x0});
    if(pePtrs.size===2){                               // ピンチ＝ズーム＋パン（中点支点）
      const cur=[...pePtrs.values()];
      const r=peWaveEl.getBoundingClientRect(), sp=peV1-peV0;
      const d0=Math.abs(prev[0].x-prev[1].x)||1, d1=Math.abs(cur[0].x-cur[1].x)||1;
      const m0=(prev[0].x+prev[1].x)/2, m1=(cur[0].x+cur[1].x)/2;
      const anchor=peV0+((m0-r.left)/r.width)*sp;
      const ns=Math.max(0.004, Math.min(1, sp*(d0/d1)));
      const v0=anchor-(anchor-peV0)*(ns/sp) - ((m1-m0)/r.width)*ns;
      peZoomTo(v0, v0+ns);
    }
  });
  // ===== 概観レーン操作：窓ドラッグ=スクロール / 端±14px=ズーム / 外タップ=ジャンプ =====
  const ovEl=document.getElementById("peOver");
  let ovMode=null, ovGrab=0;
  const ovN=x=>{ const r=ovEl.getBoundingClientRect(); return Math.max(0,Math.min(1,(x-r.left)/r.width)); };
  ovEl.addEventListener("pointerdown",e=>{
    if(!tracks[peTarget]||!tracks[peTarget].buffer) return;
    e.preventDefault();
    const r=ovEl.getBoundingClientRect(), n=ovN(e.clientX), sp=peV1-peV0;
    const px=e.clientX-r.left, pxL=peV0*r.width, pxR=peV1*r.width;
    if(Math.abs(px-pxL)<=14 && Math.abs(px-pxL)<=Math.abs(px-pxR)) ovMode="l";   // 全体表示中も端をつまめる＝最初のズーム入口
    else if(Math.abs(px-pxR)<=14) ovMode="r";
    else if(n>=peV0 && n<=peV1){ ovMode="pan"; ovGrab=n-peV0; }
    else {   // 窓の外＝そこへジャンプ（全体表示中は半分幅の窓を作る＝1タップでズーム開始）
      const nsp=(sp<0.999)?sp:0.5;
      ovMode="pan"; ovGrab=nsp/2;
      peZoomTo(n-nsp/2, n+nsp/2);
    }
    try{ ovEl.setPointerCapture(e.pointerId); }catch(_){}
  });
  ovEl.addEventListener("pointermove",e=>{
    if(!ovMode) return;
    const n=ovN(e.clientX), sp=peV1-peV0;
    if(ovMode==="pan") peZoomTo(n-ovGrab, n-ovGrab+sp);
    else if(ovMode==="l") peZoomTo(Math.min(n, peV1-0.004), peV1);
    else if(ovMode==="r") peZoomTo(peV0, Math.max(n, peV0+0.004));
  });
  const ovUp=()=>{ ovMode=null; };
  ovEl.addEventListener("pointerup",ovUp); ovEl.addEventListener("pointercancel",ovUp);
  const pePtrUp=e=>{
    const rec=pePtrs.get(e.pointerId);
    if(rec && Math.abs(e.clientX-rec.x0)>6) peLastTap=0;   // ドラッグはタップに数えない（ドラッグ直後の誤ダブルタップ防止）
    pePtrs.delete(e.pointerId); if(pePtrs.size===0) dragPrev=null; };
  peWaveEl.addEventListener("pointerup",pePtrUp); peWaveEl.addEventListener("pointercancel",pePtrUp);
  // REV：バッファを破壊的に反転（TRIMと同じ流儀＝undo可）。start/endは表示位置なので鏡映
  document.getElementById("peRev").addEventListener("click",()=>{
    const t=tracks[peTarget]; if(!t.buffer) return;
    pushUndo();
    const rev=b=>{ const o=AC.createBuffer(b.numberOfChannels,b.length,b.sampleRate);
      for(let c=0;c<b.numberOfChannels;c++){ const s2=b.getChannelData(c), d=o.getChannelData(c);
        for(let n=0,L=b.length;n<L;n++) d[n]=s2[L-1-n]; } return o; };
    t.buffer=rev(t.buffer); if(t.rawBuffer) t.rawBuffer=rev(t.rawBuffer);   // 新バッファ＝pitch/概観キャッシュ自動無効化
    const s0=t.start||0, e0=t.end??1; t.start=1-e0; t.end=1-s0;
    if(t.loop) t.loopStart=t.start;
    renderPeWave(peTarget); drawPadWave(peTarget);
    sampNameEl.textContent="REVERSE  ↩で戻せる";
  });
  // TRIM：STRT〜ENDの範囲でバッファを実際に切り出す（外側を破棄）→start=0/end=1にリセット
  document.getElementById("peTrunc").addEventListener("click",()=>{
    const t=tracks[peTarget]; if(!t.buffer) return;
    pushUndo();
    cropBufferToSelection(t);
    renderPeWave(peTarget); drawPadWave(peTarget);
    sampNameEl.textContent="TRIM完了  ↩で戻せる";
  });
  // ===== CHOP（EDIT内に統合）：この編集パッドをスライスして各パッドへ展開 =====
  document.getElementById("edChopMode").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    chopMode=b.dataset.mode; chopTarget=peTarget; syncChopSeg("edChopMode","mode",chopMode);
    document.getElementById("edChopDiv").style.display = chopMode==="time"?"":"none";
    document.getElementById("edChopSens").style.display = chopMode==="attack"?"":"none";
    computeChopBounds(); renderPeWave(peTarget);
  });
  document.getElementById("edChopDiv").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    chopDivN=+b.dataset.n; chopTarget=peTarget; syncChopSeg("edChopDiv","n",String(chopDivN)); computeChopBounds(); renderPeWave(peTarget);
  });
  document.getElementById("edChopSens").addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    chopSens=b.dataset.s; chopTarget=peTarget; syncChopSeg("edChopSens","s",chopSens); computeChopBounds(); renderPeWave(peTarget);
  });
  document.getElementById("edChopApply").addEventListener("click",()=>{
    if(chopTarget!==peTarget){ chopTarget=peTarget; computeChopBounds(); }   // 手動調整済みの線は再計算で潰さない
    if(chopBounds.length<3){ sampNameEl.textContent="CHOP — まず分割数（2/4/8/16 か ATK）を選ぶ"; return; }
    applyChop();
  });
  window.addEventListener("keydown",e=>{ if(e.key==="Escape"&&modal.style.display==="flex") close(); });
})();

