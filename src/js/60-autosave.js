// @module autosave
// @provides AS_MIN_GAP, AUTOSAVE, _asBusy, _asDirty, _asLast, _asSoonT, _asWarmQ, _asWarned, autosaveDbName,
//    autosaveNow, clearAutosave, idb, idbOp, loadAutosave, previewName, scheduleAutosave, warmWavCache
// @uses APP_VERSION, DEFAULT_PROJECT, PADS, applyProject, bakePhrase, buildProject, drawAllPadWaves,
//    hintsOn, loadPresets, playing, prerollAudio, sampNameEl, setCur, setSlots, sideCount, trackData, tracks
// @depends presets
// ===== 自動保存：更新やリロードで「読み込んだ音」が消えないようにする =====
// localStorage は数MBで足りない（WAVを積むと数十MB）ので IndexedDB に丸ごと1件だけ置く。
// 本番と同じ origin にプレビュー（/preview/<枝名>/）が並ぶ＝IndexedDB も共用になる。
// そのままだとプレビューで触った内容が本番のセッションを上書きする（RESET も本番に効いてしまう）。
// 保存先を枝ごとに分けて、プレビューを「触っても本番が汚れない砂場」にする（v0.3.118）。
// 合言葉（localStorage）は共用のままでよい＝プレビューで入り直さずに済む。
function previewName(p){ const m=String(p==null?location.pathname:p).match(/\/preview\/([^/]+)\//); return m?m[1]:null; }
function autosaveDbName(p){ const n=previewName(p); return n?("mics009-preview-"+n):"mics009"; }
const AUTOSAVE={db:autosaveDbName(),store:"session",key:"autosave"};
function idb(){ return new Promise((res,rej)=>{ const q=indexedDB.open(AUTOSAVE.db,1);
  q.onupgradeneeded=()=>{ const d=q.result; if(!d.objectStoreNames.contains(AUTOSAVE.store)) d.createObjectStore(AUTOSAVE.store); };
  q.onsuccess=()=>res(q.result); q.onerror=()=>rej(q.error); }); }
function idbOp(mode,fn){ return idb().then(d=>new Promise((res,rej)=>{
  const tx=d.transaction(AUTOSAVE.store,mode), st=tx.objectStore(AUTOSAVE.store);
  const r=fn(st); tx.oncomplete=()=>res(r&&r.result); tx.onerror=()=>rej(tx.error); })); }
// 保存は全パッドのWAVエンコード＝重い。演奏中には絶対に走らせない（音が飛ぶ）。
// 「変更あり」の印だけ立てて、止まっていて・間隔が空いていて・暇なときにまとめて書く。
let _asDirty=false, _asBusy=false, _asWarned=false, _asLast=0;
const AS_MIN_GAP=15000;   // 最短15秒に1回
async function autosaveNow(force){
  if(_asBusy || typeof buildProject!=="function") return;
  if(!force){
    if(!_asDirty) return;
    if(Date.now()-_asLast < AS_MIN_GAP) return;
    // 演奏中も書く：WAVエンコードはキャッシュ済み（wavB64Cached）なので、走るのは設定のJSON化だけ。
    // v0.3.94〜0.3.97は演奏中に一切書かなかったため「演奏しながら編集→閉じる」で全部消えていた
  }
  _asBusy=true; _asDirty=false; _asLast=Date.now();
  if(typeof prerollAudio==="function") prerollAudio(0.4);   // 書き出しの間（JSON 化・保存）に音が遅れないよう、先に予約しておく（v0.3.226 §216）
  try{
    const json=JSON.stringify(buildProject());
    await idbOp("readwrite", st=>st.put({at:Date.now(), ver:APP_VERSION, json}, AUTOSAVE.key));
  }catch(e){
    _asDirty=true;   // 失敗したら次の機会に再挑戦
    if(!_asWarned){ _asWarned=true; console.warn("autosave:",e);
      if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent="自動保存できず（容量不足かも）— Saveで書き出しを"; }
  }finally{ _asBusy=false; }
}
let _asSoonT=null;
function scheduleAutosave(){ _asDirty=true;
  clearTimeout(_asSoonT); _asSoonT=setTimeout(()=>autosaveNow(true), 5000);   // 変更から5秒で必ず一度書く（閉じられても残る）
}
setInterval(()=>{ const run=()=>autosaveNow(false);
  if(window.requestIdleCallback) requestIdleCallback(run,{timeout:2000}); else run(); }, 5000);
// 離脱時は条件を無視して書く。pagehide は非同期IDBの完了を待ってくれないので、
// 「隠れた瞬間」（visibilitychange=hidden：タブ切替・アプリ切替・閉じる直前）で先に書き始める。
// さらに変更から5秒以内に必ず一度書く（AS_MIN_GAP より短い猶予）＝閉じられても直近が残る。
document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="hidden" && _asDirty) autosaveNow(true); });
window.addEventListener("pagehide",()=>{ if(_asDirty) autosaveNow(true); });
window.addEventListener("beforeunload",()=>{ if(_asDirty) autosaveNow(true); });
async function loadAutosave(){
  try{ const rec=await idbOp("readonly", st=>st.get(AUTOSAVE.key));
    if(!rec||!rec.json) return null;
    const proj=JSON.parse(rec.json);
    return (proj&&(proj.tracks||Array.isArray(proj.sets)))?proj:null;   // v2（tracks）／v3（sets）どちらも
  }catch(e){ console.warn("autosave load:",e); return null; }
}
async function clearAutosave(){ try{ await idbOp("readwrite", st=>st.delete(AUTOSAVE.key)); }catch(e){} }

