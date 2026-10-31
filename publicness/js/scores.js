/*
 * 두 점수(2026-10-27) — 재정 건전성 · 이동 수요 충족. 각각 0~100점, 합산 총점·종합 순위·별점은 없다.
 * 플레이 결과를 이해하고 다음 계획을 고치는 피드백이며, 학생의 윤리성이나 학업 성취를 재는 점수가 아니다.
 * 두 점수는 서로 섞지 않는다(재정 점수에 주민 이동을 곱하지 않고, 이동 점수에 돈을 더하지 않는다).
 *
 * ■ 이동 수요 충족 = 완료한 평가 수요 / 평가 대상 이동 수요 × 100 (내림 — 모두 마쳐야 100점)
 *   평가 대상은 계획과 무관하게 정해진다(같은 단계·seed면 어떤 계획이든 같은 분모):
 *     예정 이동 = Demand.base(계획 전에 공개되는 기본 수요)
 *     + 알려진 왕복의 돌아오는 이동(returnTrip이 있는 요청마다 1건) — 시뮬레이션에서는 첫 이동이 도착해야 생기지만,
 *       평가에서는 처음부터 필요한 이동으로 센다. 첫 이동을 막아 분모를 줄이는 편법을 없앤다.
 *     + 돌발 수요(그 seed의 사건으로 정해진 추가분, 발생한 단계에만)
 *   완료 = 목적지 도착. 탑승만은 미완료, 환승은 가산 없음. 요청 키로 한 번씩만 센다.
 *   미완료 사유: 노선 없음 / 만차로 못 탄 적 있음 / 운행 종료까지 못 마침 /
 *     선행 이동 미완료로 진행하지 못한 이동 / 선행 이동이 늦어 운행 시간 안에 시작하지 못한 이동
 *   (뒤의 두 가지는 시뮬레이션에 요청이 생기지 않은 것 — ‘발생했다’고 표시하지 않는다)
 *   평가 기간 = 그 단계 운행 시간. 이상적인 직행 버스가 바로 태워도 운행 종료 전에 도착할 수 없는 요청(종료 직전 생긴 먼 이동,
 *   그런 첫 이동에 딸린 귀가 포함)은 어떤 계획으로도 완료를 요구할 수 없어 평가에서 빼고 excluded로 센다(계획과 무관).
 *   기존 Metrics.summarize의 N(실제로 생긴 요청 수)은 그대로 두며 정의가 다르다.
 *
 * ■ 재정 건전성 = 정산 후 보유 잔액 / 기준 예비비 × 100 (0~100으로 자르고 내림)
 *   ‘쌓은 돈’이 아니라 ‘필요한 서비스를 이어 갈 여력’ — 기준 예비비에 닿으면 만점이고 더 쌓아도 오르지 않는다.
 *   기준 예비비 = 기본 제공 차량 수 × (보유비 + 기준 버스 하루 운행비 − 기본 지원) × reservePhases
 *     기준 버스 하루 운행비 = 이 단계 정류장 두 곳 왕복 노선들의 1대 운영비+연료비 중앙값(계획 화면 ‘대략 비용’과 같은 값).
 *     차량 수는 단계 진행으로 정해지고(임차 제외), 노선 후보도 지도로 정해져서 학생이 버스를 쉬게 해도 기준이 줄지 않는다.
 *     뜻: 방금 운영한 규모로 한 단계를 운임·수행분 없이 버틸 수 있는 돈.
 *   보유 잔액은 확정 정산의 합 — 아직 받지 않은 수행분은 들어 있지 않고, 임차료는 그 단계 정산에서 한 번만 빠졌다.
 *   운행한 버스가 없는 단계는 ‘서비스 미운영 — 평가 보류’(점수 없음, 잔액·수지는 그대로 보여 준다).
 */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var Demand = NODE ? require('./demand.js') : root.PB.Demand;
  var Schedule = NODE ? require('./schedule.js') : root.PB.Schedule;
  var Graph = NODE ? require('./graph.js') : root.PB.Graph;

  var VERSION = 'sc-1';
  var DEFAULTS = { reservePhases: 1, outer: ['F'], suggest: { fullMin: 3, lowUseRatio: 0.5 } };
  function opts(config) { var o = config.scores || {}; return { reservePhases: o.reservePhases != null ? o.reservePhases : DEFAULTS.reservePhases, outer: o.outer || DEFAULTS.outer, suggest: o.suggest || DEFAULTS.suggest }; }
  function pct(done, n) { return n ? Math.floor(100 * done / n) : null; }

  // 이 단계 정류장 두 곳 왕복 노선들의 1대 하루 운영비+연료비 중앙값(대도시 N 제외). Session.typicalBusCost도 이 값을 반올림해 쓴다
  function referenceBusCost(g, config) {
    var F = config.finance, list = [];
    g.nodes.forEach(function (a, i) { g.nodes.slice(i + 1).forEach(function (b) {
      if (a === 'N' || b === 'N') return;
      var tl = Schedule.timeline(g, config, 1, { nodes: [a, b], stops: [true, true] }, 0);
      list.push(F.opPerMin * tl.opMinutes + F.fuelPerKm * tl.km);
    }); });
    list.sort(function (a, b) { return a - b; });
    return list.length ? list[Math.floor(list.length / 2)] : 0;
  }
  function reserve(config, g, fleet) {
    var F = config.finance, bus = referenceBusCost(g, config);
    var perBus = F.holding + bus - (F.basePerBus || 0);
    return { amount: Math.round(fleet * perBus * opts(config).reservePhases / 100) * 100, fleet: fleet, busCost: Math.round(bus), perBus: Math.round(perBus), phases: opts(config).reservePhases };
  }

  // 평가 대상 이동 수요 목록(계획과 무관). ev = 그 단계 사건(Demand.drawEvents의 한 칸)
  function units(config, phase, seed, ev) {
    var out = [], g = Graph.build(config, phase), W = config.bus.window;
    function reach(o, d, t) { return t + g.time(o, d); } // 바로 태운 직행 버스의 도착 시각(대기·환승 0)
    Demand.base(config, phase, seed).forEach(function (q) {
      var arr = reach(q.o, q.d, q.t);
      out.push({ key: q.key, o: q.o, d: q.d, kind: 'planned', feasible: arr <= W });
      if (q.returnTrip) {
        var dest = q.returnTrip.destination || q.o, ready = Math.max(arr + Math.max(1, q.returnTrip.stay), q.returnTrip.earliest);
        out.push({ key: q.key + '-return', o: q.d, d: dest, kind: 'followUp', parent: q.key, feasible: arr <= W && ready < W && reach(q.d, dest, ready) <= W });
      }
    });
    Demand.extra(config, phase, ev).forEach(function (q) { out.push({ key: q.key, o: q.o, d: q.d, kind: 'extra', feasible: reach(q.o, q.d, q.t) <= W }); });
    return out;
  }

  function tally(list) { return { N: list.length, done: list.filter(function (u) { return u.done; }).length }; }

  // 한 단계 이동 수요 충족. passengers = Sim 결과 승객(귀가 요청 포함)
  function mobility(config, phase, seed, ev, passengers) {
    var byKey = {}, list = units(config, phase, seed, ev), seen = {}, excluded = 0;
    passengers.forEach(function (p) { if (!(p.key in byKey)) byKey[p.key] = p; });
    list = list.filter(function (u) { if (seen[u.key]) return false; seen[u.key] = true; return true; }); // 같은 요청을 두 번 세지 않는다
    list = list.filter(function (u) { if (!u.feasible) excluded++; return u.feasible; });
    list.forEach(function (u) {
      var p = byKey[u.key];
      u.done = !!p && p.status === 'arrived';
      if (u.done) return;
      if (!p) { var parent = byKey[u.parent]; u.reason = u.kind === 'followUp' && parent && parent.status === 'arrived' ? 'lateParent' : u.kind === 'followUp' ? 'parentFailed' : 'time'; }
      else u.reason = p.fail === 'NO_LINK' ? 'noLink' : p.deniedBoardings > 0 ? 'full' : 'time';
    });
    var O = opts(config), all = tally(list), reasons = { noLink: 0, full: 0, time: 0, parentFailed: 0, lateParent: 0 }, kinds = {}, zones = {}, pairs = {};
    list.forEach(function (u) {
      var k = kinds[u.kind] || (kinds[u.kind] = { N: 0, done: 0 }); k.N++; if (u.done) k.done++;
      var z = zones[u.o] || (zones[u.o] = { N: 0, done: 0 }); z.N++; if (u.done) z.done++;
      if (!u.done) { reasons[u.reason]++; if (u.reason === 'noLink') { var key = u.o + '-' + u.d; pairs[key] = (pairs[key] || 0) + 1; } }
    });
    var outer = tally(list.filter(function (u) { return O.outer.indexOf(u.o) >= 0 || O.outer.indexOf(u.d) >= 0; }));
    var essential = tally(list.filter(function (u) { return config.essential.indexOf(u.d) >= 0; }));
    var order = config.nodes.map(function (n) { return n.id; }), worst = null;
    order.forEach(function (id) { var z = zones[id]; if (z && z.N - z.done > 0 && (!worst || z.N - z.done > worst.missed)) worst = { id: id, N: z.N, done: z.done, missed: z.N - z.done }; });
    var noLinkPairs = Object.keys(pairs).map(function (k) { return { o: k.split('-')[0], d: k.split('-')[1], n: pairs[k] }; }).sort(function (a, b) { return b.n - a.n; });
    return { N: all.N, done: all.done, score: pct(all.done, all.N), excluded: excluded, kinds: kinds, reasons: reasons, zones: zones, outer: { ids: O.outer.slice(), N: outer.N, done: outer.done },
      essential: { ids: config.essential.slice(), N: essential.N, done: essential.done }, worst: worst, noLinkPairs: noLinkPairs.slice(0, 3) };
  }

  // 재정 건전성. served = 이 범위에서 노선을 달린 버스가 있었는지. 잔액·기준은 원 단위
  function finance(balance, res, served) {
    var out = { balance: balance, reserve: res, served: !!served };
    if (!served) { out.status = 'hold'; out.score = null; return out; }
    out.score = balance <= 0 ? 0 : Math.min(100, Math.floor(100 * balance / res.amount));
    out.status = balance < 0 ? 'negative' : balance === 0 ? 'zero' : balance >= res.amount ? 'full' : 'partial';
    return out;
  }

  // 단계 정산 직후 기록(Session.finishRun → entry.scores). plan = 출발 계획, passengers = 실제 운행 승객, balance = 정산 뒤 누적 잔액
  function phaseScores(config, g, phase, seed, ev, plan, passengers, balance) {
    var fleet = plan.buses.filter(function (b) { return !b.leased; }).length;
    var served = plan.buses.some(function (b) { return b.route && b.route.nodes && b.route.nodes.length >= 2; });
    return { version: VERSION, phase: phase, mobility: mobility(config, phase, seed, ev, passengers), finance: finance(balance, reserve(config, g, fleet), served) };
  }

  // 게임 전체(또는 조기 종료까지): 이동 = 단계 합계의 완료/평가 수요(단계 퍼센트 평균이 아님), 재정 = 마지막 정산 잔액 / 마지막 단계 기준 예비비.
  // 끝난 뒤의 ‘다음 단계’ 비용은 쓰지 않는다. 점수 기록이 없는 단계(이전 저장본, 재계산 불가)는 missing으로 알린다
  function overall(history, totalPhases) {
    var scored = history.filter(function (h) { return h.scores && h.scores.version === VERSION; });
    var N = 0, done = 0, excluded = 0, outer = { N: 0, done: 0 }, essential = { N: 0, done: 0 }, zones = {}, reasons = {};
    scored.forEach(function (h) {
      var m = h.scores.mobility; N += m.N; done += m.done; excluded += m.excluded || 0;
      outer.N += m.outer.N; outer.done += m.outer.done; essential.N += m.essential.N; essential.done += m.essential.done;
      Object.keys(m.zones).forEach(function (id) { var z = zones[id] || (zones[id] = { N: 0, done: 0 }); z.N += m.zones[id].N; z.done += m.zones[id].done; });
      Object.keys(m.reasons).forEach(function (k) { reasons[k] = (reasons[k] || 0) + m.reasons[k]; });
    });
    if (scored.length) { outer.ids = scored[0].scores.mobility.outer.ids; essential.ids = scored[0].scores.mobility.essential.ids; }
    var worst = null;
    Object.keys(zones).forEach(function (id) { var z = zones[id]; if (z.N - z.done > 0 && (!worst || z.N - z.done > worst.missed)) worst = { id: id, N: z.N, done: z.done, missed: z.N - z.done }; });
    var last = scored[scored.length - 1], fin = null;
    if (last) {
      var served = scored.some(function (h) { return h.scores.finance.served; });
      fin = finance(last.scores.finance.balance, last.scores.finance.reserve, served);
    }
    var phases = history.map(function (h) { return h.phase; });
    return { version: VERSION, from: phases.length ? Math.min.apply(null, phases) : null, to: phases.length ? Math.max.apply(null, phases) : null, total: totalPhases,
      missing: history.filter(function (h) { return !h.scores || h.scores.version !== VERSION; }).map(function (h) { return h.phase; }),
      mobility: { N: N, done: done, score: pct(done, N), excluded: excluded, outer: outer, essential: essential, zones: zones, reasons: reasons, worst: worst }, finance: fin };
  }

  // 다음 행동 제안 — 기록에서 원인이 확인될 때만(근거 없는 ‘버스를 더 늘리세요’ 없음). routes = Metrics.routeReport 행
  function suggestions(config, m, routes) {
    var S = opts(config).suggest, out = [];
    var fullRoutes = (routes || []).filter(function (r) { return r.fulls >= S.fullMin; }).sort(function (a, b) { return b.fulls - a.fulls; });
    if (fullRoutes.length && m.reasons.full) out.push({ code: 'full', num: fullRoutes[0].num, fulls: fullRoutes[0].fulls, missed: m.reasons.full });
    if (m.noLinkPairs.length) out.push({ code: 'noLink', pair: m.noLinkPairs[0], missed: m.reasons.noLink });
    var running = (routes || []).filter(function (r) { return r.buses > 0; }), avg = running.length ? running.reduce(function (a, r) { return a + (r.perBus || 0); }, 0) / running.length : 0;
    var low = running.filter(function (r) { return r.buses >= 2 && r.fulls === 0 && r.perBus != null && r.perBus < avg * S.lowUseRatio; }).sort(function (a, b) { return a.perBus - b.perBus; });
    if (low.length) out.push({ code: 'lowUse', num: low[0].num, buses: low[0].buses, perBus: low[0].perBus, avg: Math.round(avg * 10) / 10 });
    return out;
  }

  var api = { VERSION: VERSION, referenceBusCost: referenceBusCost, reserve: reserve, units: units, mobility: mobility, finance: finance, phaseScores: phaseScores, overall: overall, suggestions: suggestions, opts: opts };
  root.PB = root.PB || {};
  root.PB.Scores = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
