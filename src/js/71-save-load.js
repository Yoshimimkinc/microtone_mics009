// @module save-load
// @provides SAVE_SCOPE_KEY, b64ToUint8, bufToWav, buildProject, buildSaveFile, calcCrop, curSetData,
//    saveScope, setData, trackData, uint8ToB64, wavB64Cached
// @uses APP_VERSION, PADS, PRESET_BUFS, _asDirty, bpmVal, clearAutosave, compDrive, compOn, compThreshold,
//    editPat, fxDelayAmt, fxDelayOn, fxReverbAmt, fxReverbOn, groupVol, patSync, sampNameEl, seqDataOf,
//    setCur, setLevels, setSlots, shareOrDownload, swingPct, tracks
// @depends -
// ===== SAVE / LOAD =====
// AudioBuffer → WAV (Uint8Array)
function bufToWav(buf, fromSamp, toSamp){
  const ch=1, sr=buf.sampleRate, fullData=buf.getChannelData(0);
  const from=fromSamp||0, to=toSamp||fullData.length;
  const len=to-from;
  const bps=16, byteRate=sr*ch*bps/8, blockAlign=ch*bps/8;
  const dataLen=len*blockAlign;
  const ab=new ArrayBuffer(44+dataLen);
  const dv=new DataView(ab);
  const ws=(o,s)=>{for(let i=0;i<s.length;i++)dv.setUint8(o+i,s.charCodeAt(i));};
  ws(0,"RIFF"); dv.setUint32(4,36+dataLen,true); ws(8,"WAVE");
  ws(12,"fmt "); dv.setUint32(16,16,true); dv.setUint16(20,1,true);
  dv.setUint16(22,ch,true); dv.setUint32(24,sr,true);
  dv.setUint32(28,byteRate,true); dv.setUint16(32,blockAlign,true); dv.setUint16(34,bps,true);
  ws(36,"data"); dv.setUint32(40,dataLen,true);
  let o=44;
  for(let i=from;i<to;i++){
    let s=Math.max(-1,Math.min(1,fullData[i]));
    dv.setInt16(o,s<0?s*0x8000:s*0x7FFF,true); o+=2;
  }
  return new Uint8Array(ab);
}
// クロップ情報を計算：start-1s〜end+1sの範囲、設定値を再計算
function calcCrop(t){
  if(!t.buffer) return null;
  const sr=t.buffer.sampleRate, N=t.buffer.length, dur=t.buffer.duration;
  const pad=sr;  // 前後1秒
  const fromSamp=Math.max(0, Math.round(t.start*N) - pad);
  const toSamp=Math.min(N, Math.round(t.end*N) + pad);
  const cropLen=toSamp-fromSamp;
  // 設定値をクロップ後の範囲に再計算（正規化0..1）
  const newStart=Math.max(0, (t.start*N - fromSamp)/cropLen);
  const newEnd=Math.min(1, (t.end*N - fromSamp)/cropLen);
  const newLoopStart=Math.max(0, Math.min(newEnd, (t.loopStart*N - fromSamp)/cropLen));
  return {fromSamp, toSamp, start:newStart, end:newEnd, loopStart:newLoopStart};
}
function uint8ToB64(u8){
  let bin=""; for(let i=0;i<u8.length;i++)bin+=String.fromCharCode(u8[i]);
  return btoa(bin);
}
function b64ToUint8(b64){
  const bin=atob(b64); const u8=new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); return u8;
}

