/*
 * 두 점수 화면(2026-10-27) — 결과 화면(단계)·엔딩(게임 전체)에 재정 건전성·이동 수요 충족을 나란히 보여 준다.
 * 계산은 js/scores.js(PB.Scores), 이 파일은 글과 배치만. 합산·순위·별점·점수 애니메이션 없음.
 * 문장은 모두 기록된 숫자로 만든다. 다음 행동 제안은 Scores.suggestions가 원인을 확인한 것만.
 */
(function (root) {
  'use strict';
  var PB = root.PB;
  var UI = PB.UI = PB.UI || {};

  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }
  function names(App, ids) { return ids.map(function (id) { return App.nodeName(id); }).join('·'); }
  function rate(t) { return t.N ? t.done / t.N : null; }

  function financeBox(App, f, extra) {
    var box = el('div', { 'class': 'score-box', id: 'score-finance' });
    box.appendChild(el('p', { 'class': 'score-name' }, '재정 건전성'));
    if (!f) { box.appendChild(el('p', { 'class': 'score-value hold' }, '평가 자료 없음')); return box; }
    if (f.status === 'hold') {
      box.appendChild(el('p', { 'class': 'score-value hold', 'data-score': '' }, '서비스 미운영 — 재정 건전성 평가 보류'));
      box.appendChild(el('p', { 'class': 'score-basis' }, '누적 잔액 ' + App.won(f.balance) + (extra ? ' · ' + extra : '')));
      box.appendChild(el('p', { 'class': 'score-state' }, '운행한 버스가 없어 재정 여력을 평가하지 않아요. 돈이 남아도 운영을 잘했다는 뜻은 아니에요.'));
      return box;
    }
    var v = el('p', { 'class': 'score-value', 'data-score': String(f.score) }); v.appendChild(el('b', null, String(f.score))); v.appendChild(document.createTextNode('점'));
    box.appendChild(v);
    box.appendChild(el('p', { 'class': 'score-basis' }, '누적 잔액 ' + App.won(f.balance) + ' / 기준 예비비 ' + App.won(f.reserve.amount)));
    box.appendChild(el('p', { 'class': 'score-state' }, f.status === 'full' ? '기준 예비비를 확보했어요. 더 모아도 점수는 그대로예요.' :
      f.status === 'partial' ? '기준 예비비의 ' + f.score + '%를 갖고 있어요.' : f.status === 'zero' ? '남은 잔액이 없어요.' : '잔액이 0원 미만이에요.'));
    return box;
  }
  function mobilityBox(App, m) {
    var box = el('div', { 'class': 'score-box', id: 'score-mobility' });
    box.appendChild(el('p', { 'class': 'score-name' }, '이동 수요 충족'));
    if (!m || !m.N) { box.appendChild(el('p', { 'class': 'score-value hold', 'data-score': '' }, m ? '평가할 수요 없음' : '평가 자료 없음')); return box; }
    var v = el('p', { 'class': 'score-value', 'data-score': String(m.score) }); v.appendChild(el('b', null, String(m.score))); v.appendChild(document.createTextNode('점'));
    box.appendChild(v);
    box.appendChild(el('p', { 'class': 'score-basis' }, m.N + '건 중 ' + m.done + '건 완료'));
    return box;
  }

  // 놓친 이동 한 줄 — 외곽이 전체보다 뒤처지면 외곽을, 아니면 가장 많이 남은 출발 지역을 짚는다
  function missedLine(App, m) {
    if (!m.N) return '평가할 이동 수요가 없어요.';
    if (m.done === m.N) return '평가 대상 이동을 모두 마쳤어요.';
    var o = m.outer, oMiss = o.N - o.done, overall = rate(m), focus;
    if (oMiss > 0 && rate(o) < overall) focus = PB.Narrative.josa(names(App, o.ids), '을를') + ' 오가는 이동 ' + o.N + '건 중 ' + oMiss + '건이 남았어요';
    else if (m.worst) focus = App.nodeName(m.worst.id) + '에서 출발한 이동 ' + m.worst.N + '건 중 ' + m.worst.missed + '건이 남았어요';
    else focus = (m.N - m.done) + '건이 남았어요';
    if (m.score >= 80) return '전체 이동은 대부분 완료했지만, ' + focus + '.';
    return '평가 수요 ' + m.N + '건 중 ' + (m.N - m.done) + '건을 마치지 못했어요. ' + focus + '.';
  }
  function publicList(App, m) {
    var ul = el('ul', { 'class': 'score-sub', id: 'score-public' }), overall = rate(m);
    function item(id, label, t) {
      if (!t.N) { ul.appendChild(el('li', { id: id }, label + ': 이번 범위에 평가 수요 없음')); return; }
      var low = rate(t) < overall;
      ul.appendChild(el('li', { id: id, 'class': low ? 'low' : null }, label + ' ' + t.N + '건 중 ' + t.done + '건 완료' + (t.done < t.N ? ' (' + (t.N - t.done) + '건 남음)' : '') + (low ? ' · 전체 비율보다 낮아요' : '')));
    }
    item('score-outer', PB.Narrative.josa(names(App, m.outer.ids), '을를') + ' 오가는 이동', m.outer);
    item('score-essential', '필수 목적지(' + names(App, m.essential.ids) + ')로 가는 이동', m.essential);
    if (m.worst) ul.appendChild(el('li', { id: 'score-worst' }, '가장 많이 남은 곳: ' + App.nodeName(m.worst.id) + ' 출발 ' + m.worst.missed + '건 (' + m.worst.N + '건 중)'));
    return ul;
  }
  function tipList(App, list) {
    if (!list.length) return null;
    var ol = el('ul', { 'class': 'score-tips', id: 'score-tips' });
    list.forEach(function (t) {
      var text = t.code === 'full' ? t.num + '번 노선에서 만차가 ' + t.fulls + '회 났고, 만차를 겪은 뒤 끝내 마치지 못한 이동이 ' + t.missed + '건이에요. 이 노선 구간의 증차를 검토해 보세요.' :
        t.code === 'noLink' ? '잇는 노선이 없어 떠나지 못한 이동이 ' + t.missed + '건이에요(가장 많은 구간 ' + App.nodeName(t.pair.o) + '→' + App.nodeName(t.pair.d) + ' ' + t.pair.n + '건). 노선 연결을 검토해 보세요.' :
        t.num + '번 노선은 버스 ' + t.buses + '대가 대당 ' + t.perBus + '회 승차로 운행 노선 평균(' + t.avg + '회)의 절반에 못 미쳤고 만차는 없었어요. 버스 배치 조정을 검토해 보세요. 꼭 필요한 곳을 잇는 노선이라면 1대는 남겨 두세요.';
      ol.appendChild(el('li', { 'data-tip': t.code }, text));
    });
    return ol;
  }
  var REASON = { noLink: '잇는 노선 없음', full: '만차를 겪고 못 마침', time: '운행 종료까지 못 마침', parentFailed: '선행 이동 미완료로 진행하지 못한 이동', lateParent: '선행 이동이 늦어 운행 시간 안에 시작하지 못한 이동' };
  function method(App, sc, opts) {
    var d = el('details', { 'class': 'score-method', id: 'score-method' });
    d.appendChild(el('summary', null, '계산 방법과 비용 내역'));
    var m = sc.mobility, f = sc.finance, kv = el('dl', { 'class': 'kv' });
    function row(k, v) { kv.appendChild(el('dt', null, k)); kv.appendChild(el('dd', null, v)); }
    row('이동 수요 충족', '완료한 평가 수요 ÷ 평가 대상 이동 수요 × 100(소수점 버림). 목적지에 도착해야 완료, 탑승만 한 것·환승 횟수는 더하지 않아요.');
    if (m && m.kinds) row('평가 대상', ['planned', 'followUp', 'extra'].filter(function (k) { return m.kinds[k]; }).map(function (k) { return { planned: '예정 이동', followUp: '알려진 왕복의 돌아오는 이동', extra: '돌발 수요' }[k] + ' ' + m.kinds[k].N + '건'; }).join(' · '));
    if (m && m.excluded) row('평가에서 뺀 요청', m.excluded + '건 — 운행 종료 직전에 생겨, 바로 태운 직행 버스로도 운행 시간 안에 도착할 수 없는 이동(어떤 계획이든 같음)');
    if (m && m.reasons) { var rs = Object.keys(REASON).filter(function (k) { return m.reasons[k]; }).map(function (k) { return REASON[k] + ' ' + m.reasons[k] + '건'; }); if (rs.length) row('남은 이동', rs.join(' · ')); }
    row('재정 건전성', '정산 뒤 누적 잔액 ÷ 기준 예비비 × 100(0~100, 소수점 버림). 기준 예비비에 닿으면 100점이고 더 모아도 오르지 않아요.');
    if (f) row('기준 예비비', '기본 제공 버스 ' + f.reserve.fleet + '대 × (보유비 ' + App.won(App.s.config.finance.holding) + ' + 기준 버스 하루 운행비 ' + App.won(f.reserve.busCost) + ' − 기본 지원 ' + App.won(App.s.config.finance.basePerBus) + ')' + (f.reserve.phases !== 1 ? ' × ' + f.reserve.phases : '') + ' = ' + App.won(f.reserve.amount) + '. 운임·수행분 없이 한 단계를 기준대로 운행할 수 있는 돈이에요. 기준 버스 하루 운행비는 정류장 두 곳을 오가는 노선 1대의 운영비+연료비 중앙값이라 버스를 쉬게 해도 줄지 않아요. 임차 버스는 넣지 않아요.');
    if (opts.cost) row('이번 회차', opts.cost);
    d.appendChild(kv);
    d.appendChild(el('p', { 'class': 'note' }, (opts.defNote ? opts.defNote + ' ' : '') + '아직 받지 않은 공공서비스 수행분은 잔액에 넣지 않고, 임차료는 그 단계 정산에서 한 번만 빠져요. 두 점수는 합치지 않아요 — 돈을 많이 남겨도 놓친 이동이 메워지지 않아요.'));
    return d;
  }
  var NOTE = '두 점수는 운영 결과를 돌아보고 다음 계획을 고치기 위한 참고 지표예요. 윤리성이나 성적을 재는 점수가 아니에요.';

  // 단계 결과(결과 화면 맨 위). h = 이번 단계 기록(h.scores), routes = Metrics.routeReport 행
  UI.phaseScores = function (App, h, routes) {
    var sec = el('section', { id: 'scores', 'class': 'scores', 'aria-labelledby': 'scores-h' });
    sec.appendChild(el('h3', { id: 'scores-h' }, h.phase + '단계 두 점수'));
    var sc = h.scores;
    if (!sc) { sec.appendChild(el('p', { 'class': 'note' }, '이 단계는 이전 저장본이라 평가 자료가 없어요(다시 계산한 운행이 기록과 달라 채우지 않았어요).')); return sec; }
    var k = PB.Metrics.costParts(h.metrics.costs), pair = el('div', { 'class': 'score-pair' });
    pair.appendChild(financeBox(App, sc.finance, '이번 회차 수지 ' + App.won(k.total)));
    pair.appendChild(mobilityBox(App, sc.mobility));
    sec.appendChild(pair);
    sec.appendChild(el('p', { 'class': 'score-line', id: 'score-line' }, missedLine(App, sc.mobility)));
    if (sc.mobility.N) sec.appendChild(publicList(App, sc.mobility));
    var tips = tipList(App, PB.Scores.suggestions(App.s.config, sc.mobility, routes)); if (tips) sec.appendChild(tips);
    var unreal = (sc.mobility.reasons.parentFailed || 0) + (sc.mobility.reasons.lateParent || 0);
    sec.appendChild(method(App, sc, {
      cost: '수입 ' + App.won(k.subsidyBase + k.subsidyService + k.fare) + ' − 비용 ' + App.won(k.holding + k.lease + k.op + k.fuel) + ' = 회차 수지 ' + App.won(k.total) + ' (항목별 표는 아래 ‘전체 통계와 재정 보기’)',
      defNote: '아래 ‘발생한 이동 요청’은 운행 중 실제로 생긴 요청만 세요.' + (unreal ? ' 점수의 평가 수요에는 선행 이동을 못 마쳐 생기지 않은 돌아오는 이동 ' + unreal + '건도 들어 있어요 — 첫 이동을 놓쳐도 분모가 줄지 않아요.' : '')
    }));
    sec.appendChild(el('p', { 'class': 'note' }, NOTE));
    return sec;
  };

  // 게임 전체(엔딩). 이동 = 모든 단계 완료 합 ÷ 평가 수요 합, 재정 = 마지막 정산 잔액 ÷ 마지막 단계 기준 예비비
  UI.finalScores = function (App, s) {
    var o = PB.Session.scoresOverall(s), sec = el('section', { id: 'final-scores', 'class': 'scores', 'aria-labelledby': 'final-scores-h' });
    sec.appendChild(el('h3', { id: 'final-scores-h' }, '한 학기 두 점수'));
    var early = o.to != null && o.to < o.total;
    sec.appendChild(el('p', { 'class': 'note', id: 'score-range' }, o.from == null ? '운행한 단계가 없어요.' : o.from + '~' + o.to + '단계 운행 기준' + (early ? '(전체 ' + o.total + '단계 중 ' + o.to + '단계에서 운영 종료)' : '(전체 ' + o.total + '단계)') + '. 이동은 모든 단계의 완료 건수 합 ÷ 평가 수요 합, 재정은 마지막 정산 잔액 ÷ 마지막 단계 기준 예비비예요.'));
    if (o.missing.length) sec.appendChild(el('p', { 'class': 'note', id: 'score-missing' }, o.missing.join('·') + '단계는 이전 저장본이라 평가 자료가 없어 합계에서 뺐어요.'));
    var pair = el('div', { 'class': 'score-pair' });
    pair.appendChild(financeBox(App, o.finance));
    pair.appendChild(mobilityBox(App, o.mobility));
    sec.appendChild(pair);
    sec.appendChild(el('p', { 'class': 'score-line', id: 'score-line' }, missedLine(App, o.mobility)));
    if (o.mobility.N) sec.appendChild(publicList(App, o.mobility));
    var d = el('details', { 'class': 'score-method', id: 'score-phases' });
    d.appendChild(el('summary', null, '단계별 두 점수와 계산 방법'));
    var rows = s.history.map(function (h) {
      var sc = h.scores; if (!sc) return [h.phase + '단계', '자료 없음', '자료 없음', '-', '-'];
      var f = sc.finance, m = sc.mobility;
      return [h.phase + '단계', f.score == null ? '보류(미운영)' : f.score + '점', m.score == null ? '수요 없음' : m.score + '점 (' + m.done + '/' + m.N + ')', App.won(f.balance), App.won(f.reserve.amount)];
    });
    d.appendChild(UI.table(['단계', '재정 건전성', '이동 수요 충족', '누적 잔액', '기준 예비비'], rows));
    var last = s.history.filter(function (h) { return h.scores; }).slice(-1)[0];
    if (last) d.appendChild(method(App, { mobility: o.mobility, finance: o.finance }, {}).querySelector('dl'));
    d.appendChild(el('p', { 'class': 'note' }, '단계별 퍼센트의 평균이 아니라 건수 합으로 계산해요. 다른 모드·세팅 번호의 점수는 지도·수요·사건이 달라 같은 난이도의 순위로 비교할 수 없어요.'));
    sec.appendChild(d);
    sec.appendChild(el('p', { 'class': 'note' }, NOTE));
    return sec;
  };
})(window);
