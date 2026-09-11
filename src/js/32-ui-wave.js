// ---------- sample editor ---------- （窓波形は撤去：drawWave/ハンドル/カーソル機構は廃止）

// Koala風：各パッドに小さな波形を描く
function padWaveInk(){ return (getComputedStyle(document.body).getPropertyValue("--ink").trim()||"#e8e4d8"); }
function drawPadWave(i, ink){
  const pad=padsEl.children[i]; if(!pad) return;
  const cv=pad.querySelector(".pad-wave"); if(!cv) return;
  const w=pad.clientWidth, h=pad.clientHeight;
  if(!w||!h) return;
  const dpr=window.devicePixelRatio||1;
  const cw=Math.round(w*dpr), ch=Math.round(h*dpr);
  if(cv.width!==cw || cv.height!==ch){ cv.width=cw; cv.height=ch; }   // サイズ不変なら再確保しない（毎ヒットのコスト削減）
  const ctx=cv.getContext("2d"); ctx.setTransform(dpr,0,0,dpr,0,0);   // 絶対変換でscale二重掛けを回避
  ctx.clearRect(0,0,w,h);
  const buf=tracks[i].buffer; if(!buf) return;
  const data=buf.getChannelData(0);
  const s=Math.floor((tracks[i].start||0)*data.length);
  const e=Math.floor((tracks[i].end??1)*data.length);
  const len=Math.max(1,e-s), bin=Math.max(1,Math.floor(len/w));
  const mid=h/2;
  ctx.strokeStyle=ink||padWaveInk();   // getComputedStyleは高コスト→バッチ時は一度だけ算出して使い回す
  ctx.lineWidth=1; ctx.beginPath();
  for(let x=0;x<w;x++){
    let mn=1,mx=-1; const o=s+x*bin;
    for(let k=0;k<bin;k++){ const v=data[o+k]||0; if(v<mn)mn=v; if(v>mx)mx=v; }
    ctx.moveTo(x+0.5, mid - mx*mid*0.92);
    ctx.lineTo(x+0.5, mid - mn*mid*0.92);
  }
  ctx.stroke();
}
function drawAllPadWaves(){ const ink=padWaveInk(); for(let i=0;i<PADS.length;i++) drawPadWave(i, ink); }

// ===== ステップキーの薄い波形（軽量：トラック毎に1回 data-URL 化してキャッシュ→CSS背景。再生中は再描画しない）=====
const trackWaveURL=[];   // trackWaveURL[i] = そのトラック波形(start..end)の透明PNG data-URL
function buildTrackWave(i){
  const t=tracks[i], buf=t&&t.buffer;
  if(!buf){ trackWaveURL[i]=""; return; }
  const data=buf.getChannelData(0);
  const s0=Math.floor((t.start||0)*data.length), e0=Math.floor((t.end??1)*data.length);
  const len=Math.max(1,e0-s0);
  const W=384,H=48, c=document.createElement("canvas"); c.width=W; c.height=H;
  const ctx=c.getContext("2d"); ctx.clearRect(0,0,W,H);   // 透明背景＝セルの on/off 色を潰さない
  ctx.strokeStyle=padWaveInk(); ctx.globalAlpha=0.5; ctx.lineWidth=1; ctx.beginPath();
  const bin=Math.max(1,Math.floor(len/W)), mid=H/2;
  for(let x=0;x<W;x++){ let mn=1,mx=-1; const o=s0+x*bin;
    for(let k=0;k<bin;k++){ const v=data[o+k]||0; if(v<mn)mn=v; if(v>mx)mx=v; }
    ctx.moveTo(x+0.5, mid-mx*mid*0.92); ctx.lineTo(x+0.5, mid-mn*mid*0.92);
  }
  ctx.stroke();
  trackWaveURL[i]=c.toDataURL();
}
// セルに「全波形の 1/16 スライス」を CSS背景で割り当て（drawImageせず＝軽い）
function setCellWave(el, url, s){
  if(!el) return;
  // 各セル＝そのトラックの再生範囲(start..end)の全波形を丸ごと表示（演奏用PADと同じ）。16分割スライスではない。
  if(url){ el.style.backgroundImage="url("+url+")"; el.style.backgroundSize="100% 100%";
    el.style.backgroundPosition="center"; el.style.backgroundRepeat="no-repeat"; }
  else el.style.backgroundImage="none";
}
function applyWaveSEQ(){   // 16×16グリッド：発音セル(ON)だけにそのトラックの全波形を表示
  if(typeof rowEls==="undefined") return;
  for(let i=0;i<rowEls.length;i++){ const url=trackWaveURL[i]||"", pat=getPattern(i);
    for(let s=0;s<STEPS;s++) setCellWave(rowEls[i][s], (pat[s]>0)?url:"", s); }
}
function applyWaveStrip(){ // 下段16ステップ列：選択トラックの発音セル(ON)だけ波形
  if(typeof stepBtns==="undefined" || !stepBtns.length) return;
  const url=trackWaveURL[selected]||"", pat=getPattern(selected);
  for(let s=0;s<STEPS;s++) setCellWave(stepBtns[s], (pat[s]>0)?url:"", s);
}
function buildAllTrackWaves(){ for(let i=0;i<PADS.length;i++) buildTrackWave(i); applyWaveSEQ(); applyWaveStrip(); }

