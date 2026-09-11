// ===== SAMPLING (Tab Audio / Mic) =====
const recOverlay=document.getElementById("recOverlay");
recOverlay.addEventListener("pointerdown",e=>e.stopPropagation());
recOverlay.addEventListener("click",e=>e.stopPropagation());
const extractOverlayEl=document.getElementById("extractOverlay");
extractOverlayEl.addEventListener("pointerdown",e=>e.stopPropagation());
const recChoose=document.getElementById("recChoose");
const recActiveEl=document.getElementById("recActive");
const recTargetEl=document.getElementById("recTarget");
let recStream=null, recStartMs=0, recTimerId=null;
let pcmSrc=null, pcmTap=null, pcmMute=null, pcmChunks=[], pcmLen=0;
let pcmPeak=0, recTakeN=0;   // 録音レベルメーター＋テイク連番
let _resampling=false;       // Resample＝マスター出力(finalClip)を録る（SP-404流）
let _lastRecWasResample=false;   // finalizeRecでの正規化判定用（Resampleは聴こえたままの音量が正）   // 生PCM直採り（MediaRecorder/デコード非依存）

// ストリップからの録音/読込は「最後に叩いたパッド」を黙って潰さない：空きがあればそちらへ
function pickCaptureTarget(){
  if(PADS[selected].type==="empty") return;
  const e=PADS.findIndex(p=>p.type==="empty");
  if(e>=0) selectPad(e);
}
function openSampleOverlay(){
  recOverlay.classList.add("show");
  recChoose.style.display="flex"; recActiveEl.style.display="none";
  recTargetEl.textContent="→ PAD "+String(selected+1).padStart(2,"0")+" に取り込み";   // 取り込み先をパネル内に明示（浮きトーストでモーダルと重ねない）
}
document.getElementById("sampleBtn").addEventListener("click",()=>{ pickCaptureTarget(); openSampleOverlay(); });
// EDITモーダル内の LOAD / ● SMPL：編集中パッド(peTarget)を取り込み先にして既存フローを再利用
(function(){
  const pl=document.getElementById("peLoadBtn"), ps=document.getElementById("peSmplBtn");
  if(pl) pl.addEventListener("click",()=>{ selected=peTarget; document.getElementById("samp").click(); });
  if(ps) ps.addEventListener("click",()=>{ selected=peTarget; openSampleOverlay(); });
})();
document.getElementById("recResmp").addEventListener("click",()=>{ _resampling=true; startRec(); });
// ===== Guitar（GTR）から録る：同一オリジンiframeで演奏→PCMをpostMessageで受領（画面遷移なし＝ビートを失わない） =====
let _gtrFrame=null;
function closeGtrFrame(){ if(_gtrFrame){ _gtrFrame.remove(); _gtrFrame=null; } }
window.addEventListener("keydown",e=>{ if(e.key==="Escape" && _gtrFrame) closeGtrFrame(); });
document.getElementById("recGtr").addEventListener("click",()=>{
  recOverlay.classList.remove("show");
  const wrap=document.createElement("div");
  wrap.style.cssText="position:fixed;inset:0;z-index:10001;background:#121417;";
  const f=document.createElement("iframe");
  f.src="guitar-strum.html?embed=1&v="+APP_VERSION;
  f.style.cssText="border:0;width:100%;height:100%;";
  f.setAttribute("allow","autoplay");
  const x=document.createElement("button");
  x.textContent="✕";
  x.style.cssText="position:absolute;top:calc(10px + env(safe-area-inset-top));right:calc(10px + env(safe-area-inset-right));"+
    "z-index:2;width:40px;height:40px;border-radius:8px;border:1px solid #32383f;background:rgba(13,16,19,.85);color:#8b919a;font-size:16px;cursor:pointer;";
  x.addEventListener("click",closeGtrFrame);   // iframeが読めない/固まっても必ず脱出できる
  wrap.appendChild(f); wrap.appendChild(x); document.body.appendChild(wrap);
  _gtrFrame=wrap;
});
window.addEventListener("message", async(e)=>{
  if(e.origin!==location.origin || !e.data) return;
  if(e.data.type==="gtr-cancel"){ closeGtrFrame(); return; }
  if(e.data.type==="gtr-beat"){ playBtn.click(); return; }   // GTR画面からビート再生/停止（オーバーダブ用モニター）
  if(e.data.type!=="gtr-take") return;
  closeGtrFrame();
  try{
    let pcm=new Float32Array(e.data.pcm);
    if(e.data.sr && Math.abs(e.data.sr-AC.sampleRate)>1){   // AC間のSR差は線形リサンプルで吸収（通常は同一）
      const ratio=AC.sampleRate/e.data.sr, m=Math.floor(pcm.length*ratio), out=new Float32Array(m);
      for(let i=0;i<m;i++){ const x=i/ratio, k=Math.floor(x), fr=x-k; out[i]=(pcm[k]||0)*(1-fr)+(pcm[k+1]||0)*fr; }
      pcm=out;
    }
    pcmChunks=[pcm]; pcmLen=pcm.length; _lastRecWasResample=true;   // 合成音＝聴こえたまま（正規化しない）
    await finalizeRec();   // 共通経路：makeLofi→パッド→EDITモーダル（波形編集）へ
    const t=tracks[selected];
    if(t && t.buffer){
      t.name=(e.data.label||"GTR").slice(0,10);
      padsEl.children[selected].querySelector(".nm").textContent=t.name;
      sampNameEl.textContent="Sampled! "+t.name+" → PAD "+String(selected+1).padStart(2,"0");
      refreshOpenPadEdit(selected);
    }
  }catch(_){ sampNameEl.textContent="IMPORT ERROR — GTRから受け取れなかった"; }
});
document.getElementById("recCancel").addEventListener("click",()=>{ stopRec(true); });
document.getElementById("recTab").addEventListener("click",async()=>{
  try{
    recStream=await navigator.mediaDevices.getDisplayMedia({audio:true,video:true});
  }catch(e){
    sampNameEl.textContent="NO SIGNAL — タブ音声を共有できなかった";
    recOverlay.classList.remove("show"); return;
  }
  // 音声トラックがあるか確認
  if(recStream.getAudioTracks().length===0){
    sampNameEl.textContent="NO SIGNAL — タブ音声の共有にチェック";
    recStream.getTracks().forEach(t=>t.stop()); recStream=null;
    recOverlay.classList.remove("show"); return;
  }
  // 音声トラックだけ抽出（映像を含むとdecodeAudioDataが失敗する）
  const audioOnly=new MediaStream(recStream.getAudioTracks());
  recStream.getVideoTracks().forEach(t=>t.stop());
  recStream=audioOnly;
  startRec();
});
document.getElementById("recMic").addEventListener("click",async()=>{
  try{
    // 通話用処理(AEC/オートゲイン/ノイズ抑制)は必ずOFF。
    // ONだとブラウザが「通話中」とみなしスピーカー出力全体をダッキング＝全体音量が落ちる。
    // サンプラーは生信号が欲しいので3つとも無効化（録り音もクリーン）。
    recStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,autoGainControl:false,noiseSuppression:false}});
  }
  catch(e){
    sampNameEl.textContent="MIC OFFLINE — マイク権限を確認";
    recOverlay.classList.remove("show"); return;
  }
  startRec();
});
function startRec(){
  recChoose.style.display="none"; recActiveEl.style.display="flex";
  pcmChunks=[]; pcmLen=0; recStartMs=performance.now();
  // iOS: マイク取得でオーディオセッションが切替わりACがsuspended/interruptedになることがある
  try{ AC.resume(); }catch(_){}
  try{
    if(_resampling){ pcmSrc=AC.createGain(); finalClip.connect(pcmSrc); }   // マスター出力を録る（専用タップ＝切断安全）
    else pcmSrc=AC.createMediaStreamSource(recStream);
  }
  catch(e){ sampNameEl.textContent="INPUT ERROR — 入力をつなげなかった"; stopRec(true); return; }
  // MediaRecorder/decodeAudioDataを使わず生PCMをWeb Audioで直接取る
  // ＝コーデック/デコードのブラウザ依存ゼロ（iOS Safariの録音不能対策）。SRも常にAC.sampleRateで一致
  pcmTap=AC.createScriptProcessor(4096,1,1);
  pcmTap.onaudioprocess=ev=>{
    const d=ev.inputBuffer.getChannelData(0);
    let bp=0; for(let k=0;k<d.length;k+=8){ const a=Math.abs(d[k]); if(a>bp)bp=a; }
    pcmPeak=bp;   // レベルメーター用（間引きpeak）
    pcmChunks.push(new Float32Array(d));
    pcmLen+=4096;
    if(pcmLen>AC.sampleRate*60) stopRec(false);   // 60s安全上限（メモリ保護）
  };
  pcmMute=AC.createGain(); pcmMute.gain.value=0;   // tapを駆動しつつモニタは無音＝ハウリング防止
  pcmSrc.connect(pcmTap); pcmTap.connect(pcmMute); pcmMute.connect(AC.destination);
  recTimerId=setInterval(()=>{
    const s=((performance.now()-recStartMs)/1000).toFixed(1);
    document.getElementById("recTime").textContent=s+"s";
    const m=document.getElementById("recMeter");
    if(m){ m.style.width=Math.min(100,pcmPeak*140)+"%"; m.style.background=pcmPeak>0.9?"var(--red)":"var(--teal)"; }
  },100);
}
document.getElementById("recStop").addEventListener("click",()=>stopRec(false));
function stopRec(cancel){
  clearInterval(recTimerId);
  try{ if(_resampling && pcmSrc) finalClip.disconnect(pcmSrc); }catch(_){}
  _lastRecWasResample=_resampling; _resampling=false;
  try{ if(pcmSrc)pcmSrc.disconnect(); if(pcmTap){pcmTap.onaudioprocess=null;pcmTap.disconnect();} if(pcmMute)pcmMute.disconnect(); }catch(_){}
  pcmSrc=pcmTap=pcmMute=null;
  if(recStream){recStream.getTracks().forEach(t=>t.stop());recStream=null;}
  recOverlay.classList.remove("show");
  // iOS: マイク解放後もオーディオセッションが「通話モード」(レシーバ出力/低音の出ない経路)に残ることがある
  // ＝録音後に全体の低音が消え音質が薄くなる正体（アプリ内DSPは実測60Hz通過率1.000＝低音損失ゼロ）。
  // suspend→resumeのサイクルで出力経路をスピーカーへ再交渉させる（必要なのはiOSのみ＝iOS限定でリスク最小化）
  if(/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1)){
    (async()=>{ try{ await AC.suspend(); await AC.resume(); }catch(_){ try{ AC.resume(); }catch(__){} } })();
  } else { try{ AC.resume(); }catch(_){} }
  if(cancel){ pcmChunks=[]; pcmLen=0; }
  else finalizeRec();
}
async function finalizeRec(){
  const n=pcmChunks.reduce((a,c)=>a+c.length,0);
  if(n===0){
    sampNameEl.textContent="NO TAKE — 録音データが空だった";
    pcmChunks=[]; pcmLen=0; return;
  }
  try{
    const buf=AC.createBuffer(1,n,AC.sampleRate);
    const d=buf.getChannelData(0); let o=0;
    for(const c of pcmChunks){ d.set(c,o); o+=c.length; }
    pcmChunks=[]; pcmLen=0;
    if(isSilent(buf)){   // 無音録音で既存パッドを潰さない＆原因を伝える（マイク権限/AEC/入力レベル）
      sampNameEl.textContent="SILENT TAKE — 入力レベルを確認";
      return;
    }
    // iOSはAGC無効(v0.3.37ダッキング対策)の生マイク＝レベルが小さい上、小信号の12bit化はザラつく。
    // →ピークを-1dBFS(0.9)へ自動ノーマライズ（上限+30dB＝ノイズだけの増幅は防ぐ）。Resampleは聴こえたまま＝対象外
    if(!_lastRecWasResample){
      const d=buf.getChannelData(0); let pk=0;
      for(let i=0;i<d.length;i++){ const a=Math.abs(d[i]); if(a>pk)pk=a; }
      if(pk>0.0005 && pk<0.9){
        const g=Math.min(0.9/pk, 31.6);
        for(let i=0;i<d.length;i++) d[i]*=g;
      }
    }
    pushUndo();
    tracks[selected].rawBuffer=buf;
    tracks[selected].buffer=makeLofi(buf);
    tracks[selected].start=0;tracks[selected].end=1;
    tracks[selected].loop=false;tracks[selected].loopStart=0;
    PADS[selected].type="sample";
    applyPadCategory(selected);
    const tn="TAKE "+(++recTakeN);   // 録るたびに名前が育つ（REC固定だとテイクの記憶が残らない）
    tracks[selected].name=tn;
    padsEl.children[selected].querySelector(".nm").textContent=tn;
    sampNameEl.textContent="Sampled! "+tn+" → PAD "+String(selected+1).padStart(2,"0")+" ("+(n/AC.sampleRate).toFixed(1)+"s)";
    selectPad(selected);   // 録音先パッドへフォーカス（読込時と挙動を揃える）
    drawPadWave(selected);
    if(typeof syncEditor==="function") syncEditor();
    openPadEdit(selected);   // 取り込み後は即EDIT＝波形で範囲(STRT/END)を指定→TRIMできる
  }catch(e){
    sampNameEl.textContent="IMPORT ERROR — 取り込めなかった";
  }
}

