/*
 * 승객 엔진 (PRD §7·§9) — 결정적 순수 함수.
 * 같은 계획·요청이면 재생 속도와 무관하게 승객별로 같은 결과를 낸다.
 *
 * 한 초(t) 안의 처리 순서:
 *   ① 요청 생성(여정 1회 탐색) → 사건 기록·청원 판정
 *   ② 환승 준비 완료(하차 1초 뒤) → 대기열
 *   ③ 버스 ID순 도착 처리: 하차(목적지 도착 / 환승지 하차) → 빈 좌석에 대기열 순서대로 승차(120초엔 승차 없음)
 * 여정은 정원을 무시한 최단 도착(직행 또는 다른 노선으로 1회 환승)으로 정하고 구간(노선·승하차 정류장)을 고정한다.
 * 만차·연결을 놓치면 같은 구간의 다음 버스를 기다린다(재탐색 없음).
 */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var Graph = NODE ? require('./graph.js') : root.PB.Graph;
  var Schedule = NODE ? require('./schedule.js') : root.PB.Schedule;

  function operatingRoutes(plan) {
    var seen = {}, out = [];
    plan.buses.forEach(function (b) {
      if (!b.route) return;
      var id = Graph.routeId(b.route);
      if (!seen[id]) { seen[id] = true; out.push({ id: id, route: b.route }); }
    });
    return out.sort(function (a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0; });
  }

  function stopSet(route) {
    var s = {};
    route.nodes.forEach(function (n, i) { if (route.stops[i]) s[n] = true; });
    return s;
  }

  // 운행 노선으로 최대 1회 환승해 구조적으로 이어지는지(정차 지점만, 시간·정원 무시)
  /* 단계 정산(게임용 가상 수치, 실제 교통 원가 아님)
   * 수입: 기본 지원(기본 제공 차량 1대당) + 공공서비스 수행분(사전 공개 조건마다 따로) + 운임(요청당 첫 탑승 1번, 환승 무료)
   * 비용: 차량 보유비(기본 제공 차량, 쉬어도 듦) + 임차료(이번 단계 추가 임차 차량 — 보유비 대신) + 관제·운영비(운행 배정 차량의 하루 근무)
   *       + 연료·정비비(실제 주행거리 km × 단가 — 속도와 무관, 공차 이동 포함, 종료 시각까지 달린 만큼만) */
  function finance(config, g, phase, plan, timelines, riders) {
    var F = config.finance, leased = plan.buses.filter(function (b) { return b.leased; }).length, provided = plan.buses.length - leased;
    var km = timelines.reduce(function (s, tl) { return s + (tl.km || 0); }, 0);
    var service = serviceChecks(config, g, phase, timelines);
    var k = {
      subsidyBase: (F.basePerBus || 0) * provided,
      subsidyService: service.reduce(function (s, c) { return s + (c.met ? c.amount : 0); }, 0),
      service: service,
      fare: F.fare * riders,
      holding: F.holding * provided,
      lease: (F.lease ? F.lease.fee : 0) * leased, leased: leased,
      op: F.opPerMin * timelines.reduce(function (s, tl) { return s + tl.opMinutes; }, 0),
      fuel: Math.round(F.fuelPerKm * km), km: Math.round(km * 10) / 10
    };
    k.subsidy = k.subsidyBase + k.subsidyService;
    k.total = k.subsidy + k.fare - k.holding - k.lease - k.op - k.fuel;
    return k;
  }
  // 공공서비스 수행 조건: 이번 단계에 공개된 정류장마다 ‘실제로 달린 버스가 운행 시간 안에 N번 이상 정차’. 승객 수와 무관,
  // 노선만 그리고 버스를 안 보내면 정차 0번. 조건마다 따로 지급(하나를 놓쳐도 나머지는 받는다)
  function serviceChecks(config, g, phase, timelines) {
    var S = config.finance.service, W = config.bus.window;
    if (!S) return [];
    return S.stops.filter(function (x) { return x.fromPhase <= phase && g.has(x.id); }).map(function (x) {
      var n = 0;
      timelines.forEach(function (tl) { tl.visits.forEach(function (v) { if (v.node === x.id && v.kind === 'stop' && v.t <= W) n++; }); });
      return { id: x.id, label: x.label, need: S.minStops, stops: n, met: n >= S.minStops, amount: S.amount };
    });
  }

  function structural(g, plan, o, d) {
    var rs = operatingRoutes(plan).map(function (r) { return { id: r.id, s: stopSet(r.route) }; });
    for (var i = 0; i < rs.length; i++) {
      if (!rs[i].s[o]) continue;
      if (rs[i].s[d]) return true;
      for (var j = 0; j < rs.length; j++) {
        if (j === i || !rs[j].s[d]) continue;
        for (var x in rs[i].s) if (x !== o && rs[j].s[x]) return true;
      }
    }
    return false;
  }

  // 버스별 정차 방문에서 “같은 run 안에서 앞으로 정차할 노드 → 도착 시각” 표를 만든다
  function indexBus(tl) {
    var stops = [];
    tl.visits.forEach(function (v, k) { if (v.kind === 'stop') stops.push(k); });
    var ahead = {}, all = tl.visits.concat(tl.tail || []);
    stops.forEach(function (k) {
      var v = tl.visits[k], map = {};
      for (var m = k + 1; m < all.length; m++) {
        var w = all[m];
        if (tl.loop && w.node === v.node) break;
        if (w.runIn !== v.runOut) break;
        if (w.kind === 'stop' && map[w.node] == null) map[w.node] = w.t;
        if (w.runOut !== w.runIn) break; // 끝점에서 run이 끝난다
      }
      ahead[k] = map;
    });
    var byNode = {};
    stops.forEach(function (k) { (byNode[tl.visits[k].node] = byNode[tl.visits[k].node] || []).push(k); });
    return { tl: tl, ahead: ahead, byNode: byNode };
  }

  function makePlanner(buses, window) {
    var memo = new Map(), pairs = {};
    // 버스별 (x→d) 승차 시각·도착 시각 표(승차 시각 오름차순). 처음 필요할 때 만든다
    function pairTable(x, d) {
      var key = x + d;
      if (pairs[key]) return pairs[key];
      var list = [];
      buses.forEach(function (b) {
        var boards = [], arrs = [], ks = b.byNode[x] || [];
        for (var i = 0; i < ks.length; i++) {
          var v = b.tl.visits[ks[i]], arr = b.ahead[ks[i]][d];
          if (arr != null && v.t < window && arr <= window) { boards.push(v.t); arrs.push(arr); } // 계획은 120초 안 도착만
        }
        if (boards.length) list.push({ routeId: b.tl.routeId, boards: boards, arrs: arrs });
      });
      return (pairs[key] = list);
    }
    // x에서 ready 이후 타서 d에 가장 일찍 내리는 시각(노선 excl 제외). 없으면 null
    function direct(x, d, ready, excl) {
      var key = x + d + '|' + ready + '|' + excl;
      var hit = memo.get(key);
      if (hit !== undefined) return hit;
      var best = null, list = pairTable(x, d);
      for (var j = 0; j < list.length; j++) {
        var e = list[j];
        if (e.routeId === excl) continue;
        var lo = 0, hi = e.boards.length;
        while (lo < hi) { var mid = (lo + hi) >> 1; if (e.boards[mid] < ready) lo = mid + 1; else hi = mid; }
        if (lo === e.boards.length) continue;
        var arr = e.arrs[lo];
        if (!best || arr < best.arr || (arr === best.arr && e.routeId < best.routeId)) best = { arr: arr, routeId: e.routeId };
      }
      memo.set(key, best);
      return best;
    }
    function better(a, b) {
      if (!b) return true;
      if (a.arr !== b.arr) return a.arr < b.arr;
      if (a.legs.length !== b.legs.length) return a.legs.length < b.legs.length;
      for (var i = 0; i < a.legs.length; i++) if (a.legs[i].routeId !== b.legs[i].routeId) return a.legs[i].routeId < b.legs[i].routeId;
      return a.legs[0].to < b.legs[0].to;
    }
    return function plan(o, d, ready, transferMin) {
      var best = null;
      var dir = direct(o, d, ready, null);
      if (dir) best = { arr: dir.arr, legs: [{ routeId: dir.routeId, from: o, to: d }] };
      buses.forEach(function (b) {
        var ks = b.byNode[o] || [], tried = {};
        for (var i = 0; i < ks.length; i++) {
          var v = b.tl.visits[ks[i]];
          if (v.t < ready || v.t >= window) continue;
          var ah = b.ahead[ks[i]];
          for (var x in ah) {
            // 같은 버스에서 x까지는 먼저 탈수록 먼저 도착하므로 첫 승차만 보면 된다
            if (x === d || tried[x]) continue;
            tried[x] = true;
            var second = direct(x, d, ah[x] + transferMin, b.tl.routeId);
            if (!second) continue;
            var cand = { arr: second.arr, legs: [{ routeId: b.tl.routeId, from: o, to: x }, { routeId: second.routeId, from: x, to: d }] };
            if (better(cand, best)) best = cand;
          }
        }
      });
      return best;
    };
  }

  function run(input) {
    var g = input.g, config = input.config, plan = input.plan, event = input.event || null;
    var W = config.bus.window, cap = config.bus.capacity, tMin = config.bus.transferMin, F = config.finance;
    plan = Schedule.spacePlan(g, config, plan);
    var timelines = plan.buses.map(function (b) { return Schedule.timeline(g, config, b.id, b.route, b.offset); });
    var indexed = timelines.filter(function (tl) { return tl.route; }).map(indexBus);
    var planner = makePlanner(indexed, W);

    function passenger(r) {
      return { id: r.id, key: r.key, o: r.o, d: r.d, t: r.t, kind: r.kind, journey: null, fail: null, status: 'pending',
        residentId:r.residentId||null,leg:r.leg||null,returnTrip:r.returnTrip||null,
        familyId:r.familyId||null,familySize:r.familySize||0,
        firstBoardT: null, arriveT: null, waitTotal: 0, boardings: 0, legIndex: 0, _waitStart: null, _ready: null, _bus: null };
    }
    var passengers = input.requests.map(passenger);
    var byT = {};
    passengers.forEach(function (p) { (byT[p.t] = byT[p.t] || []).push(p); });
    var queue = [];       // 정류장에서 기다리는 사람(최초·환승)
    var walking = [];     // 환승 이동 중(준비 시각 대기)
    var onBus = {};       // busId → 탑승자
    timelines.forEach(function (tl) { onBus[tl.busId] = []; });
    var visitAt = {};     // t → [{tl, visit, idx}]
    indexed.forEach(function (b) {
      b.tl.visits.forEach(function (v, k) { (visitAt[v.t] = visitAt[v.t] || []).push({ b: b, v: v, k: k }); });
    });
    Object.keys(visitAt).forEach(function (t) { visitAt[t].sort(function (a, c) { return a.b.tl.busId - c.b.tl.busId; }); });

    var log = [], petition = null, linkMemo = {}, draining = {}, emergencyActive=false, activePlans = plan.buses.map(function(b){return {id:b.id,route:b.route};});
    function replanWaiting(t) {
      planner=makePlanner(indexed.filter(function(b){return !draining[b.tl.busId];}),W);linkMemo={};
      queue=[];
      passengers.forEach(function(p){
        if(p.t>t||(p.status!=='waiting'&&!(p.status==='transfer'&&p._ready<=t)))return;
        var origin=p._location||(p.journey&&p.journey[p.legIndex]?p.journey[p.legIndex].from:p.o),j=planner(origin,p.d,t,tMin);
        if(j){p.journey=j.legs;p.legIndex=0;p.fail=null;if(p._waitStart==null)p._waitStart=t;queue.push(p);}
        else{p.journey=null;p.fail=structural(g,{buses:activePlans},origin,p.d)?'NO_TRIP_IN_WINDOW':'NO_LINK';}
      });
    }
    function switchRoute(change,from,t) {
      var id=change.busId,tl=timelines.filter(function(x){return x.busId===id;})[0];
      var delay=from===change.route.nodes[0]?0:Schedule.travel(g,config,id,from,change.route.nodes[0]);
      var start=t+Math.max(1,delay),future=Schedule.timeline(g,config,id,change.route,start);
      // Playback retains the actual driven prefix, including empty repositioning.
      tl.segments=tl.segments.filter(function(x){return x.t0<t;});
      if(delay)tl.segments.push({from:from,to:change.route.nodes[0],t0:t,t1:t+delay,deadhead:true});
      tl.segments=tl.segments.concat(future.segments);tl.visits=tl.visits.filter(function(v){return v.t<=t;}).concat(future.visits);tl.tail=future.tail;
      tl.assignments=tl.assignments||[];tl.assignments.push({t:start,depart:t,route:change.route});
      if(!tl.opMinutes)tl.opMinutes=Math.max(0,W-t);
      tl.moveMinutes=tl.segments.reduce(function(sum,x){return sum+Math.max(0,Math.min(x.t1,W)-x.t0);},0);tl.km=Schedule.driven(g,tl.segments,W);
      var next=indexBus(future);indexed=indexed.filter(function(b){return b.tl.busId!==id;});indexed.push(next);
      Object.keys(visitAt).forEach(function(k){if(Number(k)>t)visitAt[k]=visitAt[k].filter(function(e){return e.b.tl.busId!==id;});});
      future.visits.forEach(function(v,k){(visitAt[v.t]||(visitAt[v.t]=[])).push({b:next,v:v,k:k});visitAt[v.t].sort(function(a,b){return a.b.tl.busId-b.b.tl.busId;});});
      activePlans.forEach(function(b){if(b.id===id)b.route=change.route;});delete draining[id];
      log.push({t:t,type:'reassign',bus:id,node:from,data:{destination:change.route.nodes[0],starts:start}});replanWaiting(t);
    }

    for (var t = 0; t <= W; t++) {
      (input.adjustments||[]).filter(function(a){return a.at===t;}).forEach(function(a){
        emergencyActive=true;
        draining[a.busId]=a;replanWaiting(t);
        var tl=timelines.filter(function(x){return x.busId===a.busId;})[0];
        if(tl&&!activePlans.filter(function(b){return b.id===a.busId;})[0].route)switchRoute(a,config.bus.depot,t);
      });
      // ① 요청 생성
      (byT[t] || []).forEach(function (p) {
        var j = planner(p.o, p.d, t, tMin);
        p.status = 'waiting';
        p._waitStart = t;
        if (j) { p.journey = j.legs; queue.push(p); }
        else {
          var lk = p.o + p.d;
          if (!(lk in linkMemo)) linkMemo[lk] = structural(g, emergencyActive?{buses:activePlans}:plan, p.o, p.d);
          p.fail = linkMemo[lk] ? 'NO_TRIP_IN_WINDOW' : 'NO_LINK';
          // 잇는 노선 자체가 없으면 버스를 기다린 것이 아니다(‘경로 없음’). 시간 안에 탈 편이 없으면 종료까지 기다린 것으로 센다
          if (p.fail === 'NO_LINK') p._waitStart = null;
        }
        log.push({ t: t, type: 'request', pid: p.id, node: p.o });
      });
      if (event && event.t === t && event.type !== 'none') {
        log.push({ t: t, type: 'event', data: { type: event.type } });
        if (event.type === 'petition') petition = judgePetition(passengers, t);
        if (petition) log.push({ t: t, type: 'petition', node: petition.zone, data: petition });
      }
      // ② 환승 준비 완료
      walking = walking.filter(function (p) {
        if (p._ready !== t) return true;
        p._waitStart = t;
        queue.push(p);
        if(emergencyActive){p.status='waiting';replanWaiting(t);}
        return false;
      });
      // ③ 버스 도착
      (visitAt[t] || []).forEach(function (e) {
        if (e.v.kind !== 'stop') return;
        var busId = e.b.tl.busId, riders = onBus[busId];
        onBus[busId] = riders.filter(function (p) {
          var leg = p.journey[p.legIndex];
          if (leg.to !== e.v.node) return true;
          if (p.legIndex === p.journey.length - 1) {
            p.status = 'arrived'; p.arriveT = t; p._bus = null;
            log.push({ t: t, type: 'arrive', pid: p.id, bus: busId, node: e.v.node });
            if(p.returnTrip){
              p.returnReadyT=Math.max(t+Math.max(1,p.returnTrip.stay),p.returnTrip.earliest);
              if(p.returnReadyT<W){
                var back=passenger({id:p.id+50000,key:p.key+'-return',o:p.d,d:p.returnTrip.destination||p.o,t:p.returnReadyT,kind:'base',residentId:p.residentId,familyId:p.familyId,familySize:p.familySize,leg:'return'});
                passengers.push(back);(byT[back.t]||(byT[back.t]=[])).push(back);
              }
            }
          } else {
            p.status = 'transfer'; p.legIndex++; p._ready = t + tMin; p._bus = null;
            p._location=e.v.node;
            walking.push(p);
            log.push({ t: t, type: 'alight', pid: p.id, bus: busId, node: e.v.node });
          }
          return false;
        });
        if (t >= W) return;
        if(draining[busId]){
          var route=e.b.tl.route,terminal=e.v.node===route.nodes[0]||(!Graph.isLoop(route)&&e.v.node===route.nodes[route.nodes.length-1]);
          if(!onBus[busId].length&&terminal)switchRoute(draining[busId],e.v.node,t);
          return;
        }
        var ah = e.b.ahead[e.k];
        var eligible = queue.filter(function (p) {
          var leg = p.journey[p.legIndex];
          return leg.from === e.v.node && leg.routeId === e.b.tl.routeId && ah[leg.to] != null;
        }).sort(function (a, c) { return a._waitStart - c._waitStart || a.id - c.id; });
        var free = Schedule.vehicle(config,Number(busId)).capacity - onBus[busId].length;
        eligible.slice(Math.max(0, free)).forEach(function(p){p.deniedBoardings=(p.deniedBoardings||0)+1;});
        if (eligible.length > free) log.push({ t: t, type: 'full', bus: busId, node: e.v.node, data: { left: eligible.length - Math.max(0, free) } });
        eligible.slice(0, Math.max(0, free)).forEach(function (p) {
          p.waitTotal += t - p._waitStart;
          p._waitStart = null;
          if (p.firstBoardT == null) p.firstBoardT = t;
          p.status = 'riding';
          p.boardings++;
          p._bus = busId;
          onBus[busId].push(p);
          queue.splice(queue.indexOf(p), 1);
          log.push({ t: t, type: 'board', pid: p.id, bus: busId, node: e.v.node });
        });
      });
    }

    // 종료: 아직 기다리는 사람의 대기를 120초까지 더한다
    passengers.forEach(function (p) {
      if (p._waitStart != null && p.status !== 'arrived') p.waitTotal += W - p._waitStart;
      if (p.status === 'transfer' || p.status === 'riding' || p.status === 'arrived') return;
      p.status = 'waiting';
    });
    passengers.forEach(function (p) { delete p._waitStart; delete p._ready; delete p._bus; delete p._location; });

    var users = passengers.filter(function (p) { return p.firstBoardT != null; });
    var costs = finance(config, g, input.phase, plan, timelines, users.length);
    costs.paidUnfinished = users.filter(function (p) { return p.status !== 'arrived'; }).length;

    return { timelines: timelines, passengers: passengers, log: log, costs: costs, petition: petition };
  }

  // 그 시각까지 생긴 요청 중 미완료 비율이 가장 높은 출발 생활권(동률 ID순). 미완료 0명이면 없음
  function judgePetition(passengers, t) {
    var z = {};
    passengers.forEach(function (p) {
      if (p.t > t) return;
      var s = z[p.o] = z[p.o] || { total: 0, open: 0 };
      s.total++;
      if (p.status !== 'arrived') s.open++;
    });
    var best = null;
    Object.keys(z).sort().forEach(function (id) {
      var r = z[id].open / z[id].total;
      if (!best || r > best.r) best = { id: id, r: r };
    });
    if (!best || z[best.id].open === 0) return null;
    return { zone: best.id, t: t, count: z[best.id].open, total: z[best.id].total };
  }

  // 승객별 결과를 짧은 해시로(FNV-1a) — 결정성 검사용
  function hash(result) {
    var s = result.passengers.map(function (p) { return [p.id, p.status, p.firstBoardT, p.arriveT, p.waitTotal, p.boardings].join(','); }).join(';');
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function occupancyAt(result, t) {
    var counts = {};
    result.timelines.forEach(function (tl) { counts[tl.busId] = 0; });
    result.log.forEach(function (e) {
      if (e.t > t || e.bus == null) return;
      if (e.type === 'board') counts[e.bus]++;
      if (e.type === 'alight' || e.type === 'arrive') counts[e.bus]--;
    });
    return counts;
  }
  function unfinishedReasons(result){
    var out={};result.passengers.forEach(function(p){if(p.status==='arrived')return;
      var g=out[p.o]||(out[p.o]={noLink:0,full:0,time:0});
      g[p.fail==='NO_LINK'?'noLink':p.deniedBoardings>0?'full':'time']++;
    });return out;
  }
  var api = { run: run, unfinishedReasons:unfinishedReasons, occupancyAt: occupancyAt, operatingRoutes: operatingRoutes, structural: structural, hash: hash };
  root.PB = root.PB || {};
  root.PB.Sim = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
