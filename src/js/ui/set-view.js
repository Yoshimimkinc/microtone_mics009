// @module ui/set-view
// @provides _liveUnload, _liveWake, _wakeLock, closeSet, fmtClock, liveRunnerEl, openSet, paintSet,
//    setListEl, setLiveOn, setModalEl
// @uses IS_IOS, buildSetFile, liveOn, loadSetFile, paintPerf, playing, queueSong, queuedSong, sampNameEl,
//    setAddCurrent, setCur, setNext, setPrev, setRemove, setRenameSong, setSongElapsed, setSongs,
//    shareOrDownload
// @depends layout
// ---------- SET の表示と配線：モーダル（曲の並び・NEXT/PREV・読む/保存）と LIVE 画面（大きな NEXT・経過）。データは data/set ----------
// v0.3.141 §143。状態を書くのは data/set の入口（queueSong / setNext / setPrev / setAddCurrent …）だけ。ここは描画と配線
const setModalEl=document.getElementById("setModal"), setListEl=document.getElementById("setList"), liveRunnerEl=document.getElementById("liveRunner");
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
function paintSet(){
  if(!setListEl) return;
  const $=id=>document.getElementById(id);
  if(!setSongs.length) setListEl.innerHTML='<div class="set-empty">セットは空。曲を作って「＋ いまの曲」で足す。</div>';
  else setListEl.innerHTML=setSongs.map((s,k)=>`<button class="set-row${k===setCur?" on":""}${k===queuedSong?" queued":""}" data-k="${k}"><b>${String(k+1).padStart(2,"0")}</b><span>${s.name.replace(/[<>&]/g,c=>({"<":"&lt;",">":"&gt;","&":"&amp;"}[c]))}</span><em>${(+s.proj.bpm||100).toFixed(1)}</em></button>`).join("");
  const cur=setSongs[setCur], nx=queuedSong!==null?setSongs[queuedSong]:null;
  if($("setNameIn")) $("setNameIn").placeholder = cur ? cur.name : "曲名（空なら SONG n）";
  if($("setLive")) $("setLive").classList.toggle("on", liveOn);
  // LIVE 画面
  if($("liveIdx")) $("liveIdx").textContent = cur ? (setCur+1)+" / "+setSongs.length : "—";
  if($("liveName")) $("liveName").textContent = cur ? cur.name : "セットが空";
  if($("liveBpm")) $("liveBpm").textContent = cur ? (+cur.proj.bpm||100).toFixed(1)+" BPM" : "";
  if($("liveNextName")) $("liveNextName").textContent = nx ? "予約 ▸ "+(queuedSong+1)+" "+nx.name+"（次の小節頭で）" : (setSongs[setCur+1] ? "次 ▸ "+(setCur+2)+" "+setSongs[setCur+1].name : (cur?"最後の曲":""));
  if($("liveNext")) $("liveNext").classList.toggle("queued", queuedSong!==null);
  if($("liveClock")) $("liveClock").textContent = fmtClock(setSongElapsed());
  if($("livePlay")){ $("livePlay").textContent = playing ? "■ STOP" : "▶ PLAY"; $("livePlay").classList.toggle("on", playing); }   // 再生状態を嘘なく（§0-3）
}
function openSet(){ if(!setModalEl) return; const m=document.getElementById("menuModal"); if(m) m.style.display="none"; setModalEl.style.display="flex"; paintSet(); }
function closeSet(){ if(setModalEl) setModalEl.style.display="none"; }
// LIVE LOCK：画面を消さない（Wake Lock）・離脱の確認・編集系を薄くして触れなくする（CSS）。runner の開閉とは独立
let _wakeLock=null;
async function _liveWake(on){
  try{ if(on){ if(navigator.wakeLock && !_wakeLock) _wakeLock=await navigator.wakeLock.request("screen"); }
       else if(_wakeLock){ await _wakeLock.release(); _wakeLock=null; } }catch(_){ _wakeLock=null; }
}
function _liveUnload(e){ e.preventDefault(); e.returnValue=""; }
function setLiveOn(on){
  liveOn=!!on;
  document.body.classList.toggle("live", liveOn);
  if(liveOn){ window.addEventListener("beforeunload",_liveUnload); _liveWake(true); if(liveRunnerEl) liveRunnerEl.style.display="flex"; closeSet(); }
  else { window.removeEventListener("beforeunload",_liveUnload); _liveWake(false); if(liveRunnerEl) liveRunnerEl.style.display="none"; }
  sampNameEl.textContent = liveOn ? "LIVE：画面を消さない／編集系はロック（解除は LIVE 画面の「解除」）" : "LIVE 解除";
  paintSet();
}
document.addEventListener("visibilitychange",()=>{ if(liveOn && document.visibilityState==="visible") _liveWake(true); });   // 復帰で取り直す
(function(){
  const $=id=>document.getElementById(id);
  const say=t=>{ sampNameEl.textContent=t; if(typeof paintPerf==="function") paintPerf(); };
  const go=(ok,what)=>{ if(!ok){ say(what==="next"?"SET：最後の曲":"SET：最初の曲"); return; }
    const k=queuedSong!==null?queuedSong:setCur; const s=setSongs[k];
    say(queuedSong!==null ? "予約 ▸ "+(k+1)+" "+s.name+"（次の小節頭）" : "▸ "+(k+1)+" "+s.name); paintSet(); };
  if($("setBtn")) $("setBtn").addEventListener("click",openSet);
  if($("setClose")) $("setClose").addEventListener("click",closeSet);
  if(setModalEl) setModalEl.addEventListener("click",e=>{ if(e.target===setModalEl) closeSet(); });
  if(setListEl) setListEl.addEventListener("click",e=>{ const r=e.target.closest(".set-row"); if(!r) return; const k=+r.dataset.k; if(queueSong(k)) go(true); });
  if($("setAdd")) $("setAdd").addEventListener("click",async()=>{ const inp=$("setNameIn"); const k=await setAddCurrent(inp?inp.value:""); if(inp) inp.value=""; say("SET に追加 ▸ "+(k+1)+" "+setSongs[k].name); paintSet(); });
  if($("setNameIn")) $("setNameIn").addEventListener("change",()=>{ const inp=$("setNameIn"); if(setCur>=0 && inp.value.trim()){ setRenameSong(setCur, inp.value); inp.value=""; paintSet(); } });
  let delArm=0;
  if($("setDel")) $("setDel").addEventListener("click",()=>{ if(setCur<0) return;
    if(Date.now()-delArm>2000){ delArm=Date.now(); $("setDel").textContent="本当に削除"; setTimeout(()=>{ $("setDel").textContent="削除"; },2000); return; }
    const nm=setSongs[setCur].name; setRemove(setCur); delArm=0; $("setDel").textContent="削除"; say("SET から外した："+nm); paintSet(); });
  if($("setPrev")) $("setPrev").addEventListener("click",()=>go(setPrev(),"prev"));
  if($("setNext")) $("setNext").addEventListener("click",()=>go(setNext(),"next"));
  if($("livePrev")) $("livePrev").addEventListener("click",()=>go(setPrev(),"prev"));
  if($("liveNext")) $("liveNext").addEventListener("click",()=>go(setNext(),"next"));
  if($("setLive")) $("setLive").addEventListener("click",()=>setLiveOn(!liveOn));
  if($("liveOff")) $("liveOff").addEventListener("click",()=>setLiveOn(false));
  if($("livePads")) $("livePads").addEventListener("click",()=>{ if(liveRunnerEl) liveRunnerEl.style.display="none"; say("LIVE 中：戻るはメニュー → SET → LIVE 画面"); });
  if($("livePlay")) $("livePlay").addEventListener("click",()=>{ const b=document.getElementById("play"); if(b) b.click(); });
  if($("setLoad")) $("setLoad").addEventListener("click",()=>$("setFile").click());
  if($("setFile")) $("setFile").addEventListener("change",async e=>{ const f=e.target.files[0]; e.target.value=""; if(!f) return;
    try{ say("SET 読込中…"); const n=await loadSetFile(JSON.parse(await f.text())); say("SET 読込 "+n+" 曲 — "+f.name.slice(0,16)); paintSet(); }
    catch(err){ console.warn("[set load]",err); say("SET LOAD FAILED — .micset ではない"); } });
  if($("setSave")) $("setSave").addEventListener("click",()=>{ if(!setSongs.length){ say("SET が空"); return; }
    const d=new Date(), z=n=>String(n).padStart(2,"0");
    const stamp=String(d.getFullYear()).slice(2)+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes());
    shareOrDownload(new Blob([JSON.stringify(buildSetFile())],{type:"application/json"}), "mics009-set-"+stamp+".micset"); });
  if(typeof IS_IOS!=="undefined" && IS_IOS){ const sf=$("setFile"); if(sf) sf.removeAttribute("accept"); }   // iOS は .micset を知らない（§128 と同じ）
  setInterval(()=>{ if(liveRunnerEl && liveRunnerEl.style.display!=="none"){ const c=$("liveClock"); if(c) c.textContent=fmtClock(setSongElapsed());
    const b=$("livePlay"); if(b){ const t=playing?"■ STOP":"▶ PLAY"; if(b.textContent!==t){ b.textContent=t; b.classList.toggle("on",playing); } } } }, 500);
})();
