/* 기울어진 탑승 기록(2026-11-10). AI 추천이 보는 자료 = 지난 운행에서 버스에 실제로 탄 기록(교통카드)뿐이다.
 *  fromRun(passengers)                    — 출발 구역별 { requests, rode, arrived }. kind 'base'이고 돌아오는 이동(leg 'return')이 아닌 승객만.
 *  ratios(config, phase, prevLog, zones)  — 구역별 보이는 비율. 1단계: config.rideLog.hiddenAtStart는 0, 나머지 1.
 *                                           2단계부터: 직전 기록에 있고 요청이 1건 이상이면 rode/requests, 아니면 1(처음 생긴 구역·기록 없는 옛 저장본).
 *  visible(requests, ratios)              — 출발 구역별로 입력 순서를 지키며 구역 안에서 고르게 퍼뜨려 floor(r × 개수)개(i번째는 floor((i+1)r) > floor(ir)일 때). 돌아오는 이동은 넣지 않는다(AI 시뮬레이션이 다시 만든다).
 *  seenFor(config, phase, prevLog, base)  — 구역별 AI가 본 기본 요청 수(visible과 같은 셈 규칙 quotas). 지난 단계 화면용 — 따로 저장하지 않는다.
 * 비율에 없는 구역은 1로 본다. 입력 배열·객체는 바꾸지 않는다. */
(function (root) {
  'use strict';
  function fromRun(passengers) {
    var out = {};
    (passengers || []).forEach(function (p) {
      if (p.kind !== 'base' || p.leg === 'return') return;
      var z = out[p.o] || (out[p.o] = { requests: 0, rode: 0, arrived: 0 });
      z.requests++;
      if (p.firstBoardT != null) z.rode++;
      if (p.status === 'arrived') z.arrived++;
    });
    return out;
  }
  function ratios(config, phase, prevLog, zones) {
    var hidden = (config.rideLog && config.rideLog.hiddenAtStart) || [], out = {};
    zones.forEach(function (z) {
      if (phase <= 1) { out[z] = hidden.indexOf(z) >= 0 ? 0 : 1; return; }
      var L = prevLog && prevLog[z];
      out[z] = L && L.requests > 0 ? L.rode / L.requests : 1;
    });
    return out;
  }
  function counted(requests) { return requests.filter(function (q) { return q.leg !== 'return'; }); }
  /* 공용 셈 규칙: 출발 구역별 floor(개수 × 비율). 부동소수 오차는 1e-9로 흡수 */
  function fl(x) { return Math.floor(x + 1e-9); }
  function quotas(requests, rs) {
    var n = {}, out = {};
    counted(requests).forEach(function (q) { n[q.o] = (n[q.o] || 0) + 1; });
    Object.keys(n).forEach(function (z) { out[z] = fl((rs[z] != null ? rs[z] : 1) * n[z]); });
    return out;
  }
  function visible(requests, rs) {
    var idx = {};
    return counted(requests).filter(function (q) { var i = idx[q.o] || 0, v = rs[q.o] != null ? rs[q.o] : 1; idx[q.o] = i + 1; return fl((i + 1) * v) > fl(i * v); });
  }
  function seenFor(config, phase, prevLog, baseRequests) {
    var zones = Object.keys(quotas(baseRequests, {}));
    return quotas(baseRequests, ratios(config, phase, prevLog, zones));
  }
  var api = { fromRun: fromRun, ratios: ratios, visible: visible, seenFor: seenFor, quotas: quotas };
  root.PB = root.PB || {}; root.PB.RideLog = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
