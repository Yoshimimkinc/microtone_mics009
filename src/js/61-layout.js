// ---------- mode switch ----------
const modeBtns=[document.getElementById("modePads"),document.getElementById("modeSeq")];
function switchView(viewId){
  modeBtns.forEach(b=>{ const on=b.dataset.view===viewId; b.classList.toggle("on",on); b.setAttribute("aria-pressed", on?"true":"false"); });
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===viewId));
  if(viewId==="viewPads"){ drawAllPadWaves(); }
  if(viewId==="viewSeq") paintSteps();
  // スマホのモードドット同期（●PADS 〇SEQ）
  const dots=document.getElementById("viewDots");
  if(dots){ dots.querySelectorAll(".vdot").forEach(d=>d.classList.toggle("on",d.dataset.view===viewId)); }
  lockViewHeight();
  if(typeof updatePerf==="function") updatePerf();
}
modeBtns.forEach(b=>b.addEventListener("click",()=>switchView(b.dataset.view)));
document.querySelectorAll("#viewDots .vdot").forEach(d=>d.addEventListener("click",()=>switchView(d.dataset.view)));

// スマホ：左右スワイプで PADS/SEQ/MIX を切替（p-lock記録中やスライダー上は無効）
(function(){
  const order=["viewPads","viewSeq"];
  let sx=0,sy=0,st=0,sEl=null,tracking=false;
  const curView=()=>order.find(id=>{const el=document.getElementById(id);return el&&el.classList.contains("active");})||"viewPads";
  addEventListener("touchstart",(e)=>{
    if(innerWidth>600||e.touches.length!==1){ tracking=false; return; }
    const t=e.touches[0]; sx=t.clientX; sy=t.clientY; st=Date.now(); sEl=e.target; tracking=true;
  },{passive:true});
  addEventListener("touchend",(e)=>{
    if(!tracking){ return; } tracking=false;
    if(innerWidth>600||activeLock) return;                    // p-lock記録中は横ドラッグ＝値入力なので無効
    if(sEl&&sEl.closest&&sEl.closest("input,select")) return; // スライダー類は除外
    const t=e.changedTouches[0]; const dx=t.clientX-sx, dy=t.clientY-sy, dt=Date.now()-st;
    if(dt>700||Math.abs(dx)<70||Math.abs(dx)<Math.abs(dy)*1.5) return; // 明確な横スワイプのみ
    let idx=order.indexOf(curView())+(dx<0?1:-1);
    if(idx<0||idx>=order.length) return;                      // 端では何もしない
    switchView(order[idx]);
  },{passive:true});
})();

