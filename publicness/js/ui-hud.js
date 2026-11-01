/* 인물 HUD(2026-11-01 단계 전 설명 줄이기 B): 지도 위 칩 줄 [얼굴] 나래 09:03 외곽→병원 0/4 — 계획·운행 화면, 지도·텍스트 모드 모두.
 * 칩(또는 지도 얼굴)을 누르면 그 사람의 출발·도착 정류장 고리와 이어 주는 노선 경로를 굵게 깜빡여 보여 준다(없으면 굵은 점선 + ‘잇는 노선이 없어요’).
 * 남은 단계를 모두 해내도 학기 말 기준을 못 채우면 ‘기준 달성 불가’. 결과 화면 인물 카드의 작은 지도(miniMap)도 여기서 만든다.
 * 계산은 하지 않는다 — 기록(history)·초안·운행 계획을 읽어 화면에만 쓴다. */
(function (root) {
  'use strict';
  var PB = root.PB, SVG = 'http://www.w3.org/2000/svg';
  var SHORT = { A: '기차역', B: '주거지', C: '대학교', D: '병원', E: '시장', F: '외곽', G: '일자리', H: '운동장', I: '신도시', J: '터미널', K: '복지관', L: '호수공원', M: '솔잎몰', N: '대도시' };
  var picked = { key: null, id: null }, timer = null;
  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }
  function svg(t, a, parent) { var e = document.createElementNS(SVG, t); for (var k in a) e.setAttribute(k, a[k]); if (parent) parent.appendChild(e); return e; }
  function shortName(id) { return SHORT[id] || app().nodeName(id); }

  // 노선 위 a → b 구간(정류장 순서). 순환은 앞으로 돌고, 왕복은 앞뒤 어느 쪽이든
  function along(route, a, b) {
    var ns = route.nodes, loop = ns.length >= 4 && ns[0] === ns[ns.length - 1];
    if (loop) { var ring = ns.slice(0, -1), i = ring.indexOf(a), out = []; if (i < 0 || ring.indexOf(b) < 0) return null; for (var k = 0; k <= ring.length; k++) { var n = ring[(i + k) % ring.length]; out.push(n); if (n === b && k) return out; } return null; }
    var ia = ns.indexOf(a), ib = ns.indexOf(b); if (ia < 0 || ib < 0 || ia === ib) return null;
    return ia < ib ? ns.slice(ia, ib + 1) : ns.slice(ib, ia + 1).reverse();
  }
  function stopsAt(r, id) { return r.route.nodes.some(function (n, i) { return n === id && r.route.stops[i]; }); }
  // 출발 → 도착을 잇는 노선: 한 노선으로 바로, 아니면 두 노선이 모두 서는 정류장에서 한 번 갈아타기(엔진 규칙과 같은 한 번). routes = [{num, color, route}]
  function pathFor(routes, o, d) {
    var direct = routes.filter(function (r) { return stopsAt(r, o) && stopsAt(r, d); })[0];
    if (direct) return { legs: [{ num: direct.num, color: direct.color, nodes: along(direct.route, o, d) }], transfer: null };
    var best = null;
    routes.forEach(function (r1) {
      if (!stopsAt(r1, o)) return;
      routes.forEach(function (r2) {
        if (r2 === r1 || !stopsAt(r2, d)) return;
        r1.route.nodes.forEach(function (x, i) {
          if (!r1.route.stops[i] || x === o || x === d || !stopsAt(r2, x)) return;
          var a = along(r1.route, o, x), b = along(r2.route, x, d); if (!a || !b) return;
          var len = a.length + b.length; if (!best || len < best.len) best = { len: len, legs: [{ num: r1.num, color: r1.color, nodes: a }, { num: r2.num, color: r2.color, nodes: b }], transfer: x };
        });
      });
    });
    return best ? { legs: best.legs, transfer: best.transfer } : null;
  }
  // 지금 화면의 운행 노선(버스가 있는 것만): 계획 = 초안, 운행·결과 = 출발한 계획
  function routesNow() {
    var A = app(), s = A.s;
    if ((s.stage === 'run' || s.stage === 'result') && s.current) {
      var seen = {}, out = [];
      s.current.plan.buses.forEach(function (b) { if (!b.route) return; var num = A.numForPlanRoute(b.route); if (seen[num]) return; seen[num] = true; out.push({ num: num, color: A.routeStyle(num).color, route: b.route }); });
      return out;
    }
    return A.stageRoutes().filter(function (r) { return r.buses > 0; });
  }
  function residentsNow() { var s = app().s; return PB.Demand.residents(s.config, s.phase); }
  function tally() { var s = app().s; return PB.Narrative.residentTally(s.config, s.history); }

  // 칩 한 줄(형식은 지시서대로) + 화면 낭독용 긴 설명
  function chip(rd, t) {
    var A = app(), st = PB.Narrative.criterionState(t), b = el('button', { type: 'button', 'class': 'person-chip' + (st === 'impossible' ? ' impossible' : st === 'done' ? ' done' : ''), id: 'person-chip-' + rd.id, 'data-resident': rd.id });
    var face = el('span', { 'class': 'person-chip-face resident-face ' + rd.id, 'aria-hidden': 'true' }); face.appendChild(el('img', { src: 'assets/art/portrait-' + rd.id + '-calm.webp', alt: '' })); b.appendChild(face);
    b.appendChild(el('b', null, rd.name));
    b.appendChild(el('span', { 'class': 'person-chip-time' }, A.clock(rd.depart)));
    b.appendChild(el('span', { 'class': 'person-chip-trip' }, shortName(rd.o) + '→' + shortName(rd.d)));
    if (t) b.appendChild(el('span', { 'class': 'person-chip-count' }, t.completed + '/' + t.threshold));
    if (st === 'impossible') b.appendChild(el('span', { 'class': 'person-chip-flag' }, '기준 달성 불가'));
    var label = rd.name + ' · ' + A.clock(rd.depart) + ' ' + A.nodeName(rd.o) + '에서 ' + A.nodeName(rd.d) + '까지' + (t ? ' · 학기 누적 ' + t.completed + '/' + t.threshold + '회' : '') +
      (st === 'impossible' ? ' · 남은 단계로는 기준 달성 불가' : st === 'done' ? ' · 기준 달성' : '') + ' · 누르면 지도에 경로를 보여 줘요';
    b.setAttribute('aria-label', label); b.title = label;
    b.setAttribute('aria-pressed', String(picked.id === rd.id && picked.key === key()));
    b.addEventListener('click', function () { toggle(rd.id); });
    return b;
  }
  function key() { var s = app().s; return s ? s.phase + ':' + s.seed : null; }

  /* P1-3(2026-11-02) 운행 중 칩을 실시간으로: 학기 누적 = 지난 단계 판정(residentTally) + 오늘 다음 이동이 도착한 순간 오늘 판정(ResidentEvaluation.records의
   * satisfied — 결과 화면·학기 누적과 같은 함수)이 통과면 +1. 칩 끝에 짧은 상태(가는 길 ✓ · 돌아오는 길 대기 중 / 오늘 기준 초과 / 왕복 완료) */
  var liveCache = null;
  function live(res, tf) {
    var A = app(), s = A.s; if (!s || !res || document.body.dataset.screen !== 'run') return;
    if (!liveCache || liveCache.res !== res) {
      var over = {}; (PB.RunPace ? PB.RunPace.residentStops(res, s.config) : []).forEach(function (n) { if (n.what === 'over' && over[n.resident] == null) over[n.resident] = n.t; });
      liveCache = { res: res, recs: PB.ResidentEvaluation.records(s.config, s.phase, res), over: over, t: tally() };
    }
    var c = liveCache;
    residentsNow().forEach(function (rd) {
      var b = document.querySelector('#person-chip-' + rd.id); if (!b) return;
      var mine = res.passengers.filter(function (p) { return p.residentId === rd.id; }), out = mine.filter(function (p) { return p.leg === 'outbound'; })[0], back = mine.filter(function (p) { return p.leg === 'return'; })[0];
      var rec = c.recs[rd.id], t = c.t[rd.id], done = !!(back && back.status === 'arrived' && back.arriveT <= tf), outDone = !!(out && out.status === 'arrived' && out.arriveT <= tf);
      var gained = done && rec && rec.satisfied ? 1 : 0, text = '';
      var onBus = function (p) { return p && p.firstBoardT != null && p.firstBoardT <= tf; };
      if ((c.over[rd.id] != null && tf >= c.over[rd.id]) || (done && rec && !rec.satisfied)) text = '오늘 기준 초과';
      else if (done) text = '왕복 완료 ✓';
      else if (outDone) text = '가는 길 ✓ · ' + (!back || tf < back.t ? '볼일 중' : '돌아오는 길 ' + (onBus(back) ? '버스 안' : '대기 중'));
      else if (out && tf >= out.t) text = '가는 길 ' + (onBus(out) ? '버스 안' : '대기 중');
      var cnt = b.querySelector('.person-chip-count'); if (cnt && t) { var v = (t.completed + gained) + '/' + t.threshold; if (cnt.textContent !== v) cnt.textContent = v; }
      var lv = b.querySelector('.person-chip-live'); if (!lv) { lv = el('span', { 'class': 'person-chip-live' }); b.appendChild(lv); }
      if (lv.textContent !== text) lv.textContent = text; lv.hidden = !text; lv.classList.toggle('bad', text === '오늘 기준 초과'); lv.classList.toggle('good', text === '왕복 완료 ✓');
      b.dataset.live = text; b.title = b.getAttribute('aria-label') + (text ? ' · 지금: ' + text : '');
    });
  }

  function render(A) {
    var s = A.s, screen = document.body.dataset.screen, hud = document.querySelector('#people-hud');
    if (!s || (screen !== 'plan' && screen !== 'run')) { if (hud) hud.hidden = true; clearPath(); return; }
    if (picked.key && picked.key !== key()) { picked = { key: null, id: null }; clearPath(); setTimeout(syncPressed, 0); }
    if (!hud) { hud = el('div', { id: 'people-hud', 'class': 'people-hud', role: 'group', 'aria-label': '오늘 지켜볼 사람' }); var stage = document.querySelector('#stage'); stage.parentNode.insertBefore(hud, stage); }
    hud.hidden = false; hud.textContent = '';
    var goal = (s.choices || {})[s.phase - 1];
    if (goal) hud.appendChild(el('p', { id: 'hud-goal', 'class': 'hud-goal' }, '이번 목표: ' + PB.Session.CHOICES[goal]));
    var row = el('div', { 'class': 'people-hud-row' }), t = tally();
    residentsNow().forEach(function (rd) { row.appendChild(chip(rd, t[rd.id])); });
    hud.appendChild(row);
    // 운행 화면으로 바로 들어온 경우(새로고침 이어보기) 지도 얼굴층이 없으면 만든다
    var mp = document.querySelector('#map-people');
    if (screen === 'run' && PB.UI.mapPeople && (!mp || mp.dataset.phase !== String(s.phase))) PB.UI.mapPeople(A);
    if (picked.id) drawPath();
    if (screen === 'run' && PB.UI.runState) { var rs = PB.UI.runState(); if (rs && s.current) live(s.current.result, rs.tf); }
  }

  function toggle(id) {
    var A = app(), s = A.s; if (!s) return;
    if (picked.id === id && picked.key === key()) { picked = { key: null, id: null }; clearPath(); syncPressed(); return; }
    picked = { key: key(), id: id }; drawPath(true); syncPressed();
    if (PB.Minimal && PB.Minimal.tip) PB.Minimal.tip('wait');
  }
  function syncPressed() {
    document.querySelectorAll('#people-hud .person-chip').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.resident === picked.id)); });
    document.querySelectorAll('#map-people .map-person').forEach(function (b) { b.setAttribute('aria-pressed', String(b.id === 'resident-map-' + picked.id)); });
  }
  function clearPath() { var o = document.querySelector('#person-path'); if (o) o.remove(); clearInterval(timer); timer = null; }
  // 굵은 경로(노선 색 + 흰 테두리) + 출발·도착 고리. 카메라가 움직여도 따라가도록 짧은 간격으로 다시 그린다(고른 동안만)
  function drawPath(announce) {
    var A = app(), s = A.s, stage = document.querySelector('#stage'), screen = document.body.dataset.screen;
    if (!picked.id || !s || (screen !== 'plan' && screen !== 'run')) { clearPath(); return; }
    var rd = residentsNow().filter(function (r) { return r.id === picked.id; })[0]; if (!rd) { clearPath(); return; }
    var box = stage.getBoundingClientRect(), o = document.querySelector('#person-path');
    if (!o) { o = svg('svg', { id: 'person-path', 'aria-hidden': 'true', 'class': 'person-path' + (A.reducedMotion() ? ' still' : '') }); stage.appendChild(o); }
    o.textContent = ''; o.setAttribute('width', box.width); o.setAttribute('height', box.height);
    var P = function (id) { var n = A.nodeXY(id); return A.view.project(n.x, n.y); }, path = pathFor(routesNow(), rd.o, rd.d);
    if (path) path.legs.forEach(function (leg) {
      var pts = leg.nodes.map(function (id) { var p = P(id); return p.left + ',' + p.top; }).join(' ');
      svg('polyline', { points: pts, 'class': 'pp-casing' }, o); svg('polyline', { points: pts, 'class': 'pp-line', stroke: leg.color }, o);
    });
    else { var a = P(rd.o), b = P(rd.d); svg('line', { x1: a.left, y1: a.top, x2: b.left, y2: b.top, 'class': 'pp-missing' }, o); }
    [rd.o, rd.d].forEach(function (id, i) { var p = P(id); svg('circle', { cx: p.left, cy: p.top, r: 17, 'class': 'pp-ring ' + (i ? 'to' : 'from') }, o); });
    if (!timer) timer = setInterval(function () { if (!document.querySelector('#person-path')) { clearInterval(timer); timer = null; return; } drawPath(false); }, 400);
    if (announce) A.toast(rd.name + ' · ' + A.nodeName(rd.o) + '에서 ' + A.nodeName(rd.d) + '까지 · ' + (path ? path.legs.map(function (l) { return l.num + '번'; }).join('에서 ') + (path.transfer ? '(' + A.nodeName(path.transfer) + '에서 갈아타기)' : '') + ' 노선으로 이어져요' : '잇는 노선이 없어요'), { ms: 3200 });
  }

  // 결과 화면 인물 카드의 작은 지도: 이번 단계 정류장·운행 노선(옅게) + 그 사람의 문제 구간(굵게, 깜빡임)
  // focus = {o, d, legs:[{nodes, color}] | null(잇는 노선 없음)}
  function miniMap(s, routes, focus) {
    var A = app(), ids = PB.Session.graph(s).nodes, nodes = {}, xs = [], ys = [];
    ids.forEach(function (id) { var n = A.nodeXY(id); nodes[id] = n; xs.push(n.x); ys.push(n.y); });
    var minX = Math.min.apply(null, xs) - 0.9, maxX = Math.max.apply(null, xs) + 0.9, minY = Math.min.apply(null, ys) - 0.9, maxY = Math.max.apply(null, ys) + 0.9;
    var m = svg('svg', { 'class': 'mini-map' + (A.reducedMotion() ? ' still' : ''), viewBox: minX + ' ' + minY + ' ' + (maxX - minX) + ' ' + (maxY - minY), role: 'img' });
    routes.forEach(function (r) { svg('polyline', { points: r.route.nodes.map(function (id) { return nodes[id] ? nodes[id].x + ',' + nodes[id].y : ''; }).join(' '), 'class': 'mm-route', stroke: r.color }, m); });
    if (focus.legs) focus.legs.forEach(function (l) { var pts = l.nodes.map(function (id) { return nodes[id].x + ',' + nodes[id].y; }).join(' '); svg('polyline', { points: pts, 'class': 'mm-casing' }, m); svg('polyline', { points: pts, 'class': 'mm-focus', stroke: l.color }, m); });
    else if (nodes[focus.o] && nodes[focus.d]) svg('line', { x1: nodes[focus.o].x, y1: nodes[focus.o].y, x2: nodes[focus.d].x, y2: nodes[focus.d].y, 'class': 'mm-missing' }, m);
    ids.forEach(function (id) { var n = nodes[id], key = id === focus.o || id === focus.d; svg('circle', { cx: n.x, cy: n.y, r: key ? 0.32 : 0.18, 'class': key ? 'mm-stop key' : 'mm-stop' }, m);
      if (key) { var t = svg('text', { x: n.x, y: n.y - 0.48, 'text-anchor': 'middle', 'class': 'mm-label' }, m); t.textContent = A.nodeName(id); } });
    return m;
  }

  root.addEventListener('resize', function () { if (picked.id) drawPath(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && picked.id && !document.querySelector('dialog[open]')) { picked = { key: null, id: null }; clearPath(); syncPressed(); } });
  PB.Hud = { layout: function () { if (picked.id && document.querySelector('#person-path')) drawPath(false); }, render: render, live: live, toggle: toggle, pathFor: pathFor, along: along, routesNow: routesNow, miniMap: miniMap, shortName: shortName, selected: function () { return picked.id; } };
})(window);
