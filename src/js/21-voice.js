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
function chokeGroup(group, exceptPad, when){
  if(!group) return;
  for(let j=0;j<tracks.length;j++){
    if(j===exceptPad) continue;
    if(tracks[j].choke===group) stopVoices(tracks[j], when);
  }
}
function stopVoices(t, when){
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
function anySolo(){ return tracks.some(t=>t.solo); }
function audible(i){
  const t=tracks[i];
  if(t.mute) return false;
  if(anySolo() && !t.solo) return false;
  return true;
}

// ドロップサンプル・ピッチ（SP-1200式・補間なし）：
// 元バッファを最近傍(nearest-neighbor)でratio倍にリサンプルし、AC.sampleRateのバッファに焼く。
// これをplaybackRate=1.0で再生すると、ブラウザの補間を一切受けずSP的なエイリアス/粒立ちが出る。
// 連続ベンドは無いアプリなので発音毎の生成で十分（短音はサブms、ループ系もトグル時のみ）。
function pitchBufferNN(buf, ratio){
  const srcSr = buf.sampleRate, ch = buf.numberOfChannels;
  const step = ratio * srcSr / AC.sampleRate;            // 出力1サンプルあたり進める元サンプル数
  const cap = AC.sampleRate * 12;                        // 念のため長さ上限（極端なピッチダウン対策）
  const outLen = Math.max(1, Math.min(cap, Math.floor(buf.length / step)));
  const out = AC.createBuffer(ch, outLen, AC.sampleRate);
  for(let c=0;c<ch;c++){
    const s = buf.getChannelData(c), d = out.getChannelData(c);
    let pos = 0;
    for(let n=0;n<outLen;n++){ d[n] = s[pos|0] || 0; pos += step; }  // 整数indexのみ＝ドロップサンプル
  }
  return out;
}
// 半音キーでピッチ済みバッファをキャッシュ（同音程の連打で毎回生成しない＝負荷増を防ぐ）。
// t.bufferが差し替わったら自動でキャッシュ破棄（録音/読込/CHOPPY/再12bit化に追従）。
function getPitchedBuffer(t, semi){
  if(!semi) return t.buffer;   // 等倍(ratio=1)は恒等コピー＝焼き込み不要。初回ヒットの全長コピー(＝発音前の数ms)を丸ごと省く
  if(t._pcacheBuf !== t.buffer){ t._pcache = {}; t._pcacheKeys = []; t._pcacheBuf = t.buffer; }
  let b = t._pcache[semi];
  if(!b){
    b = t._pcache[semi] = pitchBufferNN(t.buffer, Math.pow(2, semi/12));
    // 長尺ループ×多音程でピッチ済みバッファが溜まりすぎないようLRU上限（最大16音程）
    (t._pcacheKeys || (t._pcacheKeys=[])).push(semi);
    while(t._pcacheKeys.length > 16){ const old=t._pcacheKeys.shift(); if(old!==semi) delete t._pcache[old]; }
  }
  return b;
}
// tune変更後にピッチ焼き込みを先回り＝次の発音時の全長コピーを発音前に済ませる（連続ドラッグはdebounce）
const _warmT={};
function warmPitch(i){
  clearTimeout(_warmT[i]);
  _warmT[i]=setTimeout(()=>{ const t=tracks[i]; if(t&&t.buffer&&t.tune) try{ getPitchedBuffer(t,t.tune); }catch(_){ } },150);
}
// 1ヒット発音
function playVoice(i, when, accent, fromSeq, noteSemi, plock){
  const t = tracks[i];
  if(!t.buffer) return;
  // シーケンサー由来はmute/soloを尊重。手叩き（fromSeq=false）は常に鳴らす＝演奏感
  if(fromSeq && !audible(i)) return;
  if(!fromSeq) liveCompDuck();   // ライブ叩きはコンプ先読み(約6ms)をリアルタイムに回避（1.5s後に自動復帰）

  stopVoices(t, when);
  chokeGroup(t.choke, i, when);

  // p-lock: pitch(半音)を加算 → ドロップサンプル(最近傍)でピッチをバッファに焼き込み、再生は等倍（補間ゼロ）
  const lkPitch = (plock && plock.pitch!=null) ? plock.pitch : 0;
  const semi = t.tune + (noteSemi||0) + lkPitch;
  const pbuf = getPitchedBuffer(t, semi);       // 半音キーでキャッシュ
  const dur = pbuf.duration;   // ピッチ済みバッファの尺で以降の開始/終了/ループ点が正しくスケール
  const sN = Math.min(0.999, Math.max(0, t.start));
  const eN = Math.min(1, Math.max(sN+0.001, t.end));
  const startSec = sN*dur, endSec = eN*dur;

  const src = AC.createBufferSource();
  src.buffer = pbuf;
  src.playbackRate.value = 1;   // ピッチはバッファに焼き込み済み = ブラウザ補間を回避

  // フィルター（off時は挟まない）。p-lock filter があればカットオフを上書き（offなら一時的にLP）
  let head = src;
  let filt = null;
  let fType = t.filter, fCut = t.cutoff;
  if(plock && plock.filter!=null){ fCut = plock.filter; if(fType==="off") fType="lp"; }
  if(fType!=="off"){
    filt = AC.createBiquadFilter();
    filt.type = fType==="lp" ? "lowpass" : "highpass";
    filt.frequency.value = fCut;
    filt.Q.value = t.reso;
    src.connect(filt); head = filt;
  }
  const env = AC.createGain();
  // p-lock: level(dB) があれば音量を上書き
  const baseVol = (plock && plock.level!=null) ? plock.level : t.vol;
  const peak = dbToGain(baseVol + (accent?3:0));
  const toB = multiOut && t.outBus==="B";
  head.connect(env);
  if(toB) env.connect(outBGain);   // OUT B＝ドライ直行（グループFX/マスターを通らない）
  else env.connect(groupBus[GROUP_OF[i]]);   // グループバス経由→[SSM2044]→masterGain
  spDynOpen(GROUP_OF[i], when, accent);   // SSM2044ダイナミックフィルター：発音毎に開閉。アクセントはより開く＝強打の説得力

  // DELAY/REVERBセンド：p-lock(そのステップ)が優先、無ければ per-pad ベース送り(t.delaySend/reverbSend)
  let dSend=null, rSend=null;
  const dAmt = (plock && plock.delay!=null) ? plock.delay : (t.delaySend||0);
  const rAmt = (plock && plock.reverb!=null) ? plock.reverb : (t.reverbSend||0);
  if(!toB && dAmt>0){ dSend=AC.createGain(); dSend.gain.value=dAmt; env.connect(dSend); dSend.connect(tapeEcho); }
  if(!toB && rAmt>0){ rSend=AC.createGain(); rSend.gain.value=rAmt; env.connect(rSend); rSend.connect(reverbPre); }

  // 頭=アタック(フェードイン)、終端=フェード(フェードアウト)。未設定はプツ音回避の既定値。
  const ATT  = Math.max(0.001, (t.attack||0)/1000);
  const FADE = Math.max(0.001, (t.fade??3)/1000);

  let oneShotLen = 0;   // 一発ものの再生長（ウォッチドッグ用。ループは0）
  if(t.loop){
    const lsN = Math.min(eN-0.001, Math.max(0, t.loopStart));
    src.loop = true;
    let lsSec = lsN*dur, leSec = endSec;
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
    try{src.disconnect();env.disconnect();if(filt)filt.disconnect();if(dSend)dSend.disconnect();if(rSend)rSend.disconnect();}catch(e){}
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
  if(i===peTarget && typeof pePlayheadRun==="function" && typeof peWaveVisible==="function" && peWaveVisible()){
    const lsN = t.loop ? Math.min(eN-0.001, Math.max(0, t.loopStart)) : sN;
    pePlayheadRun(when, startSec, endSec, lsN*dur, dur, t.loop);
  }
}

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
  if(time==null && t.loop){
    if(t.loopPlaying){ stopVoices(t, AC.currentTime); t.loopPlaying=false; flashPad(i); return; }
    t.loopPlaying=true;
  }
  const when = (time!=null) ? time : AC.currentTime;
  playVoice(i, when, accent, false);
  flashPad(i);
  if(typeof vuHit==="function") vuHit(i, accent);
  if(recording && playing){
    // 記録先は「いま鳴っている（表示中の）パターン/小節」。playPat/playBar はスケジューラが
    // 100ms先行して小節頭で進めているので、小節末の手叩きが次の小節／次パターンに入っていた
    tracks[i].patterns[displayPat][displayBar][playStep] = accent?2:1;
    paintSteps();
  }
}

