/* 결과 화면 배치(2026-11-01 단계 전 설명을 결과 화면으로) — 계산은 ui-result.js 원래 화면과 같고, 여기서는 순서만 다시 세운다.
 * 기본(펼치지 않은 상태) 순서:
 *  1. 한 줄 요약 + 큰 숫자 2개(도착률 · 이번 단계 수지, 숫자마다 라벨)
 *  2. 인물 카드(만족/불만족 + 구체적인 이유 한 줄, 누적 n/m · 기준 달성 불가, 누르면 작은 지도) — ui-result.js residentCard
 *  3. 이번 운행에서 생긴 일(돌발 수요·청원·긴급 조정, 시각, 최대 3줄)
 *  4. 생각해 보기: 결과와 잇는 한 줄 + 그 단계 실제 AI 사례 카드(문구·출처 그대로) + 단계 질문 + 두 가지 선택형 답 + 글쓰기(선택)
 *  5. 「자세히」(두 점수·지역별·노선 이용·운행 기록·예상과 실제·생활권 표·주민·운행 중 들린 말(연속 반복 ×N)·재정) — 다음 단계 버튼은 아래 고정 바
 * 예전 단계 전 화면(성찰 ‘다음에는 누구의 이동을 살필까요?’·「마을이 달라졌어요」)은 없다. 그 선택은 실제 효과가 없어서(0단계 조사)
 * 여기 ‘생각해 보기’의 두 가지 답이 되었고, 고른 답(s.choices[단계])은 다음 단계 지도 HUD의 ‘이번 목표’로만 보인다(계산에는 쓰지 않음). */
