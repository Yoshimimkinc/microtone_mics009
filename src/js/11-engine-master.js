// ===== アナログ風マスターコンプ + サチュレーション =====
// Chain: voices → masterGain → comp → saturator → makeupGain → destination
const comp = AC.createDynamicsCompressor();
comp.threshold.value = -12;   // dB（COMPつまみで動かす）
comp.knee.value = 12;         // ソフトニー（アナログ的な緩い圧縮）
comp.ratio.value = 4;
comp.attack.value = 0.008;    // 8ms（パーカッション向け、速めだがアタック殺さない）
comp.release.value = 0.12;    // 120ms（SP的なポンピング感）

// サチュレーション（ソフトクリップ）
const saturator = AC.createWaveShaper();
// 入力域は ±2（手前の satIn=0.5 で半分にして入れる）。|x|≤1 の写像は従来と同一、1〜2 は tanh で滑らかに（最大 +0.8dB）。
// WaveShaper は定義域の外を端の値に張り付ける＝硬いクリップになるため、先読みなしコンプ（v0.3.110）が通す
// 頭の一発（実測 +3dB 程度）を硬く切らないよう定義域を広げた
function makeSatCurve(drive){
  const n=2048, curve=new Float32Array(n);
  for(let i=0;i<n;i++){
    const x=(i*2/n-1)*2;   // -2..+2
    // tanh系ソフトクリップ。driveが高いほど歪む
    curve[i]=Math.tanh(x*drive)/Math.tanh(drive);
  }
  return curve;
}
const satIn = AC.createGain(); satIn.gain.value = 0.5;   // 定義域 ±2 に合わせる（音は変えない）
satIn.connect(saturator);
saturator.curve = makeSatCurve(1.5);
// oversample "2x" は Chrome の再標本化 FIR で 54 frames（1.2ms）の隠れ遅延が出る（実測 §127）。差は 10kHz 以上で 0.6dB＝
// 26kHz イメージングを故意に出すこの機材では聞こえない側。手叩きの予算を優先して "none"（v0.3.114）
saturator.oversample = "none";

// メイクアップゲイン
const makeupGain = AC.createGain();
makeupGain.gain.value = 1.2;  // 圧縮分の音量補償

// ===== テープ質感（固定・常時ON）=====
// ワウフラッター：遅延線をLFOで揺らしてピッチを微妙に揺らす
const tapeDelay = AC.createDelay(0.05);
tapeDelay.delayTime.value = 0.001;  // ベース1ms（v0.3.110: 3→1ms。揺れ幅の合計0.48msより大きければ足りる＝固定遅延は音に出ないので最小に）

// Wow（遅い揺れ 〜0.7Hz ±0.4ms）
const wowLfo = AC.createOscillator();
wowLfo.type = "sine"; wowLfo.frequency.value = 0.7;
const wowDepth = AC.createGain();
wowDepth.gain.value = 0.0004;  // 0.4ms
wowLfo.connect(wowDepth);
wowDepth.connect(tapeDelay.delayTime);
wowLfo.start();

// Flutter（速い揺れ 〜4.5Hz ±0.08ms）
const flutterLfo = AC.createOscillator();
flutterLfo.type = "sine"; flutterLfo.frequency.value = 4.5;
const flutterDepth = AC.createGain();
flutterDepth.gain.value = 0.00008;  // 0.08ms
flutterLfo.connect(flutterDepth);
flutterDepth.connect(tapeDelay.delayTime);
flutterLfo.start();

// テープヒス（高域ノイズ、ごく小さく常時混入）
const hissLen = AC.sampleRate * 2;
const hissBuf = AC.createBuffer(1, hissLen, AC.sampleRate);
const hissData = hissBuf.getChannelData(0);
for(let n = 0; n < hissLen; n++) hissData[n] = Math.random() * 2 - 1;
const hissNode = AC.createBufferSource();
hissNode.buffer = hissBuf; hissNode.loop = true;
const hissHp = AC.createBiquadFilter();
hissHp.type = "highpass"; hissHp.frequency.value = 4000;
const hissGain = AC.createGain();
// スマホは小型スピーカーが高域を強調＆音量も小さめでヒスが目立つため大幅に下げる
const isMobileHiss = (window.matchMedia && matchMedia("(pointer:coarse)").matches)
                     || /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent||"");
hissGain.gain.value = isMobileHiss ? 0.0002 : 0.0006;
// 耳障りな最上部を少し丸める（特にスマホで効く）
const hissLp = AC.createBiquadFilter();
hissLp.type = "lowpass"; hissLp.frequency.value = 8500;
hissNode.connect(hissHp); hissHp.connect(hissLp); hissLp.connect(hissGain);
// ===== 最終段 mainOut：通常はステレオでdestinationへ。4ch機器接続時はch1/2(OUT A)へ差し替え =====
const mainOut=AC.createGain();
mainOut.connect(AC.destination);
hissGain.connect(mainOut);
hissNode.start();

