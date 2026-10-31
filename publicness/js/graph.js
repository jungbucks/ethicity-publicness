/*
 * 도로 그래프와 노선 규칙 (PRD §4) — 화면을 모르는 순수 함수.
 * Route = { nodes: ['B','A','G','E'], stops: [true,true,false,true] } (양 끝은 항상 정차)
 */
(function (root) {
  'use strict';

  function build(config, phase) {
    var nodes = config.nodes.filter(function (n) { return n.fromPhase <= phase; }).map(function (n) { return n.id; }).sort();
    var adj = {};
    nodes.forEach(function (id) { adj[id] = []; });
    var roads = config.roads;
    if (config.map) {
      roads = [];
      var points = config.nodes.filter(function (n) { return n.fromPhase <= phase; });
      points.forEach(function (a, i) { points.slice(i + 1).forEach(function (b) {
        // km = 실제 주행거리(지도 좌표 1 = 게임 거리 1km, 화면 확대·카메라와 무관). min = 그 거리를 달리는 시간(정수 초)
        var km = Math.hypot(a.x - b.x, a.y - b.y);
        roads.push({ a: a.id, b: b.id, fromPhase: 1, km: km, min: Math.max(1, Math.round(km * config.map.pixelsPerUnit / config.map.pixelsPerSecond)) });
      }); });
    }
    roads.forEach(function (r) {
      if (r.fromPhase > phase || !adj[r.a] || !adj[r.b]) return;
      var km = r.km != null ? r.km : r.min; // 예전 고정 도로표는 거리 = 시간으로 본다
      adj[r.a].push({ to: r.b, min: r.min, km: km });
      adj[r.b].push({ to: r.a, min: r.min, km: km });
    });
    Object.keys(adj).forEach(function (id) { adj[id].sort(function (p, q) { return p.to < q.to ? -1 : 1; }); });
    return {
      phase: phase, dwell: config.bus ? config.bus.dwell : 1,
      nodes: nodes,
      adj: adj,
      has: function (id) { return !!adj[id]; },
      time: function (a, b) {
        if (!adj[a]) return null;
        for (var i = 0; i < adj[a].length; i++) if (adj[a][i].to === b) return adj[a][i].min;
        return null;
      },
      dist: function (a, b) {
        if (!adj[a]) return null;
        for (var i = 0; i < adj[a].length; i++) if (adj[a][i].to === b) return adj[a][i].km;
        return null;
      }
    };
  }

  function neighbors(g, id) {
    return (g.adj[id] || []).map(function (e) { return e.to; });
  }

  function validateRoute(g, route) {
    var errs = [];
    var n = route && route.nodes, s = route && route.stops;
    if (!n || !s || n.length !== s.length) return ['노선 정보가 올바르지 않아요.'];
    if (n.length < 2) errs.push('노선에는 정류장이 두 곳 이상 있어야 해요.');
    var seen = {};
    for (var i = 0; i < n.length; i++) {
      if (!g.has(n[i])) { errs.push('지금 지도에 없는 정류장이 들어 있어요.'); break; }
      if (seen[n[i]] && !(i === n.length - 1 && n[i] === n[0] && n.length >= 4)) { errs.push('같은 정류장은 순환 노선의 마지막에서만 다시 연결할 수 있어요.'); break; }
      seen[n[i]] = true;
      if (i > 0 && g.time(n[i - 1], n[i]) == null) { errs.push('도로로 바로 이어지지 않은 정류장이 있어요.'); break; }
    }
    if (n.length >= 2 && (!s[0] || !s[n.length - 1])) errs.push('노선의 양 끝 정류장은 반드시 정차해야 해요.');
    return errs;
  }

  function idString(nodes, stops) {
    return nodes.map(function (id, i) { return stops[i] ? id : id.toLowerCase(); }).join('-');
  }
  function routeId(route) {
    if (isLoop(route)) {
      var ns = route.nodes.slice(0, -1), ss = route.stops.slice(0, -1), ids = [];
      for (var i = 0; i < ns.length; i++) ids.push(idString(ns.slice(i).concat(ns.slice(0, i)), ss.slice(i).concat(ss.slice(0, i))));
      return 'loop:' + ids.sort()[0];
    }
    var fwd = idString(route.nodes, route.stops);
    var rev = idString(route.nodes.slice().reverse(), route.stops.slice().reverse());
    return fwd.toUpperCase() < rev.toUpperCase() || (fwd.toUpperCase() === rev.toUpperCase() && fwd <= rev) ? fwd : rev;
  }

  function oneWayMinutes(g, route) {
    var sum = 0;
    for (var i = 1; i < route.nodes.length; i++) sum += g.time(route.nodes[i - 1], route.nodes[i]);
    return sum;
  }

  // 편도 도로 합×2 + 끝점 정차 2초 + 내부 정차 지점 수×2초
  function cycleMinutes(g, route) {
    var dwell = g.dwell == null ? 1 : g.dwell;
    if (isLoop(route)) return oneWayMinutes(g, route) + route.stops.slice(0, -1).filter(Boolean).length * dwell;
    var inner = 0;
    for (var i = 1; i < route.nodes.length - 1; i++) if (route.stops[i]) inner++;
    return oneWayMinutes(g, route) * 2 + (2 + inner * 2) * dwell;
  }

  // 노선 한 바퀴 거리(km): 왕복은 편도×2, 순환은 한 바퀴
  function routeKm(g, route) {
    var sum = 0;
    for (var i = 1; i < route.nodes.length; i++) sum += g.dist(route.nodes[i - 1], route.nodes[i]) || 0;
    return isLoop(route) ? sum : sum * 2;
  }

  function isLoop(route) { return !!route && route.nodes.length >= 4 && route.nodes[0] === route.nodes[route.nodes.length - 1]; }

  function lessPath(p, q) {
    for (var i = 0; i < Math.min(p.length, q.length); i++) if (p[i] !== q[i]) return p[i] < q[i];
    return p.length < q.length;
  }

  // 최단 시간 경로. 동률이면 노드 열을 사전순으로 비교해 앞선 것
  function shortestPath(g, from, to) {
    var best = {};
    best[from] = { minutes: 0, nodes: [from] };
    var done = {};
    for (;;) {
      var cur = null;
      Object.keys(best).forEach(function (id) {
        if (done[id]) return;
        if (!cur || best[id].minutes < best[cur].minutes || (best[id].minutes === best[cur].minutes && lessPath(best[id].nodes, best[cur].nodes))) cur = id;
      });
      if (!cur) return null;
      if (cur === to) return { nodes: best[cur].nodes, minutes: best[cur].minutes };
      done[cur] = true;
      g.adj[cur].forEach(function (e) {
        if (done[e.to]) return;
        var cand = { minutes: best[cur].minutes + e.min, nodes: best[cur].nodes.concat(e.to) };
        var old = best[e.to];
        if (!old || cand.minutes < old.minutes || (cand.minutes === old.minutes && lessPath(cand.nodes, old.nodes))) best[e.to] = cand;
      });
    }
  }

  var api = {
    build: build,
    isLoop: isLoop,
    neighbors: neighbors,
    validateRoute: validateRoute,
    routeId: routeId,
    oneWayMinutes: oneWayMinutes,
    cycleMinutes: cycleMinutes, routeKm: routeKm,
    shortestPath: shortestPath
  };
  root.PB = root.PB || {};
  root.PB.Graph = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