// SAVE
// WAV→base64 はバッファが同じで切り出し範囲も同じなら使い回す（重いのはここ）。
// これで buildProject() が「設定のJSON化＋文字列の連結」だけになり、演奏中に走っても音が飛ばない。
function wavB64Cached(t, crop){
  const c=t._wavCache;
  if(c && c.buf===t.buffer && c.from===crop.fromSamp && c.to===crop.toSamp) return c.b64;
  const b64=uint8ToB64(bufToWav(t.buffer, crop.fromSamp, crop.toSamp));
  t._wavCache={buf:t.buffer, from:crop.fromSamp, to:crop.toSamp, b64};
  return b64;
}
// 1 トラックを .mics の形に（t は live の tracks[i] でも、セットの snapshot の 1 要素でもよい）
// 音：触っていないプリセット（buffer がプリセットそのもの）は同梱しない＝起動時に再生成（ファイルが 16 セット分で膨れない）
function trackData(t,i,type,voice){
  const preset=(typeof PRESET_BUFS!=="undefined")&&PRESET_BUFS[i];
  const isPreset = type==="synth" && preset && t.buffer===preset.buf;
  const crop = (t.buffer && !isPreset) ? calcCrop(t) : null;
  return {
    name:t.name,
    type:type,
    voice:voice||null,
    vol:t.vol, tune:t.tune, scale:t.scale,
    start: crop?crop.start:t.start,
    end: crop?crop.end:t.end,
    loop:t.loop,
    loopStart: crop?crop.loopStart:t.loopStart,
    filter:t.filter, cutoff:t.cutoff, reso:t.reso,
    choke:t.choke, mute:t.mute, solo:t.solo,
    mutes:(t.mutes||[t.mute,t.mute,t.mute,t.mute]).map(Boolean), solos:(t.solos||[t.solo,t.solo,t.solo,t.solo]).map(Boolean),   // A B C D ごと（v0.3.149）
    patFx:Array.isArray(t.patFx)&&t.patFx.length===4 ? t.patFx.map(o=>({delaySend:o.delaySend||0, reverbSend:o.reverbSend||0, filter:o.filter||"off", cutoff:o.cutoff??12000, reso:o.reso??0.7})) : null,   // エフェクトも A B C D ごと（v0.3.150）
    attack:t.attack||0, fade:t.fade??3, delaySend:t.delaySend||0, reverbSend:t.reverbSend||0, outBus:t.outBus||"A", midiNote:t.midiNote??null, key:t.key??null,
    patterns:t.patterns,
    locks:t.locks||{},
    audio: crop ? wavB64Cached(t, crop) : null,
  };
}
// セット 1 つを .mics の形に（s は snapshotSet の形）
function setData(s){ return {name:s.name, bpm:s.bpm, swing:s.swing, tracks:s.tracks.map((t,i)=>trackData(t,i,t.type,t.voice))}; }
// ファイル全体＝16 セット × 16 パッド × 4 シーケンス（v3、§145）。いまのセットは live の tracks から、他は snapshot から
function buildProject(){
  if(typeof patSync==="function") patSync();   // live のミュートを今のパターンへ書き戻してから
  const cur=(typeof setCur!=="undefined")?setCur:0;
  const sets=[];
  for(let k=0;k<16;k++){
    const lv=(typeof setLevels!=="undefined" && setLevels[k]) || 0;   // ミックス音量（dB、v0.3.151）
    if(k===cur) sets.push({name:(setSlots[k]&&setSlots[k].name)||("SET "+(k+1)), bpm:bpmVal, swing:swingPct, level:lv, tracks:tracks.map((t,i)=>trackData(t,i,PADS[i].type,PADS[i].voice))});
    else sets.push(setSlots[k] ? Object.assign(setData(setSlots[k]), {level:lv}) : null);
  }
  return {
    version:3,
    cur,
    comp:{on:compOn, threshold:compThreshold, drive:compDrive},
    masterVol:+document.getElementById("kMaster").value,
    groupVol:groupVol.slice(),                                  // グループフェーダー
    fx:{delayAmt:fxDelayAmt, reverbAmt:fxReverbAmt, delayOn:fxDelayOn, reverbOn:fxReverbOn},  // 送りFX
    sets,
  };
}
document.getElementById("resetBtn").addEventListener("click",async()=>{
  if(!confirm("自動保存を消して初期状態から始めます。読み込んだ音とパターンは失われます（Saveで書き出していれば戻せます）。よろしいですか？")) return;
  await clearAutosave();
  _asDirty=false;
  location.reload();
});
// ---------- SAVE / LOAD の単位（v0.3.162 §156）：「SAVE も LOAD もセット単位かシーケンス単位でできるように」 ----------
// STAGE＝ファイル全体（16 セット）／SET＝いまのセット 1 つ（音つき）／SEQ＝編集中のパターン 1 つ（ステップ・P-LOCK・ミュート / エフェクト。音は無し）。
// 単位はメニューの Project で選ぶ（この端末で覚える）。読み込みは 73-share-export の loadFileData
const SAVE_SCOPE_KEY="mics-save-scope";
function saveScope(){ let s="stage"; try{ s=localStorage.getItem(SAVE_SCOPE_KEY)||"stage"; }catch(_){} return ["stage","set","seq"].includes(s)?s:"stage"; }
(function(){
  const seg=document.getElementById("saveScope"); if(!seg) return;
  const paint=()=>[...seg.children].forEach(b=>b.classList.toggle("on", b.dataset.u===saveScope()));
  seg.addEventListener("click",e=>{ const b=e.target.closest("button"); if(!b) return;
    try{ localStorage.setItem(SAVE_SCOPE_KEY, b.dataset.u); }catch(_){}
    paint(); sampNameEl.textContent = ({stage:"SAVE / LOAD ＝ ステージ全体（16 セット）", set:"SAVE / LOAD ＝ いまのセット（音つき）", seq:"SAVE / LOAD ＝ 編集中のシーケンス（"+"ABCD"[editPat]+"・音は無し）"})[saveScope()]; });
  paint();
})();
// いまのセット（live）をファイルのセットの形に
function curSetData(){ patSync(); return {name:(setSlots[setCur]&&setSlots[setCur].name)||("SET "+(setCur+1)), bpm:bpmVal, swing:swingPct, level:setLevels[setCur]||0, tracks:tracks.map((t,i)=>trackData(t,i,PADS[i].type,PADS[i].voice))}; }
// 単位ごとの書き出し内容とファイル名
function buildSaveFile(scope){
  const d=new Date(), z=n=>String(n).padStart(2,"0");
  const stamp=String(d.getFullYear()).slice(2)+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes());
  const sn="set"+z(setCur+1);
  // 拡張子で単位が分かる（v0.3.165）：STAGE＝.mics／SET＝.micset／SEQ＝.micseq。読み込みは拡張子ではなく中身（kind）で決める
  if(scope==="set") return {obj:{version:3, kind:"set", set:curSetData()}, name:"mics009-"+sn+"-"+stamp+".micset"};
  if(scope==="seq") return {obj:{version:3, kind:"seq", pat:editPat, from:(setSlots[setCur]&&setSlots[setCur].name)||("SET "+(setCur+1)), bpm:bpmVal, swing:swingPct, tracks:seqDataOf(editPat)},
                            name:"mics009-"+sn+"ABCD"[editPat]+"-"+stamp+".micseq"};
  return {obj:buildProject(), name:"mics009-"+stamp+".mics"};   // ファイル名に日時: mics009-YYMMDD-HHMM.mics
}
document.getElementById("saveBtn").addEventListener("click",()=>{
  const f=buildSaveFile(saveScope());
  const blob=new Blob([JSON.stringify(f.obj)],{type:"application/json"});
  shareOrDownload(blob, f.name);   // 共有シート（メンバーへ直接）→非対応はDL
});

// GTR（ギターストロークシミュレーター）＝別タブで開く（作業中のビートを失わない）
document.getElementById("gtrBtn").addEventListener("click",()=>{ window.open("guitar-strum.html?v="+APP_VERSION,"_blank"); });
document.getElementById("scrBtn").addEventListener("click",()=>{ window.open("dj-scratch.html?v="+APP_VERSION,"_blank"); });   // 版番号でキャッシュバスト＝常に最新のGTRを開く
