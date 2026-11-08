/* 결과 화면 배치(2026-11-01 단계 전 설명을 결과 화면으로) — 계산은 ui-result.js 원래 화면과 같고, 여기서는 순서만 다시 세운다.
 * 기본(펼치지 않은 상태) 순서:
 *  1. 한 줄 요약 + 큰 숫자 2개(도착률 · 이번 단계 수지, 숫자마다 라벨)
 *  2. 인물 카드(만족/불만족 + 구체적인 이유 한 줄, 누적 n/m · 기준 달성 불가, 누르면 작은 지도) — ui-result.js residentCard
 *  3. 이번 운행에서 생긴 일(돌발 수요·청원·긴급 조정, 시각, 최대 3줄)
 *  4. 다음 운행 목표: 실제 결과에 근거한 한 줄 + 두 가지 선택형 답(글쓰기·사례는 최종 회고로)
 *  3-1. AI라면?(2026-11-06): 이번 계획의 출처 + 다음 단계 입력으로 돌린 AI 제안 세 기준이 각각 무엇을 바꾸자고 하는지(aiCard)
 *  5. 「자세한 기록 보기」(두 점수·지역별·노선 이용·운행 기록·예상과 실제·생활권 표·주민·운행 중 들린 말(연속 반복 ×N)·재정) — 다음 단계 버튼은 아래 고정 바
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
  if(h.petition)out.push({t:h.petition.t,text:App.clock(h.petition.t)+' · '+App.nodeName(h.petition.zone)+' 주민 청원: 그때까지 요청 '+h.petition.total+'건 중 '+h.petition.count+'건이 아직 도착하지 못했어요.'});
  (s.emergencyLog||[]).filter(function(a){return a.phase===s.phase;}).forEach(function(a){out.push({t:a.at,text:App.clock(a.at)+' · 긴급 조정 · '+(a.busId==null?'변경 없이 계속':'버스 한 대 → '+PB.Names.route(a.routeNum))});});
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
 /* AI라면?(2026-11-06 P0-2) — AI 없이 직접 푼 학생도 AI의 판단을 보게. 계산은 계획 화면 ‘AI 제안’과 같은 함수(Advisor.recommend·Session.previewRec·expected)이고,
  * 입력은 다음 단계 계획 화면과 같은 사본(Session.plannedNext)이라 다음 단계에서 같은 기준을 열면 같은 변화가 나온다. 결과 화면에 들어올 때 한 번만 계산해 s.aiCards[단계]에 둔다 */
 var AI_GOALS=[{id:'time',name:'빠른 이동'},{id:'reach',name:'소외 지역 연결'},{id:'profit',name:'수익'}],AI_PICK={many:'time',longest:'reach'},aiJob=null;
 function planSig(plan){return plan.buses.map(function(b){return b.route?b.route.nodes.join('-'):'쉬기';}).sort().join('|');}
 function planSource(s,h){
  var plan=s.current&&s.current.plan,rec=s.lastRec,entry=(s.goalHistory||[]).filter(function(e){return e.phase===h.phase;})[0],goal=entry&&AI_GOALS.filter(function(g){return g.id===entry.goal;})[0];
  if(!plan||!rec||!rec.plan||!entry||entry.action!=='accept'||!goal)return '이번 계획은 직접 만들었어요.';
  if(planSig(plan)===planSig(rec.plan))return '이번 계획은 AI ‘'+goal.name+'’ 제안을 적용했어요.';
  var mine=planSig(plan).split('|').filter(function(x){return x!=='쉬기';}),kept=planSig(rec.plan).split('|').filter(function(x){return mine.indexOf(x)>=0;});
  return kept.length?'이번 계획은 AI ‘'+goal.name+'’ 제안을 적용했어요(일부 고침 포함).':'이번 계획은 직접 만들었어요.';
 }
 function changeText(App,c){
  var N=PB.Narrative.josa,name=App.nodeName,R=PB.Names.route;
  if(c.type==='addRoute'){var ns=c.nodes,loop=ns.length>2&&ns[0]===ns[ns.length-1];return loop?N(ns.slice(0,-1).map(name).join('·'),'을를')+' 도는 순환 노선을':N(name(ns[0]),'과와')+' '+N(name(ns[ns.length-1]),'을를')+' 잇는 노선을';}
  if(c.type==='delRoute')return R(c.num)+'을 없애는 것을';
  if(c.type==='addStop')return R(c.num)+'에 '+name(c.node)+' 정류장을 더하는 것을';
  if(c.type==='delStop')return R(c.num)+'에서 '+name(c.node)+' 정류장을 빼는 것을';
  if(c.type==='moveBus')return N(R(c.num),'으로')+' 버스 한 대를 옮기는 것을';
  if(c.type==='lease')return '버스를 한 대 빌리는 것을';
  return '지금 노선을 그대로 두는 것을';
 }
 function aiRate(m,ids){var N=0,done=0;ids.forEach(function(id){var z=m.zones[id];if(z&&z.N){N+=z.N;done+=z.N*z.rate;}});return N?done/N:0;}
 function aiRow(App,base,before,rec,g){
  var pv=S.previewRec(base,rec),after=S.expected(pv),change=changeText(App,S.planChange(base,pv)),names=(rec.targets||[]).map(App.nodeName).join('·'),F=PB.Metrics.fmtRate;
  var aim=g.id==='time'?'도착 시간을 줄이려고':g.id==='reach'?names+'의 도착률을 높이려고':'수지를 키우려고';
  var total='예상 도착률 '+F(before.arrivalRate)+' → '+F(after.arrivalRate);
  var num=g.id==='time'?total:g.id==='reach'?'예상 도착률 '+F(aiRate(before,rec.targets||[]))+' → '+F(aiRate(after,rec.targets||[])):'예상 수지 '+App.won(before.costs.total)+' → '+App.won(after.costs.total);
  return {goal:g.id,name:g.name,sig:planSig(rec.plan),aim:aim,change:change,num:num,total:total};
 }
 function aiCompute(App,s,h,key){
  return new Promise(function(go){setTimeout(go,0);}).then(function(){
   var base=S.plannedNext(s),before=S.expected(base),rows=[];
   return AI_GOALS.reduce(function(p,g){return p.then(function(){return PB.Advisor.recommend(S.revealed(base),g.id);}).then(function(rec){rows.push(aiRow(App,base,before,rec,g));});},Promise.resolve()).then(function(){
    return {key:key,source:planSource(s,h),rows:rows,same:rows.every(function(r){return r.sig===rows[0].sig;})};
   });
  });
 }
 // 고른 목표의 추천 한 줄과 접힌 세 기준 비교. 계산 캐시를 그대로 읽는다
 function aiMark(sec,choice){
  var goal=AI_PICK[choice];
  if(sec._aiCard){var card=sec._aiCard,entry=(sec._aiSession.goalHistory||[]).filter(function(e){return e.phase===sec._aiPhase;})[0];goal=goal||AI_PICK[(sec._aiSession.choices||{})[sec._aiPhase-1]]||(entry&&entry.goal)||'time';var r=card.rows.filter(function(r){return r.goal===goal;})[0]||card.rows[0];q(sec,'#result-ai-summary').textContent='['+r.name+'] AI는 '+r.change+' 추천해요. ('+r.num+')';}
  sec.querySelectorAll('[data-goal]').forEach(function(li){var on=li.dataset.goal===goal,tag=li.querySelector('.ai-picked-tag');li.classList.toggle('ai-picked',on);if(tag)tag.hidden=!on;});
 }
 function aiPaint(sec,card,s,h,last){
  var body=q(sec,'#result-ai-body');body.textContent='';sec._aiCard=card;sec._aiSession=s;sec._aiPhase=h.phase;body.appendChild(el('p',{id:'result-ai-summary'}));var box=el('details',{id:'result-ai-more'});box.appendChild(el('summary',null,'AI 비교 더 보기'));body.appendChild(box);box.appendChild(el('p',{id:'result-ai-source'},card.source));
  var ul=el('ul',{id:'result-ai-rows','class':'plain'});
  if(card.same)box.appendChild(el('p',{id:'result-ai-same','class':'note'},'이번에는 세 기준의 추천이 같았어요.'));
  card.rows.forEach(function(r){var li=el('li',{'data-goal':r.goal});li.appendChild(el('b',null,'['+r.name+'] '));li.appendChild(document.createTextNode('AI는 '+r.aim+' '+r.change+' 추천해요. ('+r.num+')'));var tag=el('span',{'class':'ai-picked-tag'},'내가 고른 기준');tag.hidden=true;li.appendChild(tag);ul.appendChild(li);});
  box.appendChild(ul);
  box.appendChild(el('p',{'class':'note',id:'result-ai-note'},'AI 추천은 정답이 아니라, 무엇을 중요하게 보느냐에 따라 달라져요. 예상 수치는 '+(last?'이번':'다음')+' 단계 기본 수요 기준이에요.'));
  aiMark(sec,(s.choices||{})[h.phase]);
 }
 function aiCard(App,s,h,last){
  var sec=el('section',{id:'result-ai','class':'result-ai','aria-labelledby':'result-ai-h'});sec.appendChild(el('h3',{id:'result-ai-h'},'AI라면?'));
  var box=el('div',{id:'result-ai-body'});sec.appendChild(box);
  var key=planSig(s.current.plan)+'#'+h.metrics.arrived,saved=(s.aiCards||{})[h.phase];
  if(saved&&saved.key===key){aiPaint(sec,saved,s,h,last);return sec;}
  box.appendChild(el('p',{'class':'note',role:'status',id:'result-ai-wait'},'AI가 세 기준으로 다시 짜 보고 있어요.'));
  if(!aiJob||aiJob.key!==key||aiJob.s!==s)aiJob={key:key,s:s,run:aiCompute(App,s,h,key)};
  aiJob.run.then(function(card){
   if(App.s!==s)return;s.aiCards=s.aiCards||{};s.aiCards[h.phase]=card;if(s.stage==='result'&&s.phase===h.phase)App.save();
   var now=document.querySelector('#result-ai');if(now&&s.stage==='result'&&s.phase===h.phase)aiPaint(now,card,s,h,last);
  }).catch(function(){var w=document.querySelector('#result-ai-wait');if(w)w.textContent='이번에는 AI 제안을 계산하지 못했어요. 다음 단계 계획 화면에서 다시 볼 수 있어요.';});
  return sec;
 }
 function think(App,s,h,last){
  var sec=el('section',{id:'result-think','class':'result-think','aria-labelledby':'result-think-h','data-phase':h.phase});
  sec.appendChild(el('h3',{id:'result-think-h'},'다음 운행 목표'));
  var focus=PB.Narrative.thinkFocus(s.config,h.phase,s.current.result.passengers,h.scores&&h.scores.mobility);if(focus.bridge)sec.appendChild(el('p',{'class':'think-bridge',id:'think-bridge'},focus.bridge));/* P0-4·11-05 P0-3: 이번 결과로 고른 연결 문장(첫 줄 = 자세히의 가장 많이 남은 곳) */
  // 두 가지 선택형 답 — 자유 서술(reflections)과 따로 저장(고르면 글이 지워지던 문제 고침)
  var box=el('fieldset',{id:'think-choice','class':'think-choice'});box.appendChild(el('legend',null,last?'다음 학기라면 누구의 이동을 먼저 살필까요?':'다음에는 누구의 이동을 살필까요?'));
  var row=el('div',{'class':'think-options'});
  Object.keys(S.CHOICES).forEach(function(k){
   var b=el('button',{type:'button','class':'btn think-option','data-choice':k,'aria-pressed':String((s.choices||{})[h.phase]===k)},S.CHOICES[k]);
   b.addEventListener('click',function(){s.choices=s.choices||{};if(s.choices[h.phase]===k)delete s.choices[h.phase];else s.choices[h.phase]=k;row.querySelectorAll('.think-option').forEach(function(n){n.setAttribute('aria-pressed',String(s.choices[h.phase]===n.dataset.choice));});var ai=document.querySelector('#result-ai');if(ai)aiMark(ai,s.choices[h.phase]);PB.App.save();});
   row.appendChild(b);
  });
  box.appendChild(row);if(!last)box.appendChild(el('p',{'class':'note'},'고른 답은 다음 단계 지도 위에 ‘이번 목표’로 보여요.'));sec.appendChild(box);
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
  /* P2(2026-11-05): 시작 화면의 예정 이동과 결과 건수가 같은 뜻으로 읽히게 ‘기본 139건 + 추가 3건’. 추가 = 도착 뒤 생긴 다음 이동 + 돌발 수요 */
  var q0=m.requests||{planned:m.N,followUps:0,extra:0},more=(q0.followUps||0)+(q0.extra||0);
  head.appendChild(el('p',{id:'result-lead','class':'result-lead'},'이동 요청 '+m.N+'건'+(more?'(기본 '+q0.planned+'건 + 추가 '+more+'건)':'')+' 중 '+m.arrived+'건이 도착했어요.'+(ids.length?' 주요 인물 '+ids.length+'명 중 '+happy+'명이 만족했어요.':'')));
  /* P1-10: 지난 결과에서 고른 목표를 이번 결과에서 다시 짚는다(계산에는 쓰지 않음) */
  var goalKey=(s.choices||{})[h.phase-1],prev=s.history.filter(function(x){return x.phase===h.phase-1;})[0];
  if(goalKey&&prev){var pm=prev.metrics,goalLine=goalKey==='longest'?'최장 대기 지난 단계 '+App.duration(pm.maxWait)+' → 이번 '+App.duration(m.maxWait):'도착률 지난 단계 '+PB.Metrics.fmtRate(pm.arrivalRate)+' → 이번 '+PB.Metrics.fmtRate(m.arrivalRate);head.appendChild(el('p',{id:'result-goal'},'이번 목표: '+S.CHOICES[goalKey]+' → 결과: '+goalLine));}
  var big=el('div',{'class':'result-big'});
  [['도착률',PB.Metrics.fmtRate(m.arrivalRate),m.N+'건 중 '+m.arrived+'건','result-stat-arrival'],['이번 단계 수지',(k.total>0?'+':'')+App.won(k.total),'누적 잔액 '+App.won(S.balance(s)),'result-stat-profit']].forEach(function(r){
   var c=el('div',{'class':'result-stat',id:r[3]});c.appendChild(el('span',{'class':'stat-label'},r[0]));var v=c.appendChild(el('strong',{'class':'stat-value'},r[1]));c.appendChild(el('span',{'class':'stat-sub'},r[2]));
   if(r[3]==='result-stat-profit'&&k.total<0)v.classList.add('negative');big.appendChild(c);});
  head.appendChild(big);
  /* 2026-11-06 P0-1: 다음 행동 제안의 첫 줄은 접힌 기록 밖에도(같은 문장) */
  var firstTip=scores&&scores.querySelector('#score-tips li');if(firstTip)head.appendChild(el('p',{id:'result-first-tip','class':'result-first-tip'},firstTip.textContent));
  /* P1-4: 운행 중 → 종료 정산 → 최종 3줄 + 지금 추세로 학기 말 잔액. 숫자는 정산표 그대로 나눠 보이기만 한다 */
  var sp=PB.UI.Econ.settleParts(k);
  if(sp){var settle=el('div',{id:'result-settle'}),sline=function(a,b,c){var n=el('p',c?{'class':c}:null);n.appendChild(el('span',null,a));n.appendChild(el('b',null,b));settle.appendChild(n);},sg=PB.UI.Econ.signed;
   sline('운행 중 (기본 지원 + 운임 − 운영·연료)',sg(sp.running));sline('종료 정산 (보유비 −'+App.won(sp.holding)+(sp.lease?', 임차료 −'+App.won(sp.lease):'')+', 공공서비스 수행분 +'+App.won(sp.service)+')',sg(sp.settle));sline('최종 이번 단계 수지',sg(sp.total),'settle-final');head.appendChild(settle);}
  var trend=PB.UI.Econ.trendLine(s,'이번 단계');if(trend)head.appendChild(el('p',{id:'result-trend','class':'trend-line'+(trend.warn?' warn':'')},trend.text));
  // 2. 인물 카드
  var people=el('section',{id:'result-people','class':'result-people','aria-labelledby':'result-people-h'});people.appendChild(el('h3',{id:'result-people-h'},'주민들의 하루'));
  if(cards){people.appendChild(cards);people.appendChild(el('p',{'class':'note'},'카드를 누르면 작은 지도에서 그 구간을 보여 줘요.'));}
  // 3. 이번 운행에서 생긴 일
  var ev=events(App,s,h),evs=el('section',{id:'result-events','class':'result-events','aria-labelledby':'result-events-h'});evs.appendChild(el('h3',{id:'result-events-h'},'이번 운행에서 생긴 일'));
  var ul=el('ul',{'class':'plain'});ev.slice(0,3).forEach(function(e){ul.appendChild(el('li',null,e.text));});if(!ev.length)ul.appendChild(el('li',null,'특별한 사건 없이 운행했어요.'));evs.appendChild(ul);
  if(ev.length>3)evs.appendChild(el('p',{'class':'note'},'그 밖의 '+(ev.length-3)+'건은 자세한 기록에서 볼 수 있어요.'));
  // 5. 자세히: 점수·대기·지역·노선·기록·표·재정(내용은 그대로)
  /* 2026-11-06 P0-1: 펼친 내용이 아래 고정 바 밑에 생겨 안 열린 것처럼 보였다 — 이름을 풀어 쓰고(화살표는 CSS), 눌러서 열면 제목을 화면 위로. 텍스트 모드가 자동으로 펼칠 땐 움직이지 않는다 */
  var sm=details.querySelector('summary'),byHand=false;sm.textContent='자세한 기록 보기 (점수·지도·재정)';
  sm.addEventListener('click',function(){byHand=true;});
  details.addEventListener('toggle',function(){var go=byHand&&details.open;byHand=false;if(!go)return;var calm=root.matchMedia&&root.matchMedia('(prefers-reduced-motion: reduce)').matches;sm.scrollIntoView({block:'start',behavior:calm?'auto':'smooth'});});
  var after=sm.nextSibling,put=function(n){if(n)details.insertBefore(n,after);};
  put(scores);
  var most=res.passengers.reduce(function(a,p){return !a||p.waitTotal>a.waitTotal?p:a;},null),rd=most&&s.config.residents.filter(function(r){return r.id===most.residentId;})[0];
  var key=el('section',{id:'result-key-metrics','class':'result-key-metrics'});key.appendChild(el('h3',null,'가장 오래 기다린 사람'));key.appendChild(el('p',null,most?App.duration(most.waitTotal)+' · '+(rd?rd.name:App.nodeName(most.o)+' 출발 승객'):'발생한 요청 없음'));
  key.appendChild(el('p',{'class':'note'},'미도착자의 운행 종료까지 기다린 시간도 포함해요. 잇는 노선이 없는 요청은 대기 시간과 별도로 상세 기록에서 확인해요.'));put(key);
  put(summary);
  var decisions=(s.emergencyLog||[]).filter(function(a){return a.phase===s.phase;});
  if(decisions.length){var report=el('section',{id:'emergency-report'});report.appendChild(el('h3',null,'운행 중 바꾼 것'));decisions.forEach(function(a){var applied=res.log.filter(function(e){return e.type==='reassign'&&e.bus===a.busId&&e.t>=a.at;})[0];report.appendChild(el('p',null,App.clock(a.at)+' · '+(a.busId==null?'변경 없이 계속':'버스 한 대 → '+PB.Names.route(a.routeNum)+(applied?' · '+App.clock(applied.data.starts)+'부터 투입':' · 운행 종료까지 안전하게 옮길 기회가 없었어요.'))));});
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
  panel.textContent='';[eyebrow,title,head,notice,family,people,evs,aiCard(App,s,h,last),think(App,s,h,last),details,bar].forEach(function(n){if(n)panel.appendChild(n);});
  var cut=PB.UI.nextCut&&!last?PB.UI.nextCut(s):null;if(cut&&PB.Cutscene.preload)PB.Cutscene.preload(cut);
  return result;
 };
})(window);
