// @module audio/lifecycle
// @provides _audioNeedsRecovery, _audioRecovering, audioRecover, audioSuspendScheduling
// @uses AC, pauseSideClock, pauseTransportClock, resumeSideClock, resumeTransportClock, sampNameEl,
//    scratchClose, sidePlayers, sideTrs, stopAllVoices, stopVoices
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
