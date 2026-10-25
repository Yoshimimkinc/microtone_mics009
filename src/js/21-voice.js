// @module voice
// @provides PITCH_CAP_SEC, _warmT, anySolo, audible, chokeGroup, getPitchedRegion, hitVoice, makeLofi,
//    pitchBufferNN, playVoice, previewVoiceFrom, stopAllVoices, stopVoices, trigger, warmPitch
// @uses AC, GROUP_OF, LOFI, PADS, _keyBuffers, bpmVal, dbToGain, displayBar, displayPat, flashPad, groupBus,
//    liveCompDuck, loopZeroSnap, multiOut, nearestZeroCross, normalizeKeyPhrase, outBGain, paintSteps,
//    pePlayheadRun, peTarget, peWaveVisible, playStep, playing, prepareKeyTrack, recording, reverbPre,
//    sampNameEl, setIndexOfTrs, setLevelLin, setLevelNode, setSlots, setStepAt, spDynOpen, tapeEcho, tracks,
//    vuHit
// @depends -
// ===== SP風 12bit Lo-Fi 処理 =====
// ビット量子化 + サンプルレート低下（間引き＆ホールドで高域を落とす）
function makeLofi(buffer){
  // SP-1200の「録音ADC」段：入力アンチエイリアス(緩め)→26kHz相当のサンプル&ホールド→12bitリニア量子化。
  // 実機の入力AAは〜13kHzで緩く落ちる程度（ブリックウォールではない）＝文献(Yeh)準拠。出力側の粗さはSP-DAC段が担当。
  const ch = buffer.numberOfChannels;
  const sr = buffer.sampleRate;
  const out = AC.createBuffer(ch, buffer.length, sr);
  const levels = Math.pow(2, LOFI.bits);          // 12bit = 4096段
  const half = levels/2;
  const hold = Math.max(1, Math.round(sr / LOFI.targetRate)); // 何サンプルに1回更新するか
  // 入力AA: 2極Butterworth LP（RBJ）fc≈13kHz。録音側のエイリアスを軽く抑える（寄与は小さいのが実機）
  const fc=Math.min(13000, sr*0.46);
  const w0=2*Math.PI*fc/sr, cw=Math.cos(w0), sw=Math.sin(w0), alpha=sw/(2*0.7071);
  const a0=1+alpha;
  const B0=((1-cw)/2)/a0, B1=(1-cw)/a0, B2=((1-cw)/2)/a0, A1=(-2*cw)/a0, A2=(1-alpha)/a0;
  for(let c=0;c<ch;c++){
    const src = buffer.getChannelData(c);
    const dst = out.getChannelData(c);
    let held = 0, x1=0,x2=0,y1=0,y2=0;
    for(let n=0;n<src.length;n++){
      // 入力AA（1パス2極LP）
      const x=src[n];
      let f=B0*x+B1*x1+B2*x2-A1*y1-A2*y2;
      x2=x1; x1=x; y2=y1; y1=f;
      if(n % hold === 0){
        // サンプル&ホールド（レート低下）＋ 12bitリニア量子化（ディザ無し）
        held = Math.round(f*half)/half;
      }
      dst[n] = held;
    }
  }
  return out;
}

// 同じチョークグループの鳴っている音を即停止
// trs：どのセットのトラック列か（既定＝いまのセットの tracks。同時に鳴っている他のセットは audio/set-players が snapshot の列を渡す v0.3.147）
function chokeGroup(group, exceptPad, when, trs=tracks){
  if(!group) return;
  for(let j=0;j<trs.length;j++){
    if(j===exceptPad) continue;
    if(trs[j].choke===group) stopVoices(trs[j], when);
  }
}
function stopVoices(t, when){
  if(!t.activeVoices){ t.activeVoices=[]; return; }
  t.activeVoices.forEach(v=>{
    try{
      // cancelScheduledValuesはフェード予約中だと直前イベント値(=peak)へ瞬時に跳ねる仕様＝チョーク時の「プチッ」の原因。
      // cancelAndHoldAtTimeなら現在値を保持したまま切れる（非対応ブラウザは現在値を明示セットで近似）
      if(v.env.gain.cancelAndHoldAtTime) v.env.gain.cancelAndHoldAtTime(when);
      else { const cur=v.env.gain.value; v.env.gain.cancelScheduledValues(when); v.env.gain.setValueAtTime(cur, when); }
      v.env.gain.setTargetAtTime(0, when, 0.005); // 5ms フェードで切る
      v.src.stop(when+0.03);
    }catch(e){}
    // ループ系など、停止後にonendedが来ない場合の保険：停止予定時刻の少し後に強制後始末
    if(v.cleanup){
      if(v.wd) clearTimeout(v.wd);
      v.wd = setTimeout(v.cleanup, Math.max(0, when+0.03-AC.currentTime)*1000 + 300);
    }
  });
  t.activeVoices.length=0;
}

