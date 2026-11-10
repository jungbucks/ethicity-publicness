/*
 * 세션 — 한 학기 다섯 단계의 흐름과 학생이 고치는 계획 초안을 담는다. serialize/restore로 브라우저에 자동 저장·이어하기(App).
 * 저장에는 운행 결과(승객·로그)를 넣지 않는다 — 결정적 엔진이라 계획·사건으로 다시 계산한다. 운행 중 저장본은 출발 직전 계획으로,
 * 결과 저장본은 이미 기록된 결과 그대로 되살리며 finishRun·nextPhase를 다시 부르지 않으므로 수입·비용·인물 횟수가 두 번 들어가지 않는다.
 * 단계 흐름: reveal(새 단계 직후 — 화면은 곧바로 계획으로 넘김, App.go) → plan(목표·AI·편집) → run(운행, 편집 불가) → result → 다음 단계 … → ending
 * 실제 운행은 공개 기본 수요 + 이 세션에서 미리 정해진 사건으로, 예상은 공개 기본 수요만으로 계산한다.
 */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var Graph = NODE ? require('./graph.js') : root.PB.Graph;
  var Demand = NODE ? require('./demand.js') : root.PB.Demand;
  var Sim = NODE ? require('./sim.js') : root.PB.Sim;
  var Metrics = NODE ? require('./metrics.js') : root.PB.Metrics;
  var Advisor = NODE ? require('./advisor.js') : root.PB.Advisor;
  var Rng = NODE ? require('./rng.js') : root.PB.Rng;
  var Schedule = NODE ? require('./schedule.js') : root.PB.Schedule;
  var Layout = NODE ? require('./layout.js') : root.PB.Layout;
  var Scores = NODE ? require('./scores.js') : root.PB.Scores;
  var Elder = NODE ? require('./elder.js') : root.PB.Elder;
  var Midday = NODE ? require('./midday.js') : root.PB.Midday;
  var RideLog = NODE ? require('./ride-log.js') : root.PB.RideLog;

  function copyRoute(r) { return { nodes: r.nodes.slice(), stops: r.stops.slice() }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function parseSeedParam(str) {
    if (str == null || str === '') return { seed: 42, mode: 'default', note: null };
    if (/^-?\d+$/.test(String(str).trim())) {
      var n = Number(str);
      if (isFinite(n)) return { seed: Number(BigInt.asUintN(32, BigInt(String(str).trim()))), mode: 'fixed', note: null };
    }
    return { seed: 42, mode: 'default', note: '세팅 번호는 정수여야 해요. 기본 세팅으로 시작해요.' };
  }

  function create(config, opts) {
    opts = opts || {};
    var mode = opts.mode || 'default', seed;
    // 랜덤도 seed를 주면 그 세팅 그대로(‘같은 조건으로 재도전’)
    if (mode === 'random') seed = opts.seed != null ? Number(opts.seed) >>> 0 : Math.floor((opts.rand || Math.random)() * 4294967296) >>> 0;
    else if (mode === 'fixed') seed = Number(opts.seed) >>> 0;
    else seed = config.defaultSeed;
    if (mode !== 'default' && config.map) {
      config = clone(config);
      delete config.river; // 강 장식·건너기 규칙은 기본 세팅만(랜덤 지도는 정류장이 섞여 강 위치와 무관)
      if(config.challenge&&!config.challengeApplied){
        var challenge=config.challenge;config.challengeApplied=true;
        config.phases=config.phases.concat(challenge.phases);
        config.progression={routes:[2,3,4,4,4,5,5,6],buses:[2,3,4,5,6,7,8,9]};config.bus.maxBuses=9;
        config.satisfactionTargets=challenge.targets;config.familyTrips=challenge.families;config.residents=config.residents.concat(clone(challenge.residents||[]));
        config.nodes=config.nodes.concat(challenge.nodes);config.demandRows=config.demandRows.concat(challenge.demandRows);
        config.residents.forEach(function(r){if(r.itineraries){r.itineraries[6]={o:'J',d:'H',depart:60,returnAt:100,stay:20,returnTo:'B'};r.itineraries[7]=clone(r.itineraries[5]);}});
      }
      // 배치(2026-10-27): 역할 자리 세로로 펼치고 나머지 생활권은 분산 표본 + 완화 — js/layout.js. 같은 시드 = 같은 배치
      var placed=Layout.place(config.nodes,Rng.create(seed ^ 0x51ed270b));
      config.nodes.forEach(function(n){n.x=placed[n.id].x;n.y=placed[n.id].y;});
    }
    var s = {
      config: config, seed: seed, mode: mode, phase: 1, stage: 'reveal',
      events: Demand.drawEvents(config, seed),
      trust: {}, owned: config.bus.initialBuses, fourthPhase: null,
      draft: {
        routes: config.initialDraft.routes.map(function (r, i) { var c = copyRoute(r); c.num = i + 1; return c; }),
        nextNum: config.initialDraft.routes.length + 1,
        buses: config.initialDraft.buses.map(function (b) { return { id: b.id, routeNum: b.routeNum, offset: b.offset }; })
      },
      goal: null, goalHistory: [], lastRec: null, current: null, history: [],
      ledger: [], deficits: 0, end: null // 확정 정산·누적 적자·종료 상태(저장본에 함께 남는다)
    };
    graph(s).nodes.forEach(function (id) { s.trust[id] = config.trust.initial; });
    return s;
  }

  function graph(s) {
    if (!s._g || s._g.phase !== s.phase) s._g = Graph.build(s.config, s.phase);
    return s._g;
  }
  function visibleNodeIds(s) { return graph(s).nodes.slice(); }
  function routeByNum(s, num) {
    for (var i = 0; i < s.draft.routes.length; i++) if (s.draft.routes[i].num === num) return s.draft.routes[i];
    return null;
  }

  function toPlan(s) {
    return Schedule.spacePlan(graph(s), s.config, { buses: s.draft.buses.map(function (b) {
      var r = b.routeNum != null ? routeByNum(s, b.routeNum) : null;
      var o = { id: b.id, route: r ? copyRoute(r) : null, offset: s.config.map ? 0 : b.offset };
      if (b.leased) o.leased = true;
      return o;
    }) });
  }

  function prevRouteIds(s) {
    var h = s.history[s.history.length - 1];
    return h ? h.routeIds.slice() : [];
  }

  function validate(s) {
    var g = graph(s), errs = [], offsets = s.config.bus.offsets;
    var used = {};
    s.draft.buses.forEach(function (b) { if (b.routeNum != null) used[b.routeNum] = true; });
    s.draft.routes.forEach(function (r) {
      if (!routeFits(s,r.num,r)) errs.push(routeRule(s,r.num));
      if(s.config.challengeApplied&&r.num===6&&used[r.num]&&(r.nodes.length!==2||r.nodes.indexOf('N')<0))errs.push(routeRule(s,6));
      if (!used[r.num]) return;
      Graph.validateRoute(g, r).forEach(function (e) { errs.push(r.num + '번 노선: ' + e); });
    });
    s.draft.buses.forEach(function (b) {
      if(!canAssign(s,b.id,b.routeNum))errs.push(b.id+'호차의 전용 노선 배정을 확인해 주세요.');
      if (offsets.indexOf(b.offset) < 0) errs.push(b.id + '호차의 출차 시각을 다시 골라 주세요.');
      if (b.routeNum != null && !routeByNum(s, b.routeNum)) errs.push(b.id + '호차가 없는 노선에 배정되어 있어요.');
    });
    if (!s.config.progression && s.fourthPhase === s.phase) {
      var b4 = s.draft.buses.filter(function (b) { return b.id === 4; })[0];
      var r4 = b4 && b4.routeNum != null ? routeByNum(s, b4.routeNum) : null;
      var msg = '4호차는 처음 운행할 때 새 노선에 배정해야 해요.';
      if (!r4) errs.push(msg);
      else {
        var id4 = Graph.routeId(r4);
        var others = s.draft.buses.filter(function (b) { return b.id !== 4 && b.routeNum != null; })
          .map(function (b) { var r = routeByNum(s, b.routeNum); return r ? Graph.routeId(r) : null; });
        if (prevRouteIds(s).indexOf(id4) >= 0 || others.indexOf(id4) >= 0) errs.push(msg);
      }
    }
    return errs;
  }

  function routeLimit(s) { return s.config.progression ? s.config.progression.routes[s.phase - 1] : 4; }
  function stopLimit(s,num) { return s.config.challengeApplied ? (num===6?2:num===5?3:Infinity) : Infinity; }
  function routeRule(s,num){return num===6?'6번 광역은 마을 정류장 한 곳과 대도시를 잇는 왕복 노선이에요.':'대도시는 6번 광역으로만 연결해요. 5번 직행은 최대 3개 정류장이에요.';}
  function routeFits(s,num,r) {
    if(!s.config.challengeApplied)return true;
    if(num!==6)return r.nodes.indexOf('N')<0&&new Set(r.nodes).size<=stopLimit(s,num);
    return r.nodes.length<=2&&new Set(r.nodes).size===r.nodes.length&&(r.nodes.length<2||r.nodes.indexOf('N')>=0);
  }
  // 도전 모드 전용 노선·버스: 5번 직행 ↔ 7호차, 6번 광역 ↔ 9호차(서로만). 2026-10-27: 일반 버스가 5번에 들어가던 문제를 막음
  function canAssign(s,id,num){return num==null||!s.config.challengeApplied||((id!==7||num===5)&&(id!==9||num===6)&&(num!==6||id===9)&&(num!==5||id===7));}
  // 화면 표시용: 노선 번호순 사본(초안 배열 순서는 생성·적용 순서라 섞일 수 있음)
  function routesInOrder(s) { return s.draft.routes.slice().sort(function (a, b) { return a.num - b.num; }); }
  function addRoute(s, route, preferNum) {
    var num = 1;
    if (preferNum && preferNum <= routeLimit(s) && !routeByNum(s, preferNum)) num = preferNum;
    else while (num <= routeLimit(s) && routeByNum(s, num)) num++;
    if (num > routeLimit(s) || s.draft.routes.length >= routeLimit(s) || !routeFits(s,num,route)) return null;
    var r = copyRoute(route);
    r.num = num;
    s.draft.routes.push(r);
    return r;
  }
  function updateRoute(s, num, route) {
    var r = routeByNum(s, num);
    if (!r || !routeFits(s,num,route)) return null;
    r.nodes = route.nodes.slice(); r.stops = route.stops.slice();
    return r;
  }
  function deleteRoute(s, num) {
    var unassigned = [];
    s.draft.routes = s.draft.routes.filter(function (r) { return r.num !== num; });
    s.draft.buses.forEach(function (b) { if (b.routeNum === num) { b.routeNum = null; unassigned.push(b.id); } });
    return { unassigned: unassigned };
  }
  function bus(s, id) { return s.draft.buses.filter(function (b) { return b.id === id; })[0]; }
  function assign(s, busId, routeNum) { var b = bus(s, busId); if(!canAssign(s,busId,routeNum))return false; if (b) b.routeNum = routeNum; }
  // 대기(쉬는) 버스 중 이 노선에 보낼 한 대 — 도전 모드 전용 버스(5번 직행=7호차, 6번 광역=9호차)는 자기 노선에 먼저, 나머지는 번호순
  function restingFor(s, num) {
    var list = s.draft.buses.filter(function (b) { return b.routeNum == null && canAssign(s, b.id, num); });
    var own = s.config.challengeApplied ? (num === 5 ? 7 : num === 6 ? 9 : null) : null;
    return list.filter(function (b) { return b.id === own; })[0] || list[0] || null;
  }
  // 노선이 처음 완성되면(정류장 2곳 이상·유효) 대기 버스 1대를 자동 배치한다. 새 버스를 만들지 않고 보유 버스에서 옮긴다.
  // 노선마다 한 번뿐(autoPlaced) — 이미 버스가 있거나, 고치다 다시 완성되거나, 대기 버스가 없으면 배치하지 않는다(‘운행 대기’로 남음)
  function autoPlace(s, num) {
    var r = routeByNum(s, num);
    if (!r || r.autoPlaced || r.nodes.length < 2 || Graph.validateRoute(graph(s), r).length || !routeFits(s, num, r)) return null;
    r.autoPlaced = true;
    if (s.draft.buses.some(function (b) { return b.routeNum === num; })) return null;
    var b = restingFor(s, num);
    if (!b) return { busId: null };
    b.routeNum = num;
    return { busId: b.id };
  }
  // 이 버스를 이 노선에 보내면 늘어나는 비용(관제·운영비 + 연료·정비비, 원). Sim과 같은 시각표·자동 간격으로 계산한다. 보유비·임차료는 쉬어도 들어 빼고 센다
  function busCost(s, busId, num) {
    var r = routeByNum(s, num);
    if (!r || Graph.validateRoute(graph(s), r).length) return null;
    var pv = Object.assign({}, s, { draft: clone(s.draft) }), F = s.config.finance;
    bus(pv, busId).routeNum = num;
    var pb = toPlan(pv).buses.filter(function (b) { return b.id === busId; })[0];
    var tl = Schedule.timeline(graph(s), s.config, busId, pb.route, pb.offset);
    return Math.round((F.opPerMin * tl.opMinutes + F.fuelPerKm * tl.km) / 100) * 100;
  }
  // 노선을 정하기 전에 보여 줄 대략값: 이번 단계 정류장 두 곳 왕복 노선들의 1대 운영비 중앙값
  // (재정 건전성의 기준 예비비도 같은 값을 쓴다 — Scores.referenceBusCost)
  function typicalBusCost(s) { return Math.round(Scores.referenceBusCost(graph(s), s.config) / 1000) * 1000; }
  /* ── 추가 임차(2026-10-27) ──
   * 이번 단계에만 쓰는 일반 버스(정원 12명) 1대씩, 단계당 최대 lease.perPhase대. 임차료 = 차량 확보 비용(보유비 대신, 쉬어도 듦).
   * 운행하면 관제·운영비·연료비는 따로. 노선 배치·이동·회수에는 임차료를 다시 받지 않는다(정산 때 출발한 계획의 임차 대수 × 임차료 한 번).
   * 계획 중 임차·반납은 초안 편집이라 되돌리기·저장 복구를 그대로 따른다. 단계가 끝나면 자동 반납(nextPhase), 다음 단계에 자동 재임차 없음.
   * 번호는 21호차부터(도전 모드 전용 7·9호차와 겹치지 않게) */
  var LEASE_BASE = 21;
  function leasedBuses(s) { return s.draft.buses.filter(function (b) { return b.leased; }); }
  function leaseLimit(s) { var L = s.config.finance.lease; return L ? Math.max(0, L.perPhase - leasedBuses(s).length) : 0; }
  function lease(s) {
    if ((s.stage !== 'plan' && s.stage !== 'reveal') || !leaseLimit(s)) return null;
    var id = LEASE_BASE; while (bus(s, id)) id++;
    var b = { id: id, routeNum: null, offset: 0, leased: true };
    s.draft.buses.push(b);
    return b;
  }
  // 반납: 계획 중, 대기(쉬는) 상태인 임차 버스만. 반납하면 이번 단계 임차료가 들지 않는다
  function unlease(s, id) {
    var b = bus(s, id);
    if ((s.stage !== 'plan' && s.stage !== 'reveal') || !b || !b.leased || b.routeNum != null) return false;
    s.draft.buses = s.draft.buses.filter(function (x) { return x !== b; });
    return true;
  }
  function setOffset(s, busId, offset) { var b = bus(s, busId); if (b) b.offset = s.config.map ? 0 : offset; }

  function beginPlan(s) { if (s.stage === 'reveal') s.stage = 'plan'; }
  /* 단계 전 화면 정리(2026-11-01): 성찰(transitionStep 'reflect')·「마을이 달라졌어요」('changes') 화면이 없어졌다. 그 화면에서 저장된 진행은
   * 그 단계 지도 계획 화면으로 보낸다(초안·버스는 nextPhase가 이미 새 단계 값으로 만들어 둠). 성찰 답 reflections[n]은 n단계 결과 화면의
   * 과거 결과 조회에 그대로 남는다. 최종 회고(finalReflection)와 합치지 않는다. 옛 선택 카드 문구가 들어 있으면 자유 서술이 아니라
   * 선택이므로 choices[n−1](= n−1단계 결과에서 고른 답, n단계 지도의 ‘이번 목표’)로 옮긴다. 이미 고른 답이 있으면 덮지 않는다 */
  var CHOICES = { many: '더 많은 사람을 빠르게', longest: '오래 기다린 사람부터' };
  function choiceKey(text) { var t = String(text || '').trim(); for (var k in CHOICES) if (CHOICES[k] === t) return k; return null; }
  function migrateTransition(s) {
    var moved = false;
    if (s.stage === 'reveal') { s.stage = 'plan'; moved = true; }
    if (s.transitionStep != null) { delete s.transitionStep; moved = true; }
    if (s.reflections) Object.keys(s.reflections).forEach(function (k) {
      var key = choiceKey(s.reflections[k]), n = Number(k);
      if (!key) return;
      s.choices = s.choices || {};
      if (n > 1 && s.choices[n - 1] == null) { s.choices[n - 1] = key; moved = true; }
      // Keep the original legacy text as historical evidence, even when it also maps to a choice.
    });
    return moved;
  }

  function introduceFourth(s) {
    if (s.config.progression) return false;
    if (s.phase < s.config.fourthFromPhase || s.owned >= s.config.bus.maxBuses) return false;
    if (s.stage !== 'reveal' && s.stage !== 'plan') return false;
    s.owned++;
    if(s.owned===4)s.fourthPhase = s.phase;
    s.draft.buses.push({ id: s.owned, routeNum: null, offset: 0 });
    return true;
  }

  function goalEntry(s) {
    var last = s.goalHistory[s.goalHistory.length - 1];
    if (last && last.phase === s.phase) return last;
    var e = { phase: s.phase, goal: null, action: null };
    s.goalHistory.push(e);
    return e;
  }
  function chooseGoal(s, goal) { s.goal = goal; goalEntry(s).goal = goal; }
  function markGoalAction(s, action) { goalEntry(s).action = action; }

  // 추천 계획의 노선을 초안 노선으로 찾거나 새로 만들어 배정한다(운행은 시작하지 않음)
  function applyPlanBuses(s, buses) {
    var desired = toPlan(s).buses.map(function (old) { return buses.filter(function (pb) { return pb.id === old.id; })[0] || old; });
    desired=desired.map(function(pb){var r=pb.route;if(s.config.challengeApplied&&r&&((pb.id===9&&(!routeFits(s,6,r)||r.nodes.length!==2))||(pb.id!==9&&r.nodes.indexOf('N')>=0)||(pb.id===7&&!routeFits(s,5,r))))return {id:pb.id,route:null,offset:pb.offset};return pb;});
    var previous = s.draft.routes.slice();
    function same(a, b) { return a && b && a.nodes.join('|') === b.nodes.join('|') && a.stops.join('|') === b.stops.join('|'); }
    s.draft.routes = [];
    var regional=desired.filter(function(pb){return s.config.challengeApplied&&pb.id===9&&pb.route;})[0];
    if(regional){var rr=copyRoute(regional.route);rr.num=6;s.draft.routes.push(rr);}
    var dedicated=s.config.challengeApplied?desired.filter(function(pb){return pb.id===7&&pb.route&&routeFits(s,5,pb.route);})[0]:null;
    if(dedicated){var dedicatedRoute=copyRoute(dedicated.route);dedicatedRoute.num=5;s.draft.routes.push(dedicatedRoute);}
    if(s.config.challengeApplied&&routeLimit(s)>=5){
      var unique=[];desired.forEach(function(pb){if(pb.id!==9&&pb.route&&!unique.some(function(r){return same(r,pb.route);}))unique.push(pb.route);});
      if(unique.length===5&&!dedicated){
        // 5번 자리: 기존 5번 그대로 → 새로 생기는 짧은 노선 → (불가피할 때만) 기존 짧은 노선을 5번으로 옮김
        var oldExpress=previous.filter(function(r){return r.num===5;})[0],fits=unique.filter(function(r){return routeFits(s,5,r);});
        var express=fits.filter(function(r){return same(r,oldExpress);})[0]||fits.filter(function(r){return !previous.some(function(p){return same(p,r);});})[0]||fits[0];
        if(express){var er=copyRoute(express);er.num=5;s.draft.routes.push(er);}
      }
    }
    previous.forEach(function (r) {
      if (r.num >= 1 && r.num <= routeLimit(s) && routeFits(s,r.num,r) && desired.some(function (pb) { return same(r, pb.route); }) &&
          !s.draft.routes.some(function (kept) { return kept.num === r.num || same(kept, r); })) s.draft.routes.push(r);
    });
    desired.forEach(function (pb) {
      var b = bus(s, pb.id);
      if (!b) return;
      if (!pb.route) { b.routeNum = null; b.offset = pb.offset; return; }
      var found = null;
      s.draft.routes.forEach(function (r) { if (!found && Graph.validateRoute(graph(s), r).length === 0 && r.nodes.join('|') === pb.route.nodes.join('|') && r.stops.join('|') === pb.route.stops.join('|')) found = r; });
      if (!found) found = addRoute(s, pb.route);
      b.routeNum = found&&canAssign(s,b.id,found.num) ? found.num : null;
      b.offset = s.config.map ? 0 : pb.offset;
    });
  }
  function applyRecommendation(s, rec) {
    applyPlanBuses(s, rec.plan.buses);
    s.lastRec = rec;
    markGoalAction(s, 'accept');
  }
  function applyFourth(s, rec) {
    if (!rec || !rec.fourth) return false;
    if(s.owned<3)return false;
    if (s.owned < s.config.bus.maxBuses && !introduceFourth(s)) return false;
    // 4호차만 배정한다(1~3호차는 학생의 현재 초안 그대로)
    applyPlanBuses(s, rec.fourth.plan.buses.filter(function (b) { return b.id === 4; }));
    return true;
  }

  /* 결과 화면 ‘AI라면?’(2026-11-06): AI 제안을 다음 단계 계획 화면과 같은 입력으로 돌리기 위한 사본. 진짜 세션은 건드리지 않는다.
   * 마지막 단계·계약 종료는 다음 단계가 없어 같은 단계 사본(이번 결과가 prevMetrics) */
  function plannedNext(s) {
    var c = serialize(s); if (!c.config) c.config = s.config; c.current = null;
    if (s.stage === 'result' && s.phase < s.config.phases.length && !(s.end && s.end.cause === 'contract')) { nextPhase(c); beginPlan(c); }
    return c;
  }
  // AI 제안을 적용한 초안 사본(계획 화면 미리보기·결과 화면 카드가 같은 함수)
  function previewRec(s, rec) {
    var pv = Object.assign({}, s, { draft: clone(s.draft), goalHistory: clone(s.goalHistory), _g: null });
    applyRecommendation(pv, rec);
    var used = pv.draft.buses.map(function (b) { return b.routeNum; });
    pv.draft.routes = pv.draft.routes.filter(function (r) { return used.indexOf(r.num) >= 0; });
    return pv;
  }
  // 두 초안의 가장 큰 변화 하나: 노선 추가 > 노선 삭제 > 정류장 추가 > 정류장 삭제 > 버스 이동 > 버스 빌리기
  function planChange(a, b) {
    function rows(s) {
      return s.draft.routes.map(function (r) { return { num: r.num, route: r, nodes: r.nodes, buses: s.draft.buses.filter(function (x) { return x.routeNum === r.num; }).length }; })
        .filter(function (r) { return r.nodes.length >= 2 && r.buses > 0; });
    }
    var x = rows(a), y = rows(b), restX = x.slice(), restY = [], moved = null, stops = [];
    y.forEach(function (n) {
      var old = restX.filter(function (o) { return Graph.routeId(o.route) === Graph.routeId(n.route); })[0];
      if (!old) { restY.push(n); return; }
      restX.splice(restX.indexOf(old), 1);
      if (n.buses > old.buses && !moved) moved = { type: 'moveBus', num: old.num };
    });
    var added = [];
    restY.forEach(function (n) {
      var best = null, shared = 0;
      restX.forEach(function (o) { var k = o.nodes.filter(function (id) { return n.nodes.indexOf(id) >= 0; }).length; if (k > shared) { shared = k; best = o; } });
      if (!best || shared < 2 || shared * 2 < best.nodes.length) { added.push(n); return; }
      restX.splice(restX.indexOf(best), 1);
      var plus = n.nodes.filter(function (id) { return best.nodes.indexOf(id) < 0; }), minus = best.nodes.filter(function (id) { return n.nodes.indexOf(id) < 0; });
      if (plus.length) stops.push({ type: 'addStop', num: best.num, node: plus[0] });
      else if (minus.length) stops.push({ type: 'delStop', num: best.num, node: minus[0] });
    });
    if (added.length) { var longest = added.slice().sort(function (p, q) { return q.nodes.length - p.nodes.length; })[0]; return { type: 'addRoute', nodes: longest.nodes.slice() }; }
    if (restX.length) return { type: 'delRoute', num: restX[0].num };
    var stop = stops.filter(function (c) { return c.type === 'addStop'; })[0] || stops[0];
    if (stop) return stop;
    if (moved) return moved;
    if (b.draft.buses.length > a.draft.buses.length) return { type: 'lease' };
    return { type: 'none' };
  }

  /* 'AI가 보는 수요'(2026-11-10, js/ride-log.js): 이번 단계 기본 요청(무임 정책 반영)을 직전 단계 탑승 기록 비율로 걸러 낸다.
   * 1단계는 예전 노선 기록(외곽 마을 0건), 기록을 못 채운 옛 저장본은 비율 1. 시뮬레이션·점수·재정은 계속 실제 수요 기준 */
  function prevRideLog(s) { var h = s.history.filter(function (x) { return x.phase === s.phase - 1; })[0]; return h && h.rideLog ? h.rideLog : null; }
  function rideRatios(s) { return RideLog.ratios(s.config, s.phase, prevRideLog(s), graph(s).nodes); }
  function aiBase(s) { return rideRequests(s, s.phase, null).ride.filter(function (q) { return q.kind === 'base'; }); }
  function aiView(s) {
    var rs = rideRatios(s), log = s.phase > 1 ? prevRideLog(s) : null;
    var records = log ? Object.keys(log).reduce(function (k, z) { return k + log[z].rode; }, 0) : RideLog.visible(aiBase(s), rs).length;
    return { ratios: rs, records: records, hidden: graph(s).nodes.filter(function (z) { return rs[z] === 0; }) };
  }
  function revealed(s) {
    var h = s.history[s.history.length - 1], rs = rideRatios(s);
    return Advisor.makeRevealed({
      phase: s.phase, g: graph(s), requests: RideLog.visible(aiBase(s), rs), rideRatios: rs, owned: s.owned,
      fourthAllowed: !s.config.progression && s.phase >= s.config.fourthFromPhase, fourthMustBeNew: !s.config.progression && s.fourthPhase === s.phase, prevMetrics: h ? h.metrics : null,
      prevRouteIds: prevRouteIds(s), plan: toPlan(s), config: s.config
    });
  }

  function runnable(s, plan) {
    var g = graph(s);
    return { buses: plan.buses.map(function (b) { var o = { id: b.id, route: b.route && Graph.validateRoute(g, b.route).length === 0 ? b.route : null, offset: b.offset }; if (b.leased) o.leased = true; return o; }) };
  }

  // 예상 = 추가 사건 없는 기본 수요로 같은 엔진을 돌린 결과(출발 경고·AI 예상이 같은 기준을 쓴다)
  function expectedRun(s, plan) {
    var p = runnable(s, plan || toPlan(s)), g = graph(s);
    var res = Sim.run({ g: g, config: s.config, phase: s.phase, plan: p, requests: rideRequests(s, s.phase, null).ride });
    var m = Metrics.summarize(res, g, p, s.config);
    m.residents = residentRecords(s, res);
    return { result: res, metrics: m, plan: p };
  }
  function expected(s, plan) { return expectedRun(s, plan).metrics; }

  // 이번 단계 실제 운행(기본 수요 + 이 세션의 사건). 같은 계획이면 언제 다시 계산해도 같은 결과
  /* 어르신 무임 정책(2026-11-10): 세션에 정책이 없으면 유지(keep). 4단계 폐지는 그 뒤 단계에 이어진다(Elder.ride가 단계를 본다) */
  function elderChoice(s) { return s.elderPolicy && s.elderPolicy.choice === 'abolish' ? 'abolish' : 'keep'; }
  function rideRequests(s, phase, ev) { return Elder.ride(s.config, phase, Demand.sortReqs(Demand.base(s.config, phase, s.seed).concat(Demand.extra(s.config, phase, ev))), elderChoice(s)); }
  function runRequests(s, ev) { return rideRequests(s, s.phase, ev).ride; }
  /* 2단계 고정 청원(2026-11-10): 사건 추첨과 상관없이 config.petition.t분에 한 번. 시뮬레이터가 낸 무작위 청원은 지우고 이 판정으로 바꾼다 */
  /* 하루가 끝난 승객 기록으로 t분 시점을 다시 본다: t까지 생긴 요청 중 t분에 아직 도착 못 한(arriveT 없음 또는 t 이후) 비율이 가장 높은 출발 구역.
   * 아무도 안 열려 있으면 t까지 탑승을 못 하고 기다린 시간 합이 가장 긴 구역, 그래도 없으면 F */
  function petitionAt(passengers, t) {
    var z = {}, w = {}, best = null, bw = null;
    passengers.forEach(function (p) {
      if (p.t > t) return;
      var e = z[p.o] = z[p.o] || { total: 0, open: 0 };
      e.total++;
      if (p.arriveT == null || p.arriveT > t) e.open++;
      w[p.o] = (w[p.o] || 0) + (Math.min(t, p.firstBoardT != null ? p.firstBoardT : Infinity) - p.t);
    });
    Object.keys(z).sort().forEach(function (id) { if (z[id].open && (!best || z[id].open / z[id].total > z[best].open / z[best].total)) best = id; });
    if (!best) Object.keys(w).sort().forEach(function (id) { if (!bw || w[id] > w[bw]) bw = id; });
    var zone = best || bw || 'F', e2 = z[zone] || { total: 0, open: 0 };
    return { zone: zone, t: t, count: e2.open, total: e2.total };
  }
  function fixPetition(s, result) {
    var cp = s.config.petition;
    if (!cp || s.phase !== cp.phase) return;
    var p = petitionAt(result.passengers, cp.t);
    p.fixed = true; p.noRecord = rideRatios(s)[p.zone] === 0;
    result.petition = p;
    result.log = result.log.filter(function (e) { return e.type !== 'petition'; });
    var at = result.log.length;
    for (var i = 0; i < result.log.length; i++) { if (result.log[i].t > p.t) { at = i; break; } }
    result.log.splice(at, 0, { t: p.t, type: 'petition', node: p.zone, data: p });
  }
  function computeRun(s, plan) {
    var g = graph(s), ev = s.events[s.phase - 1];
    var rr = rideRequests(s, s.phase, ev), requests = rr.ride;
    var day=dayInputs(s,s.phase),adjustments=day.adjustments;
    var result = Sim.run({ g: g, config: s.config, phase: s.phase, plan: plan, requests: requests, event: ev, adjustments:adjustments, routeChanges:day.routeChanges });
    fixPetition(s, result);
    var baseline=adjustments.length||day.routeChanges.length?Metrics.summarize(Sim.run({g:g,config:s.config,phase:s.phase,plan:plan,requests:requests,event:ev}),g,plan,s.config):null;
    return { baseline:baseline, plan: plan, result: result, metrics: Metrics.summarize(result, g, plan, s.config), expected: expected(s, plan), requestsN: result.passengers.length, event: ev, stayed: rr.stayed };
  }
  function startRun(s) {
    if (s.stage !== 'plan' || validate(s).length) return null;
    s.emergencyLog=(s.emergencyLog||[]).filter(function(a){return a.phase!==s.phase;});
    if(s.midChanges)s.midChanges=s.midChanges.filter(function(a){return a.phase!==s.phase;});
    delete s.runCursor;
    s.current = computeRun(s, clone(toPlan(s)));
    s.stage = 'run'; s.resumedFromRun = false;
    return s.current.result;
  }
  /* 출발 전 점검(2026-11-05 P0-2): 예측이 아니라 지금 계획에서 바로 셀 수 있는 사실만 — 문구는 ui-plan departCheck.
   * 노선이 있어도 버스가 없으면 그 정류장에는 아무도 못 오므로 ‘운행하는 노선’만 센다. 새 정류장을 앞에 */
  function departChecks(s) {
    var g = graph(s), buses = s.draft.buses, F = s.config.finance, phase = s.phase;
    var running = s.draft.routes.filter(function (r) { return r.nodes.length >= 2 && !Graph.validateRoute(g, r).length && buses.some(function (b) { return b.routeNum === r.num; }); });
    function serves(id) { return running.some(function (r) { return r.nodes.some(function (n, i) { return n === id && r.stops[i]; }); }); }
    var resting = buses.filter(function (b) { return b.routeNum == null; }), owned = resting.filter(function (b) { return !b.leased; }), leased = resting.filter(function (b) { return b.leased; });
    var fresh = phase > 1 ? s.config.nodes.filter(function (n) { return n.fromPhase === phase; }).map(function (n) { return n.id; }) : [];
    var unserved = g.nodes.filter(function (id) { return !serves(id); }), isNew = function (id) { return fresh.indexOf(id) >= 0; };
    return {
      noBus: !buses.some(function (b) { return b.routeNum != null; }),
      resting: owned.length, restingCost: owned.length * F.holding, restingLeased: leased.length, restingLeaseCost: leased.length * F.lease.fee,
      unserved: unserved.filter(isNew).concat(unserved.filter(function (id) { return !isNew(id); })), newStops: fresh,
      residents: Demand.residents(s.config, phase).filter(function (rd) { return !serves(rd.o) || !serves(rd.d); }).map(function (rd) { return { id: rd.id, name: rd.name, o: rd.o, d: rd.d }; })
    };
  }
  // 긴급 조정 시점(엔진 시간, 10:06·15:03) — 운행 화면(ui-run)도 이 값을 쓴다
  var EMERGENCY_AT=[34,67];
  function emergencyDecision(s,at,busId,routeNum){
    if(s.stage!=='run'||s.phase<3||EMERGENCY_AT.indexOf(at)<0)return false;
    var decisions=s.emergencyLog||(s.emergencyLog=[]);
    if(decisions.some(function(a){return a.phase===s.phase&&a.at===at;}))return false;
    var route=busId==null?null:routeByNum(s,routeNum);
    if(busId!=null&&(!route||!canAssign(s,busId,routeNum)||Graph.validateRoute(graph(s),route).length))return false;
    if(busId!=null&&!s.draft.buses.some(function(b){return b.id===busId;}))return false;
    // 이미 그 노선을 맡은 버스를 같은 노선으로 ‘옮기면’ 조정권만 쓰고 승객을 내리느라 운행에서 빠진다(2026-11-01 플레이테스트) — 받지 않는다
    if(busId!=null&&busRouteAt(s,busId,at)===routeNum)return false;
    var departure=s.current.plan,baseline=s.current.baseline||s.current.metrics;
    decisions.push({phase:s.phase,at:at,busId:busId,routeNum:routeNum,route:route?clone(route):null});
    s.current=computeRun(s,departure);s.current.baseline=baseline;
    return true;
  }

  /* ── 운행 중 노선 고치기(하루 한 번, 2026-11-09 — 위 고정 시각 긴급 조정을 대체. 규칙은 js/midday.js·docs/plans/2026-11-09-midday-route-change.md) ──
   * 저장: 새 선택 필드 s.midChanges [{phase, at, kind:'add'|'remove'|'move', routeNum, node, pos, busId, route, from, busIds}].
   * 예전 저장본의 s.emergencyLog(10:06·15:03)는 그대로 adjustments로 다시 계산한다(예전 길). 둘을 합친 하루 입력 = dayInputs */
  function dayInputs(s, phase) {
    var adjustments = (s.emergencyLog || []).filter(function (a) { return a.phase === phase && a.busId != null; }).map(function (a) { return { at: a.at, busId: a.busId, routeNum: a.routeNum, route: a.route }; });
    var routeChanges = [];
    (s.midChanges || []).filter(function (c) { return c.phase === phase; }).forEach(function (c) {
      if (c.kind === 'move') adjustments.push({ at: c.at, busId: c.busId, routeNum: c.routeNum, route: c.route });
      else routeChanges.push({ at: c.at, busIds: c.busIds.slice(), route: c.route });
    });
    adjustments.sort(function (a, b) { return a.at - b.at; });
    return { adjustments: adjustments, routeChanges: routeChanges };
  }
  function midSpan(s) { return Midday.span(s.config); }
  function midUsed(s) {
    return (s.midChanges || []).some(function (c) { return c.phase === s.phase; }) || (s.emergencyLog || []).some(function (a) { return a.phase === s.phase && a.busId != null; });
  }
  // 버튼 상태: ok, at(지금 고치면 적용 시각), why = phase(3단계 전)·used·early·late
  function midStatus(s, tf) {
    var w = midSpan(s), at = Midday.atFor(s.config, tf), out = { ok: false, at: at, open: w.open, close: w.close, why: null };
    if (s.phase < 3) out.why = 'phase';
    else if (midUsed(s)) out.why = 'used';
    else if (tf < w.open - 1e-9) out.why = 'early';
    else if (at == null) out.why = 'late';
    else out.ok = true;
    return out;
  }
  // 출발 계획에서 그 노선을 맡은 버스(운행 중 노선 = 버스 1대 이상)
  function routeBuses(s, num) {
    var r = routeByNum(s, num); if (!r || !s.current) return [];
    var key = r.nodes.join('|') + '#' + r.stops.join('|');
    return s.current.plan.buses.filter(function (b) { return b.route && b.route.nodes.join('|') + '#' + b.route.stops.join('|') === key; }).map(function (b) { return b.id; }).sort(function (a, b) { return a - b; });
  }
  function runningRoutes(s) { return routesInOrder(s).filter(function (r) { return routeBuses(s, r.num).length; }); }
  // 정류장 하나 더하기·빼기 결과 노선(규칙에 안 맞으면 {fail: 한 줄 이유})
  function midRoute(s, num, kind, node, pos) {
    var r = routeByNum(s, num), g = graph(s);
    if (!r || !routeBuses(s, num).length) return { fail: '버스가 달리는 노선만 고칠 수 있어요.' };
    var next;
    if (kind === 'add') {
      if (!g.has(node)) return { fail: '지금 지도에 없는 정류장이에요.' };
      if (r.nodes.indexOf(node) >= 0) return { fail: '이미 이 노선에 있는 정류장이에요.' };
      next = Midday.addStop(r, node, pos); if (!next) return { fail: '넣을 자리를 다시 골라 주세요.' };
    } else if (kind === 'remove') {
      if (r.nodes.indexOf(node) < 0) return { fail: '이 노선에 없는 정류장이에요.' };
      next = Midday.removeStop(r, node); if (!next) return { fail: Graph.isLoop(r) ? '순환 노선은 정류장이 세 곳 넘게 있을 때만 뺄 수 있어요.' : '노선에는 정류장이 두 곳 이상 남아야 해요.' };
    } else return { fail: '고칠 방법을 골라 주세요.' };
    if (!routeFits(s, num, next)) return { fail: routeRule(s, num) };
    var errs = Graph.validateRoute(g, next); if (errs.length) return { fail: errs[0] };
    return { route: next };
  }
  // 한 가지 고치기를 기록하고 운행을 다시 계산한다(출발 계획·계획 초안은 그대로 — 그날만). 안 되면 false
  function midApply(s, c) {
    if (s.stage !== 'run' || !s.current || !c) return false;
    var st = midStatus(s, c.at); if (!st.ok || st.at !== c.at) return false;
    var entry = { phase: s.phase, at: c.at, kind: c.kind, routeNum: c.routeNum };
    if (c.kind === 'move') {
      var route = routeByNum(s, c.routeNum);
      if (c.busId == null || !route || !canAssign(s, c.busId, c.routeNum) || Graph.validateRoute(graph(s), route).length) return false;
      if (!s.draft.buses.some(function (b) { return b.id === c.busId; }) || busRouteAt(s, c.busId, c.at) === c.routeNum) return false;
      entry.busId = c.busId; entry.from = busRouteAt(s, c.busId, c.at); entry.route = clone(route);
    } else {
      var m = midRoute(s, c.routeNum, c.kind, c.node, c.pos); if (!m.route) return false;
      entry.node = c.node; if (c.kind === 'add') entry.pos = c.pos;
      entry.from = clone(copyRoute(routeByNum(s, c.routeNum))); entry.route = clone(m.route); entry.busIds = routeBuses(s, c.routeNum);
    }
    var departure = s.current.plan, baseline = s.current.baseline || s.current.metrics;
    (s.midChanges || (s.midChanges = [])).push(entry);
    s.current = computeRun(s, departure); s.current.baseline = baseline;
    return true;
  }

  // 운행 계획의 노선(엔진 사본) → 초안 노선 번호. 초안에 같은 노선이 없으면 null
  function routeNumOf(s, route) {
    if (!route) return null;
    var hit = s.draft.routes.filter(function (r) { return r.nodes.join('|') === route.nodes.join('|') && r.stops.join('|') === route.stops.join('|'); })[0];
    return hit ? hit.num : null;
  }
  // 긴급 조정 시점 at에 버스가 맡은 노선 번호(쉬는 버스는 null). 앞선 조정으로 옮겨 가는 중(승객을 내리는 중)이면 옮겨 갈 노선
  function busRouteAt(s, busId, at) {
    var res = s.current && s.current.result; if (!res) return null;
    var pending = dayInputs(s, s.phase).adjustments.filter(function (a) { return a.busId === busId && a.at < at; }).pop();
    if (pending) return pending.routeNum;
    var tl = res.timelines.filter(function (x) { return x.busId === busId; })[0]; if (!tl) return null;
    var route = tl.route; (tl.assignments || []).forEach(function (a) { if (a.t <= at) route = a.route; });
    return routeNumOf(s, route);
  }
  // 조정을 미리 계산만 한다(저장·결과는 그대로): 버스가 승객을 내리고 그 노선에 들어가는 시각 starts(엔진 시간, 운행 안에 못 들어가면 null)
  function emergencyPreview(s, at, busId, routeNum) {
    var route = routeByNum(s, routeNum); if (!route || !s.current || busId == null) return null;
    var ev = s.events[s.phase - 1], day = dayInputs(s, s.phase), adj = day.adjustments
      .concat([{ phase: s.phase, at: at, busId: busId, routeNum: routeNum, route: clone(route) }]);
    var res = Sim.run({ g: graph(s), config: s.config, phase: s.phase, plan: s.current.plan, requests: runRequests(s, ev), event: ev, adjustments: adj, routeChanges: day.routeChanges });
    var tl = res.timelines.filter(function (x) { return x.busId === busId; })[0], a = tl && (tl.assignments || []).filter(function (x) { return x.depart >= at; })[0];
    return { starts: a ? a.t : null, leaves: a ? a.depart : null, resting: busRouteAt(s, busId, at) == null };
  }

  // 긴급 조정으로 버스 한 대를 옮기면 하루가 어떻게 달라지나(P0-2, 2026-11-02) — 옮기기 전(지금까지의 결정만)과 옮긴 뒤를 같은 엔진으로 끝까지 돌려
  // 하루 도착 건수와 주요 인물 ‘해낸 하루’ 수를 비교한다. 결과는 바뀌지 않는다(미리 보기). base를 넘기면 옮기기 전 계산을 다시 하지 않는다
  function emergencyImpact(s, at, busId, routeNum, base) {
    var route = routeByNum(s, routeNum); if (!route || !s.current || busId == null) return null;
    var ev = s.events[s.phase - 1], day = dayInputs(s, s.phase), prev = day.adjustments;
    function sum(adj) {
      var res = Sim.run({ g: graph(s), config: s.config, phase: s.phase, plan: s.current.plan, requests: runRequests(s, ev), event: ev, adjustments: adj, routeChanges: day.routeChanges });
      var c = Evaluation.count(Evaluation.records(s.config, s.phase, res));
      return { arrived: res.passengers.filter(function (p) { return p.status === 'arrived'; }).length, ok: c.satisfied, total: c.total };
    }
    return { before: base || sum(prev), after: sum(prev.concat([{ phase: s.phase, at: at, busId: busId, routeNum: routeNum, route: clone(route) }])) };
  }

  // 주요 인물의 ‘해낸 하루’ 판정 — 출발 전 경고(예상), 결과 화면, 학기 말 누적이 모두 이 함수 하나를 쓴다.
  // 기준: 첫 이동과 다음 이동을 운행 시간 안에 모두 마칠 것 + 서비스 기준(config.service, 없으면 생략).
  // reasons는 학생에게 보여 줄 구체적 이유(목적지 미연결·다음 이동 경로 없음·대기 기준 초과 등)
  var Evaluation = NODE ? require('./resident-evaluation.js') : root.PB.ResidentEvaluation;
  var residentVerdict = Evaluation.verdict, tripLimit = Evaluation.tripLimit;
  function residentRecords(s,result){return Evaluation.records(s.config,s.phase,result);}

  function finishRun(s) {
    if (s.stage !== 'run' || !s.current) return null;
    if (s.history.some(function (h) { return h.phase === s.phase; })) { s.stage = 'result'; return null; } // 같은 단계를 두 번 정산하지 않는다
    var c = s.current, D = {}, before = clone(s.trust);
    Object.keys(c.metrics.zones).forEach(function (z) {
      D[z] = c.metrics.zones[z].D;
      s.trust[z] = Metrics.nextTrust(s.trust[z] != null ? s.trust[z] : s.config.trust.initial, D[z], s.config);
    });
    var entry = {
      phase: s.phase, plan: c.plan, routeIds: Sim.operatingRoutes(c.plan).map(function (r) { return r.id; }),
      metrics: c.metrics, expected: c.expected, requestsN: c.requestsN, D: D, trustBefore: before, trustAfter: clone(s.trust),
      event: c.event, petition: c.result.petition, residents: residentRecords(s, c.result), goal: s.goal,
      elder: { free: c.metrics.costs.freeRiders || 0, unpaid: (c.metrics.costs.freeRiders || 0) * s.config.finance.fare, stayed: (c.stayed || []).length, paid: c.result.passengers.filter(function (p) { return p.elder && !p.free && p.firstBoardT != null; }).length }
    };
    entry.eventFare = s.config.finance.fare * c.result.passengers.filter(function (p) { return p.kind === 'extra' && p.firstBoardT != null; }).length;
    entry.rideLog = RideLog.fromRun(c.result.passengers);
    s.history.push(entry);
    if (s.config.petition && s.phase === s.config.petition.phase && c.result.petition) { var fp = c.result.petition; s.fixedPetition = { phase: s.phase, zone: fp.zone, t: fp.t, count: fp.count, total: fp.total, noRecord: !!fp.noRecord }; }
    settle(s, entry);
    // 두 점수(재정 건전성·이동 수요 충족) — 정산 직후 한 번 기록해 저장본에 남긴다(js/scores.js)
    entry.scores = Scores.phaseScores(s.config, graph(s), s.phase, s.seed, c.event, c.plan, c.result.passengers, ledgerBalance(s, s.phase), c.stayed);
    s.stage = 'result';
    return entry;
  }

  /* ── 재정 판정 ──
   * 회차 수지 = 그 단계 수입(지원금 기본+수행분 + 운임) − 비용(보유·임차·운영·연료) = metrics.costs.total
   * 보유 잔액 = 확정된 회차 수지의 합. 적자 = 회차 수지 < 0(정확히 0원은 적자 아님) — 경고·분석용 정보. 판정은 반올림 전 값으로 한다.
   * 기본: 중간에 멈추지 않고 마지막 단계 뒤 잔액 < 0이면 파산 엔딩.
   * 랜덤(도전, 2026-10-27 개편): 지급 능력 기준 — 단계 정산 뒤 누적 잔액이 0원 미만인 채로 2번 연속이면 운영 계약 종료(1번째는 경고).
   *   모아 둔 흑자로 적자 노선(외곽·병원)을 유지하는 운영은 계속할 수 있다. 예전 ‘적자 3회’ 규칙은 흑자가 쌓여 있어도 끝나 이 전략을 막았다. */
  var DEFICIT_LIMIT = 3, NEGATIVE_LIMIT = 2;
  function financeRule(s) { return s.mode === 'default' ? 'final-balance' : 'balance-streak'; }
  function balance(s) { return s.history.reduce(function (a, h) { return a + h.metrics.costs.total; }, 0); }
  function ledgerRow(k, phase, before) {
    var c = Metrics.costParts(k); // 예전 저장본(move)·새 항목(임차료·연료비) 모두
    return { phase: phase, income: c.subsidy + c.fare, cost: c.holding + c.lease + c.op + c.fuel, total: k.total, balance: before + k.total, deficit: k.total < 0 };
  }
  // 정산 확정: 단계마다 한 번(finishRun의 중복 방지 뒤에서만 불린다)
  function settle(s, entry) {
    if (!s.ledger) rebuildLedger(s);
    if (s.ledger.some(function (r) { return r.phase === entry.phase; })) return;
    var before = s.ledger.length ? s.ledger[s.ledger.length - 1].balance : 0, row = ledgerRow(entry.metrics.costs, entry.phase, before);
    s.ledger.push(row);
    if (row.deficit) s.deficits++;
    s.negStreak = row.balance < 0 ? (s.negStreak || 0) + 1 : 0;
    if (financeRule(s) === 'balance-streak' && s.negStreak >= NEGATIVE_LIMIT && !s.end) s.end = { cause: 'contract', phase: entry.phase, balance: row.balance };
  }
  function ledgerBalance(s, phase) { var row = (s.ledger || []).filter(function (r) { return r.phase === phase; })[0]; return row ? row.balance : null; }
  // 점수 기록이 없는 예전 저장본: 저장된 출발 계획·사건·긴급 조정으로 운행을 다시 계산해, 기록된 요청 수·도착 수와 같을 때만 채운다
  // (설정이 바뀌어 결과가 달라지면 채우지 않고 ‘평가 자료 없음’으로 둔다 — 없는 평가를 만들어 넣지 않는다)
  // 탑승 기록(entry.rideLog)이 없는 예전 저장본도 같은 재실행 한 번으로 채운다(같은 검사 — 다르면 비워 두고 'AI가 보는 수요'는 비율 1)
  function rescore(s, h) {
    var bal = ledgerBalance(s, h.phase), needScores = !h.scores || h.scores.version !== Scores.VERSION, needLog = !h.rideLog;
    if (!needScores && !needLog) return true;
    if (!h.plan || !h.metrics || h.event === undefined || (needScores && bal == null)) return false;
    var g = Graph.build(s.config, h.phase), day = dayInputs(s, h.phase);
    var rr = rideRequests(s, h.phase, h.event), req = rr.ride;
    var res = Sim.run({ g: g, config: s.config, phase: h.phase, plan: h.plan, requests: req, event: h.event, adjustments: day.adjustments, routeChanges: day.routeChanges });
    var arrived = res.passengers.filter(function (p) { return p.status === 'arrived'; }).length;
    if (res.passengers.length !== h.metrics.N || arrived !== h.metrics.arrived) return false;
    if (needScores) {
      h.scores = Scores.phaseScores(s.config, g, h.phase, s.seed, h.event, h.plan, res.passengers, bal, rr.stayed);
      h.scores.recomputed = true;
    }
    if (needLog) h.rideLog = RideLog.fromRun(res.passengers);
    return true;
  }
  function scoresOverall(s) { return Scores.overall(s.history, s.config.phases.length); }
  // 정산 기록이 없는 예전 저장본: 기록된 운행에서 다시 만든다(같은 단계는 한 번만)
  function rebuildLedger(s) {
    s.ledger = []; s.deficits = 0; s.negStreak = 0;
    var seen = {}, end = s.end; s.end = null;
    s.history.forEach(function (h) { if (!seen[h.phase]) { seen[h.phase] = true; settle(s, h); } });
    if (end && !s.end) s.end = end;
  }
  function financeStatus(s) {
    var ledger = s.ledger || [], bal = balance(s), rule = financeRule(s);
    return {
      rule: rule, balance: bal, ledger: ledger, deficits: s.deficits || 0, limit: NEGATIVE_LIMIT, negStreak: s.negStreak || 0,
      deficitPhases: ledger.filter(function (r) { return r.deficit; }).map(function (r) { return r.phase; }),
      // 기본 모드에서 잔액이 한 단계 지원금보다 적으면 ‘학기 말에 평가한다’는 안내를 띄운다
      // 기본 모드: 잔액이 기본 제공 차량 한 단계 보유비보다 적으면 ‘학기 말에 평가’ 안내
      low: rule === 'final-balance' && bal < s.config.finance.holding * s.owned,
      end: s.end || null
    };
  }

  function nextPhase(s) {
    if (s.stage !== 'result') return false;
    if (s.end && s.end.cause === 'contract') { s.stage = 'ending'; return true; }
    if (s.phase >= s.config.phases.length) {
      var bal = balance(s);
      s.end = { cause: financeRule(s) === 'final-balance' && bal < 0 ? 'bankrupt' : 'complete', phase: s.phase, balance: bal };
      s.stage = 'ending'; return true;
    }
    s.phase++;
    s.draft.buses = s.draft.buses.filter(function (b) { return !b.leased; }); // 임차 차량은 단계가 끝나면 반납(자동 재임차 없음)
    if (s.config.progression) {
      // 도전 모드에서 노선 한도가 5가 되는 단계는 항상 5번 직행 자리에 새 노선을 만든다(앞 단계에서 지운 번호가 있어도)
      var express = s.config.challengeApplied ? (s.phase===8?6:s.phase===6?5:null) : null;
      var newRoute = s.config.progression.routes[s.phase-1]>s.config.progression.routes[s.phase-2] ? addRoute(s, {nodes:[], stops:[]}, express) : null;
      while (s.owned < s.config.progression.buses[s.phase - 1]) {
        s.owned++;
        s.draft.buses.push({id:s.owned, routeNum:null, offset:0}); // 새 버스는 모든 단계에서 ‘쉬기’로 시작(빈 노선에 자동 배정하지 않음)
      }
    }
    s.stage = 'reveal'; s.goal = null; s.lastRec = null; s.current = null;
    graph(s).nodes.forEach(function (id) { if (s.trust[id] == null) s.trust[id] = s.config.trust.initial; });
    return true;
  }

  function endingSummary(s) {
    var zones = {};
    var all = Graph.build(s.config, s.config.phases.length).nodes;
    all.forEach(function (z) {
      var hist = s.history.map(function (h) {
        var m = h.metrics.zones[z];
        return { phase: h.phase, N: m ? m.N : 0, rate: m ? m.rate : null, maxWait: m ? m.maxWait : 0, trust: h.trustAfter[z] };
      });
      zones[z] = { history: hist, subtitle: Metrics.subtitle(hist, s.config) };
    });
    var residents = {};
    s.config.residents.forEach(function (rd) { residents[rd.id] = s.history.map(function (h) { return h.residents[rd.id]; }); });
    var perPhase = s.history.map(function (h) { return h.metrics.costs; });
    return {
      zones: zones, residents: residents, goalHistory: s.goalHistory.slice(), seed: s.seed, mode: s.mode,
      finance: { perPhase: perPhase, balance: perPhase.reduce(function (a, c) { return a + c.total; }, 0) }
    };
  }

  // 자동 저장용 사본 — 운행 결과(승객·로그)와 계산 캐시는 빼고, 기본 세팅은 설정도 뺀다(불러올 때 현재 설정을 쓴다)
  function serialize(s) {
    var o = {};
    Object.keys(s).forEach(function (k) { if (k !== '_g' && k !== 'current' && !(k === 'config' && s.mode === 'default')) o[k] = s[k]; });
    if (s.current) o.current = { plan: s.current.plan, event: s.current.event, routeReportShown: !!s.current.routeReportShown };
    return clone(o);
  }
  // 저장본 되살리기. 운행 중이었다면 출발 직전 계획(plan 단계)으로, 결과 화면이었다면 같은 결과를 다시 계산해 보여 준다
  function restore(data, baseConfig) {
    var s = clone(data);
    if (!s.config) s.config = baseConfig;
    if(s.stage==='run'&&typeof s.runCursor==='number'&&s.current&&s.current.plan){s.current=computeRun(s,s.current.plan);}
    else if (s.stage === 'run') { s.stage = 'plan'; s.current = null; s.resumedFromRun = true; }
    else if (s.stage === 'result' && s.current && s.current.plan) { var keep = s.current.routeReportShown; s.current = computeRun(s, s.current.plan); s.current.routeReportShown = keep; }
    else s.current = null;
    if (!s.ledger) rebuildLedger(s);
    // 예전 저장본(적자 3회 규칙 시절): 연속 마이너스 잔액 횟수를 정산 기록에서 다시 센다. 이미 끝난 계약(s.end)은 그대로 둔다
    if (s.negStreak == null) s.negStreak = (s.ledger || []).reduce(function (k, r) { return r.balance < 0 ? k + 1 : 0; }, 0);
    s.history.forEach(function (h) { rescore(s, h); });
    migrateTransition(s);
    if (s.stage === 'ending' && !s.end) { var bal = balance(s); s.end = { cause: financeRule(s) === 'final-balance' && bal < 0 ? 'bankrupt' : 'complete', phase: s.phase, balance: bal }; }
    return s;
  }

  var api = {
    elderChoice: elderChoice, petitionAt: petitionAt, rideRequests: rideRequests, aiView: aiView,
    departChecks:departChecks,dayInputs:dayInputs,midStatus:midStatus,midRoute:midRoute,midApply:midApply,runningRoutes:runningRoutes,routeBuses:routeBuses,emergencyDecision:emergencyDecision,EMERGENCY_AT:EMERGENCY_AT,busRouteAt:busRouteAt,emergencyPreview:emergencyPreview,emergencyImpact:emergencyImpact,routeNumOf:routeNumOf,
    serialize: serialize, restore: restore, migrateTransition: migrateTransition, CHOICES: CHOICES, choiceKey: choiceKey, scoresOverall: scoresOverall, rescore: rescore, financeRule: financeRule, financeStatus: financeStatus, balance: balance, DEFICIT_LIMIT: DEFICIT_LIMIT, NEGATIVE_LIMIT: NEGATIVE_LIMIT, residentVerdict: residentVerdict, tripLimit: tripLimit, expectedRun: expectedRun,
    parseSeedParam: parseSeedParam, create: create, graph: graph, visibleNodeIds: visibleNodeIds, routeByNum: routeByNum,
    toPlan: toPlan, validate: validate, routeLimit: routeLimit, routesInOrder: routesInOrder, stopLimit:stopLimit, routeFits:routeFits, routeRule:routeRule, canAssign:canAssign, addRoute: addRoute, updateRoute: updateRoute, deleteRoute: deleteRoute,
    assign: assign, lease: lease, unlease: unlease, leaseLimit: leaseLimit, leasedBuses: leasedBuses, LEASE_BASE: LEASE_BASE, restingFor: restingFor, autoPlace: autoPlace, busCost: busCost, typicalBusCost: typicalBusCost, setOffset: setOffset, beginPlan: beginPlan, introduceFourth: introduceFourth,
    chooseGoal: chooseGoal, markGoalAction: markGoalAction, applyRecommendation: applyRecommendation, applyFourth: applyFourth,
    revealed: revealed, plannedNext: plannedNext, previewRec: previewRec, planChange: planChange, expected: expected, startRun: startRun, finishRun: finishRun, nextPhase: nextPhase, endingSummary: endingSummary
  };
  root.PB = root.PB || {};
  root.PB.Session = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
