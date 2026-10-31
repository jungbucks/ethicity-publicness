/*
 * 모의 AI (PRD §8) — 외부 API 없는 규칙 기반 추천. 최적해를 보장하지 않는다.
 * 입력은 RevealedPhase(공개된 기본 수요·현재 도로·보유 차량·이전 결과)뿐이다.
 * 사건 실현값·seed·미래 단계 정보는 받지 않는다(makeRevealed가 키를 걸러 낸다).
 *
 * 탐색: 후보 노선 최대 30개 → 버스 한 대의 노선 또는 미배정을 바꾼 이웃 계획을 전부 평가,
 * 목표 점수가 가장 좋아지는 하나를 채택. 개선이 없거나 3회면 멈춘다.
 */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var Graph = NODE ? require('./graph.js') : root.PB.Graph;
  var Sim = NODE ? require('./sim.js') : root.PB.Sim;
  var Metrics = NODE ? require('./metrics.js') : root.PB.Metrics;
  var Schedule = NODE ? require('./schedule.js') : root.PB.Schedule;

  var Evaluation = NODE ? require('./resident-evaluation.js') : root.PB.ResidentEvaluation;

  var KEYS = ['phase', 'g', 'requests', 'owned', 'fourthAllowed', 'fourthMustBeNew', 'prevMetrics', 'prevRouteIds', 'plan', 'config'];

  function makeRevealed(src) {
    var out = {};
    KEYS.forEach(function (k) { out[k] = src[k]; });
    out.requests = src.requests.filter(function (q) { return q.kind === 'base'; });
    return out;
  }

  function targets(rev) {
    var cfg = rev.config;
    if (!rev.prevMetrics) return cfg.reachInitial.slice();
    var zones = rev.prevMetrics.zones;
    var ranked = Object.keys(zones).filter(function (id) { return zones[id].N > 0 && id !== cfg.newZone; })
      .sort(function (a, b) { return zones[a].rate - zones[b].rate || (a < b ? -1 : 1); });
    if (rev.phase === cfg.newTownPhase && rev.g.has(cfg.newZone)) return [cfg.newZone, ranked[0]];
    if (rev.g.has(cfg.newZone) && zones[cfg.newZone] && zones[cfg.newZone].N > 0) {
      ranked = Object.keys(zones).filter(function (id) { return zones[id].N > 0; })
        .sort(function (a, b) { return zones[a].rate - zones[b].rate || (a < b ? -1 : 1); });
    }
    return ranked.slice(0, 2);
  }

  function allStop(nodes) { return { nodes: nodes, stops: nodes.map(function () { return true; }) }; }
  function validRoute(g, r) { return r && Graph.validateRoute(g, r).length === 0; }

  function candidates(rev, goal) {
    var g = rev.g, max = rev.config.ai.maxCandidates, seen = {}, must = [], fill = [];
    function add(list, r) {
      if (!validRoute(g, r)) return;
      var id = Graph.routeId(r);
      if (seen[id]) return;
      seen[id] = true;
      list.push(r);
    }
    var current = rev.plan.buses.map(function (b) { return b.route; }).filter(function (r) { return validRoute(g, r); });
    current.forEach(function (r) { add(must, r); });
    rev.config.exampleRoutes.forEach(function (r) { add(must, r); });
    if(rev.config.challengeApplied&&g.has('N'))g.nodes.filter(function(id){return id!=='N';}).forEach(function(id){add(must,allStop([id,'N']));});
    var required = must.slice();
    must = [];
    current.forEach(function (r) {
      [0, r.nodes.length - 1].forEach(function (end) {
        Graph.neighbors(g, r.nodes[end]).forEach(function (nb) {
          if (r.nodes.indexOf(nb) >= 0) return;
          add(must, end === 0 ? { nodes: [nb].concat(r.nodes), stops: [true].concat(r.stops) } : { nodes: r.nodes.concat(nb), stops: r.stops.concat(true) });
        });
      });
      if (!Graph.isLoop(r) && r.nodes.length >= 3) add(must, allStop(r.nodes.concat(r.nodes[0])));
    });
    var pairs = {};
    rev.requests.forEach(function (q) {
      var k = q.o < q.d ? q.o + q.d : q.d + q.o;
      pairs[k] = (pairs[k] || 0) + 1;
    });
    var tg = goal === 'reach' ? targets(rev) : [];
    Object.keys(pairs).sort(function (a, b) {
      var ta = tg.indexOf(a[0]) >= 0 || tg.indexOf(a[1]) >= 0, tb = tg.indexOf(b[0]) >= 0 || tg.indexOf(b[1]) >= 0;
      if (ta !== tb) return ta ? -1 : 1;
      return pairs[b] - pairs[a] || (a < b ? -1 : 1);
    }).forEach(function (k) {
      var p = Graph.shortestPath(g, k[0], k[1]);
      if (p) add(fill, allStop(p.nodes));
    });
    var byId = function (a, b) { var x = Graph.routeId(a), y = Graph.routeId(b); return x < y ? -1 : x > y ? 1 : 0; };
    return required.concat(fill.sort(byId),must.sort(byId)).slice(0, max);
  }

  // 사전식 비교 점수(클수록 좋음)
  function score(goal, metrics, sim, tg) {
    if (goal === 'profit') return [metrics.costs.total, metrics.arrived];
    if (goal === 'time') {
      var cost = 0, arrived = 0;
      sim.passengers.forEach(function (p) {
        if (p.status === 'arrived') { cost += p.arriveT - p.t; arrived++; } else cost += 120;
        // A resident's planned return remains an unmet need even if outbound failure
        // prevents it from spawning. Otherwise removing service improves this score.
        if(p.returnTrip&&!sim.passengers.some(function(q){return q.residentId===p.residentId&&q.leg==='return';}))cost+=120;
      });
      return [-cost, arrived];
    }
    var rates = tg.map(function (z) { return metrics.zones[z]; }).filter(function (z) { return z && z.N > 0; }).map(function (z) { return z.rate; });
    var mean = rates.length ? rates.reduce(function (s, x) { return s + x; }, 0) / rates.length : 0;
    return [mean, metrics.arrived];
  }
  function compare(a, b) {
    for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
    return 0;
  }

  function sanitize(rev, plan) {
    return { buses: plan.buses.map(function (b) { return { id: b.id, route: validRoute(rev.g, b.route) && (!rev.config.challengeApplied || (b.id===9 ? b.route.nodes.length===2&&b.route.nodes.indexOf('N')>=0 : b.route.nodes.indexOf('N')<0&&(b.id!==7||new Set(b.route.nodes).size<=3))) ? b.route : null, offset: rev.config.map ? 0 : b.offset }; }) };
  }
  function samePlan(a, b) {
    return a.buses.every(function (x, i) {
      var y = b.buses[i];
      return x.offset === y.offset && (x.route ? Graph.routeId(x.route) : null) === (y.route ? Graph.routeId(y.route) : null);
    });
  }

  // 단계별로 끊어 실행할 수 있는 탐색. step(n)은 최대 n회 평가하고 끝났으면 true
  function createSearch(rev, goal) {
    var tg = targets(rev), cands = candidates(rev, goal), offsets = rev.config.bus.offsets;
    var evaluated = 0;
    var prevIds = rev.prevRouteIds || [];
    // 4호차(마지막 버스)가 직전 단계·다른 버스와 다른 새 노선에 배정됐는지
    function fourthOk(p) {
      var b4 = p.buses[p.buses.length - 1];
      if (!b4.route) return false;
      var id = Graph.routeId(b4.route);
      if (prevIds.indexOf(id) >= 0) return false;
      return p.buses.slice(0, -1).every(function (b) { return !b.route || Graph.routeId(b.route) !== id; });
    }
    var mustNew = !!rev.fourthMustBeNew;
    function evaluate(plan) {
      plan = Schedule.spacePlan(rev.g, rev.config, plan);
      evaluated++;
      var sim = Sim.run({ g: rev.g, config: rev.config, phase: rev.phase, plan: plan, requests: rev.requests });
      var m = Metrics.summarize(sim, rev.g, plan, rev.config);
      var sc = mustNew && !fourthOk(plan) ? [-Infinity, -Infinity] : score(goal, m, sim, tg);
      return { plan: plan, sim: sim, metrics: m, score: sc };
    }
    function neighbors(cur, allow) {
      var out = [];
      cur.plan.buses.forEach(function (b, bi) {
        cands.concat([null]).forEach(function (r) {
          if(rev.config.challengeApplied&&r){if(b.id===9&&(r.nodes.length!==2||r.nodes.indexOf('N')<0))return;if(b.id!==9&&r.nodes.indexOf('N')>=0)return;if(b.id===7&&new Set(r.nodes).size>3)return;}
          offsets.forEach(function (off) {
            var buses = cur.plan.buses.map(function (x, xi) { return xi === bi ? { id: x.id, route: r, offset: off } : x; });
            var p = { buses: buses };
            if (rev.config.progression && new Set(buses.filter(function(b){return b.route;}).map(function(b){return JSON.stringify(b.route);})).size > rev.config.progression.routes[rev.phase - 1]) return;
            if(rev.config.challengeApplied&&new Set(buses.filter(function(b){return b.id!==9&&b.route;}).map(function(b){return JSON.stringify(b.route);})).size>5)return;
            // 5번 직행은 7호차만(2026-10-27): 일반 버스는 7호차 노선을 같이 달리지 않고, 일반 노선은 1~4번 4개까지
            if(rev.config.challengeApplied){var r7=buses.filter(function(b){return b.id===7&&b.route;})[0],reg=buses.filter(function(b){return b.id!==7&&b.id!==9&&b.route;});
              if(r7&&reg.some(function(b){return JSON.stringify(b.route)===JSON.stringify(r7.route);}))return;
              if(new Set(reg.map(function(b){return JSON.stringify(b.route);})).size>4)return;}
            if (rev.config.challengeApplied && new Set(buses.filter(function(b){return b.route&&new Set(b.route.nodes).size>3;}).map(function(b){return JSON.stringify(b.route);})).size>4) return;
            if (samePlan(p, cur.plan) || (allow && !allow(p))) return;
            out.push(p);
          });
        });
      });
      return out;
    }
    var phases = [];   // [{start, maxIter, allow, firstOnlyBus}]
    var base = evaluate(sanitize(rev, rev.plan));
    var state = { cur: base, iter: 0, queue: null, best: null, stage: 0, three: null };
    var fourthOn = rev.fourthAllowed && rev.owned === 3;
    var maxIter = rev.config.ai.maxIterations;

    function nextQueue() {
      if (state.stage === 0) return state.iter < maxIter ? neighbors(state.cur, mustNew ? fourthOk : null) : null;
      // 4호차: 추천된 3대 계획은 그대로 두고 버스 4의 새 노선만 한 번 비교
      if (state.iter === 0) return neighbors(state.cur, fourthOk).filter(function (p) {
        return p.buses.slice(0, -1).every(function (b, i) { return b === state.cur.plan.buses[i]; });
      });
      return null;
    }

    function step(n) {
      while (n > 0) {
        if (!state.queue) {
          state.queue = nextQueue();
          state.best = null;
          if (!state.queue) {
            if (state.stage === 0 && fourthOn) {
              state.three = state.cur;
              state.stage = 1; state.iter = 0;
              var start = { buses: state.cur.plan.buses.concat([{ id: 4, route: null, offset: 0 }]) };
              state.cur = { plan: start, sim: null, metrics: null, score: [-Infinity, -Infinity] };
              continue;
            }
            if (state.stage === 0) state.three = state.cur;
            return true;
          }
        }
        if (state.queue.length) {
          var e = evaluate(state.queue.shift());
          n--;
          if (!state.best || compare(e.score, state.best.score) > 0) state.best = e;
          continue;
        }
        // 한 바퀴 끝: 엄격히 좋아졌으면 채택
        var improved = state.best && compare(state.best.score, state.cur.score) > 0;
        state.queue = null;
        if (improved) { state.cur = state.best; state.iter++; }
        else state.iter = maxIter;
      }
      return false;
    }

    function result() {
      var three = state.three || state.cur;
      // Only surfaced candidates need resident prose; scoring uses the numeric metrics.
      three.metrics.residents = Evaluation.records(rev.config, rev.phase, three.sim);
      base.metrics.residents = Evaluation.records(rev.config, rev.phase, base.sim);
      var changes = [];
      three.plan.buses.forEach(function (b, i) {
        var old = base.plan.buses[i];
        var rid = function (x) { return x.route ? Graph.routeId(x.route) : null; };
        if (rid(b) !== rid(old) || b.offset !== old.offset) changes.push({ busId: b.id, before: { routeId: rid(old), offset: old.offset }, after: { routeId: rid(b), offset: b.offset } });
      });
      var fourth = null;
      if (state.stage === 1 && state.cur.metrics && fourthOk(state.cur.plan)) fourth = { plan: state.cur.plan, expected: state.cur.metrics };
      return { goal: goal, targets: tg, plan: three.plan, expected: three.metrics, baseline: base.metrics, changes: changes,
        fourth: fourth, evaluated: evaluated, candidates: cands.length, _sim: three.sim, _baseSim: base.sim };
    }

    return { step: step, result: result, estimate: function () { return (cands.length + 1) * offsets.length * rev.plan.buses.length; }, evaluated: function () { return evaluated; } };
  }

  function recommendSync(rev, goal) {
    var s = createSearch(rev, goal);
    while (!s.step(1e9));
    return s.result();
  }

  function recommend(rev, goal, onProgress) {
    var s = createSearch(rev, goal);
    return new Promise(function (resolve) {
      (function tick() {
        var done = s.step(20);
        if (onProgress) onProgress(s.evaluated(), s.estimate());
        if (done) resolve(s.result()); else setTimeout(tick, 0);
      })();
    });
  }

  var api = { makeRevealed: makeRevealed, targets: targets, candidates: candidates, score: score, compare: compare, recommendSync: recommendSync, recommend: recommend };
  root.PB = root.PB || {};
  root.PB.Advisor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
