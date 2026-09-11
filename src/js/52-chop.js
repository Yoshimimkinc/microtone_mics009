// ===== CHOP（EDITモーダル内のスライス展開）：状態とヘルパー =====
let chopTarget=-1, chopMode="time", chopDivN=8, chopSens="mid", chopBounds=[];
function syncChopSeg(id,attr,val){
  [...document.getElementById(id).children].forEach(b=>b.classList.toggle("on",b.dataset[attr]===val));
}
// アタック検出（複数オンセット）：感度で立ち上がり閾値を変える。最大16スライス。
function detectOnsets(t,s,e,sens){
  const data=t.buffer.getChannelData(0), L=data.length, sr=t.buffer.sampleRate;
  const win=Math.max(4,Math.round(sr*0.005)), hop=Math.max(1,Math.round(sr*0.003));
  const a=Math.max(0,Math.floor(s*L)), b=Math.min(L-win,Math.floor(e*L));
  const rms=p=>{let x=0;for(let n=0;n<win;n++){const v=data[p+n]||0;x+=v*v;}return Math.sqrt(x/win);};
  const env=[]; for(let p=a;p<b;p+=hop) env.push({p,r:rms(p)});
  let peak=0; for(const o of env) if(o.r>peak) peak=o.r;
  if(peak<=0) return [];
  const th=peak*({low:0.5,mid:0.32,high:0.18}[sens]||0.32);
  const minGap=Math.round(sr*0.06);            // 60ms以内の連続検出は1つに
  const out=[]; let lastP=-1e9, armed=true;
  for(let k=1;k<env.length;k++){
    const cur=env[k].r, prev=env[k-1].r;
    if(armed && cur>=th && cur>prev && (env[k].p-lastP)>=minGap){ out.push(env[k].p/L); lastP=env[k].p; armed=false; }
    if(cur<th*0.6) armed=true;                  // 谷を通ったら次の立ち上がりを拾う
  }
  return out;
}
function computeChopBounds(){
  const t=tracks[chopTarget]; if(!t||!t.buffer){ chopBounds=[]; return; }
  if(chopMode==="time" && chopDivN<2){   // OFF＝プレビューなし
    chopBounds=[];
    const b0=document.getElementById("edChopTxt"); if(b0) b0.textContent="CHOP";
    return;
  }
  const s=t.start||0, e=(t.end??1);
  let bs;
  if(chopMode==="time"){
    bs=[]; for(let k=0;k<=chopDivN;k++) bs.push(s+(e-s)*k/chopDivN);
  } else {
    const on=detectOnsets(t,s,e,chopSens).filter(o=>o>s+0.001 && o<e-0.001);
    bs=[...new Set([s,...on,e])].sort((x,y)=>x-y);
    if(bs.length>17) bs=bs.slice(0,16).concat([e]);   // 16スライス上限
  }
  chopBounds=bs;
  const N=Math.max(1,bs.length-1), anchor=chopAnchor(N);
  const b=document.getElementById("edChopTxt");
  if(b) b.textContent="CHOP "+String(anchor+1).padStart(2,"0")+"–"+String(anchor+N).padStart(2,"0");   /* 短縮＝1行に収める（個数はセグ選択で自明）*/
}
function chopAnchor(N){ return Math.max(0, Math.min(chopTarget, 16-N)); }
function applyChop(){
  const bounds=chopBounds, N=bounds.length-1; if(N<1) return;
  pushUndo();
  const src=tracks[chopTarget];
  const snap={buffer:src.buffer, rawBuffer:src.rawBuffer, tune:src.tune, filter:src.filter, cutoff:src.cutoff, reso:src.reso, vol:src.vol,
              type:(PADS[chopTarget].type==="empty"?"sample":PADS[chopTarget].type), voice:PADS[chopTarget].voice};
  const base=chopBaseName(chopTarget);
  const anchor=chopAnchor(N);
  const grp=nextChokeGroup; nextChokeGroup = nextChokeGroup>=8 ? 2 : nextChokeGroup+1; // 全スライス同一チョーク＝モノ（前を切る）
  for(let k=0;k<N;k++){
    const idx=anchor+k, d=tracks[idx];
    d.buffer=snap.buffer; d.rawBuffer=snap.rawBuffer;
    d.tune=snap.tune; d.filter=snap.filter; d.cutoff=snap.cutoff; d.reso=snap.reso; d.vol=snap.vol;
    d.loop=false; d.loopStart=0;
    d.start=bounds[k]; d.end=Math.max(bounds[k]+0.0005, bounds[k+1]);
    d.choke=grp; d.name=base+" "+(k+1);
    PADS[idx].type=snap.type; PADS[idx].voice=snap.voice;
    refreshPadDisplay(idx);
  }
  selectPad(anchor);
  sampNameEl.textContent="CHOP → PAD "+String(anchor+1).padStart(2,"0")+"–"+String(anchor+N).padStart(2,"0")+"  ↩で戻せる";
  // 展開したらモーダルを閉じて結果（パッド）を見せる（EDIT統合/旧スタンドアロン両対応）
  const pem=document.getElementById("padEditModal"); if(pem) pem.style.display="none";
}

