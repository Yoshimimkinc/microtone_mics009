// @module ui/hints
// @provides HINTS_KEY, hintsOn, setHints
// @uses sampNameEl
// @depends -
// ---------- 解説の文言の ON / OFF（v0.3.233 §223） ----------
// 「解説の文言はオンオフ出来ないかな設定で」。メニュー Skin の「解説の文言」で切り替える（端末ごとに覚える。既定 ON）。
// OFF＝body.nohints：操作の説明だけを隠す（css/80-responsive の最後）。状態やエラーを知らせるメッセージ（情報窓の 1 行）は出す。
//   隠すもの：情報窓のモード中のヒント（#clHint）・SET の使い方（.cl-help、場所は残す）・SET 一覧の説明（.setpick-help）・
//   FX ⇄ A B C D のスワイプ案内（.fx-swipe::after）・KEY の CHORDS / SOUND の説明・スクラッチのフェーダーの TOUCH ↓ VOL
const HINTS_KEY="mics-hints";
function hintsOn(){ try{ return localStorage.getItem(HINTS_KEY)!=="0"; }catch(_){ return true; } }
function setHints(on){
  try{ localStorage.setItem(HINTS_KEY, on?"1":"0"); }catch(_){}
  document.body.classList.toggle("nohints", !on);
  const tg=document.getElementById("hintsToggle"); if(tg) tg.classList.toggle("on", !!on);
}
(function(){
  document.body.classList.toggle("nohints", !hintsOn());
  const tg=document.getElementById("hintsToggle");
  if(!tg) return;
  tg.classList.toggle("on", hintsOn());
  tg.addEventListener("click",()=>{
    const on=!tg.classList.contains("on"); setHints(on);
    if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent = on ? "解説の文言 ON" : "解説の文言 OFF（操作の説明を隠す）";
  });
})();
