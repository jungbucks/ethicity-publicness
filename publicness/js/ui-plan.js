/* Route-first editor: pointer and keyboard share the same route mutations. */
(function(root){
  'use strict';
  var PB=root.PB,cfg=PB.config,S=PB.Session,G=PB.Graph,UI=PB.UI=PB.UI||{};
  var P={session:null,phase:null,editing:null,anchor:null,rec:null,preview:false,busy:false,token:0,message:''};
  function app(){return PB.App;} function st(){return app().s;} function el(t,a,x){return app().el(t,a,x);}
  function btn(text,id,fn,cls){var b=el('button',{type:'button',id:id,'class':'btn '+(cls||''),onclick:fn},text),icon={'btn-undo':'undo','btn-reset-routes':'reset','btn-new-route':'plus'}[id]||(/^drag-stop-/.test(id)?'move':/^remove-stop-/.test(id)?'close':null);return icon?PB.Icons.label(b,icon,text==='↕'?'순서 이동':text==='×'?'제거':text.replace(/^[↶+]\s*/,'')):b;}
  function render(focus){var pb=document.querySelector('.panel-body');P.scroll=pb?pb.scrollTop:0;app().keepFocus=true;app().render();if(focus){var n=document.querySelector(focus);if(n)n.focus({preventScroll:true});}}
  function active(){return S.routeByNum(st(),P.editing);}
  function canAddStop(r,id){
    if(S.routeFits(st(),r.num,{nodes:r.nodes.indexOf(id)>=0?r.nodes:r.nodes.concat([id])}))return true;
    P.message=S.routeRule(st(),r.num)+' 기존 정류장을 드래그해 바꾸거나 삭제한 뒤 추가하세요.';render();return false;
  }
  function assigned(num){return st().draft.buses.filter(function(b){return b.routeNum===num;});}
  /* 노선·버스 이름은 번호 대신 색(js/route-names.js, 2026-11-02): R(n) ‘초록 노선’, C(n) ‘초록’, B(id) ‘초록 버스’·‘대기 버스’. 글 편집 목록처럼 버스를 하나씩 가려야 할 때는 busLabels(같은 이름이면 (첫째)·(둘째)) */
  function R(n){return PB.Names.route(n);}function C(n){return PB.Names.color(n);}function B(id,n){return PB.Names.bus(id,null,n);}
  function busLabels(list){var names=list.map(function(b){return B(b.id);}),seen={},ORD=['첫째','둘째','셋째','넷째','다섯째','여섯째','일곱째','여덟째','아홉째'];return list.reduce(function(m,b,i){var n=names[i],k=names.filter(function(x){return x===n;}).length;seen[n]=(seen[n]||0)+1;m[b.id]=k>1?n+'('+(ORD[seen[n]-1]||seen[n])+')':n;return m;},{});}
  UI.busLabels=busLabels;
  UI.planAssignBus=function(id,num){if(!S.canAssign(st(),id,num))return false;var who=B(id);changed();S.assign(st(),id,num);P.message=num==null?who+'를 쉬게 했어요.':'버스 한 대를 '+R(num)+'에 배정했어요.';return true;};
  // 추가 임차·반납도 초안 편집 — 되돌리기 한 번으로 돌아간다(한도·반납 조건은 Session이 판단)
  UI.planLease=function(){if(!S.leaseLimit(st()))return null;changed();var b=S.lease(st());P.message='버스 한 대를 이번 단계에 빌렸어요 · 임차료 '+app().won(st().config.finance.lease.fee)+'(쉬어도 듦, 단계가 끝나면 자동 반납). 노선으로 끌어 놓으세요.';return b;};
  UI.planUnlease=function(id){var b=st().draft.buses.filter(function(x){return x.id===id;})[0];if(!b||!b.leased||b.routeNum!=null)return false;changed();S.unlease(st(),id);P.message='빌린 버스를 반납했어요. 이번 단계 임차료가 들지 않아요.';return true;};
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
    /* 끌기가 아무것도 안 바꾸고 끝났을 때 한 줄 이유(2026-11-09): 빈 곳·이미 있는 정류장·규칙 */
    fail:function(tx,snap){if(!this.enabled()||!tx)return;var name=function(id){return app().nodeName(id);};
      if(JSON.stringify(tx.route)!==JSON.stringify(tx.original)&&!this.valid(tx.route)){linkFail(S.routeRule(st(),tx.num)+' '+LINK_HINT);return;}
      if(snap&&tx.original.nodes.indexOf(snap)>=0){linkFail(PB.Narrative.josa(name(snap),'은는')+' 이미 '+R(tx.num)+'에 있어요. '+(tx.mode.index!=null?'선을 다른 정류장 위에 놓으면 사이에 들어가요.':'노선에 없는 정류장 위에 놓으면 이어져요.'));return;}
      linkFail(tx.mode.index!=null?'선은 정류장 위에 놓아야 그 사이에 들어가요.':'끝은 다른 정류장 위에 놓아야 이어져요.');},
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
      r.nodes=opened.nodes;r.stops=opened.stops;P.message=seg+' 구간을 없애 '+R(num)+' 순환을 풀었어요. ';}
    else{
      var left=r.nodes.length>i+1?part(r.nodes.slice(0,i+1),r.stops.slice(0,i+1)):null,right=part(r.nodes.slice(i+1),r.stops.slice(i+1));
      var L=left&&left.nodes.length>=2,Rt=right.nodes.length>=2;
      if(!L&&!Rt){S.deleteRoute(s,num);if(P.editing===num)P.editing=null;P.message=seg+' 구간을 없애 '+R(num)+'이 없어졌어요'+(ids.length?' · 버스 '+ids.length+'대는 대기로':'')+'. ';}
      else if(!L||!Rt){var keep=L?left:right;r.nodes=keep.nodes;r.stops=keep.stops;P.message=seg+' 구간을 없앴어요 · '+R(num)+'은 '+routeText(r)+'. ';}
      else{
        r.nodes=left.nodes;r.stops=left.stops;
        var slot=s.draft.routes.filter(function(x){return x!==r&&!x.nodes.length&&!assigned(x.num).length&&S.routeFits(s,x.num,right);})[0],nr=null;
        if(slot){slot.nodes=right.nodes;slot.stops=right.stops;nr=slot;}else nr=S.addRoute(s,right);
        if(nr){nr.autoPlaced=true;P.message=seg+' 구간을 없애 두 노선으로 나눴어요 · '+R(num)+' '+routeText(r)+' / '+R(nr.num)+' '+routeText(nr)+'(운행 대기 — 버스를 옮겨 주세요). ';}
        else{if(right.nodes.length>left.nodes.length){r.nodes=right.nodes;r.stops=right.stops;}
          P.message=seg+' 구간을 없앴어요 · 노선 한도(최대 '+S.routeLimit(s)+'개)라 짧은 쪽은 지우고 '+R(num)+' '+routeText(r)+'만 남겼어요. ';}
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
        if(placed&&placed.busId!=null)P.message+=' '+B(placed.busId,null).replace(/^대기 버스/,'대기 버스 한 대')+'가 나와 '+R(r.num)+' 운행을 시작해요 · 운영·연료 약 '+app().won(S.busCost(st(),placed.busId,r.num))+'.';
        else if(placed)P.message+=' 대기 버스가 없어 '+R(r.num)+'은 운행 대기예요 — 다른 노선의 버스를 옮겨 주세요.';}
    }render(focus);
  }
  /* 지도 끌기로 잇기(2026-11-09 교사 플레이테스트 — ‘대학교–산업·일자리에 구도심 시장을 넣으려니 산업·일자리 끝에서만 이어짐’):
   *  · 정류장을 노선 선 위에 놓으면 그 구간 두 정류장 사이에 들어간다(고른 노선이 아니어도 그 노선으로)
   *  · 고른 노선의 머리·꼬리 어느 쪽 정류장에서 끌어도 그쪽 끝으로 이어진다(예전엔 머리에서 끌면 정류장 교체), 반대쪽 끝에 놓으면 순환
   *  · 안 이어지면 조용히 끝내지 않고 한 줄로 이유와 되는 방법을 알린다(linkFail)
   *  뜻 정하기는 PB.RouteEdit.link(순수), 규칙 검사는 UI.routeEdit.valid(S.routeFits + 그래프 검사) — 중복 정류장은 순환 닫기만 */
  var LINK_HINT='노선 끝이나 선 위로 끌어 놓으면 이어져요.';
  function minimalToast(text){var b=document.body.classList;if(b.contains('minimal-ui')&&!b.contains('minimal-text'))app().toast(text);}
  function linkFail(text){P.message=text;render();/* 같은 실패를 또 해도 알림이 다시 뜨게(미니멀 화면은 문장이 바뀔 때만 알림) */minimalToast(text);}
  UI.planLinkFail=linkFail;UI.LINK_HINT=LINK_HINT;
  function commitLink(r,next,at,msg){
    if(!UI.routeEdit.valid(next)){linkFail(S.routeRule(st(),r.num)+' '+LINK_HINT);return false;}
    changed();P.editing=r.num;r.nodes=next.nodes.slice();r.stops=next.stops.slice();P.anchor=at;P.message=msg;render();return true;
  }
  function link(from,to){
    if(!from)return;var r,res,name=function(id){return app().nodeName(id);};
    if(!to){linkFail(LINK_HINT);return;}
    if(from.route!=null){r=S.routeByNum(st(),from.route);if(!r)return;
      if(!to.node){linkFail('선은 정류장 위에 놓아야 그 사이에 들어가요.');return;}
      if(r.nodes.indexOf(to.node)>=0){linkFail(PB.Narrative.josa(name(to.node),'은는')+' 이미 '+R(r.num)+'에 있어요. 선을 다른 정류장 위에 놓으면 사이에 들어가요.');return;}
      if(!canAddStop(r,to.node))return;
      changed();P.editing=r.num;r.nodes.splice(from.index+1,0,to.node);r.stops.splice(from.index+1,0,true);P.anchor=from.index+1;P.message=PB.Narrative.josa(name(to.node),'을를')+' 경유하도록 바꿨어요.';render();return;}
    if(!from.node)return;
    // 정류장을 노선 선 위에 놓기 → 그 두 정류장 사이에
    if(to.route!=null){r=S.routeByNum(st(),to.route);if(!r||r.nodes[to.index+1]==null){linkFail(LINK_HINT);return;}
      res=PB.RouteEdit.link(r,from.node,{index:to.index});
      if(!res||res.fail){linkFail(PB.Narrative.josa(name(from.node),'은는')+' 이미 '+R(r.num)+'에 있어요. 다른 정류장을 선 위에 놓으면 사이에 들어가요.');return;}
      commitLink(r,res.route,to.index+1,name(from.node)+' 정류장을 '+name(r.nodes[to.index])+'–'+name(r.nodes[to.index+1])+' 사이에 넣었어요.');return;}
    if(from.node===to.node){linkFail(LINK_HINT);return;}
    r=active();
    if(st().config.challengeApplied&&(from.node==='N'||to.node==='N')&&(!r||r.num!==6)){P.message=S.routeRule(st(),6);render();return;}
    if(!r||r.nodes.indexOf(from.node)<0){if(r&&!r.nodes.length){changed();r.nodes=[from.node];r.stops=[true];}else {r=startRoute();if(!r){render();return;}r.nodes=[from.node];r.stops=[true];}P.editing=r.num;P.anchor=0;insert(to.node);return;}
    var i=r.nodes.indexOf(from.node);
    if(st().config.challengeApplied&&r.num===6&&r.nodes.length===2&&r.nodes.indexOf(to.node)<0){var pair=r.nodes.slice();pair[i]=to.node;if(!S.routeFits(st(),6,{nodes:pair})){P.message=S.routeRule(st(),6);render();return;}changed();S.updateRoute(st(),6,{nodes:pair,stops:[true,true]});P.anchor=i;P.message='광역버스의 마을 정류장을 바꿨어요.';render();return;}
    // 양 끝 어느 쪽에서든 잇기 · 끝에서 반대쪽 끝으로 = 순환
    res=PB.RouteEdit.link(r,from.node,{node:to.node});
    if(res){var head=res.kind==='head';
      commitLink(r,res.route,head?0:res.route.nodes.length-1,res.kind==='loop'?'순환 노선으로 연결했어요. 표시된 순서로 돌아요.':name(from.node)+' 쪽 끝에 '+PB.Narrative.josa(name(to.node),'을를')+' 이었어요.');return;}
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
  var GOAL_DESC={time:'모든 이동의 도착까지 걸린 시간 합이 가장 짧은 계획을 골라요.',reach:'사람이 정해 둔 지역과 탑승 기록이 가장 적은 지역에 버스가 서게 해요. 기록이 없어도 챙겨요.',profit:'이번 단계 수지(지원금 + 운임 − 비용)가 가장 큰 계획을 골라요.'};
  /* 소외 지역 연결(2026-11-10): 정차 여부 우선. 대상 = 사람이 정해 둔 지역 + 탑승 기록 비율이 가장 낮은 지역(1단계는 앞부분만) */
  function goalDesc(id){return GOAL_DESC[id];}
  function goalCriterion(rec){var first=st().phase===1||!st().history.length;
    var zs=(rec.targets||[]).map(function(z){return app().nodeName(z);}).join('·');
    return rec.goal==='reach'?(zs?'이 제안의 ‘소외 지역’은 '+(first?'사람이 정해 둔 지역('+zs+')이에요.':zs+'이에요. 사람이 정해 둔 지역과 탑승 기록이 가장 적은 지역이에요.'):'이 제안의 ‘소외 지역’은 사람이 정해 둔 지역'+(first?'이에요.':'과 탑승 기록이 가장 적은 지역이에요.'))
      :rec.goal==='time'?'이 제안의 ‘빠른 이동’은 모든 이동의 도착 시간 합이에요. 주요 인물을 따로 챙기지는 않아요.'
      :'이 제안의 ‘수익’은 이번 단계 수지예요. 도착 건수는 수지가 같을 때만 따져요.';}
  /* AI 비교(2026-11-05 P1-6): ‘내 노선 | AI 제안’ 두 열 표를 맨 위에. 좋아짐·나빠짐은 색과 글자 둘 다. 값은 모두 같은 예상 함수(Session.expected) */
  function recCompare(rec,v){
    var a=v.before,b=v.after,W=app().won,D=app().duration,pa=peopleCount(a),pb=peopleCount(b),day=st().config.day;
    function who(m){return Object.keys(m.residents||{}).filter(function(id){return m.residents[id]&&m.residents[id].satisfied===true;}).map(function(id){return st().config.residents.filter(function(r){return r.id===id;})[0].name;}).join('·');}
    var rows=[{id:'rec-row-arrived',name:'도착',x:a.arrived+'건',y:b.arrived+'건',d:b.arrived-a.arrived},{id:'rec-row-wait',name:'최장 대기',x:D(a.maxWait),y:D(b.maxWait),d:a.maxWait-b.maxWait},{id:'rec-row-nolink',name:'노선 없음',x:a.noLink+'건',y:b.noLink+'건',d:a.noLink-b.noLink}];
    if(day)rows.push({id:'rec-people',name:'주요 인물 기준 충족',x:pa.ok+'/'+pa.total+'명'+(who(a)?' ('+who(a)+')':''),y:pb.ok+'/'+pb.total+'명'+(who(b)?' ('+who(b)+')':''),d:pb.ok-pa.ok});
    rows.push({id:'rec-row-profit',name:'예상 수지',x:W(a.costs.total),y:W(b.costs.total),d:b.costs.total-a.costs.total});
    var t=el('table',{id:'rec-compare','class':'rec-compare'}),head=el('tr');['','내 노선','AI 제안'].forEach(function(h){head.appendChild(el('th',{scope:'col'},h));});var th=el('thead');th.appendChild(head);t.appendChild(th);var body=el('tbody');
    rows.forEach(function(r){var tr=el('tr',{id:r.id});tr.appendChild(el('th',{scope:'row'},r.name));tr.appendChild(el('td',null,r.x));var td=el('td',{'class':r.d>0?'better':r.d<0?'worse':'same'},r.y);td.appendChild(el('span',{'class':'rec-delta'},r.d>0?'좋아짐':r.d<0?'나빠짐':'같음'));tr.appendChild(td);body.appendChild(tr);});
    t.appendChild(body);return t;
  }
  function ai(panel){
    var d=el('details',{id:'ai-tools'});if(P.rec||P.busy)d.open=true;d.appendChild(el('summary',null,'AI에게 노선 제안받기'));
    var row=el('div',{'class':'goal-row'});[{id:'time',name:'빠른 이동'},{id:'reach',name:'소외 지역 연결'},{id:'profit',name:'수익'}].forEach(function(g){
      var cell=el('div',{'class':'goal-cell'}),b=btn(g.name,'goal-'+g.id,function(){choose(g.id);},'goal-btn');b.dataset.goal=g.id;b.disabled=P.busy;b.setAttribute('aria-pressed',String(!!P.rec&&st().goal===g.id));b.setAttribute('aria-describedby','goal-desc-'+g.id);
      cell.appendChild(b);cell.appendChild(el('p',{id:'goal-desc-'+g.id,'class':'goal-desc note'},goalDesc(g.id)));row.appendChild(cell);});/* 제안이 나오면 비교표가 맨 위(P1-6) — 목표 버튼은 카드 아래로 */if(!P.rec)d.appendChild(row);
    if(P.busy)d.appendChild(el('p',{id:'rec-progress',role:'status'},'노선을 비교하고 있어요…'));
    if(P.rec){var rec=P.rec,c=el('section',{id:'rec-card',tabindex:'-1','aria-labelledby':'rec-card-h'});c.appendChild(el('h3',{id:'rec-card-h'},'‘'+(GOALS[rec.goal]||'')+'’ 제안'));
      var v=recView(rec);c.appendChild(recCompare(rec,v));
      c.appendChild(el('p',{id:'rec-criterion','class':'rec-criterion'},goalCriterion(rec)));if(UI.fairness)c.appendChild(UI.fairness.seenLine(app(),st()));
      if(st().config.day&&v.after.families&&v.after.families.total)c.appendChild(el('p',{'class':'note'},'가족 전원 왕복 '+v.before.families.complete+' → '+v.after.families.complete+'/'+v.after.families.total+'팀'));
      var more=el('details');more.appendChild(el('summary',null,'노선·배차 상세'));c.appendChild(more);var rl=el('ul',{id:'rec-routes','class':'plain'});
      v.rows.forEach(function(row){var li=el('li',{'data-num':row.num},R(row.num)+' · '+routeText(row.route)+' · 버스 '+row.buses.split(',').filter(Boolean).length+'대');
        if(row.changed)li.appendChild(el('b',{'class':'rec-changed'},' 바뀜'));rl.appendChild(li);});
      if(v.resting.length)rl.appendChild(el('li',null,'쉬는 버스 '+v.resting.length+'대'));more.appendChild(rl);
      c.appendChild(el('p',{'class':'note'},'공개된 수요를 기준으로 비교한 제안이에요. 어떤 이동을 책임질지는 직접 결정하세요.'));
      var same=Object.keys(P.recSeen).filter(function(g){return g!==st().goal&&P.recSeen[g]===P.recSeen[st().goal];});
      if(same.length)c.appendChild(el('p',{id:'rec-same','class':'note'},'‘'+same.map(function(g){return GOALS[g];}).join('’·‘')+'’ 목표의 제안과 같은 노선이에요. 지금 버스와 노선 수에서는 목표가 달라도 같은 계획이 나올 수 있어요.'));
      var acts=el('div',{'class':'row-actions'});acts.appendChild(btn(P.preview?'내 노선 보기':'지도에서 미리 보기','rec-preview',function(){P.preview=!P.preview;render();}));
      acts.appendChild(btn('거절','rec-reject',function(){S.markGoalAction(st(),'reject');P.preview=false;P.rec=null;P.message='내 노선을 유지했어요.';render();}));
      acts.appendChild(btn('적용하고 고치기','rec-accept',applyRec,'btn-primary'));c.appendChild(acts);d.appendChild(c);d.appendChild(row);
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
    /* 노선 칩(2026-11-02 휴대폰 정리): ‘1번 · 운행 대기’ 대신 색·선 모양 견본 + 상태(운행 대기·미배정·버스 N대) — 지도에서 노선 번호를 뺀 것과 같게. 이름(빨강 노선 등)은 aria-label·title.
     * 설정 ‘노선 번호 표시’를 켜면 견본 옆에 번호. 같은 크기 칩(css), 고른 노선만 테두리 */
    var newRoutes=app().phaseChanges(st()).newRouteNums;/* 이번 단계에 새로 생긴 노선 칩(P1-3) */
    S.routesInOrder(st()).forEach(function(r){var on=assigned(r.num).length,kind=(S.stopLimit(st(),r.num)===2?'광역 ':S.stopLimit(st(),r.num)===3?'직행 ':'')+(G.isLoop(r)?'순환 ':''),status=!on?'미배정':'버스 '+on+'대';
      var b=btn('','route-'+r.num,function(){P.editing=r.num;P.anchor=null;P.mapSegment=null;P.mapEnd=null;P.preview=false;P.message='정류장을 잇거나 선 중간을 당겨 보세요.';render();},'route-tab');
      var rc=app().routeStyle(r.num).color,top=el('span',{'class':'route-tab-top'});top.appendChild(PB.Names.swatch(r.num,rc));top.appendChild(el('span',{'class':'route-tab-name'},C(r.num)));var fresh=newRoutes.indexOf(r.num)>=0;b.appendChild(top);b.appendChild(el('span',{'class':'route-tab-meta'},[kind.trim(),fresh?'새 노선':''].filter(Boolean).join(' · ')));b.appendChild(el('span',{'class':'route-tab-status'},status));
      b.setAttribute('aria-label',R(r.num)+(fresh?' · 새 노선':'')+(kind?' · '+kind.trim():'')+' · '+status);b.title=b.getAttribute('aria-label');
      b.setAttribute('aria-pressed',String(P.editing===r.num));b.style.setProperty('--route',rc);b.classList.add('route-color');if(PB.MapNetwork&&PB.MapNetwork.luminance(rc)>0.35)b.classList.add('light');list.appendChild(b);});
    var add=btn('+ 새 노선','btn-new-route',function(){startRoute();render('.next-stop');});add.disabled=st().draft.routes.length>=S.routeLimit(st());list.appendChild(add);sec.appendChild(list);sec.appendChild(el('p',{'class':'note'},'이번 단계: 노선 최대 '+S.routeLimit(st())+'개 · 버스 '+st().owned+'대'));var r=active();
    if(r){var c=el('div',{'class':'route-card editing','data-num':r.num}),ok=!G.validateRoute(S.graph(st()),r).length;
      if(S.stopLimit(st(),r.num)===2)c.appendChild(el('p',{id:'regional-rule','class':'callout'},'광역 노선 · 마을 한 곳 ↔ 대도시. 광역 버스 전용·정원 24명. 마을 쪽 정류장을 골라 시내버스와 환승할 수 있게 연결하세요.'));
      if(S.stopLimit(st(),r.num)===3)c.appendChild(el('p',{id:'express-rule','class':'callout'},'직행 노선 · 최대 3개 정류장 ('+new Set(r.nodes).size+'/3). 직행 버스는 정원 18명·주행 속도 1.5배인 전용 버스예요. 정류장은 언제든 바꿀 수 있어요.'));
      var econLine=PB.UI.Econ?PB.UI.Econ.routeLine(st(),r.num):'';if(econLine)c.appendChild(el('p',{id:'route-econ-text','class':'note econ-route'},econLine));
      c.appendChild(el('p',{'class':'route-summary'},R(r.num)+' · '+(G.isLoop(r)?'순환':'왕복')+(ok?(st().config.challengeApplied&&r.num===5?' · 직행 버스 한 바퀴 '+app().duration(PB.Schedule.cycleMinutes(S.graph(st()),st().config,7,r)):' · 한 바퀴 '+app().duration(G.cycleMinutes(S.graph(st()),r))):'')));
      if(!r.nodes.length)c.appendChild(el('p',{'class':'note'},'아직 연결한 정류장이 없어요. 지도나 아래 목록에서 두 곳 이상 선택하세요.'));
      var running=assigned(r.num),allocation=el('div',{id:'route-allocation','class':running.length?'note':'callout warn'});
      if(running.length)allocation.textContent='운행 버스 '+running.length+'대';
      else{
        allocation.appendChild(el('p',null,'운행 버스 없음 · 이 노선은 아직 운행하지 않아요.'));
        allocation.appendChild(el('p',{'class':'note'},'아래 버스를 선택하면 기존 노선에서 이 노선으로 옮겨 배정해요.'));
        st().draft.buses.forEach(function(b){if(!S.canAssign(st(),b.id,r.num))return;var lab=busLabels(st().draft.buses)[b.id];allocation.appendChild(btn(b.routeNum==null?lab+' 배정':lab+' 옮기기 ('+C(b.routeNum)+'→'+C(r.num)+')','assign-route-'+b.id,function(){changed();S.assign(st(),b.id,r.num);P.message='버스 한 대를 '+R(r.num)+'에 배정했어요.';render();}));});
      }c.appendChild(allocation);
      var ol=el('ol',{'class':'stop-order'}),ns=G.isLoop(r)?r.nodes.slice(0,-1):r.nodes;
      ns.forEach(function(id,i){var li=el('li',{'data-stop-index':i}),handle=btn('↕','drag-stop-'+i,function(){},'stop-drag-handle');handle.setAttribute('aria-label',app().nodeName(id)+' 순서 이동. 드래그 또는 위아래 방향키');li.appendChild(handle);reorderHandle(handle,ol,r,i);
        var b=btn(app().nodeName(id),'stop-'+i,function(){P.anchor=i;P.message=app().nodeName(id)+' 다음에 추가할 곳을 고르세요.';render('#stop-'+i);},'stop-anchor');
        b.setAttribute('aria-pressed',String(P.anchor===i));li.appendChild(b);var del=btn('×','remove-stop-'+i,function(){removeAt(r,i);},'btn-ghost');del.setAttribute('aria-label',app().nodeName(id)+' 정류장 제거');li.appendChild(del);ol.appendChild(li);});c.appendChild(ol);
      // 순서 바꾸기·경유지 편집은 정류장이 세 곳 이상일 때 의미가 있어 그때만 안내한다
      if(ns.length>=3)c.appendChild(el('p',{id:'edit-tips','class':'note'},'↕ 손잡이를 끌면 정류장 순서가 바뀌어요. 지도에서는 노선 양 끝 어디서든 이어 가고, 정류장을 선 위로 끌어 놓으면(또는 선 중간을 정류장으로 당기면) 그 사이에 들어가요. 가운데 정류장을 끌면 교체돼요. 선을 두 번 누르면 그 구간(두 정류장 사이 길)만 없어져요. 잘못 고쳤다면 되돌리기를 누르세요.'));
      if(G.isLoop(r))c.appendChild(el('p',{'class':'note'},'마지막 정류장에서 '+PB.Narrative.josa(app().nodeName(r.nodes[0]),'으로')+' 돌아와요.'));
      if(r.nodes.length){
        var origin=r.nodes[P.anchor==null?0:P.anchor],needs={};
        PB.Demand.base(st().config,st().phase,st().seed).forEach(function(q){if(q.o===origin)needs[q.d]=(needs[q.d]||0)+1;});
        var demand=el('p',{id:'stop-demand','class':'note'});
        demand.textContent=app().nodeName(origin)+'에서 가려는 곳: '+(Object.keys(needs).map(function(id){return app().nodeName(id)+' '+needs[id]+'건';}).join(' · ')||'현재 요청 없음');c.appendChild(demand);
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
    var labels=busLabels(st().draft.buses);st().draft.buses.forEach(function(b){var row=el('div',{'class':'bus-assignment','data-bus':b.id});row.appendChild(el('label',{'for':'bus-sel-'+b.id},labels[b.id]+(b.leased?' · 임차(이번 단계)':'')+(st().config.challengeApplied&&b.id===9?' · 광역 (24명)':st().config.challengeApplied&&b.id===7?' · 직행 (18명 · 1.5배)':'')));
      var sel=el('select',{id:'bus-sel-'+b.id,onchange:function(e){changed();S.assign(st(),b.id,e.target.value===''?null:Number(e.target.value));render('#bus-sel-'+b.id);}});
      sel.appendChild(el('option',{value:''},'쉬기'));S.routesInOrder(st()).forEach(function(r){if(!S.canAssign(st(),b.id,r.num))return;var o=el('option',{value:r.num},R(r.num)+' '+(G.isLoop(r)?'순환':'왕복')+(G.validateRoute(S.graph(st()),r).length?' (편집 중)':''));sel.appendChild(o);});
      sel.value=b.routeNum==null?'':String(b.routeNum);row.appendChild(sel);sec.appendChild(row);});
    if(sharedRoutes().length)sec.appendChild(el('p',{'class':'note',id:'spacing-note'},sharedRoutes().map(function(n){return C(n);}).join(', ')+' 노선처럼 같은 노선에 여러 대를 배정하면 한 바퀴 시간을 기준으로 간격을 자동 조절해 출발해요.'));
    S.toPlan(st()).buses.forEach(function(b){if(b.route&&b.route.nodes.length>=2)sec.appendChild(el('p',{'class':'note'},(labels[b.id]||B(b.id))+' · '+app().clock(b.offset)+' 첫 출발'));});
    if(!st().config.progression&&st().phase>=cfg.fourthFromPhase&&st().owned<st().config.bus.maxBuses)sec.appendChild(btn('버스 한 대 들이기','btn-fourth',function(){changed();S.introduceFourth(st());P.message='새 버스를 노선에 배정해 주세요.';render();}));panel.appendChild(sec);
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
    var s=st(),pv=S.previewRec(s,rec);
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
    var ul=el('ul',{'class':'resident-outcomes'});missing.slice(0,3).forEach(function(id){var z=m.zones[id];ul.appendChild(el('li',null,app().nodeName(id)+'에서 출발하는 이동 요청 '+(z.N-z.arrived)+'건은 아직 도착하기 어려워요.'));});
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
      box.appendChild(el('p',null,'출발하려면 '+R(r.num)+'을 정해 주세요. 버스 '+ids.length+'대가 배정돼 있는데 정류장이 '+(r.nodes.length?'한 곳뿐이에요.':'아직 없어요.')));
      var acts=el('div',{'class':'row-actions'});
      acts.appendChild(btn(R(r.num)+' 이어서 만들기','blocker-edit-'+r.num,function(){P.editing=r.num;P.anchor=null;P.preview=false;P.message='지도에서 정류장을 눌러 '+R(r.num)+'을 이어 주세요.';render('#route-'+r.num);}));
      acts.appendChild(btn('버스 '+ids.length+'대 쉬게 하기','blocker-rest-'+r.num,function(){changed();ids.forEach(function(id){S.assign(st(),id,null);});P.message='버스 '+ids.length+'대는 이번 운행에서 쉬어요. 다시 쓰려면 버스 배정에서 노선을 고르세요.';render('#btn-depart');}));
      box.appendChild(acts);});
    panel.appendChild(box);
  }
  // 상태 메시지가 없을 때 지금 할 일을 알려 준다
  function hint(){var r=active();if(!r||P.preview)return '';
    if(!r.nodes.length)return '지도에서 정류장 두 곳을 차례로 누르면 '+R(r.num)+'이 생겨요. 누구의 길부터 이을지 골라 보세요.'+busNote(r);
    if(r.nodes.length===1)return app().nodeName(r.nodes[0])+'에서 이어 갈 정류장을 하나 더 누르세요.'+busNote(r);return '';}
  // 노선이 완성되면 생길 일(자동 배치)과 비용을 미리 알린다
  function busNote(r){if(r.autoPlaced||assigned(r.num).length)return '';var b=S.restingFor(st(),r.num);
    return b?' 이으면 '+B(b.id,null).replace(/^대기 버스$/,'대기 중인 버스 한 대')+'가 바로 운행해요(운영·연료 약 '+app().won(S.typicalBusCost(st()))+').':' 대기 버스가 없어 노선만 생겨요.';}
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
    panel.appendChild(el('p',{id:'plan-message',role:'status','class':P.preview?'callout':'note'},PB.Names.text(P.message||hint())));
    var FA=UI.fairness,hooks={rerender:render,nudge:P.nudge||null};if(FA){var fc=s.phase===3?FA.petitionCard(App,s,hooks):s.phase===4?FA.elderCard(App,s,hooks):null,fr=FA.required(App,s);if(fc)panel.appendChild(fc);if(fr)panel.appendChild(fr);if(FA.profitToggle)panel.appendChild(FA.profitToggle(App,s,hooks));}
    // 노선을 하나라도 완성한 뒤에만 막힌 이유를 띄운다(처음엔 위 안내가 할 일을 알려 줌)
    var blocked=s.draft.routes.some(function(r){return r.nodes.length>=2;})?blockers():[];if(blocked.length)blocker(panel,blocked);
    routes(panel);buses(panel);outlook(panel);ai(panel);
    var errors=S.validate(s),box=el('div',{id:'plan-errors'});errors.filter(function(e){return !s.draft.routes.some(function(r){return (!r.nodes.length||blocked.indexOf(r)>=0)&&e.indexOf(r.num+'번 노선:')===0;});}).forEach(function(e){box.appendChild(el('p',{'class':'callout warn'},PB.Names.text(e)));});panel.appendChild(box);
    var missing=unassigned();if(missing.length)panel.appendChild(el('p',{id:'unassigned-warning','class':'callout warn'},missing.map(function(r){return C(r.num);}).join(', ')+' 노선은 버스 미배정으로 운행하지 않아요.'));
    var depart=btn('이 노선으로 출발','btn-depart',function(){if(S.validate(s).length)return;if(whyNudge(s))return;P.nudge=null;departCheck();},'btn-primary btn-lg');depart.disabled=errors.length>0||P.busy||PB.Choices.required(s).length>0;if(PB.Choices.required(s).length)depart.setAttribute('aria-describedby','choice-required');
    var foot=el('div',{id:'depart-bar','class':'depart-bar'});foot.appendChild(depart);panel.appendChild(foot);
    App.onNodeClick=function(id){if(P.preview){P.message='AI 제안을 적용하거나 내 노선으로 돌아온 뒤 편집하세요.';render();return;}mapInsert(id);};
    App.onLink=function(from,to){if(!P.preview)link(from,to);};App.onRouteDouble=function(num,index){cutSegment(num,index);};App.onRouteClick=function(num,index){if(P.preview)return;P.editing=num;P.anchor=index;P.mapEnd=null;P.mapSegment={num:num,index:index};P.message='이 구간에 추가할 정류장을 누르세요.';render();};
    // 출발 버튼은 스크롤 영역 밖 아래 줄에 둔다 — 내용을 덮지 않는다(편집할 때 스크롤 위치 유지)
    var bodyWrap=el('div',{'class':'panel-body'});while(panel.firstChild&&panel.firstChild!==foot)bodyWrap.appendChild(panel.firstChild);panel.insertBefore(bodyWrap,foot);bodyWrap.scrollTop=P.scroll||0;
    P.baseline=snapshot();var r=active();return{selectable:P.preview?[]:nextStops(),selected:P.preview?[]:(r?r.nodes:[]),activeRoute:P.editing,preview:P.preview&&P.rec?P.rec.plan:null};
  };
  /* 출발 확인(2026-11-05 지시서 P0-2 — 11-02 "이대로 출발할까요?만 묻는다" 결정을 사용자 지시서가 뒤집음, 이 커밋만 되돌리면 복구):
   * 점검 목록 = 운행 버스 0대 · 쉬는 버스와 보유비 · 노선이 없는 정류장(새 정류장 먼저) · 출발지나 목적지가 노선에 없는 인물. 예상 수지는 넣지 않는다(2026-11-06 사용자 결정, 계획 화면에 있음).
   * 막는 문제(운행 버스 0대)면 제목을 바꾸고 기본 포커스를 ‘노선 고치기’에. 경고는 접지 않고 본문에 최대 3줄, 더 있을 때만 ‘자세히’ — 경고가 없으면 ‘자세히’를 만들지 않는다 */
  function departLines(s){
    var c=S.departChecks(s),out=[],W=app().won,N=app().nodeName,F=s.config.finance;
    function list(a,fmt){return a.slice(0,4).map(fmt).join(', ')+(a.length>4?' 외 '+(a.length-4)+'곳':'');}
    if(c.noBus)out.push({id:'depart-no-bus',text:'이대로 출발하면 아무도 버스를 탈 수 없어요.'});
    if(c.resting)out.push({id:'depart-resting',text:'쉬는 버스 '+c.resting+'대 · 이번 단계 보유비 '+c.resting+' x '+W(F.holding)+' = '+W(c.restingCost)+'이 그대로 나가요.'});
    if(c.restingLeased)out.push({id:'depart-resting-leased',text:'빌린 버스 '+c.restingLeased+'대가 쉬어요 · 임차료 '+W(c.restingLeaseCost)+'이 그대로 나가요.'});
    if(c.unserved.length)out.push({id:'depart-unserved',text:'노선이 없는 정류장 '+c.unserved.length+'곳: '+list(c.unserved,function(id){return N(id)+(c.newStops.indexOf(id)>=0?'(새)':'');})+'.'});
    if(c.residents.length)out.push({id:'depart-residents',text:'출발지나 목적지에 노선이 없는 사람: '+c.residents.map(function(r){return r.name+'('+N(r.o)+'→'+N(r.d)+')';}).join(', ')+'.'});
    return {noBus:c.noBus,lines:out};
  }
  /* 이유 안내(2026-11-10): 답은 골랐는데 이유가 비었으면 같은 단계의 첫 출발 클릭에서만 한 번 안내하고 이유 칸으로 포커스. 안내 여부는 P에만(저장 안 함) */
  function whyNudge(s){var k=UI.fairness&&UI.fairness.kindOf(s);if(!k)return false;var f=s[PB.Choices.KINDS[k].field];P.nudged=P.nudged||{};if(!f||!f.choice||f.why||P.nudged[k])return false;P.nudged[k]=true;P.nudge=k;render('#'+k+'-why');return true;}
  function departCheck(){
    var s=st(),body=document.querySelector('#confirm-depart-body'),c=departLines(s),show=c.lines.slice(0,3),rest=c.lines.slice(3);body.textContent='';
    document.querySelector('#confirm-depart-h').textContent=c.noBus?'운행하는 버스가 없어요':'이대로 출발할까요?';
    function put(box,l){box.appendChild(el('li',{id:l.id},l.text));}
    if(show.length){var ul=el('ul',{id:'depart-checks','class':'callout warn depart-checks'});show.forEach(function(l){put(ul,l);});body.appendChild(ul);}
    if(rest.length){var more=el('details',{id:'depart-more'});more.appendChild(el('summary',null,'자세히'));var ul2=el('ul',{'class':'depart-checks'});rest.forEach(function(l){put(ul2,l);});more.appendChild(ul2);body.appendChild(more);}
    
    document.querySelector('#confirm-depart').showModal();document.querySelector(c.noBus?'#confirm-no':'#confirm-yes').focus();
  }
  var M=PB.Metrics;
  document.querySelector('#confirm-yes').addEventListener('click',function(){document.querySelector('#confirm-depart').close();if(S.startRun(st()))app().go('run');});
  // 노선 고치기: 창을 닫고 지도로 돌아간다
  document.querySelector('#confirm-no').addEventListener('click',function(){document.querySelector('#confirm-depart').close();});
})(window);
