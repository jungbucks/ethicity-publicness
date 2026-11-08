/* 같은 단계 지난 운행과 비교(2026-11-09 교사 플레이테스트 4 — ‘유사하게 변경하면 안 좋아지는 경우, 왜 그런지 안 보임’).
 * 단계마다 정산은 한 번뿐이라, ‘지난 운행’ = 같은 조건(모드·세팅 번호·시나리오 버전)으로 다시 한 게임(같은 조건 재도전·처음부터 다시)의 같은 단계.
 * 이미 계산된 숫자만 쓴다(새 시뮬레이션 없음): 최장 대기 · 목적지까지 못 간 이동 · 이번 단계 수지 · 기준을 채운 주요 인물 + 노선별 버스·정류장.
 * 저장: localStorage ethicity.publicness.stageRuns {v:1, runs:[{key,phase,runId,at,sum}]}(최근 MAX개) — 진행 저장본(ethicity.publicness.save)과 따로.
 *       게임 구분은 세션의 선택 필드 runId(예전 저장본엔 없음 → 처음 결과를 볼 때 붙인다). 같은 게임의 기록은 비교하지 않는다. */
(function (root) {
  'use strict';
  var KEY = 'ethicity.publicness.stageRuns', MAX = 40;
  function scenarioKey(s, version) { return [s.mode, s.seed, version || ''].join('|'); }
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
  // 결과 화면의 한 단계 요약. h = 그 단계 기록(history), draft = 출발한 계획(결과 화면에서는 아직 그대로)
  function summary(h, draft) {
    var m = h.metrics, rs = h.residents || {}, ids = Object.keys(rs).filter(function (id) { return rs[id]; });
    var routes = (draft && draft.routes || []).filter(function (r) { return r.nodes.length >= 2; }).map(function (r) {
      return { num: r.num, nodes: r.nodes.slice(), buses: draft.buses.filter(function (b) { return b.routeNum === r.num; }).length };
    });
    return { phase: h.phase, maxWait: m.maxWait, missed: m.N - m.arrived, N: m.N, arrived: m.arrived, total: m.costs.total,
      people: { ok: ids.filter(function (id) { return rs[id].satisfied; }).length, total: ids.length }, routes: routes };
  }
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
    var changes = planChanges(prev.routes || [], cur.routes || [], f).slice(0, 2);
    return { numbers: numbers, plan: changes.length ? '달라진 계획: ' + changes.join(' · ') : '계획은 지난번과 같아요.' };
  }
  function setKey(r) { return r.nodes.slice().sort().join(','); }
  function planChanges(prev, cur, f) {
    var out = [], restP = prev.slice(), restC = [];
    function bus(name, a, b) { if (a !== b) out.push(name + ' 버스 ' + a + '대 → ' + b + '대'); }
    // 같은 정류장들을 잇는 노선끼리(색이 달라도) → 같은 색끼리 → 남은 것
    cur.forEach(function (c) { var p = restP.filter(function (x) { return setKey(x) === setKey(c); })[0]; if (!p) { restC.push(c); return; } restP.splice(restP.indexOf(p), 1); bus(f.route(c.num), p.buses, c.buses); });
    restC.slice().forEach(function (c) {
      var p = restP.filter(function (x) { return x.num === c.num; })[0]; if (!p) return;
      restP.splice(restP.indexOf(p), 1); restC.splice(restC.indexOf(c), 1);
      var plus = c.nodes.filter(function (id, i) { return p.nodes.indexOf(id) < 0 && c.nodes.indexOf(id) === i; }), minus = p.nodes.filter(function (id, i) { return c.nodes.indexOf(id) < 0 && p.nodes.indexOf(id) === i; });
      if (plus.length) out.push(f.route(c.num) + '에 ' + plus.map(f.name).join('·') + ' 더함');
      if (minus.length) out.push(f.route(c.num) + '에서 ' + minus.map(f.name).join('·') + ' 뺌');
      if (!plus.length && !minus.length) out.push(f.route(c.num) + ' 정류장 순서 바꿈');
      bus(f.route(c.num), p.buses, c.buses);
    });
    restC.forEach(function (c) { out.push(f.route(c.num) + ' 새로 만듦(' + c.nodes.filter(function (id, i) { return c.nodes.indexOf(id) === i; }).map(f.name).join('–') + ', 버스 ' + c.buses + '대)'); });
    restP.forEach(function (p) { out.push(f.route(p.num) + '(' + p.nodes.filter(function (id, i) { return p.nodes.indexOf(id) === i; }).map(f.name).join('–') + ') 없앰'); });
    return out;
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
