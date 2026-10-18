// @module ui/splash-anim
// @provides SPLASH_ANIM_KEY, SPLASH_PATS, splashAnimOn
// @uses sampNameEl
// @depends -
// ---------- 起動画面のアニメーション：1 ステージ = 16 セット × 16 パッド × 4 シーケンス を見せる（v0.3.158 §151） ----------
// 「スプラッシュ画面に、16SET × 16PAD × 4SEQ をビジュアルで示すアニメーションを出す（設定で切り替え可能）。
//  最初 16 グリッドが出て、拡大してまた 16 パッドに、それが 4 シーケンスで鳴るイメージ。動画ではなくアニメーション」
// 16 のセットが並ぶ → 1 つが光って拡大 → 16 パッドになる → A B C D の順にステップが進んでパッドが光る → 引いて 16 セットに戻る（くり返し）。
// 音は出さない（起動前で AudioContext も動いていない）。メニューの「起動アニメーション」で OFF（次の起動から）。動きを減らす設定の端末では止めた 1 枚だけ
const SPLASH_ANIM_KEY="mics-splash-anim";
function splashAnimOn(){ try{ return localStorage.getItem(SPLASH_ANIM_KEY)!=="0"; }catch(_){ return true; } }
// 4 つのシーケンスで光るパッド（0-7＝上 2 段のサンプル、8-15＝下 2 段のドラム：8 KICK 9 SNARE 10 HAT 11 OHAT 12 CLAP …）
const SPLASH_PATS=(()=>{ const P=[0,1,2,3].map(()=>Array.from({length:16},()=>[]));
  const put=(p,pad,steps)=>steps.forEach(s=>P[p][s].push(pad));
  put(0,8,[0,8]); put(0,9,[4,12]); put(0,10,[0,2,4,6,8,10,12,14]); put(0,0,[0]);                                   // A：素の 2 ビート＋ネタ 1 発
  put(1,8,[0,7,8,10]); put(1,9,[4,12]); put(1,10,[0,2,4,6,8,10,12,14]); put(1,0,[0]); put(1,1,[6,14]);           // B：キック増し＋ネタ 2
  put(2,8,[0,8]); put(2,9,[4,12]); put(2,10,[...Array(16).keys()]); put(2,2,[0,3]); put(2,3,[8,11]); put(2,12,[12]);   // C：16 分ハット＋チョップ
  put(3,8,[0,3,8,11]); put(3,9,[4,12]); put(3,11,[14]); put(3,4,[0]); put(3,5,[4]); put(3,6,[8]); put(3,7,[12]);  // D：ブレイク＋ネタ 4 つ
  return P; })();
(function(){
  const tg=document.getElementById("splashAnimToggle");
  if(tg){ tg.classList.toggle("on", splashAnimOn());
    tg.addEventListener("click",()=>{ const on=!tg.classList.contains("on"); tg.classList.toggle("on",on);
      try{ localStorage.setItem(SPLASH_ANIM_KEY, on?"1":"0"); }catch(_){}
      if(typeof sampNameEl!=="undefined") sampNameEl.textContent = on ? "起動アニメーション ON（次の起動から）" : "起動アニメーション OFF（次の起動から）"; }); }
  const host=document.getElementById("splashAnim");
  if(!host) return;
  if(!splashAnimOn()){ host.remove(); return; }
  host.innerHTML='<div class="sa-stage"><div class="sa-sets"></div><div class="sa-pads"></div></div>'+
    '<div class="sa-keys"><i>A</i><i>B</i><i>C</i><i>D</i></div><div class="sa-steps"></div><div class="sa-cap"></div>';
  const sets=host.querySelector(".sa-sets"), pads=host.querySelector(".sa-pads"), steps=host.querySelector(".sa-steps"), cap=host.querySelector(".sa-cap");
  const keys=[...host.querySelectorAll(".sa-keys i")];
  for(let k=0;k<16;k++){ const c=document.createElement("i"); c.className="sa-cell"; sets.appendChild(c);
    const d=document.createElement("i"); d.className="sa-pad"+(k>=8?" drum":""); pads.appendChild(d);
    steps.appendChild(document.createElement("i")); }
  const cells=[...sets.children], padEls=[...pads.children], stepEls=[...steps.children];
  const say=h=>{ cap.innerHTML=h; };
  const n2=k=>String(k+1).padStart(2,"0");
  if(matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches){   // 動きを減らす設定：止めた 1 枚
    cells.forEach(c=>c.classList.add("in")); cells[5].classList.add("pick"); say("<b>16</b> SET × <b>16</b> PAD × <b>4</b> SEQ"); return; }
  const alive=()=>host.isConnected;
  let timers=[];
  const at=(ms,fn)=>timers.push(setTimeout(()=>{ if(alive()) fn(); else { timers.forEach(clearTimeout); timers=[]; } }, ms));
  const STEP=80;   // 16 分 1 つ＝80ms（BPM 約 188 相当。1 シーケンス 1.3 秒）
  function cycle(n){
    timers=[];
    const pick=[5,10,2,13][n%4];
    cells.forEach(c=>c.classList.remove("in","pick")); padEls.forEach(d=>d.classList.remove("in","hit"));
    sets.classList.remove("zoom","gone"); pads.classList.remove("show");
    keys.forEach(k=>k.classList.remove("on")); stepEls.forEach(s=>s.classList.remove("on"));
    say("<b>16</b> SET");
    cells.forEach((c,k)=>at(k*55, ()=>c.classList.add("in")));                                   // 16 のセットが並ぶ
    at(1300, ()=>{ cells[pick].classList.add("pick"); say("SET <b>"+n2(pick)+"</b>"); });         // 1 つが光る
    at(1700, ()=>{ sets.style.transformOrigin=((pick%4)+.5)*25+"% "+(((pick>>2)+.5)*25)+"%"; sets.classList.add("zoom"); });   // 拡大
    at(2600, ()=>{ sets.classList.add("gone"); pads.classList.add("show"); say("<b>16</b> PAD"); });
    padEls.forEach((d,k)=>at(2600+k*25, ()=>d.classList.add("in")));                              // 16 パッドになる
    const S=3400;
    for(let p=0;p<4;p++){
      at(S+p*16*STEP, ()=>{ keys.forEach((k,j)=>k.classList.toggle("on",j===p)); say("SEQ <b>"+"ABCD"[p]+"</b>"); });
      for(let s=0;s<16;s++) at(S+(p*16+s)*STEP, ()=>{                                              // A B C D の順に鳴る
        stepEls.forEach((e,j)=>e.classList.toggle("on",j===s));
        SPLASH_PATS[p][s].forEach(i=>{ const d=padEls[i]; d.classList.remove("hit"); void d.offsetWidth; d.classList.add("hit"); setTimeout(()=>d.classList.remove("hit"), 110); });
      });
    }
    const E=S+64*STEP;
    at(E+250, ()=>{ pads.classList.remove("show"); sets.classList.remove("gone","zoom"); keys.forEach(k=>k.classList.remove("on")); stepEls.forEach(s=>s.classList.remove("on"));
      say("<b>16</b> SET × <b>16</b> PAD × <b>4</b> SEQ"); });                                     // 引いて 16 セットに戻る
    at(E+2300, ()=>cycle(n+1));
  }
  cycle(0);
})();
