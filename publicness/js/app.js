/*
 * 앱 — 화면 전환·상단 바·무대(지도) 동기화·대화 상자. 화면별 패널은 ui-*.js가 PB.UI에 등록한다.
 * 상태는 PB.Session 객체 하나이고, 화면을 그릴 때마다 브라우저에 자동 저장한다(첫 화면 ‘이어하기’).
 */
(function (root) {
  'use strict';
  var PB = root.PB, cfg = PB.config, S = PB.Session;
  var $ = function (s) { return document.querySelector(s); };

  // 노선 색 = 서울 지하철 노선색 계열(1번만 빨강 — 신분당선)을 채도만 낮춘 차분한 톤(원색은 어른 눈에 쨍해서, 2026-10-23).
  // 연결된 노선은 모두 실선이고, 점선은 AI 제안 미리보기만 쓴다
  // 노선 색은 config.ui(시각 토큰) 한 곳에서 — CSS 변수 --route-1… 로도 내보낸다(init)
  var COLORS = cfg.ui.routeColors, COLOR_NAMES = cfg.ui.routeNames;

  var App = {
    s: null, view: null, map2d: null, seedParam: null, player: null,
    sound: false, motion: false, busy: false, speed: 1
  };
  // 운행 재생 배속(1·2 — 고른 값, ‘다음 결정까지’는 저장하지 않음). 재생 속도만 바꾸며 이 브라우저에 기억한다
  // 계약 종료 제목: 지금 규칙(누적 잔액 2번 연속 마이너스)이면 잔액 부족. 예전 저장본(적자 3회 규칙, 잔액이 남은 채 종료)은 그때 이유 그대로
  App.contractTitle = function (end) { return end && end.balance >= 0 ? '적자 누적으로 운영 계약 종료(이전 규칙)' : '잔액 부족으로 운영 계약 종료'; };
  App.setSpeed = function (v) { if (PB.Storage.SPEEDS.indexOf(v) < 0) return; App.speed = v; PB.Storage.writeSpeed(v); };
  // 자동 저장 — 화면을 그릴 때마다(계획 편집·출발·결과·다음 단계). 운행 결과는 저장하지 않고 다시 계산한다
  App.save = function () {
    if (!App.s || document.body.getAttribute('data-screen') === 'title') return;
    PB.Storage.writeSave({ version: cfg.SCENARIO_VERSION, savedAt: Date.now(), session: S.serialize(App.s) });
  };
  App.resume = function (saved) {
    App.s = S.restore(saved.session, cfg);
    App._sceneKey = null;
    var st = App.s.stage;
    App.go(st === 'run' ? 'run' : st === 'reveal' ? 'reveal' : st === 'result' ? 'result' : st === 'ending' ? 'ending' : 'plan');
  };

  function routeStyle(num) {
    var i = (num - 1) % COLORS.length;
    return { color: COLORS[i], colorName: COLOR_NAMES[i] };
  }
  App.routeStyle = routeStyle;
  App.state = function () { return App.s; };
  App.nodeName = function (id) { return PB.Narrative.nodeName(App.s?App.s.config:cfg, id); };
  App.clock = function(t){return PB.Demand.clock(App.s?App.s.config:cfg,t);};
  App.updateClock = function(t, status){
    var c=App.s?App.s.config:cfg,p=Math.max(0,Math.min(1,t/c.bus.window));
    var hour=c.day?(c.day.start+(c.day.end-c.day.start)*p)/60:5+18*p;
    var light=hour<7?'dawn':hour<18?'day':hour<20?'dusk':'night',sun=hour>=7&&hour<18;
    $('#top-clock').textContent=c.day?App.clock(t):Math.floor(t)+'초';
    $('#clock-period').textContent=status||(c.day?PB.Demand.period(c,t):'운행 중');
    $('#map-clock').dataset.daylight=light;$('#stage').dataset.daylight=light;
    $('#clock-orb').setAttribute('transform','translate('+(12+120*p)+' '+(32-92*p*(1-p))+')');
    $('#clock-sun').style.display=sun?'':'none';$('#clock-sun').removeAttribute('hidden');
    $('#clock-moon').style.display=sun?'none':'';
  };
  App.duration = function(t){return PB.Demand.duration(App.s?App.s.config:cfg,t);};
  // 0원 근처의 음수를 ‘0원’으로 반올림해 적자 판정과 달라 보이지 않게 한다(−1원 미만)
  App.won = function (n) { return PB.Narrative.won(n); };
  App.reducedMotion = function () {
    return App.motion || !!root.__pbReduceMotion || (root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  App.msPerMinute = function () { return root.__pbFast ? 5 : cfg.playback.msPerMinute; };

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    if (text != null) e.textContent = text;
    return e;
  }
  App.el = el;

  // 짧은 알림(지도 아래쪽 알약, role=status·aria-live) — 빈 문장은 그리지 않는다(2026-11-01: 빈 검은 알약이 뜨던 문제).
  // priority 알림(예: 긴급 조정 완료)이 떠 있는 동안에는 일반 알림이 덮지 않는다. 같은 문장이 이미 떠 있으면 다시 띄우지 않는다
  var toastTimer = null, toastLockUntil = 0;
  App.toast = function (text, opts) {
    opts = opts || {};
    var msg = text == null ? '' : String(text).trim(), n = $('#minimal-toast');
    if (!n) { n = el('div', { id: 'minimal-toast', 'class': 'minimal-toast', role: 'status', 'aria-live': 'polite' }); n.hidden = true; ($('#stage') || document.body).appendChild(n); }
    if (!msg) return false;
    var now = Date.now();
    if (!opts.priority && now < toastLockUntil) return false;
    if (!n.hidden && n.textContent === msg) return true;
    if (opts.priority) toastLockUntil = now + (opts.ms || 2600);
    n.textContent = msg; n.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { n.hidden = true; n.textContent = ''; }, opts.ms || (opts.priority ? 2600 : 2000));
    return true;
  };

  /* ── 화면 ───────────────────────── */
  App.go = function (screen) {
    // 단계 전 화면(1단계 안내·성찰·「마을이 달라졌어요」)은 없앴다(2026-11-01) — 새 단계는 곧바로 지도 계획 화면. 예전 경로로 와도 계획으로
    if ((screen === 'reveal' || screen === 'reflect') && App.s) { S.beginPlan(App.s); delete App.s.transitionStep; screen = 'plan'; }
    document.body.classList.remove('result-map-open');
    document.body.setAttribute('data-screen', screen);
    App.render();
  };
  App.render = function () {
    document.querySelector('#stage').dataset.daylight='day';
    var screen = document.body.getAttribute('data-screen');
    if (screen === 'title') return;
    renderTopbar();
    var panel = $('#panel');
    panel.innerHTML = '';
    var fn = PB.UI && PB.UI[screen];
    App.onNodeClick = null;
    App.onLink = null; App.onRouteClick = null; App.onRouteDouble = null;
    var stageOpts = fn ? fn(App, panel) : null;
    // 단계 질문(stories.phaseEthics)은 그 단계 결과 화면 ‘생각해 보기’에 있다(2026-11-01)
    App.syncStage(stageOpts || {});
    if (PB.Hud) PB.Hud.render(App);
    if (PB.Arrival) PB.Arrival.render(App);
    // 화면이 바뀌면(운행 조작 묶음이 생기는 등) 지도 맞춤을 다시 — 정류장이 조작 버튼 밑에 깔리지 않게
    App.fitFrame(); if (App.view && App.view.refit) App.view.refit(); if (App.net) App.net.redraw();
    App.syncPanelToggle();
    renderTextRoutes();
    App.save();
    var h = panel.querySelector('h2');
    if (h && !App.keepFocus) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    App.keepFocus = false;
  };

  // 지난 단계 결과 요약(작은 팝오버, 창 아님): 도착·수지·주요 인물 기준 충족. Esc·바깥 누르기로 닫힘
  App.peekPhase = function (h, anchor) {
    var old = $('#phase-peek'); if (old) { old.remove(); if (old.dataset.phase === String(h.phase)) return; }
    var m = h.metrics, rs = h.residents || {}, ids = Object.keys(rs).filter(function (id) { return rs[id]; }), ok = ids.filter(function (id) { return rs[id].satisfied; }).length;
    var p = el('div', { id: 'phase-peek', 'class': 'phase-peek', role: 'dialog', 'aria-label': h.phase + '단계 결과 요약', 'data-phase': h.phase, tabindex: '-1' });
    p.appendChild(el('b', null, h.phase + '단계 · ' + App.s.config.phases[h.phase - 1]));
    [['도착', m.arrived + ' / ' + m.N + '건'], ['단계 수지', App.won(m.costs.total)], ['주요 인물 기준 충족', ok + ' / ' + ids.length + '명']].forEach(function (r) { var q = el('p'); q.appendChild(el('span', null, r[0])); q.appendChild(el('strong', null, r[1])); p.appendChild(q); });
    // 그 단계 결과 화면에서 남긴 생각(옛 성찰 화면에서 쓴 답도 같은 자리, 2026-11-01)
    var mine = (App.s.reflections || {})[h.phase], pick = (App.s.choices || {})[h.phase];
    if (pick) { var q1 = el('p'); q1.appendChild(el('span', null, '고른 답')); q1.appendChild(el('strong', null, S.CHOICES[pick] || pick)); p.appendChild(q1); }
    if (mine) p.appendChild(el('p', { 'class': 'peek-note' }, '내 생각 · ' + mine));
    document.body.appendChild(p); var a = anchor.getBoundingClientRect(); p.style.left = Math.max(8, Math.min(innerWidth - p.offsetWidth - 8, a.left - 20)) + 'px'; p.style.top = (a.bottom + 8 + scrollY) + 'px'; p.focus();
    function close(e) { if (e.type === 'keydown' && e.key !== 'Escape') return; if (e.type === 'pointerdown' && p.contains(e.target)) return; p.remove(); document.removeEventListener('keydown', close, true); document.removeEventListener('pointerdown', close, true); if (e.type === 'keydown') { e.stopPropagation(); anchor.focus(); } }
    document.addEventListener('keydown', close, true); document.addEventListener('pointerdown', close, true);
  };
  // 지도 틀 크기(2026-10-27 후반 지도 정리): 네트워크(세팅 전체 정류장)가 틀의 가로·세로 모두 75% 이상 차지하도록
  // 틀 비율을 네트워크에 맞춘다 — 여유가 있으면 높이 = 너비 ÷ 비율, 높이가 모자라면 틀 너비를 줄여 가운데. 설계·운행 화면만(다른 화면은 CSS 그대로)
  App.fitFrame = function () {
    var st = $('#stage'), screen = document.body.dataset.screen; if (!st) return;
    st.style.height = ''; st.style.maxWidth = '';
    var a = App.view && App.view.contentAspect && App.view.contentAspect();
    if (!a || (screen !== 'plan' && screen !== 'run')) return;
    var col = st.parentNode, cs = getComputedStyle(col), W = col.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), availH = st.offsetHeight;
    // 계획 화면(넓은 화면): 지도·노선 버튼·대기 버스·출발 버튼이 스크롤 없이 한 화면에 들어오도록, 지도 높이 = 창 높이 − 지도 위쪽 − 아래 조작부(2026-11-01:
    // 1440×900에서 출발 버튼이 약 34px 잘렸다 — CSS 고정 계산(100dvh − 330px)이 위쪽 금액 줄·조작부 실제 높이를 몰랐다). 좁은 화면은 위아래로 스크롤하는 배치라 CSS 그대로
    var bar = screen === 'plan' && root.innerWidth > 850 ? $('#plan-toolbar') : null;
    if (bar && bar.offsetHeight) {
      var sr = st.getBoundingClientRect(), below = bar.getBoundingClientRect().bottom - sr.bottom + parseFloat(cs.paddingBottom || 0) + 4;
      availH = Math.max(300, Math.floor(root.innerHeight - (sr.top + root.scrollY) - below));
    }
    var P = Math.min(80, Math.max(54, Math.min(W, availH) * 0.1)), need = (W - 2 * P) / a + 2 * P + 24, H, Wst = W;
    if (need <= availH) H = Math.max(200, need);
    else { H = availH; Wst = Math.min(W, (H - 2 * P - 24) * a + 2 * P + 40); }
    st.style.height = Math.round(H) + 'px'; st.style.maxWidth = Math.round(Wst) + 'px';
  };
  // 오른쪽 패널 접기(운행·결과 지도 화면): 접으면 지도가 전체 폭. 기억은 이 브라우저에만(실패해도 그냥 펼침)
  var PANEL_KEY = 'ethicity.publicness.panelCollapsed';
  App.setPanelCollapsed = function (v) { document.body.classList.toggle('panel-collapsed', !!v); try { localStorage.setItem(PANEL_KEY, v ? '1' : '0'); } catch (e) { /* 이번 창에서만 */ } App.syncPanelToggle(); root.requestAnimationFrame(function () { App.fitFrame(); if (App.view && App.view.refit) App.view.refit(); if (App.net) App.net.redraw(); }); };
  App.syncPanelToggle = function () {
    var b = $('#btn-panel-toggle'), screen = document.body.dataset.screen, can = screen === 'run';
    if (!b) return; b.hidden = !can; if (!can) { document.body.classList.remove('panel-collapsed'); return; }
    var stored = false; try { stored = localStorage.getItem(PANEL_KEY) === '1'; } catch (e) { /* 펼침 */ }
    if (!document.body.dataset.panelInit) { document.body.dataset.panelInit = '1'; document.body.classList.toggle('panel-collapsed', stored); }
    var c = document.body.classList.contains('panel-collapsed'); b.textContent = c ? '패널 펼치기' : '패널 접기'; b.setAttribute('aria-expanded', String(!c)); b.setAttribute('aria-controls', 'panel');
  };
  function renderTopbar() {
    var s = App.s, cfg=s.config, ol = $('#top-phase');
    // 단계 표시: ‘3/5 · 변화기’ 글자 + 진행 점(2026-10-27 시각 위계). 지난 단계 점을 누르면 그 단계 결과 요약
    ol.innerHTML = '';
    var label = $('#top-phase-label'); if (!label) { label = el('span', { id: 'top-phase-label', 'class': 'phase-label' }); ol.parentNode.insertBefore(label, ol); }
    label.textContent = s.stage === 'ending' ? '학기 끝 · ' + cfg.phases.length + '단계' : s.phase + '/' + cfg.phases.length + ' · ' + cfg.phases[s.phase - 1];
    cfg.phases.forEach(function (name, i) {
      var done = i + 1 < s.phase || s.stage === 'ending' || (i + 1 === s.phase && (s.stage === 'result')), h = s.history.filter(function (x) { return x.phase === i + 1; })[0];
      var li = el('li', { 'class': (i + 1 < s.phase || s.stage === 'ending' ? 'done' : i + 1 === s.phase ? 'now' : '') });
      if (h) { var b = el('button', { type: 'button', 'class': 'phase-dot', 'aria-label': (i + 1) + '단계 ' + name + ' 결과 보기', title: (i + 1) + '단계 ' + name, onclick: function (e) { e.stopPropagation(); App.peekPhase(h, b); } }); li.appendChild(b); }
      else li.appendChild(el('span', { 'class': 'phase-dot', title: (i + 1) + '단계 ' + name, 'aria-label': (i + 1) + '단계 ' + name }));
      if (i + 1 === s.phase && s.stage !== 'ending') li.setAttribute('aria-current', 'step');
      ol.appendChild(li);
    });
    var bal = s.history.reduce(function (a, h) { return a + h.metrics.costs.total; }, 0);
    $('#top-balance').textContent = '누적 잔액 ' + App.won(bal);
    // 랜덤(도전) 모드: 누적 잔액이 마이너스로 단계를 마친 횟수(연속)를 경고로 보여 준다 — 0이면 숨김
    var fin = S.financeStatus(s), def = $('#top-deficit');
    def.hidden = fin.rule !== 'balance-streak' || !fin.negStreak;
    def.textContent = '잔액 마이너스 ' + fin.negStreak + '/' + fin.limit + '회 연속';
    def.classList.toggle('warn', fin.negStreak >= fin.limit - 1);
    if (s.stage !== 'run') App.updateClock(s.stage==='result'||s.stage==='ending'?s.config.bus.window:0,s.stage==='ending'?'학기 끝':s.stage==='result'?'운행 끝':'계획 중');
  }

  /* ── 무대 ───────────────────────── */
  App.stageRoutes = function () {
    var s = App.s, used = {};
    s.draft.buses.forEach(function (b) { if (b.routeNum != null) used[b.routeNum] = true; });
    var g = S.graph(s);
    return s.draft.routes.filter(function (r) { return r.nodes.length >= 2 && r.nodes.every(function (n) { return g.has(n); }); }).map(function (r) {
      var st = routeStyle(r.num);
      return { num: r.num, route: r, color: st.color, buses: s.draft.buses.filter(function (b) { return b.routeNum === r.num; }).length };
    });
  };
  App.syncStage = function (opts) {
    opts = opts || {};
    var s = App.s, g = S.graph(s), v = App.view;
    if (!v) return;
    var nodes = g.nodes.map(function (id) { return s.config.nodes.filter(function (n) { return n.id === id; })[0]; });
    var roads = [];
    var key = s.phase + ':' + nodes.length;
    if (App._sceneKey !== key) {
      // 강: config.river(기본 세팅만). 건너는 구간은 Graph가 거리 × factor로 계산한다
      var river = [], R = s.config.river;
      if(R)for(var y=-30;y<=30;y+=.15)river.push({x:R.x+R.amp*Math.sin(y*R.freq),y:y});
      var frame = s.config.nodes.filter(function (n) { return n.id !== 'N' || g.has('N'); });
      v.setScene({ nodes: nodes, frame: frame, roads: roads, phase: s.phase, river: river, load: PB.Demand.stopLoad(s.config, s.phase, s.seed), boundary: nodes.some(function(n){return n.id==='N';}) ? {x:Math.sign(nodes.filter(function(n){return n.id==='N';})[0].x)*6.4} : null }); App._sceneKey = key;
    }
    // 붐비는 정류장의 장식용 대기 인물은 계획 전·계획 중에만. 운행·결과에서는 실제 대기 인원만 보인다
    if (v.setCrowd) v.setCrowd(s.stage === 'reveal' || s.stage === 'plan');
    var routes = s.stage === 'run' || s.stage === 'result'
      ? (s.current ? s.current.plan.buses : []).filter(function (b) { return b.route; }).map(function (b) {
        var num = App.numForPlanRoute(b.route), st = routeStyle(num);
        return { num: num, route: b.route, color: st.color, buses: s.current.plan.buses.filter(function (x) { return x.route && App.numForPlanRoute(x.route) === num; }).length };
      }).filter(function (r, i, arr) { return arr.findIndex(function (x) { return x.num === r.num; }) === i; })
      : App.stageRoutes();
    if(s.stage==='run')(s.emergencyLog||[]).filter(function(a){return a.phase===s.phase&&a.route;}).forEach(function(a){if(!routes.some(function(r){return r.num===a.routeNum;}))routes.push({num:a.routeNum,route:a.route,color:routeStyle(a.routeNum).color});});
    if(opts.preview){
      var previewState=Object.assign({},s,{draft:JSON.parse(JSON.stringify(s.draft)),goalHistory:JSON.parse(JSON.stringify(s.goalHistory))});
      S.applyRecommendation(previewState,{plan:opts.preview});
      routes=routes.concat(previewState.draft.routes.filter(function(r){return r.nodes.length>=2;}).map(function(r){var style=routeStyle(r.num);return{num:r.num,route:r,color:style.color,dash:'8 6',preview:true};}));
    }
    // 선택한 노선은 굵게·빛으로 강조(다른 노선을 흐리게 하지 않는다)
    else if(s.stage==='plan'&&opts.activeRoute!=null)routes.forEach(function(r){r.active=r.num===opts.activeRoute;});
    if (s.config.challengeApplied) routes.forEach(function (r) { r.kind = r.num === 5 ? 'express' : r.num === 6 ? 'regional' : null; });
    // 인물 얼굴 자리는 계획·운행 화면(2026-11-01: 운행 중에도 얼굴이 지도에서 사라지지 않게). 결과·엔딩에선 비움
    if (App.net) App.net.setFaces(s.stage === 'plan' || s.stage === 'run' ? PB.Demand.residents(s.config, s.phase).map(function (rd) { return { id: rd.id, node: rd.o, size: 40 }; }) : []);
    if (App.net) App.net.setOptions({ showWait: s.stage === 'run' || s.stage === 'result' });
    v.setRoutes(routes);
    // A view refresh can happen while paused, when the playback tick does not run.
    // Restore physical transfer roads here as well as during active playback.
    if (v.setDrivingSegments) v.setDrivingSegments(s.current && (s.stage === 'run' || s.stage === 'result')
      ? s.current.result.timelines.reduce(function (out, tl) { return out.concat(tl.segments.filter(function (seg) { return seg.deadhead; })); }, []) : []);
    document.querySelector('#stage').classList.toggle('previewing',!!opts.preview);
    // 지도 왼쪽 위 안내는 노선이 하나라도 생기면 숨긴다(2026-11-01: 텍스트 모드에서 기차역 이름표와 겹쳤다)
    document.querySelector('#stage').dataset.caption=opts.preview?'AI 제안 미리보기 · 적용 전':s.draft.routes.some(function(r){return r.nodes.length>=2;})?'':'정류장을 연결해 나만의 노선을 만드세요';
    v.setSelectable(opts.selectable || []);
    v.setSelected(opts.selected || []);
    if (!opts.keepBuses) {
      // 줄 세우는 순서는 번호가 아니라 목록 순서(임차 21호차가 화면 밖으로 밀려나지 않게)
      v.setBuses(s.draft.buses.map(function (b, i) {
        var r=b.routeNum!=null?S.routeByNum(s,b.routeNum):null;
        var a = nodeXY(r&&r.nodes.length?r.nodes[0]:cfg.bus.depot);
        return { id: b.id, x: a.x, y: a.y, dx: -30, dy: -24 - i * 21, riders:0,color: b.routeNum != null ? routeStyle(b.routeNum).color : '#6B7280', express: s.config.challengeApplied && b.id === 7, regional: s.config.challengeApplied && b.id === 9 };
      }));
      v.setWaiting({});
    }
  };
  function nodeXY(id) { var n = (App.s ? App.s.config : cfg).nodes.filter(function (x) { return x.id === id; })[0]; return { x: n.x, y: n.y }; }
  App.nodeXY = nodeXY;
  // 운행 중·결과 화면의 노선 번호는 초안의 같은 노선 번호를 따른다
  App.numForPlanRoute = function (route) {
    var hit = App.s.draft.routes.filter(function (r) { return r.nodes.join('|')===route.nodes.join('|')&&r.stops.join('|')===route.stops.join('|'); })[0];
    return hit ? hit.num : 99;
  };

  function onNode(id) { if (App.onNodeClick) App.onNodeClick(id); }

  // 3D 마을 ↔ 지도(SVG) 전환. 운행 중이면 재생이 다음 틱에 버스·대기를 다시 그린다
  App.toggleView = function () {
    if (!App.view3d) return;
    var to3d = App.view !== App.view3d;
    App.view = to3d ? App.view3d : App.map2d;
    App.view3d.show(to3d); App.map2d.show(!to3d);
    App.view.setReducedMotion(App.reducedMotion());
    $('#btn-view-toggle').textContent = to3d ? '지도·텍스트 보기' : '3D 마을 보기';
    App._sceneKey = null;
    if (App.s && App.s.stage === 'run') App.syncStage({ keepBuses: true }); else if (App.s) { App.keepFocus = true; App.render(); }
  };

  /* ── 글로 보는 노선·버스 ───────────── */
  App.describeRoute = function (r) {
    return r.nodes.map(function (id, i) { return App.nodeName(id) + '(' + id + ') ' + (r.stops[i] ? '정차' : '통과'); }).join(' → ');
  };
  function renderTextRoutes() {
    var s = App.s, box = $('#text-routes-body'), g = S.graph(s);
    box.innerHTML = '';
    var ul = el('ul', { 'class': 'plain' });
    S.routesInOrder(s).forEach(function (r) {
      var st = routeStyle(r.num), buses = s.draft.buses.filter(function (b) { return b.routeNum === r.num; });
      var ok = PB.Graph.validateRoute(g, r).length === 0;
      var li = el('li', null, r.num + '번 노선(' + st.colorName + '): ' + App.describeRoute(r) +
        (ok ? ' · 한 바퀴 ' + App.duration(PB.Graph.cycleMinutes(g, r)) : ' · 아직 완성되지 않음') +
        ' · ' + (buses.length ? buses.map(function (b) { return b.id + '호차'; }).join(', ') : '배정된 버스 없음'));
      ul.appendChild(li);
    });
    s.draft.buses.filter(function (b) { return b.routeNum == null; }).forEach(function (b) {
      ul.appendChild(el('li', null, b.id + '호차: 미배정 — 기차역에 주차(보유비는 들어요)'));
    });
    box.appendChild(ul);
  }

  /* ── 새 단계에서 바뀐 것(지도 배너·텍스트 모드 안내가 같은 사실을 쓴다, 2026-11-01) ───────────────── */
  // 예전 「이번 단계에서 달라진 것」 표의 설명(새 정류장마다 누가 오가는지)은 텍스트 모드 단계 안내(#stage-brief)에 남는다
  var NEW_PLACE = { H: '경기·운동하러 오가는 사람들', I: '새 주거지 · 기차역·병원으로 오가는 주민', J: '기차역·시장을 오가는 이동과 운동장 왕복', K: '외곽 마을·밀집 주거지에서 낮 방문',
    L: '가족 3팀(12명)이 함께 방문하고 귀가', M: '낮 방문 60명 · 저녁 귀가 60명', N: '아침 출발 36명 · 저녁 귀가 36명' };
  App.NEW_PLACE = NEW_PLACE;
  function signed(n) { return n > 0 ? '+' + n : String(n); }
  App.signed = signed;
  // 이번 단계에 새로 생긴 것: 정류장·인물·버스·노선 칸(지난 단계 대비). 1단계는 처음 주어진 버스·노선
  App.phaseChanges = function (s) {
    var cfg = s.config, p = s.phase, prog = cfg.progression, limit = S.routeLimit(s);
    var out = { phase: p, name: cfg.phases[p - 1], places: [], people: [], buses: 0, routes: 0, newBusIds: [], owned: s.owned, limit: limit, express: null };
    if (p === 1) return out;
    out.places = cfg.nodes.filter(function (n) { return n.fromPhase === p; });
    out.people = cfg.residents.filter(function (r) { return r.fromPhase === p; });
    out.buses = prog ? s.owned - prog.buses[p - 2] : 0;
    out.routes = prog ? limit - prog.routes[p - 2] : 0;
    out.newBusIds = s.draft.buses.filter(function (b) { return b.id > s.owned - out.buses && !b.leased; }).map(function (b) { return b.id; });
    if (cfg.challengeApplied && p === 6) out.express = '5번 직행 신설 · 7호차 전용(정원 18명 · 1.5배 · 정류장 3곳까지)';
    if (cfg.challengeApplied && p === 8) out.express = '6번 광역 신설 · 9호차 전용(정원 24명 · 마을 한 곳과 대도시)';
    return out;
  };
  // 지도 배너 한 줄: ‘3단계 · 변화기 · 신도시가 생겼어요 · 버스 +1’
  App.changeLine = function (s) {
    var c = App.phaseChanges(s), parts = [c.phase + '단계 · ' + c.name];
    if (c.phase === 1) parts.push('버스 ' + c.owned + '대 · 노선 최대 ' + c.limit + '개');
    c.places.forEach(function (n) { parts.push(PB.Narrative.josa(n.name, '이가') + ' 생겼어요'); });
    if (c.people.length) parts.push(c.people.map(function (r) { return r.name; }).join('·') + ' 등장');
    if (c.buses) parts.push('버스 ' + signed(c.buses));
    if (c.routes) parts.push('노선 ' + signed(c.routes));
    if (c.express) parts.push(c.express.split(' · ')[0]);
    return parts.join(' · ');
  };

  // 안내용 이동 요청: 예정 이동 + 목적지에 도착하면 생기는 다음 이동(주요 인물·가족). 예상·결과와 같은 이름을 쓴다
  function requestText(c, phase, seed) {
    var q = PB.Demand.requestPlan(c, phase, seed);
    return '예정 ' + q.planned + '건' + (q.followUps ? ' + 도착하면 생기는 다음 이동 최대 ' + q.followUps + '건' : '');
  }
  App.requestText = requestText;
  // 실제 AI 사례 카드(stories.learning) — 2026-11-01부터 그 단계 결과 화면 ‘생각해 보기’ 안에서 읽는다(사례 문구·출처는 그대로)
  function learning(panel, phase) {
    var item = PB.stories.learning[phase - 1]; if (!item) return null;
    var sec = el('section', { id: 'learning', 'class': 'learning', 'aria-labelledby': 'learning-title', 'data-phase': phase });
    sec.appendChild(el('p', { 'class': 'eyebrow' }, '실제 AI 사례'));
    sec.appendChild(el('h4', { id: 'learning-title' }, item.title));
    if (item.subtitle) sec.appendChild(el('p', { 'class': 'note learning-subtitle' }, item.subtitle));
    sec.appendChild(el('p', { 'class': 'learning-case' }, item.text));
    var q = el('p', { 'class': 'learning-question' }); q.appendChild(el('b', null, '생각 질문 · ')); q.appendChild(document.createTextNode(item.question)); sec.appendChild(q);
    [{ label: item.source, url: item.url }].concat(item.extraSources || []).forEach(function (src) { sec.appendChild(el('a', { href: src.url, target: '_blank', rel: 'noopener noreferrer', 'class': 'learning-source' }, '출처: ' + src.label + ' (새 탭)')); });
    panel.appendChild(sec);
    return sec;
  }

  App.renderLearning=learning;

  /* ── 첫 노선 안내 = 지도 위 코치 말풍선 + 손가락(2026-11-01: 모달 대신, PB.Arrival). 1단계 계획에 처음 들어올 때 저절로, 도움말에서 다시 보기 ── */
  App.showTutorial = function () {
    var s = App.s; if (!s) return;
    App.coachReplay = true; App.keepFocus = true;
    if (document.body.dataset.screen === 'plan') App.render();
  };

  /* ── 시작 ───────────────────────── */
  // 캐릭터 소개 뒤 바로 단계 안내(‘생각해 보기’ 포함). 별도 Stage 카드·교육 창은 두지 않는다
  // 모드별 재정 규칙(안내·결과·종료 화면이 같은 문장을 쓴다)
  App.financeRuleText = function (s) {
    return S.financeRule(s) === 'balance-streak'
      ? '단계가 끝날 때마다 회차 수지를 정산해 누적 잔액에 더해요. 한 단계 적자는 경고일 뿐, 모아 둔 잔액으로 적자 노선을 유지할 수 있어요. 누적 잔액이 0원 미만인 채로 ' + S.NEGATIVE_LIMIT + '회 연속 단계를 마치면 운영 계약이 종료돼요.'
      : '중간에 돈이 모자라도 운행은 계속돼요. 마지막 단계가 끝난 뒤 누적 잔액이 0원 미만이면 파산으로 끝나요.';
  };
  // 다시 하기: 기본은 같은 시나리오, 랜덤은 같은 조건(같은 세팅 번호 → 같은 지도·수요·사건) 또는 새 랜덤 게임. 진행 상태는 모두 새로 만든다
  App.retry = function (kind) {
    var s = App.s, opt = kind === 'new' ? { mode: 'random' } : s.mode === 'default' ? { mode: 'default' } : { mode: s.mode, seed: s.seed };
    PB.Storage.clearSave();
    App.s = S.create(cfg, opt);
    App._sceneKey = null; App._resultFor = null;
    App.enterPlan();
  };
  App.startGame = function () {
    var chosen = document.querySelector('input[name=setting]:checked');
    var opt = App.seedParam.mode === 'fixed' ? { mode: 'fixed', seed: App.seedParam.seed } : { mode: chosen ? chosen.value : 'default' };
    PB.Storage.clearSave();
    App.s = S.create(cfg, opt);
    App._sceneKey = null;
    App.enterPlan();
  };
  // 새 단계 시작: 곧바로 지도 계획 화면. 이번 단계에서 바뀐 것은 지도 배너·새 정류장 고리·대기 버스 반짝임으로(PB.Arrival)
  App.enterPlan = function () {
    var s = App.s; S.beginPlan(s); delete s.transitionStep;
    App.arrival = { phase: s.phase, at: Date.now(), changes: App.phaseChanges(s), line: App.changeLine(s), done: false };
    App.go('plan');
  };

  /* ── 효과음(기본 켜짐, 파일 없이 합성). 끈 상태는 이 브라우저에 기억 ─── */
  var audio = null;
  function tone(f, start, len, peak, type) {
    audio = audio || new (root.AudioContext || root.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    var o = audio.createOscillator(), gn = audio.createGain(), t = audio.currentTime + start;
    o.frequency.value = f; o.type = type || 'sine';
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.exponentialRampToValueAtTime(peak, t + 0.015);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(gn); gn.connect(audio.destination);
    o.start(t); o.stop(t + len + 0.02);
  }
  // 정류장 안내 차임: 사건·청원·주요 인물 도착
  App.chime = function () {
    if (!App.sound) return;
    try { tone(659, 0, 0.3, 0.12); tone(523, 0.18, 0.3, 0.12); } catch (e) { /* 소리 없이 계속 */ }
  };
  // 승객이 정류장에 생길 때 짧고 작은 '톡', 주요 인물이 나타날 때는 조금 높고 또렷한 두 음
  App.sfx = function (kind) {
    if (!App.sound) return;
    try {
      if (kind === 'resident') { tone(784, 0, 0.16, 0.07, 'triangle'); tone(1047, 0.09, 0.2, 0.07, 'triangle'); }
      else tone(1175, 0, 0.07, 0.035, 'triangle');
    } catch (e) { /* 소리 없이 계속 */ }
  };
  App.setSound = function (on) {
    App.sound = !!on; PB.Storage.writeSound(App.sound);
    var c = document.querySelector('#opt-sound'); if (c) c.checked = App.sound;
    var b = document.querySelector('#run-sound'); if (b) { b.setAttribute('aria-pressed', String(App.sound)); b.querySelector('[aria-hidden]').textContent = (App.sound ? '🔊' : '🔇') + ' '; }
  };
  App.audioCreated = function () { return !!audio; };

  function init() {
    App.player = PB.Storage.readPlayer();
    App.seedParam = S.parseSeedParam(new URLSearchParams(location.search).get('seed'));
    var note = $('#seed-note');
    if (App.seedParam.mode === 'fixed') {
      note.textContent = '지정된 세팅 ' + App.seedParam.seed + '(으)로 시작해요.';
      Array.prototype.forEach.call(document.querySelectorAll('input[name=setting]'), function (r) { r.disabled = true; });
    } else if (App.seedParam.note) note.textContent = App.seedParam.note;
    var lines = PB.Narrative.hookLines(S.create(cfg, { mode: 'default' }));
    $('#hook-1').textContent = lines[0];
    $('#hook-2').textContent = lines[1];

    var controls={onCamera:function(){if(App.net)App.net.redraw();},onNode:onNode,canEdit:function(){return App.s&&App.s.stage==='plan';},onLink:function(a,b){if(App.onLink)App.onLink(a,b);},onRoute:function(n,i){if(App.onRouteClick)App.onRouteClick(n,i);},onRouteDouble:function(n,i){if(App.onRouteDouble)App.onRouteDouble(n,i);},
      // 지도 위 시계 영역 — 2D 지도는 이 영역 밑에 정류장이 깔리지 않도록 화면을 비켜 그린다
      reserved:function(){return [];}};
    App.map2d = PB.Map2D.create($('#stage-svg'), controls);
    // 시각 토큰을 CSS 변수로(노선 색·지도 크기) — 화면 CSS와 지도 오버레이가 같은 값을 쓴다
    cfg.ui.routeColors.forEach(function (c, i) { document.documentElement.style.setProperty('--route-' + (i + 1), c); });
    App.view = App.map2d;
    var want3d = new URLSearchParams(location.search).get('no3d') !== '1';
    var note3d = $('#no3d-note');
    if (want3d && PB.View3D) {
      var v3 = PB.View3D.create($('#stage-3d'), controls);
      if (v3.ok) {
        App.view3d = v3; App.view = v3;
        $('#stage-3d').hidden = false; App.map2d.show(false);
        $('#btn-view-toggle').hidden = false;
      } else { note3d.hidden = false; note3d.textContent = '이 기기에서는 3D 화면을 쓸 수 없어 지도로 보여 드려요. 모든 기능은 그대로예요.'; }
    } else if (!want3d) { note3d.hidden = false; note3d.textContent = '지도 보기로 시작했어요.'; }
    // 네트워크·상태층(map-network.js): 지금 보이는 뷰의 장면·노선·대기·선택을 받아 같은 그림 체계로 그린다
    App.net = PB.MapNetwork.create($('#stage'), function () { return App.view; }, { onLayout: function () { /* 얼굴·노선 손잡이도 이름표와 같은 그림에서 바로 자리 잡기(150ms 주기만 기다리면 카메라·무대 크기 전환 중 옛 자리에 남음) */ if (PB.UI.mapLayout) PB.UI.mapLayout(); if (PB.UI.placeRunNotices) PB.UI.placeRunNotices(); if (PB.Arrival) PB.Arrival.layout(); if (PB.Hud) PB.Hud.layout(); }, reserved: function () { return controls.reserved(); }, tokens: function () { var m = cfg.ui.map, w = cfg.ui.wait; return { line: m.line, lineActive: m.lineActive, casing: m.casing, stop: m.stop, cap: m.cap, waitCaution: w.caution, waitDanger: w.danger }; } });
    [App.map2d, App.view3d].forEach(function (v) {
      if (!v) return;
      ['setScene', 'setRoutes', 'setWaiting', 'setSelected', 'setSelectable', 'flash'].forEach(function (fn) {
        var orig = v[fn]; if (!orig) return;
        v[fn] = function (x) { var r = orig.apply(v, arguments); if (App.view === v) App.net[fn](x); return r; };
      });
    });
    $('#btn-view-toggle').addEventListener('click', App.toggleView);
    // 지도 위 금액 줄·아래 조작부 높이가 그린 뒤에 바뀌어도(미니멀 금액 표시, 오류 줄 등) 지도 높이를 다시 맞춘다. 높이가 그대로면 아무것도 안 한다
    if (root.ResizeObserver) { var colT = null; new root.ResizeObserver(function () { clearTimeout(colT); colT = setTimeout(function () {
      var scr = document.body.dataset.screen, st = $('#stage'); if (!App.s || (scr !== 'plan' && scr !== 'run')) return;
      var before = st.style.height + '|' + st.style.maxWidth; App.fitFrame();
      if (st.style.height + '|' + st.style.maxWidth !== before) { if (App.view && App.view.refit) App.view.refit(); if (App.net) App.net.redraw(); }
    }, 60); }).observe(document.querySelector('.stage-col')); }
    var fitT = null; root.addEventListener('resize', function () { clearTimeout(fitT); fitT = setTimeout(function () { if (App.s) { App.fitFrame(); if (App.view && App.view.refit) App.view.refit(); if (App.net) App.net.redraw(); } }, 80); });
    App.motion = !!root.__pbReduceMotion;
    $('#opt-motion').checked = App.reducedMotion();
    $('#opt-motion').addEventListener('change', function (e) { App.motion = e.target.checked; App.view.setReducedMotion(App.reducedMotion()); });
    App.sound = PB.Storage.readSound(); $('#opt-sound').checked = App.sound;
    App.speed = PB.Storage.readSpeed();
    $('#opt-sound').addEventListener('change', function (e) { App.setSound(e.target.checked); if (App.sound) App.chime(); });
    // 캐릭터 소개 → 맵 화면 위 Stage 1 카드 → 교육 모달 → 단계 안내 순서. 세팅 라디오는 소개 전에 읽어 둔다
    // 소개 컷 → 지도 계획 위에 Stage 1 카드(2026-11-01 사용자: Stage 카드가 안 뜬다)
    function newGame() { PB.Cutscene.play('intro', function () { App.startGame(); var c = App.s.config; PB.Cutscene.play('stage', function () {}, null, { number: 1, total: c.phases.length, name: c.phases[0] }); }); }
    // 저장된 진행이 있으면 ‘이어하기’를 먼저 보여 주고, 새로 시작은 지워도 되는지 한 번 묻는다
    var saved = PB.Storage.readSave(cfg.SCENARIO_VERSION), cont = $('#btn-continue');
    if (saved && cont) {
      var ss = saved.session, total = (ss.config ? ss.config.phases.length : cfg.phases.length);
      cont.hidden = false;
      $('#continue-note').textContent = (ss.mode === 'default' ? '기본' : '랜덤') + ' 세팅 · ' + (ss.stage === 'ending' ? (ss.end && ss.end.cause === 'bankrupt' ? '파산으로 운영 종료' : ss.end && ss.end.cause === 'contract' ? App.contractTitle(ss.end) : '학기 마무리') : ss.phase + ' / ' + total + '단계 ' + ({ reveal: '계획', plan: '계획', run: typeof ss.runCursor==='number'?'운행 이어보기':'운행(출발 직전 계획으로 돌아가요)', result: '결과' }[ss.stage] || '')) + ' · ' + new Date(saved.savedAt).toLocaleString('ko-KR');
      cont.addEventListener('click', function () { App.resume(PB.Storage.readSave(cfg.SCENARIO_VERSION) || saved); });
      $('#btn-start').textContent = '새로 시작하기';
      $('#btn-start').classList.remove('btn-primary');
    }
    $('#btn-start').addEventListener('click', function () {
      if (PB.Storage.readSave(cfg.SCENARIO_VERSION)) { App.restartToNew = true; $('#confirm-restart').showModal(); return; }
      newGame();
    });
    App.newGame = newGame;
    $('#btn-help').addEventListener('click', function () { $('#btn-tutorial-replay').hidden = !App.s; if (PB.Arrival) PB.Arrival.fillHelp(App); $('#help').showModal(); });
    $('#btn-tutorial-replay').addEventListener('click', function () { $('#help').close(); App.showTutorial(); });
    $('#btn-settings').addEventListener('click', function () { $('#settings').showModal(); });
    $('#restart-no').addEventListener('click', function () { $('#confirm-restart').close(); });
    $('#restart-yes').addEventListener('click', function () { $('#confirm-restart').close(); PB.Storage.clearSave(); if (App.restartToNew && !App.s) { App.restartToNew = false; newGame(); } else location.reload(); });
    if (App.afterInit) App.afterInit();
  }

  root.PB.App = App;
  // 스크립트는 body 끝에서 읽히므로 DOM이 이미 있다 — 바로 초기화
  init();
  App.ready = true;
})(window);
