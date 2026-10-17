// @module ui/set-view
// @provides _clPagePrev, _setInfo, _snapPatHas, fmtClock, paintSet, setGridEl, setModeEnter
// @uses AC, arm, armMode, bpmVal, clPage, copySetTo, editPat, fmtSetLevel, focusSet, isSetHeld, paintPerf,
//    paintTransport, playing, queuedSet, renderClPage, sampNameEl, setCur, setEditPat, setElapsed, setHold,
//    setIsPlaying, setLevels, setMode, setName, setSetLevel, setSlots, sideStop, sideTakeCurrent,
//    startTransport, stopAllVoices, stopTransport, tracks
// @depends -
// ---------- SET モードの表示と配線：16 のセット（#setGrid＝ポン出し）と情報窓の SET ページ ----------
// v0.3.144 §145。SET モードではパッドが「セットのポン出し」＝叩くとそのセットのシーケンスがループ再生され、PADS / SEQ の対象もそのセットになる。
// 状態を書くのは data/set の入口（focusSet / copySetTo …）・audio の入口（startTransport / stopTransport / sideTakeCurrent / sideStop / setHold）と setMode（ここ）だけ。
// 下段の ◀ / NEXT / LIVE は v0.3.145 で撤去（パッド自体が切替）。v0.3.147 で押す＝鳴る・離す＝止まる・1 小節でホールド・同時鳴らし（ミックス）
const setGridEl=document.getElementById("setGrid");
let _clPagePrev="main";
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
(function buildSetGrid(){
  if(!setGridEl) return;
  for(let k=0;k<16;k++){
    const d=document.createElement("button"); d.className="pad setpad"; d.dataset.k=k; d.setAttribute("aria-label","SET "+(k+1));
    d.innerHTML='<div class="n"><span>'+String(k+1).padStart(2,"0")+'</span><span class="tag"></span></div><div class="nm"></div><div class="ft"><span class="bpm"></span><span class="lv"></span><span class="dots"><i></i><i></i><i></i><i></i></span></div>';
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
    const on=setIsPlaying(k), held=on&&isSetHeld(k);
    d.classList.toggle("on",k===setCur); d.classList.toggle("playing",on); d.classList.toggle("held",held); d.classList.toggle("queued",k===queuedSet); d.classList.toggle("fresh",info.fresh);
    d.querySelector(".nm").textContent = info.name;
    d.querySelector(".tag").textContent = on ? (held?"HOLD":"NOW") : (k===setCur ? "SEL" : (k===queuedSet ? "NEXT" : ""));
    d.querySelector(".bpm").textContent = (+info.bpm||100).toFixed(1);
    const lv=setLevels[k]||0, lvEl=d.querySelector(".lv"); lvEl.textContent = lv ? fmtSetLevel(lv)+"dB" : ""; lvEl.classList.toggle("down", lv<0);   // ミックス音量（0 のときは出さない）
    d.querySelectorAll(".dots i").forEach((i,p)=>i.classList.toggle("has", info.has[p]));
  }
  if($("clSetNo")) $("clSetNo").textContent = String(setCur+1).padStart(2,"0");
  if($("clSetName")) $("clSetName").textContent = setName(setCur);
  if($("clSetTime")) $("clSetTime").textContent = fmtClock(setElapsed());
  if($("clSetNext")){   // MIX：いま鳴っているセット（ホールド中は H）。v0.3.147 で NEXT から置き換え（予約は使わない＝押した瞬間に鳴る）
    const mix=[]; for(let k=0;k<16;k++) if(setIsPlaying(k)) mix.push(String(k+1).padStart(2,"0")+(isSetHeld(k)?"H":""));
    $("clSetNext").textContent = mix.length ? mix.join(" · ") : "—"; }
  document.querySelectorAll("#clKeysSet .cl-key").forEach(b=>b.classList.toggle("on", +b.dataset.pat===editPat));
}
// モードの出入り（switchView から）：情報窓のページを SET ページ⇄元のページに
function setModeEnter(on){
  on=!!on; if(on===setMode) { if(on) paintSet(); return; }
  setMode=on;
  document.body.classList.toggle("setmode", setMode);
  if(setMode){ _clPagePrev = clPage==="set" ? "main" : clPage; clPage="set"; renderClPage(); paintSet(); }
  else { clPage=_clPagePrev||"main"; renderClPage(); }
}
(function(){
  const $=id=>document.getElementById(id);
  const say=t=>{ sampNameEl.textContent=t; if(typeof paintPerf==="function") paintPerf(); };
  // セットのポン出し（v0.3.147 §145）：「トグル式で。押して再生、離して止まる、1 小節長押しでホールド。ミックスするから同時鳴らしも許可する」
  // ・押す（pointerdown）＝そのセットをいまのセット（PADS / SEQ の対象）にして、頭から鳴らす。他に鳴っているセットはそのまま（ミックス）
  // ・離す＝止まる。ただし 1 小節（そのセットの BPM で）押し続けたらホールド＝離しても鳴り続ける。ホールド中のセットを叩く＝止まる
  // ・COPY 中は鳴らさずに、いまのセットをそこへ写す。■ は鳴っているセットを全部止める
  // v0.3.146 までの「鳴っていれば次の小節頭で切替（予約）」と「長押し 2 回で既定のキットに戻す」はこの操作に置き換えた
  const holds=new Map();   // pointerId → {k, timer, d}（押している最中の指。マルチタッチで複数）
  const startSet=(k)=>{
    if(AC.state!=="running") AC.resume();
    if(k!==setCur){
      if(playing) sideTakeCurrent();          // いま鳴っているセットは止めずに「他のセットの再生」へ
      else stopAllVoices(AC.currentTime);    // 鳴っていなければ手叩きの余韻を切る（従来どおり）
      focusSet(k);
    }
    startTransport(); setHold(k,false);      // 音が先（表示は後）
    paintTransport();
  };
  const stopSet=(k)=>{
    if(k===setCur && playing) stopTransport(); else sideStop(k);
    setHold(k,false); paintTransport();
  };
  const no=k=>String(k+1).padStart(2,"0");
  const endHold=(h)=>{ clearTimeout(h.timer); h.d.classList.remove("pressing"); };
  // v0.3.151：「鳴っている Pad を止めるときは、押して離して止まる」「押して始めるとき、押しながら上下スワイプで音量」
  // 押している指ごとに h = {k, d, mode, y0, db0, moved}。mode：start＝押して鳴らした／held＝ホールド中を押した（離すと止まる）／vol＝別の指で鳴っている最中（音量だけ）
  const SWIPE_PX=8, PX_PER_DB=5;   // 8px 動くまではタップ扱い。そこから上へ 5px で +1 dB
  const pressStart=(e)=>{ const d=e.target.closest(".setpad"); if(!d) return; e.preventDefault();
    const k=+d.dataset.k;
    try{ d.setPointerCapture(e.pointerId); }catch(_){}
    if(armMode==="chop"){ if(copySetTo(k)){ say("COPY ▸ SET "+no(k)+" にいまのセットを写した"); arm("chop",false); paintSet(); } else say("COPY：いまのセットには写せない"); return; }
    const h={k, d, timer:0, mode:"start", y0:e.clientY, db0:setLevels[k]||0, moved:false};
    if(setIsPlaying(k)){   // 鳴っているセット：ホールド中なら「離すと止まる」（スワイプしたら止めない＝音量だけ）。別の指で押している最中なら音量だけ
      h.mode = isSetHeld(k) ? "held" : "vol";
      holds.set(e.pointerId, h);
      say((h.mode==="held" ? "離すと止まる："+no(k)+" "+setName(k)+"（上下スワイプで音量）" : "上下スワイプで音量："+no(k)+" "+setName(k)));
      return; }
    startSet(k);
    const ms=Math.round(240000/(bpmVal||100));   // 1 小節（いまのセット＝押したセットの BPM）
    h.timer=setTimeout(()=>{ if(holds.get(e.pointerId)!==h) return; h.d.classList.remove("pressing");
      if(setIsPlaying(k)){ setHold(k,true); say("HOLD ▸ "+no(k)+" "+setName(k)+"（押して離すと止まる）"); paintSet(); } }, ms);
    holds.set(e.pointerId, h);
    d.style.setProperty("--hold-ms", ms+"ms"); d.classList.add("pressing");
    say("▶ "+no(k)+" "+setName(k)+"（離すと止まる・1 小節押し続けるとホールド・上下で音量）"); paintSet(); };
  const pressMove=(e)=>{ const h=holds.get(e.pointerId); if(!h) return;
    const dy=e.clientY-h.y0;
    if(!h.moved){ if(Math.abs(dy)<SWIPE_PX) return; h.moved=true; }
    const eff = dy>0 ? dy-SWIPE_PX : dy+SWIPE_PX;   // 遊びの分を引く＝動き出しで跳ばない
    setSetLevel(h.k, h.db0 - eff/PX_PER_DB);
    const lv=setLevels[h.k], el=h.d.querySelector(".lv"); el.textContent = lv ? fmtSetLevel(lv)+"dB" : ""; el.classList.toggle("down", lv<0);   // 動かしている 1 枚だけ塗る（毎回 16 枚は重い）
    say("VOL "+no(h.k)+" "+setName(h.k)+"  "+fmtSetLevel(lv)+" dB"); };
  const pressEnd=(e)=>{ const h=holds.get(e.pointerId); if(!h) return; holds.delete(e.pointerId); endHold(h);
    if(e.type==="pointercancel" && h.mode!=="start") return;   // 取り消された指では止めない
    if(h.mode==="held"){ if(!h.moved && setIsPlaying(h.k)){ stopSet(h.k); say("■ "+no(h.k)+" "+setName(h.k)); paintSet(); } return; }
    if(h.mode==="start" && !isSetHeld(h.k) && setIsPlaying(h.k)){ stopSet(h.k); paintSet(); } };
  if(setGridEl){ setGridEl.addEventListener("pointerdown",pressStart); setGridEl.addEventListener("pointermove",pressMove); setGridEl.addEventListener("pointerup",pressEnd); setGridEl.addEventListener("pointercancel",pressEnd); }
  document.querySelectorAll("#clKeysSet .cl-key").forEach(b=>b.addEventListener("click",()=>{ if(typeof setEditPat==="function") setEditPat(+b.dataset.pat); paintSet(); if(typeof paintPerf==="function") paintPerf(); }));
  setInterval(()=>{ if(setMode) paintSet(); }, 500);   // 経過時間と、鳴っているセットの印（16 個の塗り直しは軽い）
})();
