// @module ui/scratch-view
// @provides SCR_HAND_KEY, SCR_PEAK_BLOCK, SCR_PX_PER_SEC, _scratchGateKey, _scratchGatePointers,
//    _scratchGesture, _scratchPad, _scratchPadInputs, _scratchPeaks, _scratchRAF, scratchCanvasSize,
//    scratchDrawOverview, scratchDrawStrip, scratchGatePaint, scratchGateRelease, scratchHandPaint,
//    scratchHandSwap, scratchHide, scratchPadInputDown, scratchPadInputUp, scratchPeaks, scratchShow
// @uses scratchClose, scratchCue, scratchDrag, scratchHold, scratchMotor, scratchOpen, scratchSeek,
//    scratchSetFader, scratchState, tracks
// @depends audio/scratch-pad
// Linear waveform strip (djay style, v0.3.185 §173) and independent fader. Pointer capture permits a
// second finger on the fader while the first finger holds/drags the waveform. The hands can swap sides.
let _scratchRAF=0,_scratchGesture=null,_scratchPad=-1;
const _scratchPadInputs=new Map();
const _scratchGatePointers=new Set();let _scratchGateKey=false;
function scratchGatePaint(){const open=_scratchGatePointers.size>0||_scratchGateKey||[..._scratchPadInputs.values()].includes(_scratchPad);scratchSetFader(open?1:0);const button=document.getElementById('scratchFader');button.setAttribute('aria-pressed',String(open));button.textContent=open?'OPEN · SCR':'HOLD TO OPEN';document.getElementById('scratchFaderRead').textContent=open?'OPEN':'CLOSED';}
function scratchGateRelease(clearInputs=true){if(clearInputs)_scratchPadInputs.clear();_scratchGatePointers.clear();_scratchGateKey=false;scratchGatePaint();}
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
// 1 秒の音＝この幅（CSS px）。画面の大きさに関わらず指の移動量と音の進みが同じ＝波形が指の下に付いて動く
const SCR_PX_PER_SEC=220,SCR_PEAK_BLOCK=64,SCR_HAND_KEY='mics.scrHand';
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
// 横一直線のスクラッチ面：まん中の縦線＝いま鳴っている所。右が先、左が鳴った後（ループするので端はつながる）
function scratchDrawStrip(canvas,state,active){
 const {W,H,dpr}=scratchCanvasSize(canvas,160),c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#111617';c.fillRect(0,0,W,H);
 const P=state.wave?scratchPeaks(state.wave):null,mid=W/2,cy=H/2;
 if(P){const N=P.length,cur=((state.frame%N)+N)%N,perPx=state.rate/(SCR_PX_PER_SEC*dpr),nb=P.peak.length;
  for(let pass=0;pass<2;pass++){c.fillStyle=pass?'#c0c875':'#5d6a5f';c.beginPath();
   for(let x=pass?Math.ceil(mid):0;x<(pass?W:Math.ceil(mid));x++){const f0=cur+(x-mid)*perPx;let b0=Math.floor(f0/SCR_PEAK_BLOCK),b1=Math.floor((f0+perPx)/SCR_PEAK_BLOCK),m=0;
    for(let b=b0;b<=b1;b++){const v=P.peak[((b%nb)+nb)%nb];if(v>m)m=v;}const hh=Math.max(1,m*H*.42);c.rect(x,cy-hh,1,hh*2);}
   c.fill();}
  // ループのつなぎ目（サンプルの頭）
  c.fillStyle='#4f8fd6';for(let k=Math.floor((cur-mid*perPx)/N);k<=Math.floor((cur+mid*perPx)/N)+1;k++){const x=mid+(k*N-cur)/perPx;if(x>=0&&x<W)c.fillRect(Math.round(x),0,Math.max(1,dpr),H);}}
 c.fillStyle=active?'#f0904a':'#e8edc1';c.fillRect(Math.round(mid-dpr),0,Math.max(2,Math.round(2*dpr)),H);
 c.beginPath();c.moveTo(mid-6*dpr,0);c.lineTo(mid+6*dpr,0);c.lineTo(mid,8*dpr);c.closePath();c.moveTo(mid-6*dpr,H);c.lineTo(mid+6*dpr,H);c.lineTo(mid,H-8*dpr);c.closePath();c.fill();
}
// 全体の波形：鳴った所は明るく、いま見えている範囲を枠で示す
function scratchDrawOverview(canvas,state){
 const {W,H,dpr}=scratchCanvasSize(canvas,44),c=canvas.getContext('2d');c.setTransform(1,0,0,1,0,0);c.fillStyle='#141a1b';c.fillRect(0,0,W,H);
 const P=state.wave?scratchPeaks(state.wave):null;if(!P)return;
 const N=P.length,nb=P.peak.length,pos=((state.frame%N)+N)%N/N,px=pos*W,cy=H/2;
 for(let pass=0;pass<2;pass++){c.fillStyle=pass?'#5d6a5f':'#a5ad84';c.beginPath();
  for(let x=pass?Math.ceil(px):0;x<(pass?W:Math.ceil(px));x++){const b0=Math.floor(x/W*nb),b1=Math.max(b0,Math.floor((x+1)/W*nb)-1);let m=0;for(let b=b0;b<=b1;b++)if(P.peak[b]>m)m=P.peak[b];const hh=Math.max(1,m*H*.44);c.rect(x,cy-hh,1,hh*2);}
  c.fill();}
 const span=((document.getElementById('scratchDeck').clientWidth||0)/SCR_PX_PER_SEC*state.rate/N*W);   // スクラッチ面に見えている範囲
 if(span<W){c.strokeStyle='#e8edc1';c.lineWidth=dpr;c.strokeRect(px-span/2,1,span,H-2);}   // 短いサンプルは全部が見えているので枠なし
 c.fillStyle='#f0904a';c.fillRect(Math.round(px-dpr),0,Math.max(2,Math.round(2*dpr)),H);
}
function scratchHandSwap(){try{return localStorage.getItem(SCR_HAND_KEY)==='R';}catch(_){return false;}}
function scratchHandPaint(swap){const surface=document.getElementById('scratchSurface');surface.classList.toggle('swap',swap);const button=document.getElementById('scratchHand');button.setAttribute('aria-pressed',String(swap));button.textContent=swap?'⇄ SCR 右手':'⇄ SCR 左手';}
function scratchHide(){_scratchPad=-1;scratchGateRelease();cancelAnimationFrame(_scratchRAF);_scratchRAF=0;_scratchGesture=null;const cv=document.getElementById('scratchDeck'),ov=document.getElementById('scratchOverview');cv.onpointerdown=cv.onpointermove=cv.onpointerup=cv.onpointercancel=null;ov.onpointerdown=ov.onpointermove=ov.onpointerup=ov.onpointercancel=null;document.getElementById('scratchEditor').hidden=true;}
function scratchShow(i){
 const editor=document.getElementById('scratchEditor'),cv=document.getElementById('scratchDeck'),ov=document.getElementById('scratchOverview'),strip=cv.parentElement;document.getElementById('scratchTitle').textContent='SCR · '+(tracks[i].name||'PAD '+(i+1));editor.hidden=false;
 _scratchPad=i;scratchGateRelease(false);_scratchGesture=null;scratchHandPaint(scratchHandSwap());
 const draw=()=>{if(editor.hidden)return;const state=scratchState();scratchDrawStrip(cv,state,!!_scratchGesture);scratchDrawOverview(ov,state);strip?.classList?.toggle('on',!!_scratchGesture);document.getElementById('scratchMotion').textContent=state.dragging?'HOLD':state.motor?'PLAY':'PAUSE';document.getElementById('scratchPosition').textContent=(state.position*state.duration).toFixed(2)+' / '+state.duration.toFixed(2)+' s';const button=document.getElementById('scratchPlay');button.textContent=state.motor?'Ⅱ PAUSE':'▶ PLAY';button.setAttribute('aria-pressed',String(state.motor));_scratchRAF=requestAnimationFrame(draw);};draw();
 // 面のどこを押しても掴む。指が右へ＝波形も右へ＝戻る（音が指の下の波形に付いてくる）。縦の動きは使わない
 cv.onpointerdown=e=>{if(_scratchGesture)return;e.preventDefault();_scratchGesture={id:e.pointerId,x:e.clientX};cv.setPointerCapture(e.pointerId);scratchHold(true);};
 cv.onpointermove=e=>{const g=_scratchGesture;if(!g||g.id!==e.pointerId)return;e.preventDefault();scratchDrag(-(e.clientX-g.x)/SCR_PX_PER_SEC*scratchState().rate,e.timeStamp);};
 cv.onpointerup=cv.onpointercancel=e=>{if(_scratchGesture?.id!==e.pointerId)return;_scratchGesture=null;scratchHold(false);};
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
 gate.addEventListener('pointerdown',e=>{e.preventDefault();_scratchGatePointers.add(e.pointerId);gate.setPointerCapture(e.pointerId);scratchGatePaint();});
 const release=e=>{_scratchGatePointers.delete(e.pointerId);scratchGatePaint();};
 gate.addEventListener('pointerup',release);gate.addEventListener('pointercancel',release);gate.addEventListener('lostpointercapture',release);
 gate.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat){_scratchGateKey=true;scratchGatePaint();}}});
 gate.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();_scratchGateKey=false;scratchGatePaint();}});
 gate.addEventListener('blur',scratchGateRelease);window.addEventListener('blur',scratchGateRelease);
 document.getElementById('scratchDeck').addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();e.stopPropagation();scratchMotor(!scratchState().motor);}});
})();
