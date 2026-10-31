/*
 * 지표·불만·신뢰·결말 소제목 (PRD §9·§10).
 * 모든 비율의 분모는 현재 단계의 실제 이동 요청 수 N(승객 한 명의 한 번 이동 = 1건). 분모가 0이면 null(화면에서 ‘요청 없음’).
 * N = 예정 이동(planned) + 목적지 도착 뒤 생긴 다음 이동(followUps) + 돌발 수요(extra) — requestBreakdown.
 * 대기: maxWait = 버스를 탄 사람이 정류장에서 기다린 최장 시간(환승 대기 포함). 노선이 없어 떠나지 못한 요청(noLink)과
 * 운행 종료까지 버스를 타지 못한 요청(notBoarded, 경과 시간 따로)은 maxWait에 넣지 않는다.
 * 불만 D와 신뢰는 게임 반응 속도를 위한 설명용 지수이며 실제 주민 심리 척도가 아니다.
 */
(function (root) {
  'use strict';
  var Sim = (typeof require === 'function' && typeof module !== 'undefined') ? require('./sim.js') : root.PB.Sim;
  var Schedule = (typeof require === 'function' && typeof module !== 'undefined') ? require('./schedule.js') : root.PB.Schedule;

  function r1(x) { return Math.round(x * 10) / 10; }
  function ratio(a, n) { return n ? a / n : null; }
  function avg(list) { return list.length ? list.reduce(function (s, x) { return s + x; }, 0) / list.length : null; }

  function discontent(z, config) {
    if (!z.N) return null;
    var w = config.discontent.w;
    return r1(100 * (w[0] * (z.N - z.arrived) / z.N + w[1] * z.waitOver / z.N + w[2] * z.tripOver / z.N));
  }

  function nextTrust(prev, D, config) {
    if (D == null) return prev;
    var k = config.trust.keep;
    return r1(k * prev + (1 - k) * (100 - D));
  }

  function boardedWait(list) { return list.filter(function (p) { return p.firstBoardT != null; }).reduce(function (m, p) { return Math.max(m, p.waitTotal); }, 0); }
  function notBoarded(list, W) { var l = list.filter(function (p) { return p.firstBoardT == null && p.fail !== 'NO_LINK'; }); return { count: l.length, longest: l.reduce(function (m, p) { return Math.max(m, W - p.t); }, 0) }; }
  function requestBreakdown(ps) {
    var b = { planned: 0, followUps: 0, extra: 0 };
    ps.forEach(function (p) { if (p.kind === 'extra') b.extra++; else if (p.leg === 'return') b.followUps++; else b.planned++; });
    return b;
  }
  function summarize(result, g, plan, config) {
    var W = config.bus.window, ps = result.passengers;
    var count = function (list, s) { return list.filter(function (p) { return p.status === s; }).length; };
    var zones = {};
    g.nodes.forEach(function (id) {
      var mine = ps.filter(function (p) { return p.o === id; });
      var z = {
        N: mine.length,
        arrived: count(mine, 'arrived'), waiting: count(mine, 'waiting'), transfer: count(mine, 'transfer'), riding: count(mine, 'riding'),
        maxWait: boardedWait(mine), noLink: mine.filter(function (p) { return p.fail === 'NO_LINK'; }).length, notBoarded: notBoarded(mine, W).count,
        waitOver: mine.filter(function (p) { return p.waitTotal > config.discontent.waitOver; }).length,
        tripOver: mine.filter(function (p) { return (p.arriveT != null ? p.arriveT : W) - p.t > config.discontent.tripOver; }).length
      };
      z.rate = ratio(z.arrived, z.N);
      z.D = discontent(z, config);
      zones[id] = z;
    });
    var done = ps.filter(function (p) { return p.status === 'arrived'; });
    var open = ps.filter(function (p) { return p.status !== 'arrived'; });
    var ess = ps.filter(function (p) { return config.essential.indexOf(p.d) >= 0; });
    var linkMemo = {};
    var linked = ess.filter(function (p) {
      var k = p.o + p.d;
      if (!(k in linkMemo)) linkMemo[k] = Sim.structural(g, plan, p.o, p.d);
      return linkMemo[k];
    });
    return {
      N: ps.length,
      users: ps.filter(function (p) { return p.firstBoardT != null; }).length,
      boardings: ps.reduce(function (s, p) { return s + p.boardings; }, 0),
      arrived: done.length, waiting: count(ps, 'waiting'), transfer: count(ps, 'transfer'), riding: count(ps, 'riding'),
      arrivalRate: ratio(done.length, ps.length),
      maxWait: boardedWait(ps), noLink: ps.filter(function (p) { return p.fail === 'NO_LINK'; }).length, notBoarded: notBoarded(ps, W), requests: requestBreakdown(ps),
      travel: {
        doneAvg: avg(done.map(function (p) { return p.arriveT - p.t; })),
        openAvg: avg(open.map(function (p) { return W - p.t; }))
      },
      essential: {
        N: ess.length,
        linkRate: ratio(linked.length, ess.length),
        arriveRate: ratio(ess.filter(function (p) { return p.status === 'arrived'; }).length, ess.length)
      },
      zones: zones,
      families: familyReport(result),
      costs: result.costs
    };
  }

  // 생활권 결말 소제목. 관측 단계 = 요청이 있던 단계
  function subtitle(zoneHistory, config) {
    var E = config.ending, obs = zoneHistory.filter(function (h) { return h.N > 0; });
    var out = { kind: 'remaining', rates: obs.map(function (h) { return h.rate; }), first: null, last: null, firstPhase: null, lastPhase: null };
    if (!obs.length) return out;
    var first = obs[0], last = obs[obs.length - 1];
    out.first = first.rate; out.last = last.rate; out.firstPhase = first.phase; out.lastPhase = last.phase;
    if (obs.length < 2) return out;
    var tail = obs.slice(-2);
    var stable = tail.every(function (h) { return h.rate >= E.stableRate && h.maxWait <= E.stableMaxWait; });
    if (stable) out.kind = 'stable';
    else if (last.rate - first.rate >= E.improvePts - 1e-9) out.kind = 'improving';
    return out;
  }

  function fmtRate(r) { return r == null ? '요청 없음' : Math.round(r * 100) + '%'; }
  function familyReport(result){
    var groups={};result.passengers.forEach(function(p){if(p.familyId)(groups[p.familyId]||(groups[p.familyId]=[])).push(p);});
    var ids=Object.keys(groups),complete=ids.filter(function(id){var ps=groups[id],n=ps[0].familySize;return ps.filter(function(p){return p.leg==='outbound'&&p.status==='arrived';}).length===n&&ps.filter(function(p){return p.leg==='return'&&p.status==='arrived';}).length===n;}).length;
    return {total:ids.length,complete:complete};
  }
  function routeReport(result,routes,buses){
    var byNum={},byBus={},used={},changes={};
    var rows=routes.map(function(route){var row={num:route.num,buses:0,boardings:0,arrived:0,fulls:0,perBus:null};byNum[route.num]=row;return row;});
    function mark(row,id){if(!row)return;var set=used[row.num]||(used[row.num]={});set[id]=true;row.buses=Object.keys(set).length;}
    buses.forEach(function(b){var row=byNum[b.routeNum];if(row){mark(row,b.id);byBus[b.id]=row;}});
    (result.timelines||[]).forEach(function(tl){changes[tl.busId]=(tl.assignments||[]).map(function(a){var match=routes.filter(function(r){return r.nodes.join('|')===a.route.nodes.join('|')&&r.stops.join('|')===a.route.stops.join('|');})[0];var row=match&&byNum[match.num];mark(row,tl.busId);return {t:a.t,row:row};});});
    result.log.forEach(function(e){var row=byBus[e.bus];(changes[e.bus]||[]).forEach(function(a){if(e.t>=a.t)row=a.row;});if(!row)return;if(e.type==='board')row.boardings++;if(e.type==='arrive')row.arrived++;if(e.type==='full')row.fulls++;});
    rows.forEach(function(row){row.perBus=row.buses?r1(row.boardings/row.buses):null;});return rows;
  }

  /* 노선별 재정(2026-10-27). 운임은 그 이동의 ‘첫 탑승’ 노선에 1번만(환승해도 나눠 세지 않는다 — 요금도 첫 탑승 때 1번 받으므로).
   * 운영비·연료비는 그 시각에 버스가 달리던 노선에(긴급 조정으로 옮긴 뒤의 공차 이동은 새 노선 몫). 보유비·임차료·지원금은 노선에 나누지 않는 공동 항목.
   * 맞춤: Σ노선 운임 = 전체 운임, Σ노선 운영비 = 전체 운영비, Σ노선 연료비 = 전체 연료비(반올림 차이는 가장 큰 노선에) →
   *       Σ노선 손익 + 지원금 − 보유비 − 임차료 = 회차 수지. arrived = 이 노선에서 첫 탑승해 목적지에 도착한 이동 요청 */
  function routeEconomy(result, routes, buses, config, g) {
    var F = config.finance, W = config.bus.window, k = result.costs, rows = {}, order = [];
    function rowFor(route) {
      if (!route) return null;
      var hit = routes.filter(function (r) { return r.nodes.join('|') === route.nodes.join('|') && r.stops.join('|') === route.stops.join('|'); })[0], key = hit ? hit.num : 'etc';
      if (!rows[key]) { rows[key] = { num: hit ? hit.num : null, buses: {}, km: 0, op: 0, fuelRaw: 0, fare: 0, riders: 0, arrived: 0, service: {} }; order.push(key); }
      return rows[key];
    }
    routes.forEach(function (r) { rowFor(r); });
    var periods = {}, start = {};
    (result.timelines || []).forEach(function (tl) {
      var list = [], first = buses.filter(function (b) { return b.id === tl.busId; })[0];
      if (tl.route) list.push({ t: 0, row: rowFor(tl.route) });
      (tl.assignments || []).forEach(function (a) { list.push({ t: a.depart, row: rowFor(a.route) }); });
      periods[tl.busId] = list;
      function at(t) { var row = null; list.forEach(function (p) { if (t >= p.t) row = p.row; }); return row; }
      list.forEach(function (p, i) {
        var end = i + 1 < list.length ? list[i + 1].t : W;
        p.row.op += F.opPerMin * Math.max(0, Math.min(end, W) - p.t); p.row.buses[tl.busId] = true;
      });
      tl.segments.forEach(function (x) { var row = at(x.t0); if (row) row.km += Schedule.driven(g, [x], W); });
      tl.visits.forEach(function (v) { var row = at(v.t); if (row && v.kind === 'stop' && v.t <= W) row.service[v.node] = (row.service[v.node] || 0) + 1; });
      start[tl.busId] = at;
    });
    var firstBoard = {};
    result.log.forEach(function (e) { if (e.type === 'board' && !(e.pid in firstBoard)) firstBoard[e.pid] = e; });
    result.passengers.forEach(function (p) {
      var e = firstBoard[p.id]; if (!e || p.firstBoardT == null) return;
      var row = start[e.bus] && start[e.bus](e.t); if (!row) return;
      row.fare += F.fare; row.riders++; if (p.status === 'arrived') row.arrived++;
    });
    var out = order.map(function (key) { var r = rows[key]; r.buses = Object.keys(r.buses).length; r.fuelRaw = F.fuelPerKm * r.km; r.fuel = Math.round(r.fuelRaw); r.km = Math.round(r.km * 10) / 10; return r; });
    // 반올림 차이를 가장 많이 달린 노선에 맞춰 전체 연료비와 정확히 같게
    var diff = (k.fuel || 0) - out.reduce(function (a, r) { return a + r.fuel; }, 0);
    if (diff && out.length) out.slice().sort(function (a, b) { return b.fuelRaw - a.fuelRaw; })[0].fuel += diff;
    out.forEach(function (r) { r.cost = r.op + r.fuel; r.profit = r.fare - r.cost; delete r.fuelRaw;
      r.service = (k.service || []).filter(function (c) { return r.service[c.id]; }).map(function (c) { return { id: c.id, label: c.label, stops: r.service[c.id] }; }); });
    return { rows: out.filter(function (r) { return r.num != null || r.fare || r.cost; }), common: { subsidyBase: k.subsidyBase || 0, subsidyService: k.subsidyService || 0, holding: k.holding || 0, lease: k.lease || 0 } };
  }

  // 정산 항목을 한 모양으로(예전 저장본: 지원금 하나·이동 시간 기준 ‘move’ → legacy 표시). 화면·종료 분석이 이것만 쓴다
  function costParts(k) {
    k = k || {};
    var legacy = k.subsidyBase == null;
    return { legacy: legacy, subsidyBase: legacy ? (k.subsidy || 0) : k.subsidyBase, subsidyService: legacy ? 0 : k.subsidyService, service: k.service || [],
      subsidy: k.subsidy || 0, fare: k.fare || 0, holding: k.holding || 0, lease: k.lease || 0, leased: k.leased || 0, op: k.op || 0,
      fuel: legacy ? (k.move || 0) : k.fuel, km: k.km == null ? null : k.km, total: k.total || 0 };
  }

  var api = { costParts: costParts, routeEconomy: routeEconomy, requestBreakdown:requestBreakdown, familyReport:familyReport,routeReport:routeReport, summarize: summarize, discontent: discontent, nextTrust: nextTrust, subtitle: subtitle, fmtRate: fmtRate };
  root.PB = root.PB || {};
  root.PB.Metrics = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
