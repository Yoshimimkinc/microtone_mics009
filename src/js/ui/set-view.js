// @module ui/set-view
// @provides _clPagePrev, _setIn, _setInfo, _snapPatHas, fmtClock, paintSet, paintSetLevel, paintSetMap,
//    setGridEl, setModeEnter, setPadDown, setPadNudge, setPadUp, setPadUpAll
// @uses AC, PRESET_BUFS, SET_LV_MAX, SET_LV_MIN, arm, armMode, bpmVal, clPage, copySetTo, fmtSetLevel,
//    focusSet, isSetHeld, paintPerf, paintTransport, playing, queuedSet, renderClPage, sampNameEl, setCur,
//    setElapsed, setHold, setIsPlaying, setLevels, setMode, setName, setRename, setSetLevel, setSlots,
//    sideStop, sideTakeCurrent, startTransport, stopAllVoices, stopTransport, tracks
// @depends -
// ---------- SET モードの表示と配線：16 のセット（#setGrid＝ポン出し）と情報窓の SET ページ ----------
// v0.3.144 §145。SET モードではパッドが「セットのポン出し」＝叩くとそのセットのシーケンスがループ再生され、PADS / SEQ の対象もそのセットになる。
// 状態を書くのは data/set の入口（focusSet / copySetTo …）・audio の入口（startTransport / stopTransport / sideTakeCurrent / sideStop / setHold）と setMode（ここ）だけ。
// 下段の ◀ / NEXT / LIVE は v0.3.145 で撤去（パッド自体が切替）。v0.3.147 で押す＝鳴る・離す＝止まる・1 拍でホールド（v0.3.153。当初は 1 小節）・同時鳴らし（ミックス）
const setGridEl=document.getElementById("setGrid");
let _clPagePrev="main";
function fmtClock(sec){ sec=Math.max(0,Math.floor(sec)); return Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0"); }
(function buildSetGrid(){
  if(!setGridEl) return;
  for(let k=0;k<16;k++){
    const d=document.createElement("button"); d.className="pad setpad"; d.dataset.k=k; d.setAttribute("aria-label","SET "+(k+1));
    d.innerHTML='<div class="lvfill"></div><div class="n"><span>'+String(k+1).padStart(2,"0")+'</span><span class="tag"></span></div><div class="nm"></div><div class="ft"><span class="bpm"></span><span class="lv"></span><span class="dots"><i></i><i></i><i></i><i></i></span></div>';
    setGridEl.appendChild(d);
  }
})();
// ミックス音量を下からの塗り潰しで見せる（v0.3.152）：下端＝-40 dB（無音）、上端＝+6 dB。0 dB 以外のときと、スワイプ中に出す
function paintSetLevel(d,k){
  const lv=setLevels[k]||0, pct=Math.max(0,Math.min(100,(lv-SET_LV_MIN)/(SET_LV_MAX-SET_LV_MIN)*100));
  const f=d.querySelector(".lvfill"); if(f) f.style.height=pct.toFixed(1)+"%";
  d.classList.toggle("lvon", lv!==0);
  const el=d.querySelector(".lv"); if(el){ el.textContent = fmtSetLevel(lv)+"dB"; el.classList.toggle("down", lv<0); }   // 数字はスワイプ中だけ見える（CSS）
}
// いま 16 セットのどこにいるか（v0.3.154）：SET の切替ボタン（スマホの上段タブ・PC のモードボタン）に 4×4 の小さな地図と番号。
// PADS / SEQ にいても見える。ティール＝いまのセット（PADS / SEQ の対象）、オレンジ＝鳴っている（ホールドは濃く）
(function buildSetMaps(){ document.querySelectorAll(".setmap").forEach(m=>{ for(let k=0;k<16;k++) m.appendChild(document.createElement("i")); }); })();
function paintSetMap(){
  const no=String(setCur+1).padStart(2,"0");
  document.querySelectorAll(".setmap").forEach(m=>{ for(let k=0;k<16;k++){ const c=m.children[k]; if(!c) continue; const on=setIsPlaying(k);
    c.classList.toggle("cur",k===setCur); c.classList.toggle("play",on); c.classList.toggle("held",on&&isSetHeld(k)); } });
  document.querySelectorAll(".setno").forEach(b=>{ if(b.textContent!==no) b.textContent=no; });
}
// SET のパッドをキーボード / MIDI から（v0.3.159）：指と同じ押す・離す・ホールド・音量。src はその入力を見分ける文字列（"key:Digit1" / "midi:60"）
const _setIn={};
function setPadDown(k,src){ return _setIn.down ? _setIn.down(k,src) : false; }
function setPadUp(src){ if(_setIn.up) _setIn.up(src); }
function setPadUpAll(){ if(_setIn.upAll) _setIn.upAll(); }
function setPadNudge(dDb){ return _setIn.nudge ? _setIn.nudge(dDb) : false; }
function _snapPatHas(tr,p){ return tr.some(t=>t.patterns&&t.patterns[p]&&t.patterns[p].some(b=>b.some(v=>v>0))); }
function _setInfo(k){   // 表示用：いまのセットは live から、他は snapshot から
  if(k===setCur) return {name:setName(k), bpm:bpmVal, has:[0,1,2,3].map(p=>_snapPatHas(tracks,p)), fresh:false};
  const s=setSlots[k]; if(!s) return {name:"SET "+(k+1), bpm:100, has:[false,false,false,false], fresh:true};
  const has=[0,1,2,3].map(p=>_snapPatHas(s.tracks,p));
  const fresh=!has.some(Boolean) && s.tracks.every((t,i)=> i>=8 || !t.buffer || (typeof PRESET_BUFS!=="undefined" && PRESET_BUFS[i] && t.buffer===PRESET_BUFS[i].buf));   // 打ち込みも音も無い（8 番のサイン波は既定の音のまま）＝既定のまま
  return {name:s.name, bpm:s.bpm, has, fresh};
}
function paintSet(){
  if(!setGridEl){ paintSetMap(); return; }
  const $=id=>document.getElementById(id);
  for(let k=0;k<16;k++){ const d=setGridEl.children[k]; if(!d) continue; const info=_setInfo(k);
    const on=setIsPlaying(k), held=on&&isSetHeld(k);
    d.classList.toggle("on",k===setCur); d.classList.toggle("playing",on); d.classList.toggle("held",held); d.classList.toggle("queued",k===queuedSet); d.classList.toggle("fresh",info.fresh);
    d.querySelector(".nm").textContent = info.name;
    d.querySelector(".tag").textContent = on ? (held?"HOLD":"NOW") : (k===setCur ? "SEL" : (k===queuedSet ? "NEXT" : ""));
    d.querySelector(".bpm").textContent = (+info.bpm||100).toFixed(1);
    paintSetLevel(d,k);   // ミックス音量（塗り潰しと数字。0 dB のときは出さない）
    d.querySelectorAll(".dots i").forEach((i,p)=>i.classList.toggle("has", info.has[p]));
  }
  if($("clSetNo")) $("clSetNo").textContent = String(setCur+1).padStart(2,"0");
  if($("clSetName")) $("clSetName").textContent = setName(setCur);
  if($("clSetTime")) $("clSetTime").textContent = fmtClock(setElapsed());
  if($("clSetNext")){   // MIX：いま鳴っているセット（ホールド中は H）。v0.3.147 で NEXT から置き換え（予約は使わない＝押した瞬間に鳴る）
    const mix=[]; for(let k=0;k<16;k++) if(setIsPlaying(k)) mix.push(String(k+1).padStart(2,"0")+(isSetHeld(k)?"H":""));
    $("clSetNext").textContent = mix.length ? mix.join(" · ") : "—"; }
  paintSetMap();
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
  // セットのポン出し（v0.3.147 §145 → v0.3.187 §175）：「SET モードで、ボリュームを動かすためにタップ＋スワイプした場合は再生開始しないように」→「押して離した瞬間に鳴るにしよう」
  // ・押して離す（上下に動かさずに）＝止まっているセットは頭から鳴らす（そのセットがいまのセット＝PADS / SEQ の対象に）。離しても鳴り続ける（ホールド）。他に鳴っているセットはそのまま（ミックス）
  // ・鳴っているセットを押して離す＝止まる
  // ・押しながら上下スワイプ＝音量だけ（鳴らさない・止めない）
  // ・COPY 中は鳴らさずに、いまのセットをそこへ写す。■ は鳴っているセットを全部止める
  // v0.3.146 までの「鳴っていれば次の小節頭で切替（予約）」と「長押し 2 回で既定のキットに戻す」、v0.3.147–186 の「押した瞬間に鳴る・離すと止まる・1 拍押し続けるとホールド」はこの操作に置き換えた
  const holds=new Map();   // pointerId → {k, d, mode, …}（押している最中の指。マルチタッチで複数）
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
  const endHold=(h)=>{ h.d.classList.remove("pressing","adj"); };
  // v0.3.151：「鳴っている Pad を止めるときは、押して離して止まる」「押しながら上下スワイプで音量」
  // 押している入力ごとに h = {k, d, mode, y0, db0, moved}。入力＝指（pointerId）・キー（"key:"+code）・MIDI（"midi:"+note）（v0.3.159）。
  // mode：start＝離すと鳴らす／stop＝鳴っているセット（離すと止まる）。上下に動かした（moved）ら離しても何もしない＝音量だけ
  const SWIPE_PX=8, PX_PER_DB=5;   // 8px 動くまではタップ扱い。そこから上へ 5px で +1 dB
  const copyTo=k=>{ if(copySetTo(k)){ say("COPY ▸ SET "+no(k)+" にいまのセットを写した"); arm("chop",false); paintSet(); } else say("COPY：いまのセットには写せない"); };
  const down=(k,id,y)=>{
    if(holds.has(id)) return;
    const d=setGridEl.children[k], on=setIsPlaying(k);
    holds.set(id, {k, d, mode:on?"stop":"start", y0:y||0, db0:setLevels[k]||0, moved:false});
    d.classList.add("pressing");
    say((on ? "離すと止まる：" : "離すと鳴る：")+no(k)+" "+setName(k)+"（上下で音量）"); };
  const showLv=h=>{ paintSetLevel(h.d, h.k); say("VOL "+no(h.k)+" "+setName(h.k)+"  "+fmtSetLevel(setLevels[h.k])+" dB"); };   // 動かしている 1 枚だけ塗る（毎回 16 枚は重い）
  const up=(id,cancelled)=>{ const h=holds.get(id); if(!h) return; holds.delete(id); endHold(h);
    if(cancelled || h.moved) return;   // 取り消された入力・音量を動かした入力では鳴らさない／止めない
    if(h.mode==="stop"){ if(setIsPlaying(h.k)){ stopSet(h.k); say("■ "+no(h.k)+" "+setName(h.k)); paintSet(); } return; }
    if(!setIsPlaying(h.k)){ startSet(h.k); setHold(h.k,true); say("▶ "+no(h.k)+" "+setName(h.k)+"（押して離すと止まる・上下で音量）"); paintSet(); } };
  // 指
  const pressStart=(e)=>{ const d=e.target.closest(".setpad"); if(!d) return; e.preventDefault();
    const k=+d.dataset.k;
    try{ d.setPointerCapture(e.pointerId); }catch(_){}
    if(armMode==="chop"){ copyTo(k); return; }
    down(k, e.pointerId, e.clientY); };
  const pressMove=(e)=>{ const h=holds.get(e.pointerId); if(!h) return;
    const dy=e.clientY-h.y0;
    if(!h.moved){ if(Math.abs(dy)<SWIPE_PX) return; h.moved=true; h.d.classList.add("adj"); }
    const eff = dy>0 ? dy-SWIPE_PX : dy+SWIPE_PX;   // 遊びの分を引く＝動き出しで跳ばない
    setSetLevel(h.k, h.db0 - eff/PX_PER_DB); showLv(h); };
  const pressEnd=(e)=>{ up(e.pointerId, e.type==="pointercancel"); };
  // キーボード・MIDI（v0.3.159）：52-chop / 72-midi の入口から。押しているキーの ↑ ↓ ＝音量 ±1 dB（指の上下スワイプの代わり）
  _setIn.down=(k,src)=>{ if(!setMode || !(k>=0&&k<16)) return false; if(armMode==="chop"){ copyTo(k); return true; } down(k,src,0); return true; };
  _setIn.up=(src)=>{ up(src,false); };
  _setIn.upAll=()=>{ [...holds.keys()].filter(id=>typeof id==="string").forEach(id=>up(id,true)); };   // 窓を離れたらキーの押しっぱなしを放す
  _setIn.nudge=(dDb)=>{ const ids=[...holds.keys()].filter(id=>typeof id==="string"); if(!ids.length) return false;
    const h=holds.get(ids[ids.length-1]); h.moved=true; h.d.classList.add("adj"); setSetLevel(h.k,(setLevels[h.k]||0)+dDb); showLv(h); return true; };
  if(setGridEl){ setGridEl.addEventListener("pointerdown",pressStart); setGridEl.addEventListener("pointermove",pressMove); setGridEl.addEventListener("pointerup",pressEnd); setGridEl.addEventListener("pointercancel",pressEnd); }
  // 窓の中の A B C D（#clKeysSet）は v0.3.183 で撤去：主面の下の A B C D と重複（§171）
  // セットの名前を変える（v0.3.167 §160）：「鉛筆にして」＝情報窓の SET ページの NOW の横の ✎。パッドの名前（EDIT の ✎）と同じ作法：
  // ✎＝入力欄 / Enter・外をタップ＝確定 / Escape＝取消。窓は innerHTML で描き直すので、ボタンは document で受ける
  const nameOpen=()=>{ const inp=$("clSetNameIn"), txt=$("clSetName"), btn=$("clSetRename"); if(!inp) return;
    inp.value=setName(setCur); inp.hidden=false; if(txt) txt.hidden=true; if(btn) btn.hidden=true; inp.focus(); inp.select(); };
  const nameClose=commit=>{ const inp=$("clSetNameIn"), txt=$("clSetName"), btn=$("clSetRename"); if(!inp||inp.hidden) return;
    const v=inp.value.trim();
    inp.hidden=true; if(txt) txt.hidden=false; if(btn) btn.hidden=false;
    if(commit && v && v!==setName(setCur)){ setRename(setCur, v); say("SET "+no(setCur)+" の名前 ▸ "+setName(setCur)); }
    paintSet(); };
  document.addEventListener("click",e=>{ if(!e.target.closest("#clSetRename")) return; e.preventDefault(); e.stopPropagation(); nameOpen(); });
  document.addEventListener("keydown",e=>{ if(e.target.id!=="clSetNameIn") return;
    e.stopPropagation();   // 打った文字で SET のキー（1-8 / Q-I）やショートカットが動かない
    if(e.key==="Enter"){ e.preventDefault(); nameClose(true); } else if(e.key==="Escape"){ e.preventDefault(); nameClose(false); } }, true);
  document.addEventListener("focusout",e=>{ if(e.target.id==="clSetNameIn") nameClose(true); });
  setInterval(()=>{ if(setMode) paintSet(); }, 500);   // 経過時間と、鳴っているセットの印（16 個の塗り直しは軽い）
})();
