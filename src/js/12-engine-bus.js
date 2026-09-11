// ===== OUT B（外部ミキサー2系統目＝ch3/4）：KO Sidekick等の4ch以上出力機器で有効 =====
// OUT Bはドライ送り（12bit/パッドフィルター/エンベロープ後、グループFX・コンプ・テープの前）＝外部ミキサー側で処理する前提
const outBGain=AC.createGain();
let multiOut=false, _outMerger=null;
function initMultiOut(){
  if(multiOut) return;
  try{
    if((AC.destination.maxChannelCount||2)<4) return;   // ステレオ機器＝従来どおり全てOUT A
    AC.destination.channelCount=4;
    AC.destination.channelCountMode="explicit";
    AC.destination.channelInterpretation="discrete";
    const mg=_outMerger=AC.createChannelMerger(4);
    mainOut.disconnect(AC.destination);
    mainOut.connect(mg,0,0); mainOut.connect(mg,0,1);     // OUT A = ch1/2（マスターFX込み）
    outBGain.connect(mg,0,2); outBGain.connect(mg,0,3);   // OUT B = ch3/4（ドライ）
    mg.connect(AC.destination);
    multiOut=true;
    sampNameEl.textContent="MULTI OUT — OUT B (ch3/4) 有効";
  }catch(e){}
}
// 自動有効化は廃止（v0.3.72）: S2400等「USBオーディオ機器でもあるハード」接続時に
// 起動時のchannelCount/discrete強制がドライバを巻き込みフリーズする事故があったため、メニューから明示ONのみ
tapeDelay.connect(finalClip);

// バイパス経路（OFF時）もテープを通す
let compOn = true;
const bypassGain = AC.createGain();
bypassGain.gain.value = 0;
fatShelf.connect(bypassGain);
bypassGain.connect(tapeDelay);  // bypass経路もテープを通す

// ライブ叩き（fromSeq=false）の瞬間はコンプを自動バイパス＝先読み遅延(約6ms)を回避。
// 手が止まって1.5s後に滑らかに復帰。経路は常時両接続なのでゲインのフェードだけ＝クリックなし
let _liveDuck=false, _liveDuckT=null;
function _rampCompRouting(on, tc){
  const t=AC.currentTime;
  if(on){
    compThr().setTargetAtTime(compThreshold, t, tc);
    makeupGain.gain.setTargetAtTime(compMakeup, t, tc);
    bypassGain.gain.setTargetAtTime(0, t, tc);
  } else {
    compThr().setTargetAtTime(0, t, tc);      // 閾値0dB＝実質かからない
    makeupGain.gain.setTargetAtTime(0, t, tc);
    bypassGain.gain.setTargetAtTime(1.0, t, tc);   // ON時の平均メイクアップ相当＝A/B音量差を縮める
  }
}
// ライブ叩き時は「全バイパス」ではなく**パラレルコンプ**でドライを少し混ぜるだけ（v0.3.74）。
// 旧実装は完全バイパス＝コンプが効いている瞬間に切替わると逆に+4dB近く持ち上がり「変なダッキング」に聞こえた。
// ドライを混ぜれば、アタックはドライ経路から先に届く＝先読み遅延の体感は消えるのに、音量/質感の段差はほぼ無い。
const LIVE_DRY=0.35;   // ドライ混合量（0=無効, 1=全バイパス）。レベル差は実測±1dB程度に収まる
function liveCompDuck(){
  if(!compOn) return;                                   // ユーザーがCOMP OFFなら関与しない
  if(compNode) return;                                  // 先読みなしコンプ（worklet）なら遅延ゼロ＝並列ドライは不要（v0.3.110）
  if(!_liveDuck){
    _liveDuck=true;
    const t=AC.currentTime;
    compThr().setTargetAtTime(compThreshold, t, 0.02);        // 閾値は動かさない＝コンプの効き自体は保つ
    makeupGain.gain.setTargetAtTime(compMakeup*(1-LIVE_DRY), t, 0.025);
    bypassGain.gain.setTargetAtTime(LIVE_DRY, t, 0.025);           // 25ms＝段差を感じない速さ
  }
  clearTimeout(_liveDuckT);
  _liveDuckT=setTimeout(()=>{ _liveDuck=false; if(compOn) _rampCompRouting(true, 0.18); }, 1200);   // 180msでそっと戻す
}
function setCompBypass(on){
  compOn = on;
  clearTimeout(_liveDuckT); _liveDuck=false;   // 手動切替はライブ自動バイパスの予約より優先
  const t=AC.currentTime;
  compThr().cancelScheduledValues(t); makeupGain.gain.cancelScheduledValues(t); bypassGain.gain.cancelScheduledValues(t);
  if(on){
    compThr().setValueAtTime(compThreshold, t);
    makeupGain.gain.setValueAtTime(compMakeup, t);
    bypassGain.gain.setValueAtTime(0, t);
  } else {
    compThr().setValueAtTime(0, t);
    makeupGain.gain.setValueAtTime(0, t);
    bypassGain.gain.setValueAtTime(1.0, t);
  }
}
let compThreshold = -12;
let compDrive = 1.5;
let compMakeup = 1.2;

