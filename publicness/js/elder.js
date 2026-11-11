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
  /* 정책 카드의 규칙 설명(2026-11-10 검토 5번) — 고르기 전에 ‘이 게임의 가정’을 읽을 수 있게. 대상·비율·요금은 설정값에서 만든다(값을 바꾸면 문장도 바뀐다).
   * f = { name(id), won(n) }. 어느 쪽이 나은지 말하지 않는다 — 두 선택의 계산만 적는다 */
  function rule(config, phase, f) {
    var E = config.elderFree || {}, fare = f.won(config.finance.fare), from = {};
    function pct(v) { return '약 ' + Math.round(v * 100) + '%'; }
    config.nodes.forEach(function (n) { from[n.id] = n.fromPhase || 1; });
    var zones = (E.zones || []).filter(function (z) { return from[z] != null && from[z] <= config.phases.length; });
    var now = zones.filter(function (z) { return from[z] <= phase; }), later = zones.filter(function (z) { return from[z] > phase; });
    return {
      assume: '이 게임에서는 요금이 생기면 일부 어르신이 이동을 포기한다고 가정해요.',
      lines: [
        '대상: ' + now.map(f.name).join(', ') + '에 가거나 거기서 출발하는 일반 이동 요청 가운데 ' + pct(E.share) + '를 어르신 이동으로 정해 두었어요.' +
          (later.length ? ' (' + later.map(function (z) { return from[z] + '단계부터 ' + f.name(z); }).join(', ') + '도 대상)' : ''),
        '유지하면: 어르신은 요금 ' + fare + '을 내지 않고 타요.',
        '폐지하면: 어르신 이동의 ' + pct(E.abolishStay) + '는 버스를 타지 않고 집에 머물러요. 나머지는 요금 ' + fare + '을 내고 타요.',
        '어느 이동이 집에 머무는지는 이동마다 미리 정해져 있어요. 그래서 건수가 적으면 딱 그 비율이 아닐 수 있어요.',
        '집에 머문 이동은 이동 수요 충족 점수에서 목적지까지 못 간 이동으로 세요.',
        '이 비율은 게임을 위해 정한 값이에요. 실제 사회에서 일어날 일을 예측한 것이 아니에요.'
      ]
    };
  }
  var api = { hash: Demand.hash, ride: ride, rule: rule };
  root.PB = root.PB || {}; root.PB.Elder = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
