// ===== 情報窓のパラメータを横ドラッグで編集（パッドを叩きながら追い込める＝モーダル不要の連続編集） =====
// パッド1枚の編集項目を「カテゴリ＝ページ」に棚卸ししたもの（docs/screen-spec.md §96 の表と1:1）。
// en=列挙（タップで送る） / min-max-st=数値（横ドラッグ＝データホイール） / ro=表示専用 / w=固定表示幅(ch)
const CL_SPEC={
  // g:1 = パッドではなく本体の状態。書き込みはメニューの既存UI経由に流して単一経路を保つ
  // （setDelayTempo・readout・paintPerf が既存ハンドラでまとめて走る）
  bpm:   {lbl:"BPM", g:1, get:()=>bpmVal, min:40,max:250,st:0.5,px:5, fmt:v=>v.toFixed(1), w:5, zero:100,
          set:v=>{ const el=document.getElementById("bpm"); el.value=v; el.dispatchEvent(new Event("input",{bubbles:true})); }},
  swing: {lbl:"SWG", g:1, en:[50,54,58,63,67,71], get:()=>swingPct, fmt:v=>String(v), w:2,
          set:v=>{ const el=document.getElementById("swing"); el.value=v; el.dispatchEvent(new Event("change",{bubbles:true})); }},
  pitch: {lbl:"PITCH", u:"st", get:t=>t.tune,  set:(t,v)=>t.tune=v, min:-12,max:12,st:1,px:14, fmt:v=>(v>0?"+":"")+v, w:3},
  scale: {lbl:"SCALE", en:["off","chro","maj","min","pent"], get:t=>t.scale||"off",
          set:(t,v)=>{ t.scale=v; if(typeof refreshSeqMode==="function") refreshSeqMode(); },   // SEQの音階表示も連動
          fmt:v=>v.toUpperCase(), w:4},
  level: {lbl:"LEVEL", u:"dB", get:t=>t.vol,   set:(t,v)=>t.vol=v,  min:-30,max:6, st:1,px:8,  fmt:v=>String(v), w:3},
  start: {lbl:"START", u:"%",  get:t=>t.start, set:(t,v)=>t.start=Math.min(v,(t.end??1)-0.004), min:0,max:1,st:0.002,px:3, fmt:v=>(v*100).toFixed(1), w:5, wave:1},
  end:   {lbl:"END",   u:"%",  get:t=>t.end,   set:(t,v)=>t.end=Math.max(v,(t.start||0)+0.004), min:0,max:1,st:0.002,px:3, fmt:v=>(v*100).toFixed(1), w:5, wave:1,
          zero:1},   // END の「0」は無音＝意味が無く、しかも START が動けなくなる罠。戻し先は末尾（BPM→100 と同じ「0が無い欄」の例外）
  loop:  {lbl:"LOOP",  en:[false,true], get:t=>!!t.loop, set:(t,v)=>{ t.loop=v; if(v&&(t.loopStart==null||t.loopStart<t.start)) t.loopStart=t.start; }, fmt:v=>v?"ON":"OFF", w:3, wave:1},
  filter:{lbl:"FILTER",en:["off","lp","hp"], get:t=>t.filter||"off",
          set:(t,v)=>{ t.filter=v; if(v==="lp"&&t.cutoff>=10000) t.cutoff=3000; if(v==="hp"&&t.cutoff>=10000) t.cutoff=700; },
          fmt:v=>v.toUpperCase(), w:3},
  cutoff:{lbl:"CUTOFF",u:"Hz", get:t=>t.cutoff,set:(t,v)=>t.cutoff=v,min:200,max:18000,st:100,px:2,
          fmt:v=>v>=1000?(v/1000).toFixed(1)+"k":String(v), w:5},
  reso:  {lbl:"RESO",  get:t=>t.reso, set:(t,v)=>t.reso=v, min:0.1,max:14,st:0.1,px:6, fmt:v=>v.toFixed(1), w:4},
  attack:{lbl:"ATTACK",u:"ms", get:t=>t.attack||0, set:(t,v)=>t.attack=v, min:0,max:200,st:1,px:4, fmt:v=>String(v), w:3},
  fade:  {lbl:"FADE",  u:"ms", get:t=>t.fade??3,  set:(t,v)=>t.fade=v,   min:0,max:500,st:5,px:4, fmt:v=>String(v), w:3},
  delay: {lbl:"DELAY", u:"%",  get:t=>Math.round((t.delaySend||0)*100),  set:(t,v)=>t.delaySend=v/100,  min:0,max:100,st:1,px:4, fmt:v=>String(v), w:3},
  reverb:{lbl:"REVERB",u:"%",  get:t=>Math.round((t.reverbSend||0)*100), set:(t,v)=>t.reverbSend=v/100, min:0,max:100,st:1,px:4, fmt:v=>String(v), w:3},
  choke: {lbl:"CHOKE", get:t=>t.choke||0, set:(t,v)=>t.choke=v, min:0,max:8,st:1,px:14, fmt:v=>v?String(v):"OFF", w:3},
  out:   {lbl:"OUT",   en:["A","B"], get:t=>t.outBus||"A", set:(t,v)=>t.outBus=v, fmt:v=>v, w:1,
          msg:v=>"OUT "+v+((typeof multiOut!=="undefined"&&multiOut)?"":" — 4ch機器なし、いまはAから出る")},
  midi:  {lbl:"MIDI",  ro:1, get:t=>t.midiNote, fmt:v=>v==null?"—":midiNoteName(v), w:4},
  key:   {lbl:"KEY",   ro:1, get:t=>t.key,      fmt:v=>v?String(v).toUpperCase():"—", w:4},
};
const CL_PAGES=[
  {id:"main", lbl:"MAIN",   f:["pitch","scale","level","delay","reverb"]},   // FXページは MAIN の2行目へ統合（v0.3.108）：窓の空白44pxを埋め、一番触る5つを1ページに
  {id:"smpl", lbl:"SAMPLE", f:["start","end","loop"],
   b:[{id:"clWave",t:'<span class="cl-wide">✂ TRIM / CHOP</span><span class="cl-narrow">✂</span>'}]},
  {id:"tone", lbl:"TONE",   f:["filter","cutoff","reso","attack","fade"]},
  {id:"asgn", lbl:"ASSIGN", f:["choke","out","midi","key"], b:[{id:"clLearn",t:"LEARN"},{id:"clClear",t:"CLEAR"}],
   x:'<span class="cl-mon" id="clMon" title="鍵盤/キーの着信"><i></i><em>IN</em><b class="cl-num">—</b></span>'},
];
let clPage="main";
function renderClPage(){
  const host=document.getElementById("clPage"); if(!host) return;
  const pg=CL_PAGES.find(x=>x.id===clPage)||CL_PAGES[0];
  clWaveTo("modal");   // 先に退避：innerHTML を書き換えるとスロットごと波形が消える
  host.innerHTML =
    pg.f.map(k=>{ const sp=CL_SPEC[k];
      return `<span class="cl-par${sp.ro?" ro":""}" data-p="${k}"><i>${sp.lbl}</i>`
           + `<b class="cl-num" style="min-width:${sp.w}ch"></b>${sp.u?`<u>${sp.u}</u>`:""}</span>`;
    }).join("")
    + (pg.b||[]).map(b=>`<button class="cl-btn" id="${b.id}">${b.t}</button>`).join("")
    + (pg.x||"");
  document.querySelectorAll("#clKeys .cl-key").forEach(k=>k.classList.toggle("on",k.dataset.pg===pg.id));
  const scr0=document.getElementById("perfScreen");
  if(scr0) scr0.classList.toggle("has-wave", pg.id==="smpl");
  if(pg.id==="smpl") clWaveTo("screen");   // 波形は複製せず移動
  clSyncWave();
  paintClPage();
}
// 波形エディタ（1実体）を情報窓のSAMPLEページとEDITモーダルの間で行き来させる
function clWaveTo(where){   // "screen" | "modal"
  const box=document.getElementById("peWaveBox"); if(!box) return;
  const dst=(where==="screen") ? document.getElementById("clWaveSlot") : document.getElementById("peWaveHome");
  if(!dst || box.parentElement===dst) return;
  dst.appendChild(box);
}
// SAMPLEページを開いている間は、窓の波形が選択パッドを指す（peTarget＝波形まわりの対象）
function clSyncWave(){
  if(clPage!=="smpl") return;
  const slot=document.getElementById("clWaveSlot"); if(!slot) return;
  if(peTarget!==selected){ peTarget=selected; peV0=0; peV1=1; }
  requestAnimationFrame(()=>{
    if(typeof renderPeOver==="function") renderPeOver(peTarget);
    if(typeof renderPeWave==="function") renderPeWave(peTarget);
  });
}
function paintClPage(){
  if(typeof tracks==="undefined") return;
  const t=tracks[selected]; if(!t) return;
  document.querySelectorAll("#clPage .cl-par").forEach(el=>{
    const sp=CL_SPEC[el.dataset.p]; if(!sp) return;
    el.querySelector("b").textContent=sp.fmt(sp.get(t));
  });
  const lb=document.getElementById("clLearn");
  if(lb) lb.classList.toggle("learn-on", assignTarget===selected);
}
(function initScreenParams(){
  const scr=document.getElementById("perfScreen"); if(!scr) return;
  const SPEC=CL_SPEC;
  const quant=(sp,v)=>{ let x=Math.round(v/sp.st)*sp.st; if(sp.st<1) x=+x.toFixed(4); return Math.max(sp.min,Math.min(sp.max,x)); };
  const GET=sp=> sp.g ? sp.get() : sp.get(tracks[selected]);
  const SET=(sp,pad,v)=> sp.g ? sp.set(v) : sp.set(tracks[pad],v);
  const after=(pad,sp,k)=>{
    if(k==="pitch" && typeof warmPitch==="function") warmPitch(pad);
    paintPerf();
    if(typeof syncEditor==="function") syncEditor();
    if(typeof refreshOpenPadEdit==="function") refreshOpenPadEdit(pad);   // EDITモーダルを開いていれば追従
    if(sp.wave && clPage==="smpl" && typeof renderPeWave==="function") renderPeWave(peTarget);   // 窓の波形も追従
    if(sp.msg && typeof sampNameEl!=="undefined" && sampNameEl) sampNameEl.textContent=sp.msg(GET(sp));
  };
  // 欄を既定値（ほとんどは0）へ戻す。旧・円形ノブのダブルタップ復帰をそのまま窓へ引き継いだもの
  // 数値欄は全部おなじルール：戻す先は 0（0が範囲外の CUTOFF/RESO だけ一番0に近い値）。欄ごとの例外は作らない。
  // 列挙欄（SCALE/FILTER/LOOP/OUT）は対象外＝タップで送るのが主操作で、素早い2連打を
  // リセットと誤認すると「送ったのに戻る」になる。OFFへは1〜数タップで届くので不要。
  let _lastResetAt=0, _lastResetKey=null;
  const resetPar=k=>{
    const sp=SPEC[k]; if(!sp||sp.ro||sp.en) return;
    if(k===_lastResetKey && performance.now()-_lastResetAt<500) return;   // 同じ欄で dblclick と pointerdown の2連打判定が両方走っても1手だけ
    _lastResetAt=performance.now(); _lastResetKey=k;
    // zero 指定の欄だけ例外（テンポに「0」は無いので既定の100へ）。他は一律0＝0が範囲外なら一番近い値
    const z=(sp.zero!==undefined)?sp.zero:Math.max(sp.min, Math.min(sp.max, 0));
    if(GET(sp)===z) return;
    pushUndo(); SET(sp,selected,z); after(selected,sp,k); paintClPage();
    if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent=sp.lbl+" → "+sp.fmt(GET(sp))+(sp.u||"");
  };
  scr.addEventListener("dblclick",e=>{   // マウス
    const el=e.target.closest(".cl-par"); if(!el) return;
    e.preventDefault(); resetPar(el.dataset.p);
  });
  let drag=null, lastTap=0, lastTapEl=null;
  scr.addEventListener("pointerdown",e=>{
    const el=e.target.closest(".cl-par"); if(!el) return;
    e.preventDefault();
    const k=el.dataset.p, sp=SPEC[k]; if(!sp||sp.ro) return;
    if(!sp.en){                           // タッチ：同じ数値欄を素早く2回＝0へ
      const now=Date.now();
      if(el===lastTapEl && now-lastTap<320){ lastTap=0; lastTapEl=null; drag=null; resetPar(k); return; }
      lastTap=now; lastTapEl=el;
    }
    scr.querySelectorAll(".cl-par.sel").forEach(x=>x.classList.remove("sel"));   // カーソルは窓に1つ（上段のBPM/SWGも含む）
    el.classList.add("sel","tweak");   // MPC1000のカーソル＝いまデータホイールが効く欄
    drag={el,sp,k,id:e.pointerId,x0:e.clientX,start:GET(sp),pad:selected,undone:false,moved:false};
    try{ el.setPointerCapture(e.pointerId); }catch(_){}
  });
  scr.addEventListener("pointermove",e=>{
    if(!drag) return;
    if(e.pointerId!==undefined && e.pointerId!==drag.id) return;   // 2本指で別の欄を触っても、先の指の移動が後の欄に効かない
    const sp=drag.sp;
    let v;
    if(sp.en){ const d=Math.round((e.clientX-drag.x0)/26);   // d=0 は「元の値」＝往復して離せば戻る
      v=sp.en[((sp.en.indexOf(drag.start)+d)%sp.en.length+sp.en.length)%sp.en.length]; }
    else { v=quant(sp, drag.start + Math.round((e.clientX-drag.x0)/sp.px)*sp.st); }
    if(v===GET(sp)) return;
    drag.moved=true;
    if(!drag.undone){ pushUndo(); drag.undone=true; }   // ドラッグ1回で1手（連続でUndoを埋めない）
    SET(sp,drag.pad,v); after(drag.pad,sp,drag.k); paintClPage();
  });
  const end=e=>{
    if(!drag) return;
    if(e && e.pointerId!==undefined && e.pointerId!==drag.id) return;   // 別の指の up では終わらない
    const sp=drag.sp;
    if(!drag.moved && sp.en){   // タップ＝列挙を1つ送る（MPC1000でいうINC）
      const nx=sp.en[(sp.en.indexOf(GET(sp))+1)%sp.en.length];
      pushUndo(); SET(sp,drag.pad,nx); after(drag.pad,sp,drag.k); paintClPage();
    }
    if(drag.moved){ lastTap=0; lastTapEl=null; }   // ドラッグした押下は「タップ」に数えない（直後の掴み直しを2連打と誤認して0に飛んでいた）
    drag.el.classList.remove("tweak"); drag=null;
  };
  scr.addEventListener("pointerup",end); scr.addEventListener("pointercancel",end);
  document.getElementById("clKeys").addEventListener("click",e=>{
    const b=e.target.closest(".cl-key"); if(!b) return;
    clPage=b.dataset.pg; renderClPage();
  });
  scr.addEventListener("click",e=>{
    const b=e.target.closest(".cl-btn"); if(!b) return;
    const t=tracks[selected];
    if(b.id==="clWave"){ if(typeof openPadEdit==="function") openPadEdit(selected); return; }
    if(b.id==="clLearn"){
      if(assignTarget===selected){ assignTarget=-1; sampNameEl.textContent="ASSIGN 取消"; }
      else { assignTarget=selected; sampNameEl.textContent="ASSIGN — 覚えさせたい鍵盤かキーを押す（もう一度で取消）"; }
      paintClPage(); paintPerf(); return;
    }
    if(b.id==="clClear"){
      if(t.midiNote==null && !t.key) return;
      pushUndo(); t.midiNote=null; t.key=null;
      if(typeof paintPadStates==="function") paintPadStates();
      assignTarget=-1;
      sampNameEl.textContent="割り当てを消した"; paintClPage(); paintPerf();
    }
  });
  renderClPage();
})();

