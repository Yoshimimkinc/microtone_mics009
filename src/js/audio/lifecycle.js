// @module audio/lifecycle
// @provides _audioNeedsRecovery, _audioRecovering, _wakeIdleAt, _wakeLock, _wakeReq, audioRecover,
//    audioSuspendScheduling, wakeSync, wakeWanted
// @uses AC, _keyLoop, pauseSideClock, pauseTransportClock, playing, resumeSideClock, resumeTransportClock,
//    sampNameEl, scratchClose, sideCount, sidePlayers, sideTrs, stopAllVoices, stopVoices
// @depends engine-core
// アプリ復帰時に古い先読み予約を捨てる。AudioContextとサンプルは作り直さない。
let _audioNeedsRecovery=false, _audioRecovering=null;
function audioSuspendScheduling(){
  _audioNeedsRecovery=true;
  pauseTransportClock(); pauseSideClock();
  stopAllVoices(AC.currentTime);
  sidePlayers.forEach(p=>{ const ts=sideTrs(p.k); if(ts) ts.forEach(t=>stopVoices(t,AC.currentTime)); });
  if(typeof scratchClose==='function') scratchClose();
}
async function audioRecover(){
  if(document.hidden) return false;
  if(_audioRecovering) return _audioRecovering;
  _audioRecovering=(async()=>{
    try{
      if(AC.state!=='running') await AC.resume();
      if(AC.state!=='running') throw new Error('音声を再開するにはパッドをタップしてください');
      if(_audioNeedsRecovery){ resumeTransportClock(); resumeSideClock(); _audioNeedsRecovery=false; }
      return true;
    }catch(e){ sampNameEl.textContent='音声再開待ち：パッドをタップ'; return false; }

  })().finally(()=>{_audioRecovering=null;});
  return _audioRecovering;
}
document.addEventListener('visibilitychange',()=>{ if(document.hidden) audioSuspendScheduling(); else audioRecover(); });
window.addEventListener('pageshow',()=>audioRecover());
AC.addEventListener('statechange',()=>{ if(AC.state==='interrupted'||AC.state==='suspended'){ audioSuspendScheduling(); } else if(AC.state==='running'&&!document.hidden) audioRecover(); });
document.addEventListener('pointerdown',()=>{ if(_audioNeedsRecovery||AC.state!=='running') audioRecover(); },{capture:true});
// v0.3.209 §198：再生中は画面をスリープさせない（Screen Wake Lock）。▶・SET で鳴っている他のセット・KEY のループのどれかが鳴っていれば取り、
// 全部止まって 5 秒で手放す（止めてすぐ次を鳴らす時に取り直さない）。画面が隠れると OS が外すので、戻った時に鳴っていればまた取る。
// iPhone の Safari は 16.4 から対応。対応していない端末では何もしない。取るのは ▶ を押した瞬間（startTransport）にも行う＝ユーザー操作の中で頼む
let _wakeLock=null, _wakeReq=null, _wakeIdleAt=0;
function wakeWanted(){ return !!(playing || sideCount() || (typeof _keyLoop!=='undefined' && _keyLoop)); }
function wakeSync(){
  if(!navigator.wakeLock) return;
  if(wakeWanted() && !document.hidden){
    _wakeIdleAt=0;
    if(_wakeLock || _wakeReq) return;
    _wakeReq=navigator.wakeLock.request('screen').then(l=>{ _wakeLock=l; l.addEventListener('release',()=>{ if(_wakeLock===l) _wakeLock=null; }); })
      .catch(()=>{}).finally(()=>{ _wakeReq=null; });
    return;
  }
  if(!_wakeLock) return;
  const now=performance.now();
  if(!_wakeIdleAt){ _wakeIdleAt=now; return; }
  if(now-_wakeIdleAt<5000) return;
  const l=_wakeLock; _wakeLock=null; _wakeIdleAt=0; l.release().catch(()=>{});
}
setInterval(wakeSync, 1000);
document.addEventListener('visibilitychange', wakeSync);
