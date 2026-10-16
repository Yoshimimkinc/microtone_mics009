// @module share-export
// @provides _expBlob, _expBusy, _expName, applyProject, shareOrDownload
// @uses AC, IS_IOS, STEPS, TICKS_PER_16TH, applyFx, applyGroupVol, applySetSnapshot, autosaveNow, bufToWav,
//    compDrive, compOn, compThreshold, editPat, finalClip, fxDelayAmt, fxDelayOn, fxReverbAmt, fxReverbOn,
//    groupVol, makeSatCurve, masterGain, multiOut, outBGain, patLength, playBtn, playing, pushUndo,
//    queuedPat, queuedSet, sampNameEl, saturator, setCompBypass, setCur, setHoldClear, setSlots,
//    setsFromProject, sideCount, sideStopAll, stopAllVoices, tickDur
// @depends layout
// ===== 共有：Web Share APIの共有シート（iPhone=AirDrop/LINE等へ直接）。非対応環境はダウンロードにフォールバック =====
async function shareOrDownload(blob, name){
  try{
    const f=new File([blob], name, {type: blob.type||"application/octet-stream"});
    if(navigator.canShare && navigator.canShare({files:[f]})){
      await navigator.share({files:[f]});
      sampNameEl.textContent="Shared → "+name;
      return;
    }
  }catch(e){ if(e && e.name==="AbortError"){ sampNameEl.textContent="共有をキャンセル"; return; } }
  const url=URL.createObjectURL(blob); const a=document.createElement("a");
  a.href=url; a.download=name; a.click(); URL.revokeObjectURL(url);
  sampNameEl.textContent="Saved → "+name;
}
// ===== WAV書き出し：編集中パターンを頭から1ループ、マスター出力を実時間キャプチャ =====
let _expBusy=false, _expBlob=null, _expName=null;
document.getElementById("exportWavBtn").addEventListener("click",async()=>{
  if(_expBlob){   // 2タップ目＝共有（share()はユーザー操作中しか呼べないため）
    const b2=_expBlob, n2=_expName; _expBlob=null; _expName=null;
    document.getElementById("exportWavBtn").textContent="WAV ↓";
    shareOrDownload(b2, n2); return;
  }
  if(_expBusy) return; _expBusy=true;
  try{
    if(AC.state!=="running") await AC.resume();
    if(playing || (typeof sideCount==="function" && sideCount()>0)) playBtn.click();   // 一旦停止＝必ず頭から（SET で他のセットが鳴っていても全部止める v0.3.147）
    await new Promise(r=>setTimeout(r,80));
    const bars=patLength(editPat);
    const dur=bars*STEPS*TICKS_PER_16TH*tickDur() + 0.6;   // ＋ディレイ/リバーブのテール
    if(multiOut) outBGain.connect(finalClip);   // 書き出し中だけOUT BをAへ合流＝Bのパッドが無言で欠落しない
    const tapG=AC.createGain(); finalClip.connect(tapG);
    const sp=AC.createScriptProcessor(4096,1,1);
    const chunks=[]; sp.onaudioprocess=ev=>chunks.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
    const mute=AC.createGain(); mute.gain.value=0;
    tapG.connect(sp); sp.connect(mute); mute.connect(AC.destination);
    sampNameEl.textContent="EXPORT — "+bars+"小節を書き出し中…";
    playBtn.click();               // 頭から再生
    await new Promise(r=>setTimeout(r, dur*1000));
    if(playing) playBtn.click();   // 停止
    sp.onaudioprocess=null;
    try{ if(multiOut) outBGain.disconnect(finalClip); }catch(_){}
    try{ finalClip.disconnect(tapG); tapG.disconnect(); sp.disconnect(); mute.disconnect(); }catch(_){}
    const n=chunks.reduce((a,c)=>a+c.length,0);
    const full=new Float32Array(n); let o=0;
    for(const c of chunks){ full.set(c,o); o+=c.length; }
    let head=0; while(head<full.length && Math.abs(full[head])<0.0005) head++;   // 頭の無音（再生開始前）を落とす
    head=Math.max(0, head-Math.round(AC.sampleRate*0.02));
    const buf=AC.createBuffer(1, Math.max(1,n-head), AC.sampleRate);
    buf.getChannelData(0).set(full.subarray(head));
    const wav=bufToWav(buf, 0, buf.length);
    const blob=new Blob([wav],{type:"audio/wav"});
    const dt=new Date(), z=x=>String(x).padStart(2,"0");
    const nm="mics009-"+String(dt.getFullYear()).slice(2)+z(dt.getMonth()+1)+z(dt.getDate())+"-"+z(dt.getHours())+z(dt.getMinutes())+".wav";
    _expBlob=blob; _expName=nm;
    document.getElementById("exportWavBtn").textContent="↑ 共有 / 保存";
    sampNameEl.textContent="書き出し完了 — もう一度タップで共有/保存";
  }catch(e){ sampNameEl.textContent="EXPORT ERROR — 書き出せなかった"; }
  _expBusy=false;
});

