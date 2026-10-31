/* A gesture commits on pointerup only. Pointer cancellation leaves the plan unchanged.
 * 같은 노선의 같은 구간을 DOUBLE_MS 안에 두 번 누르면(마우스 더블클릭·터치 두 번 탭, 거리 DOUBLE_PX 이내) 두 번째는 onRouteDouble(노선, 구간 번호)로 간다. */
(function(root){
  'use strict';
  function attach(surface,pick,opts){
    var gesture=null,guide=null,suppress=false,lastTap=null,DOUBLE_MS=400,DOUBLE_PX=16;
    function clear(){if(guide)guide.remove();guide=null;gesture=null;}
    surface.addEventListener('pointerdown',function(e){
      suppress=false;
      if(e.button!==0||!opts.canEdit||!opts.canEdit())return;
      var from=pick(e.clientX,e.clientY);if(!from)return;
      gesture={id:e.pointerId,from:from,x:e.clientX,y:e.clientY,moved:false};try{surface.setPointerCapture(e.pointerId);}catch(err){/* 이미 끝난 포인터(합성 이벤트 등) — 캡처 없이 진행 */}e.preventDefault();
    });
    surface.addEventListener('pointermove',function(e){
      if(!gesture||gesture.id!==e.pointerId)return;var dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
      if(Math.hypot(dx,dy)<7&&!gesture.moved)return;gesture.moved=true;
      if(!guide){guide=document.createElement('div');guide.className='route-drag-guide';document.body.appendChild(guide);}
      guide.style.left=gesture.x+'px';guide.style.top=gesture.y+'px';guide.style.width=Math.hypot(dx,dy)+'px';guide.style.transform='rotate('+Math.atan2(dy,dx)+'rad)';
    });
    surface.addEventListener('pointerup',function(e){
      if(!gesture||gesture.id!==e.pointerId)return;var g=gesture,to=pick(e.clientX,e.clientY);clear();suppress=true;
      if(surface.hasPointerCapture(e.pointerId))surface.releasePointerCapture(e.pointerId);
      // 사용자가 누른 시각(이벤트 시각) 기준 — 첫 클릭 뒤 다시 그리기가 오래 걸려도(3D·느린 기기) 두 번 누름을 놓치지 않게
      var now=e.timeStamp,tap=lastTap;lastTap=null;
      if(g.moved){if(to&&opts.onLink)opts.onLink(g.from,to);}else if(g.from.node&&opts.onNode)opts.onNode(g.from.node);
      else if(g.from.route!=null){
        if(tap&&tap.route===g.from.route&&tap.index===g.from.index&&now-tap.t<DOUBLE_MS&&Math.hypot(e.clientX-tap.x,e.clientY-tap.y)<DOUBLE_PX&&opts.onRouteDouble){opts.onRouteDouble(g.from.route,g.from.index);return;}
        lastTap={route:g.from.route,index:g.from.index,t:now,x:e.clientX,y:e.clientY};if(opts.onRoute)opts.onRoute(g.from.route,g.from.index);
      }
    });
    surface.addEventListener('pointercancel',function(){clear();suppress=true;});surface.addEventListener('lostpointercapture',function(){if(gesture){clear();suppress=true;}});
    surface.addEventListener('click',function(e){
      if(suppress){suppress=false;e.preventDefault();e.stopImmediatePropagation();return;}
      var p=pick(e.clientX,e.clientY);if(p&&p.node&&opts.onNode)opts.onNode(p.node);else if(p&&p.route!=null&&opts.onRoute)opts.onRoute(p.route,p.index);
    });
  }
  function pick(surface,project,nodes,routes,x,y,offset){
    // 정류장 선택 영역: 가장 가까운 정류장 하나만 고르고(겹침 없음), 반경은 이웃 정류장과의 화면 거리 절반까지 넓힌다(25~56px)
    var box=surface.getBoundingClientRect(),point={x:x-box.left,y:y-box.top},best=null,ids=Object.keys(nodes);
    var sp=ids.map(function(id){var n=nodes[id];return {id:id,p:project(n.x,n.y)};});
    var cand=null,near=Infinity;sp.forEach(function(q){var d=Math.hypot(q.p.left-point.x,q.p.top-point.y);if(d<near){near=d;cand=q;}});
    if(cand){var gap=Infinity;sp.forEach(function(q){if(q!==cand)gap=Math.min(gap,Math.hypot(q.p.left-cand.p.left,q.p.top-cand.p.top));});
      if(near<Math.max(25,Math.min(56,gap/2)))best={node:cand.id};}
    var distance;
    if(best)return best;distance=12;
    routes.forEach(function(r){if(r.preview)return;for(var i=0;i<r.route.nodes.length-1;i++){
      var a=nodes[r.route.nodes[i]],b=nodes[r.route.nodes[i+1]];if(!a||!b)continue;
      var o=offset?offset(r.route.nodes[i],r.route.nodes[i+1],r.num):{x:0,y:0};
      var p=project(a.x+o.x,a.y+o.y),q=project(b.x+o.x,b.y+o.y),dx=q.left-p.left,dy=q.top-p.top,len=dx*dx+dy*dy;
      var t=len?Math.max(0,Math.min(1,((point.x-p.left)*dx+(point.y-p.top)*dy)/len)):0;
      var d=Math.hypot(point.x-p.left-t*dx,point.y-p.top-t*dy);
      if(d<distance){distance=d;best={route:r.num,index:i};}
    }});return best;
  }
  root.PB=root.PB||{};root.PB.RoutePointer={attach:attach,pick:pick};
})(window);
