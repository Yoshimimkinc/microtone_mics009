// ===== Sound A/B トグル（メニュー） =====
(function(){
  const dac=document.getElementById("dacLofiToggle");
  if(dac) dac.addEventListener("click",()=>{
    const on=!dac.classList.contains("on"); dac.classList.toggle("on",on);
    if(spDacNode) try{ spDacNode.port.postMessage({bypass:!on}); }catch(_){}   // ON=2段(DAC有効) / OFF=1段(素通り)
    sampNameEl.textContent = on ? "VINTAGE DAC ON" : "VINTAGE DAC OFF";
  });
  const spf=document.getElementById("spFilterToggle");
  if(spf) spf.addEventListener("click",()=>{
    spChFilterOn=!spf.classList.contains("on"); spf.classList.toggle("on",spChFilterOn);
    if(typeof applySpChFilter==="function") applySpChFilter();
    sampNameEl.textContent = spChFilterOn ? "SP チャンネルフィルター ON（出力ch別の丸み）" : "SP チャンネルフィルター OFF（素通し）";
  });
  const fat=document.getElementById("fatBassToggle");
  if(fat) fat.addEventListener("click",()=>{
    const on=!fat.classList.contains("on"); fat.classList.toggle("on",on);
    applyFatBass(on);
    sampNameEl.textContent = on ? "FAT BASS ON（低域 +2dB・倍音 多め）" : "FAT BASS OFF（v0.3.113 までの音）";
  });
  const mot=document.getElementById("multiOutToggle");
  if(mot) mot.addEventListener("click",()=>{
    if(!multiOut){
      initMultiOut();
      mot.classList.toggle("on", multiOut);
      if(!multiOut) sampNameEl.textContent="OUT B — 4ch出力が見つからない";
    } else {   // OFF: channelCountには触らずマージャの付け外しだけ＝安全に戻せる
      try{
        mainOut.disconnect(_outMerger); outBGain.disconnect(_outMerger);
        _outMerger.disconnect(); _outMerger=null;
        mainOut.connect(AC.destination);
        multiOut=false; mot.classList.remove("on");
        sampNameEl.textContent="OUT B — OFF";
      }catch(_){ sampNameEl.textContent="OUT B — 切替に失敗"; }
    }
  });
  const ms2=document.getElementById("midiSyncToggle");
  if(ms2) ms2.addEventListener("click",()=>{
    midiSync=!ms2.classList.contains("on"); ms2.classList.toggle("on",midiSync);
    _ckTimes=[]; _ckUiT=0;
    sampNameEl.textContent = midiSync ? "MIDI SYNC ON — 外部機器のテンポ/スタートに追従" : "MIDI SYNC OFF";
  });
  const mi=document.getElementById("midiToggle");
  if(mi) mi.addEventListener("click",()=>{
    midiEnabled=!mi.classList.contains("on"); mi.classList.toggle("on",midiEnabled);
    _midiNoteTimes=[];
    sampNameEl.textContent = midiEnabled ? "MIDI入力 ON" : "MIDI入力 OFF（外部機器のノートを無視）";
  });
  const mt=document.getElementById("metroToggle");
  if(mt) mt.addEventListener("click",()=>{
    metroOn=!mt.classList.contains("on"); mt.classList.toggle("on",metroOn);
    sampNameEl.textContent = metroOn ? "METRONOME ON（拍頭クリック）" : "METRONOME OFF";
  });
  const lp=document.getElementById("loopSnapToggle");
  if(lp) lp.addEventListener("click",()=>{
    loopZeroSnap=!lp.classList.contains("on"); lp.classList.toggle("on",loopZeroSnap);
    sampNameEl.textContent = loopZeroSnap ? "ループ点ゼロ交差スナップ ON" : "ループ点スナップ OFF";
  });
})();

// ---------- メニュー（ケバブ→モーダル） DADS dialog 準拠 ----------
(function(){
  const modal=document.getElementById("menuModal"), btn=document.getElementById("menuBtn"), closeBtn=document.getElementById("menuClose");
  let lastFocus=null;
  function open(){
    lastFocus=document.activeElement;
    if(typeof paintLatency==="function") paintLatency();
    modal.style.display="flex";
    closeBtn.focus();                       // フォーカスをダイアログ内へ
    document.addEventListener("keydown",onKey);
  }
  function close(){
    modal.style.display="none";
    document.removeEventListener("keydown",onKey);
    if(lastFocus&&lastFocus.focus) lastFocus.focus();   // フォーカス復帰
  }
  function onKey(e){
    if(e.key==="Escape"){ close(); return; }
    if(e.key==="Tab"){    // 簡易フォーカストラップ
      const f=modal.querySelectorAll('button,select,input,[tabindex]:not([tabindex="-1"])');
      if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  }
  btn.addEventListener("click",open);
  closeBtn.addEventListener("click",close);
  modal.addEventListener("click",e=>{ if(e.target===modal) close(); });   // 背景クリックで閉じる
})();

