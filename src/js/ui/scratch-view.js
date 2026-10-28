// @module ui/scratch-view
// @provides SCR_FADER_KEY_TRAVEL, SCR_FADER_ZERO, SCR_HAND_KEY, SCR_PEAK_BLOCK, SCR_PX_PER_SEC,
//    SCR_SENS_RANGE, SCR_SLING_MAX, SCR_SLING_PER_SEC, SCR_WIND_RANGE, SCR_WIND_TOP, _scratchFaderDrag,
//    _scratchGateKey, _scratchGesture, _scratchHeldWas, _scratchLevel, _scratchPad, _scratchPadInputs,
//    _scratchPeaks, _scratchRAF, scratchCanvasSize, scratchDrawOverview, scratchDrawStrip, scratchFaderAt,
//    scratchGatePaint, scratchGateRelease, scratchHandPaint, scratchHandSwap, scratchHide,
//    scratchPadInputDown, scratchPadInputUp, scratchPeaks, scratchSetLevel, scratchShow, scratchSlingKick,
//    scratchStripTime, scratchWindAt
// @uses scratchClose, scratchCue, scratchDrag, scratchHold, scratchMotor, scratchOpen, scratchSeek,
//    scratchSetFader, scratchState, tracks
// @depends audio/scratch-pad
// Vertical waveform strip (v0.3.186 §174, djay-like linear scratch) and a swipe fader. Pointer capture permits a
// second finger on the fader while the first finger holds/drags the waveform. The hands can swap sides.
// 向きは指の自然な動き：スクラッチ＝奥（上）へ送るとフォワード・手前（下）でバック。フェーダー＝触った場所まで開く（手前ほど開く）・離すと全閉。
let _scratchRAF=0,_scratchGesture=null,_scratchPad=-1;
const _scratchPadInputs=new Map();
// フェーダー（v0.3.188 §176）：触った場所まで開き（上から 18% の線＝全閉、下端＝全開）、指でなぞれば付いてくる、離すと全閉。
// 音は一瞬で切り替えず、つまみが一定の速さで動くように開閉する（scratchSetFader）＝上の近い所はすぐ・下の遠い所はゆっくり（v0.3.189 §177）。
// PC キー／MIDI のパッド・フェーダー上の Space は押している間だけ全開（こちらは 0.02 秒で全開＝叩いた感じを残す）。
const SCR_FADER_ZERO=.18,SCR_FADER_KEY_TRAVEL=.02;
let _scratchLevel=0,_scratchFaderDrag=null,_scratchGateKey=false,_scratchHeldWas=false;
function scratchGatePaint(){const held=_scratchGateKey||[..._scratchPadInputs.values()].includes(_scratchPad),v=held?1:_scratchLevel,keyMove=held||held!==_scratchHeldWas;_scratchHeldWas=held;
 const dur=keyMove?scratchSetFader(v,SCR_FADER_KEY_TRAVEL):scratchSetFader(v);
 const fader=document.getElementById('scratchFader'),pct=Math.round(v*100);fader.style.setProperty('--lv',String(v));if(Number.isFinite(dur))fader.style.setProperty('--fade-ms',Math.round(dur*1000)+'ms');fader.setAttribute('aria-valuenow',String(pct));fader.classList.toggle('open',v>0);
 document.getElementById('scratchFaderRead').textContent=v>0?'VOL '+pct+'%':'CLOSED';}
