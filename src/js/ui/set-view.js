// @module ui/set-view
// @provides _clPagePrev, _liveUnload, _liveWake, _setInfo, _snapPatHas, _wakeLock, fmtClock, paintSet,
//    setGridEl, setLiveOn, setModeEnter
// @uses arm, armMode, bpmVal, clPage, copySetTo, editPat, liveOn, paintPerf, playing, queueSet, queuedSet,
//    renderClPage, resetSet, sampNameEl, setCur, setEditPat, setElapsed, setLiveArm, setMode, setName,
//    setNext, setPrev, setSlots, tracks
// @depends -
// ---------- SET モードの表示と配線：16 のセット（#setGrid＝ポン出し）、情報窓の SET ページ、下段 ◀ / NEXT / LIVE ----------
// v0.3.144 §145。SET モードではパッドが「セットのポン出し」＝叩くとそのセットのシーケンスがループ再生され、PADS / SEQ の対象もそのセットになる。
// 状態を書くのは data/set の入口（queueSet / switchSetNow / copySetTo / resetSet / setNext / setPrev …）と setMode / liveOn（ここ）だけ
const setGridEl=document.getElementById("setGrid");
let _clPagePrev="main";
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
(function buildSetGrid(){
  if(!setGridEl) return;
  for(let k=0;k<16;k++){
    const d=document.createElement("button"); d.className="pad setpad"; d.dataset.k=k; d.setAttribute("aria-label","SET "+(k+1));
    d.innerHTML='<div class="n"><span>'+String(k+1).padStart(2,"0")+'</span><span class="tag"></span></div><div class="nm"></div><div class="ft"><span class="bpm"></span><span class="dots"><i></i><i></i><i></i><i></i></span></div>';
    setGridEl.appendChild(d);
  }
})();
function _snapPatHas(tr,p){ return tr.some(t=>t.patterns&&t.patterns[p]&&t.patterns[p].some(b=>b.some(v=>v>0))); }
function _setInfo(k){   // 表示用：いまのセットは live から、他は snapshot から
  if(k===setCur) return {name:setName(k), bpm:bpmVal, has:[0,1,2,3].map(p=>_snapPatHas(tracks,p)), fresh:false};
  const s=setSlots[k]; if(!s) return {name:"SET "+(k+1), bpm:100, has:[false,false,false,false], fresh:true};
  const has=[0,1,2,3].map(p=>_snapPatHas(s.tracks,p));
  const fresh=!has.some(Boolean) && s.tracks.every((t,i)=> i>=8 ? true : !t.buffer);   // 打ち込みも音も無い＝既定のまま
  return {name:s.name, bpm:s.bpm, has, fresh};
}
function paintSet(){
  if(!setGridEl) return;
  const $=id=>document.getElementById(id);
  for(let k=0;k<16;k++){ const d=setGridEl.children[k]; if(!d) continue; const info=_setInfo(k);
    d.classList.toggle("on",k===setCur); d.classList.toggle("queued",k===queuedSet); d.classList.toggle("fresh",info.fresh);
    d.querySelector(".nm").textContent = info.name;
    d.querySelector(".tag").textContent = k===setCur ? (playing?"NOW":"SEL") : (k===queuedSet ? "NEXT" : "");
    d.querySelector(".bpm").textContent = (+info.bpm||100).toFixed(1);
    d.querySelectorAll(".dots i").forEach((i,p)=>i.classList.toggle("has", info.has[p]));
  }
  const nx=queuedSet!==null?setName(queuedSet):null;
  if($("clSetNo")) $("clSetNo").textContent = String(setCur+1).padStart(2,"0");
  if($("clSetName")) $("clSetName").textContent = setName(setCur);
  if($("clSetTime")) $("clSetTime").textContent = fmtClock(setElapsed());
  if($("clSetNext")){ $("clSetNext").textContent = nx ? String(queuedSet+1).padStart(2,"0")+" "+nx : (setCur<15 ? String(setCur+2).padStart(2,"0")+" "+setName(setCur+1) : "—");
    const w=$("clSetNext").closest(".cl-par"); if(w) w.classList.toggle("queued", !!nx); }
  document.querySelectorAll("#clKeysSet .cl-key").forEach(b=>b.classList.toggle("on", +b.dataset.pat===editPat));
  if($("setNext")){ $("setNext").textContent = queuedSet!==null ? "予約中 ▶ 取消" : "NEXT ▶"; $("setNext").classList.toggle("queued", queuedSet!==null); }
  if($("setLive")) $("setLive").classList.toggle("on", liveOn);
}
// モードの出入り（switchView から）：情報窓のページを SET ページ⇄元のページに
function setModeEnter(on){
  on=!!on; if(on===setMode) { if(on) paintSet(); return; }
  setMode=on;
  document.body.classList.toggle("setmode", setMode);
  if(setMode){ _clPagePrev = clPage==="set" ? "main" : clPage; clPage="set"; renderClPage(); paintSet(); }
  else { clPage=_clPagePrev||"main"; renderClPage(); }
}
// LIVE LOCK：画面を消さない（Wake Lock）・離脱の確認・編集系を薄くして触れなくする（CSS）。▶ 中の変化は ■ で戻る（data/set）
let _wakeLock=null;
async function _liveWake(on){
  try{ if(on){ if(navigator.wakeLock && !_wakeLock) _wakeLock=await navigator.wakeLock.request("screen"); }
       else if(_wakeLock){ await _wakeLock.release(); _wakeLock=null; } }catch(_){ _wakeLock=null; }
}
function _liveUnload(e){ e.preventDefault(); e.returnValue=""; }
function setLiveOn(on){
  liveOn=!!on;
  document.body.classList.toggle("live", liveOn);
  if(liveOn){ window.addEventListener("beforeunload",_liveUnload); _liveWake(true); if(playing) setLiveArm(); }
  else { window.removeEventListener("beforeunload",_liveUnload); _liveWake(false); }
  sampNameEl.textContent = liveOn ? "LIVE：画面を消さない／編集系はロック／鳴らしている間の変化は ■ で戻る" : "LIVE 解除";
  paintSet(); if(typeof paintPerf==="function") paintPerf();
}
document.addEventListener("visibilitychange",()=>{ if(liveOn && document.visibilityState==="visible") _liveWake(true); });   // 復帰で取り直す
(function(){
  const $=id=>document.getElementById(id);
  const say=t=>{ sampNameEl.textContent=t; if(typeof paintPerf==="function") paintPerf(); };
  const launch=()=>{ const b=$("play"); if(b && !playing) b.click(); };   // ポン出し：止まっていれば鳴らす
  const told=(ok,dir)=>{ if(!ok){ say(dir>0?"SET：最後のセット":"SET：最初のセット"); return; }
    const k=queuedSet!==null?queuedSet:setCur;
    say(queuedSet!==null ? "予約 ▸ "+String(k+1).padStart(2,"0")+" "+setName(k)+"（次の小節頭で）" : "▸ "+String(k+1).padStart(2,"0")+" "+setName(k)); paintSet(); };
  // セットを叩く＝ポン出し（鳴っていれば次の小節頭で切替、止まっていれば切替して ▶）。COPY 中＝いまのセットをそこへコピー。長押し 2 回＝既定のキットに戻す
  let lp=null, lpK=-1, armK=-1, armT=0;
  const pressStart=(e)=>{ const d=e.target.closest(".setpad"); if(!d) return; lpK=+d.dataset.k; clearTimeout(lp);
    lp=setTimeout(()=>{ lp=null; const k=lpK; if(k===setCur){ say("いまのセットは PADS / SEQ で編集。他のセットへは COPY で写せる"); return; }
      if(armK===k && Date.now()-armT<2500){ resetSet(k); armK=-1; say("SET "+String(k+1).padStart(2,"0")+" を既定のキットに戻した"); paintSet(); return; }
      armK=k; armT=Date.now(); setGridEl.children[k].classList.add("armed"); setTimeout(()=>{ if(setGridEl.children[k]) setGridEl.children[k].classList.remove("armed"); },2500);
      say("もう一度長押しで既定のキットに戻す：SET "+String(k+1).padStart(2,"0")+" "+setName(k)); }, 600); };
  const pressEnd=(e)=>{ const d=e.target.closest(".setpad"); if(!lp){ lp=null; return; } clearTimeout(lp); lp=null; if(!d) return;
    const k=+d.dataset.k;
    if(armMode==="chop"){ if(copySetTo(k)){ say("COPY ▸ SET "+String(k+1).padStart(2,"0")+" にいまのセットを写した"); arm("chop",false); paintSet(); } else say("COPY：いまのセットには写せない"); return; }
    if(k===setCur){ if(!playing){ launch(); say("▶ "+String(k+1).padStart(2,"0")+" "+setName(k)); paintSet(); } return; }
    const was=playing; told(queueSet(k), +1); if(!was) launch(); paintSet(); };
  if(setGridEl){ setGridEl.addEventListener("pointerdown",pressStart); setGridEl.addEventListener("pointerup",pressEnd); setGridEl.addEventListener("pointercancel",()=>{ clearTimeout(lp); lp=null; }); setGridEl.addEventListener("pointerleave",()=>{ clearTimeout(lp); lp=null; }); }
  if($("setPrev")) $("setPrev").addEventListener("click",()=>told(setPrev(),-1));
  if($("setNext")) $("setNext").addEventListener("click",()=>told(setNext(),+1));
  if($("setLive")) $("setLive").addEventListener("click",()=>setLiveOn(!liveOn));
  document.querySelectorAll("#clKeysSet .cl-key").forEach(b=>b.addEventListener("click",()=>{ if(typeof setEditPat==="function") setEditPat(+b.dataset.pat); paintSet(); if(typeof paintPerf==="function") paintPerf(); }));
  setInterval(()=>{ if(setMode){ const c=$("clSetTime"); if(c) c.textContent=fmtClock(setElapsed()); const d=setGridEl&&setGridEl.children[setCur]; if(d){ const t=d.querySelector(".tag"), v=playing?"NOW":"SEL"; if(t.textContent!==v) t.textContent=v; } } }, 500);
})();