// ---------- 切替で高さが変わらないよう、PADSの高さに統一（PC） ----------
let refViewH = 0;
function lockViewHeight(){
  const body=document.querySelector(".body");
  const vp=viewPadsEl;
  if(!body||!vp) return;
  if(window.innerWidth<=600){ body.style.minHeight=""; return; } // スマホは固定しない
  body.style.minHeight="";                       // 先に解除して自然高さへ戻す（測る前に必ず）
  if(vp.classList.contains("active")){
    refViewH=vp.offsetHeight;                    // PADSの自然高さを基準に測る
  }else{
    // SEQ表示中は PADS が display:none で測れない。窓の残り（.body の上端から下端まで）から求める。
    // これが無いと、SEQを開いたままウィンドウの高さを変えても古い値が残り、
    // PADSへ往復するまで追従しなかった（v0.3.97で修正）
    const top=body.getBoundingClientRect().top;
    const unit=document.querySelector(".unit");
    const pb=unit?parseFloat(getComputedStyle(unit).paddingBottom)||0:0;
    refViewH=Math.max(0, Math.round(window.innerHeight - top - pb));
  }
  if(refViewH){
    body.style.minHeight = refViewH+"px";        // どのビューも縮まない＝高さ一定
  }
  // SEQのグリッドはCSSのflexで余白を自動充填するので個別計算は不要
}
["resize","orientationchange"].forEach(ev=>window.addEventListener(ev, lockViewHeight));
// スマホ：body の高さを実際の可視高さ（innerHeight）で追従させる。100dvh だけだと Safari のバー収納に
// 追従しない端末があり、本体の下に黒い余りが出て、中身が縦スクロールで欠けていた（v0.3.105）
// v0.3.112：実機 iPhone の全画面化直後に visualViewport の高さが古い値のまま固まり、本体の下に黒い余り（約50〜90px）が
// 出てパッドの下段が隠れた（§125）。高さは visualViewport / innerHeight / clientHeight の最大値（キーボードで縮んだ
// visualViewport には引きずられない）にし、全画面切替・可視化の後は数回に分けて測り直す（切替アニメの後に確定する）
const IS_IOS=/iPhone|iPad|iPod/.test(navigator.userAgent)||(navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1);
function fitMobileHeight(){
  if(window.innerWidth>600){ document.body.style.height=""; return; }
  let h=Math.max((window.visualViewport&&window.visualViewport.height)||0, window.innerHeight||0, document.documentElement.clientHeight||0);
  // iOS の全画面/ホーム画面起動：innerHeight がステータスバー分（47px）小さく報告されるのにレイアウト原点は画面上端
  // ＝本体の下に黒い余り（実機 iPhone 16e で 87px＝47＋安全域40）。画面の実寸（縦持ちの screen.height）を使う（§126 v0.3.113）。
  // Android は全画面で innerHeight が実寸になるので触らない（screen.height はナビバー込みで大きすぎることがある）
  const fs=!!(document.fullscreenElement||document.webkitFullscreenElement||navigator.standalone);
  if(IS_IOS && fs && screen && screen.height>screen.width) h=Math.max(h, screen.height);
  if(h>200) document.body.style.height=Math.round(h)+"px";
}
function refitMobileHeight(){ fitMobileHeight(); [150,600,1500].forEach(ms=>setTimeout(fitMobileHeight, ms)); }
["resize","orientationchange","load","fullscreenchange","webkitfullscreenchange","pageshow"].forEach(ev=>window.addEventListener(ev, refitMobileHeight));
document.addEventListener("fullscreenchange", refitMobileHeight);
document.addEventListener("webkitfullscreenchange", refitMobileHeight);
document.addEventListener("visibilitychange", ()=>{ if(!document.hidden) refitMobileHeight(); });
if(window.visualViewport) window.visualViewport.addEventListener("resize", fitMobileHeight);
setTimeout(fitMobileHeight, 400);
window.addEventListener("load", lockViewHeight);
setTimeout(lockViewHeight, 400);

// ===== スマホ：MUTE/SOLO を下段 EDIT の横へ（transportを5ボタンに圧縮）。
//   同一DOMノードを親替えするだけ＝armed状態/配線(ID参照)はそのまま。
//   スマホ(<600px)はperf非該当なのでperf(ヘッダtransport依存)に影響なし。
function relocateMuteSolo(){
  const mute=document.getElementById("holdMute"), solo=document.getElementById("holdSolo");
  const tr=document.querySelector(".transport"), msbar=document.querySelector(".msbar"), edit=document.getElementById("holdEdit"), menu=document.getElementById("menuBtn");
  if(!mute||!solo||!tr||!msbar) return;
  const mobile=window.innerWidth<=600;
  if(mobile){
    if(mute.parentNode!==msbar && edit){ msbar.insertBefore(mute,edit); msbar.insertBefore(solo,edit); mute.classList.add("ms-in-edit"); solo.classList.add("ms-in-edit"); }
  } else {
    if(mute.parentNode!==tr && menu){ tr.insertBefore(mute,menu); tr.insertBefore(solo,menu); mute.classList.remove("ms-in-edit"); solo.classList.remove("ms-in-edit"); }
  }
}
window.addEventListener("load", relocateMuteSolo);
window.addEventListener("resize", relocateMuteSolo);
relocateMuteSolo();
// スマホ：ロゴを PADS/SEQ の行（#viewDots）の左へ親替え＝見出し行を1段減らしてパッドに高さを渡す。
// ブランドは画面に残す（スクショで訴求できる）。PCでは .brand に戻す。同一DOMノードの移動だけ（v0.3.111）
function relocateLogo(){
  const logo=document.querySelector(".logo"), brand=document.querySelector(".top .brand"), dots=document.getElementById("viewDots");
  if(!logo||!brand||!dots) return;
  const mobile=window.innerWidth<=767;
  if(mobile){ if(logo.parentNode!==dots) dots.insertBefore(logo, dots.firstChild); }
  else { if(logo.parentNode!==brand) brand.insertBefore(logo, brand.firstChild); }
}
window.addEventListener("load", relocateLogo);
window.addEventListener("resize", relocateLogo);
relocateLogo();

