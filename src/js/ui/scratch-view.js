// @module ui/scratch-view
// @provides _scratchGateKey, _scratchGatePointers, _scratchGesture, _scratchPad, _scratchPadInputs,
//    _scratchRAF, scratchAngleDelta, scratchDrawPlatter, scratchGatePaint, scratchGateRelease, scratchHide,
//    scratchPadInputDown, scratchPadInputUp, scratchShow
// @uses scratchClose, scratchCue, scratchDrag, scratchHold, scratchMotor, scratchOpen, scratchSetFader,
//    scratchState, tracks
// @depends audio/scratch-pad
// Flat platter and independent fader. Pointer capture permits a second finger
// on the fader while the first finger holds/drags the record.
let _scratchRAF=0,_scratchGesture=null,_scratchPad=-1;
const _scratchPadInputs=new Map();
const _scratchGatePointers=new Set();let _scratchGateKey=false;
function scratchGatePaint(){const open=_scratchGatePointers.size>0||_scratchGateKey||[..._scratchPadInputs.values()].includes(_scratchPad);scratchSetFader(open?1:0);const button=document.getElementById('scratchFader');button.setAttribute('aria-pressed',String(open));button.textContent=open?'OPEN · SCR':'HOLD TO OPEN';document.getElementById('scratchFaderRead').textContent=open?'OPEN':'CLOSED';}
function scratchGateRelease(clearInputs=true){if(clearInputs)_scratchPadInputs.clear();_scratchGatePointers.clear();_scratchGateKey=false;scratchGatePaint();}
// Preserve held sources across asynchronous audio startup; Note Off/key up can
// arrive before the worklet finishes loading and must keep the gate closed.
function scratchPadInputDown(i,id){
 if(tracks[i]?.padKind!=='SCR')return false;
 if(_scratchPadInputs.has(id))return true;
 const opening=(_scratchPad===i&&!document.getElementById('scratchEditor').hidden)||[..._scratchPadInputs.values()].includes(i)?null:scratchOpen(i);
 _scratchPadInputs.set(id,i);scratchGatePaint();
 if(opening)opening.then(()=>scratchGatePaint()).catch(e=>{_scratchPadInputs.delete(id);scratchGatePaint();document.getElementById('scratchStatus').textContent=e.message;});
 return true;
}
function scratchPadInputUp(id){_scratchPadInputs.delete(id);scratchGatePaint();}
function scratchAngleDelta(angle,previous){return Math.atan2(Math.sin(angle-previous),Math.cos(angle-previous));}
function scratchHide(){_scratchPad=-1;scratchGateRelease();cancelAnimationFrame(_scratchRAF);_scratchRAF=0;_scratchGesture=null;const cv=document.getElementById('scratchDeck');cv.onpointerdown=cv.onpointermove=cv.onpointerup=cv.onpointercancel=null;document.getElementById('scratchEditor').hidden=true;}
function scratchDrawPlatter(canvas,state){
 const dpr=window.devicePixelRatio||1,side=Math.max(1,canvas.clientWidth),pixels=Math.round(side*dpr);if(canvas.width!==pixels||canvas.height!==pixels){canvas.width=pixels;canvas.height=pixels;}
 const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);const cx=side/2,cy=side/2,r=side*.435;
 c.clearRect(0,0,side,side);c.fillStyle='#465052';c.fillRect(0,0,side,side);
 c.fillStyle='#a8ad9e';c.beginPath();c.arc(cx,cy,r+7,0,Math.PI*2);c.fill();c.fillStyle='#171c1c';c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.fill();
 c.strokeStyle='#343e3c';c.lineWidth=1;for(const ratio of [.52,.64,.76,.88,.97]){c.beginPath();c.arc(cx,cy,r*ratio,0,Math.PI*2);c.stroke();}
 c.save();c.translate(cx,cy);c.rotate(state.frame/(state.rate*1.8)*Math.PI*2);
 c.fillStyle='#c0c875';c.beginPath();c.arc(0,0,r*.32,0,Math.PI*2);c.fill();c.fillStyle='#171c1c';c.font='bold '+Math.max(11,side*.042)+'px sans-serif';c.textAlign='center';c.fillText('SCR',0,-r*.08);c.font=Math.max(7,side*.022)+'px sans-serif';c.fillText('MICROTONE',0,r*.15);
 c.strokeStyle='#f0904a';c.lineWidth=Math.max(3,side*.014);c.beginPath();c.moveTo(0,-r*.88);c.lineTo(0,-r*.67);c.stroke();c.restore();
 c.fillStyle='#d6dbca';c.beginPath();c.arc(cx,cy,side*.012,0,Math.PI*2);c.fill();
 // Tonearm is a quiet flat silhouette, outside the main touch region.
 c.strokeStyle='#b8c1b6';c.lineWidth=Math.max(4,side*.018);c.beginPath();c.moveTo(side*.88,side*.11);c.lineTo(side*.88,side*.58);c.lineTo(side*.77,side*.72);c.stroke();c.fillStyle='#d6dbca';c.fillRect(side*.735,side*.695,side*.065,side*.05);
}
function scratchShow(i){
 const editor=document.getElementById('scratchEditor'),cv=document.getElementById('scratchDeck');document.getElementById('scratchTitle').textContent='SCR · '+(tracks[i].name||'PAD '+(i+1));editor.hidden=false;
 _scratchPad=i;scratchGateRelease(false);_scratchGesture=null;
 const draw=()=>{if(editor.hidden)return;const state=scratchState();scratchDrawPlatter(cv,state);document.getElementById('scratchMotion').textContent=state.dragging?'HOLD':state.motor?'PLAY':'PAUSE';document.getElementById('scratchPosition').textContent=(state.position*state.duration).toFixed(2)+' / '+state.duration.toFixed(2)+' s';const button=document.getElementById('scratchPlay');button.textContent=state.motor?'Ⅱ PAUSE':'▶ PLAY';button.setAttribute('aria-pressed',String(state.motor));_scratchRAF=requestAnimationFrame(draw);};draw();
 const angle=e=>{const r=cv.getBoundingClientRect();return Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2);};
 cv.onpointerdown=e=>{if(_scratchGesture)return;const r=cv.getBoundingClientRect(),distance=Math.hypot(e.clientX-r.left-r.width/2,e.clientY-r.top-r.height/2);if(distance<r.width*.07||distance>r.width*.46)return;e.preventDefault();_scratchGesture={id:e.pointerId,angle:angle(e),total:0};cv.setPointerCapture(e.pointerId);scratchHold(true);};
 cv.onpointermove=e=>{const g=_scratchGesture;if(!g||g.id!==e.pointerId)return;e.preventDefault();const next=angle(e);g.total+=scratchAngleDelta(next,g.angle);g.angle=next;scratchDrag(g.total/(Math.PI*2)*scratchState().rate*1.8);};
 cv.onpointerup=cv.onpointercancel=e=>{if(_scratchGesture?.id!==e.pointerId)return;_scratchGesture=null;scratchHold(false);};
}
(function(){
 document.getElementById('scratchClose').addEventListener('click',scratchClose);
 document.getElementById('scratchPlay').addEventListener('click',()=>scratchMotor(!scratchState().motor));
 document.getElementById('scratchCue').addEventListener('click',()=>{_scratchGesture=null;scratchCue();});
 const gate=document.getElementById('scratchFader');
 gate.addEventListener('pointerdown',e=>{e.preventDefault();_scratchGatePointers.add(e.pointerId);gate.setPointerCapture(e.pointerId);scratchGatePaint();});
 const release=e=>{_scratchGatePointers.delete(e.pointerId);scratchGatePaint();};
 gate.addEventListener('pointerup',release);gate.addEventListener('pointercancel',release);gate.addEventListener('lostpointercapture',release);
 gate.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();if(!e.repeat){_scratchGateKey=true;scratchGatePaint();}}});
 gate.addEventListener('keyup',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();e.stopPropagation();_scratchGateKey=false;scratchGatePaint();}});
 gate.addEventListener('blur',scratchGateRelease);window.addEventListener('blur',scratchGateRelease);
 document.getElementById('scratchDeck').addEventListener('keydown',e=>{if(e.code==='Space'){e.preventDefault();e.stopPropagation();scratchMotor(!scratchState().motor);}});
})();
