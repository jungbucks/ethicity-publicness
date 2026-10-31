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
    var st = { nodes: {}, routes: [], waiting: {}, selected: [], selectable: [], show: true, faces: [] }, placed = [], flashT = {}, facePos = {};

    function project(x, y) { var v = getView(); return v.project(x, y); }
    function lanePoint(a, b, num, f) {
      var v = getView(), o = v.laneOffset ? v.laneOffset(a.id, b.id, num) : { dx: 0, dy: 0 };
      return (v.projectRoad || v.project)(a.x + (b.x - a.x) * f + o.dx / 110, a.y + (b.y - a.y) * f + o.dy / 110);
    }
    function draw() {
      routeSvg.textContent = ''; svg.textContent = ''; labels.textContent = ''; placed = [];
      if (!st.show || !getView()) return;
      var T = opts.tokens(), box = stage.getBoundingClientRect();
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
          caps.push({ num: r.num, start: idx === 0, x: c.x, y: c.y, color: r.color, buses: r.buses });
        });
      });
      caps.forEach(function (c) {
        var g = svgEl('g', { 'class': 'net-cap', 'data-route': c.num, 'data-end': c.start ? 'start' : 'end' }, gCap);
        svgEl('circle', { cx: c.x, cy: c.y, r: T.cap, fill: c.color }, g);
        var t = svgEl('text', { x: c.x, y: c.y + 4, 'text-anchor': 'middle', fill: lum(c.color) > 0.35 ? '#1A1D24' : '#FFFFFF' }, g); t.textContent = String(c.num);
        var w = T.cap * 2;
        if (c.start && c.buses != null) { var s = svgEl('text', { 'class': 'cap-count', x: c.x + T.cap + 3, y: c.y + 4 }, g); s.textContent = String(c.buses); w += 12; }
        // 시작 쪽은 계획 화면의 노선 손잡이(번호 원 24px + 버스 수 pill, 왼쪽 14px 기준)가 그 위에 놓이므로 그 크기만큼 비워 둔다
        placed.push(c.start ? { x: c.x - 16, y: c.y - 15, w: 56, h: 30, kind: 'cap', route: c.num, start: true } : { x: c.x - T.cap - 2, y: c.y - T.cap - 2, w: w + 4, h: T.cap * 2 + 4, kind: 'cap', route: c.num, start: false });
      });
      st.caps = caps;
      // 인물 얼굴 자리(이름표보다 먼저): 출발 정류장 옆 — 위 → 왼쪽 위 → 오른쪽 위 → 왼쪽 → 오른쪽 → 아래, 노선 선·마커·번호 원을 피한다
      facePos = {};
      st.faces.forEach(function (f) {
        var n = st.nodes[f.node]; if (!n) return;
        var p = project(n.x, n.y), s = f.size, g2 = T.stop + 4, best = null;
        var cand = [[-s / 2, -g2 - s], [-s - g2, -s - 2], [g2, -s - 2], [-s - g2 - 2, -s / 2], [g2 + 2, -s / 2], [-s / 2, g2]];
        [20, 40, 62].forEach(function (d) { [[0, -1], [-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1], [0, 1]].forEach(function (u) { cand.push([u[0] * (g2 + d + s / 2) - s / 2, u[1] * (g2 + d + s / 2) - s / 2]); }); });
        var least = null, leastA = Infinity;
        [true, false].some(function (avoidLines) {
          return cand.some(function (o) {
            var r = { x: p.left + o[0], y: p.top + o[1], w: s, h: s };
            if (r.x < 2 || r.y < 2 || r.x + r.w > box.width - 2 || r.y + r.h > box.height - 2) return false;
            var area = placed.reduce(function (sum, q) { return sum + Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y)); }, 0);
            if (area < leastA) { leastA = area; least = r; }
            if (area > 0) return false;
            if (avoidLines && segs.some(function (sg) { return segHits(sg, r, sg.pad); })) return false;
            best = r; return true;
          });
        });
        if (!best) best = least || { x: p.left - s / 2, y: p.top - g2 - s, w: s, h: s }; // 빈 자리가 끝내 없으면 가장 덜 겹치는 곳
        facePos[f.id] = best; placed.push({ x: best.x, y: best.y, w: s, h: s, kind: 'face', id: f.id });
      });
      // 이름표(+대기 pill): 아래 → 오른쪽 → 왼쪽 → 위 중 빈 자리
      Object.keys(st.nodes).forEach(function (id) {
        var n = st.nodes[id], p = project(n.x, n.y), el = document.createElement('div'), wait = st.waiting[id] || 0;
        el.className = 'net-label'; el.dataset.node = id;
        el.appendChild(document.createElement('span')).textContent = n.name;
        if (st.showWait && wait > 0) {
          var w = document.createElement('span'); w.className = 'net-wait' + (wait >= T.waitDanger ? ' danger' : wait >= T.waitCaution ? ' caution' : '');
          w.textContent = '👤 ' + wait; w.title = n.name + ' 대기 ' + wait + '명'; el.appendChild(w); el.dataset.wait = wait;
        }
        labels.appendChild(el);
        // 아래 → 오른쪽 → 왼쪽 → 위(바로 옆), 안 되면 조금씩 멀리(8방향) — 다른 이름표·마커·번호 원과 노선 선을 피한다.
        // 떨어진 자리면 보조선으로 마커와 잇는다. 끝내 자리가 없으면 노선 선만 무시하고 다시 찾는다
        var lw = el.offsetWidth, lh = el.offsetHeight, gap = T.stop + 5, best = null, far = false;
        function cands() { var out = [[-lw / 2, gap], [gap + 2, -lh / 2], [-gap - 2 - lw, -lh / 2], [-lw / 2, -gap - lh]];
          [18, 36, 56, 78].forEach(function (d) { [[0, 1], [1, 0], [-1, 0], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]].forEach(function (u) {
            var cx = u[0] * (gap + d + (u[0] ? lw / 2 : 0)), cy = u[1] * (gap + d + (u[1] ? lh / 2 : 0)); out.push([cx - lw / 2, cy - lh / 2, true]); }); });
          return out; }
        // 1) 선·모든 것 피함 2) 선은 허용 3) 시계·조작 묶음 가장자리는 허용 4) 그래도 없으면 가장 덜 겹치는 곳(이름표끼리 겹침이 가장 나쁨)
        var least = null, leastA = Infinity;
        [[true, true], [false, true], [false, false]].some(function (pass) {
          return cands().some(function (o) {
            var r = { x: p.left + o[0], y: p.top + o[1], w: lw, h: lh };
            if (r.x < 2 || r.y < 2 || r.x + r.w > box.width - 2 || r.y + r.h > box.height - 2) return false;
            var area = placed.reduce(function (sum, q) { var a2 = Math.max(0, Math.min(r.x + r.w, q.x + q.w) - Math.max(r.x, q.x)) * Math.max(0, Math.min(r.y + r.h, q.y + q.h) - Math.max(r.y, q.y)); return sum + a2 * (q.kind === 'hud' ? 0.2 : q.kind === 'label' ? 5 : 1); }, 0);
            if (area < leastA) { leastA = area; least = { r: r, far: !!o[2] }; }
            if (placed.some(function (q) { return (pass[1] || q.kind !== 'hud') && overlap(r, q); })) return false;
            if (pass[0] && segs.some(function (s) { return segHits(s, r, s.pad); })) return false;
            best = r; far = !!o[2]; return true;
          });
        });
        if (!best && least) { best = least.r; far = least.far; }
        if (!best) best = { x: Math.min(Math.max(2, p.left - lw / 2), box.width - lw - 2), y: p.top + gap, w: lw, h: lh };
        el.style.left = best.x + 'px'; el.style.top = best.y + 'px';
        if (far) { var bx = Math.max(best.x, Math.min(p.left, best.x + lw)), by = Math.max(best.y, Math.min(p.top, best.y + lh)); svgEl('line', { 'class': 'leader', x1: p.left, y1: p.top, x2: bx, y2: by }, gLead); }
        placed.push({ x: best.x, y: best.y, w: lw, h: lh, kind: 'label', id: id });
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
      setOptions: function (o) { if ('showWait' in o) st.showWait = !!o.showWait; if ('show' in o) st.show = !!o.show; redraw(); },
      redraw: redraw, draw: draw,
      rects: function () { return placed.slice(); },
      caps: function () { return (st.caps || []).slice(); }
    };
  }
  root.PB = root.PB || {};
  root.PB.MapNetwork = { create: create, luminance: lum };
})(window);
