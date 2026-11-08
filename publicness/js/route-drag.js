/* Map-only pointer editor. Text controls and simulation stay independent. */
(function(root){
 'use strict';var PB=root.PB,stage,layer,canvas,ctx,tip,gesture=null,queued=0,latest=null,hover=null,until=0,animation=null,lastTap=null;
 /* 2026-11-09 교사 플레이테스트 3: 구간 지우기(선 두 번 누르기)를 몰라 기능을 요청함 → 노선 선 위에 마우스를 0.35초 올리거나 손가락으로 0.5초 누르면 작은 말풍선.
  * 길게 누른 손길은 편집(구간 고르기·두 번 누르기)으로 치지 않는다 */
 var lineTip=null,lineHover=null,press=null,LINE_TIP='선을 두 번 누르면 이 구간만 지워져요.';
 function lineAt(p){var s=A().s,v=A().view,best=null,d=11;if(!s||!v||!s.draft)return null;
  s.draft.routes.forEach(function(r){for(var i=0;i<r.nodes.length-1;i++){var a=A().nodeXY(r.nodes[i]),b=A().nodeXY(r.nodes[i+1]);if(!a||!b)continue;
   var o=v.laneOffset?v.laneOffset(r.nodes[i],r.nodes[i+1],r.num):{dx:0,dy:0},P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110),dx=Q.left-P.left,dy=Q.top-P.top,t=((p.x-P.left)*dx+(p.y-P.top)*dy)/(dx*dx+dy*dy||1);
   if(t<.1||t>.9)continue;var dd=Math.hypot(p.x-P.left-t*dx,p.y-P.top-t*dy);if(dd<d){d=dd;best={num:r.num,index:i};}}});return best;}
 function onLine(e,p){return enabled()&&!(e.target&&e.target.closest&&e.target.closest('button,select,input,a'))&&!nearest(p)&&lineAt(p);}
 function showLineTip(p){if(!lineTip)return;lineTip.textContent=LINE_TIP;lineTip.hidden=false;var w=stage.clientWidth,h=stage.clientHeight,tw=lineTip.offsetWidth,th=lineTip.offsetHeight,y=p.y-th-28;if(y<6)y=p.y+28;
  lineTip.style.left=Math.max(6,Math.min(w-tw-6,p.x-tw/2))+'px';lineTip.style.top=Math.max(6,Math.min(h-th-6,y))+'px';}
 function hideLineTip(){if(lineHover){clearTimeout(lineHover.timer);lineHover=null;}if(lineTip)lineTip.hidden=true;}
 function A(){return PB.App;}function api(){return PB.UI.routeEdit;}function active(){return api().active();}
 function enabled(){return document.body.dataset.screen==='plan'&&api().enabled();}
 function project(id){var n=A().nodeXY(id);return A().view.project(n.x,n.y);}
 function point(e){var b=stage.getBoundingClientRect();return{x:e.clientX-b.left,y:e.clientY-b.top};}
 function inside(p){return p.x>=0&&p.y>=0&&p.x<=stage.clientWidth&&p.y<=stage.clientHeight;}
 function nearest(p){var best=null,d=32;PB.Session.graph(A().s).nodes.forEach(function(id){var q=project(id),v=Math.hypot(q.left-p.x,q.top-p.y);if(v<d){d=v;best=id;}});return best;}
 function handles(){var r=active();if(!r||!r.nodes.length||PB.Graph.isLoop(r))return [];return(r.nodes.length===1?['tail']:['head','tail']).map(function(end){var id=r.nodes[end==='head'?0:r.nodes.length-1];return{end:end,id:id,p:project(id)};});}
 function handleAt(p){var found=null,d=28;handles().forEach(function(h){var n=Math.hypot(h.p.left-p.x,h.p.top-p.y);if(n<=d){d=n;found=h;}});return found;}
 function segmentAt(p,r){var best=null,d=12;if(!r)return null;for(var i=0;i<r.nodes.length-1;i++){var a=project(r.nodes[i]),b=project(r.nodes[i+1]),dx=b.left-a.left,dy=b.top-a.top,t=((p.x-a.left)*dx+(p.y-a.top)*dy)/(dx*dx+dy*dy||1);if(t<.08||t>.92)continue;var dd=Math.hypot(p.x-a.left-t*dx,p.y-a.top-t*dy);if(dd<d){d=dd;best=i;}}return best;}
 function riverIn(r){var g=PB.Session.graph(A().s);return !!(r&&g.river)&&r.nodes.some(function(id,k){return k>0&&g.river(r.nodes[k-1],id);});}
 function line(points,color,dashed,width){if(points.length<2)return;ctx.strokeStyle=color;ctx.lineWidth=width||4;ctx.lineCap='round';ctx.setLineDash(dashed?[7,6]:[]);ctx.beginPath();points.forEach(function(p,i){if(i)ctx.lineTo(p.left,p.top);else ctx.moveTo(p.left,p.top);});ctx.stroke();}
 function draw(){
  queued=0;if(!ctx)return;var w=stage.clientWidth,h=stage.clientHeight,dpr=Math.min(root.devicePixelRatio||1,2);canvas.width=w*dpr;canvas.height=h*dpr;canvas.style.width=w+'px';canvas.style.height=h+'px';ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!enabled()){layer.hidden=true;tip.hidden=true;return;}layer.hidden=false;
  var focused=document.activeElement&&document.activeElement.closest('.route-end-handle'),focusEnd=focused&&focused.dataset.end;layer.querySelectorAll('.route-end-handle').forEach(function(e){e.remove();});
  var r=active();if(!r)return;var color=A().routeStyle(r.num).color;
  handles().forEach(function(h){var b=document.createElement('button');b.type='button';b.className='route-end-handle';b.dataset.end=h.end;b.dataset.node=h.id;b.style.left=h.p.left+'px';b.style.top=h.p.top+'px';b.style.setProperty('--handle-color',color);b.setAttribute('aria-label',A().nodeName(h.id)+' 쪽 끝에서 노선 잇기');b.title=b.getAttribute('aria-label');b.addEventListener('click',function(e){if(e.detail===0)api().choose(h.end);});layer.appendChild(b);});
  if(focusEnd&&!gesture){var replacement=layer.querySelector('[data-end="'+focusEnd+'"]');if(replacement)replacement.focus({preventScroll:true});}
  var tx=gesture?gesture.tx:hover&&hover.tx,p=gesture?gesture.p:hover&&hover.p,snap=gesture?gesture.snap:hover&&hover.snap;
  if(tx&&p&&!(press&&press.shown)){
   line(tx.route.nodes.map(project),color,true,4);
   if(tx.mode.index!=null){var a=project(tx.original.nodes[tx.mode.index]),b=project(tx.original.nodes[tx.mode.index+1]),q=snap?project(snap):{left:p.x,top:p.y};line([a,q,b],color,true,4);}
   else if(tx.route.nodes.length&&!PB.Graph.isLoop(tx.route)){var end=project(tx.route.nodes[tx.mode.end==='head'?0:tx.route.nodes.length-1]);line([end,{left:p.x,top:p.y}],color,true,3);}
   if(snap){var q=project(snap);ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.left,q.top,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(q.left,q.top,20,0,Math.PI*2);ctx.stroke();}
   var key=JSON.stringify(tx.route);
   if(tx.metricKey!==key){tx.metricKey=key;tx.metrics=api().valid(tx.route)?api().preview(tx):null;}
   var m=tx.metrics,duration=function(v){return v==null?'—':A().duration(v);};
   tip.textContent=m?(tx.last?(tx.route.nodes.length<tx.original.nodes.length?'−':'+')+A().nodeName(tx.last)+' · ':'')+(riverIn(tx.route)?'강 건넘(다리로 돌아감) · ':'')+'한 바퀴 '+(m.km==null?'—':Math.round(m.km*10)/10)+' km · 간격 '+both(m.headwayBefore,m.headwayAfter,duration)+' · 수지 '+both(m.before,m.after,A().won):'이 노선에는 연결할 수 없어요.';
   if(m){tip.dataset.profit=String(m.after);tip.dataset.headway=String(m.headwayAfter);}
   tip.hidden=false;placeTip(p,w,h);
  }else tip.hidden=true;
  if(animation){var k=Math.min(1,(performance.now()-animation.t)/180),ease=1-Math.pow(1-k,3);animation.edges.forEach(function(e){var a=project(e[0]),b=project(e[1]);line([a,{left:a.left+(b.left-a.left)*ease,top:a.top+(b.top-a.top)*ease}],'#fff',false,8);line([a,{left:a.left+(b.left-a.left)*ease,top:a.top+(b.top-a.top)*ease}],animation.color,false,4);});if(k<1)schedule();else animation=null;}
 }
 /* 2026-11-06 P2-6: 전후가 같으면(아직 노선이 안 바뀐 순간) 값 하나만 */
 function both(a,b,f){return a===b?f(a):f(a)+' → '+f(b);}
 /* 2026-11-06 P2-6: 툴팁이 알림·정류장 이름표·손가락을 덮지 않는 자리로. 손가락 옆 네 곳 → 지도 네 귀퉁이 순으로 보고 가장 덜 겹치는 곳(같으면 앞쪽) */
 function placeTip(p,w,h){
  var tw=tip.offsetWidth,th=tip.offsetHeight,box=stage.getBoundingClientRect(),m=6,walls=[{left:p.x-14,top:p.y-14,right:p.x+14,bottom:p.y+14}];
  [].forEach.call(stage.querySelectorAll('.net-label,.stop-name,#minimal-toast:not([hidden])'),function(n){var r=n.getBoundingClientRect();if(r.width)walls.push({left:r.left-box.left,top:r.top-box.top,right:r.right-box.left,bottom:r.bottom-box.top});});
  var fit=function(x,y){return {x:Math.max(m,Math.min(w-tw-m,x)),y:Math.max(m,Math.min(h-th-m,y))};};
  var spots=[fit(p.x+18,p.y+22),fit(p.x+18,p.y-th-22),fit(p.x-tw-18,p.y+22),fit(p.x-tw-18,p.y-th-22),fit(m,h),fit(w,h),fit(m,m),fit(w,m)],best=spots[0],least=Infinity;
  spots.forEach(function(c){var hit=0;walls.forEach(function(r){var dx=Math.min(c.x+tw,r.right)-Math.max(c.x,r.left),dy=Math.min(c.y+th,r.bottom)-Math.max(c.y,r.top);if(dx>0&&dy>0)hit+=dx*dy;});if(hit<least){least=hit;best=c;}});
  tip.style.left=best.x+'px';tip.style.top=best.y+'px';
 }
 function schedule(){if(!queued)queued=requestAnimationFrame(draw);}
 function cancel(){var g=gesture;gesture=null;hover=null;latest=null;if(g){until=performance.now()+400;try{if(stage.hasPointerCapture(g.id))stage.releasePointerCapture(g.id);}catch(e){}}schedule();}
 function move(e){
  var p=point(e);if(!inside(p)){cancel();return;}
  if(!gesture){var r=active(),id=nearest(p);if(e.pointerType==='touch'||e.buttons||!r||r.nodes.length<2||PB.Graph.isLoop(r)||!id||r.nodes.indexOf(id)>=0||e.target.closest('button,select,input')){hover=null;schedule();return;}
   var tx=api().begin(api().mode(id));if(!tx)return;tx.route=PB.RouteEdit.visit(tx.route,tx.mode,id);tx.last=id;hover={tx:tx,p:p,snap:id};schedule();return;}
  var g=gesture;g.p=p;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>=7)g.moved=true;if(!g.moved)return;
  var id=nearest(p);g.snap=id;
  if(g.tx.mode.index!=null){g.tx.route=PB.RouteEdit.visit(g.tx.original,g.tx.mode,id);if(!id)g.tx.route=PB.RouteEdit.copy(g.tx.original);g.tx.last=id;}
  else if(id&&id!==g.lastSnap){var next=PB.RouteEdit.visit(g.tx.route,g.tx.mode,id);if(api().valid(next)){g.tx.route=next;g.tx.last=id;}g.lastSnap=id;}else if(!id)g.lastSnap=null;
  schedule();
 }
 function init(){
  stage=document.querySelector('#stage');layer=document.createElement('div');layer.id='route-edit-layer';canvas=document.createElement('canvas');canvas.id='route-edit-canvas';canvas.setAttribute('aria-hidden','true');layer.appendChild(canvas);tip=document.createElement('div');tip.id='route-edit-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;layer.appendChild(tip);lineTip=document.createElement('div');lineTip.id='route-line-tip';lineTip.setAttribute('role','tooltip');lineTip.hidden=true;layer.appendChild(lineTip);stage.appendChild(layer);ctx=canvas.getContext('2d');
  stage.addEventListener('pointerdown',function(e){
   hideLineTip();if(press){clearTimeout(press.timer);press=null;}
   if(e.pointerType!=='mouse'&&e.button===0){var lp=point(e);if(onLine(e,lp)){var pr=press={id:e.pointerId,p:lp,shown:false,timer:setTimeout(function(){if(press!==pr)return;pr.shown=true;showLineTip(pr.p);schedule();setTimeout(function(){if(!press||press===pr)hideLineTip();},2600);},500)};}}
   if(!enabled()||e.button!==0||gesture)return;var p=point(e),r=active(),h=handleAt(p),segment=h?null:segmentAt(p,r),id=nearest(p);/* 2026-11-09: 노선 밖 정류장을 바로 누르면 선 끌기가 아니라 그 정류장 끌기(선 위에 놓아 사이에 넣기) */if(segment!=null&&id&&r.nodes.indexOf(id)<0){var q=project(id);if(Math.hypot(q.left-p.x,q.top-p.y)<22)segment=null;}var mode=h?{end:h.end}:segment!=null?{index:segment}:null;
   if(!h&&e.target.closest('button,select,input,a'))return;
   if(!mode&&r&&!r.nodes.length&&id)mode={end:'tail'};
   /* 정류장을 끌기 시작하면(다른 손길) 마우스 올림 미리보기는 지운다 — 끝에 붙는 것처럼 보이지 않게(2026-11-09) */if(!mode){if(hover){hover=null;schedule();}return;}var tx=api().begin(mode);if(!tx)return;if(!tx.route.nodes.length){tx.route=PB.RouteEdit.visit(tx.route,mode,id);tx.startId=id;}
   gesture={id:e.pointerId,tx:tx,start:p,p:p,moved:false,lastSnap:h?h.id:id,snap:null};hover=null;
   stage.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();schedule();
  },true);
  stage.addEventListener('pointermove',function(e){
   if(press&&press.id===e.pointerId&&!press.shown){var mp=point(e);if(Math.hypot(mp.x-press.p.x,mp.y-press.p.y)>=7){clearTimeout(press.timer);press=null;}}
   if(e.pointerType==='mouse'&&!e.buttons&&!gesture){var hp=point(e),seg=onLine(e,hp);if(!seg)hideLineTip();else if(!lineHover||lineHover.num!==seg.num||lineHover.index!==seg.index){hideLineTip();var lh=lineHover={num:seg.num,index:seg.index,p:hp,timer:setTimeout(function(){if(lineHover===lh)showLineTip(lh.p);},350)};}else lineHover.p=hp;}
   if(!enabled())return;if(gesture&&gesture.id!==e.pointerId)return;if(gesture){e.preventDefault();e.stopImmediatePropagation();}latest={clientX:e.clientX,clientY:e.clientY,target:e.target,pointerType:e.pointerType,buttons:e.buttons};if(!move.pending)move.pending=requestAnimationFrame(function(){move.pending=0;var ev=latest;latest=null;if(ev)move(ev);});},true);
  stage.addEventListener('pointerup',function(e){
   if(press&&press.id===e.pointerId){var lp=press;press=null;clearTimeout(lp.timer);if(lp.shown){/* 길게 누른 손길: 말풍선만 — 고르기·두 번 누르기로 치지 않음 */e.preventDefault();e.stopImmediatePropagation();until=performance.now()+400;lastTap=null;if(gesture&&gesture.id===e.pointerId){gesture=null;hover=null;try{stage.releasePointerCapture(e.pointerId);}catch(err){}}schedule();return;}}
   if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();latest=null;move(e);var g=gesture;if(!g)return;gesture=null;hover=null;until=performance.now()+400;try{stage.releasePointerCapture(e.pointerId);}catch(err){}
   if(g.moved){lastTap=null;var done=api().commit(g.tx);if(!done&&api().fail)api().fail(g.tx,g.snap);/* 2026-11-09: 안 이어지면 한 줄 이유 */if(done&&!A().reducedMotion()){var old=g.tx.original.nodes;animation={t:performance.now(),color:A().routeStyle(g.tx.num).color,edges:g.tx.route.nodes.slice(1).map(function(id,i){return[g.tx.route.nodes[i],id];}).filter(function(e){return !old.some(function(id,i){return id===e[0]&&old[i+1]===e[1];});})};}}else if(g.tx.mode.index!=null){var now=e.timeStamp;if(lastTap&&lastTap.num===g.tx.num&&lastTap.index===g.tx.mode.index&&now-lastTap.t<400){lastTap=null;A().onRouteDouble(g.tx.num,g.tx.mode.index);}else{lastTap={num:g.tx.num,index:g.tx.mode.index,t:now};A().onRouteClick(g.tx.num,g.tx.mode.index);}}else if(g.tx.original.nodes.length)api().choose(g.tx.mode.end);else A().onNodeClick(g.tx.startId);schedule();
  },true);
  stage.addEventListener('click',function(e){if(e.detail&&performance.now()<until){e.preventDefault();e.stopImmediatePropagation();}},true);
  stage.addEventListener('pointercancel',function(e){if(press&&press.id===e.pointerId){clearTimeout(press.timer);press=null;}cancel();},true);stage.addEventListener('lostpointercapture',function(){if(gesture)cancel();},true);stage.addEventListener('pointerleave',function(){hideLineTip();if(!gesture){hover=null;schedule();}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&(gesture||hover)){e.preventDefault();e.stopImmediatePropagation();cancel();}},true);root.addEventListener('blur',cancel);
  new ResizeObserver(function(){if(gesture)cancel();schedule();}).observe(stage);
  var render=A().render;A().render=function(){if(gesture)cancel();var r=render.apply(this,arguments);schedule();return r;};
  PB.RouteDrag={refresh:schedule,cancel:cancel,active:function(){return !!gesture;}};schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
