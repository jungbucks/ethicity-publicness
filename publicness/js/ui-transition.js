/* Round transitions preserve the existing settlement and progression state machine. */
(function(root){
 'use strict';var PB=root.PB,S=PB.Session,original=PB.UI.result;
 function el(t,a,x){return PB.App.el(t,a,x);}
 PB.UI.result=function(App,panel){
  panel.classList.toggle('show-all-results',App.reducedMotion());
  var result=original(App,panel),s=App.s,h=s.history[s.history.length-1],details=panel.querySelector('#result-details'),summary=panel.querySelector('#resident-summary');
  var cards=summary.querySelector('#resident-day-results');if(cards){panel.insertBefore(cards,summary);cards.querySelectorAll('li').forEach(function(li,i){li.style.setProperty('--reveal-delay',(i*.18)+'s');});}
  var all=el('button',{type:'button','class':'btn',id:'result-show-all',onclick:function(){panel.classList.add('show-all-results');}},'한 번에 보기');panel.insertBefore(all,cards||summary);
  var rows=s.current.result.passengers,most=rows.reduce(function(a,p){return !a||p.waitTotal>a.waitTotal?p:a;},null),m=h.metrics;
  var metrics=el('div',{id:'result-key-metrics','class':'result-key-metrics'}),arrival=el('section'),wait=el('section');
  arrival.appendChild(el('h3',null,'도착률'));arrival.appendChild(el('p',null,PB.Metrics.fmtRate(m.arrivalRate)));arrival.appendChild(el('small',null,m.N+'건 중 '+m.arrived+'건'));
  wait.appendChild(el('h3',null,'가장 오래 기다린 사람'));var rd=most&&s.config.residents.filter(function(r){return r.id===most.residentId;})[0];wait.appendChild(el('p',null,most?App.duration(most.waitTotal):'0분'));wait.appendChild(el('small',null,most?(rd?rd.name:App.nodeName(most.o)+' 출발 승객'):'발생한 요청 없음'));metrics.appendChild(arrival);metrics.appendChild(wait);panel.insertBefore(metrics,summary);
  metrics.appendChild(el('p',{'class':'note'},'미도착자의 운행 종료까지 기다린 시간도 포함해요. 잇는 노선이 없는 요청은 대기 시간과 별도로 상세 기록에서 확인해요.'));
  var decisions=(s.emergencyLog||[]).filter(function(a){return a.phase===s.phase;});
  if(decisions.length){var report=el('section',{id:'emergency-report'});report.appendChild(el('h3',null,'운행 중 바꾼 것'));decisions.forEach(function(a){var applied=s.current.result.log.filter(function(e){return e.type==='reassign'&&e.bus===a.busId&&e.t>=a.at;})[0];report.appendChild(el('p',null,App.clock(a.at)+' · '+(a.busId==null?'변경 없이 계속':a.busId+'호차 → '+a.routeNum+'번 노선'+(applied?' · '+App.clock(applied.data.starts)+'부터 투입':' · 운행 종료까지 안전하게 옮길 기회가 없었어요.'))));});
   if(s.current.baseline)report.appendChild(el('p',{'class':'note'},'같은 사건에서 조정하지 않았다면 도착 '+s.current.baseline.arrived+'건 → 조정 후 '+m.arrived+'건. 출발 전 예상과는 돌발 수요 조건이 달라요.'));panel.insertBefore(report,summary);
  }
  details.appendChild(summary);['#route-report','#run-log'].forEach(function(id){var node=panel.querySelector(id);if(node)details.appendChild(node);});
  var mapButton=el('button',{type:'button','class':'btn',id:'result-map-toggle',onclick:function(){document.body.classList.toggle('result-map-open');mapButton.setAttribute('aria-expanded',String(document.body.classList.contains('result-map-open')));App.syncStage({});}},'결과 지도 보기');details.insertBefore(mapButton,details.firstChild.nextSibling);
  return result;
 };
 PB.UI.reflect=function(App,panel){
  var s=App.s;s.transitionStep='reflect';panel.appendChild(el('p',{'class':'eyebrow'},s.phase+'단계로 가기 전에'));
  panel.appendChild(el('h2',null,'다음에는 누구의 이동을 살필까요?'));
  App.renderLearning(panel,s.phase);
  var question=PB.stories.phaseEthics[s.phase-1];if(question)panel.appendChild(el('p',{'class':'reflection-prompt'},question.title+' — '+question.text));
  panel.appendChild(el('label',{'for':'reflection-answer'},'내 생각을 한두 문장으로 남겨 보세요.'));
  var answer=el('textarea',{id:'reflection-answer',rows:'3',maxlength:'1000'});answer.value=(s.reflections||{})[s.phase]||'';
  answer.addEventListener('input',function(){s.reflections=s.reflections||{};s.reflections[s.phase]=answer.value;App.save();});panel.appendChild(answer);
  panel.appendChild(el('p',{'class':'note'},'정답이나 점수는 없어요. 비워 두고 다음으로 가도 돼요.'));
  panel.appendChild(el('button',{type:'button','class':'btn btn-primary',id:'reflection-next',onclick:function(){s.transitionStep='changes';App.go('reveal');}},'달라진 마을 보기'));
  return {};
 };
 PB.UI.changes=function(App,panel){
  var s=App.s,p=s.phase,places=s.config.nodes.filter(function(n){return n.fromPhase===p;}),prog=s.config.progression,added=prog?s.owned-prog.buses[p-2]:0;
  panel.appendChild(el('p',{'class':'eyebrow'},p+'단계 · '+s.config.phases[p-1]));panel.appendChild(el('h2',null,'마을이 달라졌어요'));
  var changes=el('div',{id:'new-resources'});places.forEach(function(n){changes.appendChild(el('p',{'class':'new-place'},n.name+' 정류장이 생겼어요.'));});
  if(added>0)changes.appendChild(el('p',{'class':'resource-token'},'+ 버스 '+added+'대'));
  if(!places.length&&!added)changes.appendChild(el('p',null,'새로운 이동 요청이 들어왔어요.'));
  var people=s.config.residents.filter(function(r){return r.fromPhase===p;});if(people.length)changes.appendChild(el('p',null,people.map(function(r){return r.name;}).join(' · ')+'의 하루도 함께 살펴보세요.'));
  panel.appendChild(changes);panel.appendChild(el('p',{'class':'note'},'새 버스는 대기 중이에요. 지도 아래 대기 버스를 노선으로 끌어 놓거나, 새 노선을 완성하면 1대가 바로 운행해요.'));
  // 이번 단계 재정 조건(출발 전에 공개): 기본 지원·공공서비스 수행분·임차
  var F=s.config.finance,fin=el('dl',{id:'phase-finance','class':'kv phase-changes'});
  [['기본 지원','기본 제공 차량 '+s.owned+'대 × '+App.won(F.basePerBus)+' · 보유비는 대당 '+App.won(F.holding)+'(쉬어도 듦)'],['공공서비스 수행분',PB.UI.Econ.conditionText(s)],['추가 임차','이번 단계에만 1대 '+App.won(F.lease.fee)+', 최대 '+F.lease.perPhase+'대 · 다음 단계에 자동으로 다시 빌리지 않아요'],['재정 규칙',App.financeRuleText(s)]]
   .forEach(function(r){fin.appendChild(el('dt',null,r[0]));fin.appendChild(el('dd',null,r[1]));});panel.appendChild(fin);
  panel.appendChild(el('button',{type:'button','class':'btn btn-primary',id:'btn-begin-plan',onclick:function(){delete s.transitionStep;S.beginPlan(s);App.go('plan');}},'노선 설계하기'));
  return {};
 };
})(window);
