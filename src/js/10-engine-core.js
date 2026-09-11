// ===== MPC-style sampler engine (raw Web Audio) =====
// 全パッドが1つのAudioContextを共有。発音はバッファを持つボイスをプールから確保。
// 各ヒット = 1 AudioBufferSourceNode（使い切りだが正しい使い方=リークしない）。
// チョークグループで前のボイスを止める。プリセット音は起動時にオフラインレンダリングして焼き込む。

const AC = (()=>{  // latencyHint:0＝取り得る最小バッファを要求（Chrome系で"interactive"より短くなる。Safariは無視＝無害）
  try{ return new (window.AudioContext||window.webkitAudioContext)({latencyHint:0}); }
  catch(_){ return new (window.AudioContext||window.webkitAudioContext)({latencyHint:"interactive"}); }
})();
// 音声デコード：Promise版で失敗したら旧コールバック版で再試行（iOSのmp4/mov・webm等の互換対策）
// 注意: decodeAudioData は渡した ArrayBuffer を detach（中身を空に）する。
// そのため各試行に必ずコピー(slice)を渡し、フォールバックが空データを受け取らないようにする。
async function decodeAudio(arr){
  try{ return await AC.decodeAudioData(arr.slice(0)); }
  catch(e){ return await new Promise((res,rej)=>AC.decodeAudioData(arr.slice(0),res,rej)); }
}
// バッファが実質無音か判定（iOSのdecodeAudioDataが動画から無音だけ返すケースの検出用）
function isSilent(buf){
  if(!buf || !buf.length) return true;
  const d=buf.getChannelData(0);
  const stride=Math.max(1,Math.floor(d.length/4000));   // 間引いて高速チェック
  for(let i=0;i<d.length;i+=stride){ if(Math.abs(d[i])>0.0009) return false; }
  return true;
}
// iOS等でdecodeAudioDataが動画の音声を取り出せない場合の保険：
// 動画を「タップで」実時間再生しながらWeb Audioで録音→その音声をデコードして抽出する。
// （iOSはユーザー操作内でしかplay()できないため、専用ボタンのタップを再生のトリガにする）
function extractViaPlayback(file){
  return new Promise((resolve,reject)=>{
    const overlay=document.getElementById("extractOverlay");
    const goBtn=document.getElementById("extractGo");
    const msg=document.getElementById("extractMsg");
    const url=URL.createObjectURL(file);
    const v=document.createElement("video");
    v.src=url; v.playsInline=true; v.preload="auto";
    let done=false, watchdog=null;
    const finish=(fn,arg)=>{
      if(done) return; done=true;
      clearTimeout(watchdog);
      overlay.classList.remove("show"); goBtn.onclick=null; goBtn.disabled=false;
      try{URL.revokeObjectURL(url);}catch(_){}
      fn(arg);
    };
    v.onerror=()=>finish(reject,new Error("動画を再生できません"));
    overlay.classList.add("show");
    goBtn.disabled=false;
    msg.textContent="タップで再生して音を取り込みます";
    goBtn.onclick=async ()=>{
      goBtn.disabled=true;
      const target=selected;   // ▶を押した瞬間のパッドに書き込み先を確定
      let dest,rec;
      try{
        const src=AC.createMediaElementSource(v);
        dest=AC.createMediaStreamDestination();
        src.connect(dest);                 // スピーカーには出さず録音先のみへ
        rec=new MediaRecorder(dest.stream);
      }catch(err){ finish(reject,err); return; }
      const chunks=[];
      rec.ondataavailable=e=>{ if(e.data.size>0) chunks.push(e.data); };
      rec.onstop=async()=>{
        try{ finish(resolve, {buf: await decodeAudio(await new Blob(chunks).arrayBuffer()), target}); }
        catch(err){ finish(reject,err); }
      };
      const stop=()=>{ try{ if(rec.state!=="inactive") rec.stop(); }catch(_){} };
      v.onended=stop;
      v.ontimeupdate=()=>{ if(v.duration) msg.textContent="抽出中 "+v.currentTime.toFixed(1)+"/"+v.duration.toFixed(1)+"s"; };
      try{ rec.start(); }catch(err){ finish(reject,err); return; }
      try{ await v.play(); }
      catch(err){ stop(); finish(reject,new Error("再生不可:"+((err&&err.message)?err.message:err))); return; }
      // ウォッチドッグ：尺+3秒で強制停止（onendedが来なくても固まらない）
      const dur=(isFinite(v.duration)&&v.duration>0)?v.duration:30;
      watchdog=setTimeout(stop,(dur+3)*1000);
    };
  });
}
const masterGain = AC.createGain();
masterGain.gain.value = 0.9;

