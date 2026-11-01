/* Map-only pointer editor. Text controls and simulation stay independent. */
(function(root){
 'use strict';var PB=root.PB,stage,layer,canvas,ctx,tip,gesture=null,queued=0,latest=null,hover=null,until=0,animation=null,lastTap=null;
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
  if(tx&&p){
   line(tx.route.nodes.map(project),color,true,4);
   if(tx.mode.index!=null){var a=project(tx.original.nodes[tx.mode.index]),b=project(tx.original.nodes[tx.mode.index+1]),q=snap?project(snap):{left:p.x,top:p.y};line([a,q,b],color,true,4);}
   else if(tx.route.nodes.length&&!PB.Graph.isLoop(tx.route)){var end=project(tx.route.nodes[tx.mode.end==='head'?0:tx.route.nodes.length-1]);line([end,{left:p.x,top:p.y}],color,true,3);}
   if(snap){var q=project(snap);ctx.setLineDash([]);ctx.fillStyle='#fff';ctx.strokeStyle=color;ctx.lineWidth=3;ctx.beginPath();ctx.arc(q.left,q.top,13,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.beginPath();ctx.arc(q.left,q.top,20,0,Math.PI*2);ctx.stroke();}
   var key=JSON.stringify(tx.route);
   if(tx.metricKey!==key){tx.metricKey=key;tx.metrics=api().valid(tx.route)?api().preview(tx):null;}
   var m=tx.metrics,duration=function(v){return v==null?'—':A().duration(v);};
   tip.textContent=m?(tx.last?(tx.route.nodes.length<tx.original.nodes.length?'−':'+')+A().nodeName(tx.last)+' · ':'')+(riverIn(tx.route)?'강 건넘(다리로 돌아감) · ':'')+'한 바퀴 '+(m.km==null?'—':Math.round(m.km*10)/10)+' km · 간격 '+duration(m.headwayBefore)+' → '+duration(m.headwayAfter)+' · 수지 '+A().won(m.before)+' → '+A().won(m.after):'이 노선에는 연결할 수 없어요.';
   if(m){tip.dataset.profit=String(m.after);tip.dataset.headway=String(m.headwayAfter);}
   tip.hidden=false;tip.style.left=Math.max(6,Math.min(w-tip.offsetWidth-6,p.x+18))+'px';tip.style.top=Math.max(6,Math.min(h-tip.offsetHeight-6,p.y+22))+'px';
  }else tip.hidden=true;
  if(animation){var k=Math.min(1,(performance.now()-animation.t)/180),ease=1-Math.pow(1-k,3);animation.edges.forEach(function(e){var a=project(e[0]),b=project(e[1]);line([a,{left:a.left+(b.left-a.left)*ease,top:a.top+(b.top-a.top)*ease}],'#fff',false,8);line([a,{left:a.left+(b.left-a.left)*ease,top:a.top+(b.top-a.top)*ease}],animation.color,false,4);});if(k<1)schedule();else animation=null;}
 }
 function schedule(){if(!queued)queued=requestAnimationFrame(draw);}
 function cancel(){var g=gesture;gesture=null;hover=null;latest=null;if(g){until=performance.now()+400;try{if(stage.hasPointerCapture(g.id))stage.releasePointerCapture(g.id);}catch(e){}}schedule();}
 function move(e){
  var p=point(e);if(!inside(p)){cancel();return;}
  if(!gesture){var r=active(),id=nearest(p);if(e.pointerType==='touch'||!r||r.nodes.length<2||PB.Graph.isLoop(r)||!id||r.nodes.indexOf(id)>=0||e.target.closest('button,select,input')){hover=null;schedule();return;}
   var tx=api().begin(api().mode(id));if(!tx)return;tx.route=PB.RouteEdit.visit(tx.route,tx.mode,id);tx.last=id;hover={tx:tx,p:p,snap:id};schedule();return;}
  var g=gesture;g.p=p;if(Math.hypot(p.x-g.start.x,p.y-g.start.y)>=7)g.moved=true;if(!g.moved)return;
  var id=nearest(p);g.snap=id;
  if(g.tx.mode.index!=null){g.tx.route=PB.RouteEdit.visit(g.tx.original,g.tx.mode,id);if(!id)g.tx.route=PB.RouteEdit.copy(g.tx.original);g.tx.last=id;}
  else if(id&&id!==g.lastSnap){var next=PB.RouteEdit.visit(g.tx.route,g.tx.mode,id);if(api().valid(next)){g.tx.route=next;g.tx.last=id;}g.lastSnap=id;}else if(!id)g.lastSnap=null;
  schedule();
 }
 function init(){
  stage=document.querySelector('#stage');layer=document.createElement('div');layer.id='route-edit-layer';canvas=document.createElement('canvas');canvas.id='route-edit-canvas';canvas.setAttribute('aria-hidden','true');layer.appendChild(canvas);tip=document.createElement('div');tip.id='route-edit-tooltip';tip.setAttribute('role','tooltip');tip.hidden=true;layer.appendChild(tip);stage.appendChild(layer);ctx=canvas.getContext('2d');
  stage.addEventListener('pointerdown',function(e){
   if(!enabled()||e.button!==0||gesture)return;var p=point(e),r=active(),h=handleAt(p),segment=h?null:segmentAt(p,r),id=nearest(p),mode=h?{end:h.end}:segment!=null?{index:segment}:null;
   if(!h&&e.target.closest('button,select,input,a'))return;
   if(!mode&&r&&!r.nodes.length&&id)mode={end:'tail'};
   if(!mode)return;var tx=api().begin(mode);if(!tx)return;if(!tx.route.nodes.length){tx.route=PB.RouteEdit.visit(tx.route,mode,id);tx.startId=id;}
   gesture={id:e.pointerId,tx:tx,start:p,p:p,moved:false,lastSnap:h?h.id:id,snap:null};hover=null;
   stage.setPointerCapture(e.pointerId);e.preventDefault();e.stopImmediatePropagation();schedule();
  },true);
  stage.addEventListener('pointermove',function(e){if(!enabled())return;if(gesture&&gesture.id!==e.pointerId)return;if(gesture){e.preventDefault();e.stopImmediatePropagation();}latest={clientX:e.clientX,clientY:e.clientY,target:e.target,pointerType:e.pointerType};if(!move.pending)move.pending=requestAnimationFrame(function(){move.pending=0;var ev=latest;latest=null;if(ev)move(ev);});},true);
  stage.addEventListener('pointerup',function(e){if(!gesture||gesture.id!==e.pointerId)return;e.preventDefault();e.stopImmediatePropagation();latest=null;move(e);var g=gesture;if(!g)return;gesture=null;hover=null;until=performance.now()+400;try{stage.releasePointerCapture(e.pointerId);}catch(err){}
   if(g.moved){lastTap=null;if(api().commit(g.tx)&&!A().reducedMotion()){var old=g.tx.original.nodes;animation={t:performance.now(),color:A().routeStyle(g.tx.num).color,edges:g.tx.route.nodes.slice(1).map(function(id,i){return[g.tx.route.nodes[i],id];}).filter(function(e){return !old.some(function(id,i){return id===e[0]&&old[i+1]===e[1];});})};}}else if(g.tx.mode.index!=null){var now=e.timeStamp;if(lastTap&&lastTap.num===g.tx.num&&lastTap.index===g.tx.mode.index&&now-lastTap.t<400){lastTap=null;A().onRouteDouble(g.tx.num,g.tx.mode.index);}else{lastTap={num:g.tx.num,index:g.tx.mode.index,t:now};A().onRouteClick(g.tx.num,g.tx.mode.index);}}else if(g.tx.original.nodes.length)api().choose(g.tx.mode.end);else A().onNodeClick(g.tx.startId);schedule();
  },true);
  stage.addEventListener('click',function(e){if(e.detail&&performance.now()<until){e.preventDefault();e.stopImmediatePropagation();}},true);
  stage.addEventListener('pointercancel',cancel,true);stage.addEventListener('lostpointercapture',function(){if(gesture)cancel();},true);stage.addEventListener('pointerleave',function(){if(!gesture){hover=null;schedule();}});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&(gesture||hover)){e.preventDefault();e.stopImmediatePropagation();cancel();}},true);root.addEventListener('blur',cancel);
  new ResizeObserver(function(){if(gesture)cancel();schedule();}).observe(stage);
  var render=A().render;A().render=function(){if(gesture)cancel();var r=render.apply(this,arguments);schedule();return r;};
  PB.RouteDrag={refresh:schedule,cancel:cancel,active:function(){return !!gesture;}};schedule();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