// ===== Performance Mode：4×4 × 横向き × PC/iPad幅(≥768) で発動。縦向き(4×4)は回転オーバーレイ =====
function landscapeMode(){ return !(window.matchMedia && window.matchMedia("(orientation:landscape)").matches===false); }
function perfFourUp(){ return viewPadsEl.classList.contains("split") && viewPadsEl.classList.contains("active") && window.innerWidth>=768; }
// 中身（打ち込み）の有無：パターンp（全トラック・全小節）／小節b（パターンp・全トラック）
function barHasContent(p,b){ for(let i=0;i<tracks.length;i++){ const arr=tracks[i].patterns[p]&&tracks[i].patterns[p][b]; if(arr){ for(let s=0;s<arr.length;s++) if(arr[s]>0) return true; } } return false; }
function patHasContent(p){ for(let i=0;i<tracks.length;i++){ const pat=tracks[i].patterns[p]; if(!pat) continue; for(let b=0;b<pat.length;b++){ const arr=pat[b]; if(arr){ for(let s=0;s<arr.length;s++) if(arr[s]>0) return true; } } } return false; }
function paintPerf(){   // 情報窓は全レイアウト共通（MPC式：常時ここに現在地と選択パッドの値が出る）
  const $=id=>document.getElementById(id);
  const bv=(typeof bpmVal!=="undefined"?bpmVal:100), ep=(typeof editPat!=="undefined"?editPat:0);
  if($("perfBpm")) $("perfBpm").textContent=bv.toFixed(1);
  if($("clSwing")) $("clSwing").textContent=String(typeof swingPct!=="undefined"?swingPct:50);
  // 窓の PAT/BAR は「現在地」＝再生中は鳴っている場所、停止中は編集位置（§0-3「嘘をつかない」。
  // 以前は再生中も編集位置で、2小節目が鳴っていても BAR 1、予約しただけで PAT B と出ていた）
  const _plNow=(typeof playing!=="undefined"&&playing);
  if($("perfPat")) $("perfPat").textContent="ABCD"[_plNow?(typeof displayPat!=="undefined"?displayPat:ep):ep];
  if($("clBar")) $("clBar").textContent=String((_plNow?(typeof displayBar!=="undefined"?displayBar:0):(typeof editBar!=="undefined"?editBar:0))+1);
  const _pl=(typeof playing!=="undefined"&&playing);
  if($("clStep")) $("clStep").textContent=_pl?(String((typeof playStep!=="undefined"?playStep:0)+1).padStart(2,"0")+"/16"):"--";
  const _scr=document.querySelector(".perf-screen"); if(_scr) _scr.classList.toggle("playing",_pl);
  if($("perfSel") && typeof stepTrackName==="function") $("perfSel").textContent=stepTrackName();
  const _msg=(typeof sampNameEl!=="undefined"&&sampNameEl)?((sampNameEl.textContent||"").trim()):"";
  if($("clMsg")) $("clMsg").textContent=_msg;   // 行は常設。空でも畳まない（畳むと窓が跳ねる）
  // 選択パッドの値（MPC式＝この窓で直接いじる対象。中身は開いているページぶんだけ）
  if(typeof paintClPage==="function") paintClPage();
  if($("clHint")){
    const am=(typeof armMode!=="undefined")?armMode:null;
    let h;
    if(am==="select") h="SELECT中：パッドを1つ選ぶと選択（無音）→自動で解除";
    else if(am==="mute") h="MUTE中：パッド=消音トグル";
    else if(am==="solo") h="SOLO中：パッド=ソロトグル";
    else if(am==="edit") h="EDIT中：パッド=中身編集 / ドラッグ=入替 / 長押し=コピー";
    else if(am==="chop") h="COPY中：元→先 でコピー（PAD音色+FX / パターンA-D / 小節1-4）";
    else if(typeof activeLock!=="undefined" && activeLock) h=activeLock.toUpperCase()+"：PAD左右=基本値 / 下段ステップ左右=そのステップだけ(P-LOCK)";
    else h="";   // 平常時は黙る（常時チートシートは出さない）
    $("clHint").textContent = _msg ? "" : h;   // メッセージが出ている間はヒントを引っ込める（1行を共用）
  }
  // パターン：現在=on、再生中の予約=queued
  document.querySelectorAll("#perfPats .perf-pat").forEach(b=>{
    const p=+b.dataset.p;
    b.classList.toggle("on", p===ep);
    b.classList.toggle("queued", (typeof playing!=="undefined"&&playing) && (typeof queuedPat!=="undefined") && queuedPat===p);
    b.classList.toggle("has", patHasContent(p));   // 中身あり＝ドット表示
  });
  // 小節1-4：現在の editBar を反映＋中身あり＝ドット（今のパターンの各小節）
  document.querySelectorAll("#perfPats .perf-bar").forEach(b=>{
    b.classList.toggle("on", +b.dataset.b===(typeof editBar!=="undefined"?editBar:0));
    b.classList.toggle("has", barHasContent(ep, +b.dataset.b));
  });
  // P-LOCK選択（activeLock）を反映（comp/edit はモードボタンなので除外）
  document.querySelectorAll("#perfPlk .perf-plkbtn:not(.perf-mode)").forEach(b=>b.classList.toggle("on", b.dataset.lock===activeLock));
  // モードボタン：COMP=compOn / EDIT=armMode（既存の単一状態を反映）
  if($("perfEdit")) $("perfEdit").classList.toggle("on", (typeof armMode!=="undefined") && armMode==="edit");
  if($("perfRec")) $("perfRec").classList.toggle("on", perfRecArm);
}
// P-LOCKパラメータ・ページ：選択中は16パッドを「効果量のフィル」表示（発音せず）、キー解放で元値へ復帰
function perfFillPad(i, param){
  if(!param || !PERF_BASE[param]) return;
  const el=padsEl.children[i]; if(!el) return;
  const spec=PLOCKS[param], val = param==="filter"?tracks[i].cutoff : tracks[i][PERF_BASE[param]];
  let norm = spec.log ? (Math.log(val)-Math.log(spec.min))/(Math.log(spec.max)-Math.log(spec.min)) : (val-spec.min)/(spec.max-spec.min);
  norm=Math.max(0,Math.min(1,norm));
  if(el._lockfill){ el._lockfill.style.width=(norm*100).toFixed(1)+"%"; el._lockfill.style.background="rgb("+spec.color+")"; }
  if(el._lockv) el._lockv.textContent=spec.fmt(val);
}
function renderPerfFills(){
  const param=(activeLock && PERF_BASE[activeLock] && document.body.classList.contains("perf"))?activeLock:null;
  for(let i=0;i<padsEl.children.length;i++){
    if(param) perfFillPad(i, param);
    else { const el=padsEl.children[i]; if(el._lockfill) el._lockfill.style.width="0%"; if(el._lockv) el._lockv.textContent=""; }
  }
}
function perfRevertSnap(){    // perfSnap の元値へ16パッドを戻す
  if(!perfSnap) return;
  const p=perfSnap.param;
  for(let i=0;i<16;i++){ const t=tracks[i];
    if(p==="filter"){ t.cutoff=perfSnap.vals[i]; t.filter=perfSnap.filt[i]; } else t[PERF_BASE[p]]=perfSnap.vals[i];
  }
}
function perfLockApply(prev){
  // 直前のP-LOCKを抜けた（別へ/解放）→ REC OFFなら元値へ復帰
  if(perfSnap && prev && perfSnap.param===prev && prev!==activeLock){
    // REC OFF＝瞬間（復帰）／REC ONでもステップへ記録済みならbaseは復帰（オートメーションはlocksに在る）
    if(!perfRecArm || perfSnap.recorded) perfRevertSnap();
    perfSnap=null;
  }
  // 新しいP-LOCKが有効＝16パッドの元値をスナップショット（復帰用）
  if(activeLock && PERF_BASE[activeLock] && (!perfSnap || perfSnap.param!==activeLock)){
    perfSnap={param:activeLock, vals:[], filt:[], recorded:false};
    for(let i=0;i<16;i++){ const t=tracks[i]; perfSnap.vals[i]= activeLock==="filter"?t.cutoff : t[PERF_BASE[activeLock]]; perfSnap.filt[i]=t.filter; }
  }
  if(!(activeLock && PERF_BASE[activeLock])) perfSnap=null;
  document.body.classList.toggle("perf-plock", !!(activeLock && PERF_BASE[activeLock] && document.body.classList.contains("perf")));
  renderPerfFills();
  if(typeof syncEditor==="function") syncEditor();
}
// 演奏コントロール配線（既存ハンドラ/単一の真を再利用＝状態の二重管理なし）
(function(){
  const $=id=>document.getElementById(id);
  document.querySelectorAll("#perfPats .perf-pat").forEach(b=>b.addEventListener("click",()=>{ if(copyTap("pat",+b.dataset.p)) return; if(typeof setEditPat==="function") setEditPat(+b.dataset.p); paintPerf(); }));
  // 小節(1-4)：COPY中は元→先で小節コピー、通常は setEditBar。DUPはCOPYに統合し撤去。
  document.querySelectorAll("#perfPats .perf-bar").forEach(b=>b.addEventListener("click",()=>{ if(copyTap("bar",+b.dataset.b)) return; if(typeof setEditBar==="function") setEditBar(+b.dataset.b); paintPerf(); }));
  // P-LOCK選択：setActiveLock（activeLock共有）＋パラメータ・ページのスナップ/復帰。
  // comp/edit は P-LOCK ではなくモードボタン（.perf-mode）なので除外し、専用配線で既存の真へproxy。
  document.querySelectorAll("#perfPlk .perf-plkbtn:not(.perf-mode)").forEach(b=>b.addEventListener("click",()=>{
    const prev=activeLock;
    setActiveLock(b.dataset.lock);
    perfLockApply(prev); paintPerf();
  }));
  // EDIT：EDITモード（EDIT+PAD で中身編集）。既存 #holdEdit を proxy（armモード共有）
  if($("perfEdit")) $("perfEdit").addEventListener("click",()=>{ $("holdEdit") && $("holdEdit").click(); paintPerf(); });
  if($("perfRec")) $("perfRec").addEventListener("click",()=>{ perfRecArm=!perfRecArm; paintPerf();
    sampNameEl.textContent = perfRecArm ? "REC ON：再生中いじりをステップに記録" : "REC OFF：演奏のみ（離すと戻る）"; });
})();
function updatePerf(){
  const four=perfFourUp(), land=landscapeMode();
  const wasPerf=document.body.classList.contains("perf");
  // 「横にしてください」はタッチ端末（iPad縦）だけ。PCの縦長ウィンドウ（縦モニタ／ハーフスクリーン）は
  // 回転できないので、perfを諦めて通常の split で動かす（v0.3.98：960×1040 等で全面覆われて操作不能だった）
  const coarse = !!(window.matchMedia && window.matchMedia("(pointer:coarse)").matches);
  document.body.classList.toggle("perf", four && land);
  document.body.classList.toggle("perf-rotate", four && !land && coarse);
  if(wasPerf && !(four && land)){   // 演奏を抜ける＝P-LOCKページを解放（REC OFFなら復帰）
    if(perfSnap){ if(!perfRecArm || perfSnap.recorded) perfRevertSnap(); perfSnap=null; }
    document.body.classList.remove("perf-plock");
    if(typeof renderPerfFills==="function") renderPerfFills();
  }
  if(four && !wasPerf){
    // ベストエフォートで横向きロック（Android系のみ有効。iPad Safariは非対応＝回転オーバーレイが実質ガード）
    try{ if(screen.orientation && screen.orientation.lock){ const p=screen.orientation.lock("landscape"); if(p&&p.catch) p.catch(()=>{}); } }catch(_){}
  }
  if(four && land) paintPerf();
}
["resize","orientationchange"].forEach(ev=>window.addEventListener(ev, updatePerf));
window.addEventListener("load", updatePerf);
setTimeout(updatePerf, 350);
setInterval(()=>{ if(playing || document.body.classList.contains("perf")) paintPerf(); }, 200);   // 再生中は全レイアウトで窓を同期