// tempo / swing / vol
const bpm=document.getElementById("bpm"),bpmRead=document.getElementById("bpmRead");
bpm.addEventListener("pointerdown",()=>pushUndo());
// テンポ変更の唯一の書き込み口。再生中は「次に鳴るステップの時刻」を動かさずに基準を張り替える。
// これが無いと、下げる方向では小節頭から新テンポで再計算されて次ステップが未来へ飛び、最大1小節近い無音が出た。
function applyBpm(v){
  v=Math.max(40, Math.min(250, +v)); if(!isFinite(v)) return;
  const wasPlaying=(typeof playing!=="undefined"&&playing) && typeof stepTimeClean==="function";
  const anchor = wasPlaying ? stepTimeClean(stepIdx) : 0;   // 変更前の「次ステップ」の絶対時刻
  bpmVal=v;
  if(wasPlaying) barStartTime += anchor - stepTimeClean(stepIdx);   // 次ステップの時刻を据え置く＝位相維持
  bpm.value=bpmVal; bpmRead.textContent=bpmVal.toFixed(1);
  if(typeof setDelayTempo==="function") setDelayTempo();
  if(typeof paintPerf==="function") paintPerf();
}
bpm.addEventListener("input",()=>applyBpm(+bpm.value));
const swing=document.getElementById("swing"),swingVal=document.getElementById("swingVal");
swing.addEventListener("pointerdown",()=>pushUndo());
swing.addEventListener("change",()=>{
  swingPct=+swing.value;
  const eff=effectiveSwing();
  // 24PPQ丸めの実効値が選択値と違うときだけ→表示（SPの粗さの可視化）
  swingVal.textContent = (Math.abs(eff-swingPct)>0.5) ? ("→"+eff+"%") : "";
  if(typeof paintPerf==="function") paintPerf();
});

// tap tempo: 直近4タップの平均間隔。2秒空いたらリセット
const tapBtn=document.getElementById("tap");
let taps=[];
tapBtn.addEventListener("pointerdown",()=>{
  const now=performance.now();
  if(taps.length && now-taps[taps.length-1]>2000) taps=[];
  taps.push(now);
  if(taps.length>4) taps.shift();
  if(taps.length>=2){
    const iv=(taps[taps.length-1]-taps[0])/(taps.length-1);
    const newBpm=Math.min(180,Math.max(60, 60000/iv));
    applyBpm(Math.round(newBpm*10)/10);   // タップテンポも同じ入口を通す（再生中の位相維持）
  }
  tapBtn.classList.add("on");setTimeout(()=>tapBtn.classList.remove("on"),90);
});
const vol=document.getElementById("vol"),volVal=document.getElementById("volVal");
vol.addEventListener("input",()=>{tracks[selected].vol=+vol.value;volVal.textContent=vol.value;});

// LOADボタン → file inputを明示的に開く
document.getElementById("loadBtn").addEventListener("click",()=>{
  pickCaptureTarget();
  document.getElementById("samp").click();
});

