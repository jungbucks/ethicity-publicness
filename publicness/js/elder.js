/* 어르신 무임 정책 적용(2026-11-10). 기본 요청의 elder 표시(demand.js)를 정책 선택에 따라 운행 요청에 반영한다.
 *  keep: elder 요청에 free:true(운임 0원). abolish(policyPhase부터): hash(key,2) < abolishStay인 elder는 집에 머물러(stayed) 운행 요청에서 빠지고, 남은 elder는 유료.
 * 입력 요청 배열·객체는 바꾸지 않는다. */
(function (root) {
  'use strict';
  var NODE = typeof require === 'function' && typeof module !== 'undefined';
  var Demand = NODE ? require('./demand.js') : root.PB.Demand;
  function ride(config, phase, requests, choice) {
    var E = config.elderFree || {}, abolish = choice === 'abolish' && phase >= E.policyPhase, ride = [], stayed = [];
    requests.forEach(function (q) {
      if (!q.elder) { ride.push(q); return; }
      if (!abolish) { ride.push(Object.assign({}, q, { free: true })); return; }
      if (Demand.hash(q.key, 2) < E.abolishStay) { stayed.push(q.key); return; }
      ride.push(q);
    });
    return { ride: ride, stayed: stayed };
  }
  var api = { hash: Demand.hash, ride: ride };
  root.PB = root.PB || {}; root.PB.Elder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
