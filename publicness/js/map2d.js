/*
 * SVG 지도 — 3D가 안 될 때의 대체 무대이자 조작 지도. 3D 무대(view3d.js)와 같은 StageView 인터페이스.
 * 좌표는 config의 평면 좌표(x 오른쪽, y 아래)를 그대로 쓴다. 지도 클릭은 정보 보기·노선 편집용이며
 * 키보드 사용자는 오른쪽 패널의 정류장 목록 버튼으로 같은 일을 한다.
 */
(function (root) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var U = 110, PAD = 70, LANE = 7;

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }

  function create(svg, opts) {
    opts = opts || {};
    var nodes = {}, layers = {}, routeSegs = {}, reduced = false, currentRoutes = [];
    ['terrain', 'roads', 'routes', 'stops', 'badges'].forEach(function (k) { layers[k] = el('g', { 'class': 'layer-' + k }, svg); });
    // 버스는 지도 네트워크층(노선 선) 위에 보여야 해서 같은 좌표계(viewBox)의 맨 위 SVG에 따로 그린다(2026-10-27)
    var top = el('svg', { 'class': 'stage-svg stage-svg-buses', 'aria-hidden': 'false' }); svg.parentNode.appendChild(top);
    layers.buses = el('g', { 'class': 'layer-buses' }, top);

    function px(n) { return { x: n.x * U, y: n.y * U }; }

    // 지도 위에 겹쳐 놓인 시계(opts.reserved) 밑에 정류장·이름이 깔리면 위쪽 여백을 늘려 지도를 아래로 비킨다
    var baseBox = null, extraTop = 0, fullAspect = null, boxAnim = null;
    // 단계 전환 0.6초: viewBox를 이전 틀에서 새 틀로(시계 밑 여백 extraTop은 새 틀 기준)
    function animateBox(from, to) {
      var t0 = performance.now(), end = Object.assign({}, to);
      boxAnim = true;
      (function step() { var k = Math.min(1, (performance.now() - t0) / 600), e = 1 - Math.pow(1 - k, 3);
        baseBox = { x: from.x + (end.x - from.x) * e, y: from.y + (end.y - from.y) * e, w: from.w + (end.w - from.w) * e, h: from.h + (end.h - from.h) * e }; applyBox(); if (opts.onCamera) opts.onCamera();
        if (k < 1) root.requestAnimationFrame(step); else { baseBox = end; boxAnim = false; fitReserved(); if (opts.onCamera) opts.onCamera(); } })();
    }
    function applyBox() {
      var r = svg.getBoundingClientRect(), pad = Math.min(80, Math.max(54, Math.min(r.width, r.height) * .1));
      // Keep a screen-pixel gutter even when a late-stage map spans many units.
      var scale = Math.min(Math.max(1, r.width - pad * 2) / baseBox.w, Math.max(1, r.height - pad * 2) / (baseBox.h + extraTop));
      var gutter = r.width && r.height ? pad / scale : 0;
      var vb = [baseBox.x - gutter, baseBox.y - extraTop - gutter, baseBox.w + gutter * 2, baseBox.h + extraTop + gutter * 2].join(' ');
      svg.setAttribute('viewBox', vb); top.setAttribute('viewBox', vb);
    }
    function underReserved(area) {
      var r = svg.getBoundingClientRect();
      return Object.keys(nodes).some(function (id) {
        var p = project(nodes[id].x, nodes[id].y), x = r.left + p.left, y = r.top + p.top;
        return x + 48 > area.left && x - 48 < area.right && y + 34 > area.top && y - 20 < area.bottom;
      });
    }
    function fitReserved() {
      if (!baseBox) return;
      extraTop = 0; applyBox();
      var area = opts.reserved && opts.reserved();
      if (!area || !svg.getBoundingClientRect().width) return;
      var areas=Array.isArray(area)?area:[area];
      while (extraTop < 600 && areas.some(underReserved)) { extraTop += 20; applyBox(); }
    }
    if (root.ResizeObserver) new root.ResizeObserver(function () { fitReserved(); }).observe(svg);

    function setScene(scene) {
      nodes = {};
      scene.nodes.forEach(function (n) { nodes[n.id] = n; });
      // 틀 = 이번 단계 정류장(2026-10-27, 앞 단계는 가깝게·정류장이 늘면 뒤로). 지도 틀 비율은 세팅 전체(fullAspect)
      var all = scene.frame || scene.nodes, fx = all.map(function (n) { return n.x * U; }), fy = all.map(function (n) { return n.y * U; });
      fullAspect = (Math.max.apply(null, fx) - Math.min.apply(null, fx) + (all.some(function (n) { return n.id === 'N'; }) ? 180 : 0)) / Math.max(1, Math.max.apply(null, fy) - Math.min.apply(null, fy));
      var frame = scene.nodes;
      var xs = frame.map(function (n) { return n.x * U; }), ys = frame.map(function (n) { return n.y * U; });
      var minX = Math.min.apply(null, xs) - PAD, minY = Math.min.apply(null, ys) - PAD;
      var w = Math.max.apply(null, xs) - minX + PAD, h = Math.max.apply(null, ys) - minY + PAD;
      if(frame.some(function(n){return n.id==='N';})){minX-=90;w+=180;}
      var prevBox = baseBox; baseBox = { x: minX, y: minY, w: w, h: h };
      svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      fitReserved();
      if (prevBox && !reduced && (prevBox.w !== w || prevBox.h !== h || prevBox.x !== minX || prevBox.y !== minY)) animateBox(prevBox, baseBox);
      layers.roads.innerHTML = ''; layers.stops.innerHTML = ''; layers.terrain.innerHTML = '';
      if(scene.river && scene.river.length){
        var points=scene.river.map(function(p){return p.x*U+','+p.y*U;}).join(' ');
        [ ['#d3dfcd',56], ['#a8cbd4',40], ['#cce4e8',2] ].forEach(function(style){
          el('polyline',{points:points,fill:'none',stroke:style[0],'stroke-width':style[1],'stroke-linejoin':'round','pointer-events':'none'},layers.terrain);
        });
      }
      if(scene.boundary){
        var city=nodes.N,cx=city.x*U,cy=city.y*U,bx=scene.boundary.x*U;
        // 대도시 빌딩군은 3D와 같이 90%로(2026-10-23 사용자) — 정류장 자리를 중심으로 줄인다
        var town=el('g',{'class':'regional-city','pointer-events':'none',transform:'translate('+cx+' '+cy+') scale(.9) translate('+(-cx)+' '+(-cy)+')'},layers.terrain);
        [[-95,-80,40,110],[-43,-125,46,155],[12,-95,35,120],[57,-145,45,175],[110,-75,30,105]].forEach(function(b,i){
          el('rect',{x:cx+b[0],y:cy+b[1]-65,width:b[2],height:b[3],fill:i%2?'#bdcdd4':'#d0d9db',stroke:'#7e929e','stroke-width':2},town);
          for(var y=cy+b[1]-53;y<cy+b[1]-65+b[3]-8;y+=20)el('path',{d:'M'+(cx+b[0]+6)+' '+y+'h'+(b[2]-12),stroke:'#819caa','stroke-width':5},town);
        });
        el('line',{'class':'admin-boundary',x1:bx,y1:-3.5*U,x2:bx,y2:3.5*U,stroke:'#24292d','stroke-width':4,'stroke-dasharray':'12 10','pointer-events':'none'},layers.terrain);
        el('text',{x:bx+12,y:3.5*U,fill:'#303940','font-size':20},layers.terrain).textContent='행정 경계';
      }
      scene.roads.forEach(function (r) {
        var a = px(nodes[r.a]), b = px(nodes[r.b]);
        el('line', { 'class': 'road', x1: a.x, y1: a.y, x2: b.x, y2: b.y }, layers.roads);
      });
      // 정류장 네모 크기는 이번 단계 승차 요청 등급(이용객 수)만 나타낸다. 색은 모든 등급이 같다
      var SIZE = { low: 30, mid: 34, high: 42 };
      scene.nodes.forEach(function (n) {
        var p = px(n), ld = scene.load && scene.load[n.id], h = SIZE[ld ? ld.tier : 'low'] / 2;
        var g = el('g', { 'class': 'stop-g', 'data-node': n.id, 'data-tier': ld ? ld.tier : 'low' }, layers.stops);
        el('rect', { 'class': 'stop-dot', x: p.x - h, y: p.y - h, width: h * 2, height: h * 2, rx: 5 }, g);
        var id = el('text', { x: p.x, y: p.y + 5, 'text-anchor': 'middle', 'class': 'stop-label' }, g);
        id.textContent = n.id;
        var label = el('text', { x: p.x, y: p.y + h + 21, 'text-anchor': 'middle', 'class': 'stop-label' }, g);
        label.textContent = n.name;
        if (ld) { var c = el('text', { x: p.x, y: p.y + h + 36, 'text-anchor': 'middle', 'class': 'stop-load' }, g); c.textContent = ld.tier==='high'?'● ● ●':ld.tier==='mid'?'● ●':'●';var title=el('title',{},g);title.textContent='출발·도착 '+ld.count+'건'; }
      });
    }

    function segKey(a, b) { return a < b ? a + b : b + a; }
    function offsetFor(a, b, num) {
      var list = routeSegs[segKey(a, b)] || [num], k = list.indexOf(num), n = list.length;
      var A = px(nodes[a]), B = px(nodes[b]), dx = B.x - A.x, dy = B.y - A.y, len = Math.hypot(dx, dy) || 1;
      var sign = a < b ? 1 : -1, off = (k - (n - 1) / 2) * LANE * sign;
      return { x: -dy / len * off, y: dx / len * off };
    }

    function setRoutes(routes) {
      currentRoutes = routes;
      layers.routes.innerHTML = '';
      routeSegs = {};
      routes.forEach(function (r) {
        for (var i = 1; i < r.route.nodes.length; i++) {
          var k = segKey(r.route.nodes[i - 1], r.route.nodes[i]);
          (routeSegs[k] = routeSegs[k] || []).push(r.num);
        }
      });
      routes.forEach(function (r) {
        var ns = r.route.nodes;
        for (var i = 1; i < ns.length; i++) {
          if (!nodes[ns[i - 1]] || !nodes[ns[i]]) continue;
          var a = px(nodes[ns[i - 1]]), b = px(nodes[ns[i]]), o = offsetFor(ns[i - 1], ns[i], r.num);
          el('line', { 'class': 'route-line' + (r.dim ? ' dim' : '') + (r.preview ? ' preview-route' : ''), x1: a.x + o.x, y1: a.y + o.y, x2: b.x + o.x, y2: b.y + o.y,
            stroke: r.color, 'stroke-dasharray': r.dash || '', 'data-route': r.num }, layers.routes);
        }
        // 실제 정차 정류장에는 노선색 테두리의 흰 점 — 선이 지나가기만 하는 정류장과 구분
        if (!r.dim) ns.forEach(function (id, i) {
          if (!r.route.stops[i] || !nodes[id]) return;
          var o = offsetFor(i ? ns[i - 1] : ns[1], id, r.num), p = px(nodes[id]);
          el('circle', { 'class': 'stop-mark', cx: p.x + o.x, cy: p.y + o.y, r: 5, stroke: r.color, 'data-route': r.num, 'data-node': id }, layers.routes);
        });
        ns.forEach(function (id, i) {
          if (r.route.stops[i] || !nodes[id]) return;
          var nb = ns[i - 1], o = offsetFor(nb, id, r.num), p = px(nodes[id]);
          el('circle', { 'class': 'pass-ring', cx: p.x + o.x, cy: p.y + o.y, r: 5, stroke: r.color }, layers.routes);
        });
      });
    }

    function classAll(cls, ids) {
      Array.prototype.forEach.call(layers.stops.querySelectorAll('.stop-g'), function (g) {
        g.classList.toggle(cls, ids.indexOf(g.getAttribute('data-node')) >= 0);
      });
    }
    function setSelectable(ids) {
      classAll('selectable', ids || []);
      Array.prototype.forEach.call(layers.stops.querySelectorAll('.stop-g'), function (g) {
        g.classList.toggle('dim', !!(ids && ids.length) && ids.indexOf(g.getAttribute('data-node')) < 0 && !g.classList.contains('selected'));
      });
    }
    function setSelected(ids) { classAll('selected', ids || []); }

    // buses: [{ id, x, y, num, color }] — x,y는 평면 좌표(구간 보간 결과), lane은 노선 차선
    function setBuses(buses) {
      layers.buses.innerHTML = '';
      buses.forEach(function (b) {
        var g = el('g', { 'class': 'bus-g', 'data-bus': b.id }, layers.buses);
        var x = b.x * U + (b.dx || 0), y = b.y * U + (b.dy || 0);
        // 버스 = 작은 버스 모양(몸체 흰색 — 직행 7호차는 자두색, 띠는 노선색). 번호·인원 숫자 대신 정원 대비 차오르는 막대, 숫자는 마우스를 올렸을 때(title)
        var cap = b.regional ? 24 : b.express ? 18 : 12, fill = Math.min(1, (b.riders || 0) / cap), label = b.id + '호차' + (b.regional ? ' 광역 · 정원 24명' : b.express ? ' 직행 · 정원 18명' : '') + ' · 탑승 ' + (b.riders || 0) + '/' + cap + '명' + (b.names && b.names.length ? ' (' + b.names.join('·') + ')' : '');
        el('rect', { x: x - 14, y: y - 9, width: 28, height: 18, rx: 5, fill: b.express ? '#4B2E5C' : '#fff', stroke: '#1A1D24', 'stroke-width': 1.5 }, g);
        el('rect', { x: x - 14, y: y + 1, width: 28, height: 5, fill: b.color }, g);
        el('rect', { x: x - 10, y: y - 6, width: 20, height: 5, rx: 1.5, fill: '#9FB7CC' }, g);
        el('rect', { x: x - 14, y: y - 17, width: 28, height: 5, rx: 2.5, fill: '#fff', stroke: '#1A1D24', 'stroke-width': 1 }, g);
        el('rect', { x: x - 14, y: y - 17, width: 28 * fill, height: 5, rx: 2.5, fill: '#1A1D24', 'class': 'rider-count', 'data-riders': b.riders || 0 }, g);
        el('title', {}, g).textContent = label;
        g.setAttribute('aria-label', label);
      });
    }

    function setWaiting(map) {
      layers.badges.innerHTML = '';
      Object.keys(map || {}).forEach(function (id) {
        if (!map[id] || !nodes[id]) return;
        var p = px(nodes[id]);
        var g = el('g', { 'class': 'wait-badge', 'data-wait': id }, layers.badges);
        var label = String(map[id]);
        el('rect', { x: p.x + 12, y: p.y - 28, width: 12 + label.length * 7, height: 18, rx: 9 }, g);
        var t = el('text', { x: p.x + 18 + label.length * 3.5, y: p.y - 15, 'text-anchor': 'middle' }, g);
        t.textContent = label;
      });
    }

    function flash(id) {
      var g = layers.stops.querySelector('[data-node="' + id + '"]');
      if (!g || reduced) return;
      g.classList.remove('flash'); void g.getBBox; g.classList.add('flash');
    }

    // 무대 위 DOM 오버레이용 위치(백분율)
    function project(x, y) {
      var vb = svg.viewBox.baseVal, r = svg.getBoundingClientRect();
      var s = Math.min(r.width / vb.width, r.height / vb.height);
      var ox = (r.width - vb.width * s) / 2, oy = (r.height - vb.height * s) / 2;
      return { left: ox + (x * U - vb.x) * s, top: oy + (y * U - vb.y) * s };
    }
    function laneOffset(a, b, num) { var o = offsetFor(a, b, num); return { dx: o.x, dy: o.y }; }

    root.PB.RoutePointer.attach(svg,function(x,y){return root.PB.RoutePointer.pick(svg,project,nodes,currentRoutes,x,y,function(a,b,num){var o=offsetFor(a,b,num);return{x:o.x/U,y:o.y/U};});},opts);
    return {
      kind: '2d', ok: true, setScene: setScene, setRoutes: setRoutes, setSelectable: setSelectable, setSelected: setSelected,
      setBuses: setBuses, setWaiting: setWaiting, flash: flash, project: project, laneOffset: laneOffset,
      setReducedMotion: function (v) { reduced = !!v; },
      contentAspect: function () { return fullAspect; },
      show: function (v) { svg.style.display = v ? '' : 'none'; top.style.display = v ? '' : 'none'; if (v) fitReserved(); },
      dispose: function () { svg.innerHTML = ''; }
    };
  }

  root.PB = root.PB || {};
  root.PB.Map2D = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