// ソロが1つでもonなら、ソロ対象以外は鳴らさない
function anySolo(trs=tracks){ return trs.some(t=>t.solo); }
function audible(i, trs=tracks){
  const t=trs[i];
  if(t.mute) return false;
  if(anySolo(trs) && !t.solo) return false;
  return true;
}

// ドロップサンプル・ピッチ（SP-1200式・補間なし）：
// 元バッファを最近傍(nearest-neighbor)でratio倍にリサンプルし、AC.sampleRateのバッファに焼く。
// これをplaybackRate=1.0で再生すると、ブラウザの補間を一切受けずSP的なエイリアス/粒立ちが出る。
// 連続ベンドは無いアプリなので発音毎の生成で十分（短音はサブms、ループ系もトグル時のみ）。
// a..b：元バッファのこの範囲だけを焼く（フレーム。既定＝全体）
const PITCH_CAP_SEC = 120;   // 焼いたバッファの長さの上限（極端なピッチダウン×ロングサンプルでメモリを食い尽くさない）
function pitchBufferNN(buf, ratio, a=0, b=buf.length){
  const srcSr = buf.sampleRate, ch = buf.numberOfChannels;
  const step = ratio * srcSr / AC.sampleRate;            // 出力1サンプルあたり進める元サンプル数
  const cap = AC.sampleRate * PITCH_CAP_SEC;
  const outLen = Math.max(1, Math.min(cap, Math.floor((b - a) / step)));
  const out = AC.createBuffer(ch, outLen, AC.sampleRate);
  for(let c=0;c<ch;c++){
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    let pos = a;
    for(let n=0;n<outLen;n++){ d[n] = s[pos|0] || 0; pos += step; }  // 整数indexのみ＝ドロップサンプル
  }
  return out;
}
// 鳴らす範囲（正規化 aN..bN）をピッチ済みにして返す。{buf, at(x)＝正規化位置 x がこの buf の何秒目か, off, V}
// v0.3.168 までは全体を焼いて 12 秒で打ち切り、START / END を「打ち切ったバッファの長さ」に掛けていた。
// ロングサンプルでピッチを変えると START が手前へずれ（60 秒の 0.5＝30 秒目が 6 秒目に）、聞いている所と TRIM で切る所が食い違っていた（v0.3.169 §163）。
// いまは鳴らす範囲だけを焼き、位置は元バッファのフレームから出す＝ピッチを変えても同じ所から鳴る。
// 同じ音程×同じ範囲はキャッシュ。t.buffer が替わったら捨てる（録音/読込/CHOP/TRIM/再12bit化に追従）
function getPitchedRegion(t, semi, aN=0, bN=1){
  const src = t.buffer, N = src.length, srcSr = src.sampleRate;
  if(!semi) return {buf:src, at:x=>x*N/srcSr, off:0, V:N/srcSr};   // 等倍は焼かない（初回ヒットの全長コピーを省く）
  const ratio = Math.pow(2, semi/12), step = ratio*srcSr/AC.sampleRate, sr = AC.sampleRate;
  const a = Math.max(0, Math.min(N-1, Math.floor(aN*N))), b = Math.max(a+1, Math.min(N, Math.ceil(bN*N)));
  if(t._pcacheBuf !== src){ t._pcache = {}; t._pcacheKeys = []; t._pcacheBuf = src; }
  const key = semi+":"+a+":"+b, keys = t._pcacheKeys || (t._pcacheKeys=[]);
  let buf = t._pcache[key];
  if(!buf){
    buf = t._pcache[key] = pitchBufferNN(src, ratio, a, b);
    keys.push(key);
    // 溜めすぎない：最大 16 個、合計 PITCH_CAP_SEC 秒ぶんまで（いま焼いたのは残す）
    let tot = keys.reduce((s,k)=>s+(t._pcache[k]?t._pcache[k].length:0), 0);
    while(keys.length>1 && (keys.length>16 || tot>sr*PITCH_CAP_SEC)){ const old=keys.shift(); tot-=(t._pcache[old]?t._pcache[old].length:0); delete t._pcache[old]; }
  } else { const k=keys.indexOf(key); if(k>=0){ keys.splice(k,1); keys.push(key); } }   // LRU：使ったら後ろへ
  return {buf, at:x=>Math.max(0, (x*N - a)/step/sr), off:a/step/sr, V:N/step/sr};
}
// tune変更後にピッチ焼き込みを先回り＝次の発音時の全長コピーを発音前に済ませる（連続ドラッグはdebounce）
const _warmT={};
function warmPitch(i){
  clearTimeout(_warmT[i]);
  _warmT[i]=setTimeout(()=>{ const t=tracks[i]; if(t&&t.buffer&&t.tune) try{ const s=t.start||0; getPitchedRegion(t, t.tune, t.loop?Math.min(s, t.loopStart||0):s, t.end??1); }catch(_){ } },150);
}
// 1ヒット発音
// trs：鳴らすセットのトラック列（既定＝いまのセット。SET のミックスで他のセットを鳴らすときは snapshot の列 v0.3.147）
// fromN：ここから鳴らす（0..1、バッファ全体に対する位置）。EDIT の試聴カーソル（v0.3.160）。null＝START から
function playVoice(i, when, accent, fromSeq, noteSemi, plock, trs=tracks, fromN=null){
  const t = trs[i];
  if(!t) return;
  if(t.padKind==="KEY"){const k=JSON.stringify([normalizeKeyPhrase(t.keyPhrase),(trs===tracks?bpmVal:((setSlots[setIndexOfTrs(trs)]||{}).bpm||bpmVal))]);if(t._keySignature!==k||!_keyBuffers.has(t.buffer)){prepareKeyTrack(t,trs===tracks?bpmVal:((setSlots[setIndexOfTrs(trs)]||{}).bpm||bpmVal)).catch(()=>{});if(!fromSeq)sampNameEl.textContent="KEY生成中 — もう一度タップ";return;}}
  if(!t.buffer) return;
  if(!t.activeVoices) t.activeVoices=[];
  // シーケンサー由来はmute/soloを尊重。手叩き（fromSeq=false）は常に鳴らす＝演奏感
  if(fromSeq && !audible(i, trs)) return;
  if(!fromSeq) liveCompDuck();   // ライブ叩きはコンプ先読み(約6ms)をリアルタイムに回避（1.5s後に自動復帰）

  stopVoices(t, when);
  chokeGroup(t.choke, i, when, trs);

  // p-lock: pitch(半音)を加算 → ドロップサンプル(最近傍)でピッチをバッファに焼き込み、再生は等倍（補間ゼロ）
  const lkPitch = 0; // 旧ファイル／呼出元のステップ値では上書きしない
  const semi = t.tune + (noteSemi||0) + lkPitch;
  const sN = Math.min(0.999, Math.max(0, fromN!=null ? fromN : t.start));
  const eN = Math.min(1, Math.max(sN+0.001, t.end));
  const lsN = t.loop ? Math.min(eN-0.001, Math.max(0, t.loopStart)) : sN;
  // 鳴らす範囲だけピッチ済みに（試聴カーソルで START の後ろから鳴らすときも START からの範囲を使い回す）。位置は元バッファから＝ピッチで START がずれない（v0.3.169）
  const pr = getPitchedRegion(t, semi, Math.min(sN, lsN, Math.max(0, t.start||0)), eN);
  const pbuf = pr.buf;
  const startSec = pr.at(sN), endSec = Math.max(startSec+0.001, Math.min(pbuf.duration, pr.at(eN)));

  const src = AC.createBufferSource();
  src.buffer = pbuf;
  src.playbackRate.value = 1;   // ピッチはバッファに焼き込み済み = ブラウザ補間を回避

  // フィルター（off時は挟まない）。p-lock filter があればカットオフを上書き（offなら一時的にLP）
  let head = src;
  let filt = null;
  let fType = t.filter, fCut = t.cutoff;

  if(fType!=="off"){
    filt = AC.createBiquadFilter();
    filt.type = fType==="lp" ? "lowpass" : "highpass";
    filt.frequency.value = fCut;
    filt.Q.value = t.reso;
    src.connect(filt); head = filt;
  }
  const env = AC.createGain();
  // 音量は EDIT の Level（t.vol）だけ。P-LOCK level は v0.3.124 で廃止（古い .mics の level ロックは読み込み時に捨てる §135）
  const baseVol = t.vol;
  const peak = dbToGain(baseVol + (accent?3:0));
  const toB = multiOut && t.outBus==="B";
  // セットのミックス音量（v0.3.151）：env の後ろに声ごとのゲイン vg。gain はそのセットの ConstantSource が動かす＝鳴っている音にも、送りにも効く
  const vg = AC.createGain();
  const sk = (typeof setIndexOfTrs==="function") ? setIndexOfTrs(trs) : -1;
  const lvSrc = (sk>=0 && typeof setLevelNode==="function") ? setLevelNode(sk) : null;
  if(lvSrc){ vg.gain.value=0; lvSrc.connect(vg.gain); } else vg.gain.value = (sk>=0 && typeof setLevelLin==="function") ? setLevelLin(sk) : 1;
  head.connect(env); env.connect(vg);
  if(toB) vg.connect(outBGain);   // OUT B＝ドライ直行（グループFX/マスターを通らない）
  else vg.connect(groupBus[GROUP_OF[i]]);   // グループバス経由→[SSM2044]→masterGain
  spDynOpen(GROUP_OF[i], when, accent);   // SSM2044ダイナミックフィルター：発音毎に開閉。アクセントはより開く＝強打の説得力

  // DELAY/REVERBセンド：p-lock(そのステップ)が優先、無ければ per-pad ベース送り(t.delaySend/reverbSend)
  let dSend=null, rSend=null;
  const dAmt = (t.delaySend||0);
  const rAmt = (t.reverbSend||0);
  if(!toB && dAmt>0){ dSend=AC.createGain(); dSend.gain.value=dAmt; vg.connect(dSend); dSend.connect(tapeEcho); }
  if(!toB && rAmt>0){ rSend=AC.createGain(); rSend.gain.value=Math.sqrt(Math.max(0,Math.min(1,rAmt))); vg.connect(rSend); rSend.connect(reverbPre); }

  // 頭=アタック(フェードイン)、終端=フェード(フェードアウト)。未設定はプツ音回避の既定値。
  const ATT  = Math.max(0.001, (t.attack||0)/1000);
  const FADE = Math.max(0.001, (t.fade??3)/1000);

  let oneShotLen = 0;   // 一発ものの再生長（ウォッチドッグ用。ループは0）
  if(t.loop){
    src.loop = true;
    let lsSec = Math.min(pr.at(lsN), endSec-0.001), leSec = endSec;
    if(loopZeroSnap){   // A/B: ループ点を最近傍ゼロ交差へ（継ぎ目のプツ低減）
      const d=pbuf.getChannelData(0), sr=pbuf.sampleRate, win=Math.round(sr*0.002);
      lsSec = nearestZeroCross(d, Math.round(lsSec*sr), win)/sr;
      leSec = nearestZeroCross(d, Math.round(leSec*sr), win)/sr;
      if(leSec <= lsSec+0.001) leSec = endSec;   // 退避：逆転/極小ループを防ぐ
    }
    src.loopStart = lsSec;
    src.loopEnd = leSec;
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when+ATT);
    try{ src.start(when, startSec); }catch(e){ try{src.start(when);}catch(_){} }
    // ループは終端で切らない（ループ点はゼロ交差でなくてもプツは出にくい）。停止時にstopVoicesがフェードアウト
  } else {
    const len = Math.max(0.005, (endSec-startSec)/src.playbackRate.value);
    oneShotLen = len;
    const attEnd = Math.min(ATT, len*0.4);     // アタック終端（極短スライスは尺の40%まで）
    const fadeDur = Math.min(FADE, len*0.4);    // フェードもスケール
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(peak, when+attEnd);
    // 終端フェードアウト：開始点をアタック終端以降にクランプ（極短スライスで頭プツ/段差が出ないよう交差を防ぐ）
    const fadeOutStart = when + Math.max(attEnd, len-fadeDur);
    env.gain.setValueAtTime(peak, fadeOutStart);
    env.gain.linearRampToValueAtTime(0, when+len);
    try{ src.start(when, startSec, len); }catch(e){ try{src.start(when);}catch(_){} }
  }

  const voice = {src, env, filt, dSend, rSend, done:false, wd:null};
  // 後始末は冪等（onended・ウォッチドッグ・stopVoicesのどれから呼ばれても一度だけ実行）
  voice.cleanup = ()=>{
    if(voice.done) return; voice.done=true;
    if(voice.wd){ clearTimeout(voice.wd); voice.wd=null; }
    const k=t.activeVoices.indexOf(voice);
    if(k>=0) t.activeVoices.splice(k,1);
    try{src.disconnect();env.disconnect();vg.disconnect();if(filt)filt.disconnect();if(dSend)dSend.disconnect();if(rSend)rSend.disconnect();}catch(e){}
    if(lvSrc){ try{ lvSrc.disconnect(vg.gain); }catch(e){} }
  };
  // 窓波形プレイヘッドは撤去済み（カーソル記録なし）
  t.activeVoices.push(voice);
  src.onended = voice.cleanup;
  // 一発もの：onendedが来ないブラウザ/状況でも確実に後始末（尺＋1秒の保険）。ループはstopVoices側で保険を張る
  if(!t.loop){
    voice.wd = setTimeout(voice.cleanup, Math.max(0, when-AC.currentTime+oneShotLen)*1000 + 1000);
  }
  // 波形（モーダル or 情報窓のSAMPLEページ）が見えていて対象パッドが鳴ったら、再生位置カーソルを走らせる。
  // 手叩きもシーケンサーも同じ（v0.3.103）。ループは常に1本＝再トリガで前のを止めるので負荷は増えない
  if(trs===tracks && i===peTarget && typeof pePlayheadRun==="function" && typeof peWaveVisible==="function" && peWaveVisible()){
    pePlayheadRun(when, startSec+pr.off, endSec+pr.off, pr.at(lsN)+pr.off, pr.V, t.loop);   // 波形の上の位置＝全体を焼いたときの秒（off で範囲の頭をずらす）
  }
}