function scratchSetLevel(v){_scratchLevel=Math.max(0,Math.min(1,+v||0));scratchGatePaint();}
// 指の高さ → 開き（線より上＝0、下端＝1）
function scratchFaderAt(el,y){const r=el.getBoundingClientRect();return r.height?(y-r.top-r.height*SCR_FADER_ZERO)/(r.height*(1-SCR_FADER_ZERO)):0;}
function scratchGateRelease(clearInputs=true){if(clearInputs)_scratchPadInputs.clear();if(_scratchFaderDrag){_scratchFaderDrag=null;_scratchLevel=0;}_scratchGateKey=false;scratchGatePaint();}
// Preserve held sources across asynchronous audio startup; Note Off/key up can
// arrive before the worklet finishes loading and must keep the gate closed.
function scratchPadInputDown(i,id){
 if(tracks[i]?.padKind!=='SCR')return false;
 if(_scratchPadInputs.has(id))return true;
 const opening=(_scratchPad===i&&!document.getElementById('scratchEditor').hidden)||[..._scratchPadInputs.values()].includes(i)?null:scratchOpen(i);
 _scratchPadInputs.set(id,i);scratchGatePaint();
 if(opening)opening.then(()=>scratchGatePaint()).catch(e=>{_scratchPadInputs.delete(id);scratchGatePaint();document.getElementById('scratchStatus').textContent=e.message;});
 return true;
}
function scratchPadInputUp(id){_scratchPadInputs.delete(id);scratchGatePaint();}
// 1 秒の音＝この幅（CSS px、面のまん中で）。画面の大きさに関わらず指の移動量と音の進みが同じ＝波形が指の下に付いて動く
const SCR_PX_PER_SEC=220,SCR_PEAK_BLOCK=64,SCR_HAND_KEY='mics.scrHand';
// 感度は高さで変わる（v0.3.189 §177「上は感度が良く、下は鈍くなる」＝レコードの内側と外側のように）：上端はまん中の 2 倍、下端は半分（比 SCR_SENS_RANGE）。
// 高さ y（面の上から、CSS px）に見える時刻（秒。まん中＝0、下が先）。描画も指も同じ目盛りなので、波形は指の下に付いてくる
const SCR_SENS_RANGE=4;
// 離した高さ → 再生の立ち上がり（v0.3.190 §178「指を離すとこが上の方が再生の立ち上がりも早い」）：上端 0.03 秒・まん中 約 0.085 秒・下端 0.24 秒（指数で連続）
const SCR_WIND_TOP=.03,SCR_WIND_RANGE=8;
// 引いた距離 → 離した時の飛び出し（v0.3.191 §179「スクラッチ再生速度は、引いた距離も影響が出るように」）：掴んだ所から手前へ引いた音の長さ 1 秒につき +2 倍（最大 +2＝3 倍）、0.25 秒で 1 倍へ
const SCR_SLING_PER_SEC=2,SCR_SLING_MAX=2;
function scratchSlingKick(pulledSec){return Math.max(0,Math.min(SCR_SLING_MAX,(pulledSec||0)*SCR_SLING_PER_SEC));}
function scratchWindAt(y,h){return SCR_WIND_TOP*SCR_WIND_RANGE**Math.max(0,Math.min(1,h?y/h:.5));}
function scratchStripTime(y,h){const a=Math.log(SCR_SENS_RANGE)/Math.max(1,h),d=y-h/2;return (1-Math.exp(-a*d))/(a*SCR_PX_PER_SEC);}
let _scratchPeaks=null;
// 波形の山（64 フレームごとの最大振幅）。開くたびに 1 回だけ作る
function scratchPeaks(wave){
 if(_scratchPeaks&&_scratchPeaks.wave===wave)return _scratchPeaks;
 const n=Math.max(1,Math.ceil(wave.length/SCR_PEAK_BLOCK)),peak=new Float32Array(n);let top=1e-6;
 for(let b=0;b<n;b++){let m=0;const end=Math.min(wave.length,(b+1)*SCR_PEAK_BLOCK);for(let k=b*SCR_PEAK_BLOCK;k<end;k++){const v=Math.abs(wave[k]);if(v>m)m=v;}peak[b]=m;if(m>top)top=m;}
 for(let b=0;b<n;b++)peak[b]/=top;
 return _scratchPeaks={wave,peak,length:wave.length};
}
function scratchCanvasSize(canvas,fallbackH){const dpr=window.devicePixelRatio||1,w=Math.max(1,canvas.clientWidth||300),h=Math.max(1,canvas.clientHeight||fallbackH),W=Math.round(w*dpr),H=Math.round(h*dpr);if(canvas.width!==W||canvas.height!==H){canvas.width=W;canvas.height=H;}return {dpr,w,h,W,H};}
// 縦一直線のスクラッチ面：まん中の横線＝いま鳴っている所。波形は上へ進む＝下が先、上が鳴った後（ループするので端はつながる）。上は詰まって、下は伸びて見える（感度の目盛り）
function scratchDrawStrip(canvas,state,active){
 const {W,H,dpr}=scratchCanvasSize(canvas,320),c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#111617';c.fillRect(0,0,W,H);
 const P=state.wave?scratchPeaks(state.wave):null,mid=H/2,cx=W/2;
 if(P){const N=P.length,cur=((state.frame%N)+N)%N,nb=P.peak.length,hc=H/dpr,at=y=>cur+scratchStripTime(y/dpr,hc)*state.rate,seams=[];
  for(let pass=0;pass<2;pass++){c.fillStyle=pass?'#c0c875':'#5d6a5f';c.beginPath();
   for(let y=pass?Math.ceil(mid):0;y<(pass?H:Math.ceil(mid));y++){const f0=at(y),f1=at(y+1);let b0=Math.floor(f0/SCR_PEAK_BLOCK),b1=Math.floor(f1/SCR_PEAK_BLOCK),m=0;
    for(let b=b0;b<=b1;b++){const v=P.peak[((b%nb)+nb)%nb];if(v>m)m=v;}const ww=Math.max(1,m*W*.44);c.rect(cx-ww,y,ww*2,1);
    if(Math.floor(f0/N)!==Math.floor(f1/N))seams.push(y);}
   c.fill();}
  // ループのつなぎ目（サンプルの頭）
  c.fillStyle='#4f8fd6';for(const y of seams)c.fillRect(0,y,W,Math.max(1,dpr));}
 c.fillStyle=active?'#f0904a':'#e8edc1';c.fillRect(0,Math.round(mid-dpr),W,Math.max(2,Math.round(2*dpr)));
 c.beginPath();c.moveTo(0,mid-6*dpr);c.lineTo(0,mid+6*dpr);c.lineTo(8*dpr,mid);c.closePath();c.moveTo(W,mid-6*dpr);c.lineTo(W,mid+6*dpr);c.lineTo(W-8*dpr,mid);c.closePath();c.fill();
}
// 全体の波形：鳴った所は明るく、いま見えている範囲を枠で示す
function scratchDrawOverview(canvas,state){
 const {W,H,dpr}=scratchCanvasSize(canvas,40),c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#141a1b';c.fillRect(0,0,W,H);
 const P=state.wave?scratchPeaks(state.wave):null;if(!P)return;
 const N=P.length,nb=P.peak.length,pos=((state.frame%N)+N)%N/N,px=pos*W,cy=H/2;
 for(let pass=0;pass<2;pass++){c.fillStyle=pass?'#5d6a5f':'#a5ad84';c.beginPath();
  for(let x=pass?Math.ceil(px):0;x<(pass?W:Math.ceil(px));x++){const b0=Math.floor(x/W*nb),b1=Math.max(b0,Math.floor((x+1)/W*nb)-1);let m=0;for(let b=b0;b<=b1;b++)if(P.peak[b]>m)m=P.peak[b];const hh=Math.max(1,m*H*.44);c.rect(x,cy-hh,1,hh*2);}
  c.fill();}
 const hc=document.getElementById('scratchDeck').clientHeight||0,span=(scratchStripTime(hc,hc)-scratchStripTime(0,hc))*state.rate/N*W;   // スクラッチ面に見えている範囲
 if(span<W){c.strokeStyle='#e8edc1';c.lineWidth=dpr;c.strokeRect(px-span/2,1,span,H-2);}   // 短いサンプルは全部が見えているので枠なし
 c.fillStyle='#f0904a';c.fillRect(Math.round(px-dpr),0,Math.max(2,Math.round(2*dpr)),H);
}
function scratchHandSwap(){try{return localStorage.getItem(SCR_HAND_KEY)==='R';}catch(_){return false;}}
function scratchHandPaint(swap){const surface=document.getElementById('scratchSurface');surface.classList.toggle('swap',swap);const button=document.getElementById('scratchHand');button.setAttribute('aria-pressed',String(swap));button.setAttribute('aria-label',swap?'左右入替（いま：右手でスクラッチ・左手でフェーダー）':'左右入替（いま：左手でスクラッチ・右手でフェーダー）');}
function scratchHide(){_scratchPad=-1;_scratchLevel=0;scratchGateRelease();cancelAnimationFrame(_scratchRAF);_scratchRAF=0;_scratchGesture=null;const cv=document.getElementById('scratchDeck'),ov=document.getElementById('scratchOverview');cv.onpointerdown=cv.onpointermove=cv.onpointerup=cv.onpointercancel=null;ov.onpointerdown=ov.onpointermove=ov.onpointerup=ov.onpointercancel=null;document.getElementById('scratchEditor').hidden=true;}
function scratchShow(i){
 const editor=document.getElementById('scratchEditor'),cv=document.getElementById('scratchDeck'),ov=document.getElementById('scratchOverview'),strip=cv.parentElement;document.getElementById('scratchTitle').textContent='SCR · '+(tracks[i].name||'PAD '+(i+1));editor.hidden=false;
 _scratchPad=i;_scratchLevel=0;scratchGateRelease(false);_scratchGesture=null;scratchHandPaint(scratchHandSwap());
 const draw=()=>{if(editor.hidden)return;const state=scratchState();scratchDrawStrip(cv,state,!!_scratchGesture);scratchDrawOverview(ov,state);strip?.classList?.toggle('on',!!_scratchGesture);document.getElementById('scratchMotion').textContent=state.dragging?'HOLD':state.motor?'PLAY':'PAUSE';document.getElementById('scratchPosition').textContent=(state.position*state.duration).toFixed(2)+' / '+state.duration.toFixed(2)+' s';const button=document.getElementById('scratchPlay');button.textContent=state.motor?'Ⅱ PAUSE':'▶ PLAY';button.setAttribute('aria-pressed',String(state.motor));_scratchRAF=requestAnimationFrame(draw);};draw();
 // 面のどこを押しても掴む。指を奥（上）へ＝波形も上へ＝フォワード、手前（下）へ＝バック（音が指の下の波形に付いてくる）。横の動きは使わない。
 // 動いた量は高さごとの感度で数える（上ほど敏感）＝掴んだ所の時刻がそのまま指の下に来る
 const at=e=>{const r=cv.getBoundingClientRect();return scratchStripTime(e.clientY-r.top,r.height);};
 cv.onpointerdown=e=>{if(_scratchGesture)return;e.preventDefault();_scratchGesture={id:e.pointerId,t:at(e)};cv.setPointerCapture(e.pointerId);scratchHold(true);};
 cv.onpointermove=e=>{const g=_scratchGesture;if(!g||g.id!==e.pointerId)return;e.preventDefault();scratchDrag((g.t-at(e))*scratchState().rate,e.timeStamp);};
 cv.onpointerup=cv.onpointercancel=e=>{if(_scratchGesture?.id!==e.pointerId)return;const g=_scratchGesture;_scratchGesture=null;const r=cv.getBoundingClientRect();scratchHold(false,scratchWindAt(e.clientY-r.top,r.height),e.type==='pointercancel'?0:scratchSlingKick(at(e)-g.t));};   // 手前へ引いた分（音の秒）だけ飛び出す
 // 全体の波形：押した所・なぞった所へ移る
 let seeking=null;const seek=e=>{const r=ov.getBoundingClientRect(),st=scratchState();if(!st.wave||!r.width)return;scratchSeek(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*(st.wave.length-1));};
 ov.onpointerdown=e=>{if(seeking!=null)return;e.preventDefault();seeking=e.pointerId;ov.setPointerCapture(e.pointerId);seek(e);};
 ov.onpointermove=e=>{if(seeking===e.pointerId)seek(e);};
 ov.onpointerup=ov.onpointercancel=e=>{if(seeking===e.pointerId)seeking=null;};
}
(function(){
 document.getElementById('scratchClose').addEventListener('click',scratchClose);
 document.getElementById('scratchPlay').addEventListener('click',()=>scratchMotor(!scratchState().motor));
 document.getElementById('scratchCue').addEventListener('click',()=>{_scratchGesture=null;scratchCue();});
 // 左手でスクラッチ・右手でフェーダーが基本。⇄ で入れ替え（この端末に覚える）
 document.getElementById('scratchHand').addEventListener('click',()=>{const swap=!document.getElementById('scratchSurface').classList.contains('swap');try{localStorage.setItem(SCR_HAND_KEY,swap?'R':'L');}catch(_){}scratchHandPaint(swap);});
 const gate=document.getElementById('scratchFader');
 gate.addEventListener('pointerdown',e=>{if(_scratchFaderDrag)return;e.preventDefault();_scratchFaderDrag={id:e.pointerId};gate.setPointerCapture(e.pointerId);scratchSetLevel(scratchFaderAt(gate,e.clientY));});
 gate.addEventListener('pointermove',e=>{const d=_scratchFaderDrag;if(!d||d.id!==e.pointerId)return;e.preventDefault();scratchSetLevel(scratchFaderAt(gate,e.clientY));});
 const release=e=>{if(_scratchFaderDrag?.id!==e.pointerId)return;_scratchFaderDrag=null;scratchSetLevel(0);};   // 離すと全閉
 gate.addEventListener('pointerup',release);gate.addEventListener('pointercancel',release);gate.addEventListener('lostpointercapture',release);
 gate.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat){_scratchGateKey=true;scratchGatePaint();}}});
 gate.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();_scratchGateKey=false;scratchGatePaint();}});
 gate.addEventListener('blur',scratchGateRelease);window.addEventListener('blur',scratchGateRelease);
 document.getElementById('scratchDeck').addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();e.stopPropagation();scratchMotor(!scratchState().motor);}});
})();