// 保存用の WAV を、止まっていて暇なときに 1 音ずつ先に作っておく（v0.3.226 §216）。起動後の最初の自動保存が全部の音を変換して、
// 再生中なら 0.2〜0.5 秒止まっていた（遅い端末では 2 秒以上）。作ったものは音（AudioBuffer）に覚える＝wavB64Cached がそのまま使う。
// 鳴っている間は作らない（次の暇を待つ）
let _asWarmQ=null;
function warmWavCache(){
  if(typeof trackData!=="function") return;
  const jobs=[];
  tracks.forEach((t,i)=>jobs.push(()=>trackData(t,i,PADS[i].type,PADS[i].voice)));
  for(let k=0;k<16;k++){ if(k===setCur||!setSlots[k]) continue; setSlots[k].tracks.forEach((t,i)=>jobs.push(()=>trackData(t,i,t.type,t.voice))); }
  _asWarmQ=jobs;
  const busy=()=>playing || (typeof sideCount==="function" && sideCount()>0);
  const later=()=>{ if(window.requestIdleCallback) requestIdleCallback(step,{timeout:3000}); else setTimeout(()=>step(null),250); };
  const step=(dl)=>{
    while(_asWarmQ && _asWarmQ.length && !busy()){
      const j=_asWarmQ.shift(); try{ j(); }catch(_){}
      if(!dl || !dl.timeRemaining || dl.timeRemaining()<10) break;   // 1 回の暇に入るぶんだけ
    }
    if(_asWarmQ && _asWarmQ.length) later(); else _asWarmQ=null;
  };
  later();
}
loadPresets().then(async ()=>{
  // 既定プロジェクト＝同梱の default.mics（ユーザーのビート：フレーズ＋ドラム＋パターン）。
  // ドラム9-16はsynthプリセットなので音声は同梱せず起動時に再生成（軽量化）。フレーズ1-4のみ音声同梱。
  const saved=await loadAutosave();
  if(saved){
    try{
      await applyProject(saved);
      drawAllPadWaves(); warmWavCache();
      if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent=(typeof hintsOn!=="function"||hintsOn())?"前回の続きを復元（メニューの RESET で初期状態へ）":"前回の続きを復元";
      return;   // 復元できたら default.mics は読まない
    }catch(e){ console.warn("autosave復元に失敗→既定へ:",e); }
  }
  try{
    const r=await fetch("default.mics?v="+APP_VERSION,{cache:"force-cache"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const proj=await r.json();
    if(!proj.version||!(proj.tracks||Array.isArray(proj.sets))) throw new Error("invalid default.mics");
    await applyProject(proj);
  }catch(e){
    console.warn("default.mics 読込失敗→合成デフォルトにフォールバック:", e);
    try{ await applyProject(DEFAULT_PROJECT); await bakePhrase(); }catch(_){}
  }
  drawAllPadWaves(); warmWavCache();
});

