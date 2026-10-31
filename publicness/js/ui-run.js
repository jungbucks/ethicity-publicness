/*
 * 운행 화면 — 엔진 결과를 1×·2×로 재생하고, ‘⏭ 다음 결정까지’로 다음 긴급 조정이나 주목할 사건(정류장별 첫 만차,
 * 대기 10명 이상)까지 빨리 간 뒤 1×로 멈춘다. 긴급 조정 30분(게임 시간) 전부터는 1×로 감속하고 원인 정류장에
 * 경고 고리와 예고 문구를 띄운다(규칙은 run-pace.js). 엔진 결과는 출발할 때 이미 계산되어 배속은 재생 속도만 바꾼다
 * (수송·대기·비용·인물 판정은 같다). 고른 배속(1·2)은 이 브라우저에 기억하고, 멈췄다가 결정이 끝나면 그 배속으로 돌아간다.
 * 빨리 지나가도 읽을 수 있게 ‘지금 운행 상황’(도착·대기·노선 없음·만차·주요 인물)을 분마다 갱신하고,
 * 지나간 소식은 운행 소식 목록과 결과 화면의 ‘운행 기록’에 남긴다.
 * 긴급 조정 창은 지도를 가리지 않도록 오른쪽 패널 맨 위에 열린다(모달 아님).
 * 헤드리스·저사양에서 rAF가 드물게 돌아도 멈추지 않도록 rAF + 50ms 타이머로 함께 구동한다.
 */