// sample load → 選択パッドのバッファを差し替え（プリセット上書き）
document.getElementById("samp").addEventListener("change",async(e)=>{
  const f=e.target.files[0];
  e.target.value="";   // 同じファイルを選び直してもchangeが発火するようリセット
  if(!f)return;
  if(AC.state!=="running") await AC.resume();
  // 診断ログ（実機で何が起きたか確定させるため画面に出す）
  const dbg=["type="+(f.type||"?"), (f.size/1048576).toFixed(2)+"MB"];
  const show=m=>{ sampNameEl.textContent=m; };
  show("LOADING…");   // 診断値(MIME/サイズ)は出さない
  try{
    if(!f.size) throw new Error("size=0 (iCloud DL未完了かも)");
    const arr = await f.arrayBuffer();
    dbg.push("buf="+(arr?arr.byteLength:0)+"B");
    if(!arr || !arr.byteLength) throw new Error("arrayBuffer空: "+dbg.join(" "));
    let buf=null, decErr="";
    let target=selected;   // 通常デコード（即時）はLOAD時のパッドに確定
    try{ buf = await decodeAudio(arr); }
    catch(de){ decErr=(de&&de.message)?de.message:String(de); }   // iOSはnullでrejectすることがある
    dbg.push(buf?("decode="+buf.length+"smp/"+buf.duration.toFixed(1)+"s/silent="+isSilent(buf)):("decodeNG:"+decErr));
    // decode失敗 or 無音 → 実時間再生で録音抽出にフォールバック
    if(isSilent(buf)){
      show("▶ 抽出ボタンをタップ（動画の長さぶん再生されます）");
      try{ const r = await extractViaPlayback(f); buf=r.buf; target=r.target;   // ▶押下時のパッドに確定
           dbg.push("play="+(buf?buf.length+"smp/silent="+isSilent(buf):"null")); }
      catch(pe){ dbg.push("playNG:"+((pe&&pe.message)?pe.message:String(pe))); buf=null; }
    }
    if(isSilent(buf)) throw new Error("抽出不可 "+dbg.join(" "));
    pushUndo();
    tracks[target].rawBuffer = buf;
    tracks[target].buffer = makeLofi(buf);
    tracks[target].start=0; tracks[target].end=1;
    tracks[target].loop=false; tracks[target].loopStart=0;
    PADS[target].type="sample";
    applyPadCategory(target);
    tracks[target].name = f.name.slice(0,10);
    show("OK: "+f.name);
    padsEl.children[target].querySelector(".nm").textContent=f.name.slice(0,8).toUpperCase();
    selectPad(target);   // 取り込み先パッドへフォーカスを移す（抽出中に別パッドを触っていても結果が見える）
    drawPadWave(target);
    openPadEdit(target);   // 取り込み後は即EDIT＝波形で範囲(STRT/END)を指定→TRIMできる
  }catch(err){
    const m=(err&&err.message)?err.message:String(err);
    show(/size=0/.test(m) ? "EMPTY FILE — ダウンロード待ちかも"
       : /抽出不可|decodeNG/.test(m) ? "NO AUDIO — この形式は読めない"
       : "LOAD FAILED — 読み込めなかった");
    console.warn("[load]",m);   // 診断は開発者コンソールへ。客には機材語のトースト1行だけ
  }
});

