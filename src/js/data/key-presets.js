// @module data/key-presets
// @provides KEY_PRESETS, keyPresetPhrase
// @uses -
// @depends -
// v0.3.207 §196：KEY の進行プリセット（コード進行ガイドの定番）。主音＝C で書き、入れる時にいまの KEY（ルート）へ移す。
// 和音 = [始まりの拍, 長さ(拍), ベース(左手のルート), [右手の音…]]。右手は C3〜C5 あたりで、次の和音へ近い音で動く形（ヴォイシング）。
// scale はプリセットを入れた時の SCALE（外の音を使う進行は、その音の行だけ残る）。
const KEY_PRESETS=[
 // v0.3.208 §197：Between the Sheets（The Isley Brothers, 1983）は原曲の進行（Hooktheory の TheoryTab：A マイナー・84 BPM）。
 // マイナーの主音＝C で書いてある（KEY を A にすれば原曲のキー＝Fmaj9 – E7(♭9) – Am7 – Gm7 – C11）。各コードの長さは目安
 {id:'sheets',group:'SLOW JAM',name:'Between the Sheets（イントロ）',degrees:'VI9 – V7(♭9) – i7 – ii7/VI – V11/VI',scale:'minor',bars:4,
  chords:[[0,4,44,[60,63,67,70]],[4,4,43,[59,65,68]],[8,4,48,[58,63,67]],[12,2,46,[56,61,65]],[14,2,51,[61,65,68]]]},
 {id:'sheetsChorus',group:'SLOW JAM',name:'Between the Sheets（サビ）',degrees:'iv7 – VII – III – i7 – iiø7',scale:'minor',bars:4,
  chords:[[0,4,41,[56,60,63]],[4,2,46,[58,62,65]],[6,2,51,[58,63,67]],[8,4,48,[58,63,67]],[12,4,50,[56,60,65]]]},
 {id:'slowjam',group:'SLOW JAM',name:'スロウ・ジャム（7th の往復）',degrees:'IVM9 – IIIm7 – IIm9 – IIIm7',scale:'major',bars:4,
  chords:[[0,4,41,[57,60,64,67]],[4,4,40,[55,59,62,64]],[8,4,38,[53,57,60,64]],[12,4,40,[55,59,62,64]]]},
 {id:'lofi2',group:'SLOW JAM',name:'Lo-fi 2 コード',degrees:'IVM9 – IIIm7',scale:'major',bars:2,
  chords:[[0,4,41,[57,60,64,67]],[4,4,40,[55,59,62,64]]]},
 {id:'twofive',group:'JAZZ',name:'ツーファイブ',degrees:'IIm9 – V13 – IM9',scale:'major',bars:4,
  chords:[[0,4,38,[53,57,60,64]],[4,4,43,[53,57,59,64]],[8,8,36,[52,55,59,62]]]},
 {id:'twofive2',group:'JAZZ',name:'ツーファイブ往復（BOOM BAP）',degrees:'IIm9 – V13',scale:'major',bars:2,
  chords:[[0,4,38,[53,57,60,64]],[4,4,43,[53,57,59,64]]]},
 {id:'minor251',group:'JAZZ',name:'マイナーのツーファイブ',degrees:'IIm7♭5 – V7♭9 – Im9',scale:'minor',bars:4,
  chords:[[0,4,38,[53,56,60]],[4,4,43,[53,56,59]],[8,8,36,[51,55,58,62]]]},
 {id:'circle',group:'JAZZ',name:'循環（4 小節で回る）',degrees:'IIIm7 – VI7 – IIm7 – V7',scale:'major',bars:4,
  chords:[[0,4,40,[55,59,62]],[4,4,45,[55,61,64]],[8,4,38,[53,57,60]],[12,4,43,[53,59,62]]]},
 {id:'komuro',group:'J-POP',name:'小室進行',degrees:'VIm – IV – V – I',scale:'major',bars:4,
  chords:[[0,4,45,[57,60,64]],[4,4,41,[57,60,65]],[8,4,43,[55,59,62]],[12,4,48,[55,60,64]]]},
 {id:'oudou',group:'J-POP',name:'王道進行',degrees:'IVM7 – V7 – IIIm7 – VIm7',scale:'major',bars:4,
  chords:[[0,4,41,[57,60,64]],[4,4,43,[59,62,65]],[8,4,40,[55,59,62]],[12,4,45,[55,60,64]]]},
 {id:'marusa',group:'J-POP',name:'丸サ進行（Just the Two of Us）',degrees:'IVM7 – III7 – VIm7 – Vm7 I7',scale:'major',bars:4,
  chords:[[0,4,41,[57,60,64]],[4,4,40,[56,59,62]],[8,4,45,[55,60,64]],[12,2,43,[53,58,62]],[14,2,48,[52,58,62]]]},
 {id:'canon',group:'J-POP',name:'カノン進行',degrees:'I – V – VIm – IIIm – IV – I – IV – V',scale:'major',bars:4,
  chords:[[0,2,48,[55,60,64]],[2,2,43,[55,59,62]],[4,2,45,[57,60,64]],[6,2,40,[55,59,64]],[8,2,41,[57,60,65]],[10,2,48,[55,60,64]],[12,2,41,[57,60,65]],[14,2,43,[55,59,62]]]},
 // ハウス：右手は裏拍の短いスタブ、ベースは小節の頭から
 {id:'house',group:'DANCE',name:'ハウスの 4 つ（裏拍スタブ）',degrees:'VIm7 – IVM7 – I – V',scale:'major',bars:4,stab:[.5,1.5,2.5,3.5],stabLen:.25,
  chords:[[0,4,45,[55,60,64]],[4,4,41,[57,60,64]],[8,4,48,[55,60,64]],[12,4,43,[55,59,62]]]},
 {id:'dorian',group:'DANCE',name:'ドリアン 2 コード',degrees:'Im7 – IV7',scale:'dorian',bars:2,
  chords:[[0,4,48,[55,58,63]],[4,4,41,[57,60,63]]]},
 {id:'minor1',group:'DANCE',name:'マイナー 1 コード（テクノ）',degrees:'Im9',scale:'minor',bars:2,stab:[0,1.5,3],stabLen:.5,
  chords:[[0,4,36,[51,55,58,62]],[4,4,36,[51,55,58,62]]]},
 {id:'minor3',group:'MINOR',name:'マイナー 3 コード（トラップ）',degrees:'Im – ♭VI – ♭VII – Im',scale:'minor',bars:4,
  chords:[[0,4,48,[55,60,63]],[4,4,44,[56,60,63]],[8,4,46,[58,62,65]],[12,4,48,[55,60,63]]]},
 {id:'andalusia',group:'MINOR',name:'アンダルシア（下行）',degrees:'Im – ♭VII – ♭VI – V',scale:'minor',bars:4,
  chords:[[0,4,48,[55,60,63]],[4,4,46,[58,62,65]],[8,4,44,[56,60,63]],[12,4,43,[55,59,62]]]},
];
// プリセットを主音 root（0=C … 11=B）のフレーズにする。音域が上がりすぎないよう、F# 以上のキーは下へ移す
function keyPresetPhrase(id,root=0){
  const p=KEY_PRESETS.find(x=>x.id===id);if(!p)return null;
  const shift=root<=5?root:root-12,notes=[];
  for(const [beat,length,bass,upper] of p.chords){
    notes.push({pitch:bass+shift,beat,length,velocity:100});
    const hits=p.stab?p.stab.filter(s=>s<length).map(s=>[beat+s,p.stabLen]):[[beat,length]];
    for(const [b,l] of hits)for(const n of upper)notes.push({pitch:n+shift,beat:b,length:l,velocity:84});
  }
  return {bars:p.bars,notes,scale:p.scale};
}
