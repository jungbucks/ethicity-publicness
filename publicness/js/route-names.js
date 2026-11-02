/* 노선·버스를 번호 대신 색 이름으로 부르기(2026-11-02 휴대폰 화면 정리 — 지도에서 노선 번호 배지를 뺐다).
 * 화면 글자만 바꾼다(엔진·저장·점수는 그대로 번호를 쓴다).
 *  · 노선: config.ui.routeNames(빨강·초록·주황·하늘·보라·갈색 — 노선 색 routeColors와 같은 순서). 도전 모드 5번=직행, 6번=광역
 *  · 선 모양(색약 학생용): 1 실선 · 2 이중선 · 3 점선(짧은 줄) · 4 점(동글) — 5 직행·6 광역은 원래 가운데 줄
 *  · 버스: 지금 달리는 노선 색으로 ‘초록 버스’, 쉬는 버스는 ‘대기 버스’, 빌린 버스는 ‘빌린 버스’, 도전 모드 7=직행 버스·9=광역 버스
 *  · 설정 ‘노선 번호 표시’(기본 끔, localStorage)를 켜면 이름 뒤에 번호를 붙이고 지도 배지에도 번호가 다시 나온다
 * '번'과 '노선'은 모두 받침(ㄴ)으로 끝나고 '호차'와 '버스'는 모두 받침 없이 끝나서, 바꿔 넣어도 뒤 조사(을/를·이/가·은/는)가 맞는다. */
(function (root) {
  'use strict';
  var KEY = 'ethicity.publicness.routeNumbers', mem = null;
  var PATTERNS = ['solid', 'double', 'dash', 'dot'];
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
  N.pattern = function (num, s) { var c = cfgOf(sess(s)); if (c.challengeApplied && (num === 5 || num === 6)) return 'solid'; return PATTERNS[(num - 1) % PATTERNS.length]; };
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
  // 노선 견본(작은 SVG): 흰 바탕 띠 + 노선 색 선 모양 — 노선 칩·범례용
  N.swatch = function (num, color, s) {
    var NS = 'http://www.w3.org/2000/svg', svg = root.document.createElementNS(NS, 'svg'), p = N.pattern(num, s), c = cfgOf(sess(s));
    svg.setAttribute('viewBox', '0 0 28 12'); svg.setAttribute('width', '28'); svg.setAttribute('height', '12'); svg.setAttribute('class', 'route-swatch-svg'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    function ln(attrs) { var e = root.document.createElementNS(NS, 'line'); e.setAttribute('x1', 3); e.setAttribute('y1', 6); e.setAttribute('x2', 25); e.setAttribute('y2', 6); for (var k in attrs) e.setAttribute(k, attrs[k]); svg.appendChild(e); return e; }
    ln({ stroke: '#fff', 'stroke-width': 9, 'stroke-linecap': 'round' });
    var a = { stroke: color, 'stroke-width': 6, 'stroke-linecap': p === 'dot' ? 'round' : p === 'dash' ? 'butt' : 'round' };
    if (p === 'dash') a['stroke-dasharray'] = '6 3'; if (p === 'dot') { a['stroke-dasharray'] = '0 7.5'; a['stroke-width'] = 6; }
    ln(a);
    if (p === 'double') ln({ stroke: '#fff', 'stroke-width': 2, 'stroke-linecap': 'round' });
    if (c.challengeApplied && num === 5) ln({ stroke: '#fff', 'stroke-width': 2, 'stroke-dasharray': '1.5 3', 'stroke-linecap': 'round' });
    if (c.challengeApplied && num === 6) ln({ stroke: 'rgba(26,29,36,.75)', 'stroke-width': 1.6 });
    return svg;
  };
  root.PB = root.PB || {};
  root.PB.Names = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = N;
})(typeof window !== 'undefined' ? window : globalThis);
