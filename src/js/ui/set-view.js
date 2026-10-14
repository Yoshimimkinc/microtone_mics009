// @module ui/set-view
// @provides _clPagePrev, _liveUnload, _liveWake, _patHas, _wakeLock, fmtClock, paintSet, setBarEl,
//    setGridEl, setLiveOn, setModeEnter
// @uses IS_IOS, buildSetFile, clPage, editPat, liveOn, loadSetFile, paintPerf, queueSet, queuedSet,
//    renderClPage, sampNameEl, setCount, setCur, setEditPat, setElapsed, setMode, setNext, setNextSlot,
//    setPrev, setRemove, setSlots, setStore, shareOrDownload
// @depends layout
// ---------- SET モードの表示と配線：16 の枠（#setGrid）、情報窓の SET ページ、下段 ◀ / NEXT / LIVE、メニューの 読む / 保存 ----------
// v0.3.143 §144。状態を書くのは data/set の入口（queueSet / setStore / setNext / setPrev …）と setMode / liveOn（ここ）だけ
const setGridEl=document.getElementById("setGrid"), setBarEl=document.getElementById("setBar");
let _clPagePrev="main";
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
// 枠の DOM（16 マス。#pads と同じ .pad を使って寸法を揃える）
(function buildSetGrid(){
  if(!setGridEl) return;
  for(let k=0;k<16;k++){
    const d=document.createElement("button"); d.className="pad setpad empty"; d.dataset.k=k; d.setAttribute("aria-label","SET "+(k+1));
    d.innerHTML='<div class="n"><span>'+String(k+1).padStart(2,"0")+'</span><span class="tag"></span></div><div class="nm"></div><div class="ft"><span class="bpm"></span><span class="dots"><i></i><i></i><i></i><i></i></span></div>';
    setGridEl.appendChild(d);
  }
})();
function _patHas(proj,p){ return proj.tracks.some(t=>t.patterns&&t.patterns[p]&&t.patterns[p].some(b=>Array.isArray(b)?b.some(v=>v>0):b>0)); }
function paintSet(){
  if(!setGridEl) return;
  const $=id=>document.getElementById(id);
  for(let k=0;k<16;k++){ const d=setGridEl.children[k], s=setSlots[k]; if(!d) continue;
    d.classList.toggle("empty",!s); d.classList.toggle("on",k===setCur); d.classList.toggle("queued",k===queuedSet);
    d.querySelector(".nm").textContent = s ? s.name : "＋ いまの16パッド";
    d.querySelector(".tag").textContent = k===setCur ? "NOW" : (k===queuedSet ? "NEXT" : "");
    d.querySelector(".bpm").textContent = s ? (+s.proj.bpm||100).toFixed(1) : "";
    d.querySelectorAll(".dots i").forEach((i,p)=>i.classList.toggle("has", !!s && _patHas(s.proj,p)));
  }
  const cur=setCur>=0?setSlots[setCur]:null, nx=queuedSet!==null?setSlots[queuedSet]:null;
  const nj=(queuedSet===null && setCur>=0) ? setNextSlot(setCur,+1) : -1;
  if($("clSetNo")) $("clSetNo").textContent = cur ? String(setCur+1).padStart(2,"0") : "--";
  if($("clSetName")) $("clSetName").textContent = cur ? cur.name : (setCount()?"枠を叩く":"空");
  if($("clSetTime")) $("clSetTime").textContent = fmtClock(setElapsed());
  if($("clSetNext")){ $("clSetNext").textContent = nx ? String(queuedSet+1).padStart(2,"0")+" "+nx.name : (nj>=0 ? String(nj+1).padStart(2,"0")+" "+setSlots[nj].name : "—");
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
// LIVE LOCK：画面を消さない（Wake Lock）・離脱の確認・編集系を薄くして触れなくする（CSS）
let _wakeLock=null;
async function _liveWake(on){
  try{ if(on){ if(navigator.wakeLock && !_wakeLock) _wakeLock=await navigator.wakeLock.request("screen"); }
       else if(_wakeLock){ await _wakeLock.release(); _wakeLock=null; } }catch(_){ _wakeLock=null; }
}
function _liveUnload(e){ e.preventDefault(); e.returnValue=""; }
function setLiveOn(on){
  liveOn=!!on;
  document.body.classList.toggle("live", liveOn);
  if(liveOn){ window.addEventListener("beforeunload",_liveUnload); _liveWake(true); }
  else { window.removeEventListener("beforeunload",_liveUnload); _liveWake(false); }
  sampNameEl.textContent = liveOn ? "LIVE：画面を消さない／編集系はロック（もう一度 LIVE で解除）" : "LIVE 解除";
  paintSet(); if(typeof paintPerf==="function") paintPerf();
}
document.addEventListener("visibilitychange",()=>{ if(liveOn && document.visibilityState==="visible") _liveWake(true); });   // 復帰で取り直す
(function(){
  const $=id=>document.getElementById(id);
  const say=t=>{ sampNameEl.textContent=t; if(typeof paintPerf==="function") paintPerf(); };
  const told=(ok,dir)=>{ if(!ok){ say(dir>0?"SET：次の枠が無い":"SET：前の枠が無い"); return; }
    const k=queuedSet!==null?queuedSet:setCur; const s=setSlots[k];
    say(queuedSet!==null ? "予約 ▸ "+String(k+1).padStart(2,"0")+" "+s.name+"（次の小節頭で）" : "▸ "+String(k+1).padStart(2,"0")+" "+s.name); paintSet(); };
  // 枠：タップ＝空なら「いまの16パッドを入れる」、入っていれば選ぶ（予約）。長押し＝NOW の枠なら上書き、他は 2 回で削除
  let lp=null, lpK=-1, armK=-1, armT=0;
  const pressStart=(e)=>{ const d=e.target.closest(".setpad"); if(!d) return; lpK=+d.dataset.k; clearTimeout(lp);
    lp=setTimeout(async()=>{ lp=null; const k=lpK; if(!setSlots[k]) return;
      if(k===setCur){ await setStore(k); say("SET "+String(k+1).padStart(2,"0")+" に上書きした"); paintSet(); return; }
      if(armK===k && Date.now()-armT<2500){ const nm=setSlots[k].name; setRemove(k); armK=-1; say("SET から外した："+nm); paintSet(); return; }
      armK=k; armT=Date.now(); setGridEl.children[k].classList.add("armed"); setTimeout(()=>{ if(setGridEl.children[k]) setGridEl.children[k].classList.remove("armed"); },2500);
      say("もう一度長押しで削除：SET "+String(k+1).padStart(2,"0")+" "+setSlots[k].name); }, 600); };
  const pressEnd=async(e)=>{ const d=e.target.closest(".setpad"); if(!lp){ lp=null; return; } clearTimeout(lp); lp=null; if(!d) return;
    const k=+d.dataset.k;
    if(!setSlots[k]){ if(liveOn) return; await setStore(k); say("SET "+String(k+1).padStart(2,"0")+" に入れた："+setSlots[k].name); paintSet(); return; }
    told(queueSet(k), +1); };
  if(setGridEl){ setGridEl.addEventListener("pointerdown",pressStart); setGridEl.addEventListener("pointerup",pressEnd); setGridEl.addEventListener("pointercancel",()=>{ clearTimeout(lp); lp=null; }); setGridEl.addEventListener("pointerleave",()=>{ clearTimeout(lp); lp=null; }); }
  if($("setPrev")) $("setPrev").addEventListener("click",()=>told(setPrev(),-1));
  if($("setNext")) $("setNext").addEventListener("click",()=>told(setNext(),+1));
  if($("setLive")) $("setLive").addEventListener("click",()=>setLiveOn(!liveOn));
  document.querySelectorAll("#clKeysSet .cl-key").forEach(b=>b.addEventListener("click",()=>{ if(typeof setEditPat==="function") setEditPat(+b.dataset.pat); paintSet(); if(typeof paintPerf==="function") paintPerf(); }));
  if($("setLoadBtn")) $("setLoadBtn").addEventListener("click",()=>$("setFile").click());
  if($("setFile")) $("setFile").addEventListener("change",async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return;
    try{ say("SET 読込中…"); const n=await loadSetFile(JSON.parse(await f.text())); say("SET 読込 "+n+" 枠 — "+f.name.slice(0,16)); paintSet(); }
    catch(err){ console.warn("[set load]",err); say("SET LOAD FAILED — .micset ではない"); } });
  if($("setSaveBtn")) $("setSaveBtn").addEventListener("click",()=>{ if(!setCount()){ say("SET が空"); return; }
    const d=new Date(), z=n=>String(n).padStart(2,"0");
    const stamp=String(d.getFullYear()).slice(2)+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes());
    shareOrDownload(new Blob([JSON.stringify(buildSetFile())],{type:"application/json"}), "mics009-set-"+stamp+".micset"); });
  if(typeof IS_IOS!=="undefined" && IS_IOS){ const sf=$("setFile"); if(sf) sf.removeAttribute("accept"); }   // iOS は .micset を知らない（§128 と同じ）
  setInterval(()=>{ if(setMode){ const c=$("clSetTime"); if(c) c.textContent=fmtClock(setElapsed()); } }, 500);
})();
