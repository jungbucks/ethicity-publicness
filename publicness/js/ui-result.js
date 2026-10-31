/*
 * 결과 화면 — 예상과 실제를 한 카드에 나눠 보이고, 모든 생활권 표·재정·주민 반응을 원자료와 함께 보여 준다.
 * 단계마다 수요·사건이 다를 수 있으므로 차이를 전부 노선 변경 탓으로 말하지 않는다.
 */
(function (root) {
  'use strict';
  var PB = root.PB, cfg = PB.config, M = PB.Metrics, S = PB.Session;
  var UI = PB.UI = PB.UI || {};

  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }
  function table(headers, rows, foot) {
    var t = el('table'), th = el('thead'), tr = el('tr');
    headers.forEach(function (h) { tr.appendChild(el('th', { scope: 'col' }, h)); });
    th.appendChild(tr); t.appendChild(th);
    var tb = el('tbody');
    rows.forEach(function (r) {
      var row = el('tr');
      r.forEach(function (c, i) { row.appendChild(el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null, c)); });
      tb.appendChild(row);
    });
    t.appendChild(tb);
    if (foot) {
      var tf = el('tfoot'), fr = el('tr');
      foot.forEach(function (c, i) { fr.appendChild(el(i === 0 ? 'th' : 'td', i === 0 ? { scope: 'row' } : null, c)); });
      tf.appendChild(fr); t.appendChild(tf);
    }
    var w = el('div', { 'class': 'table-wrap' }); w.appendChild(t);
    return w;
  }
  UI.table = table;
  function residentCard(App,rd,r,t){
    var data=PB.Narrative.residentResult(rd,r,App.s.current.result.passengers,App.s.config.bus.window);
    var li=el('li',{'data-resident':rd.id}),card=el('details',{'class':'resident-card'}),head=el('summary');
    var face=el('span',{'class':'resident-face '+rd.id,'aria-hidden':'true'});
    face.appendChild(el('img',{src:'assets/art/portrait-'+rd.id+'-calm.webp',alt:'',loading:'lazy'}));
    head.appendChild(face);var words=el('span',{'class':'resident-identity'});words.appendChild(el('strong',null,rd.name));
    words.appendChild(el('span',{'class':'resident-state '+(r.satisfied?'complete':'incomplete')},(r.satisfied?'✓ 만족':'○ 불만족')));words.appendChild(el('span',{'class':'resident-reason'},r.satisfied?'필요한 이동을 기준 안에 마쳤어요.':(r.reasons||[]).map(function(x){return x.text;}).join(' ')||data.reason));head.appendChild(words);
    head.appendChild(el('span',{'class':'resident-expand','aria-hidden':'true'},'＋'));card.appendChild(head);
    var body=el('div',{'class':'resident-journey'});
    data.legs.forEach(function(leg){body.appendChild(el('p',{'class':'journey-leg'},(leg.state==='도착'?'✓ ':leg.state==='미도착'?'✕ ':'— ')+App.nodeName(leg.o)+' → '+App.nodeName(leg.d)+' · '+leg.state));});
    if(data.reason)body.appendChild(el('p',{'class':'journey-reason'},data.reason));
    if(t)body.appendChild(el('p',{'class':'note'},'엔딩 기준 · 누적 '+t.completed+'/'+t.threshold+'회'+(t.completed>=t.threshold?' · 기준 달성':' · 남은 '+t.remaining+'단계')));
    var times=el('details',{'class':'resident-times'});times.appendChild(el('summary',null,'도착 시각 기록'));
    times.appendChild(el('p',{'class':'note'},'첫 도착 '+(r.arriveT!=null?App.clock(r.arriveT):'미도착')+' · 최종 도착 '+(r.homeT!=null?App.clock(r.homeT):'미도착')));body.appendChild(times);card.appendChild(body);
    var pinned=false;
    head.addEventListener('click',function(e){e.preventDefault();pinned=!pinned;card.open=pinned;});
    card.addEventListener('pointerenter',function(e){if(e.pointerType==='mouse'&&matchMedia('(hover: hover)').matches)card.open=true;});
    card.addEventListener('pointerleave',function(){if(!pinned&&!card.contains(document.activeElement))card.open=false;});
    card.addEventListener('focusout',function(e){if(!pinned&&!card.contains(e.relatedTarget)&&!card.matches(':hover'))card.open=false;});
    card.addEventListener('keydown',function(e){if(e.key==='Escape'){e.preventDefault();e.stopPropagation();pinned=false;card.open=false;head.focus();}});
    li.appendChild(card);return li;
  }
  // 노선별 효율(실제 운행) — 결과 화면 안에서 바로 본다(예전의 자동 팝업 대신)
  function routeReport(App){
    var s=App.s,sec=el('section',{id:'route-report','aria-labelledby':'route-report-title'});
    sec.appendChild(el('h3',{id:'route-report-title'},'오늘 노선은 얼마나 쓰였을까요?'));
    var rows=M.routeReport(s.current.result,S.routesInOrder(s),s.draft.buses);
    sec.appendChild(table(['노선','배정 차량','승차','최종 도착','대당 승차','만차 발생'],rows.map(function(r){return [r.num+'번',r.buses+'대',r.boardings+'회',r.arrived+'건',r.perBus==null?'미배정':r.perBus+'회',r.fulls+'회'];})));
    sec.appendChild(el('p',{'class':'note'},'승차는 환승을 포함한 횟수예요. 최종 도착은 목적지에서 내린 마지막 노선에만 기록해요. 만차 발생은 정류장에서 승객을 남긴 횟수예요. 대당 승차가 적어도 누군가에게 꼭 필요한 노선일 수 있어요.'));
    return sec;
  }
  // 이동 요청 구성: 예정 + 도착 뒤 생긴 다음 이동 + 돌발 수요(안내·예상·결과가 같은 말을 쓴다)
  function requestParts(q){return '예정 '+q.planned+(q.followUps?' + 다음 이동 '+q.followUps:'')+(q.extra?' + 돌발 '+q.extra:'');}
  UI.requestParts=requestParts;
  // 대기 지표 한 줄: 탄 사람의 최장 대기 · 노선 없음 · 종료까지 못 탐
  function waitLine(App,m){
    var parts=['버스를 탄 사람의 최장 대기 '+App.duration(m.maxWait)];
    if(m.noLink)parts.push('잇는 노선이 없어 떠나지 못한 요청 '+m.noLink+'건');
    if(m.notBoarded&&m.notBoarded.count)parts.push('운행 종료까지 버스를 못 탄 요청 '+m.notBoarded.count+'건(가장 오래 '+App.duration(m.notBoarded.longest)+')');
    return parts.join(' · ');
  }
  UI.waitLine=waitLine;
  // 재정 알림(결과 화면 본문, 새 창 없이): 랜덤은 잔액 마이너스 1번째 경고·2번째 연속 계약 종료(회차 적자는 정보), 기본은 잔액이 낮을 때 ‘학기 말에 평가’ 안내
  function financeNotice(App,h){
    var s=App.s,f=S.financeStatus(s),row=f.ledger.filter(function(r){return r.phase===h.phase;})[0],lines=[],warn=false;
    if(!row)return null;
    if(f.rule==='balance-streak'){
      if(row.deficit)lines.push('이번 단계 회차 수지 '+App.won(row.total)+' — 적자예요.'+(row.balance>=0?' 모아 둔 잔액('+App.won(row.balance)+')으로 메웠어요.':''));
      if(f.end&&f.end.cause==='contract'&&f.end.phase===h.phase){lines.push('누적 잔액이 '+f.limit+'번 연속 0원 미만('+App.won(row.balance)+')이라 운영 계약이 종료돼요. 이번 단계 결과와 정산을 확인한 뒤 종료 화면으로 넘어가요.');warn=true;}
      else if(row.balance<0){lines.push('누적 잔액 '+App.won(row.balance)+' — 다음 단계를 마칠 때도 0원 미만이면 운영 계약이 종료됩니다.');warn=true;}
    }else if(f.low)lines.push('보유 잔액 '+App.won(f.balance)+'. 기본 모드는 재정을 학기 말에 평가해요. 마지막 단계가 끝난 뒤 잔액이 0원 미만이면 파산으로 끝나요.');
    if(!lines.length)return null;
    return el('p',{id:'finance-status','class':'callout'+(warn?' warn':''),role:'status'},lines.join(' '));
  }

  UI.result = function (App, panel) {
    document.querySelector('#stage-overlay').textContent='';
    var s = App.s, h = s.history[s.history.length - 1], m = h.metrics, e = h.expected;
    cfg=s.config;
    panel.appendChild(el('p', { 'class': 'eyebrow' }, h.phase + '단계 · ' + cfg.phases[h.phase - 1] + ' — 결과'));
    panel.appendChild(el('h2', null, '운행이 끝났어요'));
    if (UI.phaseScores) panel.appendChild(UI.phaseScores(App, h, M.routeReport(s.current.result, S.routesInOrder(s), s.draft.buses)));
    if(m.families&&m.families.total)panel.appendChild(el('p',{id:'family-result','class':'callout'},'호수공원 가족 나들이 · '+m.families.total+'팀 중 '+m.families.complete+'팀이 전원 방문·귀가를 마쳤어요. 가족 중 한 명이라도 이동을 마치지 못하면 그 팀의 일정은 미완료예요.'));
    var summary=el('section',{id:'resident-summary'});
    summary.appendChild(el('p',{'class':'outcome-lead'},m.N+'명 중 '+m.arrived+'명이 목적지에 도착했어요.'));
    if(s.config.day){
      summary.firstChild.textContent='발생한 이동 요청 '+m.N+'건('+requestParts(m.requests)+') 중 '+m.arrived+'건이 목적지에 도착했어요.';
      summary.appendChild(el('h3',null,'오늘, 주민들의 이동은'));
      summary.appendChild(el('p',{'class':'note'},'얼굴에 마우스를 올리거나 눌러 이동 코스를 확인하세요. 키보드로는 Enter로 열고 Esc로 닫을 수 있어요.'));
      var days=el('ul',{id:'resident-day-results','class':'resident-cards'}),tally=PB.Narrative.residentTally(s.config,s.history);
      PB.Demand.residents(s.config,s.phase).forEach(function(rd){var r=h.residents[rd.id],t=tally[rd.id];if(!r)return;
        days.appendChild(residentCard(App,rd,r,t));
      });summary.appendChild(days);
      summary.appendChild(el('p',{'class':'note'},'주요 인물의 다음 이동은 첫 목적지에 도착하고 체류 시간을 채운 뒤 생겨요. 한 일정은 이동 요청 두 건이며, 나머지 승객의 개인 일정은 추적하지 않아요.'));
    }
    var outcomes=el('ul',{'class':'resident-outcomes'});
    var reasons=PB.Sim.unfinishedReasons(s.current.result);
    Object.keys(reasons).forEach(function(id){
      var g=reasons[id],li=el('li'),parts=[];
      if(g.noLink)parts.push('탈 수 있는 노선 없음 '+g.noLink+'명');
      if(g.full)parts.push('만차로 못 탄 경험이 있는 미도착 '+g.full+'명');
      if(g.time)parts.push('운행 종료까지 대기·이동 중 '+g.time+'명');
      var b=el('button',{type:'button','class':'btn reason-location','data-origin':id,onclick:function(){
        App.view.setSelected([id]);App.view.flash(id);
        document.querySelector('#reason-focus').textContent=App.nodeName(id)+' 출발 정류장을 지도에 표시했어요. '+parts.join(' · ');
        document.querySelector('#stage').dataset.reasonOrigin=id;
      }},App.nodeName(id)+' · 미도착 '+(g.noLink+g.full+g.time)+'명 — 지도에서 보기');
      li.appendChild(b);li.appendChild(el('p',{'class':'note'},parts.join(' · ')));outcomes.appendChild(li);
    });
    if(!outcomes.children.length)outcomes.appendChild(el('li',null,'모든 지역의 요청이 목적지에 도착했어요.'));
    summary.appendChild(outcomes);summary.appendChild(el('p',{id:'reason-focus',role:'status','class':'note'},'지역을 누르면 출발 정류장을 지도에서 확인할 수 있어요. 만차 경험은 지연의 단서이며 유일한 원인이라는 뜻은 아니에요.'));summary.appendChild(el('p',{'class':'note',id:'result-waits'},waitLine(App,m)+'. 대기는 정류장에서 처음 버스를 탈 때까지와 갈아탈 때 기다린 시간이에요.'));panel.appendChild(summary);
    var notice=financeNotice(App,h);if(notice)panel.appendChild(notice);
    panel.appendChild(routeReport(App));
    // 운행 중 지나간 소식(사건·만차·주요 인물의 말)을 그대로 다시 본다
    var log=el('details',{id:'run-log'});log.appendChild(el('summary',null,'운행 기록 다시 보기'));var lu=el('ul',{'class':'feed'});
    (UI.runFeed?UI.runFeed(s):[]).forEach(function(it){lu.appendChild(el('li',{'class':'feed-'+it.cls},it.text));});
    if(!lu.children.length)lu.appendChild(el('li',null,'기록된 소식이 없어요.'));log.appendChild(lu);panel.appendChild(log);
    var details=el('details',{id:'result-details'});details.appendChild(el('summary',null,'전체 통계와 재정 보기'));panel.appendChild(details);

    // 사건
    if (h.event && h.event.type === 'demand') {
      var od = PB.Demand.directional(cfg, h.phase)[h.event.odIndex];
      panel.appendChild(el('p', { 'class': 'callout' }, App.clock(h.event.t) + '에 ' + App.nodeName(od.o) + '→' + App.nodeName(od.d) + ' 요청이 12건 늘었어요(추가 수요).'));
    }
    if (h.petition) panel.appendChild(el('p', { 'class': 'callout warn' }, App.clock(h.petition.t) + ' ' + App.nodeName(h.petition.zone) + ' 주민 청원: 그때까지 요청 ' + h.petition.total + '건 중 ' + h.petition.count + '명이 아직 도착하지 못했어요.'));

    // 예상과 실제
    var cmp = el('section', { id: 'result-compare', 'class': 'card' });
    cmp.appendChild(el('h3', null, '예상과 실제'));
    var row = function (name, f) { return [name, f(e), f(m)]; };
    cmp.appendChild(table(['', '예상', '실제'], [
      row('이동 요청', function (x) { return x.N + '건 (' + requestParts(x.requests) + ')'; }),
      row('도착', function (x) { return x.arrived + '명 (' + M.fmtRate(x.arrivalRate) + ')'; }),
      row('탄 사람 최장 대기', function (x) { return App.duration(x.maxWait); }),
      row('노선 없음 / 종료까지 못 탐', function (x) { return x.noLink + '건 / ' + x.notBoarded.count + '건'; }),
      row('이번 단계 회차 수지', function (x) { return App.won(x.costs.total); }),
      row('대학교·병원 도착률', function (x) { return M.fmtRate(x.essential.arriveRate); })
    ]));
    var notes = ['예상은 추가 사건 없는 기본 수요 기준이에요.'];
    if (m.N !== e.N) notes.push('실제 이동 요청은 예상과 '+Math.abs(m.N-e.N)+'건 달라요. 돌발 수요와, 실제로 도착한 사람에게만 생기는 다음 이동이 반영돼요.');
    notes.push('단계마다 수요와 사건이 달라서, 차이를 모두 노선 변경의 효과로 볼 수는 없어요.');
    cmp.appendChild(el('p', { 'class': 'note' }, notes.join(' ')));
    details.appendChild(cmp);

    // 생활권 표
    var zs = el('section', { 'aria-labelledby': 'zone-h' });
    zs.appendChild(el('h3', { id: 'zone-h' }, '출발 생활권별 결과'));
    var ids = Object.keys(m.zones);
    var rows = ids.map(function (id) {
      var z = m.zones[id];
      return [App.nodeName(id) + '(' + id + ')', String(z.N), String(z.arrived), String(z.waiting), String(z.transfer), String(z.riding),
        M.fmtRate(z.rate), z.N ? App.duration(z.maxWait) : '-', z.D == null ? '-' : String(z.D),
        (h.trustBefore[id] != null ? h.trustBefore[id] : cfg.trust.initial) + '→' + h.trustAfter[id]];
    });
    var tbl = table(['생활권', '출발 요청', '도착', '미탑승', '환승 중', '탑승 중', '도착률', '탄 사람 최장 대기', '불만', '신뢰'], rows,
      ['합계', String(m.N), String(m.arrived), String(m.waiting), String(m.transfer), String(m.riding), M.fmtRate(m.arrivalRate), App.duration(m.maxWait), '', '']);
    tbl.querySelector('table').id = 'zone-table';
    zs.appendChild(tbl);
    zs.appendChild(el('p', { 'class': 'note' }, '출발 요청은 그 생활권에서 출발한 이동만 세요(합계 = 전체 이동 요청). 미탑승에는 잇는 노선이 없어 떠나지 못한 요청도 들어가요. 전체 도착률은 인원 합으로 계산해요(생활권 비율의 평균이 아니에요). 불만·신뢰는 게임 반응을 위한 지수예요.'));
    var extra = el('dl', { 'class': 'kv' });
    [['이용자(한 번 이상 탄 사람)', m.users + '명 / ' + m.N],
      ['승차 횟수(환승 포함)', m.boardings + '회'],
      ['요금 낸 미완료', m.costs.paidUnfinished + '명'],
      ['완료한 이동의 평균 소요', m.travel.doneAvg == null ? '-' : App.duration(m.travel.doneAvg)],
      ['미완료 이동의 관측 경과(운행 종료까지)', m.travel.openAvg == null ? '-' : App.duration(m.travel.openAvg)],
      ['대학교·병원 연결률 / 도착률', M.fmtRate(m.essential.linkRate) + ' / ' + M.fmtRate(m.essential.arriveRate)]
    ].forEach(function (kv) { extra.appendChild(el('dt', null, kv[0])); extra.appendChild(el('dd', null, kv[1])); });
    zs.appendChild(extra);
    details.appendChild(zs);

    // 주민
    var rs = el('section', { 'aria-labelledby': 'res-h' });
    rs.appendChild(el('h3', { id: 'res-h' }, '자주 보는 주민'));
    var ul = el('ul', { 'class': 'plain' });
    PB.Demand.residents(s.config,s.phase).forEach(function (rd) {
      var r = h.residents[rd.id];
      if (!r) return;
      var state = r.status === 'arrived' ? App.nodeName(rd.d) + '에 도착' : r.status === 'riding' ? '아직 버스 안' : r.status === 'transfer' ? '갈아타는 중' : (r.fail === 'NO_LINK' ? '탈 수 있는 노선 없음' : '아직 타지 못함');
      ul.appendChild(el('li', null, rd.role + ' ' + rd.name + '(' + rd.o + '→' + rd.d + '): ' + state + ' · 기다린 시간 ' + App.duration(r.waitTotal) + (r.transfer ? ' · 한 번 갈아탐' : '')));
    });
    rs.appendChild(ul);
    details.appendChild(rs);

    var bs = el('section', { 'aria-labelledby': 'bub-h' });
    bs.appendChild(el('h3', { id: 'bub-h' }, '운행 중 들린 말'));
    var bl = el('ul', { id: 'bubble-replay', 'class': 'feed' });
    PB.Narrative.bubbles(s.current.result, s.config, cfg.bus.window).forEach(function (b) {
      var who = b.residentId ? cfg.residents.filter(function (r) { return r.id === b.residentId; })[0].name : '주민';
      bl.appendChild(el('li', null, App.clock(b.t) + ' · ' + who + '(' + App.nodeName(b.node) + '): “' + b.text + '”'));
    });
    bs.appendChild(bl);
    var news=el('details');news.appendChild(el('summary',null,'운행 중 들린 말'));news.appendChild(bs);panel.appendChild(news);

    // 재정
    var fs = el('section', { id: 'finance', 'aria-labelledby': 'fin-h' });
    fs.appendChild(el('h3', { id: 'fin-h' }, '재정(가상원)'));
    var k = m.costs, bal = S.balance(s), E = PB.UI.Econ, kp = M.costParts(k);
    fs.appendChild(E.financeTable(k));
    if (!kp.legacy) { fs.appendChild(el('h4', null, '공공서비스 수행분')); fs.appendChild(E.conditions(k, false)); }
    // 회차 수지·지원금을 뺀 운영 손익·누적 잔액을 서로 다른 줄로(혼동 방지)
    fs.appendChild(el('p', { id: 'operating-balance', 'class': 'note' }, '지원금을 뺀 운영 손익(운임 − 보유비·임차료·운영비·연료비): ' + App.won(k.total - kp.subsidyBase - kp.subsidyService) + '. 이용이 적은 곳까지 버스를 보내면 이 값이 줄어들 수 있고, 지원금은 그런 이동을 지키라고 주는 돈이에요.'));
    fs.appendChild(el('p', { id: 'finance-balance' }, '보유 잔액(누적): ' + App.won(bal) + (S.financeRule(s) === 'balance-streak' && S.financeStatus(s).negStreak ? ' · 잔액 마이너스 ' + S.financeStatus(s).negStreak + '/' + S.NEGATIVE_LIMIT + '회 연속' : '')));
    fs.appendChild(el('p', { 'class': 'note' }, '회차 수지 = 수입(지원금 + 운임) − 비용(보유비·임차료·운영비·연료비). 0원 미만이면 그 단계 적자예요(정확히 0원은 적자 아님). ' + App.financeRuleText(s)));
    fs.appendChild(el('h4', null, '노선별 재정과 이동'));
    fs.appendChild(E.routeTable(M.routeEconomy(s.current.result, S.routesInOrder(s), s.draft.buses, s.config, S.graph(s))));
    details.appendChild(fs);

    var last = s.phase >= cfg.phases.length, ended = !!(s.end && s.end.cause === 'contract');
    panel.appendChild(el('button', { type: 'button', 'class': 'btn btn-primary btn-lg', id: 'btn-next-phase', onclick: function () {
      function advance(){S.nextPhase(s);if(s.stage!=='ending')s.transitionStep='reflect'; App.go(s.stage === 'ending' ? 'ending' : 'reveal');}
      if(last||ended){advance();return;}
      // 새 인물이 등장하는 단계만 짧은 Stage 카드와 소개 컷을 보여 준다. 나머지는 바로 단계 안내로
      var stage={number:s.phase+1,total:cfg.phases.length,name:cfg.phases[s.phase]};
      var has=function(id){return s.config.residents.some(function(r){return r.id===id;});};
      var kind=s.phase===2?'sol':s.phase===3&&has('yuna')?'baseball':s.phase===6&&has('jinho')?'mall':null;
      if(kind)PB.Cutscene.play(kind,advance,null,stage);else advance();
    } }, ended ? '운영 종료 화면 보기' : last ? '학기 마무리 보기' : (s.phase + 1) + '단계로'));
    return {};
  };
})(window);