// ===== 低域倍音エンハンサー（固定・常時ON）=====
// 低域を分離 → 偶数倍音を足す → 小さく混ぜ戻し = ふっくらした低音
// ===== FAT BASS（v0.3.114）：「この機材は音が太い」＝低域の量感＋偶数倍音。遅延ゼロ（最小位相 biquad ＋ WaveShaper）=====
// spOut（DAC出力）直後のローシェルフ +2dB @100Hz。コンプの手前に置く＝低域でコンプが呼吸する（SP的な押し出し）。
// 実測（ドラム2小節）：30〜90Hz +0.8dB / 90〜200Hz +0.3dB / 中域 −0.2dB / ピーク不変（§127）。メニュー Sound の FAT BASS で A/B。
const FAT_SHELF_DB = 2, FAT_BASS_MIX = 0.18, THIN_BASS_MIX = 0.12;
const fatShelf = AC.createBiquadFilter();
fatShelf.type = "lowshelf"; fatShelf.frequency.value = 100; fatShelf.gain.value = FAT_SHELF_DB;
spOut.connect(fatShelf);   // 以降のアウトボード（コンプ／バイパス／低域経路）は fatShelf から分岐
let fatBassOn = true;
function applyFatBass(on){
  fatBassOn = on; const t = AC.currentTime;
  fatShelf.gain.setTargetAtTime(on ? FAT_SHELF_DB : 0, t, 0.02);
  bassGain.gain.setTargetAtTime(on ? FAT_BASS_MIX : THIN_BASS_MIX, t, 0.02);
}
const bassLp = AC.createBiquadFilter();
bassLp.type = "lowpass"; bassLp.frequency.value = 150; bassLp.Q.value = 0.7;
// 偶数倍音を生む非対称waveshaper（チューブ的な温かみ）
const bassSat = AC.createWaveShaper();
const bsCurve = new Float32Array(1024);
for(let i = 0; i < 1024; i++){
  const x = i * 2 / 1024 - 1;
  bsCurve[i] = x + 0.35 * x * x;  // 非対称 = 2次倍音（偶数）が出る
}
bassSat.curve = bsCurve;
bassSat.oversample = "none";   // サブ低域のみ整形＝エイリアス不可聴。常時稼働なので軽量化
const bassGain = AC.createGain();
bassGain.gain.value = FAT_BASS_MIX;  // 偶数倍音の混ぜ量（FAT BASS ON=0.18 / OFF=0.12＝v0.3.113までの値）
// 非対称waveshaper(x+0.35x²)が生むDC/超低域オフセットを除去（25Hz HP＝可聴下、位相影響ほぼ無し）
const bassDcBlock = AC.createBiquadFilter();
bassDcBlock.type = "highpass"; bassDcBlock.frequency.value = 25; bassDcBlock.Q.value = 0.707;
// SP-DAC出力からパラレルに分岐
fatShelf.connect(bassLp);
bassLp.connect(bassSat);
bassSat.connect(bassDcBlock);
bassDcBlock.connect(bassGain);
bassGain.connect(tapeDelay);  // テープ経由で出力

