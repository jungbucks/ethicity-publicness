// 지도 배치 검토 — 정류장 좌표가 바뀌면 거리·운행 시간·수요 도달이 달라지므로, 단계별 밸런스를 같은 계획(균형 운영)으로 비교한다.
//   node publicness/tools/layout-review.cjs [태그]  → 표 출력 + tests/_layout-<태그>.json
// 열: 단계 · 정류장 수 · 좌표 경계(가로×세로, 비율) · 가장 가까운 두 정류장 거리 · 예상 도착률(기본 수요, 균형 운영) · 기준 미충족 주요 인물 수
const fs = require('fs'), path = require('path');
const cfg = require('../js/config.js'), S = require('../js/session.js'), { STRATEGIES } = require('./econ-review.cjs');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });
function plan(s) {
  const want = STRATEGIES.balanced(s.phase, s);
  s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  want.slice(0, S.routeLimit(s)).forEach(([ns, n, num]) => {
    const r = S.addRoute(s, route(ns), num); if (!r) return;
    const own = s.config.challengeApplied ? (r.num === 5 ? 7 : r.num === 6 ? 9 : null) : null;
    let free = s.draft.buses.filter((b) => b.routeNum == null && S.canAssign(s, b.id, r.num));
    if (own) free = free.filter((b) => b.id === own).concat(free.filter((b) => b.id !== own));
    free.slice(0, n).forEach((b) => S.assign(s, b.id, r.num));
  });
}
function review(opt) {
  const s = S.create(cfg, opt), rows = [];
  while (s.stage !== 'ending') {
    S.beginPlan(s); plan(s);
    const ids = S.graph(s).nodes, ns = ids.map((id) => s.config.nodes.find((n) => n.id === id));
    const xs = ns.map((n) => n.x), ys = ns.map((n) => n.y), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    let near = Infinity; ns.forEach((a, i) => ns.slice(i + 1).forEach((b) => { near = Math.min(near, Math.hypot(a.x - b.x, a.y - b.y)); }));
    const m = S.expected(s), unmet = Object.values(m.residents || {}).filter((r) => r && !r.satisfied).length;
    rows.push({ phase: s.phase, stops: ids.length, box: w.toFixed(1) + '×' + h.toFixed(1), ratio: +(w / h).toFixed(2), near: +near.toFixed(2),
      arrival: Math.round(100 * m.arrived / Math.max(1, m.N)), N: m.N, unmet, coords: Object.fromEntries(ns.map((n) => [n.id, [+n.x.toFixed(2), +n.y.toFixed(2)]])) });
    S.startRun(s); s.current.metrics.costs.total = Math.max(0, s.current.metrics.costs.total); S.finishRun(s); S.nextPhase(s);
  }
  return { mode: s.mode, seed: s.seed, rows };
}
if (require.main === module) {
  const tag = process.argv[2] || 'before', out = [review({ mode: 'default' })].concat([7, 42, 1234].map((seed) => review({ mode: 'fixed', seed })));
  out.forEach((r) => {
    console.log(r.mode === 'default' ? '기본' : 'seed ' + r.seed);
    console.log('  단계 정류장 경계(가로×세로)  비율  최근접  도착%  미충족');
    r.rows.forEach((x) => console.log('  ' + String(x.phase).padEnd(4) + String(x.stops).padEnd(6) + x.box.padEnd(16) + String(x.ratio).padEnd(6) + String(x.near).padEnd(8) + String(x.arrival).padEnd(7) + x.unmet));
  });
  fs.writeFileSync(path.join(__dirname, '../tests/_layout-' + tag + '.json'), JSON.stringify(out, null, 1));
}
module.exports = { review };