(function(root){
 'use strict';var PB=root.PB,S=PB.Session,original=PB.UI.result;
 function el(t,a,x){return PB.App.el(t,a,x);}
 function q(panel,sel){return panel.querySelector(sel);}
 // 이번 운행에서 생긴 일(시각순): 돌발 수요·청원·긴급 조정
 function events(App,s,h){
  var out=[];
  if(h.event&&h.event.type==='demand'){var od=PB.Demand.directional(s.config,h.phase)[h.event.odIndex];if(od)out.push({t:h.event.t,text:App.clock(h.event.t)+' · '+App.nodeName(od.o)+'→'+App.nodeName(od.d)+' 요청이 12건 늘었어요(추가 수요).'});}
  if(h.petition)out.push({t:h.petition.t,text:App.clock(h.petition.t)+' · '+App.nodeName(h.petition.zone)+' 주민 청원: 그때까지 요청 '+h.petition.total+'건 중 '+h.petition.count+'명이 아직 도착하지 못했어요.'});
  (s.emergencyLog||[]).filter(function(a){return a.phase===s.phase;}).forEach(function(a){out.push({t:a.at,text:App.clock(a.at)+' · 긴급 조정 · '+(a.busId==null?'변경 없이 계속':a.busId+'호차 → '+a.routeNum+'번 노선')});});
  return out.sort(function(a,b){return a.t-b.t;});
 }
 // 운행 중 들린 말: 같은 사람(주민)·같은 문장이 연속이면 한 줄로 ×N
 function bubbles(App,s){
  var cfg=s.config,list=PB.Narrative.bubbles(s.current.result,cfg,cfg.bus.window).map(function(b){return {t:b.t,node:b.node,text:b.text,who:b.residentId?cfg.residents.filter(function(r){return r.id===b.residentId;})[0].name:'주민'};});
  var ul=el('ul',{id:'bubble-replay','class':'feed'});
  PB.Narrative.mergeRepeats(list,function(b){return b.who+'|'+b.text;}).forEach(function(g){
   var nodes=[];list.slice(list.indexOf(g.item),list.indexOf(g.last)+1).forEach(function(b){if(nodes.indexOf(b.node)<0)nodes.push(b.node);});
   var li=el('li',null,App.clock(g.item.t)+(g.count>1?'~'+App.clock(g.last.t):'')+' · '+g.item.who+'('+nodes.map(App.nodeName).join('·')+'): “'+g.item.text+'”'+(g.count>1?' ×'+g.count:''));
   if(g.count>1)li.dataset.count=g.count;ul.appendChild(li);
  });
  if(!ul.children.length)ul.appendChild(el('li',null,'기록된 말이 없어요.'));
  return ul;
 }
 function think(App,s,h,last){
  var sec=el('section',{id:'result-think','class':'result-think','aria-labelledby':'result-think-h','data-phase':h.phase});
  sec.appendChild(el('h3',{id:'result-think-h'},'생각해 보기'));
  var focus=PB.Narrative.thinkFocus(s.config,h.phase,s.current.result.passengers);if(focus.bridge)sec.appendChild(el('p',{'class':'think-bridge',id:'think-bridge'},focus.bridge));/* P0-4: 이번 결과로 고른 연결 문장 */
  PB.App.renderLearning(sec,h.phase);
  var ethics=PB.stories.phaseEthics[h.phase-1];
  if(ethics&&focus.ethics){var pr=el('p',{'class':'reflection-prompt',id:'think-prompt'});pr.appendChild(el('b',null,ethics.title+'. '));pr.appendChild(document.createTextNode(ethics.text));sec.appendChild(pr);}
  // 두 가지 선택형 답 — 자유 서술(reflections)과 따로 저장(고르면 글이 지워지던 문제 고침)
  var box=el('fieldset',{id:'think-choice','class':'think-choice'});box.appendChild(el('legend',null,last?'다음 학기라면 누구의 이동을 먼저 살필까요?':'다음에는 누구의 이동을 살필까요?'));
  var row=el('div',{'class':'think-options'});
  Object.keys(S.CHOICES).forEach(function(k){
   var b=el('button',{type:'button','class':'btn think-option','data-choice':k,'aria-pressed':String((s.choices||{})[h.phase]===k)},S.CHOICES[k]);
   b.addEventListener('click',function(){s.choices=s.choices||{};if(s.choices[h.phase]===k)delete s.choices[h.phase];else s.choices[h.phase]=k;row.querySelectorAll('.think-option').forEach(function(n){n.setAttribute('aria-pressed',String(s.choices[h.phase]===n.dataset.choice));});PB.App.save();});
   row.appendChild(b);
  });
  box.appendChild(row);if(!last)box.appendChild(el('p',{'class':'note'},'고른 답은 다음 단계 지도 위에 ‘이번 목표’로 보여요.'));sec.appendChild(box);
  sec.appendChild(el('label',{'for':'reflection-answer'},'내 생각을 한두 문장으로 남겨 보세요.'));
  var answer=el('textarea',{id:'reflection-answer',rows:'3',maxlength:'1000'});answer.value=(s.reflections||{})[h.phase]||'';
  answer.addEventListener('input',function(){s.reflections=s.reflections||{};if(answer.value)s.reflections[h.phase]=answer.value;else delete s.reflections[h.phase];PB.App.save();});sec.appendChild(answer);
  sec.appendChild(el('p',{'class':'note'},'정답이나 점수는 없어요. 비워 두고 다음으로 가도 돼요.'));
  return sec;
 }
 PB.UI.result=function(App,panel){
  var result=original(App,panel),s=App.s,h=s.history[s.history.length-1],m=h.metrics,k=m.costs,res=s.current.result,last=s.phase>=s.config.phases.length||!!(s.end&&s.end.cause==='contract');
  var eyebrow=q(panel,'.eyebrow'),title=q(panel,'h2'),scores=q(panel,'#scores'),family=q(panel,'#family-result'),summary=q(panel,'#resident-summary'),notice=q(panel,'#finance-status');
  var details=q(panel,'#result-details'),next=q(panel,'#btn-next-phase'),cards=q(panel,'#resident-day-results');
  var callouts=[].slice.call(panel.querySelectorAll(':scope > p.callout')).filter(function(n){return n!==family&&n!==notice;});
  var news=[].slice.call(panel.querySelectorAll(':scope > details')).filter(function(d){return d.querySelector('#bubble-replay');})[0];
  // 1. 한 줄 요약 + 큰 숫자 2개
  var rs=h.residents||{},ids=Object.keys(rs).filter(function(id){return rs[id];}),happy=ids.filter(function(id){return rs[id].satisfied;}).length;
  var head=el('section',{id:'result-headline','class':'result-headline','aria-label':'이번 단계 요약'});
  head.appendChild(el('p',{id:'result-lead','class':'result-lead'},'이동 요청 '+m.N+'건 중 '+m.arrived+'건이 도착했어요.'+(ids.length?' 주요 인물 '+ids.length+'명 중 '+happy+'명이 만족했어요.':'')));
  var big=el('div',{'class':'result-big'});
  [['도착률',PB.Metrics.fmtRate(m.arrivalRate),m.N+'건 중 '+m.arrived+'건','result-stat-arrival'],['이번 단계 수지',(k.total>0?'+':'')+App.won(k.total),'누적 잔액 '+App.won(S.balance(s)),'result-stat-profit']].forEach(function(r){
   var c=el('div',{'class':'result-stat',id:r[3]});c.appendChild(el('span',{'class':'stat-label'},r[0]));var v=c.appendChild(el('strong',{'class':'stat-value'},r[1]));c.appendChild(el('span',{'class':'stat-sub'},r[2]));
   if(r[3]==='result-stat-profit'&&k.total<0)v.classList.add('negative');big.appendChild(c);});
  head.appendChild(big);
  // 2. 인물 카드
  var people=el('section',{id:'result-people','class':'result-people','aria-labelledby':'result-people-h'});people.appendChild(el('h3',{id:'result-people-h'},'주민들의 하루'));
  if(cards){people.appendChild(cards);people.appendChild(el('p',{'class':'note'},'카드를 누르면 작은 지도에서 그 구간을 보여 줘요.'));}
  // 3. 이번 운행에서 생긴 일
  var ev=events(App,s,h),evs=el('section',{id:'result-events','class':'result-events','aria-labelledby':'result-events-h'});evs.appendChild(el('h3',{id:'result-events-h'},'이번 운행에서 생긴 일'));
  var ul=el('ul',{'class':'plain'});ev.slice(0,3).forEach(function(e){ul.appendChild(el('li',null,e.text));});if(!ev.length)ul.appendChild(el('li',null,'특별한 사건 없이 운행했어요.'));evs.appendChild(ul);
  if(ev.length>3)evs.appendChild(el('p',{'class':'note'},'그 밖의 '+(ev.length-3)+'건은 자세히에서 볼 수 있어요.'));
  // 5. 자세히: 점수·대기·지역·노선·기록·표·재정(내용은 그대로)
  var sm=details.querySelector('summary');sm.textContent='자세히';
  var after=sm.nextSibling,put=function(n){if(n)details.insertBefore(n,after);};
  put(scores);
  var most=res.passengers.reduce(function(a,p){return !a||p.waitTotal>a.waitTotal?p:a;},null),rd=most&&s.config.residents.filter(function(r){return r.id===most.residentId;})[0];
  var key=el('section',{id:'result-key-metrics','class':'result-key-metrics'});key.appendChild(el('h3',null,'가장 오래 기다린 사람'));key.appendChild(el('p',null,most?App.duration(most.waitTotal)+' · '+(rd?rd.name:App.nodeName(most.o)+' 출발 승객'):'발생한 요청 없음'));
  key.appendChild(el('p',{'class':'note'},'미도착자의 운행 종료까지 기다린 시간도 포함해요. 잇는 노선이 없는 요청은 대기 시간과 별도로 상세 기록에서 확인해요.'));put(key);
  put(summary);
  var decisions=(s.emergencyLog||[]).filter(function(a){return a.phase===s.phase;});
  if(decisions.length){var report=el('section',{id:'emergency-report'});report.appendChild(el('h3',null,'운행 중 바꾼 것'));decisions.forEach(function(a){var applied=res.log.filter(function(e){return e.type==='reassign'&&e.bus===a.busId&&e.t>=a.at;})[0];report.appendChild(el('p',null,App.clock(a.at)+' · '+(a.busId==null?'변경 없이 계속':a.busId+'호차 → '+a.routeNum+'번 노선'+(applied?' · '+App.clock(applied.data.starts)+'부터 투입':' · 운행 종료까지 안전하게 옮길 기회가 없었어요.'))));});
   if(s.current.baseline)report.appendChild(el('p',{'class':'note'},'같은 사건에서 조정하지 않았다면 도착 '+s.current.baseline.arrived+'건 → 조정 후 '+m.arrived+'건. 출발 전 예상과는 돌발 수요 조건이 달라요.'));put(report);}
  callouts.forEach(put);
  ['#route-report','#run-log'].forEach(function(id){put(q(panel,id));});
  if(news){var sec=news.querySelector('section'),old=sec.querySelector('#bubble-replay');sec.replaceChild(bubbles(App,s),old);details.appendChild(news);}
  var finance=details.querySelector('#finance');if(finance)details.appendChild(finance);
  /* P2-6(2026-11-02): ‘자세히’ 안의 항목을 소제목별로 접는다(내용은 그대로). 기본으로 ‘두 점수’(가장 많이 남은 곳 포함)만 펼침 */
  [].slice.call(details.children).forEach(function(n){
   if(n===sm||n.tagName==='DETAILS'||n.tagName==='SUMMARY')return;
   var h=n.querySelector&&n.querySelector('h2,h3,h4'),sub=el('details',{'class':'detail-sub','data-for':n.id||''}),s2=el('summary',{'class':'detail-sub-h'});
   if(h&&(h.parentNode===n||h.parentNode.parentNode===n)){s2.appendChild(h);}else s2.textContent=n.getAttribute&&n.getAttribute('aria-label')||'더 보기';
   if(n.id==='scores')sub.open=true;details.insertBefore(sub,n);sub.appendChild(s2);sub.appendChild(n);
  });
  var mapButton=el('button',{type:'button','class':'btn',id:'result-map-toggle',onclick:function(){document.body.classList.toggle('result-map-open');mapButton.setAttribute('aria-expanded',String(document.body.classList.contains('result-map-open')));App.syncStage({});}},'결과 지도 보기');details.insertBefore(mapButton,sm.nextSibling);
  // 다음 단계 버튼은 아래 고정 바(자세히를 펼쳐도 밀려나지 않게)
  var bar=el('div',{id:'result-next-bar','class':'result-next-bar'});bar.appendChild(next);
  panel.textContent='';[eyebrow,title,head,notice,family,people,evs,think(App,s,h,last),details,bar].forEach(function(n){if(n)panel.appendChild(n);});
  var cut=PB.UI.nextCut&&!last?PB.UI.nextCut(s):null;if(cut&&PB.Cutscene.preload)PB.Cutscene.preload(cut);
  return result;
 };
})(window);
