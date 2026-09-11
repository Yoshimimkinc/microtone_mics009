// ===== 自動保存：更新やリロードで「読み込んだ音」が消えないようにする =====
// localStorage は数MBで足りない（WAVを積むと数十MB）ので IndexedDB に丸ごと1件だけ置く。
const AUTOSAVE={db:"mics009",store:"session",key:"autosave"};
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
    return (proj&&proj.tracks)?proj:null;
  }catch(e){ console.warn("autosave load:",e); return null; }
}
async function clearAutosave(){ try{ await idbOp("readwrite", st=>st.delete(AUTOSAVE.key)); }catch(e){} }

loadPresets().then(async ()=>{
  // 既定プロジェクト＝同梱の default.mics（ユーザーのビート：フレーズ＋ドラム＋パターン）。
  // ドラム9-16はsynthプリセットなので音声は同梱せず起動時に再生成（軽量化）。フレーズ1-4のみ音声同梱。
  const saved=await loadAutosave();
  if(saved){
    try{
      await applyProject(saved);
      drawAllPadWaves();
      if(typeof sampNameEl!=="undefined"&&sampNameEl) sampNameEl.textContent="前回の続きを復元（メニューの RESET で初期状態へ）";
      return;   // 復元できたら default.mics は読まない
    }catch(e){ console.warn("autosave復元に失敗→既定へ:",e); }
  }
  try{
    const r=await fetch("default.mics?v="+APP_VERSION,{cache:"force-cache"});
    if(!r.ok) throw new Error("HTTP "+r.status);
    const proj=await r.json();
    if(!proj.version||!proj.tracks) throw new Error("invalid default.mics");
    await applyProject(proj);
  }catch(e){
    console.warn("default.mics 読込失敗→合成デフォルトにフォールバック:", e);
    try{ await applyProject(DEFAULT_PROJECT); await bakePhrase(); }catch(_){}
  }
  drawAllPadWaves();
});

