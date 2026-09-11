// ===== Web MIDI入力：USB鍵盤/パッドコントローラーで演奏 =====
// ノート60-75(C4=中央のド=パッド1)→パッド1-16(vel>=100でアクセント) / それ以外→選択パッドを半音演奏(60=原音)
// 対応: PC/MacのChrome・Edge、Android Chrome。iOS SafariはWeb MIDI非対応
let midiEnabled=false;   // ハードに触る機能は必ず明示ON（§88の教訓をMIDI入力にも適用）
let midiSync=false;      // MIDI SYNC＝外部クロック追従（S2400等に合わせる）。要明示ON
let _ckTimes=[], _ckUiT=0;
function handleClock(b0){
  if(b0===0xFA||b0===0xFB){ _ckTimes=[]; if(!playing) playBtn.click(); return; }   // Start/Continue＝頭から再生
  if(b0===0xFC){ if(playing) playBtn.click(); return; }                            // Stop
  if(b0!==0xF8) return;
  const now=performance.now();
  if(_ckTimes.length){
    const dt=now-_ckTimes[_ckTimes.length-1];
    if(dt<=0 || dt>200){ _ckTimes=[now]; return; }   // 途切れ・外れ値はリセット（40BPM相当=62.5msが下限側）
  }
  _ckTimes.push(now);
  if(_ckTimes.length>49) _ckTimes.shift();
  if(_ckTimes.length>=25){   // 1拍(24クロック)ぶん以上たまったら平均間隔からBPM推定
    const span=_ckTimes[_ckTimes.length-1]-_ckTimes[0];
    const bpm=60000/((span/(_ckTimes.length-1))*24);
    if(bpm>=40 && bpm<=250 && Math.abs(bpm-bpmVal)>0.3){
      bpmVal=Math.round(bpm*10)/10;
      const bi=document.getElementById("bpm"); if(bi) bi.value=bpmVal;
      const br=document.getElementById("bpmRead"); if(br) br.textContent=bpmVal.toFixed(1);
      if(typeof setDelayTempo==="function") setDelayTempo();
      if(typeof paintPerf==="function") paintPerf();   // PerformanceのBPM表示が固まらないように
      if(!_ckUiT){ _ckUiT=1; sampNameEl.textContent="SYNC — EXT CLOCK"; }   // 告知は最初の1回だけ。以後BPM表示だけ静かに追従
    }
  }
}
let _midiNoteTimes=[];   // 洪水ガード: 外部シーケンサー(S2400等)のノート連射で発音エンジンを潰さない
function midiNoteName(n){ return ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][n%12]+(Math.floor(n/12)-1); }
function midiBlink(note){ inBlink(midiNoteName(note)); }
// 鍵盤でもPCキーでも「入った」ことが分かるランプ。メニュー内のMIDI IN と情報窓ASSIGNページの両方を光らせる
function inBlink(label){
  const mb=document.getElementById("menuBtn"), cm=document.getElementById("clMon");   // メニューの MIDI IN 表示は撤去（窓の着信ランプに一本化）
  if(mb) mb.classList.add("midi-lit");
  if(cm){ cm.classList.add("lit"); cm.querySelector("b").textContent=label; }
  clearTimeout(_ledT);
  _ledT=setTimeout(()=>{ if(mb) mb.classList.remove("midi-lit"); if(cm) cm.classList.remove("lit"); },130);
}
// ASSIGN待機中に別のパッドを選んだら、的をそちらへ移す（窓は選択パッドを映しているので的がズレると嘘になる）
function clRetargetLearn(){ if(assignTarget>=0 && assignTarget!==selected) assignTarget=selected; }
// ASSIGNの共通処理: 種別(midiNote|key)を問わず「二重割り当てを作らず記憶し、UIとトーストを更新」
function assignTo(pad, field, value, label){
  pushUndo();   // 奪う前に撮る＝Undoで元パッドの割り当ても戻る
  const dup=tracks.findIndex((t,j)=>j!==pad && t[field]===value);
  if(dup>=0) tracks[dup][field]=null;   // 同じ鍵盤/キーの二重割り当ては作らない
  tracks[pad][field]=value;
  assignTarget=-1;
  if(typeof paintClPage==="function") paintClPage();   // 窓から学習した時もここで反映（peTargetと無関係）
  if(typeof paintPadStates==="function") paintPadStates();   // パッド右下のキー表示も更新
  sampNameEl.textContent="ASSIGN — PAD "+String(pad+1).padStart(2,"0")+" ← "+label;
}
function handleMIDI(data){
  // クロックはノート入力のON/OFFと独立（MIDI入力OFFでもSYNCは生きる＝トグルの点灯が嘘をつかない）
  if(data[0]>=0xF8){ if(midiSync) handleClock(data[0]); return; }
  const st=data[0]&0xF0, note=data[1], vel=data[2];
  if(st!==0x90 || !vel) return;   // Note On のみ
  midiBlink(note);   // 着信は入力OFFでも必ず光らせる＝繋がっているか目で分かる
  if(assignTarget>=0){ assignTo(assignTarget,"midiNote",note,midiNoteName(note)); return; }   // ASSIGN待機中＝鳴らさずに記憶
  if(!midiEnabled) return;
  const now=performance.now();
  _midiNoteTimes.push(now);
  while(_midiNoteTimes.length && now-_midiNoteTimes[0]>1000) _midiNoteTimes.shift();
  if(_midiNoteTimes.length>45){   // 1秒に45ノート超＝人間の演奏ではない→自動OFF（フリーズ防止）
    midiEnabled=false; _midiNoteTimes=[];
    const mt2=document.getElementById("midiToggle"); if(mt2) mt2.classList.remove("on");
    sampNameEl.textContent="MIDI STORM — 連射を検出、入力を止めた";
    return;
  }
  if(AC.state!=="running") AC.resume();
  const asg=tracks.findIndex(t=>t.midiNote===note);                // 割り当て済みが最優先
  if(asg>=0) trigger(asg, null, vel>=100);
  else if(note>=60 && note<=75) trigger(note-60, null, vel>=100);   // 既定: C4(中央のド)=パッド1
  else { playVoice(selected, AC.currentTime, vel>=100, false, note-60); flashPad(selected); }
}
(function initMIDI(){
  if(!navigator.requestMIDIAccess) return;
  navigator.requestMIDIAccess().then(ma=>{
    const hook=inp=>{ inp.onmidimessage=ev=>handleMIDI(ev.data); };
    ma.inputs.forEach(hook);
    ma.onstatechange=e=>{
      if(e.port && e.port.type==="input" && e.port.state==="connected"){
        hook(e.port); sampNameEl.textContent="MIDI IN — "+((e.port.name||"DEVICE").toUpperCase())+(midiEnabled?"":"（メニューでONにすると鳴らせる）");
      }
    };
    // 起動直後のトーストは出さない（機材はケーブルを挿しただけで喋らない）。接続はstatechangeでのみ知らせる
  }).catch(()=>{});
})();

