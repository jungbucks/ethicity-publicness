/* 노선·버스를 번호 대신 색 이름으로 부르기(2026-11-02 휴대폰 화면 정리 — 지도에서 노선 번호 배지를 뺐다).
 * 화면 글자만 바꾼다(엔진·저장·점수는 그대로 번호를 쓴다).
 *  · 노선: config.ui.routeNames(빨강·초록·주황·파랑·보라·갈색 — 노선 색 routeColors와 같은 순서, 4번은 2026-11-11에 ‘하늘’ → ‘파랑’: 인물 하늘과 겹침). 도전 모드 5번=직행, 6번=광역
 *  · 선 모양: 모두 같은 굵기의 실선. 색과 보이는 노선 이름으로 구분
 *  · 버스: 지금 달리는 노선 색으로 ‘초록 버스’, 쉬는 버스는 ‘대기 버스’, 빌린 버스는 ‘빌린 버스’, 도전 모드 7=직행 버스·9=광역 버스
 *  · 설정 ‘노선 번호 표시’(기본 끔, localStorage)를 켜면 이름 뒤에 번호를 붙이고 지도 배지에도 번호가 다시 나온다
 * 조사 규칙: 화면 문장은 색 이름 바로 뒤에 조사를 붙이지 않고 늘 ‘○○ 노선’·‘○○ 버스’로 쓴다. '번'과 '노선'은 모두 받침(ㄴ)으로 끝나고 '호차'와 '버스'는 모두 받침 없이 끝나서,
 * N.text가 ‘N번 노선’·‘N호차’를 바꿔 넣어도 뒤 조사(을/를·이/가·은/는)가 맞는다(‘노선으로’·‘버스로’도 같다). 색 이름만 쓰고 조사를 붙이는 곳(ui-hud linkHint)은 Narrative.josa가
 * 그 이름의 받침으로 고른다 — 빨강·초록·주황·파랑·갈색은 받침 있음, 보라는 없음(‘보라와’). 이름을 바꿀 때 색 이름 뒤에 조사를 직접 적은 문장이 없는지 확인할 것(tests/playtest-1111.test.mjs 5번). */
(function (root) {
  'use strict';
  var KEY = 'ethicity.publicness.routeNumbers', mem = null;
  function cfgOf(s) { return (s && s.config) || (root.PB && root.PB.config) || {}; }
  function sess(s) { return s || (root.PB && root.PB.App && root.PB.App.s) || null; }
  var N = {};
  N.showNumbers = function () { if (mem != null) return mem; try { return !!(root.localStorage && root.localStorage.getItem(KEY) === '1'); } catch (e) { return false; } };
  N.setShowNumbers = function (v) { mem = !!v; try { if (root.localStorage) root.localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* 이번 창에서만 */ } if (root.document && root.document.body) root.document.body.classList.toggle('route-numbers', !!v); };
  // 색 이름만(‘초록’). 번호 표시를 켜면 ‘초록(2번)’
  N.color = function (num, s) {
    s = sess(s); var c = cfgOf(s), names = (c.ui && c.ui.routeNames) || [], base;
    if (num == null) return '';
    if (c.challengeApplied && num === 5) base = '직행';
    else if (c.challengeApplied && num === 6) base = '광역';
    else base = names.length ? names[(num - 1) % names.length] : num + '번';
    return base + (N.showNumbers() ? '(' + num + '번)' : '');
  };
  N.route = function (num, s) { return N.color(num, s) + ' 노선'; };
  N.pattern = function () { return 'solid'; };
  N.patternName = function (p) { return { solid: '실선', double: '이중선', dash: '점선', dot: '동글 점선' }[p] || ''; };
  // 버스 이름 — routeNum을 주면 그 노선 기준(운행 중 그 순간의 노선), 안 주면 초안 배정
  N.bus = function (id, s, routeNum) {
    s = sess(s); var c = cfgOf(s), b = s && s.draft ? s.draft.buses.filter(function (x) { return x.id === id; })[0] : null, out;
    var num = routeNum !== undefined ? routeNum : b ? b.routeNum : null;
    if (c.challengeApplied && id === 7) out = '직행 버스';
    else if (c.challengeApplied && id === 9) out = '광역 버스';
    else if (num != null) out = N.color(num, s).replace(/\(\d+번\)$/, '') + ' 버스';
    else out = b && b.leased ? '빌린 버스' : '대기 버스';
    return out + (N.showNumbers() ? '(' + id + '호차)' : '');
  };
  // 엔진·옛 문장에 남은 ‘N번 노선’·‘N호차’를 화면에 쓰기 전에 바꾼다(알림·오류 문구 공용). 맨 ‘N번’(횟수: ‘6번 이상’)은 건드리지 않는다
  N.text = function (str, s) {
    if (str == null) return str; s = sess(s);
    return String(str).replace(/(\d+)번 노선/g, function (m, n) { return N.route(Number(n), s); }).replace(/(\d+)호차/g, function (m, n) { return N.bus(Number(n), s); });
  };
  // 노선 견본(작은 SVG): 같은 굵기의 노선 색 실선 — 노선 칩·범례용
  N.swatch = function (num, color, s) {
    var NS = 'http://www.w3.org/2000/svg', svg = root.document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 28 12'); svg.setAttribute('width', '28'); svg.setAttribute('height', '12'); svg.setAttribute('class', 'route-swatch-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    function ln(attrs) { var e = root.document.createElementNS(NS, 'line'); e.setAttribute('x1', 3); e.setAttribute('y1', 6); e.setAttribute('x2', 25); e.setAttribute('y2', 6); for (var k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; }
    ln({ stroke: color, 'stroke-width': 4, 'stroke-linecap': 'round' });
    return svg;
  };
  root.PB = root.PB || {};
  root.PB.Names = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = N;
})(typeof window !== 'undefined' ? window : globalThis);
