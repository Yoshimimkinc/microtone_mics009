// Safari：複数の指/タップ重なりでのピンチ拡大を抑止（touch-actionだけでは防げない）
["gesturestart","gesturechange","gestureend"].forEach(ev=>
  document.addEventListener(ev, e=>e.preventDefault(), {passive:false}));
// 2本指以上のタッチ移動（パン/ズーム）を抑止。1本指のスクロールは許可（SEQ/MIX用）
document.addEventListener("touchmove", e=>{ if(e.touches && e.touches.length>1) e.preventDefault(); }, {passive:false});
const STEPS = 16;
// --- pad definitions: 8 synth voices + 8 empty sample slots ---
const PADS = [
  // 上段(1-8)＝サンプル枠（空）／下段(9-16)＝デフォルトのドラム音。番号は左上から自然順。
  {name:"PAD 1", type:"empty"},
  {name:"PAD 2", type:"empty"},
  {name:"PAD 3", type:"empty"},
  {name:"PAD 4", type:"empty"},
  {name:"PAD 5", type:"empty"},
  {name:"PAD 6", type:"empty"},
  {name:"PAD 7", type:"empty"},
  {name:"PAD 8", type:"empty"},
  {name:"KICK", type:"synth", voice:"kick"},
  {name:"SNARE",type:"synth", voice:"snare"},
  {name:"HAT",  type:"synth", voice:"hat"},
  {name:"OHAT", type:"synth", voice:"ohat"},
  {name:"CLAP", type:"synth", voice:"clap"},
  {name:"RIM",  type:"synth", voice:"rim"},
  {name:"TOM",  type:"synth", voice:"tom"},
  {name:"SINBASS", type:"synth", voice:"sinbass"},
];
const KEYMAP = ["1","2","3","4","5","6","7","8","q","w","e","r","t","y","u","i"];
// 最下段16ステップのキーボード打ち込み：A-K=1-8, Z-,=9-16（Shift=アクセント）
const STEP_KEYS = ["a","s","d","f","g","h","j","k","z","x","c","v","b","n","m",","];
// Shift+キーは記号になるため、レイアウト非依存の e.code でも判定（ミュート用）
const CODEMAP = ["Digit1","Digit2","Digit3","Digit4","Digit5","Digit6","Digit7","Digit8","KeyQ","KeyW","KeyE","KeyR","KeyT","KeyY","KeyU","KeyI"];
// 音階パッド選択中＝ホーム行を「鍵盤」に：左→右で音階デグリー0..（chro=半音 / maj/min/pent=音階）
// 数字行(1-8)・Q行(9-16)のスライス・トリガとは別の行なので両立する（パッド毎の切替＝そのパッドのscale設定）
const MELO_KEYS = ["a","s","d","f","g","h","j","k","l",";"];