// ===== グループバス（4ch×4をまとめて音量）：voices → groupBus[g] → masterGain =====
// グループ割り当て（パッド並びに一致）: g0=サンプル1-4, g1=サンプル5-8(上段), g2=ドラム9-12, g3=ドラム13-16(下段)
const GROUP_OF = new Array(16);
[0,1,2,3].forEach(i=>GROUP_OF[i]=0);
[4,5,6,7].forEach(i=>GROUP_OF[i]=1);
[8,9,10,11].forEach(i=>GROUP_OF[i]=2);
[12,13,14,15].forEach(i=>GROUP_OF[i]=3);
const groupVol=[0,0,0,0];   // dB（PADを上下ドラッグで変化）
const groupBus=[0,1,2,3].map(()=>AC.createGain());   // voices→groupBus(音量)→[SPチャンネルフィルター]→masterGain
function applyGroupVol(){ for(let g=0;g<4;g++) groupBus[g].gain.value=Math.pow(10,groupVol[g]/20); }

// ===== SP-1200風「出力チャンネル別フィルター」＝SSM2044(4極OTAローパスVCF)のモデリング =====
// 実機SP-1200は出力chに SSM2044(Solid State Micro Technology製 4-pole OTA VCF/24dB/oct) を持ち、
// 丸さ・粘り・歪みを生む。これを Web Audio で「回路モデリング」する。
//   - ネイティブ BiquadFilter ではラダーのゼロ遅延帰還が作れない（ノード経由帰還=128サンプル遅延で破綻）
//     → AudioWorklet でサンプル単位に解く（loadSSM）。
//   - モデル：OTAラダー＝4段の1次LP直列＋最終段から入力への共振帰還。各段に tanh 非線形(OTAの transconductance
//     飽和)を入れる＝SSM2044特有のクリーミーな歪み/自己発振。2xオーバーサンプリングで非線形の折返しを低減。
//   - 非対応ブラウザ/ロード失敗時は biquad の近似(直列LP)へ自動フォールバック。
// 4グループへの割り当て(SP-1200の出力chゾーン翻訳)：サンプル群(g0/g1)=明るい(高カットオフ/低レゾ)、
//   ドラム群(g2/g3)=丸める(低カットオフ/4極/レゾ)。g2は発音毎にカットオフが開いて閉じる(ch1-2のダイナミック)。
// フィールド: cut=カットオフHz / poles,q=biquadフォールバック用 / res=共振0..4,drive=入力ドライブ(SSM2044用) / dyn=発音時に開く量Hz。
const SP_CH = [
  {cut:15000, poles:1, q:0.5,  res:0.15, drive:0.9,  dyn:0},     // g0 SMP1-4 : bright（ザラつき/明るさ残す）
  {cut:12000, poles:1, q:0.6,  res:0.30, drive:1.0,  dyn:0},     // g1 SMP5-8 : やや丸め
  {cut:5200,  poles:2, q:0.95, res:1.35, drive:1.5,  dyn:3800},  // g2 DR9-12 : 4極で丸め＋発音毎ダイナミック開閉
  {cut:6200,  poles:2, q:0.85, res:1.05, drive:1.25, dyn:1500},  // g3 DR13-16: 4極丸め＋小さめのダイナミック開閉（スネア/パーカスのアクセントが立つ）
];
const grpOut=[0,1,2,3].map(()=>{ const g=AC.createGain(); g.connect(masterGain); return g; });  // 安定末端→master（フィルタ実体を差し替えても不変）
const grpBiquad=[];     // フォールバック用 biquad 直列配列（[0]=ダイナミック自動化対象）
const ssmNode=[];       // SSM2044 worklet ノード（ロード成功時のみ。[0]がダイナミック自動化対象）
const grpInputNode=[];  // ON時に groupBus を繋ぐ先（初期=biquad先頭、worklet成功後=ssmNode）
let spChFilterOn=true;
(function buildBiquadFallback(){
  for(let g=0;g<4;g++){
    const cfg=SP_CH[g], nodes=[];
    for(let p=0;p<cfg.poles;p++){
      const bq=AC.createBiquadFilter(); bq.type="lowpass";
      bq.frequency.value=cfg.cut; bq.Q.value=(p===0?cfg.q:0.5);
      nodes.push(bq);
    }
    for(let k=0;k<nodes.length-1;k++) nodes[k].connect(nodes[k+1]);   // 直列
    nodes[nodes.length-1].connect(grpOut[g]);
    grpBiquad[g]=nodes; grpInputNode[g]=nodes[0];
  }
})();
// groupBus の出力先を ON=フィルター入口 / OFF=末端直結(素通し) で切替
function applySpChFilter(){
  for(let g=0;g<4;g++){
    try{ groupBus[g].disconnect(); }catch(_){}
    groupBus[g].connect((spChFilterOn && grpInputNode[g]) ? grpInputNode[g] : grpOut[g]);
  }
}
applySpChFilter();
// 発音毎にカットオフを開いて閉じる（SSM2044のエンベロープ駆動ダイナミックフィルター）。ssm優先・無ければbiquad。
function spDynOpen(g, when, accent){
  if(!spChFilterOn) return;
  const cfg=SP_CH[g]; if(!(cfg.dyn>0)) return;
  const p = ssmNode[g] ? ssmNode[g].parameters.get('cutoff')
          : (grpBiquad[g] && grpBiquad[g][0]) ? grpBiquad[g][0].frequency : null;
  if(!p) return;
  p.cancelScheduledValues(when);
  p.setValueAtTime(cfg.cut+cfg.dyn*(accent?1.5:1), when);   // アタックで開く。アクセントは1.5倍開く＝「大きい」でなく「強い」音に
  p.setTargetAtTime(cfg.cut, when+0.004, 0.06);   // 60ms時定数で閉じる（クリック無し）
}
// ===== SSM2044 worklet ロード（非同期。成功で biquad → 非線形OTAラダー へ差し替え）=====
(function loadSSM(){
  if(!(AC.audioWorklet && AC.audioWorklet.addModule)) return;   // 非対応→biquadのまま
  const code = `
class SSM2044 extends AudioWorkletProcessor {
  static get parameterDescriptors(){
    return [
      {name:'cutoff', defaultValue:6000, minValue:20,  maxValue:20000, automationRate:'a-rate'},
      {name:'reso',   defaultValue:1.0,  minValue:0,   maxValue:4.2,   automationRate:'k-rate'},
      {name:'drive',  defaultValue:1.0,  minValue:0.1, maxValue:4,     automationRate:'k-rate'}
    ];
  }
  constructor(){
    super();
    this.bypass=false;
    this.z=[new Float64Array(4), new Float64Array(4)];  // 各ch 4段の積分器状態
    this.xp=[0,0];                                       // 2xアップサンプル用の前サンプル
    this.port.onmessage=(e)=>{ if(e.data && 'bypass' in e.data) this.bypass=!!e.data.bypass; };
  }
  process(inputs, outputs, params){
    const input=inputs[0], output=outputs[0];
    if(!output || !output.length) return true;
    const nf=output[0].length, nc=output.length;
    if(this.bypass){ for(let ch=0;ch<nc;ch++){ const ip=input&&(input[ch]||input[0]); const o=output[ch]; if(ip)o.set(ip); else o.fill(0);} return true; }
    const cutA=params.cutoff, resA=params.reso, drvA=params.drive;
    const cutK=cutA.length===1, resK=resA.length===1, drvK=drvA.length===1;
    const fsOs=sampleRate*2, TWO_PI=6.283185307179586;   // 2xオーバーサンプリング
    const th=Math.tanh;
    for(let ch=0; ch<nc; ch++){
      const ip=input && (input[ch]||input[0]);
      const o=output[ch];
      let z=this.z[ch]; if(!z){ z=this.z[ch]=new Float64Array(4); }
      let xp=this.xp[ch]||0;
      const res0=resK?resA[0]:0, drv0=drvK?drvA[0]:0, cut0=cutK?cutA[0]:0;
      for(let i=0;i<nf;i++){
        const x=ip?ip[i]:0;
        let fc=cutK?cut0:cutA[i]; if(fc<20)fc=20; const fcMax=fsOs*0.45; if(fc>fcMax)fc=fcMax;
        const res=resK?res0:resA[i], drv=drvK?drv0:drvA[i];
        let g=TWO_PI*fc/fsOs; if(g>0.99)g=0.99;            // 積分器ゲイン。tanhが全段を有界化し安定
        let out=0;
        for(let s=0;s<2;s++){
          const xs=(s===0)?(xp+(x-xp)*0.5):x;              // 線形アップサンプル(中点→現在)
          const u=th(xs*drv) - res*z[3];                   // 入力ドライブ＋最終段からの共振帰還
          z[0]+=g*(th(u)    - th(z[0]));                   // OTAラダー：各段 tanh 飽和
          z[1]+=g*(th(z[0]) - th(z[1]));
          z[2]+=g*(th(z[1]) - th(z[2]));
          z[3]+=g*(th(z[2]) - th(z[3]));
          out+=z[3];
        }
        o[i]=out*0.5;                                       // 2サブサンプル平均でデシメート
        xp=x;
      }
      this.z[ch]=z; this.xp[ch]=xp;
    }
    return true;
  }
}
registerProcessor('ssm-2044', SSM2044);`;
  const url=URL.createObjectURL(new Blob([code],{type:"application/javascript"}));
  AC.audioWorklet.addModule(url).then(()=>{
    try{
      for(let g=0;g<4;g++){
        // 上物（サンプル群 g0/g1＝PAD上段）は SSM2044 をバイパス＝直結。
        // 音声スレッドの worklet を 4→2 に半減し、低レイテンシ化（ドラム群 g2/g3 のみ SSM2044）。
        if(g<2){ grpInputNode[g]=grpOut[g]; continue; }
        const cfg=SP_CH[g];
        const n=new AudioWorkletNode(AC,'ssm-2044',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[2]});
        n.parameters.get('cutoff').value=cfg.cut;
        n.parameters.get('reso').value=cfg.res;
        n.parameters.get('drive').value=cfg.drive;
        n.connect(grpOut[g]);
        ssmNode[g]=n; grpInputNode[g]=n;        // 入口を SSM2044 に差し替え
      }
      applySpChFilter();                         // groupBus → (g2/g3=SSM2044 / g0/g1=直結) へ再ルーティング
    }catch(e){ /* 失敗時は biquad のまま */ }
    URL.revokeObjectURL(url);
  }).catch(()=>{ URL.revokeObjectURL(url); });
})();

