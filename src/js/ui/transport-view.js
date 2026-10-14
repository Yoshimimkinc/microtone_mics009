// @module ui/transport-view
// @provides drawLoop, playBtn, recBtn, updateRecBtnLabel
// @uses AC, clearBarIndicator, clearPatIndicator, displayBar, displayPat, drawQueue, flashPad, kickVu,
//    moveCursors, paintSteps, playStep, playing, pushUndo, recording, sampNameEl, setCur, setLiveArm,
//    setRevert, startTransport, stopTransport, updateBarIndicator, updatePatIndicator, vuHit
// @depends -
// ---------- transport：表示とボタン（▶ / ●）。drawQueue を消化してパッド点灯・カーソル・パターン枠を描く ----------
// 40-transport.js から分離（v0.3.132 Phase 2 第3段）。scheduler が積む drawQueue を rAF で消化するだけ＝音は出さない
function drawLoop(){
  const now = AC.currentTime;
  let cur=null;
  while(drawQueue.length && drawQueue[0].time < now){
    const ev=drawQueue.shift();
    cur=ev.step;
    if(ev.hits) ev.hits.forEach(h=>{flashPad(h.pad,h.acc);if(typeof vuHit==="function")vuHit(h.pad,h.acc);});
    if(ev.pat!==undefined){ displayPat=ev.pat; displayBar=ev.bar; updatePatIndicator(ev.pat); updateBarIndicator(ev.bar); }
  }
  if(cur!==null){ playStep=cur; moveCursors(); }
  if(playing) requestAnimationFrame(drawLoop);
}

const playBtn=document.getElementById("play");
// ▶ / ■：状態は startTransport / stopTransport（audio/transport）が書く。ここは表示だけ（v0.3.134）
// 他所からの再生/停止（Space・MIDI Start/Stop・GTR・共有の試聴）は playBtn.click() でここを通る＝表示が必ず追従
playBtn.addEventListener("click",async()=>{
  if(AC.state!=="running") await AC.resume();
  if(!playing) startTransport(); else stopTransport();
  playBtn.classList.toggle("on",playing);
  playBtn.textContent=playing?"■":"▶";   // アイコンのみ（文字なし）
  if(playing){
    if(typeof setLiveArm==="function") setLiveArm();   // LIVE 中だけ：いまのセットの状態を控える（■ で戻す）
    requestAnimationFrame(drawLoop);
    if(typeof kickVu==="function") kickVu();   // VUループ起動（停止中はアイドルで止まっている）
  } else {
    paintSteps();
    clearPatIndicator(); clearBarIndicator();   // 停止したら再生中の外枠を消す
    // SET：LIVE 中に鳴らしていたなら、演奏中の変化を捨ててセットの保存状態に戻す（§145。LIVE でなければ残る）
    if(typeof setRevert==="function" && setRevert()) sampNameEl.textContent="■ LIVE：SET "+String(setCur+1).padStart(2,"0")+" を演奏前の状態に戻した";
  }
});
const recBtn=document.getElementById("rec");
function updateRecBtnLabel(){
  recBtn.textContent = recording ? "■" : "●"; recBtn.classList.toggle("on",recording); recBtn.classList.toggle("rec-live",recording);   // アイコンのみ
}
recBtn.addEventListener("click",()=>{
  recording=!recording; if(recording) pushUndo(); updateRecBtnLabel();
  if(recording&&!playing) sampNameEl.textContent="● 記録待機 — ▶を押すと演奏を記録";
});

