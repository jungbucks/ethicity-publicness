/* Presentation only: every estimate comes from the existing economy adapter. */
(function(root){
 'use strict';var PB=root.PB,KEY='ethicity.publicness.seenTips',full=false,timer,lastMessage='',lastRunStatus='',lastDraft='',seen={},pendingTips={};
 root.MINIMAL_UI=new URLSearchParams(location.search).get('minimal')!=='0';
 try{seen=JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){}
 var tips={bus:'버스 칩을 노선 위로 옮겨 보세요.',service:'정류장 링 6칸을 채우면 지원금을 받아요.',lease:'빌린 버스는 이번 단계가 끝나면 돌아가요.',emergency:'버스를 골라 필요한 노선으로 옮기세요.',express:'직행은 7호차로 최대 세 곳을 이어요.',regional:'광역은 9호차로 마을과 대도시를 이어요.'};
 function $(s){return document.querySelector(s);}function el(t,cls,text){var n=document.createElement(t);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function mark(key){seen[key]=true;try{localStorage.setItem(KEY,JSON.stringify(seen));}catch(e){}}
 function toast(text){var n=$('#minimal-toast');if(!n)return;n.textContent=text;n.hidden=false;clearTimeout(timer);timer=setTimeout(function(){n.hidden=true;n.textContent='';},2000);}
 function tip(key){if(seen[key]||!root.MINIMAL_UI||full||pendingTips[key])return;if($('#minimal-toast')&&!$('#minimal-toast').hidden){pendingTips[key]=true;setTimeout(function(){delete pendingTips[key];if(['plan','run'].includes(document.body.dataset.screen))tip(key);},2100);return;}mark(key);toast(tips[key]);}
 function text(on){full=!!on;PB.App.render();var b=$('#minimal-text-toggle');if(b)b.setAttribute('aria-pressed',String(full));if(full){var routes=$('#text-routes');if(routes)routes.open=true;}refresh();}
 function set(on){root.MINIMAL_UI=!!on;PB.App.render();}
 function project(id){var n=PB.App.nodeXY(id);return PB.App.view.project(n.x,n.y);}
 function signals(){
  var layer=$('#minimal-signals'),s=PB.App.s;if(!layer)return;layer.replaceChildren();var oldProfit=$('#minimal-profit');if(oldProfit)oldProfit.remove();
  if(!root.MINIMAL_UI||full||!s||!['plan','run'].includes(document.body.dataset.screen))return;
  var E=PB.UI.Econ,expected=E.plan(s),k=expected.k,profit=el('div','minimal-profit');profit.dataset.profit=k.total;
  profit.classList.toggle('negative',k.total<0);profit.title='이번 단계 예상 수지 · 기본 수요 기준 · '+PB.App.won(k.total);profit.setAttribute('aria-label',profit.title);
  profit.id='minimal-profit';profit.append(el('small',null,'예상'),el('strong',null,(k.total>0?'+':'')+Math.round(k.total).toLocaleString('ko-KR')));$('.map-toolbar').append(profit);
  (k.service||[]).forEach(function(c){var p=project(c.id),count=c.stops;
   if(s.stage==='run'&&s.current&&s.current.result){var time=PB.UI.runState().tf;count=s.current.result.timelines.reduce(function(n,tl){return n+(tl.visits||[]).filter(function(v){return v.kind==='stop'&&v.node===c.id&&v.t<=time;}).length;},0);}
   var ring=el('div','minimal-service');ring.style.left=p.left+'px';ring.style.top=p.top+'px';ring.setAttribute('role','img');ring.setAttribute('aria-label',c.label+' 공공서비스 '+count+'/'+c.need+'번 정차');ring.title=ring.getAttribute('aria-label');
   for(var i=0;i<c.need;i++){var bar=el('i',i<count?'filled':'');bar.style.transform='rotate('+(i*360/c.need)+'deg) translateY(-27px)';ring.append(bar);}if(count>=c.need)ring.append(el('b',null,'✓'));layer.append(ring);
  });
  PB.Session.routesInOrder(s).forEach(function(r){if(r.nodes.length<2)return;var n=s.draft.buses.filter(function(b){return b.routeNum===r.num;}).length,h=E.headway(s,r.num,n),p=project(r.nodes[0]),q=project(r.nodes[1]);
   var badge=el('span','minimal-headway',h==null?'◷ —':'◷ '+(Math.round(h*(s.config.day.end-s.config.day.start)/s.config.bus.window/60*10)/10)+'h');badge.style.left=(p.left+q.left)/2+'px';badge.style.top=((p.top+q.top)/2-22)+'px';badge.style.color=PB.App.routeStyle(r.num).color;badge.title=E.routeLine(s,r.num);badge.setAttribute('aria-label',badge.title);layer.append(badge);
  });
  if(s.stage==='plan'&&s.phase===1&&!s.draft.routes.some(function(r){return r.nodes.length>1;})){
   var p=project('F'),mid=project('A'),q=project('D'),hand=el('div','minimal-hand','☝');hand.setAttribute('aria-hidden','true');hand.style.left=p.left+'px';hand.style.top=p.top+'px';hand.style.setProperty('--demo-mid-x',(mid.left-p.left)+'px');hand.style.setProperty('--demo-mid-y',(mid.top-p.top)+'px');hand.style.setProperty('--demo-x',(q.left-p.left)+'px');hand.style.setProperty('--demo-y',(q.top-p.top)+'px');layer.append(hand);
  }
 }
 function result(){
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
 function reflection(){if($('#minimal-reflection'))return;var answer=$('#reflection-answer');if(!answer)return;var cards=el('div','minimal-reflection');cards.id='minimal-reflection';['더 많은 사람을 빠르게','오래 기다린 사람부터'].forEach(function(label){var b=el('button','btn',label);b.type='button';b.setAttribute('aria-pressed',String(answer.value===label));b.onclick=function(){answer.value=label;answer.dispatchEvent(new Event('input',{bubbles:true}));cards.querySelectorAll('button').forEach(function(n){n.setAttribute('aria-pressed',String(n===b));});};cards.append(b);});answer.before(cards);}
 function emergency(){var dialog=$('#emergency-dialog');document.body.classList.toggle('minimal-emergency',!!dialog);if(!dialog||$('#minimal-emergency-buses')||!root.MINIMAL_UI)return;var s=PB.App.s,rs=PB.UI.runState(),counts=PB.Sim.occupancyAt(s.current.result,rs.tf),chips=el('div','minimal-emergency-buses');chips.id='minimal-emergency-buses';
  dialog.querySelectorAll('#emergency-buses li').forEach(function(li){var id=Number(li.dataset.bus),b=el('button','btn','🚌 '+id+' · '+counts[id]+'/'+PB.Schedule.vehicle(s.config,id).capacity);b.type='button';b.setAttribute('aria-label',li.textContent);b.title=li.textContent;b.onclick=function(){var select=$('#emergency-bus');select.value=String(id);select.dispatchEvent(new Event('change',{bubbles:true}));chips.querySelectorAll('button').forEach(function(n){n.setAttribute('aria-pressed',String(n===b));});};chips.append(b);});dialog.querySelector('h2').after(chips);
 }
 function refresh(){
  document.body.classList.toggle('minimal-ui',root.MINIMAL_UI);document.body.classList.toggle('minimal-text',full);var toggle=$('#minimal-ui-toggle');if(toggle)toggle.textContent=root.MINIMAL_UI?'기본 화면':'미니멀 화면';
  var s=PB.App.s,screen=document.body.dataset.screen;if(!s)return;if(full&&screen==='plan')document.body.classList.add('plan-text-open');
  if(root.MINIMAL_UI){if(screen==='result')result();if($('#reflection-answer'))reflection();if(full&&$('#minimal-result-details'))$('#minimal-result-details').open=true;}
  var lease=$('#btn-lease');if(lease&&root.MINIMAL_UI&&!full){lease.setAttribute('aria-label',lease.textContent+' · '+($('#lease-note')?.textContent||''));lease.textContent='+1 · '+s.config.finance.lease.fee.toLocaleString('ko-KR');}
  document.querySelectorAll('.depot-bus,#btn-lease').forEach(function(b){b.title=($('#lease-note')?.textContent||'')+' · '+($('.depot-head .depot-cost')?.textContent||'');});
  var message=$('#map-plan-message');if(message&&lastMessage!==message.textContent){if(lastMessage&&root.MINIMAL_UI&&!full)toast(message.textContent);lastMessage=message.textContent;}
  var draft=JSON.stringify(s.draft.routes);if(draft!==lastDraft){lastDraft=draft;if(s.stage==='plan'&&s.draft.routes.some(function(r){return r.nodes.length>1;}))tip('bus');}
  signals();if(root.MINIMAL_UI&&!full&&s.stage==='plan'){var r=PB.UI.routeEdit.active();if(r&&r.num===5)tip('express');else if(r&&r.num===6)tip('regional');else if(seen.bus&&(PB.UI.Econ.plan(s).k.service||[]).some(function(c){return c.stops>0;}))tip('service');}
 }
 function init(){
  var stage=$('#stage'),layer=el('div');layer.id='minimal-signals';stage.append(layer);var t=el('div','minimal-toast');t.id='minimal-toast';t.setAttribute('role','status');t.setAttribute('aria-live','polite');t.hidden=true;stage.append(t);
  var controls=el('div','minimal-switches'),b=el('button','btn','지도·텍스트 보기');b.id='minimal-text-toggle';b.type='button';b.onclick=function(){text(!full);};controls.append(b);var flag=el('button','btn','기본 화면');flag.id='minimal-ui-toggle';flag.type='button';flag.onclick=function(){set(!root.MINIMAL_UI);};$('#help').append(flag);$('#topbar').append(controls);
  var help=el('details');help.id='minimal-tip-help';help.append(el('summary',null,'처음 안내 다시 보기'));Object.keys(tips).forEach(function(k){help.append(el('p',null,tips[k]));});var replay=el('button','btn','안내 다시 시작');replay.type='button';replay.onclick=function(){seen={};try{localStorage.removeItem(KEY);}catch(e){}$('#help').close();refresh();};help.append(replay);$('#help').append(help);
  var render=PB.App.render;PB.App.render=function(){var r=render.apply(this,arguments);refresh();return r;};
  $('#btn-view-toggle').addEventListener('click',function(){if(root.MINIMAL_UI)text(this.textContent.indexOf('3D')>=0);});
  document.addEventListener('click',function(e){if(e.target.closest('#plan-text-toggle')&&root.MINIMAL_UI)text($('#plan-text-toggle').getAttribute('aria-expanded')==='true');});
  document.addEventListener('pointerover',function(e){if(e.target.closest('#btn-lease'))tip('lease');});document.addEventListener('pointerdown',function(e){var b=e.target.closest('.depot-bus,#btn-lease');if(!b)return;var hold=setTimeout(function(){if(root.MINIMAL_UI)toast(b.title);},550);document.addEventListener('pointerup',function(){clearTimeout(hold);},{once:true});document.addEventListener('pointercancel',function(){clearTimeout(hold);},{once:true});});
  new MutationObserver(function(){var m=$('#map-plan-message');if(m&&m.textContent!==lastMessage){lastMessage=m.textContent;if(root.MINIMAL_UI&&!full)toast(lastMessage);}var r=$('#run-status');if(r&&r.textContent!==lastRunStatus){lastRunStatus=r.textContent;if(root.MINIMAL_UI&&!full)toast(lastRunStatus);}}).observe($('#panel'),{childList:true,subtree:true,characterData:true});
  new ResizeObserver(signals).observe(stage);setInterval(function(){if(PB.App.s&&PB.App.s.stage==='run'){signals();emergency();if($('#emergency-dialog'))tip('emergency');}},500);
  refresh();
 }
 PB.Minimal={set:set,text:text,refresh:refresh,tip:tip};
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(window);
