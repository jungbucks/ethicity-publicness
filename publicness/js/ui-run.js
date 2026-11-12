/*
 * 운행 화면 — 엔진 결과를 1×·2×로 재생하고, ‘⏭ 다음 멈춤까지’로 노선을 고칠 수 있게 되는 11:00이나 주요 인물 판정이
 * 바뀌는 순간까지 빨리 간 뒤 1×로 멈춘다(규칙은 run-pace.js). 3단계부터 11:00~15:00에 한 번 「노선 고치기 · 한 번」으로
 * 멈추고 한 가지(정류장 더하기·빼기·버스 옮기기)를 바꾼다(2026-11-09, 옛 10:06·15:03 긴급 조정 대체 — js/midday.js). 엔진 결과는 출발할 때 이미 계산되어 배속은 재생 속도만 바꾼다
 * (수송·대기·비용·인물 판정은 같다). 고른 배속(1·2)은 이 브라우저에 기억하고, 멈췄다가 결정이 끝나면 그 배속으로 돌아간다.
 * 빨리 지나가도 읽을 수 있게 ‘지금 운행 상황’(도착·대기·노선 없음·만차·주요 인물)을 분마다 갱신하고,
 * 지나간 소식은 운행 소식 목록과 결과 화면의 ‘운행 기록’에 남긴다.
 * 노선 고치기 창은 지도를 가리지 않도록 오른쪽 패널 맨 위에 열린다(모달 아님, 옛 긴급 조정 창 자리 #emergency-dialog).
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
        items.push({ t: e.t, cls: 'event', text: app().clock(e.t) + ' · 갑자기 ' + app().nodeName(od.o) + '에서 ' + PB.Narrative.josa(app().nodeName(od.d), '으로') + ' 가려는 요청이 늘었어요(' + app().duration(c.events.extraMinutes) + ' 동안 12건).' });
      }
      if (e.type === 'petition') {
        var complaint = '우리 동네에서 출발한 요청 ' + e.data.count + '건이 아직 도착하지 못했어요.' + (e.data.fixed && e.data.noRecord ? ' 지난번엔 버스가 없어서 다들 걸어 다녔죠. 기록에 있을 리가 없잖아요.' : '');
        items.push({ t: e.t, cls: 'event', node: e.node, bubble: { kind: 'petition', text: complaint }, text: app().clock(e.t) + ' · ' + app().nodeName(e.node) + ' 주민 청원: “' + complaint + '”' });
      }
    });
    var fullSeen = {};
    res.log.forEach(function (e) {
      if (e.type !== 'full' || fullSeen[e.node]) return;
      fullSeen[e.node] = true;
      var complaint = runBusName(app(), res, e.bus, e.t) + '가 만차라 ' + e.data.left + '명이 못 탔어요. 다음 버스를 기다려요.';
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
    if (p.fail === 'TOO_MANY_TRANSFERS') return where + ' — ' + app().nodeName(p.o) + '→' + dest + ' 갈아타기를 두 번 해야 해서 못 감(갈아타기는 한 번까지)';
    if (p.fail === 'NO_TRIP_IN_WINDOW') return where + ' — 운행 시간 안에 탈 수 있는 버스가 없음';
    if (p.arriveT != null && p.arriveT <= m) return dest + ' 도착 ' + app().clock(p.arriveT) + (p.leg === 'return' ? ' · 일정 끝' : ' · 볼일 뒤 다음 이동');
    var boards = R.boardsByPid[p.id] || [], boarded = boards.filter(function (t) { return t <= m; });
    var onBus = R.onBusAt(p.id, m);
    if (onBus) return PB.Narrative.josa(dest, '으로') + ' 가는 버스 안' + (boarded.length > 1 ? ' · 갈아탄 뒤' : '');
    if (boarded.length) return '갈아탈 버스를 기다리는 중';
    return app().nodeName(p.o) + '에서 기다리는 중 · ' + app().duration(m - p.t) + '째';
  }

  // 주요 인물의 이동 이름(기준 초과 문구): 첫 이동 = 가는 길, 다음 이동 = 돌아오는 길(집이 아닌 곳으로 이어지면 다음 이동)
  UI.legName = function (rd, leg) { return leg === 'return' ? (rd && rd.returnTo ? '다음 이동' : '돌아오는 길') : '가는 길'; };

  function start(App) {
    var s = App.s;
    cfg = s.config;
    W = cfg.bus.window;
    // tf = 재생 위치(엔진 시간). mode 'next' = ‘다음 결정까지’ 빨리 가는 중, hold = 사건·조정 시점에서 1×로 멈춤
    R = { phase: s.phase, s: s, tf: s.runCursor || 0, speed: App.speed || 1, mode: 'normal', hold: false, pendingEmergency: null, last: null, minute: -1, done: false, shown: 0, lastBubbleAt: {}, alerts: [], alertKey: '' };
    R.res = s.current.result;
    R.wait = P.waitingTable(R.res, cfg);
    R.notables = P.notables(R.res, R.wait, cfg); // 일반 사건(만차·대기 10명) — 멈추지 않고 지도 표시·소식에만(P1-2)
    R.stops = P.residentStops(R.res, cfg); // ‘⏭ 다음 멈춤까지’가 서는 곳: 주요 인물 왕복 완료·기준 초과 + 노선을 고칠 수 있게 되는 11:00(한 번)
    var fst = PB.Session.midStatus(s, PB.Midday.span(cfg).open); R.fixAt = fst.why == null || fst.why === 'early' ? fst.open : null;
    if (R.fixAt != null) R.stops = R.stops.concat([{ t: R.fixAt, kind: 'resident', what: 'window', resident: null }]).sort(function (a, b) { return a.t - b.t || (a.what === 'window' ? -1 : 1); });
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
    /* 2026-11-11 플레이테스트 6: 상태 줄은 운행을 시작할 때마다 새로 쓴다 — 전에는 지난 단계의 마지막 문장(‘11:00 · 이제 15:00까지…’)이 남아 06:03에도 보였다.
     * 11:00 전에는 ‘11:00부터’, 창이 열린 뒤 이어 보는 운행이면 ‘이제 15:00까지’ */
    setStatus(startText(s));
    R.timer = root.setInterval(tick, 50);
    R.raf=root.requestAnimationFrame(function loop() { if (!R || R.done) return; tick(); R.raf = root.requestAnimationFrame(loop); });
  }

  // 운행을 시작할 때 상태 줄 첫 문장(노선 고치기는 3단계부터, 11:00~15:00에 한 번)
  function startText(s) {
    var st = PB.Session.midStatus(s, R.tf), span = fixSpan().split('~');
    if (st.why === 'early') return '운행 시작 · ' + span[0] + '부터 노선을 한 번 고칠 수 있어요.';
    if (st.ok) return '이제 ' + span[1] + '까지 노선을 한 번 고칠 수 있어요(‘노선 고치기 · 한 번’).';
    return '운행 시작';
  }
  UI.runStartText = function () { return R ? startText(R.s) : ''; };
  function stop() {
    if (!R) return;
    root.clearInterval(R.timer);
    if (R.raf) root.cancelAnimationFrame(R.raf);
    R.done = true;
    /* 2026-11-12 랜덤 검토 9번: 운행이 끝나면 상태 줄 문장(예: ‘11:00 · 이제 15:00까지…’)과 11:00 물음 창을 지운다 — 다음 계획 화면(05:00)에 남지 않게 */
    var sbt = document.getElementById('run-statusbar-text'); if (sbt) sbt.textContent = ''; var ask = document.getElementById('skip-fix-ask'); if (ask) ask.remove();
    document.querySelectorAll('#stage-overlay .bubble').forEach(function (b) { b.remove(); });
    clearAlerts();
  }

  function tick() {
    if (!R || R.done) return;
    var now = root.performance.now();
    if (R.last == null) R.last = now;
    var dt = now - R.last;
    R.last = now;
    // 확인창(건너뛰기·도움말·설정 등 모달)이 열려 있는 동안은 시계를 멈춘다 — 닫히면 R.last가 이미 지금이라 원래 배속으로 이어 간다(2026-11-01)
    if (document.hidden || R.paused || modalOpen()) return;
    var App = app(), cp = nextCheckpoint();
    /* 2026-11-11 플레이테스트 6: 노선을 고칠 수 있게 되는 11:00에는 어떤 배속이든 한 번 멈춰서 알린다(2×로는 4초쯤만 열려 있었다). 테스트용 빠른 재생(__pbFast)은 서지 않는다 */
    var stopAt = P.nextStop(R.tf, { mode: R.mode, notables: R.stops, checkpoint: cp, must: root.__pbFast ? null : R.fixAt });
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
      var opened = R.fixAt != null && R.minute < R.fixAt && m >= R.fixAt && !reached && tf < W; /* 끝까지 건너뛰며 지나간 11:00은 알리지 않는다(2026-11-12 랜덤 검토 9번 — 그 문장이 다음 계획 화면까지 남았다) */
      R.minute = m;
      R.s.runCursor=m;App.save();
      if (opened) { setStatus(App.clock(R.fixAt) + ' · 이제 ' + fixSpan().split('~')[1] + '까지 노선을 한 번 고칠 수 있어요(‘노선 고치기 · 한 번’).'); pulseFix(); }
      onMinute(App, m); syncNext(); syncFix(); if (PB.Hud && PB.Hud.live) PB.Hud.live(R.res, tf);
    }
    if (reached) holdAt(App, stopAt);
    else updatePreview(App, tf, cp);
    if (tf >= W && !R.finishing) {
      R.finishing = true;
      clearAlerts();
      var st = $('#run-status');
      if (st) st.textContent = '운행이 끝났어요.';
      root.setTimeout(function () {
        stop();
        if (App.s === R.s && App.s.stage === 'run') { PB.Session.finishRun(App.s); App.go('result'); }
      }, root.__pbFast ? 30 : 1000);
    }
  }

  function modalOpen() {
    try { return !!document.querySelector('dialog:modal'); } catch (e) { return !!document.querySelector('dialog[open]:not(#emergency-dialog)'); }
  }
  // 운행 중 노선 고치기가 있는 단계(3단계부터)인가 — 안내 문구가 이걸 따른다
  function hasEmergency(s) { return !!s && s.phase >= 3; }
  function nextLabel() { return '다음 멈춤까지'; } // P1-2: 모든 단계 같은 이름
  var NEXT_TITLE = '다음 멈춤까지 빨리 가기 — 노선을 고칠 수 있게 되는 11:00, 주요 인물 판정이 바뀌는 순간(왕복 완료·오늘 기준 초과)에서 멈춰요';
  function stopsLeft() { return !!R && !R.done && (nextCheckpoint() != null || (R.stops || []).some(function (n) { return n.t > R.tf; })); }

  // 정해진 시각에 멈추는 조정은 없다(2026-11-09: 옛 10:06·15:03 긴급 조정 → 학생이 고르는 「노선 고치기 · 한 번」). 감속·고정 멈춤도 없음
  function remainingCheckpoints() { return []; }
  function nextCheckpoint() { var left = remainingCheckpoints(); return left.length ? left[0] : null; }

  // 조정 시점의 원인 정류장 = 그 시각 대기(지도 숫자와 같은 기준)가 가장 많은 곳
  function causeAt(at) {
    if (R.causeAt[at] !== undefined) return R.causeAt[at];
    var m = Math.floor(at), top = null;
    Object.keys(R.wait).forEach(function (n) { var w = R.wait[n][m] || 0; if (w && (!top || w > top.n)) top = { node: n, n: w }; });
    return (R.causeAt[at] = top);
  }
  function waitNow(node, m) { return (R.wait[node] && R.wait[node][Math.max(0, Math.floor(m))]) || 0; }

  // 주요 인물 판정·11:00(노선 고치기 시작)에 닿으면 1×로 돌아와 멈춘다
  function holdAt(App, stopAt) {
    R.paused = true; R.hold = true; R.mode = 'normal';
    {
      var who = function (n) { var r = R.s.config.residents.filter(function (x) { return x.id === n.resident; })[0]; return r ? r.name : n.resident; };
      var rdOf = function (n) { return R.s.config.residents.filter(function (x) { return x.id === n.resident; })[0]; };
      /* 2026-11-05 P1-5: 기준 초과는 어느 길인지 구분. 정류장을 모르면(예외) 그 사람의 출발 정류장에 말풍선 */
      var said = function (n) { return n.what === 'done' ? who(n) + ' 왕복 완료' : who(n) + ' ' + UI.legName(rdOf(n), n.leg) + ' 기준 초과(한 번 이동 대기 ' + App.duration(R.s.config.service.maxWait) + ' 넘음)'; };
      var people = stopAt.items.filter(function (n) { return n.what !== 'window'; }), win = people.length !== stopAt.items.length;
      setAlerts(people.map(function (n) { var rd = rdOf(n); return { node: n.node || (rd && rd.o), kind: n.what === 'done' ? 'wait' : 'full', text: said(n) }; }).filter(function (a) { return a.node; }));
      // 멈춘 이유를 맨 앞에(예: ‘하늘 왕복 완료’)
      /* 2026-11-06 P2-5: 멈춘 이유를 문장으로(‘하늘이 왕복을 마쳐서 멈췄어요’). 지도 말풍선은 짧은 said 그대로 */
      var because = function (n) { return n.what === 'done' ? PB.Narrative.josa(who(n), '이가') + ' 왕복을 마쳐서' : who(n) + '의 ' + UI.legName(rdOf(n), n.leg) + ' 기다림이 기준(' + App.duration(R.s.config.service.maxWait) + ')을 넘어서'; };
      var why = (people.length ? people.map(because).join(', ') + ' 멈췄어요.' : '') + (win ? (people.length ? ' ' : '') + '이제 ' + fixSpan().split('~')[1] + '까지 노선을 한 번 고칠 수 있어요(‘노선 고치기 · 한 번’).' : '');
      if (win) pulseFix();
      if (PB.Hud && PB.Hud.render) PB.Hud.render(App);
      /* 2026-11-02 재검증 P1-2: 그날 마지막 멈춤(예: 20:45 하늘 왕복 완료)이면 ⏭는 꺼져 있다(‘남은 멈춤 없음’) — 안내문도 ⏭ 대신 ▶·⏩를 말한다 */
      setStatus(App.clock(stopAt.t) + ' ' + why + ' ' + (stopsLeft() ? '재개하면 ' + App.speed + '배속, 다음 멈춤을 누르면 ' + nextLabel(R.s) + ' 빨리 가요.' : '남은 멈춤이 없어요. 재개하거나 끝까지 가요.'), true);
    }
    syncControls();
  }
  // 일반 사건(만차·대기 10명)은 멈추지 않고 지난 약 30분 동안 지도에 표시만(P1-2). 정해진 조정 시각이 없어 감속 구간도 없다(2026-11-09)
  function updatePreview(App, tf) {
    if (R.slowed) { R.slowed = false; syncControls(); }
    if (R.hold) return;
    var recent = (R.notables || []).filter(function (n) { return n.t <= tf && tf - n.t < 4; });
    setAlerts(recent.map(function (n) { var name = App.nodeName(n.node); return n.kind === 'full' ? { node: n.node, kind: 'full', text: name + ' · ' + runBusName(App, R.res, n.bus, n.t) + '가 만차라 ' + n.n + '명 못 탐' } : { node: n.node, kind: 'wait', text: name + ' 대기 ' + n.n + '명' }; }));
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
        if (!tray) { tray = el('div', { id: 'map-notice-overflow', 'class': 'map-notice-overflow' }); var bc = document.body.classList; if ((bc.contains('phone-p') || bc.contains('phone-l') || bc.contains('rail') || bc.contains('sheet')) && $('#map-strip')) $('#map-strip').appendChild(tray); else $('#stage').after(tray); } /* 휴대폰 배치는 알림 줄 안(지도 크기 그대로, 2026-11-02) */
        var item = box._overflow;
        if (!item) { item = el('div'); tray.appendChild(item); box._overflow = item; }
        var nm = App.nodeName(box.dataset.node); item.textContent = label.textContent.indexOf(nm) === 0 ? label.textContent : nm + ' · ' + label.textContent;
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
  /* 상태 줄(2026-11-05 P1-5): #run-status는 미니멀 화면에서 패널과 함께 숨어 있어 멈춘 이유가 2초 알림으로만 스쳐 갔다. 지도 아래 #run-statusbar에 멈춘 동안 그대로 남긴다.
   * 2026-11-09: 옛 ‘긴급 조정 열기’ 자리에 「노선 고치기 · 한 번」(#run-fix) + 못 쓰는 이유 한 줄(#run-fix-why). 텍스트 모드·기본 화면은 패널의 #run-fix-panel */
  function statusBar() {
    var strip = $('#map-strip'), bar = $('#run-statusbar'); if (!strip) return null;
    if (!bar) {
      bar = el('div', { id: 'run-statusbar', 'class': 'run-statusbar' }); bar.appendChild(el('p', { id: 'run-statusbar-text', role: 'status' }));
      bar.appendChild(fixBox('run-fix'));
      strip.insertBefore(bar, strip.firstChild);
    }
    return bar;
  }
  function setStatus(text, held) {
    var st = $('#run-status'); if (st) st.textContent = text;
    var bar = statusBar(); if (!bar) return;
    $('#run-statusbar-text').textContent = text; bar.classList.toggle('is-hold', !!held);
    syncFix();
  }

  /* ── 운행 중 노선 고치기(하루 한 번, 2026-11-09) ── 창(#emergency-dialog 자리·배치 재사용: 오른쪽 칸/아래 시트, 비모달 + 뒤쪽 inert).
   * 보이는 것 = 학생이 이미 볼 수 있는 상황(정류장 대기 = 지도 숫자, 지도)과 고친 뒤 노선 모양뿐 — AI 제안·예상 숫자 없음.
   * 고친 시각 = 멈춘 위치를 올린 정수(Midday.atFor), 그 시각으로 재생을 옮겨 멈춘다. 그만두면 안 쓴 것(나중에 다시 가능) */
  var FIX_RULE = '버스는 가던 정류장까지 간 뒤 바뀐 노선을 따라요. 빠진 정류장에서 내리려던 사람은 다음 정류장에서 내려요.';
  UI.FIX_RULE = FIX_RULE;
  function hm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function fixSpan() { return hm(PB.Midday.FROM) + '~' + hm(PB.Midday.TO); }
  UI.fixSpan = fixSpan;
  function fixBox(id) {
    var box = el('div', { 'class': 'run-fix', id: id + '-box' }); box.hidden = true;
    box.appendChild(el('button', { type: 'button', id: id, 'class': 'btn run-fix-btn', 'aria-describedby': id + '-why', onclick: function () { openFix(); } }, '노선 고치기 · 한 번'));
    box.appendChild(el('span', { 'class': 'run-fix-why', id: id + '-why' }));
    return box;
  }
  function fixState() { return R && !R.done ? PB.Session.midStatus(R.s, R.tf) : null; }
  function fixWhy(st) { return !st ? '' : st.ok && R && R.pendingEmergency != null ? '고치는 중이에요' : st.ok ? '지금 한 번 고칠 수 있어요' : st.why === 'used' ? '오늘은 이미 고쳤어요' : fixSpan() + '에 한 번 쓸 수 있어요'; }
  function syncFix() {
    var st = fixState(), show = !!st && st.why !== 'phase';
    ['run-fix', 'run-fix-panel'].forEach(function (id) {
      var b = document.getElementById(id); if (!b) return; var box = b.parentNode;
      box.hidden = !show; b.disabled = !st || !st.ok || R.pendingEmergency != null || !!R.finishing;
      var w = document.getElementById(id + '-why'); if (w && w.textContent !== fixWhy(st)) w.textContent = fixWhy(st);
      box.classList.toggle('is-open', !!st && st.ok);
    });
  }
  function pulseFix() { ['run-fix-box', 'run-fix-panel-box'].forEach(function (id) { var b = document.getElementById(id); if (!b) return; b.classList.remove('is-new'); void b.offsetWidth; b.classList.add('is-new'); root.setTimeout(function () { b.classList.remove('is-new'); }, 3000); }); }
  // 「노선 고치기 · 한 번」 — 재생을 고친 시각으로 옮겨 멈추고 창을 연다
  function openFix() {
    tick(); var App = app(), st = fixState(); if (!R || R.done || R.finishing || !st || !st.ok || R.pendingEmergency != null) return;
    var at = st.at; R.paused = true; R.hold = true; R.mode = 'normal';
    if (at > R.tf) { R.tf = at; drawBuses(App, at); }
    var m = Math.floor(at); if (m !== R.minute) { R.minute = m; onMinute(App, m); if (PB.Hud && PB.Hud.live) PB.Hud.live(R.res, at); }
    R.s.runCursor = at; App.save();
    showFix(at); syncControls();
  }
  UI.openFix = openFix;
  // 결과 화면·알림 한 줄: ‘12:40 노선 고침 · 빨강 노선에 구도심 시장 더함’
  UI.midText = function (App, c) {
    var J = PB.Narrative.josa;
    if (c.kind === 'move') return PB.Names.bus(c.busId, null, c.from) + ' 한 대를 ' + J(PB.Names.route(c.routeNum), '으로') + ' 옮김';
    return PB.Names.route(c.routeNum) + (c.kind === 'add' ? '에 ' + App.nodeName(c.node) + ' 더함' : '에서 ' + App.nodeName(c.node) + ' 뺌');
  };
  UI.midLine = function (App, c) { return App.clock(c.at) + ' 노선 고침 · ' + UI.midText(App, c); };
  function showFix(at) {
    var App = app(), S = PB.Session, M = PB.Midday, s = R.s, panel = $('#panel'), g = S.graph(s);
    R.pendingEmergency = at;
    Array.prototype.slice.call(document.querySelectorAll('#stage-overlay .bubble')).forEach(function (b) { b.remove(); });
    setAlerts([]);
    setStatus(App.clock(at) + ' · 멈췄어요. 한 가지를 고치거나 그만두면 ' + App.speed + '배속으로 이어져요.', true);
    var d = $('#emergency-dialog'); if (!d) d = el('dialog', { id: 'emergency-dialog', 'class': 'emergency-window fix-window', 'aria-labelledby': 'emergency-title' });
    if (panel && d.parentNode !== panel) panel.insertBefore(d, panel.firstChild);
    d.textContent = ''; d.oncancel = function (e) { e.preventDefault(); cancel(); };
    d.appendChild(el('h2', { id: 'emergency-title', tabindex: '-1' }, App.clock(at) + ' · 노선 고치기'));
    d.appendChild(el('p', { id: 'fix-rule', 'class': 'note fix-rule' }, '한 가지만 바꿀 수 있어요. ' + FIX_RULE));
    var m = Math.floor(at), waits = Object.keys(R.wait).map(function (n) { return { node: n, n: R.wait[n][m] || 0 }; }).filter(function (x) { return x.n > 0; })
      .sort(function (a, b) { return b.n - a.n || (a.node < b.node ? -1 : 1); }).slice(0, 3);
    d.appendChild(el('p', { id: 'fix-now', 'class': 'fix-now' }, waits.length ? '지금 기다리는 사람 · ' + waits.map(function (x) { return App.nodeName(x.node) + ' ' + x.n + '명'; }).join(' · ') : '지금 정류장에서 기다리는 사람은 없어요.'));
    // 고를 수 있는 것(규칙에 맞는 것만 — Session.midRoute·canAssign과 같은 판정)
    var running = S.runningRoutes(s), labs = runBusLabels(App, R.res, at), cur = {}, count = {};
    s.draft.buses.forEach(function (b) { var n = S.busRouteAt(s, b.id, at); cur[b.id] = n; if (n != null) count[n] = (count[n] || 0) + 1; });
    var valid = S.routesInOrder(s).filter(function (r) { return r.nodes.length >= 2 && !PB.Graph.validateRoute(g, r).length; });
    function targets(id) { return valid.filter(function (r) { return r.num !== cur[id] && S.canAssign(s, id, r.num); }); }
    function addPos(r, id) { return M.shortestPos(r, id, g.dist); }
    function canAdd(r, id) { return r.nodes.indexOf(id) < 0 && M.positions(r).some(function (p) { return !!S.midRoute(s, r.num, 'add', id, p).route; }); }
    function canRemove(r, id) { return !!S.midRoute(s, r.num, 'remove', id).route; }
    function uniq(r) { return PB.Graph.isLoop(r) ? r.nodes.slice(0, -1) : r.nodes; }
    var addRoutes = running.filter(function (r) { return g.nodes.some(function (id) { return canAdd(r, id); }); });
    var cutRoutes = running.filter(function (r) { return uniq(r).some(function (id) { return canRemove(r, id); }); });
    var movable = s.draft.buses.filter(function (b) { return targets(b.id).length; });
    var kinds = [{ id: 'add', text: '정류장 더하기', ok: addRoutes.length > 0, no: '더할 수 있는 노선이 없어요' }, { id: 'remove', text: '정류장 빼기', ok: cutRoutes.length > 0, no: '정류장을 뺄 수 있는 노선이 없어요(두 곳은 남아야 해요)' }, { id: 'move', text: '버스 옮기기', ok: movable.length > 0, no: '옮길 수 있는 버스가 없어요' }];
    var st = { kind: null, num: null, node: null, pos: null, bus: null, to: null };
    var row = el('div', { 'class': 'fix-kinds', role: 'group', 'aria-label': '무엇을 고칠까요?' }), fields = el('div', { id: 'fix-fields', 'class': 'fix-fields' });
    var result = el('p', { id: 'fix-result', 'class': 'fix-result', 'aria-live': 'polite' }), warn = el('p', { id: 'fix-warn', 'class': 'emergency-warn', role: 'alert' }); warn.hidden = true;
    d.appendChild(el('h3', { id: 'fix-kinds-h' }, '무엇을 고칠까요?'));
    kinds.forEach(function (k) {
      var b = el('button', { type: 'button', id: 'fix-kind-' + k.id, 'class': 'btn fix-kind', 'aria-pressed': 'false' }, k.text);
      if (!k.ok) { b.disabled = true; b.title = k.no; b.setAttribute('aria-label', k.text + ' · ' + k.no); }
      b.onclick = function () { st.kind = k.id; row.querySelectorAll('button').forEach(function (n) { n.setAttribute('aria-pressed', String(n === b)); }); build(); };
      row.appendChild(b);
    });
    d.appendChild(row); d.appendChild(fields); d.appendChild(result); d.appendChild(warn);
    var apply = el('button', { type: 'button', id: 'fix-apply', 'class': 'btn btn-primary', onclick: finish }, '이렇게 고치기'); apply.disabled = true;
    var actions = el('div', { 'class': 'row-actions' });
    actions.appendChild(el('button', { type: 'button', id: 'fix-cancel', 'class': 'btn', onclick: cancel }, '그만두기'));
    actions.appendChild(apply); d.appendChild(actions);
    function routeLabel(r) { var ns = uniq(r); return PB.Names.route(r.num) + ' · ' + (PB.Graph.isLoop(r) ? App.nodeName(ns[0]) + ' 순환' : App.nodeName(ns[0]) + '~' + App.nodeName(ns[ns.length - 1])) + ' · ' + ns.length + '곳'; }
    function waitText(id) { var n = R.wait[id] ? R.wait[id][m] || 0 : 0; return n ? ' · 대기 ' + n + '명' : ''; }
    function select(id, label, opts, value, onchange) {
      var wrap = el('div', { 'class': 'fix-field' }), x = el('select', { id: id });
      wrap.appendChild(el('label', { 'for': id }, label));
      opts.forEach(function (o) { var op = el('option', { value: o.value }, o.text); if (o.disabled) op.disabled = true; x.appendChild(op); });
      x.value = value == null ? '' : String(value);
      x.addEventListener('change', function () { onchange(x.value); show(); });
      wrap.appendChild(x); fields.appendChild(wrap); return x;
    }
    function build() {
      fields.textContent = ''; st.node = null; st.pos = null; st.bus = null; st.to = null;
      if (st.kind === 'add' || st.kind === 'remove') {
        var list = st.kind === 'add' ? addRoutes : cutRoutes;
        if (!list.some(function (r) { return r.num === st.num; })) st.num = list.length ? list[0].num : null;
        select('fix-route', '노선', list.map(function (r) { return { value: r.num, text: routeLabel(r) }; }), st.num, function (v) { st.num = Number(v); build(); });
        var r = S.routeByNum(s, st.num);
        if (st.kind === 'add') {
          var cands = g.nodes.filter(function (id) { return r.nodes.indexOf(id) < 0; }).sort(function (a, b) { return App.nodeName(a) < App.nodeName(b) ? -1 : 1; });
          select('fix-node', '더할 정류장', [{ value: '', text: '정류장 고르기' }].concat(cands.map(function (id) { var ok = canAdd(r, id); return { value: id, text: App.nodeName(id) + waitText(id) + (ok ? '' : ' · 이 노선엔 못 넣어요'), disabled: !ok }; })), null, function (v) {
            st.node = v || null; st.pos = st.node ? addPos(r, st.node) : null; build2(r);
          });
          build2(r);
        } else {
          select('fix-node', '뺄 정류장', [{ value: '', text: '정류장 고르기' }].concat(uniq(r).map(function (id) { var ok = canRemove(r, id); return { value: id, text: App.nodeName(id) + waitText(id) + (ok ? '' : ' · 뺄 수 없어요'), disabled: !ok }; })), null, function (v) { st.node = v || null; });
        }
      } else if (st.kind === 'move') {
        select('fix-bus', '옮길 버스', [{ value: '', text: '버스 고르기' }].concat(movable.map(function (b) { return { value: b.id, text: (labs[b.id] || PB.Names.bus(b.id, null, cur[b.id])) + (cur[b.id] != null ? ' · 지금 ' + PB.Names.route(cur[b.id]) : ' · 대기 중') }; })), null, function (v) {
          st.bus = v ? Number(v) : null; st.to = null; var old = fields.querySelector('#fix-to'); if (old) old.parentNode.remove(); if (st.bus != null) toField();
        });
      }
      show();
    }
    function build2(r) {
      var old = fields.querySelector('#fix-pos'); if (old) old.parentNode.remove();
      if (!st.node) return;
      var n = r.nodes.length, loop = PB.Graph.isLoop(r);
      var opts = M.positions(r).filter(function (p) { return !!S.midRoute(s, r.num, 'add', st.node, p).route; }).map(function (p) {
        var text = p === -1 ? '맨 앞 · ' + App.nodeName(r.nodes[0]) + ' 앞' : !loop && p === n - 1 ? '맨 끝 · ' + App.nodeName(r.nodes[n - 1]) + ' 뒤' : App.nodeName(r.nodes[p]) + '–' + App.nodeName(r.nodes[p + 1]) + ' 사이';
        return { value: p, text: text };
      });
      if (!opts.some(function (o) { return o.value === st.pos; })) st.pos = opts.length ? opts[0].value : null;
      select('fix-pos', '넣을 곳', opts, st.pos, function (v) { st.pos = Number(v); });
    }
    function toField() {
      select('fix-to', '새 노선', [{ value: '', text: '노선 고르기' }].concat(targets(st.bus).map(function (r) { return { value: r.num, text: routeLabel(r) }; })), null, function (v) { st.to = v ? Number(v) : null; });
    }
    // 노선의 유일한 버스를 옮길 때 그 노선을 쓰고 아직 하루 이동을 마치지 않은 주요 인물(경로 = 인물 칩과 같은 직행·한 번 환승) — 옛 긴급 조정 경고와 같은 사실
    var recs = PB.ResidentEvaluation.records(s.config, s.phase, R.res);
    function riders(num) {
      var routes = PB.Hud ? PB.Hud.routesNow() : [];
      return PB.Demand.residents(s.config, s.phase).filter(function (rd) {
        var rec = recs[rd.id]; if (rec && rec.homeT != null && rec.homeT <= at) return false;
        var path = PB.Hud && PB.Hud.pathFor(routes, rd.o, rd.d), back = PB.Hud && PB.Hud.pathFor(routes, rd.d, rec && rec.finalDestination || rd.o);
        return [path, back].some(function (p) { return p && p.legs.some(function (l) { return l.num === num; }); });
      });
    }
    function change() { return { at: at, kind: st.kind, routeNum: st.kind === 'move' ? st.to : st.num, node: st.node, pos: st.pos, busId: st.bus }; }
    // 고르면 바로 한 줄: 바뀐 노선 모양 / 버스가 새 노선에 들어가는 시각(엔진으로 미리 계산만, 결과는 그대로). 지도에는 고른 정류장 고리
    function show() {
      warn.hidden = true; apply.disabled = true;
      if (!st.kind) { result.textContent = '위에서 한 가지를 골라요.'; setAlerts([]); return; }
      if (st.kind === 'move') {
        setAlerts([]);
        if (st.bus == null || st.to == null) { result.textContent = st.bus == null ? '옮길 버스를 골라요.' : '버스가 갈 노선을 골라요.'; return; }
        var p = S.emergencyPreview(s, at, st.bus, st.to), who = labs[st.bus] || PB.Names.bus(st.bus, null, cur[st.bus]);
        result.textContent = !p || p.starts == null ? who + '는 운행이 끝날 때까지 ' + PB.Names.route(st.to) + '에 들어가지 못해요.' : who + '는 ' + (p.resting ? '차고에서 출발해 ' : '승객을 다 내린 뒤 ') + App.clock(p.starts) + '부터 ' + PB.Names.route(st.to) + '을 달려요.';
        var n = cur[st.bus]; if (n != null && (count[n] || 0) === 1) { var who = riders(n); warn.textContent = PB.Names.route(n) + ' 버스가 0대가 돼요. ' + (who.length ? '이 노선을 쓰는 ' + who.map(function (rd) { return rd.name + '(' + App.nodeName(rd.o) + '→' + App.nodeName(rd.d) + ')'; }).join(', ') + '의 남은 이동이 끊길 수 있어요.' : '이 노선에서 기다리는 사람은 버스를 못 타요.'); warn.hidden = false; }
        apply.disabled = false; reveal(); return;
      }
      if (!st.node) { result.textContent = st.kind === 'add' ? '더할 정류장을 골라요.' : '뺄 정류장을 골라요.'; setAlerts([]); return; }
      setAlerts([{ node: st.node, kind: 'emergency', text: st.kind === 'add' ? '여기에 더해요' : '여기를 빼요' }]);
      var mr = S.midRoute(s, st.num, st.kind, st.node, st.pos);
      if (!mr.route) { result.textContent = mr.fail; return; }
      result.textContent = '바뀐 ' + PB.Names.route(st.num) + ': ' + mr.route.nodes.map(App.nodeName).join(' → ');
      apply.disabled = false; reveal();
    }
    // 고를 것이 다 차면 ‘이렇게 고치기’가 보이게(오른쪽 칸·아래 시트는 창 안에서 스크롤)
    function reveal() { try { actions.scrollIntoView({ block: 'nearest', behavior: App.reducedMotion() ? 'auto' : 'smooth' }); } catch (e) {} }
    function finish() {
      if (apply.disabled) return;
      if (!S.midApply(s, change())) { result.textContent = '지금은 이렇게 고칠 수 없어요. 다시 골라 주세요.'; return; }
      var line = UI.midText(App, s.midChanges[s.midChanges.length - 1]);
      s.runCursor = at; d.close(); d.remove(); syncInert(); stop(); start(app()); app().save(); app().syncStage({ keepBuses: true });
      setStatus('노선을 고쳤어요 · ' + line + '. ' + app().speed + '배속으로 이어 가요.');
      app().toast('노선을 고쳤어요 · ' + line, { priority: true });
    }
    function cancel() {
      if (d.open) d.close(); d.remove(); syncInert(); R.pendingEmergency = null; release();
      setStatus('그만뒀어요. ' + fixSpan() + ' 안에서는 다시 고칠 수 있어요 · ' + R.speed + '배속'); syncControls();
    }
    build();
    if (document.body.classList.contains('panel-collapsed')) App.setPanelCollapsed(false); // 창은 패널 안에 있다
    if (!d.open) d.show();
    if (panel) panel.scrollTop = 0;
    syncInert(); syncFix();
    $('#emergency-title').focus({ preventScroll: true });
  }

  /* 운행 중 버스 이름(2026-11-02): 번호(N호차) 대신 그 시각에 달리던 노선 색 — ‘초록 버스’, 쉬는 버스는 ‘대기 버스’(js/route-names.js) */
  function runBusName(App, res, id, t) { var tl = res && res.timelines.filter(function (x) { return x.busId === id; })[0]; return PB.Names.bus(id, null, tl ? busAt(App, tl, t).num : undefined); }
  // 같은 이름이 둘 이상이면 (첫째)·(둘째) — 노선 고치기 창처럼 버스를 하나씩 골라야 할 때
  function runBusLabels(App, res, t) {
    var tls = res.timelines.slice().sort(function (a, b) { return a.busId - b.busId; }), names = tls.map(function (tl) { return PB.Names.bus(tl.busId, null, busAt(App, tl, t).num); }), seen = {}, out = {}, ORD = ['첫째', '둘째', '셋째', '넷째', '다섯째', '여섯째', '일곱째', '여덟째', '아홉째'];
    tls.forEach(function (tl, i) { var n = names[i], k = names.filter(function (x) { return x === n; }).length; seen[n] = (seen[n] || 0) + 1; out[tl.busId] = k > 1 ? n + '(' + (ORD[seen[n] - 1] || seen[n]) + ')' : n; });
    return out;
  }
  // 버스 한 대의 그 시각 노선 번호·위치
  function busAt(App, tl, t) {
    var changes = (tl.assignments || []).filter(function (a) { return a.t <= t; }), route = changes.length ? changes[changes.length - 1].route : tl.route;
    return { pos: PB.Schedule.positionAt(tl, cfg, t), num: route ? App.numForPlanRoute(route) : null };
  }
  function busWhere(App, b, riders) {
    var p = b.pos, line = b.num ? PB.Names.route(b.num) : '노선 없음', text;
    if (p.node && p.parked) text = b.num ? line + ' · ' + App.nodeName(p.node) + '에서 출발 대기' : '쉬는 중 · ' + App.nodeName(p.node) + ' 차고';
    else if (p.node) text = line + ' · ' + App.nodeName(p.node) + ' 정류장';
    else text = line + ' · ' + App.nodeName(p.from) + ' → ' + App.nodeName(p.to) + ' 이동 중';
    return text + (riders ? ' · ' + riders + '명 탑승' : '');
  }

  /* 노선 고치기 창은 지도를 보며 고르는 비모달 창이라 브라우저가 뒤쪽을 막아 주지 않는다(2026-11-05 P2) — 뒤쪽 화면을 inert로. 확인창·컷신은 showModal이 이미 막는다 */
  function syncInert() { var on = !!document.querySelector('#emergency-dialog[open]'); document.body.classList.toggle('minimal-emergency', on); ['#topbar', '.stage-col'].forEach(function (q) { var n = $(q); if (n) n.inert = on; }); }
  UI.syncInert = syncInert;
  /* 옛 긴급 조정 창(showEmergency, 10:06·15:03)은 2026-11-09에 지움 — 위 showFix가 대신한다 */

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
    var c = { requests: 0, arrived: 0, noLink: 0, transfers: 0, fulls: 0, left: 0 };
    R.res.log.forEach(function (e) {
      if (e.t > m) return;
      if (e.type === 'request') { c.requests++; if (R.byId[e.pid] && R.byId[e.pid].fail === 'NO_LINK') c.noLink++; if (R.byId[e.pid] && R.byId[e.pid].fail === 'TOO_MANY_TRANSFERS') c.transfers++; }
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
      ['노선이 없어 떠나지 못함', c.noLink + '건'], ['갈아타기를 두 번 해야 해서 못 감', c.transfers + '건'], ['만차로 남겨짐', c.fulls ? c.fulls + '회 · ' + c.left + '명' : '없음']
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
    var done = function () { if (b.parentNode) b.parentNode.removeChild(b); placeAlerts(app()); };
    while (layer.querySelectorAll('.bubble').length >= 2) layer.querySelector('.bubble').remove();
    var xy = App.nodeXY(it.node), p = App.view.project(xy.x, xy.y);
    var who = it.bubble.residentId ? cfg.residents.filter(function (r) { return r.id === it.bubble.residentId; })[0].name : '';
    var b = el('div', { 'class': 'bubble' });
    b.dataset.node = it.node; b.dataset.kind = it.bubble.kind;
    var issue = { noLink: '노선 없음', transfers: '갈아타기 2번', full: '만차', wait: '긴 기다림', petition: '주민 민원' }[it.bubble.kind];
    if (issue) b.appendChild(el('b', { 'class': 'bubble-issue' }, issue + ' · '));
    if (who) b.appendChild(el('b', null, who + ' '));
    b.appendChild(document.createTextNode(it.bubble.text));
    b.style.left = Math.max(115, Math.min(layer.clientWidth - 115, p.left)) + 'px'; b.style.top = Math.max(100, p.top) + 'px';
    layer.appendChild(b);
    placeAlerts(App);
    // 배속이 빨라도 말풍선은 같은 실제 시간(4.5초) 동안 남는다
    var gone = root.setTimeout(done, 4500);
    /* ‘노선 없음’ 말풍선을 누르면 가장 가까운 연결 방법 한 줄(2026-11-05 P0-1 c) */
    var who2 = it.bubble.pid != null && R.byId[it.bubble.pid];
    if (it.bubble.kind === 'noLink' && who2 && PB.Hud) { b.title = '눌러서 연결 방법 보기'; b.addEventListener('click', function () { if (b.querySelector('.bubble-hint')) return; b.appendChild(el('span', { 'class': 'bubble-hint' }, PB.Hud.linkHint(PB.Hud.routesNow(), who2.o, who2.d))); placeAlerts(app()); root.clearTimeout(gone); gone = root.setTimeout(done, 6000); }); }
  }

  // 지금 보이는 배속: 멈춤·감속 중이면 1×, ‘다음 결정까지’ 중이면 ⏭, 아니면 고른 배속
  function shownSpeed() {
    if (!R || R.done) return app().speed || 1;
    if (R.hold || R.slowed) return 1;
    return R.mode === 'next' ? 'next' : R.speed;
  }
  // 운행 조작은 지도 모서리의 작은 아이콘 묶음 — 글자는 aria-label·툴팁으로(2026-10-27 시각 위계)
  function iconLabel(b, icon, text) { PB.Icons.label(b, icon, text); if (!b.title) b.title = text; return b; }
  function syncControls() {
    var shown = shownSpeed();
    SPEEDS.forEach(function (n) { var b = $('#speed-' + n); if (b) b.setAttribute('aria-pressed', String(n === shown)); });
    syncNext();
    var pb = $('#run-pause'), paused = !!(R && !R.done && R.paused);
    if (pb) { iconLabel(pb, paused ? 'play' : 'pause', paused ? '재개' : '일시정지'); pb.setAttribute('aria-pressed', String(paused)); }
    var rc = $('#run-controls'); if (rc) rc.classList.toggle('is-paused', paused); // 멈춘 동안은 ▶만 강조, 배속은 고른 값만 옅게(P1-2)
  }
  function syncNext() {
    var shown = shownSpeed(), nx = $('#run-next'), left = stopsLeft(); if (nx) { nx.setAttribute('aria-pressed', String(shown === 'next')); nx.disabled = !left; nx.title = left ? NEXT_TITLE : '남은 멈춤 없음'; nx.setAttribute('aria-label', left ? '다음 멈춤까지' : '다음 멈춤까지 · 남은 멈춤 없음'); }
  }
  // 사건 멈춤에서 다시 달릴 때 — 플레이어가 마지막으로 고른 배속으로
  function release() {
    R.paused = false; R.hold = false; R.mode = 'normal'; R.speed = app().speed || 1; R.last = root.performance.now();
    setAlerts([]); var bar = $('#run-statusbar'); if (bar) { bar.classList.remove('is-hold'); }
  }

  function setSpeed(speed) {
    app().setSpeed(speed);
    if (R && !R.done) {
      R.speed = speed; R.mode = 'normal';
      if (R.hold && R.pendingEmergency == null) { release(); setStatus('운행 중 · ' + speed + '배속'); }
      else if (R.pendingEmergency != null) setStatus('노선 고치기를 마치면 ' + speed + '배속으로 이어져요.');
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
    setStatus('' + nextLabel(R.s) + ' 빨리 가는 중…');
    syncControls();
  }

  // 끝까지 건너뛰기 — 노선 고치기를 안 썼어도 묻지 않는다(안 쓰면 아무 일도 없음, 2026-11-09)
  /* 2026-11-12 랜덤 검토 6번: 노선 고치기를 아직 안 썼고 11:00 전이면 ‘끝까지’도 11:00에 한 번 멈춰 묻는다 — 「노선 고치기 · 한 번」 / ‘그대로 끝까지’.
   * 3단계부터 모든 단계 같음(R.fixAt = 오늘 고칠 수 있는 첫 시각, 이미 고쳤거나 1·2단계면 null). 한 번 물은 뒤 다시 누르면 끝까지. 테스트용 빠른 재생(__pbFast)은 묻지 않는다(옛 검사들) */
  function skipToEnd() {
    if (!R || R.done || R.finishing) return;
    tick(); if (!R || R.done || R.finishing) return;
    var st = fixState();
    if (!root.__pbFast && !R.skipAsked && R.fixAt != null && R.tf < R.fixAt && st && st.why === 'early' && R.pendingEmergency == null) { askAtFix(); return; }
    runToEnd();
  }
  function askAtFix() {
    var App = app(), at = R.fixAt; R.skipAsked = true;
    R.paused = true; R.hold = true; R.mode = 'normal'; R.tf = at; R.last = root.performance.now(); drawBuses(App, at);
    var m = Math.floor(at); if (m !== R.minute) { R.minute = m; R.s.runCursor = m; App.save(); onMinute(App, m); if (PB.Hud && PB.Hud.live) PB.Hud.live(R.res, at); }
    setStatus(App.clock(at) + ' · 이제 ' + fixSpan().split('~')[1] + '까지 노선을 한 번 고칠 수 있어요(‘노선 고치기 · 한 번’).', true); pulseFix(); syncControls();
    var d = $('#skip-fix-ask'); if (d) d.remove();
    d = el('dialog', { id: 'skip-fix-ask', 'class': 'dialog skip-fix-ask', 'aria-labelledby': 'skip-fix-ask-h' });
    d.appendChild(el('h2', { id: 'skip-fix-ask-h' }, App.clock(at) + ' · 노선 고치기 · 한 번'));
    d.appendChild(el('p', { id: 'skip-fix-ask-text' }, '끝까지 가기 전에 멈췄어요. ' + fixSpan().split('~')[1] + '까지 노선을 한 번 고칠 수 있어요. 고치지 않으면 그대로 끝까지 가요.'));
    var acts = el('div', { 'class': 'row-actions' });
    var fix = el('button', { type: 'button', id: 'skip-fix-open', 'class': 'btn btn-primary', onclick: function () { d.close(); d.remove(); openFix(); } }, '노선 고치기 · 한 번');
    var go = el('button', { type: 'button', id: 'skip-fix-go', 'class': 'btn', onclick: function () { d.close(); d.remove(); runToEnd(); } }, '그대로 끝까지');
    acts.appendChild(fix); acts.appendChild(go); d.appendChild(acts);
    d.addEventListener('cancel', function (e) { e.preventDefault(); d.close(); d.remove(); setStatus(App.clock(at) + ' · 멈췄어요. ‘노선 고치기 · 한 번’으로 고치거나 재개해요.', true); });
    document.body.appendChild(d); d.showModal(); fix.focus();
  }
  UI.runAskAtFix = function () { return R && R.skipAsked; };
  function runToEnd() {
    if (!R || R.done || R.finishing) return;
    var d = $('#emergency-dialog'); if (d) { if (d.open) d.close(); d.remove(); }
    syncInert(); R.pendingEmergency = null; R.hold = false; R.mode = 'normal'; R.paused = false;
    R.tf = W; R.last = root.performance.now();
    tick();
  }

  UI.run = function (App, panel) {
    var s = App.s;
    cfg = s.config;
    panel.appendChild(el('p', { 'class': 'eyebrow' }, s.phase + '단계 · ' + cfg.phases[s.phase - 1] + ' — 운행'));
    panel.appendChild(el('h2', null, '버스가 달리고 있어요'));
    panel.appendChild(fixBox('run-fix-panel')); // 텍스트 모드·기본 화면용(미니멀 지도 화면은 상태 줄의 #run-fix)
    var speeds = $('#run-controls'); speeds.textContent = '';
    var paused = R && R.s === s && R.phase === s.phase && !R.done && R.paused;
    // 좁은 화면에서는 아이콘만 보이도록 글자를 따로 감싼다(이름은 aria-label로 유지)
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-pause', 'class': 'btn', 'aria-pressed': String(!!paused), onclick: function () {
      tick(); if (!R || R.done || R.finishing) return;
      if (R.pendingEmergency != null) { focusEmergency(); return; }
      if (R.paused) { release(); setStatus('운행 중 · ' + R.speed + '배속'); }
      else { R.paused = true; R.last = root.performance.now(); setStatus('일시정지 중 · 재개하면 ' + R.speed + '배속으로 이어져요.'); }
      syncControls();
    } }), paused ? 'play' : 'pause', paused ? '재개' : '일시정지'));
    var dayMs = W * cfg.playback.msPerMinute;
    SPEEDS.forEach(function (speed) {
      var sb = el('button', { type: 'button', id: 'speed-' + speed, 'class': 'btn', 'aria-pressed': String((App.speed || 1) === speed), title: speed + '배속 · 하루를 ' + Math.round(dayMs / speed / 1000) + '초에 보기', onclick: function () { tick(); setSpeed(speed); } }, speed + '×');
      sb.setAttribute('aria-label', speed + '배속'); speeds.appendChild(sb);
    });
    // ‘다음 멈춤까지’(P1-2): 모든 단계 같은 이름 — 노선을 고칠 수 있게 되는 11:00과 주요 인물 판정(왕복 완료·오늘 기준 초과)에서 멈춤
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-next', 'class': 'btn', 'aria-pressed': 'false', title: NEXT_TITLE, onclick: nextDecision }), 'next', '다음 멈춤'));
    speeds.appendChild(iconLabel(el('button',{type:'button',id:'run-skip','class':'btn',title:'끝까지 건너뛰기',onclick:skipToEnd}),'forward','끝까지'));
    speeds.appendChild(iconLabel(el('button', { type: 'button', id: 'run-sound', 'class': 'btn', 'aria-pressed': String(App.sound), title: '효과음 켜기/끄기', onclick: function () { App.setSound(!App.sound); if (App.sound) App.sfx('person'); } }), App.sound ? 'sound' : 'mute', '소리'));
    panel.appendChild(el('p', { id: 'run-status', 'class': 'h-small', role: 'status' }, '운행 시작'));
    if (!$('#run-statusbar-text') || !$('#run-statusbar-text').textContent) { if (statusBar()) $('#run-statusbar-text').textContent = '운행 시작'; }
    var live = el('section', { id: 'run-live', 'aria-labelledby': 'run-live-h' });
    live.appendChild(el('h3', { id: 'run-live-h' }, '지금 운행 상황'));
    live.appendChild(el('dl', { 'class': 'kv run-counts' }));
    live.appendChild(el('h4', null, '주요 인물'));
    live.appendChild(el('ul', { id: 'run-residents', 'class': 'plain run-residents' }));
    panel.appendChild(live);
    panel.appendChild(el('h3', null, '운행 소식'));
    panel.appendChild(el('ul', { id: 'run-feed', 'class': 'feed', 'aria-live': 'polite' }));
    panel.appendChild(el('p', { 'class': 'note' }, '일반 버스 정원은 ' + cfg.bus.capacity + '명이에요.' + (s.config.challengeApplied && s.phase >= 6 ? ' 직행 버스는 정원 18명·주행 속도 1.5배예요.' : '') + (s.config.challengeApplied && s.phase >= 8 ? ' 광역 버스는 정원 24명이에요.' : '') + (hasEmergency(s) ? ' ' + fixSpan() + '에 한 번, ‘노선 고치기 · 한 번’으로 멈추고 정류장 하나 더하기·빼기나 버스 한 대 옮기기 중 하나를 바꿀 수 있어요. ' + FIX_RULE + ' 고친 것은 이번 운행에만 써요.' : ' 이번 단계는 출발하면 운행이 끝날 때까지 그대로 달려요. 3단계부터는 ' + fixSpan() + '에 한 번 노선을 고칠 수 있어요.') + ' ‘⏭ 다음 멈춤까지’는 ' + (hasEmergency(s) ? '노선을 고칠 수 있게 되는 ' + fixSpan().split('~')[0] + '이나 ' : '') + '주요 인물이 왕복을 마치거나 오늘 대기 기준을 넘긴 순간까지 빨리 간 뒤 멈춰요.' + ' 배속은 보는 속도만 바꾸고 결과는 같아요. 지나간 소식은 결과 화면의 ‘운행 기록’에서 다시 볼 수 있어요.'));
    panel.appendChild(el('p', { id: 'node-info', 'class': 'note', 'aria-live': 'polite' }));
    App.onNodeClick = function (id) {
      var n = R && R.wait[id] ? R.wait[id][Math.max(0, R.minute)] : 0;
      $('#node-info').textContent = App.nodeName(id) + ' 정류장: 지금 기다리는 사람 ' + (n || 0) + '명';
    };
    if (!R || R.phase !== s.phase || R.s !== s || R.done) { stop(); start(App); }
    else {
      if (R.minute >= 0) { renderLive(R.minute); R.shown = 0; while (R.shown < R.items.length && R.items[R.shown].t <= R.minute) { var it = R.items[R.shown++]; $('#run-feed').insertBefore(el('li', { 'class': 'feed-' + it.cls }, it.text), $('#run-feed').firstChild); } }
      // 패널을 다시 그려도 열려 있던 노선 고치기 창은 그대로 다시 연다
      if (R.pendingEmergency != null) showFix(R.pendingEmergency);
      syncControls(); syncFix();
    }
    return { keepBuses: true };
  };
  UI.stopRun = stop;
  // 테스트용 — 지금 재생 상태(위치·모드·멈춤 이유)
  UI.runState = function () { return R ? { tf: R.tf, mode: R.mode, hold: R.hold, paused: !!R.paused, slowed: !!R.slowed, speed: R.speed, shown: shownSpeed(), pendingEmergency: R.pendingEmergency, fixing: R.pendingEmergency != null, fixAt: R.fixAt, alerts: R.alerts.slice(), notables: R.notables.slice() } : null; };

  document.addEventListener('visibilitychange', function () { if (R && !document.hidden) R.last = root.performance.now(); });
  /* Space = 일시정지·재개(2026-11-05 P2). 입력칸·버튼 등에 초점이 있으면 그 요소 몫으로 둔다. 창이 떠 있으면 무시 */
  document.addEventListener('keydown', function (e) {
    if (e.code !== 'Space' && e.key !== ' ') return;
    if (document.body.dataset.screen !== 'run' || e.repeat || e.ctrlKey || e.altKey || e.metaKey || document.querySelector('dialog[open]')) return;
    var t = e.target, tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (/^(input|select|textarea|button|a|summary)$/.test(tag) || (t && t.isContentEditable) || (t && t.getAttribute && t.getAttribute('role') === 'button')) return;
    var b = $('#run-pause'); if (b) { e.preventDefault(); b.click(); }
  });
})(window);
