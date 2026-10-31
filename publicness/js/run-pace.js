/*
 * 운행 재생 속도 규칙 — 화면(ui-run.js)과 node 테스트가 같은 순수 함수를 쓴다.
 *  · 플레이어가 고르는 배속은 1×·2×뿐이다(저장 키 ethicity.publicness.speed, 옛 4는 2로 — storage.js).
 *  · ‘⏭ 다음 결정까지’는 다음 긴급 조정 시점이나 주목할 사건(정류장별 첫 만차, 정류장 대기 10명 이상)까지
 *    NEXT배속으로 빨리 간 뒤 1×로 돌아와 멈춘다. 한 번 누를 때 한 번만 간다(배속으로 저장하지 않음).
 *  · 아직 결정하지 않은 긴급 조정 시점 30분(게임 시간) 전부터는 어떤 배속이든 1×로 보여 준다.
 * 배속은 재생 속도만 바꾼다 — 엔진 결과(수송·대기·비용·인물 판정)는 출발할 때 이미 정해져 있다.
 */
(function (root) {
  'use strict';
  // NEXT: 다음 결정까지 10배속. 기본 재생 시간을 바꾸면 함께 비례해서 느려진다.
  var NEXT = 10, ALERT_WAIT = 10, SLOW_GAME_MINUTES = 30;

  // 게임 시간 30분을 엔진 시간 단위로(기본 하루 05:00~23:00 = 120단위 → 1단위 9분 → 약 3.3단위)
  function slowSpan(config) {
    var span = config.day ? config.day.end - config.day.start : 1080;
    return SLOW_GAME_MINUTES * config.bus.window / span;
  }

  // 정류장별·초별 대기 인원(최초 대기 + 환승 대기). 노선이 없어 떠나지 못한 요청은 ‘대기’로 세지 않는다
  function waitingTable(result, config) {
    var W = config.bus.window, diff = {};
    function add(node, a, b) {
      var arr = diff[node] = diff[node] || new Array(W + 2).fill(0);
      a = Math.max(0, a); b = Math.min(W + 1, b);
      if (a >= b) return;
      arr[a]++; arr[b]--;
    }
    var boards = {}, alights = {};
    result.log.forEach(function (e) {
      if (e.type === 'board') (boards[e.pid] = boards[e.pid] || []).push(e.t);
      if (e.type === 'alight') alights[e.pid] = e;
    });
    result.passengers.forEach(function (p) {
      if (p.fail === 'NO_LINK') return;
      var b = boards[p.id] || [];
      add(p.o, p.t, b.length ? b[0] : W + 1);
      var al = alights[p.id];
      if (al) add(al.node, al.t + config.bus.transferMin, b.length > 1 ? b[1] : W + 1);
    });
    var out = {};
    Object.keys(diff).forEach(function (n) { var run = 0; out[n] = diff[n].map(function (d) { run += d; return run; }); });
    return out;
  }

  // 주목할 사건 — 정류장마다 첫 만차 한 번, 대기가 처음 10명 이상이 되는 시각 한 번(같은 단계 안에서)
  function notables(result, wait, config) {
    var W = config.bus.window, out = [], fullSeen = {};
    result.log.forEach(function (e) {
      if (e.type !== 'full' || fullSeen[e.node]) return;
      fullSeen[e.node] = true;
      out.push({ t: Math.ceil(e.t), kind: 'full', node: e.node, bus: e.bus, n: e.data.left });
    });
    Object.keys(wait).forEach(function (node) {
      var arr = wait[node];
      for (var m = 0; m <= W && m < arr.length; m++) if (arr[m] >= ALERT_WAIT) { out.push({ t: m, kind: 'wait', node: node, n: arr[m] }); break; }
    });
    return out.sort(function (a, b) { return a.t - b.t || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0) || (a.node < b.node ? -1 : 1); });
  }

  // 아직 결정하지 않은 긴급 조정 시점(시간순)
  function pendingCheckpoints(checkpoints, decided) {
    return (checkpoints || []).filter(function (t) { return (decided || []).indexOf(t) < 0; }).sort(function (a, b) { return a - b; });
  }

  // 이번 재생에서 멈출 시각. 긴급 조정 시점은 어떤 배속이든 멈추고, ‘다음 결정까지’면 그 전의 주목할 사건에서도 멈춘다.
  // 반환 {t, kind:'emergency'|'notable', items}(없으면 null). 이미 멈춘 시각(tf)의 사건은 다시 세지 않는다
  function nextStop(tf, opts) {
    var cp = opts.checkpoint != null ? opts.checkpoint : null, best = cp != null ? { t: cp, kind: 'emergency', items: [] } : null;
    if (opts.mode === 'next') {
      var first = (opts.notables || []).filter(function (n) { return n.t > tf; })[0];
      if (first && (!best || first.t < best.t)) best = { t: first.t, kind: 'notable', items: opts.notables.filter(function (n) { return n.t === first.t; }) };
    }
    return best;
  }

  // 긴급 조정 시점 30분 전 ~ 그 시점 사이인가
  function inSlowZone(tf, checkpoint, slow) { return checkpoint != null && tf >= checkpoint - slow && tf < checkpoint; }

  // 실제 시간 dtMs 동안 재생 위치 tf가 얼마나 가는가. 감속 구간은 1×로, 경계를 넘는 틱은 나눠 계산한다(빠른 배속에서 건너뛰지 않게)
  function advance(tf, dtMs, base, msPerMinute, checkpoint, slow) {
    var budget = dtMs;
    while (budget > 1e-9) {
      var zoneStart = checkpoint != null ? checkpoint - slow : Infinity;
      var slowNow = inSlowZone(tf, checkpoint, slow), v = slowNow ? Math.min(base, 1) : base;
      if (v <= 0) break;
      var edge = slowNow ? checkpoint : tf < zoneStart ? zoneStart : Infinity;
      var need = (edge - tf) * msPerMinute / v;
      if (need >= budget) { tf += budget * v / msPerMinute; break; }
      tf = edge; budget -= need;
      if (slowNow) break; // 조정 시점에 닿음 — 그 뒤는 멈춤이 처리한다
    }
    return tf;
  }

  var api = { NEXT: NEXT, ALERT_WAIT: ALERT_WAIT, SLOW_GAME_MINUTES: SLOW_GAME_MINUTES, slowSpan: slowSpan, waitingTable: waitingTable,
    notables: notables, pendingCheckpoints: pendingCheckpoints, nextStop: nextStop, inSlowZone: inSlowZone, advance: advance };
  root.PB = root.PB || {};
  root.PB.RunPace = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
