// @module ui/status
// @provides _toastTimer, sampNameEl
// @uses -
// @depends -
// ---------- ステータス表示（トースト）：sampNameEl に文を入れると数秒だけ出て消える ----------
// 30-ui-pads.js から分離（v0.3.130 Phase 2）。パッド以外（窓・録音・保存）からも使う共通の出口
const sampNameEl = document.getElementById("sampName");   // ステータス表示（多用するためキャッシュ）
// textContentがセットされたら数秒だけトースト表示→自動で消す（バーに常駐させない）
let _toastTimer=null;
new MutationObserver(()=>{
  const t=(sampNameEl.textContent||"").trim(), has=!!t;
  sampNameEl.classList.toggle("show",has);
  if(_toastTimer){ clearTimeout(_toastTimer); _toastTimer=null; }
  if(has){ _toastTimer=setTimeout(()=>{ sampNameEl.classList.remove("show"); _toastTimer=null; }, Math.min(6000, 2000+t.length*70)); }   // 長文ほど長く出す
  const cm=document.getElementById("clMsg"); if(cm) cm.textContent=t;   // 情報窓の1行に出す
  // 窓が見えていて1行に収まるならトーストは出さない（同じ文が2箇所に出ていた）。
  // 窓が無いSEQ画面と、窓で切れる長文だけトースト
  const winShown = cm && document.getElementById("viewPads") && document.getElementById("viewPads").classList.contains("active")
                   && cm.getBoundingClientRect().height>0;
  const fits = winShown && cm.scrollWidth<=cm.clientWidth+1;
  sampNameEl.classList.toggle("in-window", !!fits);
}).observe(sampNameEl,{childList:true,characterData:true,subtree:true});
