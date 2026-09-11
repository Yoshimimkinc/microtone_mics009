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
function buildProject(){
  return {
    version:2,
    bpm:bpmVal,
    swing:swingPct,
    comp:{on:compOn, threshold:compThreshold, drive:compDrive},
    masterVol:+document.getElementById("kMaster").value,
    groupVol:groupVol.slice(),                                  // グループフェーダー
    fx:{delayAmt:fxDelayAmt, reverbAmt:fxReverbAmt, delayOn:fxDelayOn, reverbOn:fxReverbOn},  // 送りFX
    tracks:tracks.map((t,i)=>{
      const crop=calcCrop(t);
      return {
        name:t.name,
        type:PADS[i].type,
        voice:PADS[i].voice||null,
        vol:t.vol, tune:t.tune, scale:t.scale,
        start: crop?crop.start:t.start,
        end: crop?crop.end:t.end,
        loop:t.loop,
        loopStart: crop?crop.loopStart:t.loopStart,
        filter:t.filter, cutoff:t.cutoff, reso:t.reso,
        choke:t.choke, mute:t.mute, solo:t.solo,
        attack:t.attack||0, fade:t.fade??3, delaySend:t.delaySend||0, reverbSend:t.reverbSend||0, outBus:t.outBus||"A", midiNote:t.midiNote??null, key:t.key??null,
        patterns:t.patterns,
        locks:t.locks||{},
        audio: crop ? wavB64Cached(t, crop) : null,
      };
    }),
  };
}
document.getElementById("resetBtn").addEventListener("click",async()=>{
  if(!confirm("自動保存を消して初期状態から始めます。読み込んだ音とパターンは失われます（Saveで書き出していれば戻せます）。よろしいですか？")) return;
  await clearAutosave();
  _asDirty=false;
  location.reload();
});
document.getElementById("saveBtn").addEventListener("click",()=>{
  const proj=buildProject();
  const json=JSON.stringify(proj);
  const blob=new Blob([json],{type:"application/json"});
  // ファイル名に日時を付与: mics009-YYMMDD-HHMM.mics。共有シート（メンバーへ直接）→非対応はDL
  const d=new Date(), z=n=>String(n).padStart(2,"0");
  const stamp=String(d.getFullYear()).slice(2)+z(d.getMonth()+1)+z(d.getDate())+"-"+z(d.getHours())+z(d.getMinutes());
  shareOrDownload(blob, "mics009-"+stamp+".mics");
});

// GTR（ギターストロークシミュレーター）＝別タブで開く（作業中のビートを失わない）
document.getElementById("gtrBtn").addEventListener("click",()=>{ window.open("guitar-strum.html?v="+APP_VERSION,"_blank"); });
document.getElementById("scrBtn").addEventListener("click",()=>{ window.open("dj-scratch.html?v="+APP_VERSION,"_blank"); });   // 版番号でキャッシュバスト＝常に最新のGTRを開く
