/*
 * 버스 시각표 (PRD §5) — 정원과 무관하게 운행 전에 버스별로 전부 계산한다.
 * 지도 모드에서는 같은 노선의 버스가 자동 간격으로 자기 노선 첫 정류장에서 출발한다.
 * 도착하면 첫 정차를 처리하고 왕복을 계속한다. 정차 = 그 초에 승하차 후 1초 뒤 출발, 통과 = 머물지 않음,
 * 끝점 = 1초 정차 후 방향 전환. run = 끝점에서 끝점까지 한 방향 구간 번호.
 */
(function (root) {
  'use strict';
  var Graph = (typeof require === 'function' && typeof module !== 'undefined') ? require('./graph.js') : root.PB.Graph;

  function vehicle(config,id){return config.challengeApplied&&id===9?{speed:1,capacity:24}:config.challengeApplied&&id===7?{speed:1.5,capacity:18}:{speed:1,capacity:config.bus.capacity};}
  function travel(g,config,id,a,b){return Math.max(1,Math.round(g.time(a,b)/vehicle(config,id).speed));}
  function cycleMinutes(g,config,id,route){return Graph.cycleMinutes(Object.assign({},g,{time:function(a,b){return travel(g,config,id,a,b);}}),route);}
  function spacePlan(g, config, plan) {
    if (!config.bus.autoSpacing) return plan;
    var groups = {};
    plan.buses.forEach(function (b) {
      if (!b.route || Graph.validateRoute(g, b.route).length) return;
      var key = JSON.stringify(b.route);
      (groups[key] || (groups[key] = [])).push(b.id);
    });
    return {buses:plan.buses.map(function (b) {
      var ids = b.route && groups[JSON.stringify(b.route)];
      if (ids) ids.sort(function(a,b){return a-b;});
      var o = {id:b.id, route:b.route, offset:ids ? Math.round(Math.min(config.bus.window,Graph.cycleMinutes(g,b.route)) * ids.indexOf(b.id) / ids.length) : 0};
      if (b.leased) o.leased = true; // 임차 차량 표시는 정산(임차료 vs 보유비)까지 그대로 간다
      return o;
    })};
  }
  function timeline(g, config, busId, route, offset) {
    if (config.map && !config.bus.autoSpacing) offset = 0;
    var W = config.bus.window, dwell = config.bus.dwell;
    var tl = { busId: busId, route: route || null, routeId: route ? Graph.routeId(route) : null, offset: offset, visits: [], segments: [], opMinutes: 0, moveMinutes: 0, km: 0 };
    if (!route) return tl;
    // 관제·운영비 시간 = 운행에 배정된 하루 전체(05~23). 자동 간격으로 첫 출발이 늦어도 그 버스는 대기 근무 중이라 깎지 않는다
    // (예전엔 W − 출발 시각이라 긴 노선일수록 간격이 벌어져 운영비가 줄어드는 할인이 생겼다)
    tl.opMinutes = W;

    var t = offset;
    var dh = config.map ? { nodes: [route.nodes[0]] } : Graph.shortestPath(g, config.bus.depot, route.nodes[0]);
    for (var i = 1; i < dh.nodes.length && t < W; i++) {
      var m = travel(g,config,busId,dh.nodes[i - 1], dh.nodes[i]);
      tl.segments.push({ from: dh.nodes[i - 1], to: dh.nodes[i], t0: t, t1: t + m, deadhead: true });
      t += m;
    }

    // visits = 120초까지의 방문(승하차 처리). tail = 120초에 달리던 run이 끝점에 닿을 때까지의 이후 방문 —
    // 120초 전에 탄 사람이 그 버스로 목적지 쪽에 가는지 판단하는 데만 쓴다(PRD §7: 도착이 120초 뒤면 ‘탑승 중’)
    tl.tail = [];
    if (Graph.isLoop(route)) {
      tl.loop = true;
      var limit = W + Graph.cycleMinutes(g, route), index = 0, count = route.nodes.length - 1;
      while (t <= limit) {
        var visit = { t: t, node: route.nodes[index], kind: route.stops[index] ? 'stop' : 'pass', runIn: 0, runOut: 0 };
        (t <= W ? tl.visits : tl.tail).push(visit);
        if (visit.kind === 'stop') t += dwell;
        var ni = (index + 1) % count, duration = travel(g,config,busId,route.nodes[index], route.nodes[ni]);
        if (t < W) tl.segments.push({from: route.nodes[index], to: route.nodes[ni], t0: t, t1: t + duration, deadhead: false});
        t += duration; index = ni;
      }
      tl.moveMinutes = tl.segments.reduce(function (sum, seg) { return sum + Math.max(0, Math.min(seg.t1, W) - seg.t0); }, 0);
      tl.km = driven(g, tl.segments, W);
      return tl;
    }
    var n = route.nodes.length, run = 0, idx = 0, dir = 1, lastEnd = true;
    (t <= W ? tl.visits : tl.tail).push({ t: t, node: route.nodes[0], kind: 'stop', runIn: -1, runOut: 0 });
    t += dwell;
    while (!(t >= W && lastEnd)) {
      var next = idx + dir;
      var mm = travel(g,config,busId,route.nodes[idx], route.nodes[next]);
      if (t < W) tl.segments.push({ from: route.nodes[idx], to: route.nodes[next], t0: t, t1: t + mm, deadhead: false });
      t += mm;
      idx = next;
      var isEnd = idx === 0 || idx === n - 1, v;
      if (isEnd) v = { t: t, node: route.nodes[idx], kind: 'stop', runIn: run, runOut: run + 1 };
      else v = { t: t, node: route.nodes[idx], kind: route.stops[idx] ? 'stop' : 'pass', runIn: run, runOut: run };
      (t <= W ? tl.visits : tl.tail).push(v);
      if (isEnd) { run++; dir = -dir; }
      if (v.kind === 'stop') t += dwell;
      lastEnd = isEnd;
    }

    tl.moveMinutes = tl.segments.reduce(function (s, x) { return s + Math.max(0, Math.min(x.t1, W) - Math.max(x.t0, 0)); }, 0);
    tl.km = driven(g, tl.segments, W);
    return tl;
  }
  // 실제 주행거리(km) — 운행 종료(W) 전에 달린 만큼만. 구간 도중에 끝나면 달린 비율만, 정차·대기는 0, 공차 이동(deadhead)도 포함.
  // 속도가 빨라도 같은 구간이면 같은 거리(시간이 아니라 도로 거리로 센다)
  function driven(g, segments, W) {
    return segments.reduce(function (sum, x) {
      var d = g.dist ? g.dist(x.from, x.to) : null, span = x.t1 - x.t0;
      if (d == null || span <= 0) return sum;
      return sum + d * Math.max(0, Math.min(1, (Math.min(x.t1, W) - Math.max(x.t0, 0)) / span));
    }, 0);
  }

  // 렌더용 위치. 출차 전·미배정은 A에 주차
  function positionAt(tl, config, t) {
    var firstAssignment=(tl.assignments||[])[0];
    if ((!tl.route && (!firstAssignment || t < firstAssignment.depart)) || t < tl.offset) return { node: config.bus.depot, parked: true };
    for (var i = 0; i < tl.segments.length; i++) {
      var s = tl.segments[i];
      if (t >= s.t0 && t < s.t1) return { from: s.from, to: s.to, f: (t - s.t0) / (s.t1 - s.t0), parked: false };
    }
    var node = config.map && tl.route ? tl.route.nodes[0] : config.bus.depot;
    for (var j = 0; j < tl.segments.length; j++) if (tl.segments[j].t1 <= t) node = tl.segments[j].to;
    return { node: node, parked: false };
  }

  var api = { driven:driven, travel:travel,cycleMinutes:cycleMinutes,vehicle:vehicle,timeline: timeline, positionAt: positionAt, spacePlan: spacePlan };
  root.PB = root.PB || {};
  root.PB.Schedule = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
