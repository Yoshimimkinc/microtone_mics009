// @module audio/set-players
// @provides _sideArm, _sidePatLen, _sideStep, _sideStepTime, isSetHeld, setHeldSet, setHold, setHoldClear,
//    setIsPlaying, sideCount, sidePlayers, sidePlaying, sideStop, sideStopAll, sideTakeCurrent, sideTick,
//    sideTimer, sideTrs
// @uses AC, INTERVAL, LOOKAHEAD, STEPS, TICKS_PER_16TH, barStartTime, bpmVal, driftSec, laidbackSec,
//    lockKey, playBar, playPat, playVoice, playing, scaleSemi, setCur, setSlots, staggerSec, stepIdx,
//    stopTransport, stopVoices, swingDelayTicks, swingPct, tickDur, tracks
// @depends -
// ---------- SET のミックス：いまのセット以外で鳴っているセット（＝他のセットの再生）。v0.3.147 §145 ----------
// 「SET ポン出しはトグル式で。押して再生、離して止まる、1 小節長押しでホールド。ミックスするから同時鳴らしも許可する」。
// いまのセット（PADS / SEQ の対象）は従来どおり audio/transport が鳴らす（playing / stepIdx / barStartTime …）。
// それ以外に鳴っているセットはここが鳴らす：setSlots[k].tracks（snapshot の列）をそのまま playVoice に渡す。
// 各セットは自分の時計（押した瞬間が小節頭・自分の BPM / SWING）で回る＝SP-404 のパッドと同じで、合わせるのは叩くタイミング。
// 声（activeVoices）とループの状態は snapshot の各トラックが持つ。いまのセットを切り替えるときは data/set の focusSet が引き継ぐ。
const sidePlayers=new Map();   // k → {k, t0（小節頭の時刻）, idx（次に予約するステップ）, pat, bar, bpm, swing}
const setHeldSet=new Set();    // ホールド中のセット（1 小節押し続けた／▶ で鳴らした）。離しても止まらない。もう一度叩くと止まる
let sideTimer=null;
function sideTrs(k){ return k===setCur ? tracks : (setSlots[k] ? setSlots[k].tracks : null); }
function sideCount(){ return sidePlayers.size; }
function sidePlaying(k){ return sidePlayers.has(k); }
function setIsPlaying(k){ return (k===setCur && playing) || sidePlayers.has(k); }
function setHold(k,on){ if(on) setHeldSet.add(k); else setHeldSet.delete(k); }
function isSetHeld(k){ return setHeldSet.has(k); }
function setHoldClear(){ setHeldSet.clear(); }
function _sideStepTime(p,n){
  let t=p.t0 + (n*TICKS_PER_16TH + ((n%2===1) ? swingDelayTicks(p.swing) : 0)) * tickDur(p.bpm);
  if(n%8===4) t+=laidbackSec(p.swing);
  return t;
}
function _sidePatLen(trs,pat){ let last=0;
  for(let b=0;b<4;b++){ if(trs.some(t=>{ const r=t.patterns&&t.patterns[pat]&&t.patterns[pat][b]; return r && r.some(v=>v>0); })) last=b; }
  return last+1; }
// 1 ステップ分の発音（audio/transport の scheduleStep と同じ規則。P-LOCK の記録と表示は無し＝いまのセットだけ）
function _sideStep(p,trs,n,when){
  const mu=t=>t.mutes ? !!t.mutes[p.pat] : !!t.mute, so=t=>t.solos ? !!t.solos[p.pat] : !!t.solo;   // ミュート / ソロは A B C D ごと（v0.3.149）
  const solo=trs.some(so), stg=staggerSec(p.swing); let c=0;
  for(let i=0;i<trs.length;i++){
    const t=trs[i]; if(!t.activeVoices) t.activeVoices=[];
    const aud=!mu(t) && (!solo || so(t));
    if(t.loop && t.loopPlaying && !aud){ stopVoices(t,when); t.loopPlaying=false; }
    const row=t.patterns && t.patterns[p.pat] && t.patterns[p.pat][p.bar]; const v=row ? row[n] : 0;
    if(!(v>0 && aud)) continue;
    const lk=t.locks && t.locks[lockKey(p.pat,p.bar,n)];
    const nudge=(lk && typeof lk.nudge==="number") ? lk.nudge/1000 : 0;
    const wn=Math.max(when + c*stg + nudge, AC.currentTime);
    const mel=!!(t.scale && t.scale!=="off");
    if(t.loop){
      if(t.loopPlaying){ stopVoices(t,when); t.loopPlaying=false; }
      else { playVoice(i, wn, false, true, mel?scaleSemi(t.scale,v-1):0, lk, trs); t.loopPlaying=true; c++; }
    } else { playVoice(i, wn, !mel && v===2, true, mel?scaleSemi(t.scale,v-1):0, lk, trs); c++; }
  }
}
function sideTick(){
  if(!sidePlayers.size){ clearInterval(sideTimer); sideTimer=null; return; }
  const now=AC.currentTime;
  sidePlayers.forEach(p=>{
    if(p.k===setCur) return;   // いまのセットは audio/transport が鳴らす（引き継ぎの瞬間だけここに居る）
    const trs=sideTrs(p.k); if(!trs) return;
    const behind=now-_sideStepTime(p,p.idx); if(behind>0.12) p.t0+=behind;   // メインスレッドが詰まったら取り戻す（transport と同じ）
    let guard=0;
    while(_sideStepTime(p,p.idx) < now+LOOKAHEAD){
      _sideStep(p, trs, p.idx, _sideStepTime(p,p.idx)+driftSec(p.swing));
      p.idx++;
      if(p.idx>=STEPS){ p.idx=0; p.t0+=STEPS*TICKS_PER_16TH*tickDur(p.bpm); p.bar++; if(p.bar>=_sidePatLen(trs,p.pat)) p.bar=0; }
      if(++guard>STEPS) break;
    }
  });
}
function _sideArm(){ if(!sideTimer) sideTimer=setInterval(sideTick, INTERVAL); }
// いまのセットの再生を「他のセットの再生」へ引き継ぐ（音は切らない・位置もそのまま）。このあと data/set の focusSet で別のセットへ
function sideTakeCurrent(){
  if(!playing) return false;
  sidePlayers.set(setCur, {k:setCur, t0:barStartTime, idx:stepIdx, pat:playPat, bar:playBar, bpm:bpmVal, swing:swingPct});
  stopTransport(true);
  _sideArm();
  return true;
}
// 他のセットを止める（声も切る）
function sideStop(k, when){
  if(!sidePlayers.has(k)) return;
  sidePlayers.delete(k);
  const trs=sideTrs(k); if(trs) trs.forEach(t=>{ stopVoices(t, when||AC.currentTime); t.loopPlaying=false; });
}
function sideStopAll(when){ Array.from(sidePlayers.keys()).forEach(k=>sideStop(k, when)); }
