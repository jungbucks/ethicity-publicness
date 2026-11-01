/* Presentation only: every estimate comes from the existing economy adapter. */
(function(root){
 'use strict';var PB=root.PB,KEY='ethicity.publicness.seenTips',full=false,timer,lastMessage='',lastRunStatus='',lastDraft='',seen={},pendingTips={};
 root.MINIMAL_UI=new URLSearchParams(location.search).get('minimal')!=='0';
 try{seen=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
 /* 첫 등장 팁(한 번만, ethicity.publicness.seenTips) — 2026-11-01: 단계마다 보이던 규칙·재정 표 대신 처음 만질 때 한 줄. 미니멀·기본 화면 모두(텍스트 모드는 패널·도움말에 전문).
  * 금액·기준은 지금 세팅 값으로 채운다. 전문은 도움말 ‘규칙과 재정’ */
 function cfgNow(){return PB.App&&PB.App.s?PB.App.s.config:PB.config;}
 function won(n){return PB.Narrative.won(n);}
 var tips={bus:'버스 칩을 노선 위로 옮겨 보세요.',
  service:function(){var c=cfgNow(),F=c.finance.service,s=PB.App&&PB.App.s,list=F.stops.filter(function(x){return !s||x.fromPhase<=s.phase;}).map(function(x){return x.label;});return list.join('·')+'에 버스가 '+F.minStops+'번 이상 서면 곳마다 '+won(F.amount)+'을 받아요.';},
  lease:'빌린 버스는 이번 단계만 써요.',
  subsidy:function(){var F=cfgNow().finance;return '기본 지원은 버스 1대에 '+won(F.basePerBus)+', 보유비는 1대에 '+won(F.holding)+'이에요.';},
  finance:function(){var s=PB.App&&PB.App.s;return s&&PB.Session.financeRule(s)==='balance-streak'?'누적 잔액이 '+PB.Session.NEGATIVE_LIMIT+'번 연속 0원 미만이면 운영 계약이 끝나요.':'마지막 단계가 끝난 뒤 누적 잔액이 0원 미만이면 파산이에요.';},
  wait:function(){var c=cfgNow();return c.service&&c.service.maxWait!=null?'한 번 이동에 '+PB.Demand.duration(c,c.service.maxWait)+' 넘게 기다리면 그날은 세지 않아요.':'';},
  river:function(){var R=cfgNow().river;return R?'강을 건너는 구간은 다리로 돌아가서, 지도에서 보는 것보다 '+R.factor+'배 오래 걸려요.':'';},
  phaseCost:function(){var s=PB.App&&PB.App.s,F=cfgNow().finance,n=s&&PB.App.phaseChanges?PB.App.phaseChanges(s).buses:0;return n>0?'예상 수지가 달라졌어요: 새 버스 '+n+'대 보유비 −'+won(F.holding*n)+' · 기본 지원 +'+won(F.basePerBus*n)+'.':'';},
  emergency:'버스를 골라 필요한 노선으로 옮기세요.',express:'직행은 7호차로 최대 세 곳을 이어요.',regional:'광역은 9호차로 마을과 대도시를 이어요.'};
 function crossesRiver(s,r){var g=PB.Session.graph(s);return !!g.river&&r.nodes.some(function(id,i){return i>0&&g.river(r.nodes[i-1],id);});}
 function tipText(k){var v=tips[k];return typeof v==='function'?v():v;}
 function $(s){return document.querySelector(s);}function el(t,cls,text){var n=document.createElement(t);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function mark(key){seen[key]=true;try{localStorage.setItem(KEY,JSON.stringify(seen));}catch(e){}}
 /* 알림은 App.toast 하나로 — 빈 문장은 그리지 않는다(2026-11-01: 2단계 ‘노선 설계하기’ 직후 빈 검은 알약) */
 function toast(text){if(PB.App&&PB.App.toast)PB.App.toast(text);}
 function tip(key){if(seen[key]||full||pendingTips[key]||!tipText(key))return;if($('#minimal-toast')&&!$('#minimal-toast').hidden){pendingTips[key]=true;setTimeout(function(){delete pendingTips[key];if(['plan','run'].includes(document.body.dataset.screen))tip(key);},2100);return;}mark(key);toast(tipText(key));}
 /* 머리말의 ‘지도·텍스트 보기’는 버튼 하나(2026-11-01: ‘텍스트로 편집’ 뒤 같은 이름 버튼이 둘 보였다). 켜짐/꺼짐은 aria-pressed와 눌린 모양.
  * 머리말 버튼(opts.view)으로 켜면 글 패널과 함께 2D 지도로, 끄면 원래 보기(3D였으면 3D)로 돌아간다. ‘텍스트로 편집’은 글 패널만 */
 var autoMap=false;
 function text(on,opts){full=!!on;var A=PB.App;
  if(A.view3d&&A.s){var is3d=A.view===A.view3d;if(full&&opts&&opts.view&&is3d){autoMap=true;A.toggleView();}else if(!full&&autoMap){autoMap=false;if(!is3d)A.toggleView();}}
  A.render();var b=$('#minimal-text-toggle');if(b)b.setAttribute('aria-pressed',String(full));if(full){var routes=$('#text-routes');if(routes)routes.open=true;}refresh();}
 function set(on){root.MINIMAL_UI=!!on;PB.App.render();}
 function project(id){var n=PB.App.nodeXY(id);return PB.App.view.project(n.x,n.y);}
 var lastSvc='{}';
 function setService(map){var k=JSON.stringify(map);if(k===lastSvc||!PB.App||!PB.App.net)return;lastSvc=k;PB.App.net.setOptions({service:map});}
 var profitOpen=false;
 function signals(){
  var layer=$('#minimal-signals'),s=PB.App.s;if(!layer)return;layer.replaceChildren();var oldProfit=$('#minimal-profit');if(oldProfit)oldProfit.remove();
  if(!root.MINIMAL_UI||full||!s||!['plan','run'].includes(document.body.dataset.screen)){setService({});return;}
  var E=PB.UI.Econ,expected=E.plan(s),k=expected.k,profit=el('div','minimal-profit');profit.dataset.profit=k.total;profit.id='minimal-profit';
  /* 금액 표시(2026-11-01): 노선이 없으면 숫자 대신 흐린 안내 / 운행 중에는 ‘지금까지’(운임·비용이 들어오는 대로, UI.Econ.live) + 옆에 작게 ‘예상’ */
  var sign=function(n){n=Math.round(n);return (n>0?'+':'')+n.toLocaleString('ko-KR');},run=s.stage==='run'&&s.current&&s.current.result&&PB.UI.runState&&PB.UI.runState(),live=run&&E.live?E.live(s,PB.UI.runState().tf):null;
  if(s.stage==='plan'&&!s.draft.routes.some(function(r){return r.nodes.length>=2;})){profit.classList.add('empty');profit.append(el('small',null,'노선을 만들면 예상 수지가 나와요'));profit.setAttribute('aria-label','이번 단계 예상 수지 · 노선을 만들면 예상 수지가 나와요');}
  else if(live){profit.classList.add('live');profit.dataset.live=live.total;profit.classList.toggle('negative',live.total<0);
   profit.title='지금까지 수지 '+PB.App.won(live.total)+'(기본 지원 − 보유·임차 + 받은 운임 − 든 운영·연료비 + 채운 수행분) · 이번 단계 예상 '+PB.App.won(k.total)+'(기본 수요 기준)';profit.setAttribute('aria-label',profit.title);
   profit.append(el('small',null,'지금까지'),el('strong',null,sign(live.total)),el('small','minimal-profit-expected','예상 '+sign(k.total)));}
  else{profit.classList.toggle('negative',k.total<0);profit.title='이번 단계 예상 수지 · 기본 수요 기준 · '+PB.App.won(k.total);profit.setAttribute('aria-label',profit.title);
   profit.append(el('small',null,'예상'),el('strong',null,sign(k.total)));}
  /* P1-4(2026-11-02): 예상 수지를 누르거나 마우스를 올리면 짧은 내역(지원금·운임·보유비·운영·연료비·임차료) */
  if(!profit.classList.contains('empty')){var cp=PB.Metrics.costParts(k),row=function(t,v){var li=el('li');li.append(el('span',null,t),el('b',null,(v>0?'+':v<0?'−':'')+Math.abs(Math.round(v)).toLocaleString('ko-KR')+'원'));return li;},ul=el('ul','minimal-profit-detail');ul.id='minimal-profit-detail';
   ul.append(row('기본 지원',cp.subsidyBase),row('공공서비스 지원금',cp.subsidyService||0),row('운임',cp.fare),row('버스 보유비',-cp.holding));if(cp.lease)ul.append(row('임차료',-cp.lease));ul.append(row('운영·연료비',-(cp.op+cp.fuel)));
   ul.hidden=!profitOpen;profit.append(ul);profit.tabIndex=0;profit.setAttribute('role','button');profit.setAttribute('aria-expanded',String(profitOpen));profit.setAttribute('aria-controls','minimal-profit-detail');
   profit.addEventListener('click',function(){profitOpen=!profitOpen;ul.hidden=!profitOpen;profit.setAttribute('aria-expanded',String(profitOpen));});
   profit.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();profit.click();}});
   profit.addEventListener('mouseenter',function(){ul.hidden=false;});profit.addEventListener('mouseleave',function(){ul.hidden=!profitOpen;});}
  $('.map-toolbar').append(profit);
  if(s.stage==='plan'&&s.phase>1&&PB.App.phaseChanges&&PB.App.phaseChanges(s).buses>0)tip('phaseCost');
  var svc={},F=s.config.finance.service;
  (k.service||[]).forEach(function(c){var p=project(c.id),count=c.stops;
   if(s.stage==='run'&&s.current&&s.current.result){var time=PB.UI.runState().tf;count=s.current.result.timelines.reduce(function(n,tl){return n+(tl.visits||[]).filter(function(v){return v.kind==='stop'&&v.node===c.id&&v.t<=time;}).length;},0);}
   var ring=el('div','minimal-service');ring.style.left=p.left+'px';ring.style.top=p.top+'px';ring.setAttribute('role','img');ring.setAttribute('aria-label',c.label+' 공공서비스 '+count+'/'+c.need+'회 정차');ring.title=ring.getAttribute('aria-label');
   svc[c.id]={text:Math.min(count,c.need)+'/'+c.need+'회'+(count>=c.need?' · +'+won(F.amount)+' ✓':' · '+c.need+'회면 +'+won(F.amount)),done:count>=c.need,title:c.label+' 공공서비스 '+count+'/'+c.need+'회 정차'+(s.stage==='plan'?'(예상)':'')+' · 하루 '+c.need+'회 이상 서면 '+won(F.amount)};
   for(var i=0;i<c.need;i++){var bar=el('i',i<count?'filled':'');bar.style.transform='rotate('+(i*360/c.need)+'deg) translateY(-27px)';ring.append(bar);}if(count>=c.need)ring.append(el('b',null,'✓'));layer.append(ring);
  });
  setService(svc);
  /* 노선 위 배차 간격 표시(◷ N시간마다 / 2.4h)는 2026-11-01 사용자 지시로 뺐다 — 간격은 노선 편집 수지(#route-econ)·끌기 라벨에 남음 */
 }
 function legacyResult(){
  var panel=$('#panel');if(!panel||$('#minimal-result'))return;var details=el('details','minimal-result-details');details.id='minimal-result-details';details.append(el('summary',null,'자세히'));
  var next=$('#btn-next-phase'),cards=$('#resident-day-results'),scene=el('section','minimal-result');scene.id='minimal-result';
  scene.append(el('h2',null,'오늘의 이동'));
  if(cards){var s=PB.App.s,h=s.history[s.history.length-1],res=s.current.result,econ=PB.Metrics.routeEconomy(res,PB.Session.routesInOrder(s),s.draft.buses,s.config,PB.Session.graph(s));
   var clone=cards.cloneNode(true);clone.removeAttribute('id');clone.querySelectorAll('[id]').forEach(function(n){n.removeAttribute('id');});clone.querySelectorAll('li').forEach(function(li){var title=li.textContent,rd=li.dataset.resident,r=h.residents[rd],riderIds=res.passengers.filter(function(p){return p.residentId===rd;}).map(function(p){return p.id;});li.title=title;
    var loss=null;res.log.filter(function(e){return e.type==='board'&&riderIds.indexOf(e.pid)>=0;}).some(function(e){var tl=res.timelines.filter(function(t){return t.busId===e.bus;})[0],route=tl&&tl.route;if(tl)(tl.assignments||[]).forEach(function(a){if(a.depart<=e.t)route=a.route;});if(!route)return false;var rr=s.draft.routes.filter(function(x){return x.nodes.join('|')===route.nodes.join('|');})[0];loss=rr&&econ.rows.filter(function(x){return x.num===rr.num&&x.profit<0;})[0];return !!loss;});
    var img=li.querySelector('img'),name=li.querySelector('strong,b');li.replaceChildren();if(img)li.append(img);if(name)li.append(name);if(loss)li.append(el('small','minimal-loss',loss.num+'번 · '+PB.App.won(loss.profit)));li.append(el('p',null,r&&r.satisfied?'오늘 일정을 마쳤어요.':loss?'이 노선을 타고 이동했어요.':'내 이동 기록도 살펴 주세요.'));});scene.append(clone);}
  var s=PB.App.s,k=s.history[s.history.length-1].metrics.costs,p=el('p','minimal-result-profit',(k.total>0?'+':'')+PB.App.won(k.total));p.classList.toggle('negative',k.total<0);p.setAttribute('aria-label','이번 단계 수지 '+PB.App.won(k.total));scene.append(p);
  Array.from(panel.children).forEach(function(n){if(n!==next)details.append(n);});panel.prepend(scene,details);
 }
 function legacyReflection(){if($('#minimal-reflection'))return;var answer=$('#reflection-answer');if(!answer)return;var cards=el('div','minimal-reflection');cards.id='minimal-reflection';['더 많은 사람을 빠르게','오래 기다린 사람부터'].forEach(function(label){var b=el('button','btn',label);b.type='button';b.setAttribute('aria-pressed',String(answer.value===label));b.onclick=function(){answer.value=label;answer.dispatchEvent(new Event('input',{bubbles:true}));cards.querySelectorAll('button').forEach(function(n){n.setAttribute('aria-pressed',String(n===b));});};cards.append(b);});answer.before(cards);}
 function emergency(){var dialog=$('#emergency-dialog');document.body.classList.toggle('minimal-emergency',!!dialog);if(PB.App&&PB.App.syncPanelToggle)PB.App.syncPanelToggle();if(!dialog||$('#minimal-emergency-buses')||!root.MINIMAL_UI)return;var s=PB.App.s,rs=PB.UI.runState(),counts=PB.Sim.occupancyAt(s.current.result,rs.tf),chips=el('div','minimal-emergency-buses');chips.id='minimal-emergency-buses';
  // 옮길 수 없는 버스(갈 노선이 없는 버스)는 칩을 막아 둔다 — 고른 버스는 눌린 모양(긴급 조정 창의 기본 선택과 같게)
  var select=$('#emergency-bus');dialog.querySelectorAll('#emergency-buses li').forEach(function(li){var id=Number(li.dataset.bus),b=el('button','btn','🚌 '+id+' · '+(counts[id]||0)+'/'+PB.Schedule.vehicle(s.config,id).capacity),ok=!!(select&&select.querySelector('option[value="'+id+'"]'));b.type='button';b.setAttribute('aria-label',li.textContent+(ok?'':' · 옮길 수 있는 노선 없음'));b.title=b.getAttribute('aria-label');b.disabled=!ok;b.setAttribute('aria-pressed',String(ok&&select.value===String(id)));b.onclick=function(){select.value=String(id);select.dispatchEvent(new Event('change',{bubbles:true}));chips.querySelectorAll('button').forEach(function(n){n.setAttribute('aria-pressed',String(n===b));});};chips.append(b);});dialog.querySelector('h2').after(chips);
 }
 function refresh(){
  document.body.classList.toggle('minimal-ui',root.MINIMAL_UI);document.body.classList.toggle('minimal-text',full);var toggle=$('#minimal-ui-toggle');if(toggle)toggle.textContent=root.MINIMAL_UI?'기본 화면':'미니멀 화면';
  var tb=$('#minimal-text-toggle');if(tb)tb.setAttribute('aria-pressed',String(full));
  var s=PB.App.s,screen=document.body.dataset.screen;if(!s)return;if(full&&screen==='plan')document.body.classList.add('plan-text-open');
  /* 결과 화면은 미니멀·기본 모두 같은 구조(ui-transition.js, 2026-11-01). 텍스트 모드면 ‘자세히’를 펼친다. 옛 legacyResult·legacyReflection은 쓰지 않는다 */
  if(full&&$('#result-details'))$('#result-details').open=true;
  var lease=$('#btn-lease');if(lease&&root.MINIMAL_UI&&!full){lease.setAttribute('aria-label',lease.textContent+' · '+($('#lease-note')?.textContent||''));lease.textContent='+1 · '+s.config.finance.lease.fee.toLocaleString('ko-KR');}
  document.querySelectorAll('.depot-bus,#btn-lease').forEach(function(b){b.title=($('#lease-note')?.textContent||'')+' · '+($('.depot-head .depot-cost')?.textContent||'');});
  var message=$('#map-plan-message');if(message&&lastMessage!==message.textContent){if(lastMessage&&root.MINIMAL_UI&&!full)toast(message.textContent);lastMessage=message.textContent;}
  var draft=JSON.stringify(s.draft.routes);if(draft!==lastDraft){lastDraft=draft;if(s.stage==='plan'&&s.draft.routes.some(function(r){return r.nodes.length>1;}))tip('bus');}
  signals();if(!full&&s.stage==='plan'){var r=PB.UI.routeEdit.active();if(r&&r.num===5)tip('express');else if(r&&r.num===6)tip('regional');else if(r&&crossesRiver(s,r))tip('river');else if(seen.bus&&(PB.UI.Econ.plan(s).k.service||[]).some(function(c){return c.stops>0;}))tip('service');}
 }
 function init(){
  var stage=$('#stage'),layer=el('div');layer.id='minimal-signals';stage.append(layer);var t=el('div','minimal-toast');t.id='minimal-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.hidden=true;stage.append(t);
  var controls=el('div','minimal-switches'),b=el('button','btn','지도·텍스트 보기');b.id='minimal-text-toggle';b.type='button';b.setAttribute('aria-pressed','false');b.onclick=function(){text(!full,{view:true});};controls.append(b);var flag=el('button','btn','기본 화면');flag.id='minimal-ui-toggle';flag.type='button';flag.onclick=function(){set(!root.MINIMAL_UI);};$('#help').append(flag);$('#topbar').append(controls);
  var help=el('details');help.id='minimal-tip-help';help.append(el('summary',null,'처음 안내 다시 보기'));help.addEventListener('toggle',function(){help.querySelectorAll('p.tip-line').forEach(function(n){n.remove();});Object.keys(tips).forEach(function(k){var x=tipText(k);if(x)help.insertBefore(el('p','tip-line',x),replay);});});var replay=el('button','btn','안내 다시 시작');replay.type='button';replay.onclick=function(){seen={};try{localStorage.removeItem(KEY);}catch(e){}$('#help').close();refresh();};help.append(replay);$('#help').append(help);
  var titleText=el('button','btn','설명 보기');titleText.type='button';titleText.onclick=function(){text(!full);titleText.setAttribute('aria-pressed',String(full));};$('.title-copy').append(titleText);document.querySelectorAll('#screen-title label').forEach(function(n){n.title=n.textContent.trim();});
  new MutationObserver(function(){var body=$('#confirm-depart-body');if(!root.MINIMAL_UI||full||body.querySelector('details'))return;var more=el('details');more.append(el('summary',null,'자세히'));Array.from(body.children).forEach(function(n){if(n.id!=='depart-summary')more.append(n);});body.append(more);}).observe($('#confirm-depart-body'),{childList:true}); /* 요약(#depart-summary)은 접지 않는다(P1-5 ①) */
  var render=PB.App.render;PB.App.render=function(){var r=render.apply(this,arguments);refresh();return r;};
  $('#btn-view-toggle').addEventListener('click',function(){if(root.MINIMAL_UI)text(this.textContent.indexOf('3D')>=0);});
  document.addEventListener('click',function(e){if(e.target.closest('#plan-text-toggle')&&root.MINIMAL_UI)text($('#plan-text-toggle').getAttribute('aria-expanded')==='true');});
  document.addEventListener('pointerover',function(e){if(e.target.closest('#btn-lease'))tip('lease');else if(e.target.closest('#minimal-profit,#plan-econ,.depot-cost'))tip('subsidy');else if(e.target.closest('#top-balance'))tip('finance');});
  document.addEventListener('click',function(e){if(e.target.closest('#btn-lease'))tip('lease');else if(e.target.closest('#minimal-profit,#plan-econ'))tip('subsidy');else if(e.target.closest('#top-balance'))tip('finance');},true);
  document.addEventListener('pointerdown',function(e){var b=e.target.closest('.depot-bus,#btn-lease');if(!b||!root.MINIMAL_UI||full)return;var popup=null,x=e.clientX,y=e.clientY;
   var hold=setTimeout(function(){popup=el('div','minimal-cost-tooltip',b.title);popup.setAttribute('role','tooltip');document.body.append(popup);var box=b.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-popup.offsetWidth-8,box.left))+'px';popup.style.top=Math.max(8,box.top-popup.offsetHeight-8)+'px';},550);
   function clear(){clearTimeout(hold);if(popup)popup.remove();document.removeEventListener('pointerup',clear);document.removeEventListener('pointercancel',clear);document.removeEventListener('pointermove',move);}
   function move(p){if(Math.hypot(p.clientX-x,p.clientY-y)>7)clear();}document.addEventListener('pointerup',clear);document.addEventListener('pointercancel',clear);document.addEventListener('pointermove',move);
  });
  new MutationObserver(function(){var m=$('#map-plan-message');if(m&&m.textContent!==lastMessage){lastMessage=m.textContent;if(root.MINIMAL_UI&&!full)toast(lastMessage);}var r=$('#run-status');if(r&&r.textContent!==lastRunStatus){lastRunStatus=r.textContent;if(root.MINIMAL_UI&&!full)toast(lastRunStatus);}}).observe($('#panel'),{childList:true,subtree:true,characterData:true});
  new ResizeObserver(signals).observe(stage);setInterval(function(){if(PB.App.s&&PB.App.s.stage==='run'){signals();emergency();if($('#emergency-dialog'))tip('emergency');}},500);
  refresh();
 }
 PB.Minimal={set:set,text:text,refresh:refresh,tip:tip,tipText:tipText};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
