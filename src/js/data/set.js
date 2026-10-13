// @module data/set
// @provides _setPersistT, _setSongStart, buildSetFile, decodeProject, loadSetFile, queueSong, setAddCurrent,
//    setClear, setNext, setPersist, setPrev, setRemove, setRenameSong, setRestore, setSongElapsed,
//    switchSongNow
// @uses AC, APP_VERSION, applyProject, b64ToUint8, buildProject, decodeAudio, idbOp, makeLofi, paintSet,
//    playing, queuedSong, scheduleAutosave, setCur, setSongs
// @depends -
// ---------- SET：ライブのセットリスト（曲＝.mics の中身＋復号済みの音）。DOM は触らない（表示は ui/set-view） ----------
// v0.3.141 §143。10〜12 曲の短い曲を止めずに回すための背骨。曲の切替は queueSong → スケジューラが小節頭で switchSongNow。
// 事前に全曲を復号してメモリに置く（dec）ので、切替で読み込みが走らない。
let _setSongStart=0;   // いまの曲が始まった時刻（performance.now）。経過表示用
// .mics の中身（proj）の音を復号する → dec[i]={raw,lofi}（音の無いパッドは null）
async function decodeProject(proj){
  const dec=[];
  for(let i=0;i<Math.min(proj.tracks.length,16);i++){ const pt=proj.tracks[i];
    if(pt&&pt.audio){ const wav=b64ToUint8(pt.audio); const ab=wav.buffer.slice(wav.byteOffset,wav.byteOffset+wav.byteLength);
      const raw=await decodeAudio(ab); dec[i]={raw, lofi:makeLofi(raw)}; }
    else dec[i]=null; }
  return dec;
}
// いまの曲（画面の状態）をセットの末尾に足す。音は buildProject の切り詰め後の WAV から復号し直す（保存と同じ音＝再現性）
async function setAddCurrent(name){
  const proj=buildProject(); const dec=await decodeProject(proj);
  const nm=(name||"").trim()||("SONG "+(setSongs.length+1));
  setSongs.push({name:nm, proj, dec});
  if(setCur<0) setCur=setSongs.length-1;
  setPersist();
  return setSongs.length-1;
}
function setRenameSong(k,name){ if(!setSongs[k]) return; const nm=(name||"").trim(); if(!nm) return; setSongs[k].name=nm; setPersist(); }
function setRemove(k){
  if(!setSongs[k]) return;
  setSongs.splice(k,1);
  if(queuedSong!==null){ if(queuedSong===k) queuedSong=null; else if(queuedSong>k) queuedSong--; }
  if(setCur>=setSongs.length) setCur=setSongs.length-1;
  else if(setCur>k) setCur--;
  setPersist();
}
function setClear(){ setSongs=[]; setCur=-1; queuedSong=null; setPersist(); }
// .micset（JSON）：{version:1, kind:"micset", cur, songs:[{name, proj}]}。音は各曲の proj に .mics と同じ形で入る
function buildSetFile(){ return {version:1, kind:"micset", app:APP_VERSION, cur:Math.max(0,setCur), songs:setSongs.map(s=>({name:s.name, proj:s.proj}))}; }
// 読む：全曲を復号してから入れ替える（途中で失敗したら今のセットを保つ）。止まっていれば cur の曲を即、鳴っていれば予約
async function loadSetFile(obj){
  if(!obj||obj.kind!=="micset"||!Array.isArray(obj.songs)||!obj.songs.length) throw new Error("not a .micset");
  const songs=[];
  for(const s of obj.songs){ if(!s||!s.proj||!s.proj.tracks) throw new Error("bad song"); songs.push({name:String(s.name||("SONG "+(songs.length+1))).slice(0,24), proj:s.proj, dec:await decodeProject(s.proj)}); }
  setSongs=songs; queuedSong=null;
  const k=Math.min(Math.max(0,+obj.cur||0), songs.length-1);
  setCur=-1; queueSong(k);
  setPersist();
  return songs.length;
}
// 曲を選ぶ：止まっていれば今すぐ差し替え、鳴っていれば次の小節頭で（同じ曲をもう一度＝予約取消）
function queueSong(k){
  if(!setSongs[k]) return false;
  if(playing){ queuedSong = (queuedSong===k) ? null : k; return true; }
  switchSongNow(k, AC.currentTime); return true;
}
// 差し替えの実体（スケジューラが小節頭に呼ぶ／止まっているときは queueSong から直接）。音は stopAt で止める
function switchSongNow(k, stopAt){
  const s=setSongs[k]; if(!s) return;
  setCur=k; queuedSong=null; _setSongStart=performance.now();
  applyProject(s.proj, {dec:s.dec, deferPaint:true, stopAt});   // dec があるので await なしで同期に終わる
  if(typeof scheduleAutosave==="function") scheduleAutosave();   // リロードしても「いまの曲」に戻る
}
function setNext(){ if(setCur+1<setSongs.length) return queueSong(setCur+1); return false; }
function setPrev(){ if(setCur-1>=0) return queueSong(setCur-1); return false; }
function setSongElapsed(){ return setCur<0?0:(performance.now()-_setSongStart)/1000; }
// 保存：自動保存と同じ IndexedDB に "set" で（リロードしてもセットが残る）。復号済みの音は入れず、起動時に復号し直す
let _setPersistT=0;
function setPersist(){ clearTimeout(_setPersistT); _setPersistT=setTimeout(async()=>{ try{
  if(typeof idbOp!=="function") return;
  if(!setSongs.length){ await idbOp("readwrite", st=>st.delete("set")); return; }
  await idbOp("readwrite", st=>st.put({at:Date.now(), json:JSON.stringify(buildSetFile())}, "set"));
}catch(e){ console.warn("set persist:", e); } }, 800); }
async function setRestore(){   // 起動時：セットを復号して持つだけ（いまの曲は自動保存が先に復元している＝適用しない）
  try{ if(typeof idbOp!=="function") return false;
    const rec=await idbOp("readonly", st=>st.get("set")); if(!rec||!rec.json) return false;
    const obj=JSON.parse(rec.json); if(!obj||obj.kind!=="micset"||!Array.isArray(obj.songs)) return false;
    const songs=[]; for(const s of obj.songs) songs.push({name:s.name, proj:s.proj, dec:await decodeProject(s.proj)});
    setSongs=songs; setCur=Math.min(Math.max(0,+obj.cur||0), songs.length-1); queuedSong=null;
    if(typeof paintSet==="function") paintSet();
    return true;
  }catch(e){ console.warn("set restore:", e); return false; }
}
