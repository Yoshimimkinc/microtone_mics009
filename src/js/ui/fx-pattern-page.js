// @module ui/fx-pattern-page
// @provides fxSwipeWide, setFxPatternPage
// @uses activeLock, paintPerf, perfLockApply, setActiveLock
// @depends -
// Both responsive rows use the same page. Pattern clicks/LEDs are wired by
// layout and pattern-master to their existing setEditPat path, not a new clock.
function setFxPatternPage(patterns){
  if(patterns&&typeof activeLock!=='undefined'&&activeLock){setActiveLock(null);perfLockApply();} // Pattern page returns pads to playing.
  document.querySelectorAll('.fx-swipe').forEach(row=>{
    row.dataset.fxPage=patterns?'patterns':'effects';
    row.setAttribute('aria-label',patterns?'パターン切替。右へスワイプでエフェクト':'エフェクト。左へスワイプでパターン切替');
    row.querySelectorAll('.fx-pattern').forEach(b=>b.hidden=!patterns);
  });
  if(typeof paintPerf==='function')paintPerf();
}
// 横スワイプで FX ⇄ A B C D（v0.3.180 §167 で作り直し）：
// ・どちら向きでも切り替える（2 ページしかない。v0.3.178 は「左＝ABCD・右＝FX」で、逆向きだと何も起きず「効かない」に見えた）
// ・短いはじき（横に 24px 以上）でも切り替える（v0.3.178 は離した時に 44px 以上が必要だった）
// ・指に合わせて列が少し動く（スワイプを受け付けたのが見える）。iOS が途中で pointercancel を出しても、横に十分動いていれば切り替える
// ・画面全体の横スワイプ（PADS / SEQ / SET の切替）は廃止した（61-layout）。あれが同じ指で画面ごと SEQ へ飛ばしていた
// 場所がある画面（768px 以上）は A B C D が常に出ているのでスワイプしない（v0.3.182 §169）。狭い画面で A B C D のページのまま広げたら FX に戻す
const fxSwipeWide=()=>typeof matchMedia==='function'&&matchMedia('(min-width:768px)').matches;
(function(){
  if(typeof matchMedia==='function'){const mq=matchMedia('(min-width:768px)');const back=()=>{if(mq.matches&&[...document.querySelectorAll('.fx-swipe')].some(r=>r.dataset.fxPage==='patterns'))setFxPatternPage(false);};
    if(mq.addEventListener)mq.addEventListener('change',back);back();}
  document.querySelectorAll('.fx-swipe').forEach(row=>{
    let gesture=null,blockClick=false;
    const shift=dx=>{row.style.transform=dx?'translateX('+Math.max(-40,Math.min(40,dx*.35)).toFixed(1)+'px)':'';};
    const flipIf=(g,dx,dy)=>{const ax=Math.abs(dx);   // 横に 24px（タップの指ぶれは 10px 未満）
      if(ax>=24&&ax>Math.abs(dy)*1.2){setFxPatternPage(row.dataset.fxPage!=='patterns');return true;}return false;};
    const end=()=>{gesture=null;row.classList.remove('swiping');shift(0);};
    row.addEventListener('pointerdown',e=>{
      if(e.button>0||gesture||fxSwipeWide())return;
      blockClick=false;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,lx:e.clientX,ly:e.clientY,swipe:false};
    },true);
    row.addEventListener('pointermove',e=>{
      const g=gesture;if(!g||g.id!==e.pointerId)return;
      g.lx=e.clientX;g.ly=e.clientY;const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(!g.swipe&&Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){end();return;}   // 縦＝スクロールに譲る
      if(!g.swipe&&Math.abs(dx)>10&&Math.abs(dx)>Math.abs(dy)*1.2){g.swipe=true;row.classList.add('swiping');try{row.setPointerCapture(e.pointerId);}catch(_){}}
      if(g.swipe){e.preventDefault();shift(dx);}
    },{passive:false});
    row.addEventListener('pointerup',e=>{
      const g=gesture;if(!g||g.id!==e.pointerId)return;end();
      const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(flipIf(g,dx,dy)||g.swipe){blockClick=true;e.preventDefault();e.stopPropagation();}   // スワイプの後のタップ（MUTE / FX / パターン）は飲む
    },true);
    const cancel=e=>{const g=gesture;if(!g||(e&&e.pointerId!==undefined&&g.id!==e.pointerId))return;end();
      if(g.swipe){blockClick=true;flipIf(g,g.lx-g.x,g.ly-g.y);}};
    // lostpointercapture は「列が指を失った」時だけ。スワイプ開始で列が指を捕まえると、指を持っていたボタンの lostpointercapture が
    // 列まで上がってくる。v0.3.179 まではそれを取消と見て、スワイプがその場で終わっていた（＝実機で効かなかった本当の原因）
    row.addEventListener('pointercancel',cancel);row.addEventListener('lostpointercapture',e=>{if(e.target===row&&gesture?.swipe)cancel(e);});
    row.addEventListener('click',e=>{if(blockClick){blockClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    row.addEventListener('keydown',e=>{if(!fxSwipeWide()&&e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();setFxPatternPage(e.key==='ArrowLeft');}});
  });
})();
