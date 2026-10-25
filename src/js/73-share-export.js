// @module share-export
// @provides _expBlob, _expBusy, _expName, applyProject, loadFileData, shareOrDownload, validateStageData
// @uses AC, IS_IOS, STEPS, TICKS_PER_16TH, applyFx, applyGroupVol, applySeqData, applySetSnapshot,
//    autosaveNow, bufToWav, compDrive, compOn, compThreshold, editPat, finalClip, fxDelayAmt, fxDelayOn,
//    fxReverbAmt, fxReverbOn, groupVol, loadSetData, makeSatCurve, masterGain, multiOut, outBGain,
//    paintPadStates, paintPatBar, paintPerf, paintSteps, patLength, playBtn, playing, pushUndo, queuedPat,
//    queuedSet, refreshStepWaves, sampNameEl, saturator, saveScope, seqFromSetData, setCompBypass, setCur,
//    setHoldClear, setName, setSetLevel, setSlots, setsFromProject, sideCount, sideStopAll, stopAllVoices,
//    tickDur
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
function validateStageData(proj){
  const number=(v,label,min,max)=>{if(v!=null&&(!Number.isFinite(v)||v<min||v>max))throw new Error(label+"の値が不正です");};
  if(!proj||![2,3].includes(proj.version))throw new Error("未対応のSTAGE形式です");
  if(proj.comp){number(proj.comp.threshold,"COMP",-100,0);number(proj.comp.drive,"DRIVE",0,100);}
  number(proj.masterVol,"MASTER",-100,24);
  const sets=Array.isArray(proj.sets)?proj.sets:[proj];
  if(!sets.length||sets.length>16)throw new Error("SET数が不正です");
  if(proj.sets){number(proj.cur,"SET位置",0,sets.length-1);if(proj.cur!=null&&!Number.isInteger(proj.cur))throw new Error("SET位置が不正です");if(!sets[proj.cur||0])throw new Error("現在のSETがありません");}
  for(const sd of sets){if(sd==null)continue;
    if(!Array.isArray(sd.tracks)||sd.tracks.length!==16)throw new Error("SETには16パッドが必要です");
    number(sd.bpm,"BPM",40,250);number(sd.swing,"SWING",0,100);
    for(const t of sd.tracks){
      if(!t||typeof t!=="object")throw new Error("パッドの構造が不正です");
      if(t.name!=null&&typeof t.name!=="string")throw new Error("パッド名が不正です");
      for(const k of ["vol","tune","start","end","loopStart","cutoff","reso","attack","fade","delaySend","reverbSend","choke"])
        if(t[k]!=null&&!Number.isFinite(t[k]))throw new Error(k+"の値が不正です");
      if(t.audio!=null&&(typeof t.audio!=="string"||t.audio.length>140*1024*1024))throw new Error("音声データが不正です");
      if(t.filter!=null&&!["off","lp","hp"].includes(t.filter))throw new Error("FILTERの種類が不正です");
      if(t.patterns!=null){if(!Array.isArray(t.patterns)||t.patterns.length>4)throw new Error("パターンが不正です");for(const pat of t.patterns){if(!Array.isArray(pat))throw new Error("パターンが不正です");const rows=typeof pat[0]==="number"?[pat]:pat;if(rows.length>4)throw new Error("小節数が不正です");for(const row of rows)if(!Array.isArray(row)||row.length>16||row.some(v=>!Number.isFinite(v)||v<0||v>128))throw new Error("ノート列が不正です");}}
      if(t.keyPhrase!=null&&(!Array.isArray(t.keyPhrase.notes)||t.keyPhrase.notes.length>512))throw new Error("KEY演奏データが不正です");
    }
  }
}
async function applyProject(proj, opts){
    validateStageData(proj);
    const r=await setsFromProject(proj); // 復号失敗時は現在の音・設定を変更しない
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
    setSlots=r.slots; setCur=r.cur; queuedSet=null;
    if(typeof setSetLevel==="function"){ const ss=Array.isArray(proj.sets)?proj.sets:[]; for(let k=0;k<16;k++) setSetLevel(k, (ss[k]&&+ss[k].level)||0); }   // ミックス音量（v0.3.151。v2 は 0）
    applySetSnapshot(setSlots[setCur], opts);
}
// 読み込み先を決める（v0.3.162 §156）：ファイルの種類（stage / set / seq）とメニューの単位（saveScope）の小さいほうへ。
// SEQ のファイル → 編集中のパターンへ。SET のファイル → いまのセットへ（単位が SEQ なら、そのセットから編集中と同じ文字のパターンだけ）。
// STAGE のファイル → 単位 STAGE なら全体、SET ならファイルのいまのセットをいまのセットへ、SEQ ならそのセットの同じ文字のパターンを編集中のパターンへ。
// どれも Load の前へ ↩ で戻れる（pushUndo）
async function loadFileData(proj, scope){
  if(!proj || !proj.version) throw new Error("Invalid project file");
  const kind=(proj.kind==="set"||proj.kind==="seq") ? proj.kind : "stage";
  if(kind==="stage" && !(proj.tracks||Array.isArray(proj.sets))) throw new Error("Invalid project file");   // v2（tracks）／v3（sets）
  const L="ABCD"[editPat], sn=String(setCur+1).padStart(2,"0");
  const fileSet = kind==="set" ? proj.set : (kind==="stage" ? (Array.isArray(proj.sets) ? proj.sets[+proj.cur||0] : proj) : null);
  if(kind==="seq" || scope==="seq"){
    const trs = kind==="seq" ? proj.tracks : seqFromSetData(fileSet, editPat);
    if(!Array.isArray(trs)) throw new Error("Invalid sequence");
    pushUndo(); applySeqData(editPat, trs);
    paintSteps(); paintPatBar(); paintPadStates(); if(typeof refreshStepWaves==="function") refreshStepWaves(); if(typeof paintPerf==="function") paintPerf();
    return "LOADED SEQ → SET "+sn+" の "+L;
  }
  if(kind==="set" || scope==="set"){
    if(!fileSet || !Array.isArray(fileSet.tracks)) throw new Error("Invalid set");
    pushUndo(); await loadSetData(fileSet);
    return "LOADED SET → SET "+sn+"（"+setName(setCur)+"）";
  }
  pushUndo();                       // Load 前へ戻れるように（＝自動保存の「変更あり」も立つ）
  await applyProject(proj);
  return null;
}
document.getElementById("projFile").addEventListener("change",async(e)=>{
  const f=e.target.files[0]; e.target.value=""; if(!f)return;
  try{
    const proj=JSON.parse(await f.text());
    const msg=await loadFileData(proj, (typeof saveScope==="function") ? saveScope() : "stage");
    sampNameEl.textContent=msg || ("LOADED — "+f.name.slice(0,12).toUpperCase());
    if(typeof autosaveNow==="function") autosaveNow(true);   // 読んだ直後に必ず書く。次回起動で「読む前」に戻らない
  }catch(err){ console.warn("[project load]",err); sampNameEl.textContent="LOAD FAILED — このファイルは読めない"; }
});
// iOS：accept=".mics,.json" は「種別の制限」として効き、iOS は .mics という拡張子を知らないため Files の中で
// .mics が灰色（選べない）になる。iOS では制限を外して何でも選べるようにし、中身は上の JSON 検証で弾く（§128 v0.3.115）
if(typeof IS_IOS!=="undefined" && IS_IOS){ const pf=document.getElementById("projFile"); if(pf) pf.removeAttribute("accept"); }
// 音の取り込み（#samp）も同じ（v0.3.155 §148）：「クラウドにあるファイルが選べない」。accept="audio/*,video/*" は iOS の Files で
// 種別の制限になり、Dropbox などクラウドにしか無いファイルは種別がまだ「データ」としか分からず灰色になる。iOS では外し、中身はデコードで確かめる（NO AUDIO）
if(typeof IS_IOS!=="undefined" && IS_IOS){ const sp=document.getElementById("samp"); if(sp) sp.removeAttribute("accept"); }

