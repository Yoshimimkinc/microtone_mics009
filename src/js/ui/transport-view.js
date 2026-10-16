// @module ui/transport-view
// @provides _drawOn, drawLoop, paintTransport, playBtn, recBtn, updateRecBtnLabel
// @uses AC, clearBarIndicator, clearPatIndicator, displayBar, displayPat, drawQueue, flashPad, kickVu,
//    moveCursors, paintPadStates, paintSet, paintSteps, playStep, playing, pushUndo, recording, sampNameEl,
//    setCur, setHold, setHoldClear, sideCount, sideStopAll, startTransport, stopTransport,
//    updateBarIndicator, updatePatIndicator, vuHit
// @depends -
// ---------- transport：表示とボタン（▶ / ●）。drawQueue を消化してパッド点灯・カーソル・パターン枠を描く ----------
// 40-transport.js から分離（v0.3.132 Phase 2 第3段）。scheduler が積む drawQueue を rAF で消化するだけ＝音は出さない
let _drawOn=false;   // drawLoop の rAF 連鎖が回っているか（▶ / ■ を素早く繰り返しても二重に回さない）
function drawLoop(){
  _drawOn=true;
  const now = AC.currentTime;
  let cur=null;
  while(drawQueue.length && drawQueue[0].time < now){
    const ev=drawQueue.shift();
    cur=ev.step;
    if(ev.hits) ev.hits.forEach(h=>{flashPad(h.pad,h.acc);if(typeof vuHit==="function")vuHit(h.pad,h.acc);});
    if(ev.pat!==undefined){ if(ev.pat!==displayPat && typeof paintPadStates==="function") paintPadStates();   // パターンが変わった＝ミュートの印も（v0.3.149）
      displayPat=ev.pat; displayBar=ev.bar; updatePatIndicator(ev.pat); updateBarIndicator(ev.bar); }
  }
  if(cur!==null){ playStep=cur; moveCursors(); }
  if(playing) requestAnimationFrame(drawLoop); else _drawOn=false;
}

const playBtn=document.getElementById("play");
// ▶ / ■：状態は startTransport / stopTransport（audio/transport）が書く。ここは表示だけ（v0.3.134）
// 他所からの再生/停止（Space・MIDI Start/Stop・GTR・共有の試聴）は playBtn.click() でここを通る＝表示が必ず追従
// 再生まわりの表示（▶ / ■・SET のオレンジ・カーソル）。▶ ボタンと SET のポン出し（ui/set-view）が状態を変えたあとに呼ぶ
// v0.3.147：SET で他のセットが鳴っている間も ■ を出す（■ ＝ 全部止める）
function paintTransport(){
  const any = playing || (typeof sideCount==="function" && sideCount()>0);
  playBtn.classList.toggle("on",any);
  playBtn.textContent=any?"■":"▶";   // アイコンのみ（文字なし）
  if(typeof paintSet==="function") paintSet();   // SET 画面：再生中のセットをオレンジに（v0.3.145）
  if(typeof paintPadStates==="function") paintPadStates();   // 止めると編集中のパターンのミュートに戻る（v0.3.149）
  if(playing){
    if(!_drawOn) requestAnimationFrame(drawLoop);
    if(typeof kickVu==="function") kickVu();   // VUループ起動（停止中はアイドルで止まっている）
  } else {
    paintSteps();
    clearPatIndicator(); clearBarIndicator();   // 停止したら再生中の外枠を消す
  }
}
playBtn.addEventListener("click",async()=>{
  if(AC.state!=="running") await AC.resume();
  const any = playing || (typeof sideCount==="function" && sideCount()>0);
  if(!any){ startTransport(); if(typeof setHold==="function") setHold(setCur,true); }   // ▶ で鳴らしたセットはホールド扱い（離す指が無い）
  else { if(playing) stopTransport(); if(typeof sideStopAll==="function"){ sideStopAll(); setHoldClear(); } }   // ■ ＝ 鳴っているセットを全部止める
  paintTransport();
});
const recBtn=document.getElementById("rec");
function updateRecBtnLabel(){
  recBtn.textContent = recording ? "■" : "●"; recBtn.classList.toggle("on",recording); recBtn.classList.toggle("rec-live",recording);   // アイコンのみ
}
recBtn.addEventListener("click",()=>{
  recording=!recording; if(recording) pushUndo(); updateRecBtnLabel();
  if(recording&&!playing) sampNameEl.textContent="● 記録待機 — ▶を押すと演奏を記録";
});