// LOAD
document.getElementById("loadProjBtn").addEventListener("click",()=>{
  document.getElementById("projFile").click();
});
async function applyProject(proj, opts){
    // v0.3.144 §145：ファイル全体 = 16 セット。v3 は sets[16] と cur、v2 / 既定プロジェクトは丸ごと SET 1（他は既定のキット）。
    // opts：deferPaint=重い再描画を次フレームへ／stopAt=古い音を止める時刻／keepSel=選択パッドを保つ
    stopAllVoices((opts&&opts.stopAt)||AC.currentTime);
    if(typeof sideStopAll==="function"){ sideStopAll((opts&&opts.stopAt)||AC.currentTime); setHoldClear(); }   // 他のセットの再生も（中身が差し替わる）
    queuedPat=null;
    // 本体の状態（comp / master / グループ / 送り FX）＝セットを跨いで 1 つ
    if(proj.comp){
      compThreshold=proj.comp.threshold; compDrive=proj.comp.drive;
      compOn=proj.comp.on;
      document.getElementById("compToggle").classList.toggle("on",compOn);
      document.getElementById("kComp").value=compThreshold;
      document.getElementById("vComp").textContent=compThreshold;
      document.getElementById("kDrive").value=Math.round(compDrive*10);
      document.getElementById("vDrive").textContent=compDrive.toFixed(1);
      setCompBypass(compOn);
      saturator.curve=makeSatCurve(compDrive);
    }
    if(proj.masterVol!=null){
      document.getElementById("kMaster").value=proj.masterVol;
      masterGain.gain.value=Math.pow(10,proj.masterVol/20);
      document.getElementById("vMaster").textContent=proj.masterVol+" dB";
    }
    if(proj.groupVol){ for(let g=0;g<4;g++) groupVol[g]=proj.groupVol[g]??0; applyGroupVol(); }
    if(proj.fx){ fxDelayAmt=proj.fx.delayAmt??0; fxReverbAmt=proj.fx.reverbAmt??0; fxDelayOn=!!proj.fx.delayOn; fxReverbOn=!!proj.fx.reverbOn; applyFx(); }
    // 16 セット（音を復号）→ いまのセットを live へ
    const r=await setsFromProject(proj);
    setSlots=r.slots; setCur=r.cur; queuedSet=null;
    applySetSnapshot(setSlots[setCur], opts);
}
document.getElementById("projFile").addEventListener("change",async(e)=>{
  const f=e.target.files[0]; e.target.value=""; if(!f)return;
  try{
    const proj=JSON.parse(await f.text());
    if(!proj.version||!(proj.tracks||Array.isArray(proj.sets))) throw new Error("Invalid project file");   // v2（tracks）／v3（sets）
    pushUndo();                       // Load 前へ戻れるように（＝自動保存の「変更あり」も立つ）
    await applyProject(proj);
    sampNameEl.textContent="LOADED — "+f.name.slice(0,12).toUpperCase();
    if(typeof autosaveNow==="function") autosaveNow(true);   // 読んだ直後に必ず書く。次回起動で「読む前」に戻らない
  }catch(err){ console.warn("[project load]",err); sampNameEl.textContent="LOAD FAILED — このファイルは読めない"; }
});
// iOS：accept=".mics,.json" は「種別の制限」として効き、iOS は .mics という拡張子を知らないため Files の中で
// .mics が灰色（選べない）になる。iOS では制限を外して何でも選べるようにし、中身は上の JSON 検証で弾く（§128 v0.3.115）
if(typeof IS_IOS!=="undefined" && IS_IOS){ const pf=document.getElementById("projFile"); if(pf) pf.removeAttribute("accept"); }

