// @module audio/set-players
// @provides SET_LV_MAX, SET_LV_MIN, _lvlSrc, _sideArm, _sidePatLen, _sideStep, _sideStepTime, fmtSetLevel,
//    isSetHeld, setHeldSet, setHold, setHoldClear, setIndexOfTrs, setIsPlaying, setLevelLin, setLevelNode,
//    setSetLevel, sideCount, sidePlayers, sidePlaying, sideStop, sideStopAll, sideTakeCurrent, sideTick,
//    sideTimer, sideTrs
// @uses AC, INTERVAL, LOOKAHEAD, STEPS, TICKS_PER_16TH, anySolo, barStartTime, bpmVal, dbToGain, driftSec,
//    laidbackSec, lockKey, patRead, playBar, playPat, playVoice, playing, scaleSemi, setCur, setLevels,
//    setSlots, staggerSec, stepIdx, stopTransport, stopVoices, swingDelayTicks, swingPct, tickDur, tracks
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
  if(p.applied!==p.pat){ trs.forEach(t=>patRead(t,p.pat)); p.applied=p.pat; }   // 鳴らすパターンのミュート / ソロ / エフェクトを snapshot の live へ（A B C D ごと v0.3.149 / v0.3.150）
  const solo=anySolo(trs), stg=staggerSec(p.swing); let c=0;
  for(let i=0;i<trs.length;i++){
    const t=trs[i]; if(!t.activeVoices) t.activeVoices=[];
    const aud=!t.mute && (!solo || t.solo);
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
// ---------- セットのミックス音量（v0.3.151）：「押しながら上下スワイプで音量の上げ下げ」 ----------
// セットごとに ConstantSource を 1 つ持ち、そのセットの声の音量ゲイン（playVoice の vg）の gain に繋ぐ＝鳴っている音にも送り（DELAY / REVERB）にも即効く。
// ConstantSource が無いブラウザは発音時の値だけ（鳴っている音には次の発音から）。-40 dB で無音
const SET_LV_MIN=-40, SET_LV_MAX=6;
const _lvlSrc=new Array(16).fill(null);
function setLevelLin(k){ const db=setLevels[k]||0; return db<=SET_LV_MIN ? 0 : dbToGain(db); }
function setLevelNode(k){
  if(!(k>=0&&k<16) || typeof AC.createConstantSource!=="function") return null;
  if(!_lvlSrc[k]){ const c=AC.createConstantSource(); c.offset.value=setLevelLin(k); c.start(); _lvlSrc[k]=c; }
  return _lvlSrc[k];
}
function setSetLevel(k, db){
  if(!(k>=0&&k<16)) return;
  db=Math.max(SET_LV_MIN, Math.min(SET_LV_MAX, Math.round((+db||0)*2)/2));   // 0.5 dB 刻み
  setLevels[k]=db;
  const c=_lvlSrc[k]; if(c) c.offset.setTargetAtTime(setLevelLin(k), AC.currentTime, 0.012);   // ジッパーノイズを出さない程度に滑らかに
}
function fmtSetLevel(db){ return db<=SET_LV_MIN ? "-∞" : ((db>0?"+":"")+db.toFixed(1)); }
// トラック列 → どのセットのものか（いまのセット＝tracks、他は setSlots[k].tracks）
function setIndexOfTrs(trs){ if(trs===tracks) return setCur; for(let k=0;k<16;k++) if(setSlots[k] && setSlots[k].tracks===trs) return k; return setCur; }

