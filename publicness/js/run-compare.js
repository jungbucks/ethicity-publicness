/* 같은 단계 지난 운행과 비교(2026-11-09 교사 플레이테스트 4 — ‘유사하게 변경하면 안 좋아지는 경우, 왜 그런지 안 보임’).
 * 단계마다 정산은 한 번뿐이라, ‘지난 운행’ = 같은 조건(모드·세팅 번호·시나리오 버전)으로 다시 한 게임(같은 조건 재도전·처음부터 다시)의 같은 단계.
 * 이미 계산된 숫자만 쓴다(새 시뮬레이션 없음): 최장 대기 · 목적지까지 못 간 이동 · 이번 단계 수지 · 기준을 채운 주요 인물 + 노선별 버스·정류장.
 * 저장: localStorage ethicity.publicness.stageRuns {v:1, runs:[{key,phase,runId,at,sum}]}(최근 MAX개) — 진행 저장본(ethicity.publicness.save)과 따로.
 *       게임 구분은 세션의 선택 필드 runId(예전 저장본엔 없음 → 처음 결과를 볼 때 붙인다). 같은 게임의 기록은 비교하지 않는다. */
(function (root) {
  'use strict';
  var KEY = 'ethicity.publicness.stageRuns', MAX = 40;
  /* 비교 키 = 모드|세팅 번호|시나리오 버전(+ 랜덤·지정 세팅은 그 판의 기본 지원금 'b8000'). 2026-11-14 검토 4번:
   * 랜덤·지정 세팅은 저장본이 그때 설정을 통째로 들고 이어 가서, 같은 버전 이름 아래에도 지원금이 다른 판이 있다(pb-3.1.0 안에서 10,000 → 5,000원).
   * 같은 세팅·같은 계획인데 ‘+8,202원 → −1,798원 · 계획은 지난번과 같아요’처럼 재정 값이 다른 기록과 비교되지 않게 키에 붙인다.
   * (버전만 있던 예전 키 '…|pb-3.1.0'의 랜덤 기록은 어느 지원금인지 알 수 없어 더는 비교에 안 나온다.) 기본 모드는 설정을 저장하지 않고 늘 지금 값이라 버전까지만 */
  function scenarioKey(s, version) {
    var k = [s.mode, s.seed, version || ''], F = s.mode !== 'default' && s.config && s.config.finance;
    if (F && F.basePerBus != null) k.push('b' + F.basePerBus);
    return k.join('|');
  }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  /* 노선 번호로 정해지는 차량 종류(2026-11-18 검토 8번 — 일반 → 직행으로 바꿔도 ‘계획은 지난번과 같아요’였다).
   * 판단은 Schedule.routeVehicleId 한 곳(도전 규칙: 5번 = 7호차 직행 1.5배·정원 18, 6번 = 9호차 광역 정원 24, 나머지 = 일반). */
  var Schedule = (typeof require === 'function' && typeof module !== 'undefined') ? require('./schedule.js') : (root.PB && root.PB.Schedule);
  var VEHICLE = { 7: 'express', 9: 'regional' }, VEHICLE_NAME = { regular: '일반 버스', express: '직행 버스', regional: '광역 버스' };
  function vehicleOf(config, num) { return VEHICLE[Schedule.routeVehicleId(config, num)] || 'regular'; }
  /* 결과 화면의 한 단계 요약. h = 그 단계 기록(history), draft = 출발한 계획(결과 화면에서는 아직 그대로).
   * ctx = { config, elder }(선택) — 있으면 노선마다 차량 종류(vehicle)와 그 단계에 적용된 정책(policy)을 함께 남긴다.
   *   policy = {} : 무임 정책이 아직 없는 단계 / { elder:'keep'|'abolish', stayHome:n } : 정책 단계(stayHome = 이미 계산한 h.scores의 ‘무임 폐지로 집에 머문 이동’).
   *   ctx 없이 만든 요약 = 이 수정 전 기록과 같은 모양(vehicle·policy 없음 → 비교할 때 ‘모름’으로 다룬다) */
  function summary(h, draft, ctx) {
    var m = h.metrics, rs = h.residents || {}, ids = Object.keys(rs).filter(function (id) { return rs[id]; }), cfg = ctx && ctx.config;
    var routes = (draft && draft.routes || []).filter(function (r) { return r.nodes.length >= 2; }).map(function (r) {
      var o = { num: r.num, nodes: r.nodes.slice(), stops: r.nodes.map(function (id, i) { return !r.stops || r.stops[i] !== false; }), buses: draft.buses.filter(function (b) { return b.routeNum === r.num; }).length };
      if (cfg) o.vehicle = vehicleOf(cfg, r.num);
      return o;
    });
    var out = { phase: h.phase, maxWait: m.maxWait, missed: m.N - m.arrived, N: m.N, arrived: m.arrived, total: m.costs.total,
      people: { ok: ids.filter(function (id) { return rs[id].satisfied; }).length, total: ids.length }, routes: routes };
    if (cfg) {
      var E = cfg.elderFree, P = out.policy = {};
      if (E && h.phase >= E.policyPhase && (ctx.elder === 'keep' || ctx.elder === 'abolish')) {
        P.elder = ctx.elder;
        var why = h.scores && h.scores.mobility && h.scores.mobility.reasons;
        if (why && why.stayHome != null) P.stayHome = why.stayHome;
      }
    }
    return out;
  }
  var ELDER_NAME = { keep: '유지', abolish: '폐지' };
  /* 정책 비교(2026-11-18 검토 9번): 바뀐 줄(맨 앞에 둘 것)과 지난 기록에 없어 비교 못 한 것 */
  function policyChanges(prev, cur, f) {
    var c = cur.policy, p = prev.policy;
    if (!c || !c.elder) return { out: [], unknown: [] };
    if (!p) return { out: [], unknown: ['무임 정책'] }; /* 이 수정 전 기록: 그때 어느 정책이었는지 모른다 — 같다고도 다르다고도 하지 않는다 */
    if (p.elder === c.elder) return { out: [], unknown: [] };
    if (!p.elder) return { out: [], unknown: [] }; /* 지난 기록은 정책 없는 단계(같은 단계 비교라 실제로는 없음) */
    var stay = p.stayHome != null && c.stayHome != null ? '(집에 머문 이동 ' + p.stayHome + '건 → ' + c.stayHome + '건)' : '';
    return { out: ['어르신 무임 ' + ELDER_NAME[p.elder] + ' → ' + ELDER_NAME[c.elder] + stay], unknown: [] };
  }
  function batchim(w) { var c = w.charCodeAt(w.length - 1) - 0xAC00; return c >= 0 && c < 11172 && c % 28 !== 0; } // 끝 글자 받침(‘정책’ 있음 → 이, ‘종류’ 없음 → 가)
  function signed(f, n) { return (n > 0 ? '+' : '') + f(n); }
  // 숫자 줄: 변화가 큰(상대 변화) 순으로 최대 3개 · 계획 줄: 노선별 버스·정류장 변화 최대 2개
  function lines(prev, cur, f) {
    var cands = [
      { label: '최장 대기', a: prev.maxWait, b: cur.maxWait, show: f.duration, rel: function (a, b) { return Math.abs(b - a) / Math.max(a, b, 1); } },
      { label: '목적지까지 못 간 이동', a: prev.missed, b: cur.missed, show: function (v) { return v + '건'; }, rel: function (a, b) { return Math.abs(b - a) / Math.max(a, b, 1); } },
      { label: '이번 단계 수지', a: Math.round(prev.total), b: Math.round(cur.total), show: function (v) { return signed(f.won, v); }, rel: function (a, b) { return Math.abs(b - a) / Math.max(Math.abs(a), Math.abs(b), 20000); } }
    ];
    if (prev.people && cur.people && cur.people.total) cands.push({ label: '기준을 채운 주요 인물', a: prev.people.ok, b: cur.people.ok, show: function (v) { return v + '명'; }, rel: function (a, b) { return Math.abs(b - a) / Math.max(cur.people.total, 1); } });
    var moved = cands.filter(function (c) { return c.a != null && c.b != null && c.show(c.a) !== c.show(c.b); })
      .map(function (c) { return { c: c, r: c.rel(c.a, c.b) }; }).sort(function (x, y) { return y.r - x.r; }).slice(0, 3)
      .map(function (x) { return x.c.label + ' ' + x.c.show(x.c.a) + ' → ' + x.c.show(x.c.b); });
    var numbers = moved.length ? '지난번 같은 단계와 비교: ' + moved.join(' · ') : '지난번 같은 단계와 결과 숫자가 같아요.';
    /* 정책 변화를 맨 앞에(두 가지까지만 보여서 노선 변화에 밀려 잘리지 않게) */
    var pol = policyChanges(prev, cur, f), rt = compareRoutes(prev.routes || [], cur.routes || [], f), all = pol.out.concat(rt.out), changes = all.slice(0, 2);
    if (all.length > 2) changes.push('그 밖에 ' + (all.length - 2) + '가지');
    /* 지난 기록에 없는 항목(이 수정 전 기록)은 짐작하지 않고, ‘같아요’라고 단정하지도 않는다 */
    var unknown = pol.unknown.concat(rt.unknown).join('·'), ig = unknown ? unknown + (batchim(unknown) ? '이' : '가') : '', plan;
    if (changes.length) plan = '달라진 계획: ' + changes.join(' · ') + (ig ? ' (지난 기록에 ' + ig + ' 없어 그 부분은 비교하지 못했어요)' : '');
    else plan = ig ? '지난 기록에 ' + ig + ' 남아 있지 않아 계획이 같은지 다 비교하지 못했어요.' : '계획은 지난번과 같아요.';
    return { numbers: numbers, plan: plan };
  }
  /* 노선 짝 찾기와 순서 비교(2026-11-10 검토 1번). 정류장 집합(setKey)은 ‘어느 노선이 어느 노선인가’를 찾는 데만 쓰고, 짝을 찾은 뒤 순서·순환·정차 여부를 따로 본다.
   * 엔진 규칙(js/schedule.js timeline·spacePlan): 버스는 노선 첫 정류장에서 출발해 끝에서 방향을 바꾸고, 같은 노선 버스의 출차 간격도 첫 정류장 기준이다.
   * → 거꾸로 이은 노선(A–B–C / C–B–A)·순환의 시작점을 돌린 노선도 같은 시각에 다른 정류장에 서는 다른 운행이라 ‘같은 계획’으로 보지 않는다.
   *   색 번호(num)만 다른 노선은 엔진 입력(정류장 순서·정차·버스 수)이 같아 같은 운행이다 — 단 도전 규칙의 5번 직행·6번 광역은 차량이 달라(속도·정원) 다른 운행(2026-11-18 검토 8번, vehicle). */
  function isLoop(n) { return n.length > 2 && n[0] === n[n.length - 1]; }
  function openSeq(n) { return isLoop(n) ? n.slice(0, -1) : n.slice(); } // 순환의 닫는 정류장을 뺀 순서
  function same(a, b) { return a.length === b.length && a.every(function (x, i) { return x === b[i]; }); }
  function setKey(r) { return openSeq(r.nodes).sort().join(','); }
  function knownStops(r) { return Array.isArray(r.stops) && r.stops.length === r.nodes.length; } // 예전 요약에는 정차 기록이 없다
  function sameRun(p, c) { return same(p.nodes, c.nodes) && (!knownStops(p) || !knownStops(c) || same(p.stops.map(Boolean), c.stops.map(Boolean))) && (!p.vehicle || !c.vehicle || p.vehicle === c.vehicle); }
  /* 차량(2026-11-18 검토 8번): 둘 다 기록이 있으면 비교. 한쪽이 예전 요약(기록 없음)이고 두 번호 중 하나라도 특수 차량이 될 수 있는 번호(도전 규칙 5·6번)면 ‘모름’.
   * 둘 다 일반 버스만 될 수 있는 번호(1~4번 등)면 어느 모드든 일반 버스라 같다 — 판단은 Schedule.routeVehicleId 그대로 */
  function maySpecial(num) { return Schedule.routeVehicleId({ challengeApplied: true }, num) !== 1; }
  function vehicleChange(p, c, name, out, unknown) {
    if (p.vehicle && c.vehicle) { if (p.vehicle !== c.vehicle) out.push(name + ' ' + VEHICLE_NAME[p.vehicle] + ' → ' + VEHICLE_NAME[c.vehicle] + '로 바꿈'); }
    else if (p.num !== c.num && (maySpecial(p.num) || maySpecial(c.num)) && unknown.indexOf('버스 종류') < 0) unknown.push('버스 종류');
  }
  function rotated(a, b) { for (var k = 1; k < a.length; k++) if (same(a.slice(k).concat(a.slice(0, k)), b)) return true; return same(a, b); }
  // 같은 정류장을 잇는 두 노선의 달라진 점(없으면 빈 배열)
  function orderChanges(p, c, name, f) {
    var out = [], pl = isLoop(p.nodes), cl = isLoop(c.nodes), po = openSeq(p.nodes), co = openSeq(c.nodes), rev = po.slice().reverse();
    if (pl !== cl) out.push(name + (cl ? ' 순환으로 바꿈' : ' 순환을 풂'));
    if (!same(po, co)) {
      var start = name + ' 첫 출발 정류장 바꿈(' + f.name(po[0]) + ' → ' + f.name(co[0]) + ')';
      if (pl && cl) out.push(rotated(po, co) ? start : rotated(rev, co) ? name + ' 도는 방향 바꿈' : name + ' 정류장 순서 바꿈');
      else out.push(!pl && !cl && same(rev, co) ? start : name + ' 정류장 순서 바꿈');
    } else if (pl === cl && knownStops(p) && knownStops(c)) {
      c.nodes.forEach(function (id, i) { if (!!p.stops[i] !== !!c.stops[i] && c.nodes.indexOf(id) === i) out.push(name + ' ' + f.name(id) + (c.stops[i] ? ' 통과 → 정차' : ' 정차 → 통과')); });
    }
    return out;
  }
  function planChanges(prev, cur, f) { return compareRoutes(prev, cur, f).out; }
  function compareRoutes(prev, cur, f) {
    var out = [], buses = [], unknown = [], restP = prev.slice(), restC = cur.slice(); /* 노선 모양(순서·정류장·새 노선·없앰)을 먼저, 버스 수는 그 뒤에 */
    function bus(name, a, b) { if (a !== b) buses.push(name + ' 버스 ' + a + '대 → ' + b + '대'); }
    // 짝 찾기: ① 순서·정차까지 같은 노선(색이 달라도) → ② 같은 정류장들을 잇는 노선 → ③ 같은 색. 각 단계에서 같은 색을 먼저 고른다
    function pair(match, each) {
      restC.slice().forEach(function (c) {
        var cands = restP.filter(function (x) { return match(x, c); }), p = cands.filter(function (x) { return x.num === c.num; })[0] || cands[0]; if (!p) return;
        restP.splice(restP.indexOf(p), 1); restC.splice(restC.indexOf(c), 1); each(p, c, f.route(c.num));
      });
    }
    pair(sameRun, function (p, c, name) { vehicleChange(p, c, name, out, unknown); bus(name, p.buses, c.buses); });
    pair(function (p, c) { return setKey(p) === setKey(c); }, function (p, c, name) { out.push.apply(out, orderChanges(p, c, name, f)); vehicleChange(p, c, name, out, unknown); bus(name, p.buses, c.buses); });
    pair(function (p, c) { return p.num === c.num; }, function (p, c, name) {
      var plus = c.nodes.filter(function (id, i) { return p.nodes.indexOf(id) < 0 && c.nodes.indexOf(id) === i; }), minus = p.nodes.filter(function (id, i) { return c.nodes.indexOf(id) < 0 && p.nodes.indexOf(id) === i; });
      if (plus.length) out.push(name + '에 ' + plus.map(f.name).join('·') + ' 더함');
      if (minus.length) out.push(name + '에서 ' + minus.map(f.name).join('·') + ' 뺌');
      vehicleChange(p, c, name, out, unknown);
      bus(name, p.buses, c.buses);
    });
    restC.forEach(function (c) { out.push(f.route(c.num) + ' 새로 만듦(' + c.nodes.filter(function (id, i) { return c.nodes.indexOf(id) === i; }).map(f.name).join('–') + ', 버스 ' + c.buses + '대)'); });
    restP.forEach(function (p) { out.push(f.route(p.num) + '(' + p.nodes.filter(function (id, i) { return p.nodes.indexOf(id) === i; }).map(f.name).join('–') + ') 없앰'); });
    return { out: out.concat(buses), unknown: unknown };
  }
  function read(store) { try { var o = JSON.parse(store.getItem(KEY) || 'null'); return o && o.v === 1 && Array.isArray(o.runs) ? o : { v: 1, runs: [] }; } catch (e) { return { v: 1, runs: [] }; } }
  function previous(store, key, phase, runId) {
    return read(store).runs.filter(function (r) { return r.key === key && r.phase === phase && r.runId !== runId; })
      .sort(function (a, b) { return b.at - a.at; })[0] || null;
  }
  function remember(store, key, phase, runId, sum, at) {
    try { var o = read(store), old = null; o.runs = o.runs.filter(function (r) { var me = r.key === key && r.phase === phase && r.runId === runId; if (me) old = r; return !me; });
      o.runs.push({ key: key, phase: phase, runId: runId, at: old ? old.at : at, sum: sum }); /* 같은 게임을 다시 열어도 처음 본 시각 유지(순서가 안 뒤집히게) */ if (o.runs.length > MAX) o.runs = o.runs.slice(-MAX);
      store.setItem(KEY, JSON.stringify(o)); return true; } catch (e) { return false; }
  }
  var api = { KEY: KEY, MAX: MAX, scenarioKey: scenarioKey, newId: newId, summary: summary, lines: lines, planChanges: planChanges, previous: previous, remember: remember };
  root.PB = root.PB || {}; root.PB.RunCompare = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
