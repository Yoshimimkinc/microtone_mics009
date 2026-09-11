// ===== プリセット音をオフラインで生成して各パッドに焼き込む =====
async function renderPreset(voice){
  const dur = 1.2, sr = AC.sampleRate;
  const off = new OfflineAudioContext(1, Math.ceil(sr*dur), sr);
  const out = off.destination;
  const now = 0;
  const noiseBuf = (len)=>{
    const b=off.createBuffer(1,Math.ceil(sr*len),sr);
    const d=b.getChannelData(0);
    for(let n=0;n<d.length;n++) d[n]=Math.random()*2-1;
    return b;
  };
  const env=(node,a,dcy,peak=1)=>{
    const g=off.createGain();node.connect(g);
    g.gain.setValueAtTime(0,now);
    g.gain.linearRampToValueAtTime(peak,now+a);
    g.gain.exponentialRampToValueAtTime(0.0001,now+a+dcy);
    return g;
  };
  if(voice==="kick"){
    const o=off.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(150,now);o.frequency.exponentialRampToValueAtTime(45,now+.12);
    env(o,.001,.4,1).connect(out);o.start(now);o.stop(now+.5);
  } else if(voice==="snare"){
    const o=off.createOscillator();o.type="triangle";o.frequency.setValueAtTime(180,now);
    env(o,.001,.12,.6).connect(out);o.start(now);o.stop(now+.2);
    const n=off.createBufferSource();n.buffer=noiseBuf(.3);
    const hp=off.createBiquadFilter();hp.type="highpass";hp.frequency.value=1200;
    n.connect(hp);env(hp,.001,.18,.8).connect(out);n.start(now);
  } else if(voice==="hat"||voice==="ohat"){
    const open=voice==="ohat";
    const n=off.createBufferSource();n.buffer=noiseBuf(open?.4:.1);
    const hp=off.createBiquadFilter();hp.type="highpass";hp.frequency.value=7000;
    n.connect(hp);env(hp,.001,open?.3:.04,.5).connect(out);n.start(now);
  } else if(voice==="clap"){
    const n=off.createBufferSource();n.buffer=noiseBuf(.3);
    const bp=off.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1200;bp.Q.value=2;
    n.connect(bp);env(bp,.001,.2,.7).connect(out);n.start(now);
  } else if(voice==="rim"){
    const o=off.createOscillator();o.type="square";o.frequency.value=420;
    const bp=off.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1700;bp.Q.value=6;
    o.connect(bp);env(bp,.001,.05,.5).connect(out);o.start(now);o.stop(now+.1);
  } else if(voice==="tom"){
    const o=off.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(220,now);o.frequency.exponentialRampToValueAtTime(90,now+.2);
    env(o,.001,.3,.9).connect(out);o.start(now);o.stop(now+.4);
  } else if(voice==="perc"){
    // サイン波ベースの音階パーカッション（コンガ/トム的・チューンしやすい）
    const o=off.createOscillator();o.type="sine";
    o.frequency.setValueAtTime(520,now);o.frequency.exponentialRampToValueAtTime(190,now+.12);
    const o2=off.createOscillator();o2.type="sine";o2.frequency.value=780;  // 倍音を薄く
    const g2=off.createGain();g2.gain.value=0.18;o2.connect(g2);g2.connect(out);
    env(o,.001,.24,.6).connect(out);
    o.start(now);o2.start(now);o.stop(now+.32);o2.stop(now+.06);
  } else if(voice==="sinbass"){
    // サイン波ベース（C2≈65.4Hz・一定振幅）。整数周期でループすればシームレス（プツらない）
    const o=off.createOscillator();o.type="sine";o.frequency.value=65.4;
    const o2=off.createOscillator();o2.type="sine";o2.frequency.value=130.8;  // 2倍音で少し太く
    const g=off.createGain();g.gain.value=0.82;o.connect(g);g.connect(out);
    const g2=off.createGain();g2.gain.value=0.16;o2.connect(g2);g2.connect(out);
    o.start(now);o2.start(now);o.stop(now+.5);o2.stop(now+.5);
  }
  const rendered = await off.startRendering();
  return rendered;
}

// バッファの実際の鳴ってる終端（無音手前）を 0..1 で返す
function contentEnd(buf){
  const d=buf.getChannelData(0), n=d.length, thr=0.004;
  let last=0; for(let k=n-1;k>=0;k--){ if(Math.abs(d[k])>thr){ last=k; break; } }
  return Math.max(0.05, Math.min(1, last/n + 0.03));   // 少し余白
}
async function loadPresets(){
  // 順次awaitせず全プリセットを並列生成→ブート高速化
  await Promise.all(PADS.map(async (p,i)=>{
    if(p.type!=="synth") return;
    try{
      const raw = await renderPreset(p.voice);
      tracks[i].rawBuffer = raw;
      tracks[i].buffer = makeLofi(raw);   // 12bit/レート低下を焼き込む
      tracks[i].end = contentEnd(tracks[i].buffer);   // 無音を切ってENDを実音長に
      if(p.voice==="sinbass"){   // 最初からループON＋整数周期のループ点でプツらせない
        const dur=tracks[i].buffer.duration, per=1/65.4;
        tracks[i].loop=true; tracks[i].start=0;
        tracks[i].loopStart=Math.min(0.9,(8*per)/dur);
        tracks[i].end=Math.min(1,(24*per)/dur);
      }
    }catch(e){console.warn("preset fail",i,e);}
  }));
}

