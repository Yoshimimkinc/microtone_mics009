// @module ui/fx-pattern-page
// @provides setFxPatternPage
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
(function(){
  document.querySelectorAll('.fx-swipe').forEach(row=>{
    let gesture=null,blockClick=false;
    row.addEventListener('pointerdown',e=>{
      if(e.button>0||gesture)return;
      blockClick=false;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,swipe:false};
    },true);
    row.addEventListener('pointermove',e=>{
      const g=gesture;if(!g||g.id!==e.pointerId)return;
      const dx=e.clientX-g.x,dy=e.clientY-g.y;
      if(!g.swipe&&Math.abs(dy)>18&&Math.abs(dy)>Math.abs(dx)){gesture=null;return;}
      if(!g.swipe&&Math.abs(dx)>16&&Math.abs(dx)>Math.abs(dy)*1.4){g.swipe=true;row.classList.add('swiping');row.setPointerCapture(e.pointerId);}
      if(g.swipe)e.preventDefault();
    },{passive:false});
    row.addEventListener('pointerup',e=>{
      const g=gesture;if(!g||g.id!==e.pointerId)return;gesture=null;row.classList.remove('swiping');
      const dx=e.clientX-g.x,dy=e.clientY-g.y;
      // Check distance on pointerup as well (some touch systems coalesce moves).
      if(g.swipe||Math.abs(dx)>=44&&Math.abs(dx)>Math.abs(dy)*1.4){
        blockClick=true;e.preventDefault();e.stopPropagation();
        if(Math.abs(dx)>=44&&Math.abs(dx)>Math.abs(dy)*1.4)setFxPatternPage(dx<0);
      }
    },true);
    const cancel=()=>{if(gesture?.swipe)blockClick=true;gesture=null;row.classList.remove('swiping');};
    row.addEventListener('pointercancel',cancel);row.addEventListener('lostpointercapture',cancel);
    row.addEventListener('click',e=>{if(blockClick){blockClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
    row.addEventListener('keydown',e=>{if(e.altKey&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();setFxPatternPage(e.key==='ArrowLeft');}});
  });
})();
