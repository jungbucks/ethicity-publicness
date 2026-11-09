/*
 * 운행 중 노선 고치기(하루 한 번, 2026-11-09 — 정해진 시각 2번의 ‘긴급 조정’을 대체). 화면을 모르는 순수 함수.
 *  · 때: 게임 시각 11:00~15:00(엔진 시간 open~close, 기본 40~66). 고친 시각 at = 멈춘 위치를 올림(다음 정수 시각).
 *  · 하나만: 운행 중인 노선에 정류장 하나 더하기(두 정류장 사이 또는 양 끝) / 정류장 하나 빼기(열린 노선 2곳+, 순환 3곳+ 남게) / 버스 한 대 옮기기.
 *  · 엔진 규칙(Sim routeChanges + Schedule.resume): 버스는 가던 정류장까지 간 뒤 그 자리부터 새 정류장 목록을 같은 방향으로 따른다.
 *    가던 곳이 빠진 정류장이면 서지 않고 다음 정류장으로. 빠진 정류장에서 내리려던 사람은 버스의 다음 정류장에서 내려 다른 길을 찾는다.
 * pos(더하기 자리) = 그 번호의 정류장 뒤에 넣는다. −1 = 맨 앞(열린 노선), n−1 = 맨 끝(열린 노선). 순환은 0~n−2(닫는 정류장 앞까지).
 */
(function (root) {
  'use strict';
  var FROM = 660, TO = 900; // 11:00, 15:00 (하루 분)

  function isLoop(r) { return !!r && r.nodes.length >= 4 && r.nodes[0] === r.nodes[r.nodes.length - 1]; }
  function copy(r) { return { nodes: r.nodes.slice(), stops: r.stops.slice() }; }
  function distinct(r) { return isLoop(r) ? r.nodes.length - 1 : r.nodes.length; }

  // 엔진 시간으로 고칠 수 있는 창(양 끝 포함). day가 없는 예전 설정은 창 전체를 하루의 1/3~1/2쯤으로
  function span(config) {
    var W = config.bus.window, d = config.day;
    if (!d) return { open: Math.ceil(W / 3), close: Math.floor(W / 2) };
    var k = W / (d.end - d.start);
    return { open: Math.ceil((FROM - d.start) * k - 1e-9), close: Math.floor((TO - d.start) * k + 1e-9) };
  }
  // 멈춘 재생 위치 tf → 고친 시각(창 안의 정수, 창 밖이면 null)
  function atFor(config, tf) {
    var w = span(config), at = Math.max(w.open, Math.ceil(tf - 1e-9));
    return tf >= w.open - 1e-9 && at <= w.close ? at : null;
  }

  // 더할 수 있는 자리 목록
  function positions(route) {
    var n = route.nodes.length, out = [], i;
    if (isLoop(route)) { for (i = 0; i <= n - 2; i++) out.push(i); return out; }
    out.push(-1); for (i = 0; i <= n - 2; i++) out.push(i); out.push(n - 1);
    return out;
  }
  function addStop(route, node, pos) {
    if (!route || route.nodes.indexOf(node) >= 0 || positions(route).indexOf(pos) < 0) return null;
    var r = copy(route), n = r.nodes.length;
    if (pos === -1) { r.nodes.unshift(node); r.stops.unshift(true); }
    else if (pos === n - 1 && !isLoop(route)) { r.nodes.push(node); r.stops.push(true); }
    else { r.nodes.splice(pos + 1, 0, node); r.stops.splice(pos + 1, 0, true); }
    return r;
  }
  function removeStop(route, node) {
    if (!route) return null;
    var i = route.nodes.indexOf(node); if (i < 0) return null;
    if (isLoop(route)) {
      if (distinct(route) - 1 < 3) return null;
      var ring = route.nodes.slice(0, -1), st = route.stops.slice(0, -1);
      ring.splice(i, 1); st.splice(i, 1);
      return { nodes: ring.concat([ring[0]]), stops: st.concat([st[0]]) };
    }
    if (route.nodes.length - 1 < 2) return null;
    var r = copy(route); r.nodes.splice(i, 1); r.stops.splice(i, 1);
    r.stops[0] = true; r.stops[r.stops.length - 1] = true; // 양 끝은 항상 정차
    return r;
  }
  // 그 정류장을 넣었을 때 노선이 가장 덜 늘어나는 자리(같으면 앞 자리) — 화면의 처음 고른 값. dist(a,b) = 거리
  function shortestPos(route, node, dist) {
    var best = null;
    positions(route).forEach(function (pos) {
      var r = addStop(route, node, pos); if (!r) return;
      var len = 0; for (var i = 1; i < r.nodes.length; i++) len += dist(r.nodes[i - 1], r.nodes[i]) || 0;
      if (!best || len < best.len - 1e-9) best = { pos: pos, len: len };
    });
    return best ? best.pos : null;
  }

  var api = { FROM: FROM, TO: TO, span: span, atFor: atFor, positions: positions, addStop: addStop, removeStop: removeStop, shortestPos: shortestPos, isLoop: isLoop };
  root.PB = root.PB || {};
  root.PB.Midday = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
