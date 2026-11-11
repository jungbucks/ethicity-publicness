/*
 * 결말 — 짧은 주민 이야기부터, 수치 근거는 ‘운행 기록 보기’에서 펼친다.
 * 단일 승패·도덕 점수 대신 생활권별 변화(사실 기반 소제목)와 기록을 보여 준다.
 */
(function (root) {
  'use strict';
  var PB = root.PB, cfg = PB.config, M = PB.Metrics, S = PB.Session, N = PB.Narrative;
  var UI = PB.UI = PB.UI || {};
  var $ = function (s) { return document.querySelector(s); };
  var GOAL = { profit: '수익', time: '이동 시간', reach: '소외 지역 연결' };
  var ACTION = { accept: '수락', modify: '받아서 고침', reject: '거절' };
  var STATUS = { arrived: '도착', riding: '버스 안', transfer: '갈아타는 중', waiting: '아직 타지 못함' };

  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }

  function residentCard(App, story) {
    var c = el('article', { 'class': 'card resident-card', 'data-id': story.residentId, 'aria-labelledby': 'res-' + story.residentId });
    var head = el('div', { 'class': 'resident-head' });
    var face = el('div', { 'class': 'face', 'aria-hidden': 'true' });
    // 모든 인물 초상(유나·다은도 2026-10-27 설정 시트에서 잘라 만듦 — tools/portrait-crop.mjs). 그림이 없을 때만 이름 글자
    var img = el('img', { src: 'assets/art/portrait-' + story.residentId + '-calm.webp', alt: '' });
    img.addEventListener('error', function () { face.textContent = story.name; img.remove(); });
    face.appendChild(img);
    head.appendChild(face);
    var rd = cfg.residents.filter(function (r) { return r.id === story.residentId; })[0];
    var t = el('div');
    t.appendChild(el('h3', { id: 'res-' + story.residentId }, story.role + ' ' + story.name));
    var lastRecord=story.evidence[story.evidence.length-1];
    t.appendChild(el('p', { 'class': 'note' }, rd.itineraries?App.nodeName(lastRecord.o)+' → '+App.nodeName(lastRecord.d)+' → '+App.nodeName(lastRecord.finalDestination):App.nodeName(rd.o) + ' → ' + App.nodeName(rd.d)));
    head.appendChild(t);
    c.appendChild(head);
    c.appendChild(el('p', null, story.text));
    c.appendChild(el('p', { 'class': 'closing' }, story.closing));
    var d = el('details');
    d.appendChild(el('summary', null, story.name + '의 운행 기록'));
    var rows = story.evidence.map(function (e) {
      return [e.phase + '단계', e.dayStatus?(e.multiStop?{complete:'일정 완료',returnIncomplete:'마지막 이동 미완료',outboundIncomplete:'첫 목적지에 못 감'}:{complete:'왕복 완료',returnIncomplete:'귀가 미완료',outboundIncomplete:'외출 미완료'})[e.dayStatus]:STATUS[e.status], App.duration(e.waitTotal), e.arriveT != null ? App.clock(e.arriveT)+(e.homeT!=null?' / 최종 '+App.clock(e.homeT):'') : '-', e.transfer ? '한 번' : '-'];
    });
    d.appendChild(UI.table(['단계', '상태', '하루 동안 기다린 시간 합', '도착 시각', '환승'], rows)); /* P0-3: 판정 값(가장 긴 대기)과 다른 지표라 이름을 나눔 */
    if (story.drop != null) d.appendChild(el('p', { 'class': 'note' }, '처음 ' + story.evidence[0].waitTotal + '초 → 마지막 ' + story.evidence[story.evidence.length - 1].waitTotal + '초, ' + story.drop + '초 줄었어요.'));
    c.appendChild(d);
    return c;
  }

  function records(App, sum) {
    var sec = el('section', { id: 'records', 'aria-labelledby': 'rec-h' });
    sec.hidden = true;
    sec.appendChild(el('h3', { id: 'rec-h' }, '운행 기록'));
    var ul = el('ul', { 'class': 'plain' });
    Object.keys(sum.zones).forEach(function (z) {
      var zs = sum.zones[z], sub = zs.subtitle, li = el('li', { 'class': 'zone-subtitle' });
      li.appendChild(el('b', null, App.nodeName(z) + '(' + z + '): ' + N.zoneSubtitleText(sub.kind)));
      var obs = zs.history.filter(function (h) { return h.N > 0; });
      var detail = sub.firstPhase == null ? ' — 요청 없음' :
        ' — ' + sub.firstPhase + '~' + sub.lastPhase + '단계 관측 · 도착률 ' + M.fmtRate(sub.first) + ' → ' + M.fmtRate(sub.last) +
        ' · 마지막 최장 대기 ' + App.duration(obs[obs.length - 1].maxWait);
      li.appendChild(document.createTextNode(detail));
      ul.appendChild(li);
    });
    sec.appendChild(ul);
    sec.appendChild(el('p', { 'class': 'note' }, '소제목 기준(게임 조정값): 마지막 두 관측 단계 모두 도착률 80% 이상·최장 대기 180분 이하면 “비교적 안정적”, 첫 관측보다 15%p 이상 오르면 “개선이 이어지는 중”.'));

    var heads = ['생활권'].concat(cfg.phases.map(function (p, i) { return (i + 1) + '단계'; })).concat(['마지막 신뢰']);
    var rows = Object.keys(sum.zones).map(function (z) {
      var h = sum.zones[z].history;
      return [App.nodeName(z) + '(' + z + ')'].concat(h.map(function (x) { return x.N ? M.fmtRate(x.rate) : '-'; })).concat([h.length && h[h.length - 1].trust != null ? String(h[h.length - 1].trust) : '-']);
    });
    sec.appendChild(el('h4', null, '단계별 도착률'));
    sec.appendChild(UI.table(heads, rows));

    sec.appendChild(el('h4', null, '재정'));
    var fr = sum.finance.perPhase.map(function (raw, i) { var k = M.costParts(raw); return [(i + 1) + '단계', App.won(k.subsidyBase + k.subsidyService), App.won(k.fare), App.won(-(k.holding + k.lease + k.op + k.fuel)), App.won(k.total)]; });
    sec.appendChild(UI.table(['단계', '지원금', '운임', '비용', '회차 수지'], fr, ['누적 잔액', '', '', '', App.won(sum.finance.balance)]));
    sec.appendChild(el('p', { 'class': 'note' }, cfg.phases.length+'개 대표 운행 창의 합계예요. 한 학기 전체 결산이 아니에요.'));

    sec.appendChild(el('h4', null, 'AI 목표 선택 이력'));
    var gl = el('ul', { id: 'goal-history' });
    for (var p = 1; p <= cfg.phases.length; p++) {
      var g = sum.goalHistory.filter(function (x) { return x.phase === p; })[0];
      gl.appendChild(el('li', null, p + '단계: ' + (g && g.goal ? GOAL[g.goal] + ' — ' + (ACTION[g.action] || '제안을 보고 직접 계획') : '목표를 고르지 않음')));
    }
    sec.appendChild(gl);

    return sec;
  }

  // 운영 종료(파산·계약 종료) — 회차별 재정, 주요 비용·운영 문제, 사건과 선택의 영향, 기록 기반 제안, 다시 하기
  function failureReport(App, s) {
    var f = S.financeStatus(s), rv = N.financeReview(s.config, s.history), byStreak = f.rule === 'balance-streak';
    var sec = el('section', { id: 'failure-report', 'class': 'card', 'aria-labelledby': 'fail-h' });
    sec.appendChild(el('h3', { id: 'fail-h' }, '재정 돌아보기'));
    sec.appendChild(el('p', { id: 'failure-cause' }, (f.end.cause === 'contract' && f.end.balance >= 0
      ? f.end.phase + '단계에서 이전 규칙(회차 적자 누적 3회)으로 운영 계약이 종료됐어요. 보유 잔액은 ' + App.won(f.balance) + '이에요.'
      : f.end.cause === 'contract'
      ? (f.end.phase - 1) + '·' + f.end.phase + '단계를 마칠 때 누적 잔액이 연속으로 0원 미만이어서 운영 계약이 종료됐어요. 마지막 보유 잔액은 ' + App.won(f.balance) + '이에요. 한 단계 적자는 경고였고, 지급 능력(누적 잔액)으로 판정했어요.'
      : '마지막 단계까지 운행했지만 학기 말 보유 잔액이 ' + App.won(f.balance) + '이에요. 기본 모드는 학기 말 잔액이 0원 미만이면 파산으로 끝나요.') + ' 재정 판정과 별개로, 주민이 해낸 이동은 아래 인물 결과에 그대로 남아 있어요.'));
    var n = 0, rows = f.ledger.map(function (r) {
      if (r.deficit) n++;
      // 좁은 패널에서도 판정 열(회차 수지·적자·잔액)이 먼저 보이게 앞에 둔다
      var row = [r.phase + '단계', App.won(r.total) + (r.deficit ? ' (적자)' : '')].concat(byStreak ? [r.balance < 0 ? '마이너스' : '-'] : []);
      return row.concat([App.won(r.balance), App.won(r.income), App.won(-r.cost)]);
    });
    var tbl = UI.table(['단계', '회차 수지'].concat(byStreak ? ['잔액 판정'] : []).concat(['보유 잔액', '수입', '비용']), rows);
    tbl.querySelector('table').id = 'failure-ledger';
    sec.appendChild(tbl);
    sec.appendChild(el('p', { 'class': 'note' }, '수입 = 지원금(기본 + 공공서비스 수행분) + 운임, 비용 = 차량 보유비 + 임차료 + 관제·운영비 + 연료·정비비. 회차 수지가 0원 미만인 단계는 적자, 보유 잔액은 그 합이에요.' + (f.deficitPhases.length ? ' 적자 단계: ' + f.deficitPhases.join('·') + '단계.' : '')));
    sec.appendChild(el('h4', null, '돈이 나간 곳'));
    var spent = rv.costs.reduce(function (a, c) { return a + c[2]; }, 0), cu = el('ul', { id: 'failure-costs' });
    rv.costs.forEach(function (c) { cu.appendChild(el('li', null, c[1] + ' ' + App.won(c[2]) + (spent ? ' (' + Math.round(c[2] / spent * 100) + '%)' : ''))); });
    cu.appendChild(el('li', null, '수입: 지원금 ' + App.won(rv.totals.subsidy) + ' · 운임 ' + App.won(rv.totals.fare)));
    sec.appendChild(cu);
    sec.appendChild(el('h4', null, '운영 중 드러난 문제'));
    var pu = el('ul', { id: 'failure-problems' });
    pu.appendChild(el('li', null, '운행한 버스 단계별 합계 ' + rv.running + '대 · 쉬게 한 버스 ' + rv.resting + '대 · 운행 버스 한 대당 평균 승차 ' + (Math.round(rv.perBus * 10) / 10) + '회'));
    if (rv.noLink) pu.appendChild(el('li', null, '잇는 노선이 없어 떠나지 못한 요청 ' + rv.noLink + '건'));
    if (rv.notBoarded) pu.appendChild(el('li', null, '운행 종료까지 버스를 못 탄 요청 ' + rv.notBoarded + '건'));
    sec.appendChild(pu);
    sec.appendChild(el('h4', null, '사건과 선택'));
    sec.appendChild(el('p', { id: 'failure-events' }, (!rv.event.phases.length ? '돌발 수요 사건은 없었어요.' : rv.event.fare ? '돌발 수요 사건(' + rv.event.phases.join('·') + '단계)으로 생긴 승객의 운임 ' + App.won(rv.event.fare) + '이 수입에 더해졌어요.' : rv.event.phases.join('·') + '단계에 돌발 수요 사건이 있었지만 그 승객이 버스를 타지 못해 운임 변화는 없었어요.') +
      (rv.event.unknown ? ' 일부 단계는 사건 운임이 기록되지 않았어요.' : '') + ' 청원은 재정에 직접 영향이 없어요. 나머지 운임과 모든 비용은 노선과 버스 배치(선택)에서 나왔어요.'));
    sec.appendChild(el('h4', null, '다음에 해 볼 것'));
    var tl = el('ol', { id: 'failure-tips' });
    rv.tips.forEach(function (t) { tl.appendChild(el('li', { 'data-tip': t.code }, t.text)); });
    if (!rv.tips.length) tl.appendChild(el('li', null, '기록에서 두드러진 비용 문제를 찾지 못했어요. 단계별 표에서 적자가 난 단계의 노선과 버스 수를 비교해 보세요.'));
    sec.appendChild(tl);
    sec.appendChild(el('p', { 'class': 'note' }, rv.caution));
    var act = el('div', { 'class': 'retry-actions' });
    if (s.mode === 'default') act.appendChild(el('button', { type: 'button', 'class': 'btn btn-primary', id: 'btn-retry-same', onclick: function () { App.retry('same'); } }, '같은 시나리오로 다시 시작'));
    else {
      act.appendChild(el('button', { type: 'button', 'class': 'btn btn-primary', id: 'btn-retry-same', onclick: function () { App.retry('same'); } }, '같은 조건으로 재도전'));
      act.appendChild(el('button', { type: 'button', 'class': 'btn', id: 'btn-retry-new', onclick: function () { App.retry('new'); } }, '새 랜덤 게임'));
      act.appendChild(el('p', { 'class': 'note' }, '같은 조건 = 세팅 번호 ' + s.seed + '의 지도·수요·사건 그대로. 진행 기록은 처음부터 새로 시작해요.'));
    }
    sec.appendChild(act);
    return sec;
  }

  function reviewCase(data) {
    var card=el('article',{'class':'review-case'});
    card.appendChild(el('h3',null,data.title));
    if(data.subtitle)card.appendChild(el('p',{'class':'note'},data.subtitle));
    card.appendChild(el('p',null,data.text));
    var sources=el('p',{'class':'note'});
    [{label:data.source,url:data.url}].concat(data.extraSources||[]).forEach(function(source){
      if(sources.childNodes.length)sources.appendChild(document.createTextNode(' · '));
      sources.appendChild(el('a',{'class':'learning-source',href:source.url,target:'_blank',rel:'noopener noreferrer'},source.label));
    });card.appendChild(sources);return card;
  }
  function openEnding(App, review) {
    App._reviewFor=review?App.s:null;App.go('ending');$('#panel').scrollTop=0;root.scrollTo(0,0);
  }
  function gameReview(App,panel) {
    var s=App.s,sec=el('section',{id:'game-review'});
    sec.appendChild(el('h2',null,'게임 돌아보기'));
    sec.appendChild(el('p',{'class':'note'},'선택 활동이에요. 읽거나 쓰지 않아도 운행 결과는 이미 완료되어 있어요.'));
    var skip=el('button',{type:'button','class':'btn',id:'btn-review-skip',onclick:function(){openEnding(App,false);}},'건너뛰기 · 결과로');sec.appendChild(skip);
    (PB.stories.learning||[]).slice(0,2).forEach(function(data){sec.appendChild(reviewCase(data));});
    var more=el('details',{id:'review-more-cases'});more.appendChild(el('summary',null,'다른 AI 사례 더 보기'));
    (PB.stories.learning||[]).slice(2).forEach(function(data){var item=el('details');item.appendChild(el('summary',null,data.title));item.appendChild(reviewCase(data));more.appendChild(item);});sec.appendChild(more);
    sec.appendChild(el('label',{'for':'final-reflection'},'처음과 비교해 누구의 이동을 더 살피게 되었나요? 내 운영 결과를 근거로 한두 문장 남겨 보세요.'));
    var answer=el('textarea',{id:'final-reflection',rows:3,'class':'textarea'});answer.value=typeof s.finalReflection==='string'?s.finalReflection:'';
    answer.addEventListener('input',function(){s.finalReflection=answer.value;App.save();});sec.appendChild(answer);
    sec.appendChild(el('p',{'class':'note'},'선택 입력 · '+(App.saveOk===false?'':'이 브라우저에 자동 저장돼요. ')+'점수와 보상에는 영향을 주지 않아요.'));/* 저장이 안 되는 동안에는 저장된다고 말하지 않는다(상단 #save-status가 알림) */
    var bar=el('div',{id:'review-done-bar'});bar.appendChild(el('button',{type:'button','class':'btn btn-primary',id:'btn-review-done',onclick:function(){openEnding(App,false);}},'완료 · 결과로'));if(UI.openReport)bar.appendChild(el('button',{type:'button','class':'btn',id:'btn-review-report',onclick:function(){UI.openReport(App,'review');}},'내 운영 보고서'));sec.appendChild(bar);panel.appendChild(sec);return {};
  }

  UI.ending = function (App, panel) {
    /* 2026-11-09 테스터 6번: ‘내 운영 보고서’(js/ui-report.js) — 열려 있으면 보고서만 */
    document.body.classList.toggle('report-open',App._reportFor===App.s&&!!UI.report);
    if(App._reportFor===App.s&&UI.report)return UI.report(App,panel);
    document.body.classList.toggle('review-open',App._reviewFor===App.s);
    if(App._reviewFor===App.s)return gameReview(App,panel);
    var s = App.s, sum = S.endingSummary(s);
    cfg=s.config;
    var end=s.end||{cause:'complete'},failed=end.cause==='bankrupt'||end.cause==='contract';
    var reactions=N.endingReactions(s.config,s.history),conclusion=N.endingConclusion(reactions,s.history,end);
    /* 컷을 건너뛰면 결과 맨 위(파산/결과 제목)로(2026-11-05 P2) — 끝까지 보면 예전처럼 ‘운행 기록 보기’ */
    function showReactions(){PB.Cutscene.play('ending',function(how){if(how!=='skip'){$('#btn-records').focus();return;}var p=$('#panel'),t=$('#ending-title');if(p)p.scrollTop=0;root.scrollTo(0,0);if(t){t.setAttribute('tabindex','-1');t.focus({preventScroll:true});}},reactions.concat(conclusion));}
    if (App._resultFor !== s) {
      App._resultFor = s;
      var counts = { stable: 0, improving: 0, remaining: 0 };
      Object.keys(sum.zones).forEach(function (z) { if (sum.zones[z].subtitle.firstPhase != null) counts[sum.zones[z].subtitle.kind]++; });
      PB.Storage.writeResult('이번 정류장은… · '+(failed?(end.cause==='bankrupt'?'파산':App.contractTitle(end))+' · ':'')+'생활권 안정 ' + counts.stable + ' · 개선 중 ' + counts.improving + ' · 과제 ' + counts.remaining);
    }
    panel.appendChild(el('p', { 'class': 'eyebrow' }, failed ? '운영 종료' : '학기 말 — 마무리'));
    panel.appendChild(el('h2', { id: 'ending-title' }, end.cause === 'bankrupt' ? '파산 — 학기 말 잔액이 0원 미만이에요' : end.cause === 'contract' ? App.contractTitle(end) : '한 학기 운행이 끝났어요'));
    if (App.player) {
      var who = el('p', { id: 'end-player', 'class': 'player-name' });
      who.textContent = App.player.nickname + ' 운영자님의 기록';
      panel.appendChild(who);
    }
    panel.appendChild(el('p', {id:'ending-verdict','class':'outcome-lead'}, conclusion.verdict));
    panel.appendChild(el('p', {id:'ending-profit'}, (failed?'보유 잔액 ':'누적 잔액 ')+App.won(conclusion.profit)+' · 지원금·운임에서 비용을 뺀 '+s.history.length+'단계 합계'));/* 2026-11-11 플레이테스트 13: ‘총 수익 · 누적 손익’ → 다른 화면과 같은 ‘누적 잔액’ */
    if (UI.finalScores) panel.appendChild(UI.finalScores(App, s));
    var reviewActions=el('div',{'class':'review-actions'});
    reviewActions.appendChild(el('button',{type:'button','class':'btn btn-primary',id:'btn-game-review',onclick:function(){openEnding(App,true);}},'돌아보기'));
    if(UI.openReport)reviewActions.appendChild(el('button',{type:'button','class':'btn',id:'btn-report',onclick:function(){UI.openReport(App,'ending');}},'내 운영 보고서'));
    reviewActions.appendChild(el('button',{type:'button','class':'btn',id:'btn-skip-review',onclick:function(){$('#btn-restart').scrollIntoView({block:'center'});$('#btn-restart').focus();}},'건너뛰기'));
    panel.appendChild(reviewActions);
    if(failed)panel.appendChild(failureReport(App,s));
    var families=s.history.reduce(function(a,h){var f=h.metrics.families;if(f){a.total+=f.total;a.complete+=f.complete;}return a;},{total:0,complete:0});
    if(families.total)panel.appendChild(el('p',{id:'ending-families'},'호수공원 가족 일정 '+families.total+'팀 중 '+families.complete+'팀 전원 방문·귀가 완료'));
    panel.appendChild(el('button',{type:'button',id:'btn-ending-replay','class':'btn',onclick:showReactions},'인물 반응 다시 보기'));
    panel.appendChild(el('p', null, '주요 인물의 이동부터 돌아봐요. 이야기는 실제 운행 기록에서만 만들어졌어요.'));
    cfg.residents.forEach(function (rd) {
      var story = N.residentStory(sum.residents[rd.id], rd.id, s.config);
      if (story) panel.appendChild(residentCard(App, story));
    });
    var btn = el('button', { type: 'button', 'class': 'btn', id: 'btn-records', 'aria-expanded': 'false', 'aria-controls': 'records', onclick: function () {
      var r = $('#records'); r.hidden = !r.hidden; btn.setAttribute('aria-expanded', String(!r.hidden)); if (!r.hidden) $('#rec-h').focus();
    } }, '운행 기록 보기');
    panel.appendChild(btn);
    var rec = records(App, sum);
    rec.querySelector('#rec-h').setAttribute('tabindex', '-1');
    panel.appendChild(rec);

    panel.appendChild(el('p', { id: 'end-seed', 'class': 'note' }, '사건 세팅: ' + (s.mode === 'random' ? '랜덤' : s.mode === 'fixed' ? '지정' : '기본') + ' ' + s.seed + ' · 시나리오 ' + cfg.SCENARIO_VERSION));
    panel.appendChild(el('button', { type: 'button', 'class': 'btn', id: 'btn-restart', onclick: function () { $('#confirm-restart').showModal(); } }, '처음부터 다시'));
    // Summary is shown first; resident scenes remain available through replay.
    return {};
  };
})(window);
