// @module audio/lifecycle
// @provides BG_AUDIO_KEY, _, _audioNeedsRecovery, _audioRecovering, _silentEl, _silentWavUrl, _wakeIdleAt,
//    _wakeLock, _wakeReq, audioRecover, audioSessionPlayback, audioSessionUnlock, audioSuspendScheduling,
//    bgAudioOn, mediaSessionSync, setBgAudio, wakeSync, wakeWanted
// @uses AC, IS_IOS, _keyLoop, pauseSideClock, pauseTransportClock, playing, resumeSideClock,
//    resumeTransportClock, sampNameEl, scratchClose, setBackgroundAhead, setCur, setName, sideCount,
//    sidePlayers, sideTrs, stopAllVoices, stopVoices
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
// v0.3.242 §232「バックグラウンドでも鳴るようにしたい（設定で）」：メニュー SOUND の「バックグラウンドでも鳴らす」（端末ごと・既定 OFF）。
// OFF（今まで通り）＝隠れたら予約を止めて音も止める（戻った時に古い予約で音がずれないように）。
// ON＝止めない。隠れている間はタイマーが間引かれるので先読みを 1.5 秒に延ばす（setBackgroundAhead）。OS が AudioContext 自体を止めたら（電話・ロック等）今まで通り止める
const BG_AUDIO_KEY='mics-bg-audio';
function bgAudioOn(){ try{ return localStorage.getItem(BG_AUDIO_KEY)==='1'; }catch(_){ return false; } }
function setBgAudio(on){
  try{ localStorage.setItem(BG_AUDIO_KEY, on?'1':'0'); }catch(_){}
  const tg=document.getElementById('bgAudioToggle'); if(tg) tg.classList.toggle('on', !!on);
  if(on) audioSessionUnlock();
}
// v0.3.242 §232「スマホで立ち上げたとき、着信 OFF だと音が鳴らない」：iPhone の Safari は Web Audio を「消音スイッチで消える音」として鳴らす。
// 楽器なので「再生」の音にする：iOS 17 以降は Audio Session API（navigator.audioSession.type='playback'）。
// それより前の iOS は、無音の <audio> を 1 本ループで流すと音の種類が「再生」に切り替わる（パッドを触った時＝ユーザー操作の中で始める）。
// バックグラウンドで鳴らす設定のときも、OS に「再生中」と分かるように流す。iOS 以外では何もしない
let _silentEl=null;
function audioSessionPlayback(){
  try{ if(navigator.audioSession){ if(navigator.audioSession.type!=='playback') navigator.audioSession.type='playback'; return true; } }catch(_){}
  return false;
}
function _silentWavUrl(){   // 0.1 秒・8kHz・16bit の無音 WAV
  const n=800, b=new ArrayBuffer(44+n*2), v=new DataView(b), w=(o,s)=>{ for(let i=0;i<s.length;i++) v.setUint8(o+i,s.charCodeAt(i)); };
  w(0,'RIFF'); v.setUint32(4,36+n*2,true); w(8,'WAVE'); w(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
  v.setUint32(24,8000,true); v.setUint32(28,16000,true); v.setUint16(32,2,true); v.setUint16(34,16,true); w(36,'data'); v.setUint32(40,n*2,true);
  return URL.createObjectURL(new Blob([b],{type:'audio/wav'}));
}
function audioSessionUnlock(){
  const ios=(typeof IS_IOS!=='undefined') ? IS_IOS : /iPhone|iPad|iPod/.test(navigator.userAgent);
  const api=audioSessionPlayback();
  if(!ios || (api && !bgAudioOn())) return;
  try{
    if(!_silentEl){ _silentEl=new Audio(); _silentEl.src=_silentWavUrl(); _silentEl.loop=true; _silentEl.preload='auto'; _silentEl.setAttribute('playsinline',''); }
    if(_silentEl.paused){ const pr=_silentEl.play(); if(pr&&pr.catch) pr.catch(()=>{}); }
  }catch(_){}
}
audioSessionPlayback();   // 起動時に（AudioContext が鳴り始める前に）。操作の中でもう一度＝下の pointerdown
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(bgAudioOn() && AC.state==='running'){ if(typeof setBackgroundAhead==='function') setBackgroundAhead(true); return; }   // 鳴らし続ける
    audioSuspendScheduling();
  } else {
    if(typeof setBackgroundAhead==='function') setBackgroundAhead(false);
    audioRecover();
  }
});
window.addEventListener('pageshow',()=>audioRecover());
AC.addEventListener('statechange',()=>{ if(AC.state==='interrupted'||AC.state==='suspended'){ audioSuspendScheduling(); } else if(AC.state==='running'&&!document.hidden) audioRecover(); });
document.addEventListener('pointerdown',()=>{ audioSessionUnlock(); if(_audioNeedsRecovery||AC.state!=='running') audioRecover(); },{capture:true});
document.addEventListener('keydown',()=>{ audioSessionUnlock(); },{capture:true});
// ロック画面・通知のコントロール（対応している端末だけ）：▶ / ■ を MICS の再生につなぐ
if(navigator.mediaSession){
  try{
    navigator.mediaSession.setActionHandler('play', ()=>{ if(!playing){ const b=document.getElementById('play'); if(b) b.click(); } });
    navigator.mediaSession.setActionHandler('pause', ()=>{ if(playing){ const b=document.getElementById('play'); if(b) b.click(); } });
    navigator.mediaSession.setActionHandler('stop', ()=>{ if(playing){ const b=document.getElementById('play'); if(b) b.click(); } });
  }catch(_){}
}
function mediaSessionSync(){
  if(!navigator.mediaSession) return;
  try{
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused';
    const nm=(typeof setName==='function'&&typeof setCur!=='undefined') ? setName(setCur) : 'MICS009';
    if(!navigator.mediaSession.metadata || navigator.mediaSession.metadata.title!==nm) navigator.mediaSession.metadata=new MediaMetadata({title:nm, artist:'microtone MICS009'});
  }catch(_){}
}
setInterval(mediaSessionSync, 1000);
(function(){
  const tg=document.getElementById('bgAudioToggle'); if(!tg) return;
  tg.classList.toggle('on', bgAudioOn());
  tg.addEventListener('click',()=>setBgAudio(!tg.classList.contains('on')));
})();
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
