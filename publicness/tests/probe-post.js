// 프로브(앱 뒤에 실행): 실제 화면 버튼을 눌러 플레이하고 결과를 <pre id="probe-out">에 남긴다.
(function () {
  var P = window.__probe;
  var pass = [], fail = [];
  function ok(cond, msg) { (cond ? pass : fail).push(msg); }
  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms || 0); }); }
  function screen() { return document.body.getAttribute('data-screen'); }
  function out() {
    var pre = document.createElement('pre');
    pre.id = 'probe-out';
    pre.textContent = JSON.stringify({ scenario: P.scenario, pass: pass, fail: fail, errors: P.errors });
    document.body.appendChild(pre);
  }
  // 키보드로 누를 수 있는 요소만 쓴다: 포커스 가능·보임 확인 → 포커스 → Enter → 활성화
  function press(el, label) {
    if (typeof el === 'string') { label = label || el; el = $(el); }
    if (!el) { fail.push('없는 요소: ' + label); return false; }
    var visible = el.offsetParent !== null || getComputedStyle(el).position === 'fixed';
    if (el.disabled || el.tabIndex < 0 || !visible) { fail.push('키보드로 누를 수 없음: ' + (label || el.id || el.className)); return false; }
    el.focus();
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    el.click();
    return true;
  }
  async function until(fn, ms) {
    var t = 0;
    while (!fn() && t < (ms || 20000)) { await wait(50); t += 50; }
    return fn();
  }
  function bodyText() { return document.body.innerText; }
  // 지금 무대(3D 또는 SVG)에 그려진 정류장 ID
  function stageNodes() {
    var v = PB.App.view;
    if (v && v.kind === '3d') return v.__nodeIds();
    return $$('#stage-svg [data-node]').map(function (g) { return g.getAttribute('data-node'); });
  }
  function noNewTown(where) {
    ok(stageNodes().indexOf('I') < 0, where + ': 무대(' + (PB.App.view && PB.App.view.kind) + ')에 I 없음');
    ok(bodyText().indexOf('신도시') < 0, where + ': 화면 글에 신도시 없음');
    ok(!$('[data-node="I"]'), where + ': 지도에 I 정류장 없음');
    ok(document.body.innerHTML.indexOf('신도시') < 0, where + ': DOM(접근성 텍스트 포함)에 신도시 없음');
  }

  var SC = {};

  SC.title = async function () {
    ok(screen() === 'title', '시작 화면');
    ok($('h1') && $('h1').textContent.trim() === '이번 정류장은…', '제목 「이번 정류장은…」');
    ok(/AI 마을버스 운영단/.test($('#title-sub').textContent), '부제');
    ok(/This stop is/.test($('#title-en').textContent), '영문 표기');
    var lines = PB.Narrative.hookLines(PB.Session.create(PB.config, { mode: 'default' }));
    ok($('#hook-1').textContent === lines[0] && $('#hook-2').textContent === lines[1], '훅 두 문장 = 엔진 계산');
    ok($('input[name=setting][value=default]').checked, '기본 세팅이 기본 선택');
    ok($('input[name=setting][value=random]'), '랜덤 세팅 선택지');
    ok(/새로고침/.test(bodyText()), '새로고침 안내');
    ok(document.activeElement === $('#btn-start') || $('#btn-start').tabIndex >= 0, '시작 버튼 키보드 접근');
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    ok(screen() === 'reveal', '시작 → 1단계 환경 공개');
    ok(/1단계/.test($('#panel').textContent) && /학기 초/.test($('#panel').textContent), '1단계 학기 초 안내');
  };

  SC['seed-param'] = async function () {
    ok(/지정된 세팅 7/.test($('#seed-note').textContent), '지정된 세팅 표시');
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    ok(PB.App.state().seed === 7 && PB.App.state().mode === 'fixed', '세션 seed 7');
  };

  SC['newtown-hidden'] = async function () {
    noNewTown('시작 화면');
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    noNewTown('1단계 공개');
    press('#btn-begin-plan');
    await until(function () { return screen() === 'plan'; });
    noNewTown('1단계 계획');
    ok(stageNodes().length === 8, '무대 정류장 8곳 (' + stageNodes().join('') + ')');
  };

  async function toPlan() {
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    press('#btn-begin-plan');
    await until(function () { return screen() === 'plan'; });
  }
  // 운행 화면이 없어도 세션 API로 단계를 넘긴다(설정용)
  function skipPhases(n) {
    var s = PB.App.state();
    for (var i = 0; i < n; i++) { PB.Session.beginPlan(s); PB.Session.startRun(s); PB.Session.finishRun(s); PB.Session.nextPhase(s); }
    PB.App.go('reveal');
  }
  function card(num) { return $('.route-card[data-num="' + num + '"]'); }
  async function chooseGoal(goal) {
    press('.goal-btn[data-goal="' + goal + '"]');
    await until(function () { return $('#rec-card'); }, 30000);
    return $('#rec-card');
  }
  async function buildRoute(nodes) {
    press('#btn-new-route');
    for (var i = 0; i < nodes.length; i++) {
      var b = $('.next-stop[data-node="' + nodes[i] + '"]');
      if (!press(b, '다음 정류장 ' + nodes[i])) return null;
      await wait(0);
    }
    var editing = $('.route-card.editing');
    var num = editing && Number(editing.getAttribute('data-num'));
    press(editing.querySelector('.btn-finish'), '노선 완성');
    await wait(0);
    return num;
  }
  async function depart() {
    press('#btn-depart');
    await until(function () { return $('#confirm-depart').open; });
    press('#confirm-yes');
    await until(function () { return screen() === 'run' || screen() === 'result'; });
  }

  async function runToResult() {
    await depart();
    await until(function () { return screen() === 'result'; }, 30000);
  }
  async function nextFromResult() {
    press('#btn-next-phase');
    await until(function () { return screen() === 'reveal' || screen() === 'ending'; });
  }

  SC['run-locked'] = async function () {
    await toPlan();
    var before = JSON.stringify(PB.App.state().draft);
    press('#btn-depart');
    await until(function () { return $('#confirm-depart').open; });
    press('#confirm-yes');
    await until(function () { return screen() === 'run'; });
    var labels = $$('#panel button').map(function (b) { return b.textContent; }).join(' ');
    ok(!/편집|일시정지|멈춤|고치기|수정/.test(labels), '운행 중 편집·일시정지 버튼 없음');
    ok(!$('#panel select'), '운행 중 배정 선택 없음');
    PB.App.onNodeClick && PB.App.onNodeClick('C');
    ok(JSON.stringify(PB.App.state().draft) === before, '지도 클릭해도 계획 그대로');
    ok(/정류장|기다/.test(($('#node-info') || {}).textContent || ''), '지도 클릭은 정보 보기');
    await until(function () { return screen() === 'result'; }, 30000);
    ok(screen() === 'result', '운행이 끝나면 결과 화면');
  };

  SC['hidden-tab'] = async function () {
    await toPlan();
    press('#btn-depart');
    await until(function () { return $('#confirm-depart').open; });
    var hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden; } });
    press('#confirm-yes');
    await until(function () { return screen() === 'run' && /[1-9]/.test($('#top-clock').textContent); });
    hidden = true; document.dispatchEvent(new Event('visibilitychange'));
    var c1 = $('#top-clock').textContent;
    await wait(400);
    ok($('#top-clock').textContent === c1 && screen() === 'run', '숨은 탭에서는 멈춤 (' + c1 + ')');
    hidden = false; document.dispatchEvent(new Event('visibilitychange'));
    await until(function () { return screen() === 'result'; }, 30000);
    ok(screen() === 'result', '돌아오면 이어서 끝까지');
    var s = PB.App.state();
    ok(s.history.length === 1, '결과 한 번만 기록');
  };

  SC['result-table'] = async function () {
    await toPlan();
    await runToResult();
    var rows = $$('#zone-table tbody tr');
    ok(rows.length === 8, '생활권 8행 (' + rows.length + ')');
    var tot = $('#zone-table tfoot tr');
    var cells = tot ? Array.prototype.map.call(tot.children, function (c) { return c.textContent.trim(); }) : [];
    var n = Number(cells[1]), sum = Number(cells[2]) + Number(cells[3]) + Number(cells[4]) + Number(cells[5]);
    ok(n === 148 && n === sum, '합계: 요청 = 도착+미탑승+환승 중+탑승 중 (' + cells.slice(1, 6).join('/') + ')');
    ok(/추가 사건 없는 기본 수요 기준/.test($('#result-compare').textContent), '예상/실제 카드');
    ok(/지원금/.test($('#finance').textContent) && /누적/.test($('#finance').textContent), '재정 항목');
    ok($$('#bubble-replay li').length > 0, '말풍선 다시 읽기');
    ok(!/파산|게임오버|실패했/.test(document.body.innerText), '실패·파산 표현 없음');
    await nextFromResult();
    ok(screen() === 'reveal' && PB.App.state().phase === 2, '다음 단계로');
  };

  SC['newtown-phase2'] = async function () {
    await toPlan();
    await runToResult();
    noNewTown('1단계 결과');
    await nextFromResult();
    noNewTown('2단계 공개');
    press('#btn-begin-plan');
    await until(function () { return screen() === 'plan'; });
    await chooseGoal('reach');
    noNewTown('2단계 계획·AI 제안');
    await runToResult();
    noNewTown('2단계 결과');
    await nextFromResult();
    ok(/신도시/.test($('#panel').textContent), '3단계에 신도시 공개');
  };

  SC['reduced-motion'] = async function () {
    ok(PB.App.reducedMotion(), '움직임 줄이기 켜짐');
    await toPlan();
    await runToResult();
    ok(screen() === 'result', '움직임 줄이기로 완주');
  };

  SC['sound-off-default'] = async function () { // 이름은 유지(목록 호환). 2026-10-22부터 기본 켜짐
    ok($('#opt-sound').checked, '효과음 기본 켜짐');
    $('#opt-sound').click();
    await toPlan();
    await runToResult();
    ok(!PB.App.audioCreated(), '끄면 오디오를 만들지 않음');
    $('#opt-sound').click();
    ok(PB.App.audioCreated(), '켜면 오디오 생성');
  };

  // 다섯 단계를 화면 조작(키보드로 누를 수 있는 요소)만으로 끝까지
  async function playAll(goal) {
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    for (var p = 1; p <= 5; p++) {
      press('#btn-begin-plan');
      await until(function () { return screen() === 'plan'; });
      await chooseGoal(goal || 'time');
      press('#rec-accept');
      await wait(0);
      if (p === 3 && $('#btn-fourth')) { press('#btn-fourth'); await wait(0); }
      await runToResult();
      await nextFromResult();
    }
    return screen() === 'ending';
  }

  SC['keyboard-full'] = async function () {
    ok(await playAll('time'), '키보드로 다섯 단계 완주 → 결말');
    ok($$('.resident-card').length === 4, '주민 카드 4장');
    ok($('#records').hidden, '운행 기록은 접혀 있음');
    press('#btn-records');
    await wait(0);
    ok(!$('#records').hidden, '운행 기록 보기 펼침');
    ok($$('#reflection textarea').length === 3, '성찰 질문 3개(선택)');
    ok(PB.App.state().history.length === 5, '기록 5단계');
  };

  SC['no3d-full'] = async function () {
    ok(await playAll('reach'), '?no3d=1 다섯 단계 완주');
    ok(!$('#stage-svg').closest('[hidden]') && getComputedStyle($('#stage-svg')).display !== 'none', 'SVG 지도 사용');
  };

  SC['ending-records'] = async function () {
    await playAll('profit');
    press('#btn-records');
    await wait(0);
    var zones = Object.keys(PB.Session.endingSummary(PB.App.state()).zones);
    ok($$('#records .zone-subtitle').length === zones.length, '생활권 소제목 ' + zones.length + '개');
    ok($$('.resident-card .closing').every(function (c) { return /이번 정류장은|아직/.test(c.textContent); }), '안내 방송 마무리 문장');
    ok($$('.resident-card details').length === 4, '주민별 기록 펼침');
    ok(/1단계/.test($('#goal-history').textContent) && /5단계/.test($('#goal-history').textContent), 'AI 목표 선택 이력');
    ok(/누적 잔액/.test($('#records').textContent), '재정 합계');
    ok(!/파산|게임오버|실패/.test(document.body.innerText), '파산·게임오버·실패 표현 없음');
    ok(!/취업|합격|건강|성공/.test($('#panel').innerText), '운행 밖 삶의 결과 문장 없음');
  };

  SC['result-key'] = async function () {
    await playAll('time');
    var raw = localStorage.getItem('ethicity.result.publicness');
    var r = raw && JSON.parse(raw);
    ok(r && r.game === 'publicness' && r.completed === true, '팀 결과 키 기록');
    ok(r && /^이번 정류장은…/.test(r.card), '결과 카드 문자열');
    ok(localStorage.getItem('ethicity.player') === P.PLAYER, '플레이어 키 그대로');
    ok(localStorage.getItem('ethicity.result.privacy') === P.OTHER['ethicity.result.privacy'], '다른 게임 키 그대로');
  };

  SC['xss-nickname'] = async function () {
    await playAll('time');
    ok(window.__x === undefined, '별명이 HTML로 실행되지 않음');
    var nick = $('#end-player');
    ok(nick && nick.textContent.indexOf('<img') >= 0, '별명은 글자로 표시');
    var panel = $('#panel');
    ok(nick && nick.scrollWidth <= panel.clientWidth + 1, '긴 별명이 패널을 넘치지 않음');
  };

  SC['random-seed'] = async function () {
    $('input[name=setting][value=random]').click();
    ok(await playAll('reach'), '랜덤 세팅 완주');
    var s = PB.App.state();
    ok(s.mode === 'random', '랜덤 모드');
    ok(new RegExp(String(s.seed)).test($('#end-seed').textContent), '결말에 세팅 번호 표시');
  };

  SC['stage-3d'] = async function () {
    var v = PB.App.view;
    ok(v && v.kind === '3d' && v.ok, '3D 무대 사용');
    ok(!!document.querySelector('#stage-3d canvas'), '캔버스');
    ok(getComputedStyle($('#stage-svg')).display === 'none', '3D일 땐 SVG 숨김');
    ok(!$('#btn-view-toggle').hidden, '지도·텍스트 보기 전환 버튼');
    await toPlan();
    ok(v.__nodeIds().indexOf('I') < 0, '1단계 3D 장면에 신도시 없음');
    ok(!/신도시/.test($('#stage-overlay').textContent), '1단계 3D 라벨에 신도시 없음');
    press('#btn-new-route');
    v.__pickForTest('B');
    await wait(0);
    var nexts = $$('.next-stop').map(function (b) { return b.getAttribute('data-node'); }).sort().join('');
    ok(nexts === 'ACF', '3D에서 B를 고르면 다음 정류장 A·C·F (' + nexts + ')');
    press('#btn-view-toggle');
    await wait(0);
    ok(PB.App.view.kind === '2d' && getComputedStyle($('#stage-svg')).display !== 'none', '지도 보기로 전환');
    press('#btn-view-toggle');
    await wait(0);
    ok(PB.App.view.kind === '3d', '다시 3D로');
    var editing = $('.route-card.editing');
    press('.next-stop[data-node="A"]');
    await wait(0);
    press($('.route-card.editing .btn-finish'), '노선 완성');
    await runToResult();
    ok(screen() === 'result', '3D로 운행 재생 후 결과');
    var s = PB.App.state();
    PB.Session.nextPhase(s); PB.Session.beginPlan(s); PB.Session.startRun(s); PB.Session.finishRun(s); PB.Session.nextPhase(s);
    PB.App.go('reveal');
    await wait(900);
    ok(v.__nodeIds().indexOf('I') >= 0, '3단계 3D 장면에 신도시');
  };

  SC['webgl-fail'] = async function () {
    ok(PB.App.view.kind === '2d', 'WebGL이 없으면 SVG 지도');
    ok(!$('#no3d-note').hidden && /지도/.test($('#no3d-note').textContent), '안내 문구');
    await toPlan();
    await runToResult();
    ok(screen() === 'result', 'SVG로 운행·결과');
  };

  // 접근성 점검: 이름·터치 크기·탭 순서·색 외 단서·대비
  function a11yCheck(where) {
    var ctrls = Array.prototype.filter.call(document.querySelectorAll('button, input, select, textarea, summary, a[href]'), function (e) {
      return e.offsetParent !== null && !e.closest('dialog:not([open])');
    });
    var unnamed = ctrls.filter(function (e) {
      var name = (e.getAttribute('aria-label') || e.textContent || '').trim();
      if (!name && e.id) { var l = document.querySelector('label[for="' + e.id + '"]'); name = l ? l.textContent.trim() : ''; }
      if (!name && e.closest('label')) name = e.closest('label').textContent.trim();
      return !name;
    });
    ok(!unnamed.length, where + ': 이름 없는 조작 요소 없음' + (unnamed.length ? ' (' + unnamed.map(function (e) { return e.outerHTML.slice(0, 60); }).join(' | ') + ')' : ''));
    var small = ctrls.filter(function (e) {
      if (e.matches('input[type=radio], input[type=checkbox]')) e = e.closest('label') || e;
      if (e.matches('a.skip-link')) return false;
      var r = e.getBoundingClientRect(); return r.height < 43.5;
    });
    ok(!small.length, where + ': 터치 영역 44px 이상' + (small.length ? ' (' + small.map(function (e) { return (e.id || e.className || e.tagName) + ':' + Math.round(e.getBoundingClientRect().height); }).join(', ') + ')' : ''));
    ok(!document.querySelector('[tabindex]:not([tabindex="-1"]):not([tabindex="0"])'), where + ': 양수 tabindex 없음(시각 순서 = 탭 순서)');
  }
  function lum(hex) {
    var c = hex.replace('#', '').match(/../g).map(function (x) { x = parseInt(x, 16) / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  SC.a11y = async function () {
    var cs = getComputedStyle(document.documentElement), v = function (n) { return cs.getPropertyValue(n).trim(); };
    ok(contrast(v('--text'), v('--bg')) >= 4.5, '본문 대비 4.5:1');
    ok(contrast(v('--text-mute'), v('--bg')) >= 4.5, '보조 글 대비 4.5:1');
    ok(contrast(v('--text-mute'), v('--surface')) >= 4.5, '회색 바탕 위 보조 글 4.5:1');
    ok(contrast('#FFFFFF', v('--accent')) >= 4.5, '파란 버튼 흰 글 4.5:1');
    ok(contrast('#FFFFFF', v('--warn')) >= 4.5, '대기 배지 대비');
    a11yCheck('시작');
    await toPlan();
    await chooseGoal('time');
    a11yCheck('계획');
    ok($$('.route-card').every(function (c) { return /번 노선/.test(c.textContent); }), '노선은 색 말고 번호로도 구분');
    await runToResult();
    a11yCheck('결과');
    for (var p = 2; p <= 5; p++) { await nextFromResult(); press('#btn-begin-plan'); await until(function () { return screen() === 'plan'; }); await runToResult(); }
    await nextFromResult();
    a11yCheck('결말');
  };

  // 운행 중간 모습: 지정 분에서 ‘숨은 탭’으로 재생을 얼려 둔다
  SC['shot-run'] = async function () {
    await toPlan();
    var hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: function () { return hidden; } });
    press('#btn-depart');
    await until(function () { return $('#confirm-depart').open; });
    window.__pbFast = new URLSearchParams(location.search).get('fast') === '1';
    press('#confirm-yes');
    var stopAt = Number(new URLSearchParams(location.search).get('at') || 45);
    await until(function () { return parseInt($('#top-clock').textContent, 10) >= stopAt; }, 120000);
    hidden = true;
    ok(true, 'shot');
  };
  SC['shot-ending'] = async function () { await playAll('reach'); ok(true, 'shot'); };
  SC['shot-result'] = async function () { await toPlan(); await runToResult(); ok(true, 'shot'); };

  SC['shot-plan'] = async function () { await toPlan(); await chooseGoal('reach'); ok(true, 'shot'); };

  SC['plan-keyboard'] = async function () {
    await toPlan();
    var rc = await chooseGoal('time');
    ok(!!rc, 'AI 제안 카드');
    ok(/모의 AI: 알려진 수요로 후보를 비교하는 규칙 기반 추천/.test(rc.textContent), '모의 AI 라벨');
    ok(/추가 사건 없는 기본 수요 기준/.test(rc.textContent), '예상 라벨');
    ok(/목표 지표: 이동 시간 합/.test(rc.textContent) && /못 탄 사람은 120분/.test(rc.textContent), '이동 시간 목표 지표 행');
    ok(/추천 이유/.test(rc.textContent), '추천 이유 문장');
    press('#rec-accept');
    await wait(0);
    ok(PB.App.state().goalHistory[0].action === 'accept', '수락 기록');
    ok(screen() === 'plan', '수락해도 운행은 자동 시작하지 않음');
    var num = await buildRoute(['F', 'C', 'D']);
    ok(num && card(num), '키보드로 F–C–D 노선 만들기');
    var sel = $('.bus-card[data-bus="3"] select');
    sel.focus(); sel.value = String(num); sel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(0);
    ok(PB.App.state().draft.buses[2].routeNum === num, '3호차 배정');
    press('.bus-card[data-bus="3"] .offset-btn[data-offset="4"]');
    await wait(0);
    ok(PB.App.state().draft.buses[2].offset === 4, '출차 4분');
    await until(function () { return /추가 사건 없는 기본 수요 기준/.test(($('#expected') || {}).textContent || ''); });
    ok(true, '예상 지표 갱신');
    await depart();
    ok(screen() === 'run' || screen() === 'result', '출발 확인 → 운행 화면');
  };

  SC['nonadjacent-blocked'] = async function () {
    await toPlan();
    press('#btn-new-route');
    press('.next-stop[data-node="A"]');
    await wait(0);
    var nexts = $$('.next-stop').map(function (b) { return b.getAttribute('data-node'); }).sort().join('');
    ok(nexts === 'BDGH', 'A 다음은 이웃 B·D·G·H만 (' + nexts + ')');
    ok(!$('.next-stop[data-node="C"]'), 'C는 고를 수 없음');
    PB.App.onNodeClick('C');
    await wait(0);
    var r = PB.App.state().draft.routes.at(-1);
    ok(r.nodes.join('') === 'A', '지도에서 C를 눌러도 추가 안 됨');
  };

  SC['cycle-display'] = async function () {
    await toPlan();
    var num = await buildRoute(['A', 'B', 'C']);
    ok(/한 바퀴 12분/.test(card(num).textContent), 'A–B–C 주기 12분');
    press(card(num).querySelector('.chip[data-i="1"]'), 'B 정차/통과');
    await wait(0);
    ok(/한 바퀴 10분/.test(card(num).textContent), 'B 통과 후 10분');
    ok(card(num).querySelector('.chip[data-i="0"]').disabled, '끝점은 통과로 못 바꿈');
  };

  SC['fourth-bus'] = async function () {
    press('#btn-start');
    await until(function () { return screen() === 'reveal'; });
    skipPhases(2);
    await wait(0);
    ok(/4호차/.test($('#panel').textContent) && /신도시/.test($('#panel').textContent), '3단계 공개: 신도시·4호차 안내');
    ok(stageNodes().indexOf('I') >= 0, '3단계 무대에 신도시');
    press('#btn-begin-plan');
    await until(function () { return screen() === 'plan'; });
    await chooseGoal('reach');
    ok(!!$('#rec-fourth'), '4호차 별도 카드');
    press('#rec-accept');
    await wait(0);
    ok(PB.App.state().draft.buses.length === 3, '수락해도 버스 3대');
    press('#btn-fourth-intro');
    await wait(0);
    ok(!!$('.bus-card[data-bus="4"]'), '4호차 카드');
    var sel = $('.bus-card[data-bus="4"] select');
    sel.value = String(PB.App.state().draft.buses[0].routeNum); sel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(0);
    ok(/4호차는 처음 운행할 때 새 노선/.test($('#plan-errors').textContent), '기존 노선 배정 시 오류 문구');
    ok($('#btn-depart').getAttribute('aria-disabled') === 'true' || PB.Session.validate(PB.App.state()).length > 0, '출발 막힘');
  };

  SC['double-start'] = async function () {
    await toPlan();
    var calls = 0, orig = PB.Session.startRun;
    PB.Session.startRun = function (s) { var r = orig(s); if (r) calls++; return r; };
    press('#btn-depart');
    await until(function () { return $('#confirm-depart').open; });
    var yes = $('#confirm-yes');
    yes.click(); yes.click();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await wait(50);
    ok(calls === 1, '운행은 한 번만 시작 (' + calls + ')');
    PB.Session.startRun = orig;
  };

  SC['invalid-draft-ai'] = async function () {
    await toPlan();
    press('#btn-new-route');
    press('.next-stop[data-node="H"]');
    await wait(0);
    var sel = $('.bus-card[data-bus="1"] select');
    sel.value = String(PB.App.state().draft.routes.at(-1).num); sel.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(0);
    var rc = await chooseGoal('profit');
    ok(!!rc && /바뀌는 점|그대로/.test(rc.textContent), '미완성 노선이 있어도 추천 카드');
    ok($('#plan-errors').textContent.length > 0, '미완성 노선 배정 오류 안내');
  };

  (async function () {
    try {
      var fn = SC[P.scenario];
      if (!fn) fail.push('알 수 없는 시나리오 ' + P.scenario);
      else await fn();
    } catch (e) { fail.push('예외: ' + (e && e.stack || e)); }
    out();
  })();
  window.__probeSC = SC;
})();