// keyboard
window.addEventListener("keydown",async(e)=>{
  if(e.repeat)return;
  // Ctrl/Cmd+Z：元に戻す
  if((e.ctrlKey||e.metaKey) && (e.key==="z"||e.key==="Z")){ e.preventDefault(); doUndo(); return; }
  // TAB：PADS→SEQ→MIX を順送り（Shift+TABで逆）
  if(e.key==="Tab"){
    e.preventDefault();
    const order=["viewPads","viewSeq"];
    let cur=order.findIndex(v=>document.getElementById(v).classList.contains("active")); if(cur<0)cur=0;
    switchView(order[(cur+(e.shiftKey?-1:1)+order.length)%order.length]);
    return;
  }
  // テキスト入力/セレクトにフォーカス中はパッドキーを無効化（誤入力防止）。
  // range(スライダー)は数字/英字キーと競合しない＆触ると勝手にフォーカスされるので、パッド発音を通す。
  const ae=document.activeElement;
  if(ae && (ae.tagName==="TEXTAREA" || ae.tagName==="SELECT" ||
            (ae.tagName==="INPUT" && (ae.type||"").toLowerCase()!=="range"))) return;
  if(e.code==="Space"){e.preventDefault();playBtn.click();return;}
  if(assignTarget>=0){   // ASSIGN待機中＝次に押したキーをこのパッドに記憶（Escapeで取消・修飾キー単独は無視）
    if(e.key==="Escape"){ assignTarget=-1; sampNameEl.textContent="ASSIGN 取消";
      if(typeof paintPerf==="function") paintPerf(); return; }
    if(["Shift","Control","Alt","Meta"].includes(e.key)) return;
    e.preventDefault();
    const kk=e.key.toLowerCase();
    inBlink(kk.toUpperCase());   // 覚えた瞬間もランプで見える（MIDIと同じ作法）
    assignTo(assignTarget,"key",kk,kk.toUpperCase());
    return;
  }
  const custom=tracks.findIndex(t=>t.key===e.key.toLowerCase());   // 明示割り当ては既定キー(STEP/音階/KEYMAP)より優先
  if(custom>=0 && !e.altKey && !e.shiftKey){
    e.preventDefault();
    if(typeof inBlink==="function") inBlink(e.key.toUpperCase());
    if(AC.state!=="running")await AC.resume();
    trigger(custom); selectPad(custom,true);
    return;
  }
  // Alt+パッドキー = 選択のみ（発音せず）。Shift+パッドキー = ミュート（既定）。
  if(e.altKey){
    const ai=CODEMAP.indexOf(e.code);
    if(ai>=0){ e.preventDefault(); selectPad(ai); return; }
  }
  if(e.shiftKey){
    const mi=CODEMAP.indexOf(e.code);
    if(mi>=0){ e.preventDefault(); tracks[mi].mute=!tracks[mi].mute; paintPadStates(); if(typeof paintMixer==="function") paintMixer(); return; }
  }
  const k=e.key.toLowerCase();
  // 最下段16ステップをキーボードで打ち込み（A-K=1-8 / Z-,=9-16）。Shift=アクセント。スケール鍵盤より優先。
  const sk=STEP_KEYS.indexOf(k);
  if(sk>=0){
    e.preventDefault();
    toggleStepAt(sk, e.shiftKey);
    const on=getPattern(selected)[sk]>0;
    sampNameEl.textContent="STEP "+String(sk+1).padStart(2,"0")+(on?(getPattern(selected)[sk]===2?" ACCENT":" ON"):" OFF")+"  · "+stepTrackName();
    return;
  }
  // 音階パッド選択中：ホーム行＝クロマチック/音階鍵盤（STEPキーで消費されない L ; のみ実質有効）
  if(isMelodic(selected)){
    const mk=MELO_KEYS.indexOf(k);
    if(mk>=0){
      e.preventDefault();
      if(AC.state!=="running")await AC.resume();
      const t=tracks[selected], semi=scaleSemi(t.scale, mk);
      playVoice(selected, AC.currentTime, false, false, semi);
      if(typeof vuHit==="function") vuHit(selected,false);
      flashPad(selected);
      sampNameEl.textContent=String(selected+1).padStart(2,"0")+" "+t.name+" ♪ "+(semi>=0?"+":"")+semi;
      return;
    }
  }
  const i=KEYMAP.indexOf(k);
  if(i>=0){if(AC.state!=="running")await AC.resume();trigger(i);selectPad(i,true);}
});

// 全スライダー：タップ/クリックで確実にフォーカスし、↑↓←→キーで操作可能にする
document.querySelectorAll('input[type=range]').forEach(r=>{
  r.addEventListener("pointerdown",()=>r.focus());
});

selectPad(0);
paintPadStates();
applyGroupVol(); setDelayTempo(); applyFx();   // グループバス/FXの初期化