(function (root) {
  'use strict';
  var PB = root.PB, cfg = PB.config, D = PB.Demand, P = PB.RunPace;
  var UI = PB.UI = PB.UI || {};
  var $ = function (s) { return document.querySelector(s); };
  var W = cfg.bus.window;
  var SPEEDS = PB.Storage.SPEEDS; // 고를 수 있는 배속(1·2)
  var R = null; // 재생 상태

  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }

  // 운행 소식(사건·청원·만차·주민 말). 운행 화면과 결과 화면의 ‘운행 기록’이 같은 목록을 쓴다
  function runFeed(s) {
    var res = s.current.result, c = s.config, items = [], ev = s.current.event;
    res.log.forEach(function (e) {
      if (e.type === 'event' && e.data.type === 'demand') {
        var od = D.directional(c, s.phase)[ev.odIndex];
        items.push({ t: e.t, cls: 'event', text: app().clock(e.t) + ' · 갑자기 ' + app().nodeName(od.o) + '에서 ' + PB.Narrative.josa(app().nodeName(od.d), '으로') + ' 가려는 사람이 늘었어요(' + app().duration(c.events.extraMinutes) + ' 동안 12명).' });
      }
      if (e.type === 'petition') {
        var complaint = '우리 동네에서 출발한 ' + e.data.count + '명이 아직 도착하지 못했어요.';
        items.push({ t: e.t, cls: 'event', node: e.node, bubble: { kind: 'petition', text: complaint }, text: app().clock(e.t) + ' · ' + app().nodeName(e.node) + ' 주민 청원: “' + complaint + '”' });
      }
    });
    var fullSeen = {};
    res.log.forEach(function (e) {
      if (e.type !== 'full' || fullSeen[e.node]) return;
      fullSeen[e.node] = true;
      var complaint = e.bus + '호차가 만차라 ' + e.data.left + '명이 못 탔어요. 다음 버스를 기다려요.';
      items.push({ t: e.t, cls: 'full', node: e.node, bubble: { kind: 'full', text: complaint }, text: app().clock(e.t) + ' · ' + app().nodeName(e.node) + '에서 ' + complaint });
    });
    PB.Narrative.bubbles(res, c, W).forEach(function (b) {
      if (b.kind === 'full') return; // 만차는 위의 실제 로그(남은 인원)로 보여 준다
      var who = b.residentId ? c.residents.filter(function (r) { return r.id === b.residentId; })[0].name : '주민';
      items.push({ t: b.t, cls: b.residentId ? 'resident' : 'bubble', node: b.node, bubble: b, text: app().clock(b.t) + ' · ' + who + '(' + app().nodeName(b.node) + '): “' + b.text + '”' });
    });
    return items.sort(function (a, b) { return a.t - b.t; });
  }
  UI.runFeed = runFeed;

  // 주요 인물의 이동 상태(그 시각까지의 로그만). 한 인물은 첫 이동과(도착하면 생기는) 다음 이동 두 건
  function residentStates(s, m) {
    var res = s.current.result, out = [];
    PB.Demand.residents(s.config, s.phase).forEach(function (rd) {
      var legs = res.passengers.filter(function (p) { return p.residentId === rd.id; }).sort(function (a, b) { return a.t - b.t; });
      var first = legs[0], now = null;
      legs.forEach(function (p) { if (p.t <= m) now = p; });
      var text;
      if (!first) text = '오늘 일정 없음';
      else if (!now) text = app().clock(first.t) + ' ' + app().nodeName(first.o) + '에서 출발 예정';
      else text = legState(now, m, rd);
      out.push({ id: rd.id, name: rd.name, text: text, done: legs.length >= 2 && legs[1].arriveT != null && legs[1].arriveT <= m });
    });
    return out;
  }
  function legState(p, m, rd) {
    var dest = app().nodeName(p.d), where = p.leg === 'return' ? '다음 이동' : '첫 이동';
    if (p.fail === 'NO_LINK') return where + ' — ' + app().nodeName(p.o) + '→' + dest + ' 잇는 노선이 없어 떠나지 못함';
    if (p.fail === 'NO_TRIP_IN_WINDOW') return where + ' — 운행 시간 안에 탈 수 있는 버스가 없음';
    if (p.arriveT != null && p.arriveT <= m) return dest + ' 도착 ' + app().clock(p.arriveT) + (p.leg === 'return' ? ' · 일정 끝' : ' · 볼일 뒤 다음 이동');
    var boards = R.boardsByPid[p.id] || [], boarded = boards.filter(function (t) { return t <= m; });
    var onBus = R.onBusAt(p.id, m);
    if (onBus) return PB.Narrative.josa(dest, '으로') + ' 가는 버스 안' + (boarded.length > 1 ? ' · 갈아탄 뒤' : '');
    if (boarded.length) return '갈아탈 버스를 기다리는 중';
    return app().nodeName(p.o) + '에서 기다리는 중 · ' + app().duration(m - p.t) + '째';
  }

  function start(App) {
    var s = App.s;
    cfg = s.config;
    W = cfg.bus.window;
    // tf = 재생 위치(엔진 시간). mode 'next' = ‘다음 결정까지’ 빨리 가는 중, hold = 사건·조정 시점에서 1×로 멈춤
    R = { phase: s.phase, s: s, tf: s.runCursor || 0, speed: App.speed || 1, mode: 'normal', hold: false, pendingEmergency: null, last: null, minute: -1, done: false, shown: 0, lastBubbleAt: {}, alerts: [], alertKey: '' };
    R.res = s.current.result;
    R.wait = P.waitingTable(R.res, cfg);
    R.notables = P.notables(R.res, R.wait, cfg);
    R.slow = P.slowSpan(cfg);
    R.causeAt = {};
    R.items = runFeed(s);
    R.chimeAt = {};
    R.res.log.forEach(function (e) {
      if (e.type === 'event' || e.type === 'petition') R.chimeAt[e.t] = true;
    });
    R.items.forEach(function (it) { if (it.cls === 'resident' && it.bubble.kind === 'arrive') R.chimeAt[it.t] = true; });
    // 정류장에 승객이 생기는 시각(분 단위): 인원 수와 주요 인물 여부
    var who = {}, byId = {}; R.res.passengers.forEach(function (p) { who[p.id] = p.residentId; byId[p.id] = p; });
    R.byId = byId;
    R.reqAt = {}; R.lastPop = 0;
    R.res.log.forEach(function (e) { if (e.type !== 'request') return; var k = Math.floor(e.t), q = R.reqAt[k] = R.reqAt[k] || { n: 0, resident: false }; q.n++; if (who[e.pid]) q.resident = true; });
    // 승객별 승하차 시각(주요 인물 상태용)
    R.boardsByPid = {}; var offs = {};
    R.res.log.forEach(function (e) {
      if (e.type === 'board') (R.boardsByPid[e.pid] = R.boardsByPid[e.pid] || []).push(e.t);
      if (e.type === 'alight' || e.type === 'arrive') (offs[e.pid] = offs[e.pid] || []).push(e.t);
    });
    // 주요 인물의 탑승 구간(승차 시각·버스 → 다음 하차 시각)
    var rname = {}; s.config.residents.forEach(function (r) { rname[r.id] = r.name; });
    R.residentRides = []; var open = {};
    R.res.log.forEach(function (e) {
      var p = e.pid != null ? byId[e.pid] : null; if (!p || !p.residentId) return;
      if (e.type === 'board') { open[e.pid] = { name: rname[p.residentId], bus: e.bus, on: e.t, off: null }; R.residentRides.push(open[e.pid]); }
      if ((e.type === 'alight' || e.type === 'arrive') && open[e.pid]) { open[e.pid].off = e.t; open[e.pid] = null; }
    });
    R.onBusAt = function (pid, m) { var on = (R.boardsByPid[pid] || []).filter(function (t) { return t <= m; }).length, off = (offs[pid] || []).filter(function (t) { return t <= m; }).length; return on > off; };
    clearAlerts();
    syncControls();
    R.timer = root.setInterval(tick, 50);
    R.raf=root.requestAnimationFrame(function loop() { if (!R || R.done) return; tick(); R.raf = root.requestAnimationFrame(loop); });
  }

  function stop() {
    if (!R) return;
    root.clearInterval(R.timer);
    if (R.raf) root.cancelAnimationFrame(R.raf);
    R.done = true;
    document.querySelectorAll('#stage-overlay .bubble').forEach(function (b) { b.remove(); });
    clearAlerts();
  }

  function tick() {
    if (!R || R.done) return;
    var now = root.performance.now();
    if (R.last == null) R.last = now;
    var dt = now - R.last;
    R.last = now;
    if (document.hidden || R.paused) return;
    var App = app(), cp = nextCheckpoint();
    var stopAt = P.nextStop(R.tf, { mode: R.mode, notables: R.notables, checkpoint: cp });
    var tf = Math.min(W, P.advance(R.tf, Math.min(dt, 250), R.mode === 'next' ? P.NEXT : R.speed, App.msPerMinute(), cp, R.slow));
    var reached = stopAt && tf >= stopAt.t;
    if (reached) tf = stopAt.t;
    R.tf = tf;
    var m = Math.floor(tf);
    drawBuses(App, App.reducedMotion() ? m : tf);
    if (m !== R.minute) {
      // 차임 > 주요 인물 등장 > 일반 승객 '톡'(0.45초에 한 번까지) 순으로 한 번만 울린다
      var chimed = false, people = 0, resident = false;
      for (var k = R.minute + 1; k <= m; k++) { if (R.chimeAt[k]) chimed = true; var q = R.reqAt[k]; if (q) { people += q.n; resident = resident || q.resident; } }
      if (chimed) App.chime();
      else if (resident) App.sfx('resident');
      else if (people && now - R.lastPop > 450) { R.lastPop = now; App.sfx('person'); }
      R.minute = m;
      R.s.runCursor=m;App.save();
      onMinute(App, m);
    }
    if (reached) holdAt(App, stopAt);
    else updatePreview(App, tf, cp);
    if (tf >= W && !R.finishing) {
      R.finishing = true;
      clearAlerts();
      var st = $('#run-status');
      if (st) st.textContent = '운행이 끝났습니다.';
      root.setTimeout(function () {
        stop();
        if (App.s === R.s && App.s.stage === 'run') { PB.Session.finishRun(App.s); App.go('result'); }
      }, root.__pbFast ? 30 : 1000);
    }
  }

  // 아직 결정하지 않은 긴급 조정 시점(3단계부터 오전·오후 한 번씩)
  function remainingCheckpoints() {
    if (!R || R.s.phase < 3) return [];
    var decided = (R.s.emergencyLog || []).filter(function (a) { return a.phase === R.s.phase; }).map(function (a) { return a.at; });
    return P.pendingCheckpoints(PB.Session.EMERGENCY_AT, decided);
  }
  function nextCheckpoint() { var left = remainingCheckpoints(); return left.length ? left[0] : null; }

  // 조정 시점의 원인 정류장 = 그 시각 대기(지도 숫자와 같은 기준)가 가장 많은 곳
  function causeAt(at) {
    if (R.causeAt[at] !== undefined) return R.causeAt[at];
    var m = Math.floor(at), top = null;
    Object.keys(R.wait).forEach(function (n) { var w = R.wait[n][m] || 0; if (w && (!top || w > top.n)) top = { node: n, n: w }; });
    return (R.causeAt[at] = top);
  }
  function waitNow(node, m) { return (R.wait[node] && R.wait[node][Math.max(0, Math.floor(m))]) || 0; }

  // 사건·조정 시점에 닿으면 1×로 돌아와 멈춘다
  function holdAt(App, stopAt) {
    R.paused = true; R.hold = true; R.mode = 'normal';
    if (stopAt.kind === 'emergency') {
      R.s.runCursor = stopAt.t; App.save();
      showEmergency(stopAt.t);
    } else {
      setAlerts(stopAt.items.map(function (n) {
        var name = App.nodeName(n.node);
        return n.kind === 'full' ? { node: n.node, kind: 'full', text: name + ' 만차 · ' + n.bus + '호차에 ' + n.n + '명 못 탐' } : { node: n.node, kind: 'wait', text: name + ' 대기 ' + n.n + '명' };
      }));
      setStatus('⏸ ' + App.clock(stopAt.t) + ' 멈춤 — ' + R.alerts.map(function (a) { return a.text; }).join(', ') + '. ▶ 재개하면 ' + App.speed + '배속, ⏭ 누르면 다음 결정까지 빨리 가요.');
    }
    syncControls();
  }

  // 긴급 조정 30분 전부터: 1×로 감속하고 원인 정류장에 고리와 예고 문구
  function updatePreview(App, tf, cp) {
    var slowNow = P.inSlowZone(tf, cp, R.slow);
    if (slowNow !== !!R.slowed) { R.slowed = slowNow; syncControls(); }
    if (R.hold) return;
    if (!slowNow) { if (R.alerts.length) setAlerts([]); return; }
    var cause = causeAt(cp), m = Math.floor(tf);
    if (cause) setAlerts([{ node: cause.node, kind: 'emergency', text: '긴급 조정 예고 · ' + App.nodeName(cause.node) + ' 대기 ' + waitNow(cause.node, m) + '명' }]);
    else setAlerts([]);
    setStatus('긴급 조정(' + App.clock(cp) + ') 30분 전 · 1배속으로 천천히 보여 줘요' + (cause ? ' — ' + App.nodeName(cause.node) + ' 대기 ' + waitNow(cause.node, m) + '명' : '') + '.');
  }

  /* 지도 위 경고 고리·문구(2D·3D 공통 #stage-overlay, 정류장 화면 좌표에 맞춰 매 틱 옮긴다) */
  function setAlerts(list) {
    R.alerts = list;
    var key = JSON.stringify(list);
    if (key === R.alertKey) return;
    R.alertKey = key;
    var layer = $('#stage-overlay'); if (!layer) return;
    Array.prototype.slice.call(layer.querySelectorAll('.run-alert')).forEach(function (n) { n.remove(); });
    list.forEach(function (a) {
      var box = el('div', { 'class': 'run-alert', 'data-node': a.node, 'data-kind': a.kind, 'data-reduced': String(app().reducedMotion()) });
      box.appendChild(el('span', { 'class': 'run-alert-ring' }));
      box.appendChild(el('span', { 'class': 'run-alert-label' }, a.text));
      layer.appendChild(box);
    });
    placeAlerts(app());
  }
  function placeAlerts(App) {
    var layer = $('#stage-overlay'); if (!layer || !App.view || !App.view.project) return;
    var occupied = App.net ? App.net.rects() : [], W = layer.clientWidth, H = layer.clientHeight;
    layer.querySelectorAll('.notice-leader').forEach(function (e) { e.remove(); });
    function overlaps(a, b) { return a.x < b.x + b.w + 5 && b.x < a.x + a.w + 5 && a.y < b.y + b.h + 5 && b.y < a.y + a.h + 5; }
    Array.prototype.slice.call(layer.querySelectorAll('.run-alert,.bubble')).forEach(function (box) {
      var xy = App.nodeXY(box.dataset.node), p = App.view.project(xy.x, xy.y);
      var alert = box.classList.contains('run-alert'), label = alert ? box.querySelector('.run-alert-label') : box;
      var w = label.offsetWidth, h = label.offsetHeight, candidates = [], best = null, score = Infinity;
      function add(x, y) { candidates.push({ x: Math.max(8, Math.min(W - w - 8, x)), y: Math.max(8, Math.min(H - h - 8, y)), w: w, h: h }); }
      add(p.left - w / 2, p.top - h - 38); add(p.left - w / 2, p.top + 38);
      add(p.left + 38, p.top - h / 2); add(p.left - w - 38, p.top - h / 2);
      for (var y = 8; y <= H - h - 8; y += 8) for (var x = 8; x <= W - w - 8; x += 8) add(x, y);
      candidates.forEach(function (r) {
        if (occupied.some(function (q) { return overlaps(r, q); })) return;
        var d = Math.pow(r.x + w / 2 - p.left, 2) + Math.pow(r.y + h / 2 - p.top, 2);
        if (d < score) { best = r; score = d; }
      });
      // A crowded small map can run out of space. Keep the message readable in
      // the adjacent notice tray instead of covering a stop or another message.
      var tray = $('#map-notice-overflow');
      if (!best) {
        if (!tray) { tray = el('div', { id: 'map-notice-overflow', 'class': 'map-notice-overflow' }); $('#stage').after(tray); }
        var item = box._overflow;
        if (!item) { item = el('div'); tray.appendChild(item); box._overflow = item; }
        item.textContent = App.nodeName(box.dataset.node) + ' · ' + label.textContent;
        label.style.visibility = 'hidden';
      } else {
        if (box._overflow) { box._overflow.remove(); box._overflow = null; }
        label.style.visibility = '';
        occupied.push(best);
        label.style.left = (best.x - (alert ? p.left : 0)) + 'px';
        label.style.top = (best.y - (alert ? p.top : 0)) + 'px';
        var bx = Math.max(best.x, Math.min(p.left, best.x + w)), by = Math.max(best.y, Math.min(p.top, best.y + h));
        var line = el('span', { 'class': 'notice-leader' });
        line.style.left = p.left + 'px'; line.style.top = p.top + 'px';
        line.style.width = Math.hypot(bx - p.left, by - p.top) + 'px';
        line.style.transform = 'rotate(' + Math.atan2(by - p.top, bx - p.left) + 'rad)';
        layer.insertBefore(line, layer.firstChild);
      }
      if (alert) { box.style.left = p.left + 'px'; box.style.top = p.top + 'px'; }
    });
    var tray = $('#map-notice-overflow');
    if (tray) { Array.prototype.slice.call(tray.children).forEach(function (item) {
      if (!Array.prototype.some.call(layer.querySelectorAll('.run-alert,.bubble'), function (box) { return box._overflow === item; })) item.remove();
    }); if (!tray.children.length) tray.remove(); }
  }
  UI.placeRunNotices = function () { placeAlerts(app()); };
  function clearAlerts() {
    if (R) { R.alerts = []; R.alertKey = ''; }
    var layer = $('#stage-overlay');
    if (layer) Array.prototype.slice.call(layer.querySelectorAll('.run-alert')).forEach(function (n) { n.remove(); });
    placeAlerts(app());
  }
  function setStatus(text) { var st = $('#run-status'); if (st) st.textContent = text; }

  // 버스 한 대의 그 시각 노선 번호·위치
  function busAt(App, tl, t) {
    var changes = (tl.assignments || []).filter(function (a) { return a.t <= t; }), route = changes.length ? changes[changes.length - 1].route : tl.route;
    return { pos: PB.Schedule.positionAt(tl, cfg, t), num: route ? App.numForPlanRoute(route) : null };
  }
  function busWhere(App, b, riders) {
    var p = b.pos, line = b.num ? b.num + '번 노선' : '노선 없음', text;
    if (p.node && p.parked) text = b.num ? line + ' · ' + App.nodeName(p.node) + '에서 출발 대기' : '쉬는 중 · ' + App.nodeName(p.node) + ' 차고';
    else if (p.node) text = line + ' · ' + App.nodeName(p.node) + ' 정류장';
    else text = line + ' · ' + App.nodeName(p.from) + ' → ' + App.nodeName(p.to) + ' 이동 중';
    return text + (riders ? ' · ' + riders + '명 탑승' : '');
  }

  // 긴급 조정 창 — 오른쪽 패널 맨 위(지도를 가리지 않음). 원인 정류장과 버스마다 지금 위치를 함께 보여 준다
  function showEmergency(at) {
    var App = app(), panel = $('#panel');
    R.pendingEmergency = at;
    var cause = causeAt(at);
    // 결정하는 동안 지도에는 원인 고리와 버스만 — 지나간 말풍선이 버스를 가리지 않게 걷는다(소식은 목록에 남아 있음)
    Array.prototype.slice.call(document.querySelectorAll('#stage-overlay .bubble')).forEach(function (b) { b.remove(); });
    setAlerts(cause ? [{ node: cause.node, kind: 'emergency', text: '긴급 조정 · ' + App.nodeName(cause.node) + ' 대기 ' + cause.n + '명' }] : []);
    setStatus(App.clock(at) + ' 긴급 조정 — 오른쪽 창에서 결정하면 ' + App.speed + '배속으로 이어져요.');
    var d=$('#emergency-dialog');if(!d){d=el('dialog',{id:'emergency-dialog','class':'emergency-window','aria-labelledby':'emergency-title'});}
    if (panel && d.parentNode !== panel) panel.insertBefore(d, panel.firstChild);
    d.textContent='';d.oncancel=function(e){e.preventDefault();};
    d.appendChild(el('h2',{id:'emergency-title',tabindex:'-1'},App.clock(at)+' · 긴급 조정'));
    var why = el('p', { id: 'emergency-cause', 'class': 'emergency-cause' });
    if (cause) { why.appendChild(el('b', null, '원인 정류장 · ' + App.nodeName(cause.node) + ' 대기 ' + cause.n + '명')); why.appendChild(document.createTextNode(' — 지도에 주황 고리로 표시했어요.')); }
    else why.textContent = '지금 정류장에서 기다리는 사람은 없어요.';
    d.appendChild(why);
    var occ = PB.Sim.occupancyAt(R.res, Math.floor(at)), list = el('ul', { id: 'emergency-buses', 'class': 'plain emergency-buses' });
    d.appendChild(el('h3', null, '버스 지금 위치'));
    R.res.timelines.slice().sort(function (a, b) { return a.busId - b.busId; }).forEach(function (tl) {
      var b = busAt(App, tl, at), li = el('li', { 'data-bus': tl.busId });
      var chip = el('span', { 'class': 'bus-chip', 'aria-hidden': 'true' }); chip.style.background = b.num ? App.routeStyle(b.num).color : '#6B7280';
      li.appendChild(chip); li.appendChild(el('b', null, tl.busId + '호차 ')); li.appendChild(document.createTextNode(busWhere(App, b, occ[tl.busId])));
      list.appendChild(li);
    });
    d.appendChild(list);
    d.appendChild(el('p',{'class':'note'},'이번 기회에 버스 한 대를 옮길 수 있어요. 조정권 1회를 사용하며, 승객을 내려주고 종점에 도착한 뒤 이동해요. 이동 시간과 운영 비용도 들어요.'));
    var bus=el('select',{id:'emergency-bus'}),route=el('select',{id:'emergency-route'});
    R.s.draft.buses.forEach(function(b){bus.appendChild(el('option',{value:b.id},b.id+'호차'));});
    function options(){route.textContent='';PB.Session.routesInOrder(R.s).forEach(function(r){if(PB.Session.canAssign(R.s,Number(bus.value),r.num)&&!PB.Graph.validateRoute(PB.Session.graph(R.s),r).length)route.appendChild(el('option',{value:r.num},r.num+'번 · '+r.nodes.map(App.nodeName).join(' → ')));});}
    bus.addEventListener('change',options);options();
    d.appendChild(el('label',{'for':'emergency-bus'},'옮길 버스'));d.appendChild(bus);d.appendChild(el('label',{'for':'emergency-route'},'새 노선'));d.appendChild(route);
    // 결정이 끝나면 처음부터 다시 재생 상태를 만든다 — 배속은 플레이어가 마지막으로 고른 값(App.speed)
    function finish(id,num){if(!PB.Session.emergencyDecision(R.s,at,id,num))return;var s=R.s;s.runCursor=at;d.close();d.remove();stop();start(app());app().save();app().syncStage({keepBuses:true});setStatus('운행 중 · '+app().speed+'배속');}
    var row = el('div', { 'class': 'row-actions' });
    var apply=el('button',{type:'button',id:'emergency-apply','class':'btn btn-primary',onclick:function(){if(route.value)finish(Number(bus.value),Number(route.value));}},'버스 한 대 옮기기');apply.disabled=!route.options.length;bus.addEventListener('change',function(){apply.disabled=!route.options.length;});
    row.appendChild(el('button',{type:'button',id:'emergency-continue','class':'btn',onclick:function(){finish(null,null);}},'변경 없이 계속'));
    row.appendChild(apply);
    d.appendChild(row);
    if (document.body.classList.contains('panel-collapsed')) App.setPanelCollapsed(false); // 조정 창은 패널 안에 있다
    if (!d.open) d.show();
    if (panel) panel.scrollTop = 0;
    $('#emergency-title').focus({ preventScroll: true });
  }

  // 버스별로 지금 타고 있는 주요 인물 이름(특수 캐릭터) — 버스 위 말풍선에 [하늘]처럼 띄운다
  function namesOnBus(m) {
    var out = {};
    R.residentRides.forEach(function (x) { if (x.on <= m && (x.off == null || x.off > m)) (out[x.bus] = out[x.bus] || []).push(x.name); });
    return out;
  }
  function drawBuses(App, t) {
    var v = App.view;
    R.motionCache = R.motionCache || new WeakMap();
    if (v.setDrivingSegments) {
      if (R.roadResult !== R.res) {
        R.roadResult = R.res;
        R.roadSegments = R.res.timelines.reduce(function (out, tl) { return out.concat(tl.segments.filter(function (s) { return s.deadhead; })); }, []);
      }
      v.setDrivingSegments(R.roadSegments);
    }
    var counts = PB.Sim.occupancyAt(R.res, Math.floor(t)), names = namesOnBus(Math.floor(t));
    v.setBuses(R.res.timelines.map(function (tl) {
      var b = busAt(App, tl, t), pos = b.pos, num = b.num;
      var color = num ? App.routeStyle(num).color : '#6B7280';
      if (v.kind === '3d' && PB.BusMotion && tl.segments.length && !(pos.parked && !tl.route)) {
        var cached = R.motionCache.get(tl);
        if (!cached || cached.segments !== tl.segments || cached.count !== tl.segments.length || cached.nodes !== cfg.nodes) {
          cached = { segments: tl.segments, count: tl.segments.length, nodes: cfg.nodes, path: PB.BusMotion.compile(tl, cfg.nodes) };
          R.motionCache.set(tl, cached);
        }
        var drive = PB.BusMotion.sample(cached.path, t);
        if (drive) return { id: tl.busId, x: drive.x, y: drive.y, heading: drive.heading, color: color, num: num,
          riders: counts[tl.busId], names: names[tl.busId] || [], express: cfg.challengeApplied && tl.busId === 7, regional: cfg.challengeApplied && tl.busId === 9 };
      }
      if (pos.node) {
        var p = App.nodeXY(pos.node);
        var parked = pos.parked;
        return { id: tl.busId, x: p.x, y: p.y, dx: parked ? -30 : 0, dy: parked ? -24 - (tl.busId - 1) * 21 : -2, color: color, num: num, riders: counts[tl.busId], names: names[tl.busId] || [], express: cfg.challengeApplied && tl.busId === 7, regional: cfg.challengeApplied && tl.busId === 9 };
      }
      var a = App.nodeXY(pos.from), c = App.nodeXY(pos.to), lane = v.laneOffset ? v.laneOffset(pos.from, pos.to, num) : { dx: 0, dy: 0 };
      return { id: tl.busId, x: a.x + (c.x - a.x) * pos.f, y: a.y + (c.y - a.y) * pos.f, dx: lane.dx, dy: lane.dy, color: color, num: num, riders: counts[tl.busId], names: names[tl.busId] || [], express: cfg.challengeApplied && tl.busId === 7, regional: cfg.challengeApplied && tl.busId === 9 };
    }));
  }

  // ‘지금 운행 상황’ — 그 분까지의 로그로 센다(엔진이 이미 계산한 결과를 시간순으로 보여 줄 뿐)
  function liveCounts(m) {
    var c = { requests: 0, arrived: 0, noLink: 0, fulls: 0, left: 0 };
    R.res.log.forEach(function (e) {
      if (e.t > m) return;
      if (e.type === 'request') { c.requests++; if (R.byId[e.pid] && R.byId[e.pid].fail === 'NO_LINK') c.noLink++; }
      if (e.type === 'arrive') c.arrived++;
      if (e.type === 'full') { c.fulls++; c.left += e.data.left; }
    });
    var occ = PB.Sim.occupancyAt(R.res, m); c.riding = Object.keys(occ).reduce(function (a, k) { return a + occ[k]; }, 0);
    c.waiting = 0; var top = null;
    Object.keys(R.wait).forEach(function (n) { var w = R.wait[n][m] || 0; c.waiting += w; if (w && (!top || w > top.n)) top = { node: n, n: w }; });
    c.top = top;
    return c;
  }
  function renderLive(m) {
    var box = $('#run-live'); if (!box) return;
    var c = liveCounts(m), rows = [
      ['생긴 이동 요청', c.requests + '건'], ['목적지 도착', c.arrived + '건'],
      ['지금 버스 안', c.riding + '명'], ['지금 정류장 대기', c.waiting + '명' + (c.top ? ' · 가장 많은 곳 ' + app().nodeName(c.top.node) + ' ' + c.top.n + '명' : '')],
      ['노선이 없어 떠나지 못함', c.noLink + '건'], ['만차로 남겨짐', c.fulls ? c.fulls + '번 · ' + c.left + '명' : '없음']
    ];
    var dl = box.querySelector('dl'); dl.textContent = '';
    rows.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); });
    var ul = box.querySelector('#run-residents'); ul.textContent = '';
    residentStates(R.s, m).forEach(function (r) { ul.appendChild(el('li', { 'data-resident': r.id, 'class': r.done ? 'done' : '' }, r.name + ' · ' + r.text)); });
  }

  function onMinute(App, m) {
    App.updateClock(m);
    var counts = {};
    Object.keys(R.wait).forEach(function (n) { counts[n] = R.wait[n][m]; });
    App.view.setWaiting(counts);
    renderLive(m);
    var feed = $('#run-feed');
    while (R.shown < R.items.length && R.items[R.shown].t <= m) {
      var it = R.items[R.shown++];
      if (feed) feed.insertBefore(el('li', { 'class': 'feed-' + it.cls }, it.text), feed.firstChild);
      if (it.node) App.view.flash(it.node);
      if (it.bubble) showBubble(App, it);
    }
  }

  function showBubble(App, it) {
    var layer = $('#stage-overlay');
    if (!layer || !App.view.project) return;
    var important = it.bubble.kind === 'full' || it.bubble.kind === 'petition';
    if (!important && R.lastBubbleAt[it.node] != null && it.t - R.lastBubbleAt[it.node] < 8) return;
    R.lastBubbleAt[it.node] = it.t;
    var old = layer.querySelector('.bubble[data-node="' + it.node + '"]'); if (old) old.remove();
    while (layer.querySelectorAll('.bubble').length >= 2) layer.querySelector('.bubble').remove();
    var xy = App.nodeXY(it.node), p = App.view.project(xy.x, xy.y);
    var who = it.bubble.residentId ? cfg.residents.filter(function (r) { return r.id === it.bubble.residentId; })[0].name : '';
    var b = el('div', { 'class': 'bubble' });
    b.dataset.node = it.node; b.dataset.kind = it.bubble.kind;
    var issue = { noLink: '노선 없음', full: '만차', wait: '긴 기다림', petition: '주민 민원' }[it.bubble.kind];
    if (issue) b.appendChild(el('b', { 'class': 'bubble-issue' }, issue + ' · '));
    if (who) b.appendChild(el('b', null, who + ' '));
    b.appendChild(document.createTextNode(it.bubble.text));
    b.style.left = Math.max(115, Math.min(layer.clientWidth - 115, p.left)) + 'px'; b.style.top = Math.max(100, p.top) + 'px';
    layer.appendChild(b);
    placeAlerts(App);
    // 배속이 빨라도 말풍선은 같은 실제 시간(4.5초) 동안 남는다
    root.setTimeout(function () { if (b.parentNode) b.parentNode.removeChild(b); placeAlerts(app()); }, 4500);
  }

  // 지금 보이는 배속: 멈춤·감속 중이면 1×, ‘다음 결정까지’ 중이면 ⏭, 아니면 고른 배속
  function shownSpeed() {
    if (!R || R.done) return app().speed || 1;
    if (R.hold || R.slowed) return 1;
    return R.mode === 'next' ? 'next' : R.speed;
  }
  // 운행 조작은 지도 모서리의 작은 아이콘 묶음 — 글자는 aria-label·툴팁으로(2026-10-27 시각 위계)
  function iconLabel(b, icon, text) { b.textContent = ''; b.appendChild(el('span', { 'aria-hidden': 'true' }, icon)); b.appendChild(el('span', { 'class': 'btn-text' }, text)); b.setAttribute('aria-label', text); if (!b.title) b.title = text; return b; }
  function syncControls() {
    var shown = shownSpeed();
    SPEEDS.forEach(function (n) { var b = $('#speed-' + n); if (b) b.setAttribute('aria-pressed', String(n === shown)); });
    var nx = $('#run-next'); if (nx) nx.setAttribute('aria-pressed', String(shown === 'next'));
    var pb = $('#run-pause'), paused = !!(R && !R.done && R.paused);
    if (pb) { iconLabel(pb, paused ? '▶' : '⏸', paused ? '재개' : '일시정지'); pb.setAttribute('aria-pressed', String(paused)); }
  }
  // 사건 멈춤에서 다시 달릴 때 — 플레이어가 마지막으로 고른 배속으로
  function release() {
    R.paused = false; R.hold = false; R.mode = 'normal'; R.speed = app().speed || 1; R.last = root.performance.now();
    setAlerts([]);
  }

  function setSpeed(speed) {
    app().setSpeed(speed);
    if (R && !R.done) {
      R.speed = speed; R.mode = 'normal';
      if (R.hold && R.pendingEmergency == null) { release(); setStatus('운행 중 · ' + speed + '배속'); }
      else if (R.pendingEmergency != null) setStatus('긴급 조정을 마치면 ' + speed + '배속으로 이어져요.');
      else if (R.paused) setStatus('일시정지 중 · 재개하면 ' + speed + '배속으로 이어져요.');
    }
    syncControls();
  }
  function focusEmergency() { var t = $('#emergency-title'); if (t) t.focus(); }

  function nextDecision() {
    tick();
    if (!R || R.done || R.finishing) return;
    if (R.pendingEmergency != null) { focusEmergency(); return; }
    release(); R.mode = 'next';
    setStatus('⏭ 다음 결정까지 빨리 가는 중…');
    syncControls();
  }

  // 끝까지 건너뛰기 — 남은 긴급 조정 기회가 있으면 먼저 묻고, 건너뛴 기회는 ‘변경 없이 계속’으로 기록한다
  function skipToEnd() {
    if (!R || R.done || R.finishing) return;
    var left = remainingCheckpoints();
    if (!left.length) return runToEnd([]);
    var d = $('#confirm-skip');
    if (!d || !d.showModal) return runToEnd(left);
    $('#confirm-skip-h').textContent = '남은 긴급 조정 기회 ' + left.length + '회를 쓰지 않고 넘어갈까요?';
    $('#skip-no').onclick = function () { d.close(); };
    $('#skip-yes').onclick = function () { d.close(); runToEnd(remainingCheckpoints()); };
    d.showModal();
  }
  function runToEnd(left) {
    if (!R || R.done || R.finishing) return;
    left.forEach(function (at) { PB.Session.emergencyDecision(R.s, at, null, null); });
    var d = $('#emergency-dialog'); if (d) { if (d.open) d.close(); d.remove(); }
    R.pendingEmergency = null; R.hold = false; R.mode = 'normal'; R.paused = false;
    R.tf = W; R.last = root.performance.now();
    tick();
  }

  UI.run = function (App, panel) {
    var s = App.s;
    cfg = s.config;
    panel.appendChild(el('p', { 'class': 'eyebrow' }, s.phase + '단계 · ' + cfg.phases[s.phase - 1] + ' — 운행'));
    panel.appendChild(el('h2', null, '버스가 달리고 있어요'));
    var speeds = $('#run-controls'); speeds.textContent = '';
    var paused = R && R.s === s && R.phase === s.phase && !R.done && R.paused;
    // 좁은 화면에서는 아이콘만 보이도록 글자를 따로 감싼다(이름은 aria-label로 유지)
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-pause', 'class': 'btn', 'aria-pressed': String(!!paused), onclick: function () {
      tick(); if (!R || R.done || R.finishing) return;
      if (R.pendingEmergency != null) { focusEmergency(); return; }
      if (R.paused) { release(); setStatus('운행 중 · ' + R.speed + '배속'); }
      else { R.paused = true; R.last = root.performance.now(); setStatus('일시정지 중 · 재개하면 ' + R.speed + '배속으로 이어져요.'); }
      syncControls();
    } }), paused ? '▶' : '⏸', paused ? '재개' : '일시정지'));
    var dayMs = W * cfg.playback.msPerMinute;
    SPEEDS.forEach(function (speed) {
      speeds.appendChild(el('button', { type: 'button', id: 'speed-' + speed, 'class': 'btn', 'aria-pressed': String((App.speed || 1) === speed), title: '하루를 ' + Math.round(dayMs / speed / 1000) + '초에 보기', onclick: function () { tick(); setSpeed(speed); } }, speed + '×'));
    });
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-next', 'class': 'btn', 'aria-pressed': 'false', title: '다음 긴급 조정이나 만차·대기 ' + P.ALERT_WAIT + '명 이상 같은 사건까지 빨리 가기', onclick: nextDecision }), '⏭', '다음 결정까지'));
    speeds.appendChild(iconLabel(el('button',{type:'button',id:'run-skip','class':'btn',title:'끝까지 건너뛰기',onclick:skipToEnd}),'⏩','끝까지 건너뛰기'));
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-sound', 'class': 'btn', 'aria-pressed': String(App.sound), title: '효과음 켜기/끄기', onclick: function () { App.setSound(!App.sound); if (App.sound) App.sfx('person'); } }), App.sound ? '🔊' : '🔇', '소리'));
    panel.appendChild(el('p', { id: 'run-status', 'class': 'h-small', role: 'status' }, '운행 시작'));
    var live = el('section', { id: 'run-live', 'aria-labelledby': 'run-live-h' });
    live.appendChild(el('h3', { id: 'run-live-h' }, '지금 운행 상황'));
    live.appendChild(el('dl', { 'class': 'kv run-counts' }));
    live.appendChild(el('h4', null, '주요 인물'));
    live.appendChild(el('ul', { id: 'run-residents', 'class': 'plain run-residents' }));
    panel.appendChild(live);
    panel.appendChild(el('h3', null, '운행 소식'));
    panel.appendChild(el('ul', { id: 'run-feed', 'class': 'feed', 'aria-live': 'polite' }));
    panel.appendChild(el('p', { 'class': 'note' }, '일반 버스 정원은 ' + cfg.bus.capacity + '명이에요.' + (s.config.challengeApplied && s.phase >= 6 ? ' 7호차 직행버스는 정원 18명·주행 속도 1.5배예요.' : '') + (s.config.challengeApplied && s.phase >= 8 ? ' 9호차 광역버스는 정원 24명이에요.' : '') + ' 3단계부터 오전·오후 한 번씩 멈춰 버스 한 대를 옮길 수 있어요. 조정 30분 전부터는 1배속으로 천천히 보여 주고 원인 정류장에 고리를 띄워요. ‘⏭ 다음 결정까지’는 다음 조정이나 만차·대기 ' + P.ALERT_WAIT + '명 이상 같은 사건까지 빨리 간 뒤 멈춰요. 배속은 보는 속도만 바꾸고 결과는 같아요. 지나간 소식은 결과 화면의 ‘운행 기록’에서 다시 볼 수 있어요.'));
    panel.appendChild(el('p', { id: 'node-info', 'class': 'note', 'aria-live': 'polite' }));
    App.onNodeClick = function (id) {
      var n = R && R.wait[id] ? R.wait[id][Math.max(0, R.minute)] : 0;
      $('#node-info').textContent = App.nodeName(id) + ' 정류장: 지금 기다리는 사람 ' + (n || 0) + '명';
    };
    if (!R || R.phase !== s.phase || R.s !== s || R.done) { stop(); start(App); }
    else {
      if (R.minute >= 0) { renderLive(R.minute); R.shown = 0; while (R.shown < R.items.length && R.items[R.shown].t <= R.minute) { var it = R.items[R.shown++]; $('#run-feed').insertBefore(el('li', { 'class': 'feed-' + it.cls }, it.text), $('#run-feed').firstChild); } }
      // 패널을 다시 그려도 열려 있던 긴급 조정 창은 그대로 다시 연다
      if (R.pendingEmergency != null) showEmergency(R.pendingEmergency);
      syncControls();
    }
    return { keepBuses: true };
  };
  UI.stopRun = stop;
  // 테스트용 — 지금 재생 상태(위치·모드·멈춤 이유)
  UI.runState = function () { return R ? { tf: R.tf, mode: R.mode, hold: R.hold, paused: !!R.paused, slowed: !!R.slowed, speed: R.speed, shown: shownSpeed(), pendingEmergency: R.pendingEmergency, alerts: R.alerts.slice(), notables: R.notables.slice() } : null; };

  document.addEventListener('visibilitychange', function () { if (R && !document.hidden) R.last = root.performance.now(); });
})(window);