// drawWave / positionHandles / プレイヘッド / ハンドルドラッグ は窓波形撤去により全廃。
// START/END/LOOP編集と試聴は EDIT+パッド→編集モーダルへ集約。

// 立ち上がり検出：startの近傍で「最初に音量が急増する点」へ吸着（食い込み防止）
function snapStartToOnset(idx=selected){
  const t=tracks[idx];
  if(!t.buffer)return;
  // 波形の先頭ごく近くに置いたときは吸着しない（頭をそのまま残す）
  if(t.start <= 0.005){ return; }
  const data=t.buffer.getChannelData(0);
  const N=data.length;
  const sr=t.buffer.sampleRate;
  const win=Math.max(4,Math.round(sr*0.002));   // 2ms窓
  const range=Math.round(sr*0.012);             // 探索 ±12ms に縮小
  const center=Math.round(t.start*N);
  const lo=Math.max(win,center-range), hi=Math.min(N-win-1,center+range);
  const rms=p=>{let s=0;for(let n=0;n<win;n++){const v=data[p+n];s+=v*v;}return Math.sqrt(s/win);};

  // 範囲内のピークRMSを基準に、その15%を超えた最初の点＝立ち上がりの足元に止める
  let peak=0;
  for(let p=lo;p<=hi;p++){const r=rms(p);if(r>peak)peak=r;}
  if(peak<0.01){ return; } // 明確なアタックなし→動かさない
  const thresh=peak*0.15;
  let onset=-1;
  for(let p=lo;p<=hi;p++){
    if(rms(p)>=thresh){ onset=p; break; }
  }
  if(onset>=0){ t.start=Math.min(onset/N, t.end-0.002); }
}

// エディタを選択パッドに同期
function syncEditor(){   // 値のUIは情報窓のページ1本になったので、ここは名前と波形だけ
  const t=tracks[selected];
  const ew=document.getElementById("edWho"); if(ew) ew.textContent=String(selected+1).padStart(2,"0")+" "+(PADS[selected].type==="sample"?t.name:PADS[selected].name);
  drawPadWave(selected);   // 窓波形の代わりにパッド内波形を更新
}
let _rsT=null;
["resize","orientationchange"].forEach(ev=>window.addEventListener(ev,()=>{
  clearTimeout(_rsT);
  _rsT=setTimeout(()=>{   // 連続リサイズで重い再描画を繰り返さない
    if(viewPadsEl.classList.contains("active")) drawAllPadWaves();
    if(typeof viewSeqEl!=="undefined" && viewSeqEl.classList.contains("active")){
      paintSteps();                                   // 往復した時と同じ経路を通す
      if(typeof applyWaveSEQ==="function") applyWaveSEQ();
    }
  },120);
}));