// 手叩きの共通部（音側だけ）：ループ系はトグル＝発音中なら止めて false、それ以外は鳴らして true。
// loopPlaying を書くのはここと scheduler（audio/transport）だけ（v0.3.135 Phase 3 第3段）。表示（点灯・VU・記録）は呼び出し側
function hitVoice(i, semi=0, accent=false){
  const t=tracks[i];
  if(t.loop && t.loopPlaying){ stopVoices(t, AC.currentTime); t.loopPlaying=false; return false; }
  playVoice(i, AC.currentTime, accent, false, semi);
  if(t.loop) t.loopPlaying=true;
  return true;
}
// EDIT の試聴をカーソル位置から（v0.3.160）：鳴っていても鳴らし直す（ループもトグルせずに頭出し）。END まで（ループは LOOP へ戻る）
function previewVoiceFrom(i, fromN){
  const t=tracks[i]; if(!t||!t.buffer) return;
  playVoice(i, AC.currentTime, false, false, 0, null, tracks, fromN);
  if(t.loop) t.loopPlaying=true;
}
// 全パッドの発音を止め、ループのトグル状態も戻す（停止・読込のとき）
function stopAllVoices(when){ tracks.forEach(t=>{ stopVoices(t, when); t.loopPlaying=false; }); }
// ---------- trigger (UI/seq 共通入口) ----------
function trigger(i, time, accent=false){
  if(AC.state!=="running") AC.resume();
  const t=tracks[i];
  // 空パッド：発音なし＝案内のみ。音入れは中央「＋」ワンタップに一本化（ダブルタップ遷移は廃止 v0.3.69）
  if(time==null && PADS[i].type==="empty" && !t.buffer){
    sampNameEl.textContent="空のパッド — まんなかの「＋」をタップで音を入れる";
    flashPad(i); return;
  }
  // ループ系は手叩きでトグル（ON→OFF→ON…）。発音中のトリガで止める＝短いノートも作れる
  if(time==null){ const on=hitVoice(i, 0, accent); flashPad(i); if(!on) return; }
  else { playVoice(i, time, accent, false); flashPad(i); }
  if(typeof vuHit==="function") vuHit(i, accent);
  if(recording && playing){
    // 記録先は「いま鳴っている（表示中の）パターン/小節」。playPat/playBar はスケジューラが
    // 100ms先行して小節頭で進めているので、小節末の手叩きが次の小節／次パターンに入っていた
    setStepAt(i, displayPat, displayBar, playStep, accent?2:1);   // data/patterns
    paintSteps();
  }
}