// 接続（テープ質感込み）。SP-DAC段(spOut)以降がアウトボード
// comp経路: spOut → comp → satIn(0.5) → saturator → makeupGain → tapeDelay → destination
// bypass経路: spOut → bypassGain → tapeDelay → destination
// テープは常時ON（どちらの経路でもかかる）
fatShelf.connect(comp);
comp.connect(satIn);
saturator.connect(makeupGain);
makeupGain.connect(tapeDelay);
// ===== 先読みなしコンプ（AudioWorklet 'sp-comp'、v0.3.110）=====
// ブラウザ標準の DynamicsCompressorNode は仕様で約6msの先読み遅延を持つ（実測 264 frames @44.1k）。
// 手叩き→発音の予算10msのうち6msをこれが食っていた（さらにライブ叩きの一発目は並列ドライが立ち上がる前＝素通しの6ms）。
// 先読みなし（＝アナログ機と同じ。頭の一発は通す＝SP的なパンチ）で、同じ静特性（threshold/knee/ratio）と
// 同じ自動メイクアップ（Web Audio仕様の (1/fullRangeGain)^0.6）を再現。ロード成功時に spOut→comp→satIn を
// spOut→compNode→satIn に差し替え。アタックは 2ms（先読み6ms＋8msの標準ノードと実素材のRMSが ±0.5dB で一致する値。
// 8ms だと頭が素通りして +2.3dB 大きくなった）。非対応/失敗は標準ノードのまま（その場合は liveCompDuck の並列ドライが効く）。
const SP_COMP_CODE = `
class SPComp extends AudioWorkletProcessor{
  static get parameterDescriptors(){ return [
    {name:'threshold',defaultValue:-12,  minValue:-100,  maxValue:0,  automationRate:'k-rate'},
    {name:'knee',     defaultValue:12,   minValue:0,     maxValue:40, automationRate:'k-rate'},
    {name:'ratio',    defaultValue:4,    minValue:1,     maxValue:20, automationRate:'k-rate'},
    {name:'attack',   defaultValue:0.002,minValue:0.0001,maxValue:1,  automationRate:'k-rate'},
    {name:'release',  defaultValue:0.12, minValue:0.001, maxValue:1,  automationRate:'k-rate'}]; }
  constructor(){ super(); this.env=0; }
  static curve(x,th,kn,ra){   // Web Audio仕様のゲインコンピュータ（dB→dB、ソフトニー）
    const lo=th-kn/2; if(x<lo) return x;
    if(x<=th+kn/2){ const d=x-lo; return x+(1/ra-1)*d*d/(2*kn); }
    return th+(x-th)/ra;
  }
  process(inputs,outputs,p){
    const inp=inputs[0], out=outputs[0]; if(!out||!out.length) return true;
    const nf=out[0].length, nc=out.length;
    const th=p.threshold[0], kn=Math.max(1e-3,p.knee[0]), ra=p.ratio[0];
    const aA=1-Math.exp(-1/(p.attack[0]*sampleRate)), aR=1-Math.exp(-1/(p.release[0]*sampleRate));
    const makeup=Math.pow(1/Math.pow(10,SPComp.curve(0,th,kn,ra)/20),0.6);   // 仕様どおりの自動メイクアップ
    let env=this.env;
    for(let i=0;i<nf;i++){
      let pk=0; for(let c=0;c<nc;c++){ const s=inp&&(inp[c]||inp[0]); const a=s?Math.abs(s[i]):0; if(a>pk) pk=a; }
      env+=(pk-env)*(pk>env?aA:aR);                                   // ピーク検出（ステレオリンク）
      const xdb=20*Math.log10(env>1e-5?env:1e-5);
      const g=Math.pow(10,(SPComp.curve(xdb,th,kn,ra)-xdb)/20)*makeup;
      for(let c=0;c<nc;c++){ const s=inp&&(inp[c]||inp[0]); out[c][i]=s?s[i]*g:0; }
    }
    this.env=env; return true;
  }
}
registerProcessor('sp-comp',SPComp);`;
let compNode=null;   // ロード成功時のみ。threshold の操作は compThr() 経由で両実装に効く
function compThr(){ return compNode ? compNode.parameters.get('threshold') : comp.threshold; }
(function loadSpComp(){
  if(!(AC.audioWorklet && AC.audioWorklet.addModule)) return;
  const url=URL.createObjectURL(new Blob([SP_COMP_CODE],{type:"application/javascript"}));
  AC.audioWorklet.addModule(url).then(()=>{
    try{
      const n=new AudioWorkletNode(AC,'sp-comp',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
      n.parameters.get('threshold').value = comp.threshold.value;   // 現在の状態（COMP OFF=0dB）を引き継ぐ
      fatShelf.disconnect(comp); comp.disconnect(satIn);
      fatShelf.connect(n); n.connect(satIn);
      compNode=n;
    }catch(e){ /* 失敗時は標準コンプのまま */ }
    URL.revokeObjectURL(url);
  }).catch(()=>{ URL.revokeObjectURL(url); });
})();
// 最終段ソフトクリッパ：|x|<0.7は完全透過（傾き1）、以降tanhで±0.93に漸近。
// 4系統(テープ/エコー/リバーブ)の生加算がブラウザの無慈悲なデジタルクリップに当たるのを防ぎ、
// フルパターン＋アクセントでも「テープが潰れる」方向に歪む＝安心して音量を突っ込める
const finalClip = AC.createWaveShaper();
finalClip.oversample = "none";   // "2x" は 64 frames（1.5ms）の隠れ遅延（§127）。|x|<0.7 は素通しなので実害なし
finalClip.curve = (()=>{ const N=4096, c=new Float32Array(N);
  for(let i=0;i<N;i++){ const x=(i/(N-1))*2-1, a=Math.abs(x);
    c[i]=Math.sign(x)*(a<=0.7 ? a : 0.7+0.3*Math.tanh((a-0.7)/0.3)); }
  return c; })();
finalClip.connect(mainOut);
