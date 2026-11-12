/* 새 단계 도착(2026-11-01 단계 전 설명 줄이기): 단계 전 안내 화면 대신 지도 위에서 바뀐 것을 보여 준다.
 *  · 배너 한 줄(‘3단계 · 변화기 · 신도시가 생겼어요 · 버스 +1’) — 첫 클릭이나 3초 뒤 사라짐, aria-live
 *  · 새 정류장 강조 고리 2.6초 + 이름표 ‘새 정류장’ 배지(지도 네트워크층), 새 버스는 대기 칸에서 반짝임, 새 인물 얼굴은 출발 정류장(기존 얼굴층)
 *  · 1단계 첫 노선 코치: 지도 위 말풍선 + 손가락(출발할 정류장 → 이어 갈 정류장). 모달 없음. 도움말에서 다시 보기
 *  · 텍스트 모드 계획 패널 맨 위 #stage-brief: 시각적으로 뺀 문장(바뀐 것·새 인물 원래 대사·오늘 요청·학기 말 기준·이번 목표)을 그대로
 *  · 도움말 ‘규칙과 재정’ — 지원금·공공서비스 수행분·임차·재정 규칙·대기 기준·이동 요청(예전 단계 안내의 표를 한곳에) */
(function (root) {
  'use strict';
  var PB = root.PB, S = PB.Session, coachTimer = null, bannerTimer = null;
  function app() { return PB.App; }
  function el(t, a, x) { return app().el(t, a, x); }
  function $(s) { return document.querySelector(s); }

  function arrivalNow(A) { var a = A.arrival, s = A.s; return a && s && a.phase === s.phase && s.stage === 'plan' ? a : null; }
  // 이번 단계 동안(계획·운행) 남는 ‘새’ 표시(P1-3)
  function arrivalPhase(A) { var a = A.arrival, s = A.s; return a && s && a.phase === s.phase && (s.stage === 'plan' || s.stage === 'run') ? a : null; }
  function dismissBanner() { var A = app(), a = A.arrival; if (a) a.done = true; var b = $('#map-banner'); if (b) b.remove(); clearTimeout(bannerTimer); document.removeEventListener('pointerdown', onFirst, true); document.removeEventListener('keydown', onFirst, true);
    var p = A._pendingToast; A._pendingToast = null; if (p && ['plan', 'run'].indexOf(document.body.dataset.screen) >= 0) A.toast(p[0], p[1]); } // 배너가 알림 줄에 있는 동안 미룬 알림
  function onFirst(e) { if (e.type === 'keydown' && (e.key === 'Tab' || e.key === 'Shift')) return; dismissBanner(); }
  function netReady(A) { return !A.net || !A.net.ready || A.net.ready(); }
  // 좁은 화면(≤700px) 계획·운행: 지도 바로 아래 늘 비워 둔 알림 줄(#map-strip, index.html). 지도 틀 크기와 무관(좁은 화면 지도 높이는 CSS)
  function narrowStrip() { var s = $('#map-strip'), bc = document.body.classList; if (s && (bc.contains('phone-p') || bc.contains('phone-l') || bc.contains('rail') || bc.contains('sheet'))) return s; /* 넓은 화면(2026-11-05 P1-1): 지도 옆 칸·지도 아래 줄이 늘 비어 있으므로 알림·배너는 지도를 덮지 않고 거기에 */ /* 휴대폰 배치(2026-11-02): 계획 = 맨 위 머리말(단계·설정·도움말) 위에 겹치는 알림 줄(조작부를 밀지 않고 시간·수지·인물 카드·지도를 가리지 않음), 운행 = 지도 아래(세로)·오른쪽 패널(가로) 줄 — css/mobile.css */ return s && root.innerWidth <= 700 && s.offsetParent !== null ? s : null; }
  function banner(A) {
    var a = arrivalNow(A), old = $('#map-banner');
    if (!a || a.done) { if (old) old.remove(); return; }
    if (!a.perf) a.perf = performance.now();
    if (!old) {
      /* 2026-11-02 재검증 P1-5 ④: 배너는 카메라가 자리 잡고 이름표가 배치된 뒤(net ready) 한 번만 놓고, 그때부터 3초 보인다.
       * 예전에는 이름표가 구석에 몰린 상태로 첫 자리를 잡아 자리 잡은 뒤 1~2번 옮겨 갔다(3D 1280 3단계 381,202 → 421,202 → 661,484) */
      old = el('p', { id: 'map-banner', 'class': 'map-banner', role: 'status', 'aria-live': 'polite' }, a.line);
      old.style.visibility = 'hidden';
      $('#stage').appendChild(old);
      // 배너를 띄운 바로 그 클릭(다음 단계 버튼·컷 버튼)에 닫히지 않게 한 박자 뒤부터 첫 클릭을 기다린다
      setTimeout(function () { if (!a.done) { document.addEventListener('pointerdown', onFirst, true); document.addEventListener('keydown', onFirst, true); } }, 250);
    }
    if (netReady(A)) placeBanner(A);
    else if (!a.bannerFallback) a.bannerFallback = setTimeout(function () { var b = $('#map-banner'); if (b && b.style.visibility && !a.done) placeBanner(app()); }, 5000); // 예외: 5초가 지나도 지도가 자리 잡지 못하면 그때 자리로
  }
  function showBanner(b) { if (!b.style.visibility) return; b.style.visibility = ''; clearTimeout(bannerTimer); bannerTimer = setTimeout(dismissBanner, 6000); }
  /* 지도 위에 띄우는 상자(배너·첫 노선 안내·알림)가 피할 것: 정류장 원(반지름 + 6px, ×10⁶) · 이름표·얼굴·번호 원·시계 묶음(×1000) · 정류장 여백 햇살(×20) */
  function mapRects(A) {
    var SR = (((A.s && A.s.config.ui) || {}).map || { stop: 9 }).stop + 6, rects = [];
    (A.net && A.net.rects ? A.net.rects() : []).forEach(function (r) {
      if (r.kind === 'stop') { var cx = r.x + r.w / 2, cy = r.y + r.h / 2; rects.push({ x: cx - SR, y: cy - SR, w: SR * 2, h: SR * 2, k: 1e6 }); rects.push({ x: r.x, y: r.y, w: r.w, h: r.h, k: 20 }); }
      else if (r.kind === 'label' || r.kind === 'face' || r.kind === 'cap' || r.kind === 'hud') rects.push({ x: r.x, y: r.y, w: r.w, h: r.h, k: 1000 });
    });
    return rects;
  }
  // 지도 위 DOM 표시(노선 손잡이 ‘버스 ×N’·인물 얼굴·첫 노선 안내·손가락·운행 경고 문구·말풍선·배너)도 가리지 않는다 — 덮으면 끌거나 누를 수 없다
  function domRects(stage, sels) {
    var sr = stage.getBoundingClientRect(), out = [];
    [].forEach.call(document.querySelectorAll(sels), function (h) { if (h.hidden || h.style.visibility === 'hidden') return; var r = h.getBoundingClientRect(); if (r.width && r.height) out.push({ x: r.left - sr.left - 6, y: r.top - sr.top - 6, w: r.width + 12, h: r.height + 12, k: 1000 }); });
    return out;
  }
  function coverCost(rects, c, bw, bh) { return rects.reduce(function (sum, r) { return sum + Math.max(0, Math.min(c.x + bw, r.x + r.w) - Math.max(c.x, r.x)) * Math.max(0, Math.min(c.y + bh, r.y + r.h) - Math.max(c.y, r.y)) * r.k; }, 0); }
  /* 지도 안 빈자리 찾기(배너·알림 공용): 폭을 좁혀 가며(variants: [최대 폭, 작은 글씨 class]) 아무것도 안 가리는 자리가 있는 첫 모양.
   * pref(c, bw, bh) = 같은 비용일 때 고르는 순서(작을수록 먼저). 반환 { v, c, a } — a < 1000이면 빈자리, 아니면 가장 덜 가리는 자리 */
  function findSpot(box, W, H, rects, variants, compactCls, pref) {
    var M = 6, pick = null;
    variants.some(function (v) {
      if (compactCls) box.classList.toggle(compactCls, !!v[1]);
      box.style.left = '0px'; box.style.top = '0px'; box.style.right = 'auto'; box.style.bottom = 'auto'; box.style.transform = 'none'; box.style.margin = '0'; box.style.maxWidth = Math.max(120, v[0]) + 'px';
      var bw = box.offsetWidth, bh = box.offsetHeight, best = null;
      for (var gx = M; gx <= W - bw - M + 9; gx += 10) for (var gy = M; gy <= H - bh - M + 7; gy += 8) { // 10×8px 격자(오른쪽·아래 가장자리 자리 포함)
        var c = { x: Math.min(gx, W - bw - M), y: Math.min(gy, H - bh - M) }, a = coverCost(rects, c, bw, bh), k = a + pref(c, bw, bh);
        if (!best || k < best.k) best = { c: c, k: k, a: a };
      }
      if (!best) return false;
      if (!pick || best.a < pick.a) pick = { v: v, c: best.c, a: best.a };
      return best.a < 1000;
    });
    return pick;
  }
  // 넓은 화면에서 지도 틀이 칸보다 좁으면(지도 양옆 빈 칸) 그 칸에 — 지도도 위아래 인물 칩·조작부도 가리지 않는다. 칸이 좁으면 null
  function gutterSpot(stage, box, alignBottom) {
    var sr = stage.getBoundingClientRect(), col = stage.parentNode, cr = col.getBoundingClientRect(), cs = getComputedStyle(col);
    var left = sr.left - cr.left - parseFloat(cs.paddingLeft || 0) - 12, right = cr.right - parseFloat(cs.paddingRight || 0) - sr.right - 12, gap = Math.max(left, right);
    if (gap < 170) return null;
    box.style.maxWidth = Math.min(gap, 320) + 'px'; box.style.transform = 'none'; box.style.margin = '0'; box.style.right = 'auto'; box.style.bottom = 'auto';
    var bw = box.offsetWidth, bh = box.offsetHeight;
    return { left: Math.round((left >= right ? sr.left - 12 - bw : sr.right + 12) + root.scrollX), top: Math.round((alignBottom ? sr.bottom - bh - 8 : sr.top + 8) + root.scrollY) };
  }
  function resetInto(box, parent) { if (box.parentNode !== parent) parent.appendChild(box); box.classList.remove('is-outside', 'in-strip'); ['left', 'top', 'right', 'bottom', 'transform', 'margin', 'maxWidth'].forEach(function (k) { box.style[k] = ''; }); }
  /* P1-5 ④(2026-11-02 재검증 뒤 재수정): 단계 시작 배너 자리 — 카메라가 자리 잡은 뒤(net ready) 한 번만 정하고 같은 틀 크기 동안 옮기지 않는다.
   *  ① 지도 안: 폭을 좁혀 가며(한 줄 → 지도 폭 62% → 45%, 그다음 작은 글씨) 정류장·이름표·얼굴·번호 원·노선 손잡이를 안 가리는 첫 모양
   *  ② 지도 안에 빈자리가 없으면: 좁은 화면(≤700px)은 지도 바로 아래 알림 줄(#map-strip), 넓은 화면은 지도 옆 빈 칸(지도 틀이 칸보다 좁을 때)
   *     — 예전 ‘지도 바로 위’는 인물 칩·예상 수지 상자를 덮었다(2D 1280, 390)
   *  ③ 그것도 없으면 지도 안에서 가장 덜 가리는 자리. 알림(#minimal-toast)은 배너를 피해 놓이므로 배너는 알림을 보고 옮기지 않는다 */
  function placeBanner(A) {
    var b = $('#map-banner'), stage = $('#stage'); if (!b || !stage) return;
    var W = stage.clientWidth, H = stage.clientHeight, strip = narrowStrip(), key = W + 'x' + H + (strip ? ':strip' : '');
    if (b.dataset.placed === key) { if (b.classList.contains('is-outside') && b._gutter) { var g0 = gutterSpot(stage, b, false); if (g0) { b.style.left = g0.left + 'px'; b.style.top = g0.top + 'px'; } } return; }
    resetInto(b, stage); b._gutter = false;
    if (strip && (document.body.classList.contains('rail') || document.body.classList.contains('sheet'))) { b.classList.remove('is-compact'); resetInto(b, strip); b.classList.add('in-strip'); strip.insertBefore(b, strip.firstChild); b.dataset.placed = key; showBanner(b); return; }
    var rects = mapRects(A).concat(domRects(stage, '#route-buses .route-bus, #first-coach, #coach-finger'));
    var pick = findSpot(b, W, H, rects, [[W - 12, false], [Math.round(W * 0.62), false], [Math.round(W * 0.45), false], [W - 12, true], [Math.round(W * 0.55), true]], 'is-compact', function (c, bw) { return Math.abs(c.x + bw / 2 - W / 2) * 0.02 + c.y * 0.05; });
    if (!pick || pick.a >= 1000) {
      if (strip) { b.classList.remove('is-compact'); resetInto(b, strip); b.classList.add('in-strip'); strip.insertBefore(b, strip.firstChild); b.dataset.placed = key; showBanner(b); return; }
      b.classList.remove('is-compact'); document.body.appendChild(b); b.classList.add('is-outside');
      var g = gutterSpot(stage, b, false);
      if (g) { b.style.left = g.left + 'px'; b.style.top = g.top + 'px'; b._gutter = true; b.dataset.placed = key; showBanner(b); return; }
      resetInto(b, stage);
    }
    if (pick) { b.classList.toggle('is-compact', !!pick.v[1]); b.style.maxWidth = Math.max(120, pick.v[0]) + 'px'; b.style.left = pick.c.x + 'px'; b.style.top = pick.c.y + 'px'; b.style.right = 'auto'; b.style.margin = '0'; }
    b.dataset.placed = key; showBanner(b);
  }
  /* 2026-11-02 재검증 P1-5 ③: 짧은 알림(#minimal-toast)이 지도 아래 가운데에 고정돼 정류장 이름표·말풍선을 덮었다(3D 390 ‘강을 건너는 구간은…’ → 외곽 마을,
   * 2D 1280 긴급 조정 안내 → 외곽 마을, 2단계 ‘예상 수지가 달라졌어요’ → 대학교·외곽 마을). 지도 틀 크기는 그대로 두고 자리만 고른다:
   *  · 좁은 화면(≤700px): 지도 바로 아래 알림 줄(#map-strip) — 지도 안 빈자리가 거의 없어서 늘 같은 곳
   *  · 넓은 화면: 지도 안에서 정류장·이름표·얼굴·번호 원·노선 손잡이·배너·안내 상자·경고 문구를 안 가리는 자리(아래 가운데에 가까운 곳부터, 폭을 좁혀 가며)
   *    → 없으면 지도 옆 빈 칸 → 그것도 없으면 가장 덜 가리는 자리. 떠 있는 동안 지금 자리가 계속 비어 있으면 옮기지 않는다 */
  function placeToast() {
    var A = app(), n = $('#minimal-toast'), stage = $('#stage'); if (!n || !stage || n.hidden || !n.textContent) return;
    var strip = narrowStrip();
    if (strip) { if (!n.classList.contains('in-strip') || n.parentNode !== strip) { resetInto(n, strip); n.classList.add('in-strip'); } return; }
    var W = stage.clientWidth, H = stage.clientHeight, key = W + 'x' + H + '|' + n.textContent;
    var rects = mapRects(A).concat(domRects(stage, '#route-buses .route-bus, #first-coach, #coach-finger, #stage > #map-banner, #map-people .map-person, #stage-overlay .run-alert-label, #stage-overlay .bubble, .map-notice-overflow'));
    if (n.dataset.placed === key && n.parentNode === stage && coverCost(rects, { x: n.offsetLeft, y: n.offsetTop }, n.offsetWidth, n.offsetHeight) < 1000) return;
    if (n.dataset.placed === key && n.classList.contains('is-outside')) { var g1 = gutterSpot(stage, n, true); if (g1) { n.style.left = g1.left + 'px'; n.style.top = g1.top + 'px'; return; } }
    resetInto(n, stage);
    var pick = findSpot(n, W, H, rects, [[W - 28], [Math.round(W * 0.7)], [Math.round(W * 0.5)], [Math.round(W * 0.38)]], null, function (c, bw, bh) { return Math.abs(c.x + bw / 2 - W / 2) * 0.05 + (H - c.y - bh) * 0.08; });
    if (!pick || pick.a >= 1000) {
      document.body.appendChild(n); n.classList.add('is-outside');
      var g = gutterSpot(stage, n, true);
      if (g) { n.style.left = g.left + 'px'; n.style.top = g.top + 'px'; n.dataset.placed = key; return; }
      resetInto(n, stage);
    }
    if (pick) { n.style.maxWidth = Math.max(120, pick.v[0]) + 'px'; n.style.left = pick.c.x + 'px'; n.style.top = pick.c.y + 'px'; n.style.right = 'auto'; n.style.bottom = 'auto'; n.style.transform = 'none'; n.style.margin = '0'; }
    n.dataset.placed = key;
  }
  function newMarks(A) {
    var a = arrivalNow(A);
    if (A.net) A.net.setOptions({ newNodes: a ? a.changes.places.map(function (n) { return n.id; }) : [], newAt: a ? (a.perf || performance.now()) : 0 });
    if (!a) return;
    var fresh = performance.now() - (a.perf || 0) < 4000;
    if (fresh && !a.unmark) a.unmark = setTimeout(function () { document.querySelectorAll('.depot-bus.is-new, .map-person.is-new').forEach(function (n) { n.classList.remove('is-new'); }); }, Math.max(0, 4000 - (performance.now() - (a.perf || 0))));
    a.changes.newBusIds.forEach(function (id) { var t = $('#bus-token-' + id); if (t) { t.classList.toggle('is-new', fresh); if (fresh) t.setAttribute('data-new', '새 버스 · 보유비 단계당 ' + PB.Narrative.won(A.s.config.finance.holding)); } });
    // 새 인물: 출발 정류장 옆 얼굴에 잠깐 고리(얼굴 자체는 지도 얼굴층이 늘 그린다)
    a.changes.people.forEach(function (r) { var f = $('#resident-map-' + r.id); if (f) f.classList.toggle('is-new', fresh); });
  }

  /* ── 1단계 첫 노선 코치 ── */
  // 1단계 처음(아직 안 봄)이거나, 어느 단계든 도움말 ‘첫 노선 안내 다시 보기’를 눌렀을 때
  function coachOn(A) { var s = A.s; return s && s.stage === 'plan' && document.body.dataset.screen === 'plan' && ((s.phase === 1 && !s.tutorialSeen) || A.coachReplay || A._coachDoneUntil > Date.now()); }
  function hasRoute(s) { return s.draft.routes.some(function (r) { return r.nodes.length >= 2; }); }
  function closeCoach(mark) { var A = app(); if (mark && A.s) { A.s.tutorialSeen = true; A.save(); } A.coachReplay = false; A._coachDoneUntil = 0; ['#first-coach', '#coach-finger'].forEach(function (q) { var n = $(q); if (n) n.remove(); }); clearInterval(coachTimer); coachTimer = null; }
  function step(A) {
    var s = A.s, ids = S.visibleNodeIds(s), pick = function (want, not) { return ids.indexOf(want) >= 0 && want !== not ? want : ids.filter(function (x) { return x !== not; })[0]; };
    if (A._coachDoneUntil > Date.now()) return { kind: 'done', text: '첫 노선이 생겼어요. 대기 버스가 바로 달려요.', target: null };
    if (A.coachReplay && hasRoute(s)) return { kind: 'replay', text: '정류장 두 곳을 차례로 누르면 노선이 생겨요.', target: pick('F') };
    var r = s.draft.routes.filter(function (x) { return x.nodes.length === 1; })[0];
    if (r) return { kind: 'second', text: '이어서 갈 정류장을 누르면 노선이 생겨요.', target: pick('D', r.nodes[0]) };
    return { kind: 'first', text: '지도에서 출발할 정류장을 누르세요.', target: pick('F') };
  }
  function coach(A) {
    var s = A.s;
    if (!coachOn(A)) { if ($('#first-coach')) closeCoach(false); return; }
    // 첫 노선이 생긴 순간: 한 번 축하 문장(3초) 뒤 끝 — 다시 보기로 연 경우는 바로 닫기
    if (!A._coachDoneUntil && hasRoute(s) && !s.tutorialSeen) { s.tutorialSeen = true; A.coachReplay = false; A._coachDoneUntil = Date.now() + 3000; setTimeout(function () { if (A._coachDoneUntil && A._coachDoneUntil <= Date.now() + 50) { A._coachDoneUntil = 0; closeCoach(true); } }, 3050); }
    else if (A.coachReplay && hasRoute(s) && A._replayFrom == null) A._replayFrom = Date.now();
    var st = step(A), box = $('#first-coach');
    if (!box) {
      box = el('div', { id: 'first-coach', 'class': 'first-coach', role: 'note', 'aria-labelledby': 'first-coach-h' });
      box.appendChild(el('p', { id: 'first-coach-h', 'class': 'coach-title' }, '첫 노선 만들기'));
      box.appendChild(el('p', { id: 'first-coach-text', 'class': 'coach-text', 'aria-live': 'polite' }));
      var x = el('button', { type: 'button', id: 'first-coach-close', 'class': 'btn btn-ghost coach-close', 'aria-label': '첫 노선 안내 닫기' }, '닫기');
      x.addEventListener('click', function () { closeCoach(true); }); box.appendChild(x);
      $('#stage').appendChild(box);
      var f = el('div', { id: 'coach-finger', 'class': 'coach-finger', 'aria-hidden': 'true' });
      f.innerHTML = '<span class="coach-tap"></span><svg viewBox="0 0 24 24" width="30" height="30"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10m0-.5V8a1.5 1.5 0 0 1 3 0v2m0-.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1.2a5 5 0 0 1-3.9-1.9L5 14.6a1.5 1.5 0 0 1 2.3-1.9L9 14" fill="#fff" stroke="#1f2a37" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
      $('#stage').appendChild(f);
    }
    box.dataset.step = st.kind;
    var t = $('#first-coach-text'); if (t.textContent !== st.text) t.textContent = st.text;
    place(A, st);
    if (!coachTimer) coachTimer = setInterval(function () { if (!coachOn(app())) { closeCoach(false); return; } if (A._replayFrom && Date.now() - A._replayFrom > 8000) { A._replayFrom = null; closeCoach(true); return; } place(app(), step(app())); }, 400);
  }
  // 손가락은 정류장 위에. 말풍선은 정류장·이름표·얼굴·번호 원·노선 손잡이를 가리지 않는 자리(지도 틀 안) 중 가리키는 정류장에 가까운 곳
  /* P1-1 재수정(2026-11-02 검증): 1280×800(지도 589×396)·390×844(374×300)에서는 260×124 상자가 놓일 빈자리가 없어 구도심 시장·산업·일자리 정류장을 덮었다.
   * 상자 크기를 큰 것부터 차례로 — 보통 → 작게(.is-compact: 제목·닫기 한 줄, 글자 14px) → 한 줄(.is-line: 제목은 화면 읽기용으로만, 글 한 줄 + 닫기) —
   * 재 보고, 정류장 원(반지름 + 6px)·손가락·이름표·얼굴·번호 원·노선 손잡이와 안 겹치는 자리가 있는 첫 크기를 쓴다(×10⁶ 정류장·손가락, ×1000 나머지, 정류장 여백 햇살은 ×20).
   * 어느 크기에도 없으면 정류장 원과 안 겹치고 덜 가리는 자리. 지도 전체를 8px 간격으로(아래 가장자리에 붙인 자리 포함) 훑는다 */
  var COACH_SIZES = ['', 'is-compact', 'is-compact is-line'];
  function place(A, st) {
    var box = $('#first-coach'), f = $('#coach-finger'), stage = $('#stage'); if (!box || !f || !A.view) return;
    var W = stage.clientWidth, H = stage.clientHeight, x = W / 2, y = 60;
    f.hidden = !st.target;
    if (st.target) { var n = A.nodeXY(st.target), p = A.view.project(n.x, n.y); f.style.left = p.left + 'px'; f.style.top = p.top + 'px'; x = p.left; y = p.top; }
    var rects = mapRects(A);
    // 노선 손잡이(‘버스 ×N’)도 가리지 않는다 — 덮으면 끌 수 없다
    var sr = stage.getBoundingClientRect(); [].forEach.call(document.querySelectorAll('#route-buses .route-bus'), function (h) { var r = h.getBoundingClientRect(); if (r.width) rects.push({ x: r.left - sr.left - 6, y: r.top - sr.top - 6, w: r.width + 12, h: r.height + 12, k: 1000 }); });
    if (st.target) rects.push({ x: x - 24, y: y - 24, w: 48, h: 64, k: 1e6 }); // 손가락
    function bestFor(bw, bh) {
      var M = 6, clamp = function (c) { return { x: Math.max(M, Math.min(W - bw - M, c.x)), y: Math.max(M, Math.min(H - bh - M, c.y)) }; };
      // 가리킬 정류장이 없으면(첫 노선 완성 축하) 지도 위·아래 가장자리 쪽부터
      var cands = (st.target ? [{ x: x - bw / 2, y: y - bh - 34 }, { x: x - bw / 2, y: y + 44 }, { x: x + 34, y: y - bh / 2 }, { x: x - bw - 34, y: y - bh / 2 }] : [{ x: (W - bw) / 2, y: 8 }, { x: (W - bw) / 2, y: H - bh - 8 }]).map(clamp);
      for (var gx = M; gx <= W - bw - M; gx += 8) { for (var gy = M; gy <= H - bh - M; gy += 8) cands.push({ x: gx, y: gy }); cands.push({ x: gx, y: H - bh - M }); } // 아래 가장자리에 붙인 자리도
      return cands.reduce(function (b, c) {
        var a = coverCost(rects, c, bw, bh), cx = c.x + bw / 2, cy = c.y + bh / 2, k = a + (st.target ? Math.hypot(cx - x, cy - y) : Math.hypot(cx - W / 2, c.y)) * 0.1;
        return !b || k < b.k - 0.1 ? { c: c, k: k, a: a } : b;
      }, null);
    }
    var pick = null;
    COACH_SIZES.some(function (cls) {
      box.classList.remove('is-compact', 'is-line'); if (cls) cls.split(' ').forEach(function (c) { box.classList.add(c); });
      var b = bestFor(box.offsetWidth, box.offsetHeight); if (!b) return false;
      if (!pick || b.a < pick.a) pick = { cls: cls, c: b.c, a: b.a };
      return b.a < 1000; // 정류장 여백 햇살 조금(×20)만 걸치는 정도는 괜찮음
    });
    box.classList.remove('is-compact', 'is-line'); if (pick && pick.cls) pick.cls.split(' ').forEach(function (c) { box.classList.add(c); });
    if (pick) { box.style.left = pick.c.x + 'px'; box.style.top = pick.c.y + 'px'; }
  }

  /* ── 텍스트 모드 단계 안내(#stage-brief) ── */
  function brief(A) {
    var s = A.s, panel = $('#panel'), body = panel && panel.querySelector('.panel-body'); if (!body || document.body.dataset.screen !== 'plan' || body.querySelector('#stage-brief')) return;
    var c = A.phaseChanges(s), cfg = s.config, rows = [], sec = el('section', { id: 'stage-brief', 'class': 'stage-brief', 'aria-labelledby': 'stage-brief-h' });
    sec.appendChild(el('h3', { id: 'stage-brief-h' }, '이번 단계 안내'));
    rows.push(['단계', c.phase + '단계 · ' + c.name + ' · 전체 ' + cfg.phases.length + '단계']);
    if (c.phase === 1) rows.push(['할 일', '정류장을 이어 첫 노선을 만들어 보세요. 지도에서 출발할 정류장을 누르고, 이어서 갈 정류장을 누르면 노선이 생겨요.']);
    if (c.phase === 1) rows.push(['갈아타기', '갈아타기는 한 번까지예요. 두 노선이 함께 서는 정류장에서 한 번만 갈아탈 수 있고, 두 번 갈아타야 하는 이동은 선이 이어져 있어도 못 가요.']); /* 2026-11-12 랜덤 검토 2번 */
    var changed = [];
    c.places.forEach(function (n) { changed.push(PB.Narrative.josa(n.name, '이가') + ' 생겼어요' + (A.NEW_PLACE[n.id] ? '(' + A.NEW_PLACE[n.id] + ')' : '') + '.'); });
    if (c.buses) changed.push('버스 ' + A.signed(c.buses) + '대(보유비 1대 단계당 ' + PB.Narrative.won(cfg.finance.holding) + '), 새 버스는 대기 중이에요. 지도 아래 대기 버스를 노선으로 끌어 놓거나, 새 노선을 완성하면 1대가 바로 운행해요.');
    if (c.routes) changed.push('노선 칸 ' + A.signed(c.routes) + '개.');
    if (c.express) changed.push(c.express + '.');
    if (changed.length) rows.push(['바뀐 것', changed.join(' ')]);
    rows.push(['버스·노선', '버스 ' + s.owned + '대 · 노선 최대 ' + c.limit + '개 · 출발하면 ' + A.clock(0) + '~' + A.clock(cfg.bus.window) + '의 하루 운행이 시작돼요.']);
    if (c.people.length) {
      var kind = PB.UI.nextCut ? PB.UI.nextCut(Object.assign({}, s, { phase: s.phase - 1 })) : null, said = kind && PB.Cutscene.lines ? PB.Cutscene.lines(kind) : [];
      rows.push(['새 인물', c.people.map(function (r) { return r.name; }).join('·') + (said.length ? ' · ' + said.map(function (l) { return l.text; }).join(' ') : '')]);
    }
    rows.push(['오늘 이동 요청', A.requestText(cfg, s.phase, s.seed) + '. 이동 요청 1건 = 한 사람의 한 번 이동이에요.']);
    rows.push(['학기 말 기준', (cfg.challengeApplied ? '총 ' + cfg.phases.length + '단계 · ' : '') + PB.Narrative.satisfactionText(cfg)]);
    var goal = (s.choices || {})[s.phase - 1]; if (goal) rows.push(['이번 목표', S.CHOICES[goal]]);
    var dl = el('dl', { 'class': 'kv' }); rows.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); }); sec.appendChild(dl);
    var more = el('button', { type: 'button', 'class': 'btn btn-sm', id: 'brief-rules' }, '규칙과 재정은 도움말에서 보기'); more.addEventListener('click', function () { $('#btn-help').click(); }); sec.appendChild(more);
    var h2 = body.querySelector('h2'); if (h2) h2.insertAdjacentElement('afterend', sec); else body.prepend(sec);
  }

  /* ── 도움말 ‘규칙과 재정’ ── */
  function fillHelp(A) {
    var box = $('#help-rules'); if (!box) return; box.textContent = '';
    var s = A.s, cfg = s ? s.config : PB.config, F = cfg.finance, rows = [];
    if (s) rows.push(['버스·노선', '이번 단계는 버스 ' + s.owned + '대 · 노선 최대 ' + S.routeLimit(s) + '개로 운영해요. 출발하면 ' + A.clock(0) + '~' + A.clock(cfg.bus.window) + '의 하루 운행이 시작돼요.']);
    if (cfg.river) rows.push(['강 건너기', '강을 건너는 구간(외곽 마을·복지관 쪽)은 다리로 돌아가서, 지도에서 보는 것보다 ' + cfg.river.factor + '배 멀어요. 시간·연료비 모두 그만큼 더 들어요.']);
    rows.push(['기본 지원', '기본 제공 차량 1대마다 ' + A.won(F.basePerBus) + '(보유비 대당 ' + A.won(F.holding) + '의 일부) · 보유비는 쉬어도 들어요.']);
    rows.push(['공공서비스 수행분', s ? PB.UI.Econ.conditionText(s) : '외곽 마을·병원에 실제로 달리는 버스가 운행 시간 안에 ' + F.service.minStops + '회 이상 정차하면 곳마다 ' + A.won(F.service.amount) + '(승객 수와 무관, 단계 정산 때 지급)']);
    rows.push(['추가 임차', '이번 단계에만 1대 ' + A.won(F.lease.fee) + ', 최대 ' + F.lease.perPhase + '대 · 다음 단계에 자동으로 다시 빌리지 않아요.']);
    if (s) rows.push(['재정 규칙', A.financeRuleText(s)]);
    if (cfg.service && cfg.service.maxWait != null) rows.push(['대기 기준', '한 번 이동에 버스를 ' + A.duration(cfg.service.maxWait) + ' 넘게 기다리면 그날은 세지 않아요.']);
    rows.push(['학기 말 기준', PB.Narrative.satisfactionText(cfg)]);
    rows.push(['이동 요청', '이동 요청 1건 = 한 사람의 한 번 이동이에요. 지도의 정류장 숫자는 그 정류장에서 출발하거나 도착하는 요청이라, 모두 더하면 이동 요청의 두 배가 돼요. 실제 운행에는 돌발 수요가 더해질 수 있어요.']);
    rows.push(['갈아타기', '갈아타기는 한 번까지예요. 두 노선이 함께 서는 정류장에서 한 번만 갈아탈 수 있고, 두 번 갈아타야 하는 이동은 선이 이어져 있어도 못 가요.']); /* 2026-11-12 랜덤 검토 2번 */
    rows.push(['서는 곳과 지나가는 곳', '정류장 원 안에 노선 색 점이 있으면 그 노선이 서는 곳이에요. 점 없이 선만 흐리게 지나가면 서지 않아요. 선이 교차해도 같은 정류장에 서지 않으면 갈아탈 수 없어요.']);
    rows.push(['키보드', '운행 중 Space를 누르면 일시정지·재개돼요. 입력칸이나 버튼에 초점이 있으면 그 칸·버튼이 먼저 받아요.']);
    var dl = el('dl', { 'class': 'kv help-rules' }); rows.forEach(function (r) { dl.appendChild(el('dt', null, r[0])); dl.appendChild(el('dd', null, r[1])); }); box.appendChild(dl);
  }

  function render(A) {
    var screen = document.body.dataset.screen;
    // 계획·운행이 아닌 화면: 지도 밖(알림 줄·지도 옆 칸)에 놓였던 알림은 지도 안으로 돌려놓는다(지도와 함께 숨음)
    var tn = $('#minimal-toast'), st0 = $('#stage'); if (tn && st0 && screen !== 'plan' && screen !== 'run' && tn.parentNode !== st0) { resetInto(tn, st0); delete tn.dataset.placed; }
    if (screen !== 'plan') { ['#map-banner', '#first-coach', '#coach-finger'].forEach(function (q) { var n = $(q); if (n) n.remove(); }); clearInterval(coachTimer); coachTimer = null; var ap = arrivalPhase(A); if (A.net) A.net.setOptions({ newNodes: ap ? ap.changes.places.map(function (n) { return n.id; }) : [], newAt: ap ? (ap.perf || 0) : 0 }); return; }
    banner(A); newMarks(A); coach(A); brief(A);
  }
  // 지도를 다시 그릴 때마다(틀 크기·카메라가 바뀐 뒤) 손가락·말풍선 자리를 다시 맞춘다
  // 카메라가 자리 잡는 중(net ready=false)에는 배너·알림 자리를 정하지 않는다 — 이름표가 배치된 뒤 한 번
  function layout() { var A = app(); if (!A.s) return; if ($('#first-coach')) place(A, step(A)); if (!netReady(A)) return; if ($('#map-banner')) placeBanner(A); placeToast(); }
  PB.Arrival = { render: render, layout: layout, fillHelp: fillHelp, dismissBanner: dismissBanner, closeCoach: closeCoach, placeToast: placeToast };
})(window);