// ===== SP-1200 DAC段：固定26.04kHzゼロ次ホールド + 12bitリニア量子化（再構成フィルタ無し）=====
// 文献(Yeh CCRMA他)準拠：実機は固定クロックDAC＋アンチイメージング無しで13kHz超のイメージングを放射する＝音の核。
// pad総和(masterGain)直後に挿入し、以降(comp/サチュ/テープ/低域)はアウトボード扱い。
// AudioWorkletは非同期ロード。非対応/失敗時はspOutを素通り（従来のmakeLofi音）にフォールバック。
const SP_DAC_RATE = 26040;
const spOut = AC.createGain();   // DAC出力ノード（このノードから先へ全アウトボードを接続）
masterGain.connect(spOut);       // 既定は素通り。worklet成功時に masterGain→DAC→spOut へ差し替え
let spDacNode=null;              // A/Bトグルで bypass を送るため参照を保持
let loopZeroSnap=true;           // ループ点を最近傍ゼロ交差にスナップ（既定ON＝設定なしで継ぎ目のプツを抑える。A/BでOFF可）
// 最近傍のゼロ交差サンプル位置を返す（±win以内、符号反転点）。見つからなければ元のidx
function nearestZeroCross(data, idx, win){
  idx=Math.max(1,Math.min(data.length-1,idx|0));
  for(let d=0; d<win; d++){
    const a=idx+d; if(a>0&&a<data.length && (data[a-1]<=0)!==(data[a]<=0)) return a;
    const b=idx-d; if(b>0&&b<data.length && (data[b-1]<=0)!==(data[b]<=0)) return b;
  }
  return idx;
}
(function loadSpDac(){
  if(!(AC.audioWorklet && AC.audioWorklet.addModule)) return;   // 非対応ブラウザは素通り
  const code =
    "class SPDac extends AudioWorkletProcessor{"+
    "  constructor(o){super();this.rate=(o&&o.processorOptions&&o.processorOptions.rate)||26040;this.phase=0;this.held=new Float32Array(32);this.bypass=false;this.port.onmessage=(e)=>{if(e.data&&'bypass' in e.data)this.bypass=!!e.data.bypass;};}"+
    "  process(inputs,outputs){"+
    "    const input=inputs[0],output=outputs[0];"+
    "    if(!output||!output.length)return true;"+
    "    const nf=output[0].length,nc=output.length;"+
    "    if(this.bypass){for(let ch=0;ch<nc;ch++){const inp=(input&&(input[ch]||input[0]));const o=output[ch];if(inp){o.set(inp);}else{o.fill(0);}}return true;}"+   // OFF=DAC段を素通り（焼き込み済みmakeLofiのみ＝1段）
    "    const inc=this.rate/sampleRate,step=2/4096;"+   // 12bitリニア
    "    let phase=this.phase;"+
    "    for(let i=0;i<nf;i++){"+
    "      phase+=inc;let latch=false;if(phase>=1){phase-=1;latch=true;}"+
    "      for(let ch=0;ch<nc;ch++){"+
    "        if(latch){const inp=(input&&(input[ch]||input[0]));let s=inp?inp[i]:0;this.held[ch]=Math.round(s/step)*step;}"+   // 26kHzでラッチ＋量子化、間はホールド
    "        output[ch][i]=this.held[ch];"+
    "      }"+
    "    }"+
    "    this.phase=phase;return true;"+
    "  }"+
    "}"+
    "registerProcessor('sp-dac',SPDac);";
  const url=URL.createObjectURL(new Blob([code],{type:"application/javascript"}));
  AC.audioWorklet.addModule(url).then(()=>{
    try{
      const dac=new AudioWorkletNode(AC,'sp-dac',{outputChannelCount:[2],processorOptions:{rate:SP_DAC_RATE}});
      masterGain.disconnect(spOut);
      masterGain.connect(dac);
      dac.connect(spOut);
      spDacNode=dac;
    }catch(e){ /* 失敗時はmasterGain→spOutの素通りのまま */ }
    URL.revokeObjectURL(url);
  }).catch(()=>{ URL.revokeObjectURL(url); });
})();

