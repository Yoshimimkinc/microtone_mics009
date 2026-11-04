// @module ui/pad-kind
// @provides _keyLeaveDone, _keyLeaveResolve, _sampleState, keyLeaveChoice, openPadContent, padKind,
//    padKindGo, setPadKind, syncPadContentEditor
// @uses AC, PADS, _keyBuffers, bpmVal, keyEditorOpen, normalizeKeyPhrase, openPadEdit, paintClKind,
//    paintPerf, peTarget, prepareKeyTrack, pushUndo, refreshPadDisplay, sampNameEl, scheduleAutosave,
//    scratchOpen, stopVoices, tracks
// @depends -
// パッドの種類（SAMPLE / KEY / SCRATCH）を切り替える所（v0.3.217 §206 で ui/pad-content から分けた）。
// 種類の切替（setPadKind）・種類に合った画面を開く（openPadContent / padKindGo）・KEY から移る時に聞く（keyLeaveChoice）・EDIT の種類ボタンの表示（syncPadContentEditor）。
// ピアノロールは ui/key-roll、鍵盤・REC・STEP・ループ・MORE は ui/key-entry、スクラッチは ui/scratch-view。
// SAMPLE / KEY / SCRATCH（保存の値）。起動中（このファイルより前の部品の読み込み時）にも呼ばれるので、並びは定数にせず関数の中に書く
function padKind(t){ return ['SPL','KEY','SCR'].includes(t.padKind)?t.padKind:'SPL'; }
function _sampleState(t,i){ return {buffer:t.buffer,rawBuffer:t.rawBuffer,start:t.start,end:t.end,loop:t.loop,loopStart:t.loopStart,type:PADS[i].type,voice:PADS[i].voice}; }
// leave（KEY から移る時だけ）：'restore'＝元のサンプルに戻す（既定）／'bake'＝この KEY の音をそのパッドの波形にする（v0.3.206 §195）
async function setPadKind(i,kind,leave='restore'){
  if(!['SPL','KEY','SCR'].includes(kind))return;
  const t=tracks[i];if(padKind(t)===kind)return;
  let baked=null;
  if(padKind(t)==='KEY'&&kind!=='KEY'&&leave==='bake'){
    const epoch=t._contentEpoch||0;sampNameEl.textContent='KEY を波形にしています…';
    const b=(await prepareKeyTrack(t,bpmVal))||(_keyBuffers.has(t.buffer)?t.buffer:null);
    if((t._contentEpoch||0)!==epoch||padKind(t)!=='KEY')return;
    // KEY の音の入れ物とは別の波形にする（KEY の印が付いたままだと SAMPLE として鳴らせない）
    if(b){baked=AC.createBuffer(1,b.length,b.sampleRate);baked.getChannelData(0).set(b.getChannelData(0));baked._range=[t.start,t.end];}   // START / END も持っていく（v0.3.212）
  }
  pushUndo();stopVoices(t,AC.currentTime);t.loopPlaying=false;t._contentEpoch=(t._contentEpoch||0)+1;
  if(kind==='KEY'&&padKind(t)!=='KEY')t.sampleState=_sampleState(t,i);
  if(padKind(t)==='KEY'&&kind!=='KEY'&&t.sampleState){Object.assign(t,t.sampleState);PADS[i].type=t.sampleState.type;PADS[i].voice=t.sampleState.voice;}
  if(baked){Object.assign(t,{buffer:baked,rawBuffer:baked,start:baked._range[0],end:baked._range[1],loop:false,loopStart:0});PADS[i].type='sample';PADS[i].voice=null;}
  t._keySignature=null; // Restoring SPL replaces buffer: never retain a KEY readiness stamp.
  t.padKind=kind;
  if(kind==='KEY'){
    t.keyPhrase=normalizeKeyPhrase(t.keyPhrase);PADS[i].type='sample';PADS[i].voice=null;
    const epoch=t._contentEpoch;sampNameEl.textContent='KEYを生成中…';const ready=await prepareKeyTrack(t,bpmVal);
    if(t._contentEpoch!==epoch||t.padKind!=='KEY')return;
    if(ready)sampNameEl.textContent=t.keyPhrase.notes.length?'KEY · フレーズを演奏できます':'KEY · 鍵盤で弾いて入れるか、ロールをタップして置いてください';
  }else sampNameEl.textContent=baked?(kind==='SCR'?'SCRATCH':'SAMPLE')+' · KEY のフレーズを波形にしました（KEY に戻せば打ち込みはそのまま）':kind==='SCR'?'SCRATCH · 窓の SCRATCH か EDIT＋パッドでスクラッチ画面':'SAMPLE · サンプルを再生';
  refreshPadDisplay(i);syncPadContentEditor(i);paintPerf();scheduleAutosave();
}
// 種類に合った画面を開く（v0.3.203 §192）：KEY＝ピアノロール・SCRATCH＝スクラッチ・SAMPLE＝EDIT（波形・TRIM・CHOP）。EDIT＋パッドのタップもここ
function openPadContent(i){
  const k=padKind(tracks[i]);
  if(k==='KEY')keyEditorOpen(i);
  else if(k==='SCR')scratchOpen(i).catch(e=>{sampNameEl.textContent=e.message;});
  else openPadEdit(i);
}
// 窓の種類ボタン：その種類にして、すぐその画面へ（同じ種類ならそのまま開く）。SAMPLE は窓の波形のまま（開かない）
// KEY（音が入っている）から SAMPLE / SCRATCH へ移る時は聞く：この KEY を波形にする／元のサンプルに戻す／やめる（v0.3.206 §195）
let _keyLeaveResolve=null;
function keyLeaveChoice(i,kind){
  const t=tracks[i];
  if(padKind(t)!=='KEY'||kind==='KEY'||!normalizeKeyPhrase(t.keyPhrase).notes.length)return Promise.resolve('restore');
  if(_keyLeaveResolve)_keyLeaveResolve(null);
  document.getElementById('keyLeaveTo').textContent=kind==='SCR'?'SCRATCH':'SAMPLE';
  document.getElementById('keyLeaveRestore').textContent=t.sampleState?.buffer?'元のサンプルに戻す':'元に戻す（空のパッド）';
  document.getElementById('keyLeaveAsk').hidden=false;
  return new Promise(resolve=>{_keyLeaveResolve=resolve;});
}
function _keyLeaveDone(v){const r=_keyLeaveResolve;_keyLeaveResolve=null;document.getElementById('keyLeaveAsk').hidden=true;if(r)r(v||null);}
async function padKindGo(i,kind){
  if(padKind(tracks[i])!==kind){const leave=await keyLeaveChoice(i,kind);if(!leave)return;await setPadKind(i,kind,leave);}
  if(padKind(tracks[i])!==kind)return;
  if(kind==='KEY')keyEditorOpen(i);
  else if(kind==='SCR')await scratchOpen(i);
  if(typeof paintClKind==='function')paintClKind();   // 単体テスト（vm）には窓が無い
}
function syncPadContentEditor(i){
  const kind=padKind(tracks[i]);
  document.getElementById('padEditModal').dataset.padKind=kind;
  document.querySelectorAll('#peKinds button').forEach(b=>b.classList.toggle('on',b.dataset.kind===kind));
  document.querySelectorAll('#pads .pad').forEach((el,j)=>el.dataset.kind=padKind(tracks[j]));
  if(typeof paintClKind==='function')paintClKind();   // 単体テスト（vm）には窓が無い
}
(function(){
  // v0.3.215 §204「KEY と PIANO ROLL のボタンは一緒では」：KEY を押す＝KEY にしてそのままピアノロールを開く（窓の種類ボタンと同じ padKindGo）。PIANO ROLL ボタンは撤去
  document.getElementById('peKinds').addEventListener('click',e=>{const b=e.target.closest('[data-kind]');if(!b)return;const i=peTarget,kind=b.dataset.kind;if(kind==='KEY'){padKindGo(i,'KEY').catch(e=>sampNameEl.textContent=e.message);return;}keyLeaveChoice(i,kind).then(leave=>leave&&setPadKind(i,kind,leave)).catch(e=>sampNameEl.textContent=e.message);});
  document.getElementById('keyLeaveAsk').addEventListener('click',e=>{const b=e.target.closest('[data-leave]');if(b)_keyLeaveDone(b.dataset.leave);else if(e.target===e.currentTarget)_keyLeaveDone(null);});
})();
