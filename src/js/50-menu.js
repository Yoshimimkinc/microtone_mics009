// @module menu
// @provides -
// @uses AC, _ckTimes, _ckUiT, _midiNoteTimes, _outMerger, applyFatBass, applySpChFilter, initMultiOut,
//    loopZeroSnap, mainOut, metroOn, midiEnabled, midiSync, multiOut, outBGain, paintLatency, sampNameEl,
//    setSpDacBypass, setSpTune, spChFilterOn
// @depends -
// ===== Sound A/B トグル（メニュー） =====
(function(){
  const dac=document.getElementById("dacLofiToggle");
  if(dac) dac.addEventListener("click",()=>{
    const on=!dac.classList.contains("on"); dac.classList.toggle("on",on);
    if(typeof setSpDacBypass==="function") setSpDacBypass(!on);   // ON=DAC有効（グループごと v0.3.231） / OFF=素通り
    sampNameEl.textContent = on ? "VINTAGE DAC ON" : "VINTAGE DAC OFF";
  });
  const spf=document.getElementById("spFilterToggle");
  if(spf) spf.addEventListener("click",()=>{
    spChFilterOn=!spf.classList.contains("on"); spf.classList.toggle("on",spChFilterOn);
    if(typeof applySpChFilter==="function") applySpChFilter();
    sampNameEl.textContent = spChFilterOn ? "SP チャンネルフィルター ON（出力ch別の丸み）" : "SP チャンネルフィルター OFF（素通し）";
  });
  // SP TUNING（v0.3.231 §221）：PITCH -1〜-8 を実機の実測の比に（OFF＝平均律）
  const stn=document.getElementById("spTuneToggle");
  if(stn) stn.addEventListener("click",()=>{
    const on=!stn.classList.contains("on"); stn.classList.toggle("on",on);
    setSpTune(on);
    sampNameEl.textContent = on ? "SP TUNING ON（下げた音程が実機の実測値）" : "SP TUNING OFF（平均律）";
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
  // ジャンルごとのドリルダウン（v0.3.237 §227）：c＝ジャンル（null＝一覧）。見せるのは一覧か、そのジャンルの .modal-sec だけ
  const dlg=modal.querySelector(".modal"), cats=document.getElementById("menuCats"), back=document.getElementById("menuBack"), title=document.getElementById("menuTitle");
  let lastCat=null;
  function menuPage(c){
    const b=c ? cats.querySelector('.menu-cat[data-cat="'+c+'"]') : null;
    if(c && !b) c=null;
    dlg.dataset.page=c||"top";
    modal.querySelectorAll(".modal-sec").forEach(s=>{ s.hidden = s.dataset.cat!==c; });
    cats.hidden=!!c; back.hidden=!c;
    title.textContent = c ? b.querySelector("b").textContent : "MENU";
    dlg.scrollTop=0;
    if(c){ lastCat=c; if(c==="master" && typeof paintLatency==="function") paintLatency(); }
    if(modal.style.display==="flex"){ const f=c ? back : (cats.querySelector('.menu-cat[data-cat="'+lastCat+'"]')||closeBtn); if(f&&f.focus) f.focus(); }
  }
  function open(){
    lastFocus=document.activeElement;
    if(typeof paintLatency==="function") paintLatency();
    modal.style.display="flex";
    lastCat=null; menuPage(null);           // 開くたびに一覧から（どこに居るか迷わない）
    closeBtn.focus();                       // フォーカスをダイアログ内へ
    document.addEventListener("keydown",onKey);
  }
  function close(){
    modal.style.display="none";
    document.removeEventListener("keydown",onKey);
    if(lastFocus&&lastFocus.focus) lastFocus.focus();   // フォーカス復帰
  }
  function onKey(e){
    if(e.key==="Escape"){ if(dlg.dataset.page!=="top") menuPage(null); else close(); return; }   // ジャンルの中では一覧へ戻る、一覧では閉じる
    if(e.key==="Tab"){    // 簡易フォーカストラップ（見えているものだけ）
      const f=[...modal.querySelectorAll('button,select,input,summary,[tabindex]:not([tabindex="-1"])')].filter(el=>el.offsetParent!==null);
      if(!f.length) return;
      const first=f[0], last=f[f.length-1];
      if(e.shiftKey && document.activeElement===first){ e.preventDefault(); last.focus(); }
      else if(!e.shiftKey && document.activeElement===last){ e.preventDefault(); first.focus(); }
    }
  }
  cats.addEventListener("click",e=>{ const b=e.target.closest(".menu-cat"); if(b) menuPage(b.dataset.cat); });
  back.addEventListener("click",()=>menuPage(null));
  menuPage(null);
  btn.addEventListener("click",open);
  closeBtn.addEventListener("click",close);
  modal.addEventListener("click",e=>{ if(e.target===modal) close(); });   // 背景クリックで閉じる
})();

