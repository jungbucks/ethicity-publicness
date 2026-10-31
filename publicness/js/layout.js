/*
 * 랜덤·지정 세팅의 정류장 배치(2026-10-27 후반 지도 정리) — 같은 시드면 같은 배치(결정적).
 *  · 역할이 정해진 정류장(외곽 F·신도시 I·병원 D·터미널 J·복지관 K·호수공원 L·솔잎몰 M·대도시 N)은 고정 자리, 세로로 SPREAD_Y배 펼친다
 *    (예전엔 모든 정류장이 가운데 세로 5.6칸 띠에 몰려 8단계 지도가 2.4:1로 납작했고 라벨이 노선과 겹쳤다)
 *  · 나머지 생활권(A·B·C·E·G·H)은 지도 안쪽 상자 전체에 분산 표본(Poisson-disk: 다른 정류장과 R 이상 떨어진 후보만 받기) → 완화(가까운 쌍 밀어내기)
 *  · 지킬 것(tests/day·progression): F·I는 대각선 반대 구석, 병원 D는 시장 E보다 신도시 I에 가깝고 F–D > 2×I–D, 모든 쌍 ≥ 1.5, F와는 K만 1.5·나머지 ≥ 2.6
 *  · 마지막에 좌우·상하 뒤집기(sx, sy) — 예전과 같은 난수 순서로 먼저 뽑는다
 */
(function (root) {
  'use strict';
  var SPREAD_Y = 1.45;                 // 고정 자리 세로 배율(옛 ±2.8 → ±4.06)
  var BOX = { x: 3.7, y: 3.9 };        // 분산 표본 상자(뒤집기 전 좌표). 외곽·신도시 구석과 대도시 경계 안쪽
  var R = 2.4, R_F = 3.0, R_MIN = 1.6; // 생활권 사이 최소 거리(라벨 폭 + 여백 ≈ 화면 140px 이상), 외곽 F와는 더 멀리, 실패 시 줄여 가는 하한
  var FIXED = { F: [-4.8, 2.8], I: [4.8, -2.8], D: [3, -1.8], J: [4.4, 2.7], K: [-4.4, 0.7], L: [-4.6, -2.3], M: [2.7, 0.2], N: [8.7, 0] };

  function place(nodes, rng) {
    var sx = rng.next() < 0.5 ? -1 : 1, sy = rng.next() < 0.5 ? -1 : 1, pos = {};
    nodes.forEach(function (n) { var f = FIXED[n.id]; if (f) pos[n.id] = { x: f[0], y: n.id === 'N' ? f[1] : f[1] * SPREAD_Y, fixed: true }; });
    var free = nodes.filter(function (n) { return !FIXED[n.id]; }).map(function (n) { return n.id; }).sort();
    function d(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function ok(id, p, r) {
      return Object.keys(pos).every(function (k) {
        var need = k === 'F' || id === 'F' ? R_F : k === 'N' ? 0 : r;
        return d(p, pos[k]) >= need;
      }) && (id !== 'E' || !pos.I || !pos.D || d(p, pos.I) > d(pos.D, pos.I) + 0.3);
    }
    // 분산 표본: 정류장마다 후보를 난수로 뽑아 거리 조건을 만족하는 첫 후보를 받는다. 안 되면 R을 조금씩 줄인다
    free.forEach(function (id) {
      for (var r = R; r >= R_MIN; r -= 0.1) {
        for (var k = 0; k < 300; k++) {
          var p = { x: (rng.next() * 2 - 1) * BOX.x, y: (rng.next() * 2 - 1) * BOX.y };
          if (ok(id, p, r)) { pos[id] = p; return; }
        }
      }
      pos[id] = { x: 0, y: 0 }; // 이론상 오지 않는다(아래 완화가 떼어 낸다)
    });
    // 완화: 가까운 쌍을 서로 밀어내고(고정 쪽은 안 움직임) 상자 안에 둔다
    for (var it = 0; it < 30; it++) {
      free.forEach(function (id) {
        var p = pos[id];
        Object.keys(pos).forEach(function (k) {
          if (k === id || k === 'N') return;
          var q = pos[k], dist = d(p, q) || 0.001, want = k === 'F' ? R_F : R;
          if (dist >= want) return;
          var push = (want - dist) * (q.fixed ? 1 : 0.5) * 0.5;
          p.x += (p.x - q.x) / dist * push; p.y += (p.y - q.y) / dist * push;
        });
        p.x = Math.max(-BOX.x, Math.min(BOX.x, p.x)); p.y = Math.max(-BOX.y, Math.min(BOX.y, p.y));
      });
    }
    var out = {};
    Object.keys(pos).forEach(function (id) { out[id] = { x: Math.round(sx * pos[id].x * 100) / 100, y: Math.round(sy * pos[id].y * 100) / 100 }; });
    return out;
  }

  var api = { place: place, SPREAD_Y: SPREAD_Y, BOX: BOX, FIXED: FIXED };
  root.PB = root.PB || {};
  root.PB.Layout = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
