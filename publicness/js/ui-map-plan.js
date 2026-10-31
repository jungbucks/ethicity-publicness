/* Map-first shell; the existing text editor and map gestures share Session mutations.
 * 버스 배치(2026-10-27): 지도 아래 ‘대기 버스’(쉬는 버스)를 노선으로 끌어 놓으면 1대 증차, 노선 위 고정 표시 ‘버스 ×N’에서 끌어
 * 대기로 놓으면 회수·다른 노선에 놓으면 이동. 드래그 시작만으로는 아무것도 바뀌지 않고, 유효한 곳에 놓을 때 한 번만 반영한다.
 * 클릭·탭·키보드는 ‘버스 고르기 → 노선(또는 대기로 돌리기) 고르기’ 두 단계로 같은 일을 한다. 계획 단계 버스에는 승객이 없다(운행은 출발 뒤 엔진 재생). */
(function(root){
  'use strict';
  var PB=root.PB,S=PB.Session,original=PB.UI.plan,state={session:null,phase:null,text:false,ai:false,bus:null,from:null,person:null};
  var SPRITE='assets/art/bus-sprite.webp',HIT=44,MARGIN=12,HINT_KEY='ethicity.publicness.busHint',drag=null;
  function app(){return PB.App;}
  function button(id,text,fn){return app().el('button',{id:id,type:'button','class':'btn',onclick:fn},text);}
  function redraw(){app().keepFocus=true;app().render();}
  function say(text){var m=document.querySelector('#map-plan-message');if(m)m.textContent=text;}
  function sprite(cls){var i=app().el('img',{src:SPRITE,alt:'','class':cls||'bus-sprite',draggable:'false'});return i;}
  function busesOn(num){return app().s.draft.buses.filter(function(b){return b.routeNum===num;});}
  function resting(){return app().s.draft.buses.filter(function(b){return b.routeNum==null;});}
  function drawn(){var g=S.graph(app().s);return S.routesInOrder(app().s).filter(function(r){return r.nodes.length>=2&&r.nodes.every(function(n){return g.has(n);});});}
  function hintSeen(){try{return root.localStorage.getItem(HINT_KEY)==='1';}catch(e){return false;}}
  function markHint(){try{root.localStorage.setItem(HINT_KEY,'1');}catch(e){/* 이번 창에서만 */}var h=document.querySelector('#depot-hint');if(h)h.remove();}
  function why(id,num){return id===7?'7호차는 5번 직행 전용이에요.':id===9?'9호차는 6번 광역 전용이에요.':num===6?'6번 광역에는 9호차만 배정할 수 있어요.':num===5?'5번 직행에는 7호차만 배정할 수 있어요.':'이 버스는 해당 노선에 배정할 수 없어요.';}
  // 배치 전후 대수·배차 간격·비용 변화(운영+연료, 기본 수요 기준 시각표). 같은 버스를 옮기면 원래 노선 비용이 빠진다
  function gap(num,n){var h=PB.UI.Econ.headway(app().s,num,n);return h==null?'':app().duration(h);}
  function change(num,d){var n=busesOn(num).length,m=n+d;return num+'번 '+n+'→'+m+'대'+(m?' · 간격 '+(n?gap(num,n)+' → ':'')+gap(num,m):' · 운행 대기');}
  function costDelta(id,to,from){var s=app().s,add=to!=null?S.busCost(s,id,to)||0:0,sub=from!=null?S.busCost(s,id,from)||0:0,d=add-sub;
    return ' · 운영·연료 '+(d>=0?'+':'−')+'약 '+app().won(Math.abs(d)).replace('−','');}

  // 버스 한 대를 노선(num) 또는 대기(null)로. 같은 자리면 아무것도 바꾸지 않는다. 바꾸면 되돌리기 한 번으로 돌아간다
  function commit(id,num){
    var cur=app().s.draft.buses.filter(function(x){return x.id===id;})[0];
    if(!cur||cur.routeNum===num){state.bus=null;state.from=null;redraw();return false;}
    if(!S.canAssign(app().s,id,num)){say(why(id,num));return false;}
    if(num!=null&&!drawn().some(function(r){return r.num===num;})){say(num+'번은 아직 정류장이 두 곳 미만이에요. 노선을 먼저 이어 주세요.');return false;}
    var from=cur.routeNum;PB.UI.planAssignBus(id,num);state.bus=null;state.from=null;markHint();
    redraw();
    say(num==null?id+'호차를 대기로 돌렸어요.'+(from!=null&&!busesOn(from).length?' '+from+'번은 운행 대기예요 — 버스를 옮겨 주세요.':' '+from+'번 '+busesOn(from).length+'대 운행.')
      :id+'호차가 '+num+'번 노선을 달려요 · '+num+'번 '+busesOn(num).length+'대 운행'+(from!=null?' · '+from+'번 '+(busesOn(from).length?busesOn(from).length+'대 남음':'운행 대기'):'')+'.');
    return true;
  }
  function assign(num){if(state.bus==null)return false;commit(state.bus,num);return true;}

  // 화면 좌표(client) → 노선별 최소 거리. 차선 간격(laneOffset, SVG 단위 110=지도 1칸)까지 반영해 실제 그려진 선과 맞춘다
  // 그려진 노선 구간을 무대 기준 화면 좌표로(한 번 계산해 여러 점의 거리에 쓴다)
  function segments(){
    var v=app().view,out=[];
    drawn().forEach(function(r){for(var i=1;i<r.nodes.length;i++){
      var a=app().nodeXY(r.nodes[i-1]),b=app().nodeXY(r.nodes[i]),o=v.laneOffset?v.laneOffset(r.nodes[i-1],r.nodes[i],r.num):{dx:0,dy:0};
      out.push({num:r.num,p:v.project(a.x+o.dx/110,a.y+o.dy/110),q:v.project(b.x+o.dx/110,b.y+o.dy/110)});
    }});return out;
  }
  // 무대 기준 점(px,py) → 노선별 최소 거리, 가까운 순
  function nearest(segs,px,py){
    var best={};segs.forEach(function(s){var dx=s.q.left-s.p.left,dy=s.q.top-s.p.top,l=dx*dx+dy*dy,t=l?Math.max(0,Math.min(1,((px-s.p.left)*dx+(py-s.p.top)*dy)/l)):0,d=Math.hypot(px-s.p.left-t*dx,py-s.p.top-t*dy);
      if(!(s.num in best)||d<best[s.num])best[s.num]=d;});
    return Object.keys(best).map(function(n){return {num:Number(n),d:best[n]};}).sort(function(a,b){return a.d-b.d;});
  }
  function distances(x,y){var box=document.querySelector('#stage').getBoundingClientRect();return nearest(segments(),x-box.left,y-box.top);}
  // 놓을 곳 판정: 대기 영역 > ‘버스 ×N’ 표시·노선 버튼 > 지도 위 선(주변 HIT px). 두 노선이 MARGIN px 안으로 비슷하게 가까우면 ‘모호’ — 임의로 고르지 않는다
  function targetAt(x,y){
    var hit=document.elementFromPoint(x,y);
    if(hit&&hit.closest('#bus-depot'))return {kind:'depot'};
    var badge=hit&&hit.closest('.route-bus,#plan-toolbar .route-tab');
    if(badge&&badge.dataset.num)return {kind:'route',num:Number(badge.dataset.num)};
    var stage=document.querySelector('#stage').getBoundingClientRect();
    if(x<stage.left||x>stage.right||y<stage.top||y>stage.bottom)return {kind:'none'};
    var d=distances(x,y);
    if(!d.length||d[0].d>HIT)return {kind:'none'};
    if(d[1]&&d[1].d<=HIT&&d[1].d-d[0].d<MARGIN)return {kind:'ambiguous',nums:[d[0].num,d[1].num]};
    return {kind:'route',num:d[0].num};
  }
  // 드래그 중 안내 문구와 놓을 수 있는지
  function verdict(id,from,t){
    if(t.kind==='depot')return from==null?{ok:false,text:'대기 중인 버스예요. 노선으로 끌어 놓으세요.'}:{ok:true,text:'놓으면 대기로 · '+change(from,-1)+costDelta(id,null,from)};
    if(t.kind==='ambiguous')return {ok:false,text:t.nums[0]+'번과 '+t.nums[1]+'번이 겹치는 곳이에요. 조금 더 움직여 한 노선을 고르세요.'};
    if(t.kind!=='route')return {ok:false,text:from==null?'노선 가까이에 놓으세요.':'노선 위나 아래 대기 영역에 놓으세요.'};
    if(t.num===from)return {ok:false,text:'지금 달리는 노선이에요.'};
    if(!S.canAssign(app().s,id,t.num))return {ok:false,text:why(id,t.num)};
    if(!drawn().some(function(r){return r.num===t.num;}))return {ok:false,text:t.num+'번은 아직 정류장이 두 곳 미만이에요. 노선을 먼저 이어 주세요.'};
    return {ok:true,text:'놓으면 '+change(t.num,1)+(from!=null?' · '+change(from,-1):'')+costDelta(id,t.num,from)+' (기본 수요 기준)'};
  }
  function highlight(num){
    var svg=document.querySelector('#drop-highlight');if(!svg)return;svg.textContent='';
    document.querySelectorAll('.route-bus.drop-target,#plan-toolbar .route-tab.drop-target').forEach(function(n){n.classList.remove('drop-target');});
    delete svg.dataset.num;if(num==null)return;
    var r=S.routeByNum(app().s,num),v=app().view,color=app().routeStyle(num).color,pts=[];if(!r)return;
    for(var i=1;i<r.nodes.length;i++){var a=app().nodeXY(r.nodes[i-1]),b=app().nodeXY(r.nodes[i]),o=v.laneOffset?v.laneOffset(r.nodes[i-1],r.nodes[i],num):{dx:0,dy:0},p=v.project(a.x+o.dx/110,a.y+o.dy/110),q=v.project(b.x+o.dx/110,b.y+o.dy/110);pts.push(p.left+','+p.top+' '+q.left+','+q.top);}
    ['halo','line'].forEach(function(k){var pl=document.createElementNS('http://www.w3.org/2000/svg','polyline');pl.setAttribute('points',pts.join(' '));pl.setAttribute('class','drop-'+k);pl.style.stroke=k==='line'?color:'';svg.appendChild(pl);});
    svg.dataset.num=num;
    document.querySelectorAll('.route-bus[data-num="'+num+'"],#plan-toolbar .route-tab[data-num="'+num+'"]').forEach(function(n){n.classList.add('drop-target');});
  }

  // 드래그: 움직임 7px 전에는 클릭(고르기)으로 본다. 놓을 때만 바꾸고, 취소(Esc·pointercancel·캡처 잃음·잘못된 곳)는 아무것도 안 바꾼다
  function draggable(node,pick){
    node.addEventListener('pointerdown',function(e){
      if(e.button!==0||drag)return;var b=pick();if(!b)return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,bus:b.id,from:b.from,node:node,moved:false,touch:e.pointerType!=='mouse'};
      try{node.setPointerCapture(e.pointerId);}catch(err){/* 합성 이벤트 */}
    });
    node.addEventListener('pointermove',function(e){
      if(!drag||drag.id!==e.pointerId||drag.node!==node)return;
      if(!drag.moved&&Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7)return;
      if(!drag.moved){drag.moved=true;document.body.classList.add('bus-dragging');node.classList.add('drag-source');
        var g=app().el('div',{id:'drag-ghost','aria-hidden':'true'});g.appendChild(sprite('ghost-sprite'));g.appendChild(app().el('span',{'class':'ghost-label'}));document.body.appendChild(g);drag.ghost=g;}
      e.preventDefault();move(e.clientX,e.clientY);
    });
    node.addEventListener('pointerup',function(e){
      if(!drag||drag.id!==e.pointerId||drag.node!==node)return;var d=drag;
      if(!d.moved){end();return;}// 클릭 처리는 click 이벤트가 한다
      state.ignoreClickUntil=performance.now()+350;var t=targetAt(e.clientX,e.clientY),v=verdict(d.bus,d.from,t);end();
      if(v.ok)commit(d.bus,t.kind==='depot'?null:t.num);else say((t.kind==='none'?'제자리로 돌아왔어요. ':'')+v.text);
    });
    node.addEventListener('pointercancel',function(e){if(drag&&drag.id===e.pointerId){end();say('끌기를 취소했어요. 바뀐 것은 없어요.');}});
    node.addEventListener('lostpointercapture',function(e){if(drag&&drag.id===e.pointerId&&drag.node===node&&drag.moved)root.setTimeout(function(){if(drag&&drag.id===e.pointerId){end();say('끌기를 취소했어요. 바뀐 것은 없어요.');}},0);});
  }
  function move(x,y){
    var t=targetAt(x,y),v=verdict(drag.bus,drag.from,t),g=drag.ghost;drag.target=t;
    // 손가락에 가리지 않도록 터치는 버스 그림을 위로 띄운다(판정 기준점은 손가락 위치 그대로)
    g.style.left=x+'px';g.style.top=(y-(drag.touch?44:0))+'px';g.classList.toggle('ok',v.ok);g.querySelector('.ghost-label').textContent=v.text;
    if(v.ok&&t.kind==='route'){g.style.setProperty('--ring',app().routeStyle(t.num).color);highlight(t.num);}else{g.style.removeProperty('--ring');highlight(null);}
    var depot=document.querySelector('#bus-depot');if(depot)depot.classList.toggle('drop-target',v.ok&&t.kind==='depot');
  }
  function end(){
    if(!drag)return;var d=drag;drag=null;
    if(d.ghost)d.ghost.remove();d.node.classList.remove('drag-source');document.body.classList.remove('bus-dragging');highlight(null);
    var depot=document.querySelector('#bus-depot');if(depot)depot.classList.remove('drop-target');
    try{if(d.node.hasPointerCapture&&d.node.hasPointerCapture(d.id))d.node.releasePointerCapture(d.id);}catch(e){/* 이미 풀림 */}
  }

  // 노선마다 고정 위치에 ‘버스 ×N’ — 선 위 구간 중앙들 중 정류장·다른 표시·인물에서 가장 먼 곳(움직이는 버스를 쫓지 않아도 됨)
  function positionBadges(){
    var layer=document.querySelector('#route-buses');if(!layer||!app().view)return;
    /* Place chips beside route segments, away from the endpoint handles. */
    var v=app().view,placed=[],avoid=[];
    S.graph(app().s).nodes.forEach(function(id){var n=app().nodeXY(id);avoid.push(v.project(n.x,n.y));});
    document.querySelectorAll('#map-people .map-person').forEach(function(f){avoid.push({left:parseFloat(f.style.left)+19,top:parseFloat(f.style.top)+19});});
    var segs=segments();
    // 표시는 선 ‘옆’에 둔다(2026-10-27) — 선 위를 덮으면 그 구간을 두 번 눌러 없애거나 경유지를 당길 자리가 사라진다(짧은 구간은 정류장 반경과 겹쳐 아예 못 누름).
    // 선에서 표시 크기만큼 수직으로 비켜 놓고, 정류장·인물·다른 표시·(자기 노선의 다른 구간 포함) 다른 선에서 가장 먼 쪽을 고른다
    drawn().forEach(function(r){var el=layer.querySelector('[data-num="'+r.num+'"]');if(!el)return;var best=null,score=-1,hw=el.offsetWidth/2||50,hh=el.offsetHeight/2||18;
      for(var i=1;i<r.nodes.length;i++)[0.5,0.3,0.7,0.2,0.8].forEach(function(f){
        var a=app().nodeXY(r.nodes[i-1]),b=app().nodeXY(r.nodes[i]),o=v.laneOffset?v.laneOffset(r.nodes[i-1],r.nodes[i],r.num):{dx:0,dy:0};
        var p=v.project(a.x+(b.x-a.x)*f+o.dx/110,a.y+(b.y-a.y)*f+o.dy/110),P=v.project(a.x+o.dx/110,a.y+o.dy/110),Q=v.project(b.x+o.dx/110,b.y+o.dy/110);
        var dx=Q.left-P.left,dy=Q.top-P.top,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len,gap=hw*Math.abs(nx)+hh*Math.abs(ny)+8;
        [1,-1].forEach(function(side){
          var c={left:Math.max(hw+8,Math.min(layer.clientWidth-hw-8,p.left+nx*gap*side)),top:Math.max(hh+8,Math.min(layer.clientHeight-hh-8,p.top+ny*gap*side))},m=Infinity;
          avoid.forEach(function(q){m=Math.min(m,Math.hypot(Math.max(0,Math.abs(q.left-c.left)-hw),Math.max(0,Math.abs(q.top-c.top)-hh)));});placed.forEach(function(q){m=Math.min(m,Math.hypot(q.left-c.left,q.top-c.top)*0.8);});
          if(app().net)app().net.rects().forEach(function(q){var dx=Math.max(0,q.x-c.left-hw,c.left-hw-q.x-q.w),dy=Math.max(0,q.y-c.top-hh,c.top-hh-q.y-q.h);m=Math.min(m,Math.hypot(dx,dy));});
          segs.forEach(function(sg){if(sg.p.left===P.left&&sg.p.top===P.top&&sg.q.left===Q.left&&sg.q.top===Q.top)return;
            var ex=sg.q.left-sg.p.left,ey=sg.q.top-sg.p.top,l=ex*ex+ey*ey,tt=l?Math.max(0,Math.min(1,((c.left-sg.p.left)*ex+(c.top-sg.p.top)*ey)/l)):0;
            m=Math.min(m,Math.hypot(c.left-sg.p.left-tt*ex,c.top-sg.p.top-tt*ey)*1.5);});
          if(m>score+0.5){score=m;best=c;}
        });
      });
      if(best){placed.push(best);el.style.left=best.left+'px';el.style.top=best.top+'px';}
    });
  }
  function positionPeople(){
    if(!app()||!app().s||document.body.dataset.screen!=='plan')return;
    var layer=document.querySelector('#map-people');if(!layer)return;
    positionBadges();
    // 인물 얼굴 자리는 지도 네트워크층이 이름표보다 먼저 정한다(net.facePos) — 이름표·번호 원·노선 선과 겹치지 않게. 층이 없을 때만 아래 방식
    if(app().net){PB.Demand.residents(app().s.config,app().s.phase).forEach(function(rd){var el=document.querySelector('#resident-map-'+rd.id),q=app().net.facePos(rd.id);if(el&&q){el.style.left=q.x+'px';el.style.top=q.y+'px';}});}
    else{
    var taken=(app().net?app().net.rects():[]).concat([].map.call(document.querySelectorAll('#route-buses .route-bus:not([hidden])'),function(b){var r=b.getBoundingClientRect(),s=document.querySelector('#stage').getBoundingClientRect();return {x:r.left-s.left,y:r.top-s.top,w:r.width,h:r.height};})),F=40;
    PB.Demand.residents(app().s.config,app().s.phase).forEach(function(rd){var el=document.querySelector('#resident-map-'+rd.id);if(!el)return;var n=app().nodeXY(rd.o),p=app().view.project(n.x,n.y),best=null;
      [[-F/2,-F-14],[-F-10,-F-6],[10,-F-6],[-F-16,-F/2],[16,-F/2],[-F/2,18]].some(function(o){var r={x:p.left+o[0],y:p.top+o[1],w:F,h:F};if(taken.some(function(q){return r.x<q.x+q.w&&q.x<r.x+r.w&&r.y<q.y+q.h&&q.y<r.y+r.h;}))return false;best=r;return true;});
      if(!best)best={x:p.left-F/2,y:p.top-F-14,w:F,h:F};taken.push(best);el.style.left=best.x+'px';el.style.top=best.y+'px';});}
    if(drag&&drag.target&&drag.target.kind==='route'&&document.querySelector('#drop-highlight').dataset.num)highlight(drag.target.num);
    var svg=document.querySelector('#resident-destination');svg.textContent='';if(!state.person)return;
    var rd=PB.Demand.residents(app().s.config,app().s.phase).filter(function(r){return r.id===state.person;})[0];if(!rd)return;
    var a=app().nodeXY(rd.o),b=app().nodeXY(rd.d),p=app().view.project(a.x,a.y),q=app().view.project(b.x,b.y),line=document.createElementNS('http://www.w3.org/2000/svg','line');
    [['x1',p.left],['y1',p.top],['x2',q.left],['y2',q.top]].forEach(function(k){line.setAttribute(k[0],k[1]);});svg.appendChild(line);
  }

  function depot(App){
    var list=resting(),box=App.el('section',{id:'bus-depot','aria-labelledby':'depot-h'}),head=App.el('div',{'class':'depot-head'});
    head.appendChild(App.el('h3',{id:'depot-h'},'대기 버스'));head.appendChild(App.el('span',{id:'depot-count'},list.length+'대'));
    head.appendChild(App.el('span',{'class':'depot-cost'},'운행하면 1대 운영·연료 약 '+App.won(S.typicalBusCost(App.s))+' 더 · 쉬어도 보유비 '+App.won(App.s.config.finance.holding)));box.appendChild(head);
    var row=App.el('div',{'class':'depot-buses',role:'group','aria-label':'대기 버스 — 고른 뒤 노선을 누르거나 노선으로 끌어 놓으세요'});
    list.forEach(function(b){
      var tag=b.leased?'임차':App.s.config.challengeApplied&&b.id===7?'직행 전용':App.s.config.challengeApplied&&b.id===9?'광역 전용':'',t=button('bus-token-'+b.id,'',function(){
        if(performance.now()<(state.ignoreClickUntil||0))return;var on=state.bus===b.id;state.bus=on?null:b.id;state.from=null;redraw();
        if(!on){var bt=document.querySelector('#bus-token-'+b.id);if(bt)bt.focus({preventScroll:true});say(b.id+'호차를 보낼 노선을 누르세요 — 지도의 선, ‘버스 ×N’ 표시, 위 노선 버튼 모두 돼요.');}});
      t.className='btn depot-bus';t.dataset.bus=b.id;t.appendChild(sprite());t.appendChild(App.el('span',{'class':'depot-id'},b.id+'호차'));if(tag)t.appendChild(App.el('small',null,tag));
      t.setAttribute('aria-pressed',String(state.bus===b.id&&state.from==null));t.setAttribute('aria-label',b.id+'호차 대기'+(tag?' · '+tag:'')+' · 고른 뒤 노선을 누르세요');
      draggable(t,function(){return {id:b.id,from:null};});
      if(b.leased){var w=App.el('span',{'class':'leased-bus'});w.appendChild(t);w.appendChild(button('lease-return-'+b.id,'반납',function(){if(PB.UI.planUnlease(b.id))redraw();}));w.lastChild.classList.add('btn-sm');w.lastChild.setAttribute('aria-label',b.id+'호차 반납(이번 단계 임차료 취소)');row.appendChild(w);}
      else row.appendChild(t);
    });
    if(!list.length)row.appendChild(App.el('p',{'class':'depot-empty'},'대기 버스 없음 — 노선의 ‘버스 ×N’을 여기로 끌면 회수돼요.'));
    box.appendChild(row);
    if(state.bus!=null&&state.from!=null)box.appendChild(button('bus-rest',state.bus+'호차 대기로 돌리기',function(){commit(state.bus,null);}));
    // 추가 임차: 이번 단계에만, 단계당 한도. 누르는 순간 대기 버스로 생기고(아직 돈이 나가지 않음), 출발하면 정산 때 한 번 낸다
    var L=App.s.config.finance.lease,left=S.leaseLimit(App.s),lb=button('btn-lease','+ 1대 임차 · '+App.won(L.fee),function(){if(PB.UI.planLease())redraw();});
    lb.classList.add('btn-sm');lb.disabled=!left;lb.setAttribute('aria-describedby','lease-note');box.appendChild(lb);
    box.appendChild(App.el('span',{id:'lease-note','class':'depot-cost'},left?'이번 단계만 · 남은 '+left+'대 · 쉬어도 임차료, 운행하면 운영·연료비 따로 · 단계가 끝나면 자동 반납':'이번 단계 임차 한도('+L.perPhase+'대)를 모두 썼어요'));
    if(list.length&&drawn().length&&!hintSeen())box.appendChild(App.el('p',{id:'depot-hint','class':'depot-hint'},'버스를 노선으로 끌어다 놓으세요'));
    // 노선 버스를 고른 상태에서 대기 영역을 누르면 회수(키보드는 ‘대기로 돌리기’ 버튼)
    box.addEventListener('click',function(e){if(state.bus!=null&&state.from!=null&&!e.target.closest('button'))commit(state.bus,null);});
    return box;
  }
  function badges(App,stage){
    var layer=App.el('div',{id:'route-buses','aria-label':'노선별 버스'});
    drawn().forEach(function(r){
      var on=busesOn(r.num),color=App.routeStyle(r.num).color,b=button('route-bus-'+r.num,'',function(){
        if(performance.now()<(state.ignoreClickUntil||0))return;
        if(state.bus!=null&&state.from!==r.num){assign(r.num);return;}
        if(state.from===r.num){state.bus=null;state.from=null;redraw();return;}
        if(!on.length){say(r.num+'번은 운행 대기예요 — 대기 버스나 다른 노선의 버스를 옮겨 주세요.');return;}
        var pick=on[on.length-1].id;state.bus=pick;state.from=r.num;redraw();var nb=document.querySelector('#route-bus-'+r.num);if(nb)nb.focus({preventScroll:true});
        say(r.num+'번의 '+pick+'호차를 골랐어요. 다른 노선을 누르면 옮기고, ‘대기로 돌리기’로 회수해요.');});
      b.className='route-bus'+(on.length?'':' idle');b.dataset.num=r.num;b.style.setProperty('--route',color);
      // 지도 네트워크층의 노선 시작 번호 원 자리에 겹쳐 놓는다(번호 원 + 옆에 운행 버스 수, 0이면 점선 테두리 = 운행 대기)
      var numEl=b.appendChild(App.el('span',{'class':'route-num'},String(r.num)));if(PB.MapNetwork&&PB.MapNetwork.luminance(color)>0.35)numEl.style.color='#1A1D24';/* 밝은 노선색(노랑·연보라)엔 어두운 숫자 */
      b.appendChild(App.el('span',{'class':'route-count'},String(on.length)));
      b.setAttribute('aria-pressed',String(state.from===r.num));
      b.setAttribute('aria-label',r.num+'번 노선 '+(on.length?'버스 '+on.length+'대 ('+on.map(function(x){return x.id+'호차';}).join(', ')+')':'운행 대기 — 버스를 옮겨 주세요')+(state.bus!=null&&state.from!==r.num?' · 눌러서 '+state.bus+'호차 보내기':on.length?' · 눌러서 한 대 고르기':''));
      b.title=b.getAttribute('aria-label');
      if(on.length)draggable(b,function(){var cur=busesOn(r.num);return cur.length?{id:cur[cur.length-1].id,from:r.num}:null;});
      layer.appendChild(b);
    });
    stage.appendChild(layer);
    var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='drop-highlight';svg.setAttribute('aria-hidden','true');stage.appendChild(svg);
  }

  PB.UI.plan=function(App,panel){
    if(state.session!==App.s||state.phase!==App.s.phase)state={session:App.s,phase:App.s.phase,text:false,ai:false,bus:null,from:null,person:null};
    if(state.bus!=null){var sb=App.s.draft.buses.filter(function(b){return b.id===state.bus;})[0];if(!sb||sb.routeNum!==state.from){state.bus=null;state.from=null;}}// 되돌리기 등으로 고른 버스 자리가 바뀌었으면 고르기 해제
    var result=original(App,panel),stage=document.querySelector('#stage');
    ['plan-toolbar','map-people','resident-destination','plan-ai-popover','route-buses','drop-highlight'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove();});
    var bar=App.el('div',{id:'plan-toolbar','aria-label':'노선 설계 도구'}),routes=panel.querySelector('.route-tabs');
    routes.querySelectorAll('.route-tab').forEach(function(t){t.dataset.num=t.id.replace('route-','');});
    routes.addEventListener('click',function(e){var chip=e.target.closest('.route-tab');if(chip&&state.bus!=null){e.preventDefault();e.stopImmediatePropagation();assign(Number(chip.dataset.num));}},true);
    var primary=App.el('div',{'class':'map-tools-row'});primary.appendChild(routes);primary.appendChild(panel.querySelector('#btn-undo'));primary.appendChild(panel.querySelector('#btn-reset-routes'));bar.appendChild(primary);
    bar.appendChild(depot(App));
    if(PB.UI.Econ)bar.appendChild(PB.UI.Econ.planPanel(App.s,{editing:PB.UI.planEditing(),get econOpen(){return state.econOpen;},set econOpen(v){state.econOpen=v;}}));
    var actions=App.el('div',{'class':'map-tools-row'}),text=button('plan-text-toggle',state.text?'텍스트 닫기':'텍스트로 편집',function(){state.text=!state.text;redraw();}),ai=button('plan-ai-toggle','AI 제안',function(){state.ai=!state.ai;redraw();});
    text.setAttribute('aria-expanded',String(state.text));text.setAttribute('aria-controls','panel');ai.setAttribute('aria-expanded',String(state.ai));ai.setAttribute('aria-controls','plan-ai-popover');actions.appendChild(text);actions.appendChild(ai);actions.appendChild(panel.querySelector('#btn-depart'));bar.appendChild(actions);
    var message=panel.querySelector('#plan-message');bar.appendChild(App.el('p',{id:'map-plan-message',role:'status'},state.bus!=null?(state.from!=null?state.from+'번의 '+state.bus+'호차를 골랐어요. 다른 노선을 누르면 옮기고, ‘대기로 돌리기’로 회수해요.':state.bus+'호차를 보낼 노선을 누르세요 — 지도의 선, ‘버스 ×N’ 표시, 위 노선 버튼 모두 돼요.'):message.textContent));
    var issues=panel.querySelector('#plan-errors');if(issues.textContent)bar.appendChild(issues);
    stage.parentNode.insertBefore(bar,stage.nextSibling);
    document.body.classList.toggle('plan-text-open',state.text);document.body.classList.toggle('bus-picked',state.bus!=null);
    var pop=App.el('div',{id:'plan-ai-popover'}),tools=panel.querySelector('#ai-tools');pop.hidden=!state.ai;tools.open=true;pop.appendChild(tools);stage.appendChild(pop);
    var people=App.el('div',{id:'map-people','aria-label':'주요 인물'});PB.Demand.residents(App.s.config,App.s.phase).forEach(function(rd){
      var face=button('resident-map-'+rd.id,'',function(){state.person=state.person===rd.id?null:rd.id;redraw();});face.className='map-person resident-face '+rd.id;
      face.setAttribute('aria-label',rd.name+' · '+App.nodeName(rd.o)+'에서 '+App.nodeName(rd.d)+'까지');face.setAttribute('aria-pressed',String(state.person===rd.id));
      face.appendChild(App.el('img',{src:'assets/art/portrait-'+rd.id+'-calm.webp',alt:''}));face.title=face.getAttribute('aria-label');/* 지도엔 얼굴만 — 이름은 툴팁·aria-label(배지 체계 정리) */people.appendChild(face);
    });stage.appendChild(people);var svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='resident-destination';svg.setAttribute('aria-hidden','true');stage.appendChild(svg);
    if(App.net)App.net.setFaces(PB.Demand.residents(App.s.config,App.s.phase).map(function(rd){return {id:rd.id,node:rd.o,size:40};}));
    badges(App,stage);
    var routeClick=App.onRouteClick;App.onRouteClick=function(num,index){if(!assign(num))routeClick(num,index);};
    requestAnimationFrame(positionPeople);return result;
  };
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||document.body.dataset.screen!=='plan'||document.querySelector('dialog[open]'))return;
    if(drag){end();say('끌기를 취소했어요. 바뀐 것은 없어요.');return;}
    state.bus=null;state.from=null;state.person=null;state.ai=false;redraw();
  });
  root.addEventListener('blur',function(){if(drag){end();say('끌기를 취소했어요. 바뀐 것은 없어요.');}});
  root.addEventListener('resize',function(){if(document.body.dataset.screen==='plan')positionPeople();});
  root.setInterval(positionPeople,150);
  PB.UI.busDrop={targetAt:targetAt,distances:distances};// 테스트용(놓을 곳 판정)
})(window);
