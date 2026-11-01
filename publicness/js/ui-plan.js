/* Route-first editor: pointer and keyboard share the same route mutations. */
(function(root){
  'use strict';
  var PB=root.PB,cfg=PB.config,S=PB.Session,G=PB.Graph,UI=PB.UI=PB.UI||{};
  var P={session:null,phase:null,editing:null,anchor:null,rec:null,preview:false,busy:false,token:0,message:''};
  function app(){return PB.App;} function st(){return app().s;} function el(t,a,x){return app().el(t,a,x);}
  function btn(text,id,fn,cls){return el('button',{type:'button',id:id,'class':'btn '+(cls||''),onclick:fn},text);}
  function render(focus){var pb=document.querySelector('.panel-body');P.scroll=pb?pb.scrollTop:0;app().keepFocus=true;app().render();if(focus){var n=document.querySelector(focus);if(n)n.focus({preventScroll:true});}}
  function active(){return S.routeByNum(st(),P.editing);}
  function canAddStop(r,id){
    if(S.routeFits(st(),r.num,{nodes:r.nodes.indexOf(id)>=0?r.nodes:r.nodes.concat([id])}))return true;
    P.message=S.routeRule(st(),r.num)+' 기존 정류장을 드래그해 바꾸거나 삭제한 뒤 추가하세요.';render();return false;
  }
  function assigned(num){return st().draft.buses.filter(function(b){return b.routeNum===num;});}
  UI.planAssignBus=function(id,num){if(!S.canAssign(st(),id,num))return false;changed();S.assign(st(),id,num);P.message=id+'호차를 '+(num==null?'쉬게 했어요.':num+'번에 배정했어요.');return true;};
  // 추가 임차·반납도 초안 편집 — 되돌리기 한 번으로 돌아간다(한도·반납 조건은 Session이 판단)
  UI.planLease=function(){if(!S.leaseLimit(st()))return null;changed();var b=S.lease(st());P.message=b.id+'호차를 이번 단계에 임차했어요 · 임차료 '+app().won(st().config.finance.lease.fee)+'(쉬어도 듦, 단계가 끝나면 자동 반납). 노선으로 끌어 놓으세요.';return b;};
  UI.planUnlease=function(id){var b=st().draft.buses.filter(function(x){return x.id===id;})[0];if(!b||!b.leased||b.routeNum!=null)return false;changed();S.unlease(st(),id);P.message=id+'호차를 반납했어요. 이번 단계 임차료가 들지 않아요.';return true;};
  UI.planEditing=function(){return P.editing;};
  UI.routeEdit={
    enabled:function(){return st()&&st().stage==='plan'&&!P.preview&&!P.busy;},
    active:function(){return active();},
    begin:function(mode){var r=active();if(!r||!this.enabled())return null;return {num:r.num,mode:mode,route:PB.RouteEdit.copy(r),original:PB.RouteEdit.copy(r),base:snapshot(),startId:r.nodes[mode.end==='head'?0:r.nodes.length-1]};},
    valid:function(r){return S.routeFits(st(),r.num,r)&&(r.nodes.length<2||!G.validateRoute(S.graph(st()),r).length);},
    choose:function(end){var r=active();if(!r)return;P.mapSegment=null;P.mapEnd={num:r.num,end:end};P.message=app().nodeName(r.nodes[end==='head'?0:r.nodes.length-1])+' 쪽 끝을 골랐어요.';render();},
    end:function(id){var r=active();return PB.RouteEdit.end(r,id,function(n){var p=app().nodeXY(n),q=app().view.project(p.x,p.y);return{x:q.left,y:q.top};},P.mapEnd&&P.mapEnd.num===r.num?P.mapEnd.end:null);},
    mode:function(id){var r=active();return P.mapSegment&&P.mapSegment.num===r.num&&P.mapSegment.index<r.nodes.length-1?{index:P.mapSegment.index}:{end:this.end(id)};},
    preview:function(tx){
      var s=JSON.parse(JSON.stringify(st())),before=JSON.parse(JSON.stringify(st())),r=S.routeByNum(s,tx.num);
      // Cached graphs contain methods; JSON copies must rebuild them on the copies.
      delete s._g;delete before._g;
      r.nodes=tx.route.nodes.slice();r.stops=tx.route.stops.slice();if(tx.original.nodes.length<2)S.autoPlace(s,r.num);
      var E=UI.Econ,count=function(q){return q.draft.buses.filter(function(b){return b.routeNum===tx.num;}).length;};
      return {km:E.routeKm(s,tx.num),before:E.plan(before).k.total,after:E.plan(s).k.total,headwayBefore:E.headway(before,tx.num,count(before)),headwayAfter:E.headway(s,tx.num,count(s))};
    },
    commit:function(tx){
      if(!this.enabled()||snapshot()!==tx.base||!this.valid(tx.route)||JSON.stringify(tx.route)===JSON.stringify(tx.original))return false;
      var r=S.routeByNum(st(),tx.num);changed();r.nodes=tx.route.nodes.slice();r.stops=tx.route.stops.slice();
      if(tx.original.nodes.length<2)S.autoPlace(st(),r.num);
      P.anchor=null;P.mapEnd=null;P.mapSegment=null;
      P.message=tx.mode.index!=null?app().nodeName(tx.last)+' 정류장을 사이에 넣었어요.':app().nodeName(tx.startId||r.nodes[0])+' 쪽 끝에 '+(r.nodes.length<tx.original.nodes.length?app().nodeName(tx.last||r.nodes[r.nodes.length-1])+'까지 줄였어요.':PB.Narrative.josa(app().nodeName(tx.last||r.nodes[r.nodes.length-1]),'을를')+' 이었어요.');
      render();return true;
    }
  };
  function mapInsert(id){
    var r=active();if(!r||r.nodes.length<2||G.isLoop(r)){insert(id);return;}
    if(id===r.nodes[0]||id===r.nodes[r.nodes.length-1]){UI.routeEdit.choose(id===r.nodes[0]?'head':'tail');return;}
    if(r.nodes.indexOf(id)>=0){insert(id);return;}
    var tx=UI.routeEdit.begin(UI.routeEdit.mode(id));if(!tx)return;tx.route=PB.RouteEdit.visit(tx.route,tx.mode,id);tx.last=id;
    if(!UI.routeEdit.commit(tx)){P.message=S.routeRule(st(),r.num);render();}
  }
  /* 구간 없애기(지도에서 노선 선을 두 번 누르기, 2026-10-27 사용자 지시): 누른 두 정류장 사이 길만 지운다. 확인창 없이, 되돌리기 한 번으로 복구.
   *  · 순환: 그 구간에서 열려 왕복 노선이 된다(누른 구간 다음 정류장에서 시작)
   *  · 끝 구간: 끝 정류장이 빠져 노선이 짧아진다(버스 그대로)
   *  · 가운데 구간: 두 노선으로 나뉜다 — 앞쪽이 번호·버스를 갖고, 뒤쪽은 빈 노선 칸(정류장·버스 없음)이나 새 번호로. 칸이 없으면 짧은 쪽을 지운다
   *  · 두 정류장뿐인 노선: 노선이 없어지고 실린 버스는 대기로 */
  function part(nodes,stops){var s=stops.slice();s[0]=true;s[s.length-1]=true;return {nodes:nodes.slice(),stops:s};}
  function cutSegment(num,i){
    var s=st(),r=S.routeByNum(s,num);if(!r||P.preview||r.nodes[i+1]==null)return false;
    var name=function(id){return app().nodeName(id);},seg=name(r.nodes[i])+'–'+name(r.nodes[i+1]),ids=assigned(num).map(function(b){return b.id;});
    changed();P.anchor=null;
    if(G.isLoop(r)){var ring=r.nodes.slice(0,-1),rs=r.stops.slice(0,-1),k=i+1,opened=part(ring.slice(k).concat(ring.slice(0,k)),rs.slice(k).concat(rs.slice(0,k)));
      r.nodes=opened.nodes;r.stops=opened.stops;P.message=seg+' 구간을 없애 '+num+'번 순환을 풀었어요. ';}
    else{
      var left=r.nodes.length>i+1?part(r.nodes.slice(0,i+1),r.stops.slice(0,i+1)):null,right=part(r.nodes.slice(i+1),r.stops.slice(i+1));
      var L=left&&left.nodes.length>=2,Rt=right.nodes.length>=2;
      if(!L&&!Rt){S.deleteRoute(s,num);if(P.editing===num)P.editing=null;P.message=seg+' 구간을 없애 '+num+'번 노선이 없어졌어요'+(ids.length?' · '+ids.join('·')+'호차는 대기로':'')+'. ';}
      else if(!L||!Rt){var keep=L?left:right;r.nodes=keep.nodes;r.stops=keep.stops;P.message=seg+' 구간을 없앴어요 · '+num+'번은 '+routeText(r)+'. ';}
      else{
        r.nodes=left.nodes;r.stops=left.stops;
        var slot=s.draft.routes.filter(function(x){return x!==r&&!x.nodes.length&&!assigned(x.num).length&&S.routeFits(s,x.num,right);})[0],nr=null;
        if(slot){slot.nodes=right.nodes;slot.stops=right.stops;nr=slot;}else nr=S.addRoute(s,right);
        if(nr){nr.autoPlaced=true;P.message=seg+' 구간을 없애 두 노선으로 나눴어요 · '+num+'번 '+routeText(r)+' / '+nr.num+'번 '+routeText(nr)+'(운행 대기 — 버스를 옮겨 주세요). ';}
        else{if(right.nodes.length>left.nodes.length){r.nodes=right.nodes;r.stops=right.stops;}
          P.message=seg+' 구간을 없앴어요 · 노선 한도(최대 '+S.routeLimit(s)+'개)라 짧은 쪽은 지우고 '+num+'번 '+routeText(r)+'만 남겼어요. ';}
      }
    }
    P.message+='잘못 지웠다면 ↶ 되돌리기를 누르세요.';render('#btn-undo');return true;
  }
  UI.planCutSegment=cutSegment;
  // 노선 초기화(2026-10-27 사용자 지시): 노선을 모두 지우고 버스를 전부 대기로, 빈 1번 노선 하나로 다시 시작. 확인창 없이, 되돌리기 한 번으로 복구
  function resetRoutes(){var s=st();if(P.preview)return false;var n=s.draft.buses.filter(function(b){return b.routeNum!=null;}).length;
    changed();s.draft.routes=[];s.draft.buses.forEach(function(b){b.routeNum=null;});var r=S.addRoute(s,{nodes:[],stops:[]});
    P.editing=r?r.num:null;P.anchor=null;P.pickerOpen=null;P.message='노선을 모두 지웠어요'+(n?' · 버스 '+n+'대는 대기로':'')+'. 잘못 눌렀다면 ↶ 되돌리기를 누르세요.';render('#btn-undo');return true;}
  UI.planReset=resetRoutes;
  function unassigned(){return st().draft.routes.filter(function(r){return !assigned(r.num).length;});}
  function snapshot(){return JSON.stringify({draft:st().draft,owned:st().owned,fourthPhase:st().fourthPhase,goal:st().goal,goalHistory:st().goalHistory,lastRec:st().lastRec,editing:P.editing,anchor:P.anchor});}
  function changed(){
    P.mapSegment=null;P.mapEnd=null;
    if(P.baseline&&P.history[P.history.length-1]!==P.baseline){P.history.push(P.baseline);if(P.history.length>20)P.history.shift();}
    P.preview=false;P.rec=null;P.token++;P.busy=false;P.recSeen={};if(st().lastRec)S.markGoalAction(st(),'modify');
  }
  function undo(){if(!P.history.length)return;var old=JSON.parse(P.history.pop());
    ['draft','owned','fourthPhase','goal','goalHistory','lastRec'].forEach(function(k){st()[k]=old[k];});
    P.editing=old.editing;P.anchor=old.anchor;P.mapEnd=null;P.mapSegment=null;P.preview=false;P.rec=null;P.busy=false;P.token++;P.recSeen={};
    P.message='방금 편집을 되돌렸어요.';render('#btn-undo');
  }
  function moveStop(r,from,to){
    var loop=G.isLoop(r),count=r.nodes.length-(loop?1:0);if(from===to||from<0||to<0||from>=count||to>=count)return;
    changed();if(loop){r.nodes.pop();r.stops.pop();}
    r.nodes.splice(to,0,r.nodes.splice(from,1)[0]);r.stops.splice(to,0,r.stops.splice(from,1)[0]);
    if(loop){r.nodes.push(r.nodes[0]);r.stops.push(r.stops[0]);}
    P.anchor=to;P.message='정류장 순서를 바꿨어요. 잘못 옮겼다면 되돌리기를 누르세요.';render('#drag-stop-'+to);
  }
  function reorderHandle(handle,list,r,index){
    var drag=null;
    function clear(){list.querySelectorAll('.drop-target,.dragging').forEach(function(n){n.classList.remove('drop-target','dragging');});drag=null;}
    function target(e){var n=document.elementFromPoint(e.clientX,e.clientY),row=n&&n.closest('[data-stop-index]');return row&&list.contains(row)?row:null;}
    handle.addEventListener('pointerdown',function(e){if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,moved:false};handle.setPointerCapture(e.pointerId);if(e.pointerType!=='touch')e.preventDefault();});
    handle.addEventListener('pointermove',function(e){if(!drag||drag.id!==e.pointerId)return;if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<7&&!drag.moved)return;drag.moved=true;
      handle.parentNode.classList.add('dragging');list.querySelectorAll('.drop-target').forEach(function(n){n.classList.remove('drop-target');});var row=target(e);if(row)row.classList.add('drop-target');
    });
    handle.addEventListener('pointerup',function(e){if(!drag||drag.id!==e.pointerId)return;var row=target(e),moved=drag.moved;clear();if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);if(moved&&row)moveStop(r,index,Number(row.dataset.stopIndex));});
    handle.addEventListener('pointercancel',clear);handle.addEventListener('lostpointercapture',clear);
    handle.addEventListener('keydown',function(e){if(e.key==='Escape'){clear();return;}if(e.key==='ArrowUp'||e.key==='ArrowDown'){e.preventDefault();moveStop(r,index,index+(e.key==='ArrowUp'?-1:1));}});
  }
  function startRoute(){var r=S.addRoute(st(),{nodes:[],stops:[]});if(!r){P.message='이번 단계의 노선은 최대 '+S.routeLimit(st())+'개예요. 기존 노선을 편집하거나 삭제해 주세요.';return null;}changed();P.editing=r.num;P.anchor=null;P.message='지도에서 시작 정류장을 누르세요.';return r;}
  function nextStops(){var r=active();return r?S.graph(st()).nodes.filter(function(id){return r.nodes.indexOf(id)<0||(!G.isLoop(r)&&r.nodes.length>=3&&id===r.nodes[0]);}):[];}
  function insert(id,focus){
    var r=active();if(!r)r=startRoute();
    if(!r){render();return;}
    if(!canAddStop(r,id))return;
    if(r.nodes.indexOf(id)>=0){
      if(!G.isLoop(r)&&r.nodes.length>=3&&id===r.nodes[0]&&(P.anchor==null||P.anchor===r.nodes.length-1)){
        changed();r.nodes.push(id);r.stops.push(true);P.anchor=null;P.message='순환 노선으로 연결했어요. 표시된 순서로 돌아요.';
      }else{P.anchor=r.nodes.indexOf(id);P.message=app().nodeName(id)+' 다음에 추가할 곳을 고르세요.';}
    }else{
      changed();var before=r.nodes.length,at=P.anchor==null?(G.isLoop(r)?r.nodes.length-1:r.nodes.length):P.anchor+1;
      // 첫 정류장만 고른 때는 아직 선이 없다 — ‘연결했어요’ 대신 시작 안내(2026-11-01)
      r.nodes.splice(at,0,id);r.stops.splice(at,0,true);P.anchor=at;P.message=before===0?app().nodeName(id)+'에서 시작해요. 이어 갈 정류장을 누르세요.':app().nodeName(id)+' 정류장을 연결했어요.';
      // 노선이 처음 완성되는 순간(정류장 2곳) 대기 버스 1대가 운행을 시작한다 — 같은 편집 단계라 되돌리기 한 번에 함께 돌아간다
      if(before<2&&r.nodes.length>=2){var placed=S.autoPlace(st(),r.num);
        if(placed&&placed.busId!=null)P.message+=' '+placed.busId+'호차가 대기에서 나와 '+r.num+'번 운행을 시작해요 · 운영·연료 약 '+app().won(S.busCost(st(),placed.busId,r.num))+'.';
        else if(placed)P.message+=' 대기 버스가 없어 '+r.num+'번은 운행 대기예요 — 다른 노선의 버스를 옮겨 주세요.';}
    }render(focus);
  }
  function link(from,to){
    if(!to||!to.node||!from)return;var r;
    if(from.route!=null){r=S.routeByNum(st(),from.route);if(!r||r.nodes.indexOf(to.node)>=0)return;
      if(!canAddStop(r,to.node))return;
      changed();P.editing=r.num;r.nodes.splice(from.index+1,0,to.node);r.stops.splice(from.index+1,0,true);P.anchor=from.index+1;P.message=PB.Narrative.josa(app().nodeName(to.node),'을를')+' 경유하도록 바꿨어요.';render();return;}
    if(!from.node||from.node===to.node)return;r=active();
    if(st().config.challengeApplied&&(from.node==='N'||to.node==='N')&&(!r||r.num!==6)){P.message=S.routeRule(st(),6);render();return;}
    if(!r||r.nodes.indexOf(from.node)<0){if(r&&!r.nodes.length){changed();r.nodes=[from.node];r.stops=[true];}else {r=startRoute();if(!r){render();return;}r.nodes=[from.node];r.stops=[true];}P.editing=r.num;P.anchor=0;insert(to.node);return;}
    var i=r.nodes.indexOf(from.node);
    if(st().config.challengeApplied&&r.num===6&&r.nodes.length===2&&r.nodes.indexOf(to.node)<0){var pair=r.nodes.slice();pair[i]=to.node;if(!S.routeFits(st(),6,{nodes:pair})){P.message=S.routeRule(st(),6);render();return;}changed();S.updateRoute(st(),6,{nodes:pair,stops:[true,true]});P.anchor=i;P.message='광역버스의 마을 정류장을 바꿨어요.';render();return;}
    if(i===r.nodes.length-1&&!G.isLoop(r)&&(r.nodes.indexOf(to.node)<0||(to.node===r.nodes[0]&&r.nodes.length>=3))){P.anchor=i;insert(to.node);return;}
    if(r.nodes.indexOf(to.node)>=0){moveStop(r,i,r.nodes.indexOf(to.node));return;}
    var proposed=r.nodes.slice();proposed[i]=to.node;if(i===0&&proposed[proposed.length-1]===from.node)proposed[proposed.length-1]=to.node;if(!S.routeFits(st(),r.num,{nodes:proposed})){P.message=S.routeRule(st(),r.num);render();return;}
    changed();r.nodes[i]=to.node;if(i===0&&r.nodes[r.nodes.length-1]===from.node)r.nodes[r.nodes.length-1]=to.node;
    P.anchor=i;P.message='경유 정류장을 바꿨어요.';render();
  }
  function removeAt(r,i){changed();var loop=G.isLoop(r);if(loop){r.nodes.pop();r.stops.pop();}r.nodes.splice(i,1);r.stops.splice(i,1);
    if(loop&&r.nodes.length>=3){r.nodes.push(r.nodes[0]);r.stops.push(true);}P.anchor=null;render();}
  function choose(goal){
    var s=st(),token=++P.token;S.chooseGoal(s,goal);P.busy=true;P.rec=null;P.preview=false;render();
    PB.Advisor.recommend(S.revealed(s),goal).then(function(rec){if(token!==P.token||st()!==s||s.stage!=='plan')return;
      P.busy=false;P.rec=rec;P.preview=true;P.recSeen[goal]=recSignature(rec);P.message='AI 제안 미리보기 · 아직 내 노선에는 적용되지 않았어요.';render('#rec-card');
    }).catch(function(){if(token===P.token){P.busy=false;P.message='제안을 계산하지 못했어요. 직접 편집할 수 있어요.';render();}});
  }
  // 버스 번호와 상관없이 어떤 노선을 몇 대가 달리는지로 제안을 비교한다
  function recSignature(rec){return rec.plan.buses.map(function(b){return b.route?b.route.nodes.join('-'):'쉬기';}).sort().join('|');}
  var GOALS={time:'빠른 이동',reach:'소외 지역 연결',profit:'수익'};
  function applyRec(){var rec=P.rec;if(!rec)return;changed();S.applyRecommendation(st(),rec);
    var used=st().draft.buses.map(function(b){return b.routeNum;});st().draft.routes=st().draft.routes.filter(function(r){return used.indexOf(r.num)>=0;});
    P.preview=false;P.editing=used.filter(function(n){return n!=null;})[0]||null;P.anchor=null;P.message='제안을 적용했어요. 지도에서 바로 고칠 수 있어요.';render();
    app().toast(P.message,{priority:true});}// 적용하면 AI 패널은 닫히고(ui-map-plan) 알림만 남는다(2026-11-01)
  UI.planSetPreview=function(on){P.preview=!!on&&!!P.rec;};
  // AI 목표별로 무엇을 기준으로 고르는지(advisor.js score와 같은 뜻, 2026-11-01). 알고리즘은 그대로이고 설명만 보탠다
  var GOAL_DESC={time:'모든 이동의 도착까지 걸린 시간 합이 가장 짧은 계획을 골라요.',reach:'지난 운행에서 도착률이 가장 낮았던 출발 지역 두 곳의 도착률을 높여요.',profit:'이번 단계 수지(지원금 + 운임 − 비용)가 가장 큰 계획을 골라요.'};
  function goalCriterion(rec){var names=(rec.targets||[]).map(function(id){return app().nodeName(id);}).join('·');
    return rec.goal==='reach'?'이 제안의 ‘소외 지역’은 '+(st().phase===1||!st().history.length?'처음 정해 둔':'지난 운행에서 도착률이 가장 낮았던')+' 출발 지역'+(names?'('+names+')':'')+'이에요. 노선이 아예 없는 정류장이나 주요 인물을 따로 챙기지는 않아요.'
      :rec.goal==='time'?'이 제안의 ‘빠른 이동’은 모든 이동의 도착 시간 합이에요. 주요 인물을 따로 챙기지는 않아요.'
      :'이 제안의 ‘수익’은 이번 단계 수지예요. 도착 건수는 수지가 같을 때만 따져요.';}
  function ai(panel){
    var d=el('details',{id:'ai-tools'});if(P.rec||P.busy)d.open=true;d.appendChild(el('summary',null,'AI에게 노선 제안받기'));
    var row=el('div',{'class':'goal-row'});[{id:'time',name:'빠른 이동'},{id:'reach',name:'소외 지역 연결'},{id:'profit',name:'수익'}].forEach(function(g){
      var cell=el('div',{'class':'goal-cell'}),b=btn(g.name,'goal-'+g.id,function(){choose(g.id);},'goal-btn');b.dataset.goal=g.id;b.disabled=P.busy;b.setAttribute('aria-pressed',String(!!P.rec&&st().goal===g.id));b.setAttribute('aria-describedby','goal-desc-'+g.id);
      cell.appendChild(b);cell.appendChild(el('p',{id:'goal-desc-'+g.id,'class':'goal-desc note'},GOAL_DESC[g.id]));row.appendChild(cell);});d.appendChild(row);
    if(P.busy)d.appendChild(el('p',{id:'rec-progress',role:'status'},'노선을 비교하고 있어요…'));
    if(P.rec){var rec=P.rec,c=el('section',{id:'rec-card',tabindex:'-1','aria-labelledby':'rec-card-h'});c.appendChild(el('h3',{id:'rec-card-h'},'‘'+(GOALS[rec.goal]||'')+'’ 제안'));
      c.appendChild(el('p',null,'도착 예상 '+rec.baseline.arrived+'명 → '+rec.expected.arrived+'명'));
      c.appendChild(el('p',{'class':'note'},'버스를 탄 사람의 최장 대기 '+app().duration(rec.baseline.maxWait)+' → '+app().duration(rec.expected.maxWait)+' · 노선 없음 '+rec.baseline.noLink+' → '+rec.expected.noLink+'건'));
      c.appendChild(el('p',{id:'rec-criterion','class':'rec-criterion'},goalCriterion(rec)));
      var v=recView(rec);
      // 주요 인물 기준 충족이 그대로이거나 줄면 그 줄을 주황(주의)으로 — 색만이 아니라 글로도 ‘그대로’·‘줄어요’
      if(st().config.day){var pb=peopleCount(v.before),pa=peopleCount(v.after),fb=v.before.families,fa=v.after.families,flat=pa.ok<=pb.ok;
        c.appendChild(el('p',{id:'rec-people','class':flat?'rec-people-warn':''},'주요 인물 기준 충족 '+pb.ok+'/'+pb.total+'명 → '+pa.ok+'/'+pa.total+'명'+(flat?(pa.ok<pb.ok?' (줄어요)':' (그대로예요)'):'')+(fa&&fa.total?' · 가족 전원 왕복 '+fb.complete+' → '+fa.complete+'/'+fa.total+'팀':'')));}
      var more=el('details');more.appendChild(el('summary',null,'노선·배차 상세'));c.appendChild(more);var rl=el('ul',{id:'rec-routes','class':'plain'});
      v.rows.forEach(function(row){var li=el('li',{'data-num':row.num},row.num+'번'+(S.stopLimit(st(),row.num)===3?' 직행':'')+' · '+routeText(row.route)+' · '+row.buses.split(',').map(function(id){return id+'호차';}).join(', '));
        if(row.changed)li.appendChild(el('b',{'class':'rec-changed'},' 바뀜'));rl.appendChild(li);});
      if(v.resting.length)rl.appendChild(el('li',null,'쉬는 버스: '+v.resting.map(function(id){return id+'호차';}).join(', ')));more.appendChild(rl);
      c.appendChild(el('p',{'class':'note'},'공개된 수요를 기준으로 비교한 제안이에요. 어떤 이동을 책임질지는 직접 결정하세요.'));
      var same=Object.keys(P.recSeen).filter(function(g){return g!==st().goal&&P.recSeen[g]===P.recSeen[st().goal];});
      if(same.length)c.appendChild(el('p',{id:'rec-same','class':'note'},'‘'+same.map(function(g){return GOALS[g];}).join('’·‘')+'’ 목표의 제안과 같은 노선이에요. 지금 버스와 노선 수에서는 목표가 달라도 같은 계획이 나올 수 있어요.'));
      var acts=el('div',{'class':'row-actions'});acts.appendChild(btn(P.preview?'내 노선 보기':'지도에서 미리 보기','rec-preview',function(){P.preview=!P.preview;render();}));
      acts.appendChild(btn('거절','rec-reject',function(){S.markGoalAction(st(),'reject');P.preview=false;P.rec=null;P.message='내 노선을 유지했어요.';render();}));
      acts.appendChild(btn('적용하고 고치기','rec-accept',applyRec,'btn-primary'));c.appendChild(acts);d.appendChild(c);
    }panel.appendChild(d);
  }
  function routes(panel){
    var sec=el('section',{'aria-labelledby':'routes-h'});sec.appendChild(el('h3',{id:'routes-h'},'내 노선'));
    var back=btn('↶ 되돌리기','btn-undo',function(e){if(e.detail&&performance.now()<(P.ignoreUndoClickUntil||0))return;undo();}),tap=null;
    back.disabled=!P.history.length;
    back.addEventListener('pointerdown',function(e){if(e.pointerType==='touch')tap={x:e.clientX,y:e.clientY,id:e.pointerId};});
    back.addEventListener('pointercancel',function(){tap=null;});
    back.addEventListener('pointerup',function(e){var t=tap;tap=null;if(!t||t.id!==e.pointerId||Math.hypot(e.clientX-t.x,e.clientY-t.y)>7||back.disabled)return;P.ignoreUndoClickUntil=performance.now()+700;undo();});
    sec.appendChild(back);
    var reset=btn('노선 초기화','btn-reset-routes',resetRoutes);reset.disabled=P.preview||!st().draft.routes.some(function(r){return r.nodes.length;})&&!st().draft.buses.some(function(b){return b.routeNum!=null;});
    reset.setAttribute('aria-label','노선 모두 지우기 — 버스는 대기로, 되돌리기로 복구');sec.appendChild(reset);var list=el('div',{'class':'route-tabs'});
    S.routesInOrder(st()).forEach(function(r){var b=btn(r.num+'번'+(S.stopLimit(st(),r.num)===2?' 광역':S.stopLimit(st(),r.num)===3?' 직행':'')+(G.isLoop(r)?' 순환':'')+(!assigned(r.num).length?(r.nodes.length>=2?' · 운행 대기':' · 미배정'):''),'route-'+r.num,function(){P.editing=r.num;P.anchor=null;P.mapSegment=null;P.mapEnd=null;P.preview=false;P.message='정류장을 잇거나 선 중간을 당겨 보세요.';render();},'route-tab');
      b.setAttribute('aria-pressed',String(P.editing===r.num));var rc=app().routeStyle(r.num).color;b.style.setProperty('--route',rc);b.classList.add('route-color');if(PB.MapNetwork&&PB.MapNetwork.luminance(rc)>0.35)b.classList.add('light');list.appendChild(b);});
    var add=btn('+ 새 노선','btn-new-route',function(){startRoute();render('.next-stop');});add.disabled=st().draft.routes.length>=S.routeLimit(st());list.appendChild(add);sec.appendChild(list);sec.appendChild(el('p',{'class':'note'},'이번 단계: 노선 최대 '+S.routeLimit(st())+'개 · 버스 '+st().owned+'대'));var r=active();
    if(r){var c=el('div',{'class':'route-card editing','data-num':r.num}),ok=!G.validateRoute(S.graph(st()),r).length;
      if(S.stopLimit(st(),r.num)===2)c.appendChild(el('p',{id:'regional-rule','class':'callout'},'6번 광역 · 마을 한 곳 ↔ 대도시. 9호차 전용·정원 24명. 마을 쪽 정류장을 골라 시내버스와 환승할 수 있게 연결하세요.'));
      if(S.stopLimit(st(),r.num)===3)c.appendChild(el('p',{id:'express-rule','class':'callout'},'5번 직행 · 최대 3개 정류장 ('+new Set(r.nodes).size+'/3). 7호차는 정원 18명·주행 속도 1.5배인 전용 버스예요. 정류장은 언제든 바꿀 수 있어요.'));
      var econLine=PB.UI.Econ?PB.UI.Econ.routeLine(st(),r.num):'';if(econLine)c.appendChild(el('p',{id:'route-econ-text','class':'note econ-route'},econLine));
      c.appendChild(el('p',{'class':'route-summary'},r.num+'번 · '+(G.isLoop(r)?'순환':'왕복')+(ok?(st().config.challengeApplied&&r.num===5?' · 7호차 한 바퀴 '+app().duration(PB.Schedule.cycleMinutes(S.graph(st()),st().config,7,r)):' · 한 바퀴 '+app().duration(G.cycleMinutes(S.graph(st()),r))):'')));
      if(!r.nodes.length)c.appendChild(el('p',{'class':'note'},'아직 연결한 정류장이 없어요. 지도나 아래 목록에서 두 곳 이상 선택하세요.'));
      var running=assigned(r.num),allocation=el('div',{id:'route-allocation','class':running.length?'note':'callout warn'});
      if(running.length)allocation.textContent='운행 버스: '+running.map(function(b){return b.id+'호차';}).join(', ');
      else{
        allocation.appendChild(el('p',null,'운행 버스 없음 · 이 노선은 아직 운행하지 않아요.'));
        allocation.appendChild(el('p',{'class':'note'},'아래 버스를 선택하면 기존 노선에서 이 노선으로 옮겨 배정해요.'));
        st().draft.buses.forEach(function(b){if(!S.canAssign(st(),b.id,r.num))return;allocation.appendChild(btn(b.id+'호차 '+(b.routeNum==null?'배정':'옮기기 ('+b.routeNum+'번→'+r.num+'번)'),'assign-route-'+b.id,function(){changed();S.assign(st(),b.id,r.num);P.message=b.id+'호차를 '+r.num+'번 노선에 배정했어요.';render();}));});
      }c.appendChild(allocation);
      var ol=el('ol',{'class':'stop-order'}),ns=G.isLoop(r)?r.nodes.slice(0,-1):r.nodes;
      ns.forEach(function(id,i){var li=el('li',{'data-stop-index':i}),handle=btn('↕','drag-stop-'+i,function(){},'stop-drag-handle');handle.setAttribute('aria-label',app().nodeName(id)+' 순서 이동. 드래그 또는 위아래 방향키');li.appendChild(handle);reorderHandle(handle,ol,r,i);
        var b=btn(app().nodeName(id),'stop-'+i,function(){P.anchor=i;P.message=app().nodeName(id)+' 다음에 추가할 곳을 고르세요.';render('#stop-'+i);},'stop-anchor');
        b.setAttribute('aria-pressed',String(P.anchor===i));li.appendChild(b);var del=btn('×','remove-stop-'+i,function(){removeAt(r,i);},'btn-ghost');del.setAttribute('aria-label',app().nodeName(id)+' 정류장 제거');li.appendChild(del);ol.appendChild(li);});c.appendChild(ol);
      // 순서 바꾸기·경유지 편집은 정류장이 세 곳 이상일 때 의미가 있어 그때만 안내한다
      if(ns.length>=3)c.appendChild(el('p',{id:'edit-tips','class':'note'},'↕ 손잡이를 끌면 정류장 순서가 바뀌어요. 지도에서는 정류장을 끌어 교체하거나 선 중간을 당겨 경유지를 추가하세요. 선을 두 번 누르면 그 구간(두 정류장 사이 길)만 없어져요. 잘못 고쳤다면 되돌리기를 누르세요.'));
      if(G.isLoop(r))c.appendChild(el('p',{'class':'note'},'마지막 정류장에서 '+PB.Narrative.josa(app().nodeName(r.nodes[0]),'으로')+' 돌아와요.'));
      if(r.nodes.length){
        var origin=r.nodes[P.anchor==null?0:P.anchor],needs={};
        PB.Demand.base(st().config,st().phase,st().seed).forEach(function(q){if(q.o===origin)needs[q.d]=(needs[q.d]||0)+1;});
        var demand=el('p',{id:'stop-demand','class':'note'});
        demand.textContent=app().nodeName(origin)+'에서 가려는 곳: '+(Object.keys(needs).map(function(id){return app().nodeName(id)+' '+needs[id]+'명';}).join(' · ')||'현재 요청 없음');c.appendChild(demand);
      }
      var acts=el('div',{'class':'row-actions'});acts.appendChild(btn('방향 뒤집기','btn-reverse',function(){changed();r.nodes.reverse();r.stops.reverse();P.anchor=null;render();}));
      var close=btn(G.isLoop(r)?'순환 풀기':'순환으로 잇기','btn-close-loop',function(){if(G.isLoop(r)){changed();r.nodes.pop();r.stops.pop();P.anchor=null;render();}else if(r.nodes.length>=3){P.anchor=null;insert(r.nodes[0]);}});
      close.disabled=!G.isLoop(r)&&r.nodes.length<3;acts.appendChild(close);acts.appendChild(btn('노선 삭제','btn-delete-route',function(){changed();S.deleteRoute(st(),r.num);P.editing=null;P.anchor=null;render();}));c.appendChild(acts);
      // 정류장 목록: 하나를 더할 때마다 닫히지 않고, ‘완료’나 접기로 닫을 때까지 열려 있다. 추가 위치를 골라 중간에도 넣는다
      var options=el('details',{id:'stop-picker'});options.open=P.pickerOpen!=null?P.pickerOpen:!r.nodes.length;
      options.addEventListener('toggle',function(){P.pickerOpen=options.open;});options.appendChild(el('summary',null,'정류장 목록에서 연결하기'));
      var loop=G.isLoop(r),count=loop?r.nodes.length-1:r.nodes.length;
      if(count){var pos=el('select',{id:'insert-at','aria-label':'추가 위치'});
        if(!loop)pos.appendChild(el('option',{value:'-1'},'맨 앞에'));
        for(var k=0;k<count;k++)pos.appendChild(el('option',{value:String(k)},(k===count-1&&!loop?'맨 끝(':'')+app().nodeName(r.nodes[k])+' 다음'+(k===count-1&&!loop?')':'')));
        pos.value=String(P.anchor==null?count-1:Math.min(P.anchor,count-1));
        // Keep the native select alive while its popup commits a choice (Edge).
        // Replacing it inside change can display the previous native popup selection.
        pos.addEventListener('change',function(){P.anchor=Number(pos.value);P.pickerOpen=true;
          c.querySelectorAll('.stop-anchor').forEach(function(b,i){b.setAttribute('aria-pressed',String(i===P.anchor));});
          var demand=c.querySelector('#stop-demand');if(demand)demand.hidden=true;
        });
        var lab=el('label',{'class':'insert-at','for':'insert-at'},'추가 위치 ');lab.appendChild(pos);options.appendChild(lab);}
      var stops=el('div',{'class':'chips'});nextStops().forEach(function(id){var b=btn(app().nodeName(id),'next-'+id,function(){P.pickerOpen=true;insert(id,'#stop-picker .next-stop, #picker-done');},'next-stop');b.dataset.node=id;stops.appendChild(b);});options.appendChild(stops);
      options.appendChild(btn('완료','picker-done',function(){P.pickerOpen=false;render('#route-'+r.num);}));c.appendChild(options);sec.appendChild(c);
    }panel.appendChild(sec);
  }
  function buses(panel){var sec=el('section');sec.appendChild(el('h3',null,'버스 배정'));
    st().draft.buses.forEach(function(b){var row=el('div',{'class':'bus-assignment','data-bus':b.id});row.appendChild(el('label',{'for':'bus-sel-'+b.id},b.id+'호차'+(b.leased?' · 임차(이번 단계)':'')+(st().config.challengeApplied&&b.id===9?' · 광역 (24명)':st().config.challengeApplied&&b.id===7?' · 직행 (18명 · 1.5배)':'')));
      var sel=el('select',{id:'bus-sel-'+b.id,onchange:function(e){changed();S.assign(st(),b.id,e.target.value===''?null:Number(e.target.value));render('#bus-sel-'+b.id);}});
      sel.appendChild(el('option',{value:''},'쉬기'));S.routesInOrder(st()).forEach(function(r){if(!S.canAssign(st(),b.id,r.num))return;var o=el('option',{value:r.num},r.num+'번 '+(G.isLoop(r)?'순환':'왕복')+(G.validateRoute(S.graph(st()),r).length?' (편집 중)':''));sel.appendChild(o);});
      sel.value=b.routeNum==null?'':String(b.routeNum);row.appendChild(sel);sec.appendChild(row);});
    if(sharedRoutes().length)sec.appendChild(el('p',{'class':'note',id:'spacing-note'},sharedRoutes().map(function(n){return n+'번';}).join(', ')+' 노선처럼 같은 노선에 여러 대를 배정하면 한 바퀴 시간을 기준으로 간격을 자동 조절해 출발해요.'));
    S.toPlan(st()).buses.forEach(function(b){if(b.route&&b.route.nodes.length>=2)sec.appendChild(el('p',{'class':'note'},b.id+'호차 · '+app().clock(b.offset)+' 첫 출발'));});
    if(!st().config.progression&&st().phase>=cfg.fourthFromPhase&&st().owned<st().config.bus.maxBuses)sec.appendChild(btn((st().owned+1)+'호차 들이기','btn-fourth',function(){changed();S.introduceFourth(st());P.message=st().owned+'호차를 노선에 배정해 주세요.';render();}));panel.appendChild(sec);
  }
  var DAY={complete:'왕복 가능',returnIncomplete:'돌아오는 길이 어려움',outboundIncomplete:'목적지까지 가기 어려움'};
  var TRIP={complete:'일정 완료 가능',returnIncomplete:'다음 목적지까지 가기 어려움',outboundIncomplete:'운동장까지 가기 어려움'};
  function routeText(r){var ns=G.isLoop(r)?r.nodes.slice(0,-1):r.nodes;return ns.map(function(id){return app().nodeName(id);}).join(' → ')+(G.isLoop(r)?' → (처음으로)':'');}
  // 예상(Session.expected)의 주요 인물 하루 일정: 완료 가능 인원 / 등장 인원
  function peopleCount(m){var ids=Object.keys(m.residents||{}).filter(function(id){return m.residents[id];});return {ok:ids.filter(function(id){return m.residents[id].satisfied===true;}).length,total:ids.length};}
  function people(sec,m){
    var s=st(),tally=PB.Narrative.residentTally(s.config,s.history),ul=el('ul',{id:'resident-forecast','class':'resident-outcomes'});
    PB.Demand.residents(s.config,s.phase).forEach(function(rd){var r=m.residents[rd.id],t=tally[rd.id];if(!r)return;
      ul.appendChild(el('li',{'data-resident':rd.id,'data-status':r.dayStatus},rd.name+' · '+(r.satisfied?'기준 충족 예상':(r.reasons||[]).map(function(x){return x.text;}).join(' ')||(rd.itineraries?TRIP:DAY)[r.dayStatus])+(t?' · 누적 '+t.completed+'/'+t.threshold+'회'+(t.completed>=t.threshold?' 기준 달성':' · 남은 '+t.remaining+'단계'):'')));});
    if(m.families&&m.families.total)ul.appendChild(el('li',{id:'family-forecast'},'호수공원 가족 '+m.families.total+'팀 중 '+m.families.complete+'팀 전원 왕복 예상'));
    sec.appendChild(el('h4',null,'주요 인물·가족 예상'));sec.appendChild(ul);
  }
  // AI 제안을 적용했을 때의 초안을 미리 만들어 노선·배차·인물 예상을 보여 준다(실제 적용과 같은 함수 사용)
  function recView(rec){
    if(rec._view)return rec._view;
    var s=st(),pv=Object.assign({},s,{draft:JSON.parse(JSON.stringify(s.draft)),goalHistory:JSON.parse(JSON.stringify(s.goalHistory)),_g:null});
    S.applyRecommendation(pv,rec);var used=pv.draft.buses.map(function(b){return b.routeNum;});pv.draft.routes=pv.draft.routes.filter(function(r){return used.indexOf(r.num)>=0;});
    var ids=function(d,num){return d.buses.filter(function(b){return b.routeNum===num;}).map(function(b){return b.id;}).join(',');};
    var rows=S.routesInOrder(pv).map(function(r){var old=S.routeByNum(s,r.num);return {num:r.num,route:r,buses:ids(pv.draft,r.num),changed:!old||old.nodes.join()!==r.nodes.join()||ids(s.draft,r.num)!==ids(pv.draft,r.num)};});
    return (rec._view={rows:rows,resting:pv.draft.buses.filter(function(b){return b.routeNum==null;}).map(function(b){return b.id;}),before:S.expected(s),after:S.expected(pv)});
  }
  function outlook(panel){
    var toggle=btn(P.outlookOpen?'예상 도움 닫기':'AI에게 예상 물어보기','btn-outlook-help',function(){P.outlookOpen=!P.outlookOpen;render('#btn-outlook-help');});
    toggle.setAttribute('aria-expanded',String(!!P.outlookOpen));toggle.setAttribute('aria-controls','plan-outlook');panel.appendChild(toggle);
    if(P.outlookOpen)outlookContent(panel);else panel.appendChild(el('section',{id:'plan-outlook',hidden:true}));
  }
  function outlookContent(panel){var m=S.expected(st()),sec=el('section',{id:'plan-outlook'});sec.appendChild(el('h3',null,'이 노선으로 이동하면'));
    sec.appendChild(el('p',{id:'expected-arrivals'},'이동 요청 '+m.N+'건('+PB.UI.requestParts(m.requests)+') 중 '+m.arrived+'건이 도착할 것으로 예상돼요.'));
    var missing=Object.keys(m.zones).filter(function(id){return m.zones[id].N>m.zones[id].arrived;}).sort(function(a,b){return(m.zones[b].N-m.zones[b].arrived)-(m.zones[a].N-m.zones[a].arrived);});
    var ul=el('ul',{'class':'resident-outcomes'});missing.slice(0,3).forEach(function(id){var z=m.zones[id];ul.appendChild(el('li',null,app().nodeName(id)+'에서 출발하는 '+(z.N-z.arrived)+'명은 아직 도착하기 어려워요.'));});
    if(!missing.length)ul.appendChild(el('li',null,'모든 지역의 요청이 운행 시간 안에 도착할 것으로 예상돼요.'));sec.appendChild(ul);if(st().config.day)people(sec,m);sec.appendChild(el('p',{'class':'note'},'돌발 수요 없는 예상 · '+PB.UI.waitLine(app(),m)));panel.appendChild(sec);
  }
  // 이번 단계 주요 인물의 첫 이동과 학기 누적 기록. 누르면 출발·목적 정류장을 지도에 표시한다
  function cast(panel){
    var s=st(),list=PB.Demand.residents(s.config,s.phase),tally=PB.Narrative.residentTally(s.config,s.history);if(!list.length)return;
    var sec=el('section',{id:'resident-chips','aria-labelledby':'cast-h'});sec.appendChild(el('h3',{id:'cast-h'},'오늘 지켜볼 사람'));
    var row=el('div',{'class':'chips'});
    list.forEach(function(rd){var t=tally[rd.id];
      var b=btn(rd.name+' · '+app().clock(rd.depart)+' '+app().nodeName(rd.o)+' → '+app().nodeName(rd.d)+(t?' · 누적 '+t.completed+'/'+t.threshold+'회'+(t.completed>=t.threshold?' 달성':''):''),'resident-chip-'+rd.id,function(){
        app().view.setSelected([rd.o,rd.d]);app().view.flash(rd.o);app().view.flash(rd.d);
        document.querySelector('#plan-message').textContent=rd.name+' · 출발 '+app().nodeName(rd.o)+', 목적지 '+PB.Narrative.josa(app().nodeName(rd.d),'을를')+' 지도에 표시했어요.';
      },'resident-chip');b.dataset.resident=rd.id;row.appendChild(b);});
    sec.appendChild(row);sec.appendChild(el('p',{'class':'note'},'누적 횟수는 학기 말 만족 기준까지 채운 하루 일정이에요.'));panel.appendChild(sec);
  }
  function sharedRoutes(){var c={};st().draft.buses.forEach(function(b){if(b.routeNum!=null)c[b.routeNum]=(c[b.routeNum]||0)+1;});return Object.keys(c).filter(function(n){return c[n]>1;}).map(Number).sort();}
  // 버스가 배정됐지만 정류장이 두 곳 미만이라 출발을 막는 노선
  function blockers(){return st().draft.routes.filter(function(r){return r.nodes.length<2&&assigned(r.num).length;});}
  function blocker(panel,list){
    var box=el('div',{id:'depart-blocker','class':'callout warn'});
    list.forEach(function(r){var ids=assigned(r.num).map(function(b){return b.id;});
      box.appendChild(el('p',null,'출발하려면 '+r.num+'번 노선을 정해 주세요. '+ids.join('·')+'호차가 배정돼 있는데 정류장이 '+(r.nodes.length?'한 곳뿐이에요.':'아직 없어요.')));
      var acts=el('div',{'class':'row-actions'});
      acts.appendChild(btn(r.num+'번 노선 이어서 만들기','blocker-edit-'+r.num,function(){P.editing=r.num;P.anchor=null;P.preview=false;P.message='지도에서 정류장을 눌러 '+r.num+'번 노선을 이어 주세요.';render('#route-'+r.num);}));
      acts.appendChild(btn(ids.join('·')+'호차 쉬게 하기','blocker-rest-'+r.num,function(){changed();ids.forEach(function(id){S.assign(st(),id,null);});P.message=ids.join('·')+'호차는 이번 운행에서 쉬어요. 다시 쓰려면 버스 배정에서 노선을 고르세요.';render('#btn-depart');}));
      box.appendChild(acts);});
    panel.appendChild(box);
  }
  // 상태 메시지가 없을 때 지금 할 일을 알려 준다
  function hint(){var r=active();if(!r||P.preview)return '';
    if(!r.nodes.length)return '지도에서 정류장 두 곳을 차례로 누르면 '+r.num+'번 노선이 생겨요. 누구의 길부터 이을지 골라 보세요.'+busNote(r);
    if(r.nodes.length===1)return app().nodeName(r.nodes[0])+'에서 이어 갈 정류장을 하나 더 누르세요.'+busNote(r);return '';}
  // 노선이 완성되면 생길 일(자동 배치)과 비용을 미리 알린다
  function busNote(r){if(r.autoPlaced||assigned(r.num).length)return '';var b=S.restingFor(st(),r.num);
    return b?' 이으면 대기 중인 '+b.id+'호차가 바로 운행해요(운영·연료 약 '+app().won(S.typicalBusCost(st()))+').':' 대기 버스가 없어 노선만 생겨요.';}
  UI.plan=function(App,panel){var s=App.s;if(P.session!==s||P.phase!==s.phase)P={session:s,phase:s.phase,editing:s.draft.routes[0]?s.draft.routes[0].num:null,anchor:null,rec:null,preview:false,busy:false,token:P.token+1,message:'',history:[],baseline:null,recSeen:{},pickerOpen:null};
    if(s.resumedFromRun){s.resumedFromRun=false;P.message='운행 도중 창이 닫혀, 출발 직전 계획으로 돌아왔어요. 같은 계획으로 다시 출발하면 같은 결과로 운행해요(이 단계 정산은 아직 하지 않았어요).';}
    panel.appendChild(el('p',{'class':'eyebrow'},s.phase+'단계 · '+s.config.phases[s.phase-1]));panel.appendChild(el('h2',null,'어느 동네를 이을까요?'));
    if(s.config.day)cast(panel);
    if(s.config.day){
      var agenda=el('details',{id:'day-agenda'});agenda.appendChild(el('summary',null,'05:00–23:00 수요와 주민 일정'));
      if(s.config.familyTrips&&s.phase>=6)agenda.appendChild(el('p',{'class':'note'},'호수공원 가족 나들이: 밀집 주거지·외곽 마을·신도시에서 각 4명 가족이 낮에 방문해요. 공원에서 체류한 뒤 귀가하며, 가족 전원의 왕복 완료 여부를 결과에서 확인해요.'));
      if(s.config.challengeApplied&&s.phase>=8)agenda.appendChild(el('p',{'class':'note'},'대도시: 아침 출발 36명·저녁 귀가 36명. 6번 광역은 마을 한 곳과 대도시만 연결해요.'));
      if(s.config.challengeApplied&&s.phase>=7)agenda.appendChild(el('p',{'class':'note'},'솔잎몰: 약 12~13시 방문 60명, 18:30~19:42 귀가 60명이 몰려요.'));
      agenda.appendChild(el('p',{'class':'note'},'05–10시 기차역·대학교·일자리 / 10–16시 병원·시장 / 16–20시 퇴근·귀가 / 20–23시 기차역·종합운동장 귀가. 일반 승객은 시간대 안에서 개별적으로 등장해요.'));
      PB.Demand.residents(s.config,s.phase).forEach(function(rd){agenda.appendChild(el('p',{'class':'note'},rd.name+' · '+app().clock(rd.depart)+' '+app().nodeName(rd.o)+' → '+app().nodeName(rd.d)+' · '+app().clock(rd.returnAt)+' 이후 '+(rd.returnTo?app().nodeName(rd.returnTo)+' 이동':'귀가')+' (도착 후 최소 '+app().duration(rd.stay)+' 체류)'));});
      agenda.appendChild(el('p',{'class':'note'},'늦게 도착하면 체류 시간을 채운 뒤 귀가해요. 목적지에 못 갔다면 귀가 요청도 생기지 않아요.'));panel.appendChild(agenda);
    }
    panel.appendChild(el('p',{id:'plan-message',role:'status','class':P.preview?'callout':'note'},P.message||hint()));
    // 노선을 하나라도 완성한 뒤에만 막힌 이유를 띄운다(처음엔 위 안내가 할 일을 알려 줌)
    var blocked=s.draft.routes.some(function(r){return r.nodes.length>=2;})?blockers():[];if(blocked.length)blocker(panel,blocked);
    routes(panel);buses(panel);outlook(panel);ai(panel);
    var errors=S.validate(s),box=el('div',{id:'plan-errors'});errors.filter(function(e){return !s.draft.routes.some(function(r){return (!r.nodes.length||blocked.indexOf(r)>=0)&&e.indexOf(r.num+'번 노선:')===0;});}).forEach(function(e){box.appendChild(el('p',{'class':'callout warn'},e));});panel.appendChild(box);
    var missing=unassigned();if(missing.length)panel.appendChild(el('p',{id:'unassigned-warning','class':'callout warn'},missing.map(function(r){return r.num+'번';}).join(', ')+' 노선은 버스 미배정으로 운행하지 않아요.'));
    var depart=btn('이 노선으로 출발','btn-depart',function(){if(S.validate(s).length)return;departCheck();},'btn-primary btn-lg');depart.disabled=errors.length>0||P.busy;
    var foot=el('div',{id:'depart-bar','class':'depart-bar'});foot.appendChild(depart);panel.appendChild(foot);
    App.onNodeClick=function(id){if(P.preview){P.message='AI 제안을 적용하거나 내 노선으로 돌아온 뒤 편집하세요.';render();return;}mapInsert(id);};
    App.onLink=function(from,to){if(!P.preview)link(from,to);};App.onRouteDouble=function(num,index){cutSegment(num,index);};App.onRouteClick=function(num,index){if(P.preview)return;P.editing=num;P.anchor=index;P.mapEnd=null;P.mapSegment={num:num,index:index};P.message='이 구간에 추가할 정류장을 누르세요.';render();};
    // 출발 버튼은 스크롤 영역 밖 아래 줄에 둔다 — 내용을 덮지 않는다(편집할 때 스크롤 위치 유지)
    var bodyWrap=el('div',{'class':'panel-body'});while(panel.firstChild&&panel.firstChild!==foot)bodyWrap.appendChild(panel.firstChild);panel.insertBefore(bodyWrap,foot);bodyWrap.scrollTop=P.scroll||0;
    P.baseline=snapshot();var r=active();return{selectable:P.preview?[]:nextStops(),selected:P.preview?[]:(r?r.nodes:[]),activeRoute:P.editing,preview:P.preview&&P.rec?P.rec.plan:null};
  };
  // 출발 확인(2026-10-27 사용자 결정으로 단순화): 운행 구성만 보여 주고 [노선 고치기]·[이대로 출발]. 예상 결과(인물 위험·노선별 예상 이용·재정 예상)는 빼서
  // 텍스트를 줄이고 모바일에서도 한눈에 보이게 한다(재정 예상은 계획 화면 지도 아래 한 줄에 있다). 구성 오류(빈 노선 배정 등)는 출발 버튼 자체가 막는다
  function departCheck(){
    var s=st(),body=document.querySelector('#confirm-depart-body');body.textContent='';
    var used=s.draft.buses.filter(function(b){return b.routeNum!=null;}),resting=s.draft.buses.filter(function(b){return b.routeNum==null;});
    var comp=el('ul',{'class':'plain depart-plan'});
    S.routesInOrder(s).forEach(function(r){var ids=assigned(r.num).map(function(b){return b.id+'호차';});
      comp.appendChild(el('li',{'data-num':r.num},r.num+'번 · '+(r.nodes.length?routeText(r):'정류장 없음')+' · '+(ids.length?ids.join(', '):'버스 없음 — 운행하지 않아요')));});
    if(resting.length)comp.appendChild(el('li',null,'쉬는 버스: '+resting.map(function(b){return b.id+'호차';}).join(', ')));
    body.appendChild(el('h3',null,'운행 구성'));body.appendChild(comp);
    if(!used.length)body.appendChild(el('p',{'class':'callout warn',id:'depart-no-bus'},'운행하는 버스가 없어요. 이대로 출발하면 아무도 버스를 탈 수 없어요.'));
    // 출발 뒤 바꿀 수 있는 것(도움말·운행 안내와 같은 규칙, 2026-11-01)
    body.appendChild(el('p',{'class':'note',id:'depart-rule'},s.phase>=3?'출발한 뒤에는 오전·오후 한 번씩 버스 한 대만 옮길 수 있어요. 노선 모양은 다음 단계에서 고쳐요.':'이번 단계는 출발하면 운행이 끝날 때까지 그대로 달려요. 3단계부터는 오전·오후 한 번씩 버스 한 대만 옮길 수 있어요. 노선 모양은 다음 단계에서 고쳐요.'));
    document.querySelector('#confirm-depart').showModal();document.querySelector('#confirm-yes').focus();
  }
  var M=PB.Metrics;
  document.querySelector('#confirm-yes').addEventListener('click',function(){document.querySelector('#confirm-depart').close();if(S.startRun(st()))app().go('run');});
  // 노선 고치기: 창을 닫고 지도로 돌아간다
  document.querySelector('#confirm-no').addEventListener('click',function(){document.querySelector('#confirm-depart').close();});
})(window);
