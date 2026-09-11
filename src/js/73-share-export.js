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
    if(playing) playBtn.click();   // 一旦停止＝必ず頭から
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
async function applyProject(proj){
    // 読込前に鳴っている音を止め、ループ/予約状態をリセット（旧バッファの垂れ流し・状態ズレ防止）
    tracks.forEach(t=>{ stopVoices(t, AC.currentTime); t.loopPlaying=false; });
    queuedPat=null;
    // restore globals
    bpmVal=proj.bpm||100;
    document.getElementById("bpm").value=bpmVal;
    document.getElementById("bpmRead").textContent=bpmVal.toFixed(1);
    if(typeof setDelayTempo==="function") setDelayTempo();
    swingPct=proj.swing||50;
    document.getElementById("swing").value=swingPct;
    // comp
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
    // グループフェーダー・送りFX（旧ファイルに無ければ既定のまま）
    if(proj.groupVol){ for(let g=0;g<4;g++) groupVol[g]=proj.groupVol[g]??0; applyGroupVol(); }
    if(proj.fx){ fxDelayAmt=proj.fx.delayAmt??0; fxReverbAmt=proj.fx.reverbAmt??0; fxDelayOn=!!proj.fx.delayOn; fxReverbOn=!!proj.fx.reverbOn; applyFx(); }
    // tracks
    for(let i=0;i<Math.min(proj.tracks.length,16);i++){
      const pt=proj.tracks[i], t=tracks[i];
      t.name=pt.name||PADS[i].name;
      PADS[i].type=pt.type||"empty";
      PADS[i].voice=pt.voice||null;
      t.vol=pt.vol??-4; t.tune=pt.tune??0; t.scale=pt.scale??"off";
      t.start=pt.start??t.start??0; t.end=pt.end??t.end??1;   // 未指定はプリセットの自動トリム値を保持
      t.loop=pt.loop??t.loop??false; t.loopStart=pt.loopStart??t.loopStart??0;   // 未指定はプリセット既定を保持
      t.filter=pt.filter??"off"; t.cutoff=pt.cutoff??12000; t.reso=pt.reso??0.7;
      t.attack=pt.attack??0; t.fade=pt.fade??3; t.delaySend=pt.delaySend??0; t.reverbSend=pt.reverbSend??0; t.outBus=pt.outBus||"A"; t.midiNote=pt.midiNote??null; t.key=pt.key??null;
      t.choke=pt.choke??0; t.mute=pt.mute??false; t.solo=pt.solo??false;
      // パターン読込（新形式: patterns[p][小節][step] / 旧形式: patterns[p]=16数値 を1小節として吸収）
      if(pt.patterns) for(let p=0;p<4;p++){
        for(let bar=0;bar<4;bar++) t.patterns[p][bar]=new Array(STEPS).fill(0);
        const pat=pt.patterns[p];
        if(Array.isArray(pat)){
          if(typeof pat[0]==="number"){ t.patterns[p][0]=pat.slice(0,STEPS); }                 // 旧: 1小節
          else for(let bar=0;bar<4&&bar<pat.length;bar++) if(Array.isArray(pat[bar])) t.patterns[p][bar]=pat[bar].slice(0,STEPS);
        }
        for(let bar=0;bar<4;bar++) while(t.patterns[p][bar].length<STEPS) t.patterns[p][bar].push(0);
      }
      t.locks = pt.locks ? JSON.parse(JSON.stringify(pt.locks)) : {};   // p-lock
      // audio
      if(pt.audio){
        const wav=b64ToUint8(pt.audio);
        const ab=wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength);
        const decoded=await decodeAudio(ab);
        t.rawBuffer=decoded;
        t.buffer=makeLofi(decoded);
      }else if(pt.type==="empty"){
        t.buffer=null; t.rawBuffer=null;   // 空パッドとして保存されたものは、前に入っていた音を残さない（幽霊サンプル防止）
      }
      padsEl.children[i].querySelector(".nm").textContent=t.name.slice(0,8).toUpperCase();
      const rn=grid.children[i]?.querySelector(".rn");
      if(rn) rn.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b> ${t.name}`;
    }
    editPat=0; editBar=0;
    for(let i=0;i<PADS.length;i++) applyPadCategory(i);
    selectPad(0); paintPadStates(); paintSteps(); paintMixer(); paintPatBar(); drawAllPadWaves(); buildAllTrackWaves();
}
document.getElementById("projFile").addEventListener("change",async(e)=>{
  const f=e.target.files[0]; e.target.value=""; if(!f)return;
  try{
    const proj=JSON.parse(await f.text());
    if(!proj.version||!proj.tracks) throw new Error("Invalid project file");
    pushUndo();                       // Load 前へ戻れるように（＝自動保存の「変更あり」も立つ）
    await applyProject(proj);
    sampNameEl.textContent="LOADED — "+f.name.slice(0,12).toUpperCase();
    if(typeof autosaveNow==="function") autosaveNow(true);   // 読んだ直後に必ず書く。次回起動で「読む前」に戻らない
  }catch(err){ console.warn("[project load]",err); sampNameEl.textContent="LOAD FAILED — このファイルは読めない"; }
});
// iOS：accept=".mics,.json" は「種別の制限」として効き、iOS は .mics という拡張子を知らないため Files の中で
// .mics が灰色（選べない）になる。iOS では制限を外して何でも選べるようにし、中身は上の JSON 検証で弾く（§128 v0.3.115）
if(typeof IS_IOS!=="undefined" && IS_IOS){ const pf=document.getElementById("projFile"); if(pf) pf.removeAttribute("accept"); }

