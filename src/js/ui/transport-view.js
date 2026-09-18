// @module ui/transport-view
// @provides drawLoop, playBtn, recBtn, updateRecBtnLabel
// @uses AC, INTERVAL, barStartTime, clearBarIndicator, clearPatIndicator, displayBar, displayPat, drawQueue,
//    editPat, flashPad, kickVu, moveCursors, paintSteps, playBar, playPat, playStep, playing, pushUndo,
//    queuedPat, recording, sampNameEl, schedTimer, scheduler, stepIdx, stopVoices, tracks,
//    updateBarIndicator, updatePatIndicator, vuHit
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
playBtn.addEventListener("click",async()=>{
  if(AC.state!=="running") await AC.resume();
  playing=!playing;
  playBtn.classList.toggle("on",playing);
  playBtn.textContent=playing?"■":"▶";   // アイコンのみ（文字なし）
  if(playing){
    stepIdx=0; playStep=0; drawQueue.length=0;
    playPat=editPat; playBar=0; queuedPat=null; displayPat=editPat; displayBar=0;
    tracks.forEach(t=>t.loopPlaying=false);   // ループのトグル状態をリセット
    barStartTime=AC.currentTime+0.05;
    schedTimer=setInterval(scheduler, INTERVAL);
    requestAnimationFrame(drawLoop);
    if(typeof kickVu==="function") kickVu();   // VUループ起動（停止中はアイドルで止まっている）
  } else {
    clearInterval(schedTimer); schedTimer=null;
    drawQueue.length=0; playStep=0; paintSteps();
    clearPatIndicator(); clearBarIndicator();   // 停止したら再生中の外枠を消す
    tracks.forEach(t=>{ stopVoices(t, AC.currentTime); t.loopPlaying=false; });   // ループ音を止めてトグル状態もリセット
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

