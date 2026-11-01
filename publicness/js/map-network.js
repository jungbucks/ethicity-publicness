/* 지도 네트워크·상태층(2026-10-27 시각 위계 정리) — 2D·3D 공통 SVG/DOM 오버레이.
 * 배경층(3D 캔버스·2D 지형)은 그림으로 두고, 그 위에 이 층이 노선·정류장 마커·노선 번호 원·이름표·대기 인원을 한 체계로 그린다.
 *  · 노선: 흰 테두리(casing) + 노선색, 같은 구간은 차선 간격으로 나란히(뷰의 laneOffset — 지도 클릭 판정과 같은 위치). 선택 노선은 굵게+빛, 다른 노선은 흐리게 하지 않는다
 *  · 정류장: 흰 원 하나 + 그곳에 서는 노선 색 작은 눈금. 노선은 이 마커에서 만난다
 *  · 노선 끝: 번호 원(시작 쪽은 옆에 운행 버스 수)
 *  · 이름표: 한 스타일(흰 pill), 기본은 마커 아래. 운행·결과에서는 대기 인원 pill ‘👤 N’을 이름표 오른쪽에(주의 주황·위험 빨강)
 *  · 겹침 피하기: 마커·번호 원·이름표를 차례로 놓으며 빈 자리를 고른다. rects()로 다른 층(인물 얼굴·버스 손잡이)도 피할 수 있게 내보낸다
 * 클릭은 아래 지도가 받는다(이 층은 pointer-events: none). 좌표는 뷰의 project(지도 좌표 → 무대 px). */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  function svgEl(tag, attrs, parent) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; }
  function lum(hex) { var n = parseInt(hex.replace('#', ''), 16), c = [n >> 16 & 255, n >> 8 & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
  function area(a, b) { return Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)); }
  function overlap(a, b) { return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h; }
  // 선분(굵기 반 pad만큼 넓힘)이 사각형을 지나는가(Liang–Barsky)
  function segHits(s, r, pad) {
    var x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad, dx = s.x2 - s.x1, dy = s.y2 - s.y1, t0 = 0, t1 = 1;
    var p = [-dx, dx, -dy, dy], q = [s.x1 - x0, x1 - s.x1, s.y1 - y0, y1 - s.y1];
    for (var i = 0; i < 4; i++) { if (p[i] === 0) { if (q[i] < 0) return false; } else { var t = q[i] / p[i]; if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; } else { if (t < t0) return false; if (t < t1) t1 = t; } } }
    return true;
  }

  function create(stage, getView, opts) {
    var layer = document.createElement('div'); layer.id = 'net-layer'; layer.setAttribute('aria-hidden', 'true');
    // Separate ground markings from status markers: routes must not cover alerts.
    var routeSvg = svgEl('svg', { 'class': 'net-svg net-route-svg' }); layer.appendChild(routeSvg);
    var svg = svgEl('svg', { 'class': 'net-svg net-status-svg' }); layer.appendChild(svg);
    var labels = document.createElement('div'); labels.className = 'net-labels'; layer.appendChild(labels);
    stage.appendChild(layer);
    var st = { nodes: {}, routes: [], waiting: {}, selected: [], selectable: [], show: true, faces: [], newNodes: [], newAt: 0 }, placed = [], flashT = {}, facePos = {};

    function project(x, y) { var v = getView(); return v.project(x, y); }
    function lanePoint(a, b, num, f) {
      var v = getView(), o = v.laneOffset ? v.laneOffset(a.id, b.id, num) : { dx: 0, dy: 0 };
      return (v.projectRoad || v.project)(a.x + (b.x - a.x) * f + o.dx / 110, a.y + (b.y - a.y) * f + o.dy / 110);
    }
    function draw() {
      routeSvg.textContent = ''; svg.textContent = ''; labels.textContent = ''; placed = [];
      if (!st.show || !getView()) return;
      var T = opts.tokens(), box = stage.getBoundingClientRect(), narrow = box.width <= 520;
      svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
      routeSvg.setAttribute('width', box.width); routeSvg.setAttribute('height', box.height);
      // 지도 위 시계·운행 조작(opts.reserved)도 빈자리 찾기에서 막힌 곳으로 — 얼굴·이름표가 그 밑에 깔리지 않게
      (opts.reserved ? opts.reserved() : []).forEach(function (r) { placed.push({ x: r.left - box.left - 4, y: r.top - box.top - 4, w: r.width + 8, h: r.height + 8, kind: 'hud' }); });
      var gLead, gCase = svgEl('g', { 'class': 'net-casing' }, routeSvg), gLine = svgEl('g', { 'class': 'net-lines' }, routeSvg), gStop = svgEl('g', { 'class': 'net-stops' }, svg), gCap = svgEl('g', { 'class': 'net-caps' }, svg); gLead = svgEl('g', { 'class': 'net-leaders' }, svg);
      var at = {}, segs = []; // 정류장별 서는 노선 색, 이름표가 피할 노선 선
      st.routes.forEach(function (r) {
        var ns = r.route.nodes, w = r.active ? Math.min(T.lineActive, 6) : Math.min(T.line, 4), casing = Math.min(T.casing, 1), dash = r.preview ? '10 7' : null;
        for (var i = 1; i < ns.length; i++) {
          var a = st.nodes[ns[i - 1]], b = st.nodes[ns[i]]; if (!a || !b) continue;
          var p = lanePoint(a, b, r.num, 0), q = lanePoint(a, b, r.num, 1);
          if (!r.preview) { svgEl('line', { x1: p.left, y1: p.top, x2: q.left, y2: q.top, 'stroke-width': w + casing * 2 }, gCase); segs.push({ x1: p.left, y1: p.top, x2: q.left, y2: q.top, pad: w / 2 + casing }); }
          var ln = svgEl('line', { x1: p.left, y1: p.top, x2: q.left, y2: q.top, stroke: r.color, 'stroke-width': r.preview ? T.line * 0.6 : w, 'data-route': r.num }, gLine);
          if (dash) ln.setAttribute('stroke-dasharray', dash);
          if (r.active) ln.setAttribute('class', 'active');
          if (!r.preview && r.kind === 'express') svgEl('line', { x1: p.left, y1: p.top, x2: q.left, y2: q.top, 'class': 'express-stripe', 'stroke-width': Math.max(2, w * 0.3) }, gLine);
          if (!r.preview && r.kind === 'regional') { ln.setAttribute('stroke-width', w + 3); svgEl('line', { x1: p.left, y1: p.top, x2: q.left, y2: q.top, 'class': 'regional-stripe', 'stroke-width': Math.max(1.5, w * 0.22) }, gLine); }
        }
        if (!r.preview) ns.forEach(function (id, i) { if (r.route.stops[i] && st.nodes[id]) (at[id] = at[id] || []).indexOf(r.color) < 0 && at[id].push(r.color); });
      });
      // 정류장 마커
      Object.keys(st.nodes).forEach(function (id) {
        var n = st.nodes[id], p = project(n.x, n.y), sel = st.selected.indexOf(id) >= 0, can = !st.selectable.length || st.selectable.indexOf(id) >= 0 || sel;
        var g = svgEl('g', { 'class': 'net-stop' + (sel ? ' selected' : '') + (can ? '' : ' muted') + (flashT[id] && performance.now() - flashT[id] < 900 ? ' flash' : ''), 'data-node': id }, gStop);
        // 이번 단계에 새로 생긴 정류장(2026-11-01): 처음 2.6초 강조 고리(지도 배너와 함께), 이름표엔 ‘새 정류장’ 배지
        if (st.newNodes.indexOf(id) >= 0 && performance.now() - st.newAt < 2600) svgEl('circle', { 'class': 'new-ring', cx: p.left, cy: p.top, r: T.stop + 10 }, g);
        svgEl('circle', { cx: p.left, cy: p.top, r: T.stop }, g);
        (at[id] || []).forEach(function (c, k, all) {
          var ang = -Math.PI / 2 + (k - (all.length - 1) / 2) * 0.62, R = T.stop + 3.5;
          svgEl('circle', { 'class': 'tick', cx: p.left + Math.cos(ang) * R, cy: p.top + Math.sin(ang) * R, r: 3.2, fill: c }, g);
        });
        var reserve=T.stop+7,session=root.PB.App&&root.PB.App.s;
        if(root.MINIMAL_UI&&!document.body.classList.contains('minimal-text')&&session&&session.config.finance.service.stops.some(function(c){return c.id===id&&c.fromPhase<=session.phase;}))reserve=Math.max(reserve,34);
        placed.push({ x: p.left - reserve, y: p.top - reserve, w: reserve * 2, h: reserve * 2, kind: 'stop', id: id });
      });
      // 노선 끝 번호 원(정류장 바깥쪽으로 비켜). 시작 쪽 옆에 운행 버스 수
      var caps = [];
      st.routes.forEach(function (r) {
        if (r.preview) return;
        var ns = r.route.nodes, loop = ns.length >= 4 && ns[0] === ns[ns.length - 1];
        (loop ? [0] : [0, ns.length - 1]).forEach(function (idx) {
          var a = st.nodes[ns[idx]], b = st.nodes[ns[idx === 0 ? 1 : idx - 1]]; if (!a || !b) return;
          var p = lanePoint(a, b, r.num, 0), q = lanePoint(a, b, r.num, 1), dx = p.left - q.left, dy = p.top - q.top, l = Math.hypot(dx, dy) || 1;
          var c = { x: p.left + dx / l * (T.stop + T.cap + 6), y: p.top + dy / l * (T.stop + T.cap + 6) };
          caps.push({ num: r.num, start: idx === 0, x: c.x, y: c.y, px: p.left, py: p.top, color: r.color, buses: r.buses });
        });
      });
      caps.forEach(function (c) {
        var g = c.g = svgEl('g', { 'class': 'net-cap', 'data-route': c.num, 'data-end': c.start ? 'start' : 'end' }, gCap);
        svgEl('circle', { cx: c.x, cy: c.y, r: T.cap, fill: c.color }, g);
        var t = svgEl('text', { x: c.x, y: c.y + 4, 'text-anchor': 'middle', fill: lum(c.color) > 0.35 ? '#1A1D24' : '#FFFFFF' }, g); t.textContent = String(c.num);
        var w = T.cap * 2;
        var s = null; if (c.start && c.buses != null) { s = svgEl('text', { 'class': 'cap-count', x: c.x + T.cap + 3, y: c.y + 4 }, g); s.textContent = String(c.buses); w += 12; }
        // 시작 쪽은 예전에 계획 화면의 노선 손잡이(번호 원 24px + 버스 수 pill)가 그 위에 놓였어서 그 크기(56×30)만큼 비워 뒀다. 지금 손잡이는 선 옆 빈자리로 가므로(ui-map-plan positionBadges)
        // 좁은 지도(≤ 520px)에서는 실제 그린 크기(번호 원 + 버스 수 글자)만 막는다 — 남는 56px 칸 때문에 이름표·손잡이가 갈 바로 옆 자리가 없어지던 것(2026-11-01). 넓은 지도는 그대로
        if (c.start && c.buses != null && s) w = T.cap + 3 + s.getComputedTextLength() + T.cap + 1;
        placed.push(c.q = c.start && !narrow ? { x: c.x - 16, y: c.y - 15, w: 56, h: 30, kind: 'cap', route: c.num, start: true } : { x: c.x - T.cap - 2, y: c.y - T.cap - 2, w: w + 4, h: T.cap * 2 + 4, kind: 'cap', route: c.num, start: c.start });
      });
      st.caps = caps;
      /* 이름표(+대기 pill) — 2026-11-01 플레이테스트 수정. 390px 지도에서 빈자리를 못 찾으면 78px+이름표 폭까지 멀리 가서(다른 정류장 옆)
       * 엉뚱한 정류장 이름처럼 보였고(병원 이름표가 대학교 옆 등), 노선을 바꿀 때마다 자리가 좌우로 튀었다. 그래서
       *  ① 정류장마다 기본 방향을 노선과 무관하게 정한다 — 정류장 배치만 보고, 이웃 정류장 마커에서 가장 먼 쪽(아래 → 오른쪽 → 왼쪽 → 위 순으로 비교, 4px 넘게 나아야 바꿈)
       *  ② 기본 자리가 겹칠 때만(다른 이름표·마커·번호 원·시계 묶음, 그다음 노선 선) 가까운 다른 자리로 — 바로 옆 4방향·대각 4방향, 조금 더 떨어진 4방향(최대 +24px)까지만
       *  ③ 그래도 없으면 그 가까운 자리 중 가장 덜 겹치는 곳(이름표·정류장과의 겹침이 가장 나쁨). 멀리 있는 다른 정류장 옆으로는 가지 않는다
       *  ④ 이름표와 정류장 마커 사이에는 늘 짧은 연결선
       * 이름표는 인물 얼굴보다 먼저 자리를 잡는다(얼굴이 이름표를 피함). 좌표는 뷰의 project = 무대 CSS px(3D 캔버스는 devicePixelRatio 배율 버퍼를
       * CSS 크기로 늘려 그리므로 같은 좌표계)이고, 무대 크기가 바뀌면(ResizeObserver·창 크기 변경) 다시 배치한다 */
      /* 간판형(2026-11-01 사용자 선택 A, 좁은 지도 ≤ 520px): 이름표를 정류장(건물) 바로 옆에 붙인다 — 짧은 이름(config short), 연결선 없음,
       * 더 떨어진 자리(+12·+24px) 후보 없음. 안 겹치는 바로 옆 자리가 없으면 바로 옆 자리 중 가장 덜 겹치는 곳 */
      var ids = Object.keys(st.nodes), P = {}, L = {}, DIRS = ['S', 'E', 'W', 'N'];
      function inBox(r) { return r.x >= 2 && r.y >= 2 && r.x + r.w <= box.width - 2 && r.y + r.h <= box.height - 2; }
      ids.forEach(function (id) {
        var n = st.nodes[id], el = document.createElement('div'), wait = st.waiting[id] || 0;
        P[id] = project(n.x, n.y);
        el.className = 'net-label'; el.dataset.node = id;
        el.appendChild(document.createElement('span')).textContent = narrow && n.short ? n.short : n.name;
        if (narrow && n.short) { el.title = n.name; el.setAttribute('aria-label', n.name); }
        if (st.newNodes.indexOf(id) >= 0) { var nb = document.createElement('span'); nb.className = 'net-new'; nb.textContent = '새 정류장'; el.appendChild(nb); el.classList.add('is-new'); }
        if (st.showWait && wait > 0) {
          var w = document.createElement('span'); w.className = 'net-wait' + (wait >= T.waitDanger ? ' danger' : wait >= T.waitCaution ? ' caution' : '');
          w.textContent = '👤 ' + wait; w.title = n.name + ' 대기 ' + wait + '명'; el.appendChild(w); el.dataset.wait = wait;
        }
        labels.appendChild(el);
        var own = placed.filter(function (q) { return q.kind === 'stop' && q.id === id; })[0];
        L[id] = { el: el, w: el.offsetWidth, h: el.offsetHeight, gap: (own ? own.w / 2 : T.stop + 7) - 2 };
      });
      function slot(id, dir, extra) {
        var p = P[id], w = L[id].w, h = L[id].h, g = L[id].gap + (extra || 0), d = g * 0.72, r;
        if (dir === 'S') r = { x: p.left - w / 2, y: p.top + g }; else if (dir === 'E') r = { x: p.left + g, y: p.top - h / 2 };
        else if (dir === 'W') r = { x: p.left - g - w, y: p.top - h / 2 }; else if (dir === 'N') r = { x: p.left - w / 2, y: p.top - g - h };
        else if (dir === 'SE') r = { x: p.left + d, y: p.top + d }; else if (dir === 'SW') r = { x: p.left - d - w, y: p.top + d };
        else if (dir === 'NE') r = { x: p.left + d, y: p.top - d - h }; else r = { x: p.left - d - w, y: p.top - d - h };
        return { x: Math.round(r.x), y: Math.round(r.y), w: w, h: h, dir: dir };
      }
      function clearance(id, r) { var m = 60; ids.forEach(function (o) { if (o === id) return; var q = P[o], dx = Math.max(r.x - q.left, 0, q.left - (r.x + r.w)), dy = Math.max(r.y - q.top, 0, q.top - (r.y + r.h)); m = Math.min(m, Math.hypot(dx, dy)); }); return m; }
      ids.forEach(function (id) { var best = 'S', bs = -Infinity; DIRS.forEach(function (d) { var r = slot(id, d), c = clearance(id, r) - (inBox(r) ? 0 : 1000); if (c > bs + 4) { bs = c; best = d; } }); L[id].dir = best; });
      /* 끝내 빈자리가 없을 때: 다른 이름표를 덮는 것은 거의 마지막(1000) — 번호 원은 아래에서 이름표를 피해 옮겨 갈 수 있다 */
      var WEIGHT = { label: 1000, stop: 4, face: 2, cap: 2, hud: 0.2 };
      /* 정류장 칸(q)은 여백까지 넓게 잡혀 있다 — 마커 원 자체(가운데 ± stop+4)를 덮는 넓이는 따로 무겁게(60) 친다(덮을 바엔 여백을 덮게) */
      function core(r, q) { if (q.kind !== 'stop') return 0; var m = T.stop + 4, cx = q.x + q.w / 2, cy = q.y + q.h / 2; return area(r, { x: cx - m, y: cy - m, w: m * 2, h: m * 2 }) * 60; }
      function lines(r) { return segs.some(function (s) { return segHits(s, r, s.pad); }); }
      var res = {};
      ids.forEach(function (id) {
        var lab = L[id], order = [lab.dir].concat(DIRS.filter(function (d) { return d !== lab.dir; })), cands = [];
        order.forEach(function (d) { cands.push(slot(id, d, 0)); }); ['SE', 'SW', 'NE', 'NW'].forEach(function (d) { cands.push(slot(id, d, 0)); });
        /* 위·아래 자리를 옆으로 민 것(2026-11-01): 가운데 맞춤 대신 이름표 한쪽 끝이 정류장 마커 위·아래에 걸치게 — 여전히 정류장에 붙은 간판. 대기 pill로 넓어진 이름표가 이웃 마커를 덮던 것 */
        if (narrow) ['N', 'S'].forEach(function (d) { var r0 = slot(id, d, 0); [-1, 1].forEach(function (k) { cands.push({ x: Math.round(k < 0 ? P[id].left + 14 - r0.w : P[id].left - 14), y: r0.y, w: r0.w, h: r0.h, dir: d + (k < 0 ? '-L' : '-R') }); }); });
        if (!narrow) [12, 24].forEach(function (e) { order.forEach(function (d) { cands.push(slot(id, d, e)); }); });
        var inside = cands.filter(inBox); if (!inside.length) inside = [cands[0]].map(function (r) { return { x: Math.min(Math.max(2, r.x), box.width - r.w - 2), y: Math.min(Math.max(2, r.y), box.height - r.h - 2), w: r.w, h: r.h, dir: r.dir }; });
        function others(q) { return !(q.kind === 'stop' && q.id === id); }
        function hits(r, hud) { return placed.some(function (q) { return others(q) && (hud || q.kind !== 'hud') && overlap(r, q); }); }
        var best = null;
        // 0) 기본 자리가 다른 것과 안 겹치면 그대로(노선 선이 지나가도 — 노선을 바꿀 때마다 튀지 않게) 1) 옮길 때는 노선 선까지 피함 2) 선은 허용 3) 시계·조작 묶음 가장자리도 허용
        if (inside[0].dir === lab.dir && inBox(inside[0]) && !hits(inside[0], false)) best = inside[0];
        else [[true, false], [false, false], [false, true]].some(function (pass) { return inside.some(function (r) { if (hits(r, pass[1]) || (pass[0] && lines(r))) return false; best = r; return true; }); });
        if (!best) best = inside.reduce(function (acc, r) {
          var sc = placed.reduce(function (sum, q) { if (!others(q)) return sum; return sum + area(r, q) * (WEIGHT[q.kind] || 1) + core(r, q); }, 0) + (lines(r) ? 40 : 0);
          return !acc || sc < acc.sc ? { r: r, sc: sc } : acc;
        }, null).r;
        var q = { x: best.x, y: best.y, w: best.w, h: best.h, kind: 'label', id: id };
        placed.push(q); res[id] = { r: best, q: q, inside: inside };
      });
      /* 겹친 채 남은 이름표 고치기(2026-11-01 — 좁은 운행 화면에서 대기 pill이 붙어 넓어진 병원·신도시 이름표가 서로 덮음).
       * 그 이름표의 바로 옆 자리 중 겹치는 것이 다른 이름표 하나뿐인 곳이 있으면, 그 이름표를 제 정류장의 다른 바로 옆 자리로 옮겨 본다
       * (옮긴 자리에서 또 이름표 하나와만 겹치면 한 번 더, 최대 두 단계). 노선 선을 덮지 않는 해법을 먼저 찾는다. 모든 이름표는 계속 제 정류장 바로 옆 */
      function settle(id, skip, keep, depth, avoidLines, soft) {
        var list = res[id].inside;
        for (var i = 0; i < list.length; i++) {
          var r = list[i];
          if (!inBox(r) || (avoidLines && lines(r)) || keep.some(function (k) { return overlap(r, k); })) continue;
          var bad = placed.filter(function (q) { return skip.indexOf(q) < 0 && q.kind !== 'hud' && !(q.kind === 'stop' && q.id === id) && overlap(r, q) && !(soft && (q.kind === 'cap' || (q.kind === 'stop' && !core(r, q)))); });
          if (!bad.length) return [[id, r]];
          if (depth > 0 && bad.length === 1 && bad[0].kind === 'label') { var sub = settle(bad[0].id, skip.concat([bad[0]]), keep.concat([r]), depth - 1, avoidLines, soft); if (sub) return [[id, r]].concat(sub); }
        }
        return null;
      }
      // 한 이름표를 고치면 다른 이름표 둘레에 자리가 생길 수 있어 바뀐 것이 없을 때까지(최대 3바퀴) 다시 훑는다
      function repairLabels() { for (var round = 0, moved = true; moved && round < 3; round++) {
        moved = false;
        ids.forEach(function (id) {
          var me = res[id];
          var on = placed.filter(function (q) { return q !== me.q && q.kind !== 'hud' && !(q.kind === 'stop' && q.id === id) && overlap(me.r, q); });
          if (!on.length) return;
          /* 다른 이름표나 정류장 마커 자체를 덮고 있으면, 빈자리가 끝내 없을 때 정류장 여백·번호 원(뒤에서 비켜 감)은 덮어도 되는 자리까지(soft) 찾는다 */
          var hard = on.some(function (q) { return q.kind === 'label' || core(me.r, q); });
          var plan = settle(id, [me.q], [], 2, true) || settle(id, [me.q], [], 2, false) || (hard && (settle(id, [me.q], [], 2, true, true) || settle(id, [me.q], [], 2, false, true)));
          if (plan) { moved = true; plan.forEach(function (m) { var o = res[m[0]], r = m[1]; o.r = r; o.q.x = r.x; o.q.y = r.y; o.q.w = r.w; o.q.h = r.h; }); }
        });
      } }
      /* 번호 원이 이름표에 덮이면(2026-11-01 — 이름표는 제 정류장 바로 옆을 지킨다) 번호 원을 같은 노선 끝 정류장 둘레로 조금씩 돌려
       * 이름표·다른 번호 원·정류장 마커와 안 겹치는 곳으로 옮긴다(가까운 각도부터). 없으면 그대로 */
      function fixCaps() { caps.forEach(function (c) {
        if (!placed.some(function (q) { return q.kind === 'label' && overlap(c.q, q); })) return;
        var R = Math.hypot(c.x - c.px, c.y - c.py), a0 = Math.atan2(c.y - c.py, c.x - c.px), ox = c.q.x - c.x, oy = c.q.y - c.y;
        [0, 8].some(function (more) { return [25, -25, 50, -50, 75, -75, 100, -100, 130, -130, 180].some(function (deg) {
          var a = a0 + deg * Math.PI / 180, x = c.px + Math.cos(a) * (R + more), y = c.py + Math.sin(a) * (R + more), r = { x: x + ox, y: y + oy, w: c.q.w, h: c.q.h };
          if (!inBox(r) || placed.some(function (q) {
            if (q === c.q || q.kind === 'hud') return false;
            /* 정류장은 마커 원끼리 거리로(사각형으로 재면 대각선 자리가 다 막힌다) */
            if (q.kind === 'stop') return Math.hypot(x - (q.x + q.w / 2), y - (q.y + q.h / 2)) < T.stop + T.cap + 4;
            return overlap(r, q);
          })) return false;
          var dx = x - c.x, dy = y - c.y;
          [].forEach.call(c.g.childNodes, function (n) { if (n.tagName === 'circle') { n.setAttribute('cx', x); n.setAttribute('cy', y); } else { n.setAttribute('x', +n.getAttribute('x') + dx); n.setAttribute('y', +n.getAttribute('y') + dy); } });
          c.x = x; c.y = y; c.q.x = r.x; c.q.y = r.y; return true;
        }); });
      }); }
      // 이름표 고치기 → 번호 원 비키기 → (번호 원이 비켜 생긴 자리로) 이름표 한 번 더 → 번호 원 한 번 더
      repairLabels(); fixCaps(); repairLabels(); fixCaps();
      ids.forEach(function (id) {
        var best = res[id].r, p = P[id], el = L[id].el;
        el.style.left = best.x + 'px'; el.style.top = best.y + 'px'; el.dataset.dir = best.dir;
        // 짧은 연결선: 마커 가장자리 → 이름표의 가장 가까운 점
        var bx = Math.max(best.x, Math.min(p.left, best.x + best.w)), by = Math.max(best.y, Math.min(p.top, best.y + best.h)), dd = Math.hypot(bx - p.left, by - p.top);
        if (!narrow && dd > T.stop + 1) svgEl('line', { 'class': 'leader', 'data-node': id, x1: p.left + (bx - p.left) / dd * T.stop, y1: p.top + (by - p.top) / dd * T.stop, x2: bx, y2: by }, gLead);
      });
      // 인물 얼굴 자리(이름표 다음): 출발 정류장 옆 — 위 → 왼쪽 위 → 오른쪽 위 → 왼쪽 → 오른쪽 → 아래, 노선 선·마커·번호 원·이름표를 피한다
      facePos = {};
      /* 빈자리가 끝내 없을 때 얼굴이 덮어도 되는 순서: 시계 묶음 가장자리 < 번호 원 < 정류장 여백 ≪ 이름표·다른 얼굴(이름표·얼굴은 다른 길이 정말 없을 때만) */
      var FACE_W = { label: 1000, face: 1000, stop: 4, cap: 20, hud: 1 };
      st.faces.forEach(function (f) {
        var n = st.nodes[f.node]; if (!n) return;
        var p = project(n.x, n.y), s = f.size, g2 = T.stop + 4, best = null;
        var cand = [[-s / 2, -g2 - s], [-s - g2, -s - 2], [g2, -s - 2], [-s - g2 - 2, -s / 2], [g2 + 2, -s / 2], [-s / 2, g2]];
        /* 좁은 지도(≤ 520px)는 빈자리가 드물어 10px 간격으로 더 촘촘히 찾는다(2026-11-01). 끝내 없으면 FACE_W 순서로 가장 덜 나쁜 자리 */
        (narrow ? [10, 20, 30, 40, 50, 62] : [20, 40, 62]).forEach(function (d) { [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]].forEach(function (u) { cand.push([u[0] * (g2 + d + s / 2) - s / 2, u[1] * (g2 + d + s / 2) - s / 2]); }); });
        var least = null, leastA = Infinity;
        [true, false].some(function (avoidLines) {
          return cand.some(function (o) {
            var r = { x: p.left + o[0], y: p.top + o[1], w: s, h: s };
            if (r.x < 2 || r.y < 2 || r.x + r.w > box.width - 2 || r.y + r.h > box.height - 2) return false;
            var cost = placed.reduce(function (sum, q) { return sum + area(r, q) * (FACE_W[q.kind] || 1) + (q.kind === 'stop' && q.id !== f.node ? core(r, q) : 0); }, 0);
            if (cost < leastA) { leastA = cost; least = r; }
            if (cost > 0) return false;
            if (avoidLines && segs.some(function (sg) { return segHits(sg, r, sg.pad); })) return false;
            best = r; return true;
          });
        });
        if (!best) best = least || { x: p.left - s / 2, y: p.top - g2 - s, w: s, h: s }; // 빈 자리가 끝내 없으면 가장 덜 겹치는 곳
        facePos[f.id] = best; placed.push({ x: best.x, y: best.y, w: s, h: s, kind: 'face', id: f.id });
      });
      if (opts.onLayout) opts.onLayout();
    }
    var queued = false;
    function redraw() { if (queued) return; queued = true; root.requestAnimationFrame(function () { queued = false; draw(); }); }
    if (root.ResizeObserver) new root.ResizeObserver(redraw).observe(stage);
    return {
      setScene: function (def) { st.nodes = {}; (def.nodes || []).forEach(function (n) { st.nodes[n.id] = n; }); redraw(); },
      setRoutes: function (routes) { st.routes = routes || []; redraw(); },
      setWaiting: function (w) { st.waiting = w || {}; draw(); },
      setSelected: function (ids) { st.selected = ids || []; redraw(); },
      setSelectable: function (ids) { st.selectable = ids || []; redraw(); },
      flash: function (id) { flashT[id] = performance.now(); redraw(); root.setTimeout(redraw, 950); },
      setFaces: function (list) { st.faces = list || []; redraw(); },
      facePos: function (id) { return facePos[id] || null; },
      setOptions: function (o) {
        if ('showWait' in o) st.showWait = !!o.showWait; if ('show' in o) st.show = !!o.show;
        if ('newNodes' in o) { var was = st.newNodes.join(), at = o.newAt || 0; st.newNodes = o.newNodes || []; if (was !== st.newNodes.join() || at !== st.newAt) { st.newAt = at; var left = 2700 - (performance.now() - at); if (st.newNodes.length && left > 0) root.setTimeout(redraw, left); } }
        redraw();
      },
      redraw: redraw, draw: draw,
      rects: function () { return placed.slice(); },
      caps: function () { return (st.caps || []).slice(); }
    };
  }
  root.PB = root.PB || {};
  root.PB.MapNetwork = { create: create, luminance: lum };
})(window);