// 起動時：プリセット音をオフライン生成して各パッドに焼き込む
// 起動時に最初から入っているデフォルトパターン（音は組み込みプリセットを使うのでaudioは持たない＝軽量）
const DEFAULT_PROJECT = {
  version:2, bpm:100, swing:67,
  comp:{on:true, threshold:-12, drive:1.5}, masterVol:0,
  tracks:[
    // 1-4＝起動デモのフレーズ（合成→4スライス）。各ビート頭で 1→2→3→4 を鳴らすと1小節のフレーズに復元。
    {type:'sample', name:'PHRASE 1', choke:2, start:0,    end:0.25, patterns:[[1,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0]]},
    {type:'sample', name:'PHRASE 2', choke:2, start:0.25, end:0.5,  patterns:[[0,0,0,0, 1,0,0,0, 0,0,0,0, 0,0,0,0]]},
    {type:'sample', name:'PHRASE 3', choke:2, start:0.5,  end:0.75, patterns:[[0,0,0,0, 0,0,0,0, 1,0,0,0, 0,0,0,0]]},
    {type:'sample', name:'PHRASE 4', choke:2, start:0.75, end:1,    patterns:[[0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0]]},
    // 5-8＝サンプル枠（空）
    {type:'empty', name:'PAD 5'},
    {type:'empty', name:'PAD 6'},
    {type:'empty', name:'PAD 7'},
    {type:'empty', name:'PAD 8'},
    // 9-16＝デフォルトのドラム音
    {type:'synth', voice:'kick',  name:'KICK',  patterns:[[1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,1]]},
    {type:'synth', voice:'snare', name:'SNARE', patterns:[[0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0]]},
    {type:'synth', voice:'hat',   name:'HAT', choke:1, patterns:[[1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0]]},
    {type:'synth', voice:'ohat',  name:'OHAT', choke:1, patterns:[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]},
    {type:'synth', voice:'clap',  name:'CLAP',  patterns:[[0,0,0,0,0,0,0,1,0,1,0,0,1,0,0,0]]},
    {type:'synth', voice:'rim',   name:'RIM',   patterns:[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]},
    {type:'synth', voice:'tom',   name:'TOM',   patterns:[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]},
    {type:'synth', voice:'sinbass', name:'SINBASS', scale:'chro', patterns:[[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]]},
  ]
};
// 起動デモ用フレーズを合成（外部音源不要）。ローファイ・ヒップホップなエレピ(Rhodes風FM)の4コード・ストローク。
// 1小節=2.4s(100BPM)、各ビートにコード1発： Fmaj7 → Em7 → Dm7 → Cmaj7（下降の哀愁進行）。
async function renderPhrase(){
  const sr=AC.sampleRate, beat=0.6, dur=beat*4;
  const off=new OfflineAudioContext(1, Math.ceil(sr*dur), sr);
  const out=off.createGain(); out.gain.value=0.8;
  const warm=off.createBiquadFilter(); warm.type="lowpass"; warm.frequency.value=3200; warm.Q.value=0.5;  // 角を丸める＝ローファイの温かみ
  out.connect(warm); warm.connect(off.destination);
  // ビニール・クラックル（埃っぽさをネタ自体に焼き込む＝レコードから抜いたサンプル感）
  const nlen=Math.ceil(sr*dur), nb=off.createBuffer(1,nlen,sr), ndat=nb.getChannelData(0);
  for(let n=0;n<nlen;n++){ ndat[n]=(Math.random()*2-1)*0.012; if(Math.random()<0.0006) ndat[n]+=(Math.random()*2-1)*0.5; }  // 微小ヒス＋たまにパチッ
  const nsrc=off.createBufferSource(); nsrc.buffer=nb;
  const nhp=off.createBiquadFilter(); nhp.type="highpass"; nhp.frequency.value=1200;
  const ng=off.createGain(); ng.gain.value=0.6;
  nsrc.connect(nhp); nhp.connect(ng); ng.connect(warm); nsrc.start(0);
  // Rhodes風エレピ1音：FM（modが減衰して「コンッ」というtine感）＋速い減衰のアンプ
  function ep(freq, t0, amp){
    const car=off.createOscillator(); car.type="sine"; car.frequency.value=freq;
    const mod=off.createOscillator(); mod.type="sine"; mod.frequency.value=freq;     // 1:1 FM
    const md=off.createGain();
    md.gain.setValueAtTime(freq*2.4, t0);                       // アタックで倍音(tine bark)
    md.gain.exponentialRampToValueAtTime(freq*0.18, t0+0.16);   // 速く減衰して丸い持続音へ
    mod.connect(md); md.connect(car.frequency);
    const g=off.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(amp, t0+0.006);              // 速いアタック
    g.gain.exponentialRampToValueAtTime(amp*0.22, t0+0.42);     // ストローク的な減衰
    g.gain.exponentialRampToValueAtTime(0.0006, t0+beat*0.98);  // ビート内で消える＝スライス端がクリーン
    car.connect(g); g.connect(out);
    mod.start(t0); mod.stop(t0+beat); car.start(t0); car.stop(t0+beat);
  }
  const chords=[
    [174.61,220.00,261.63,329.63],  // Fmaj7  (F A C E)
    [164.81,196.00,246.94,293.66],  // Em7    (E G B D)
    [146.83,174.61,220.00,261.63],  // Dm7    (D F A C)
    [130.81,164.81,196.00,246.94],  // Cmaj7  (C E G B)
  ];
  chords.forEach((ch,i)=>{ const t0=i*beat; ch.forEach((f,vi)=>ep(f, t0, vi===0?0.20:0.15)); });  // ルートを少し前に
  return await off.startRendering();
}
// pad1-4にフレーズを4等分スライスで焼き込む（バッファ共有・モノチョーク＝スライスプレーヤー）
async function bakePhrase(){
  try{
    const raw=await renderPhrase();
    const buf=makeLofi(raw);
    for(let k=0;k<4;k++){
      const t=tracks[k];
      t.rawBuffer=raw; t.buffer=buf;
      t.start=k/4; t.end=(k+1)/4; t.loop=false; t.loopStart=0; t.tune=0; t.choke=2;
      t.name="PHRASE "+(k+1);
      PADS[k].type="sample"; PADS[k].voice=null;
      refreshPadDisplay(k);
    }
  }catch(e){ console.warn("phrase bake:", e); }
}
