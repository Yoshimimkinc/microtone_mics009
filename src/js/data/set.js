// @module data/set
// @provides _setPersistT, _setStart, buildSetFile, decodeProject, loadSetFile, queueSet, setClear, setCount,
//    setElapsed, setNext, setNextSlot, setPersist, setPrev, setRemove, setRename, setRestore, setRevert,
//    setStore, switchSetNow
// @uses AC, APP_VERSION, applyProject, b64ToUint8, buildProject, decodeAudio, idbOp, makeLofi, paintSet,
//    playing, queuedSet, scheduleAutosave, setCur, setSlots
// @depends -
// ---------- SET：16 の枠に「16 パッドの状態（.mics の中身＋復号済みの音）」を入れ、叩いて切り替える。DOM は触らない ----------
// v0.3.143 §144。枠の中のシーケンスは A B C D（いままでどおり）。切替は queueSet → スケジューラが小節頭で switchSetNow。
// 約束：枠を選んで鳴らしている間に PADS / SEQ でつけた変化は一時。■ で止めると枠の状態に戻る（setRevert）。残すなら枠に上書き（setStore）。
let _setStart=0;   // いまの枠が始まった時刻（performance.now）。経過表示用
// .mics の中身（proj）の音を復号する → dec[i]={raw,lofi}（音の無いパッドは null）
async function decodeProject(proj){
  const dec=[];
  for(let i=0;i<Math.min(proj.tracks.length,16);i++){ const pt=proj.tracks[i];
    if(pt&&pt.audio){ const wav=b64ToUint8(pt.audio); const ab=wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength);
      const raw=await decodeAudio(ab); dec[i]={raw, lofi:makeLofi(raw)}; }
    else dec[i]=null; }
  return dec;
}
function setCount(){ return setSlots.filter(Boolean).length; }
// いまの 16 パッドの状態を枠 k に入れる（上書きも同じ）。音は buildProject の切り詰め後の WAV から復号し直す（保存と同じ音＝再現性）
async function setStore(k, name){
  if(k<0||k>15) return false;
  const proj=buildProject(); const dec=await decodeProject(proj);
  const nm=(name||(setSlots[k]&&setSlots[k].name)||"").trim()||("SET "+(k+1));
  setSlots[k]={name:nm, proj, dec};
  if(setCur<0 || setCur===k){ setCur=k; _setStart=performance.now(); }
  setPersist();
  return true;
}
function setRename(k,name){ if(!setSlots[k]) return; const nm=(name||"").trim(); if(!nm) return; setSlots[k].name=nm.slice(0,24); setPersist(); }
function setRemove(k){
  if(!setSlots[k]) return;
  setSlots[k]=null;
  if(queuedSet===k) queuedSet=null;
  if(setCur===k) setCur=-1;
  setPersist();
}
function setClear(){ setSlots=new Array(16).fill(null); setCur=-1; queuedSet=null; setPersist(); }
// .micset（JSON）：{kind:"micset", version:2, cur, slots:[null|{name,proj}]×16}。v1（songs の並び）も読める
function buildSetFile(){ return {version:2, kind:"micset", app:APP_VERSION, cur:setCur, slots:setSlots.map(s=>s?{name:s.name, proj:s.proj}:null)}; }
async function loadSetFile(obj){
  if(!obj||obj.kind!=="micset") throw new Error("not a .micset");
  const src=Array.isArray(obj.slots)?obj.slots.slice(0,16):(Array.isArray(obj.songs)?obj.songs.slice(0,16):null);
  if(!src||!src.some(Boolean)) throw new Error("empty .micset");
  const slots=new Array(16).fill(null);
  for(let k=0;k<src.length;k++){ const s=src[k]; if(!s) continue; if(!s.proj||!s.proj.tracks) throw new Error("bad slot "+k);
    slots[k]={name:String(s.name||("SET "+(k+1))).slice(0,24), proj:s.proj, dec:await decodeProject(s.proj)}; }
  setSlots=slots; queuedSet=null;
  let k=+obj.cur; if(!(k>=0&&k<16&&slots[k])) k=slots.findIndex(Boolean);
  setCur=-1; queueSet(k);
  setPersist();
  return slots.filter(Boolean).length;
}
// 枠を叩く：止まっていれば今すぐ差し替え、鳴っていれば次の小節頭で（同じ枠をもう一度＝予約取消）。NOW の枠を叩いても何もしない
function queueSet(k){
  if(!setSlots[k]) return false;
  if(playing){ if(k===setCur&&queuedSet===null) return false; queuedSet = (queuedSet===k) ? null : k; return true; }
  if(k===setCur) return false;
  switchSetNow(k, AC.currentTime); return true;
}
// 差し替えの実体（スケジューラが小節頭に呼ぶ／止まっているときは queueSet から直接）。音は stopAt で止める
function switchSetNow(k, stopAt){
  const s=setSlots[k]; if(!s) return;
  setCur=k; queuedSet=null; _setStart=performance.now();
  applyProject(s.proj, {dec:s.dec, deferPaint:true, stopAt});   // dec があるので await なしで同期に終わる
  if(typeof scheduleAutosave==="function") scheduleAutosave();   // リロードしても「いまの枠」に戻る
}
// ■ で止めたとき：枠の保存状態に戻す（演奏中の変化は一時）。戻したら true
function setRevert(){
  const s=setCur>=0?setSlots[setCur]:null; if(!s) return false;
  applyProject(s.proj, {dec:s.dec, keepSel:true});
  return true;
}
function setNextSlot(k,dir){ for(let i=1;i<16;i++){ const j=k+dir*i; if(j<0||j>15) return -1; if(setSlots[j]) return j; } return -1; }
function setNext(){ const j=setNextSlot(setCur<0?-1:setCur, +1); return j>=0 ? queueSet(j) : false; }
function setPrev(){ const j=setNextSlot(setCur<0?16:setCur, -1); return j>=0 ? queueSet(j) : false; }
function setElapsed(){ return setCur<0?0:(performance.now()-_setStart)/1000; }
// 保存：自動保存と同じ IndexedDB に "set" で（リロードしても枠が残る）。復号済みの音は入れず、起動時に復号し直す
let _setPersistT=0;
function setPersist(){ clearTimeout(_setPersistT); _setPersistT=setTimeout(async()=>{ try{
  if(typeof idbOp!=="function") return;
  if(!setCount()){ await idbOp("readwrite", st=>st.delete("set")); return; }
  await idbOp("readwrite", st=>st.put({at:Date.now(), json:JSON.stringify(buildSetFile())}, "set"));
}catch(e){ console.warn("set persist:", e); } }, 800); }
async function setRestore(){   // 起動時：枠を復号して持つだけ（いまの 16 パッドは自動保存が先に復元している＝適用しない）
  try{ if(typeof idbOp!=="function") return false;
    const rec=await idbOp("readonly", st=>st.get("set")); if(!rec||!rec.json) return false;
    const obj=JSON.parse(rec.json); if(!obj||obj.kind!=="micset") return false;
    const src=Array.isArray(obj.slots)?obj.slots.slice(0,16):(Array.isArray(obj.songs)?obj.songs.slice(0,16):[]);
    const slots=new Array(16).fill(null);
    for(let k=0;k<src.length;k++){ const s=src[k]; if(s&&s.proj&&s.proj.tracks) slots[k]={name:s.name, proj:s.proj, dec:await decodeProject(s.proj)}; }
    setSlots=slots; queuedSet=null;
    const k=+obj.cur; setCur=(k>=0&&k<16&&slots[k])?k:-1; _setStart=performance.now();
    if(typeof paintSet==="function") paintSet();
    return true;
  }catch(e){ console.warn("set restore:", e); return false; }
}
