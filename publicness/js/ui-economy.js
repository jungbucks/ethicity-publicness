/* 경제 정보 화면 조각(2026-10-27) — 계획 화면(지도 아래)·출발 확인·결과가 같은 말과 같은 표를 쓴다.
 * 계획 중 숫자는 모두 ‘기본 수요 기준 예상’(돌발 수요 없음, Session.expectedRun) — 확정 수입처럼 쓰지 않는다.
 * 수치는 게임용 가상 값이다. */
(function (root) {
  'use strict';
  var PB = root.PB, S = PB.Session, M = PB.Metrics, Q = PB.Schedule, G = PB.Graph, UI = PB.UI, E = {}, cache = { key: null };
  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }
  function won(n) { return app().won(n); }
  function signed(n) { return (n > 0 ? '+' : '') + won(n); }

  // 기본 수요 기준 예상 운행 + 노선별 재정. 초안이 같으면 다시 계산하지 않는다(지도 재배치 타이머 등)
  E.plan = function (s) {
    var key = s.phase + '|' + s.seed + '|' + JSON.stringify(s.draft);
    if (cache.key === key && cache.s === s) return cache.val;
    var run = S.expectedRun(s), k = run.metrics.costs;
    cache = { key: key, s: s, val: { run: run, k: k, econ: M.routeEconomy(run.result, S.routesInOrder(s), s.draft.buses, s.config, S.graph(s)) } };
    return cache.val;
  };
  // 같은 노선 버스 n대의 배차 간격(엔진 초). 한 바퀴 시간 ÷ n — 자동 간격 출발과 같은 기준
  E.headway = function (s, num, n) {
    var r = S.routeByNum(s, num);
    if (!r || !n || G.validateRoute(S.graph(s), r).length) return null;
    var first = s.draft.buses.filter(function (b) { return b.routeNum === num; })[0], id = first ? first.id : 1;
    return Q.cycleMinutes(S.graph(s), s.config, id, r) / n;
  };
  E.routeKm = function (s, num) { var r = S.routeByNum(s, num); return r && r.nodes.length >= 2 && !G.validateRoute(S.graph(s), r).length ? G.routeKm(S.graph(s), r) : null; };
  function km(x) { return (Math.round(x * 10) / 10) + 'km'; }
  // 편집 중인 노선 한 줄: 길이·버스·간격·비용·운임·손익
  E.routeLine = function (s, num) {
    var len = E.routeKm(s, num); if (len == null) return '';
    var n = s.draft.buses.filter(function (b) { return b.routeNum === num; }).length, row = E.plan(s).econ.rows.filter(function (r) { return r.num === num; })[0];
    if (!n) return num + '번 · 한 바퀴 ' + km(len) + ' · 운행 대기(버스 0대) — 버스를 옮기면 비용과 운임이 생겨요.';
    return num + '번 · 한 바퀴 ' + km(len) + ' · 버스 ' + n + '대 · 약 ' + app().duration(E.headway(s, num, n)) + ' 간격 · 운영·연료 약 ' + won(row ? row.cost : 0) +
      ' · 운임 약 ' + won(row ? row.fare : 0) + ' → 손익 ' + signed(row ? row.profit : 0) + ' (기본 수요 기준 예상)';
  };
  // 공공서비스 수행 조건 목록(달성 여부·정차 횟수·금액)
  E.conditions = function (k, expected) {
    var ul = el('ul', { 'class': 'plain service-checks' });
    (M.costParts(k).service || []).forEach(function (c) {
      var li = el('li', { 'data-node': c.id, 'class': c.met ? 'met' : 'unmet' });
      li.appendChild(el('b', null, (c.met ? '✓ ' : '· ') + c.label));
      li.appendChild(document.createTextNode(' · 하루 ' + c.stops + '/' + c.need + '회 정차 · ' + (c.met ? won(c.amount) + (expected ? ' 받을 예정' : ' 받음') : (expected ? '지금 계획으로는 못 받아요' : '받지 못함'))));
      ul.appendChild(li);
    });
    return ul;
  };
  E.conditionText = function (s) {
    var F = s.config.finance.service, list = F.stops.filter(function (x) { return x.fromPhase <= s.phase && S.graph(s).has(x.id); });
    return list.map(function (x) { return x.label; }).join('·') + ' — 실제로 달리는 버스가 운행 시간 안에 ' + F.minStops + '회 이상 정차하면 곳마다 ' + won(F.amount) + '(승객 수와 무관, 단계 정산 때 지급)';
  };
  // 이번 단계 재정표(결과·계획 공통). expected면 ‘예상’ 문구
  E.financeTable = function (k, opts) {
    opts = opts || {};
    var F = app().s.config.finance, c = M.costParts(k), provided = F.holding ? Math.round(c.holding / F.holding) : 0, rows;
    if (c.legacy) rows = [['위탁 지원금(이전 규칙)', won(c.subsidyBase)], ['운임 수입', won(c.fare)], ['차량 보유비', won(-c.holding)], ['원격 관제·운영비', won(-c.op)], ['에너지·정비(이전 규칙: 이동 시간)', won(-c.fuel)]];
    else {
      var met = c.service.filter(function (x) { return x.met; }).length;
      rows = [['지원금 · 기본 (기본 제공 차량 ' + provided + '대)', won(c.subsidyBase)],
        ['지원금 · 공공서비스 수행분 (' + met + '/' + c.service.length + ')', won(c.subsidyService)],
        ['운임 수입' + (opts.expected ? ' (기본 수요 예상)' : ''), won(c.fare)],
        ['차량 보유비 (기본 제공 ' + provided + '대, 쉬어도 듦)', won(-c.holding)]];
      if (c.lease || opts.showLease) rows.push(['임차료 (이번 단계 ' + c.leased + '대)', won(-c.lease)]);
      rows.push(['관제·운영비 (운행 배정 차량의 하루)', won(-c.op)], ['연료·정비비 (주행 ' + km(c.km || 0) + ')', won(-c.fuel)]);
    }
    var t = UI.table(['항목', '금액'], rows, [opts.expected ? '이번 단계 수지(예상)' : '이번 단계 회차 수지', won(c.total) + (!opts.expected && c.total < 0 ? ' (적자)' : '')]);
    t.querySelector('table').classList.add('finance-table');
    return t;
  };
  // 노선별 재정과 이동 — 경제적 부담과 그 노선이 책임진 이동을 나란히(폐지 권고 없음)
  E.routeTable = function (econ, opts) {
    opts = opts || {};
    var rows = econ.rows.map(function (r) {
      return [r.num != null ? r.num + '번' : '기타', r.buses + '대', won(r.fare), won(-r.cost), signed(r.profit), r.arrived + '건',
        r.service.length ? r.service.map(function (x) { return x.label + ' ' + x.stops + '회'; }).join(', ') : '-'];
    });
    var wrap = el('div', { 'class': 'route-economy' }), c = econ.common, sum = econ.rows.reduce(function (a, r) { return a + r.profit; }, 0);
    var t = UI.table(['노선', '버스', '운임(첫 탑승)', '운영·연료비', '손익', opts.expected ? '도착 예상' : '도착', '공공서비스 정차'], rows);
    t.querySelector('table').classList.add('route-economy-table');
    wrap.appendChild(t);
    wrap.appendChild(el('p', { 'class': 'note' }, '운임은 그 이동이 처음 탄 노선에 한 번만 세요(환승해도 나누지 않아요). 운영·연료비는 버스가 달린 노선에 넣어요. 보유비·임차료·지원금은 노선에 나누지 않은 공동 항목이에요: 노선 손익 합 ' + signed(sum) + ' + 지원금 ' + won(c.subsidyBase + c.subsidyService) + ' − 보유비 ' + won(c.holding) + (c.lease ? ' − 임차료 ' + won(c.lease) : '') + ' = 이번 단계 수지 ' + signed(sum + c.subsidyBase + c.subsidyService - c.holding - c.lease) + '.'));
    wrap.appendChild(el('p', { 'class': 'note' }, '손익이 마이너스인 노선도 누군가의 이동을 책임지고 있을 수 있어요. 도착한 이동과 공공서비스 정차를 함께 보세요.'));
    return wrap;
  };
  /* 운행 중 ‘지금까지’ 수지(2026-11-01, 표시용): 단계에 정해진 몫(기본 지원 − 보유비 − 임차료) + 그 시각까지 받은 운임
   * − 그 시각까지 든 관제·운영비와 연료·정비비 + 그 시각까지 조건을 채운 공공서비스 수행분. 정산 숫자(Sim finance)는 바꾸지 않고
   * 같은 규칙을 시각 t까지만 센다 — 운행이 끝나는 시각에는 정산 수지와 같다(테스트). 운영비는 운행 배정 시각부터 고르게, 연료비는 달린 거리만큼, 운임은 첫 탑승 때 */
  E.live = function (s, tf) {
    var res = s.current && s.current.result; if (!res) return null;
    var F = s.config.finance, W = s.config.bus.window, plan = s.current.plan, g = S.graph(s), t = Math.max(0, Math.min(W, tf));
    var leased = plan.buses.filter(function (b) { return b.leased; }).length, provided = plan.buses.length - leased;
    var riders = res.passengers.filter(function (p) { return p.firstBoardT != null && p.firstBoardT <= t; }).length, op = 0, km = 0;
    res.timelines.forEach(function (tl) { var m = tl.opMinutes || 0; op += Math.max(0, Math.min(m, t - (W - m))); km += Q.driven(g, tl.segments, t); });
    var service = 0, sv = F.service;
    if (sv) sv.stops.filter(function (x) { return x.fromPhase <= s.phase && g.has(x.id); }).forEach(function (x) {
      var n = 0; res.timelines.forEach(function (tl) { tl.visits.forEach(function (v) { if (v.node === x.id && v.kind === 'stop' && v.t <= t) n++; }); });
      if (n >= sv.minStops) service += sv.amount;
    });
    var fixed = (F.basePerBus || 0) * provided - F.holding * provided - (F.lease ? F.lease.fee : 0) * leased;
    var opWon = Math.round(F.opPerMin * op), fuelWon = Math.round(F.fuelPerKm * km);
    return { t: t, total: fixed + service + F.fare * riders - opWon - fuelWon, fixed: fixed, fare: F.fare * riders, op: opWon, fuel: fuelWon, service: service };
  };
  // 계획 화면(지도 아래) — 접힌 줄 하나 + 펼치면 상세. 편집 중 노선 한 줄은 늘 보인다
  E.planPanel = function (s, state) {
    var p = E.plan(s), k = p.k, c = M.costParts(k), box = el('section', { id: 'plan-econ', 'aria-labelledby': 'plan-econ-h' }), bal = S.balance(s);
    var met = c.service.filter(function (x) { return x.met; }).length;
    var head = el('p', { id: 'plan-econ-h', 'class': 'econ-line' });
    // 노선이 없으면 숫자 대신 안내(2026-11-01: 노선이 없는데 ‘예상 −20,000’이 크게 떠 있었다)
    if (!s.draft.routes.some(function (r) { return r.nodes.length >= 2; })) { head.appendChild(el('b', null, '이번 단계 예상 수지')); head.appendChild(el('span', { 'class': 'econ-empty' }, ' · 노선을 만들면 예상 수지가 나와요')); box.appendChild(head); return box; }
    head.appendChild(el('b', null, '이번 단계 예상 수지 ' + signed(c.total)));
    head.appendChild(document.createTextNode(' · 수행분 ' + met + '/' + c.service.length + ' · 누적 잔액 ' + won(bal) + ' → 약 ' + won(bal + c.total)));
    head.appendChild(el('small', null, ' 기본 수요 기준 예상(돌발 수요 제외)'));
    box.appendChild(head);
    if (state.editing != null) { var line = E.routeLine(s, state.editing); if (line) box.appendChild(el('p', { id: 'route-econ', 'class': 'econ-route' }, line)); }
    var d = el('details', { id: 'plan-econ-more' }); d.open = !!state.econOpen;
    d.addEventListener('toggle', function () { state.econOpen = d.open; });
    d.appendChild(el('summary', null, '재정 상세 · 공공서비스 조건 · 노선별'));
    d.appendChild(el('h4', null, '공공서비스 수행분'));
    d.appendChild(el('p', { 'class': 'note' }, E.conditionText(s)));
    d.appendChild(E.conditions(k, true));
    d.appendChild(el('h4', null, '이번 단계 재정(예상)'));
    d.appendChild(E.financeTable(k, { expected: true, showLease: true }));
    d.appendChild(el('h4', null, '노선별(예상)'));
    d.appendChild(E.routeTable(p.econ, { expected: true }));
    d.appendChild(el('p', { 'class': 'note' }, '기본 지원은 기본 제공 차량 1대당 ' + won(s.config.finance.basePerBus) + '(보유비 ' + won(s.config.finance.holding) + '의 일부)예요. 운행하지 않으면 보유비가 더 커서 돈이 줄어요. 임차는 이번 단계에만 쓰는 차량 확보 비용(' + won(s.config.finance.lease.fee) + ', 쉬어도 듦, 단계가 끝나면 자동 반납)이고, 운행하면 운영비·연료비가 따로 들어요.'));
    box.appendChild(d);
    return box;
  };
  UI.Econ = E;
})(window);
