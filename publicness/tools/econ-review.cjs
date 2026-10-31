// 경제 밸런스 검토 — 대표 전략을 같은 조건(기본 5단계 + 도전 고정 seed)에서 끝까지 돌려 재정·서비스를 비교한다.
//   node publicness/tools/econ-review.cjs [seed,seed,...]   → 표 출력 + tests/_econ-review.json
// 전략: none 무운행 / center 중심가 집중 / loop 모든 정류장 긴 순환 / balanced 외곽·병원 포함 균형 /
//       lease-max 임차 한도까지 빌려 중심가에 / selective 균형 + 필요한 구간에만 임차 증차
// 수치는 게임용 가상 값이며 실제 교통사업 원가가 아니다.
const fs = require('fs'), path = require('path');
const cfg = require('../js/config.js'); if (process.env.ECON) Object.assign(cfg.finance, JSON.parse(process.env.ECON)); // 단가 비교: ECON='{"basePerBus":10000}'
S = require('../js/session.js'), N = require('../js/narrative.js'), G = require('../js/graph.js');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });

// 단계별 노선 묶음: [정류장 목록, 버스 수] — 노선 한도·전용 버스(7=5번 직행 3곳 이하, 9=6번 광역)는 apply가 맞춘다
const BAL_DEFAULT = [[[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1]], [[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]],
  [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]], [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1]],
  [[['F', 'K', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1], [['B', 'C'], 1]]];
function balanced(phase) {
  if (phase <= 5) return BAL_DEFAULT[phase - 1];
  const base = [[['F', 'D', 'A'], 2], [['B', 'C', 'A'], 1], [['I', 'A', 'G'], 2], [['J', 'H', 'B'], 1]];
  if (phase >= 6) base.push([phase === 6 ? ['B', 'L', 'F'] : ['B', 'L', 'M'], 1, 5]);
  if (phase === 8) base.push([['B', 'N'], 1, 6]);
  return base;
}
function center(phase) { // 수요 많은 중심가만(외곽 F·병원 D·신도시 I·터미널 J·복지관 K는 연결하지 않음)
  const r = [[['C', 'B', 'A', 'G'], 99], [['E', 'A', 'B'], 99]];
  if (phase >= 7) r.push([['B', 'M'], 1, 5]);
  if (phase === 8) r.push([['B', 'N'], 1, 6]);
  return r;
}
function loop(phase, s) { // 대도시를 뺀 모든 정류장을 각도 순으로 한 바퀴
  const ns = S.graph(s).nodes.filter((id) => id !== 'N').map((id) => s.config.nodes.find((n) => n.id === id));
  const cx = ns.reduce((a, n) => a + n.x, 0) / ns.length, cy = ns.reduce((a, n) => a + n.y, 0) / ns.length;
  const order = ns.sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx)).map((n) => n.id);
  return [[order.concat([order[0]]), 99]];
}
// 균형 운영에서 외곽 마을·병원·복지관만 뺀 것(같은 버스 수) — ‘비용이 드니 외곽을 끊는 게 항상 이득인가’ 비교용
function cutOuter(phase) {
  return balanced(phase).map(([ns, n, num]) => [ns.filter((id) => ['F', 'D', 'K'].indexOf(id) < 0), n, num]).filter(([ns]) => ns.length >= 2);
}
const STRATEGIES = {
  none: () => [],
  center, loop, balanced, 'cut-outer': cutOuter,
  'lease-max': (p) => center(p), // 임차가 있으면 한도까지(apply에서 lease:'max')
  selective: (p) => balanced(p) // 균형 + 효과가 큰 노선에만 임차 1대(apply)
};
const LEASE = { 'lease-max': 'max', selective: 'one' };

function apply(s, name) {
  const want = STRATEGIES[name](s.phase, s);
  if (S.leaseLimit && LEASE[name] === 'max') { const n = S.leaseLimit(s); for (let i = 0; i < n; i++) S.lease(s); }
  s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  const limit = S.routeLimit(s);
  want.slice(0, limit).forEach(([ns, n, num]) => {
    const r = S.addRoute(s, route(ns), num); if (!r) return;
    const own = s.config.challengeApplied ? (r.num === 5 ? 7 : r.num === 6 ? 9 : null) : null;
    let free = s.draft.buses.filter((b) => b.routeNum == null && S.canAssign(s, b.id, r.num));
    if (own) free = free.filter((b) => b.id === own).concat(free.filter((b) => b.id !== own));
    const count = n === 99 ? Math.ceil(free.length / Math.max(1, want.slice(0, limit).filter((w) => w[1] === 99).length - want.slice(0, limit).filter((w) => w[1] === 99).indexOf(want.slice(0, limit).find((w) => w[0] === ns)))) : n;
    free.slice(0, count).forEach((b) => S.assign(s, b.id, r.num));
  });
  // lease-max: 한도까지 임차해 첫 중심가 노선에
  if (name === 'selective' && S.balance(s) >= 50000) { // 잔액이 5만 원 이상일 때만: 기본 수요 예상으로 노선마다 1대를 더해 보고, 도착이 가장 많이 느는 곳에 8건 이상일 때만 임차
    const base = S.expectedRun(s).metrics.arrived, snap = JSON.stringify(S.serialize(s));let best = null;
    S.routesInOrder(s).forEach((r) => { const t = S.restore(JSON.parse(snap), s.config); const b = S.lease(t); if (!b || !S.canAssign(t, b.id, r.num)) return; S.assign(t, b.id, r.num); const gain = S.expectedRun(t).metrics.arrived - base; if (!best || gain > best.gain) best = { gain, num: r.num }; });
    if (best && best.gain >= 8) { const b = S.lease(s); S.assign(s, b.id, best.num); }
  }
  if (name === 'lease-max') {
    const rest = s.draft.buses.filter((b) => b.routeNum == null), first = S.routesInOrder(s).filter((r) => r.num <= 4)[0];
    if (first) rest.forEach((b) => S.assign(s, b.id, first.num));
  }
}

function play(opt, name) {
  const s = S.create(cfg, opt), phases = [];
  while (s.stage !== 'ending') {
    S.beginPlan(s); apply(s, name);
    if (S.validate(s).length) throw new Error(name + ' ' + s.phase + ': ' + S.validate(s).join(' / '));
    S.startRun(s); const h = S.finishRun(s), k = h.metrics.costs, z = h.metrics.zones;
    phases.push({ phase: s.phase, total: Math.round(k.total), costs: k, arrived: h.metrics.arrived, N: h.metrics.N,
      outer: ['F', 'D', 'K'].filter((id) => z[id] && z[id].N).map((id) => id + ':' + Math.round(100 * z[id].rate) + '%').join(' '),
      running: s.draft.buses.filter((b) => b.routeNum != null).length, owned: s.draft.buses.length });
    S.nextPhase(s);
  }
  const reactions = N.endingReactions(s.config, s.history);
  const arrived = phases.reduce((a, p) => a + p.arrived, 0), Nall = phases.reduce((a, p) => a + p.N, 0);
  return { name, mode: s.mode, seed: s.seed, balance: S.balance(s), end: s.end.cause, deficits: s.deficits, ledger: s.ledger,
    arrival: Math.round(100 * arrived / Nall), satisfied: reactions.filter((r) => r.satisfied).length + '/' + reactions.length, phases };
}

if (require.main === module) {
  const seeds = (process.argv[2] || '7,42,1234').split(',').map(Number), rows = [];
  for (const name of Object.keys(STRATEGIES)) {
    rows.push(play({ mode: 'default' }, name));
    for (const seed of seeds) rows.push(play({ mode: 'fixed', seed }, name));
  }
  const pad = (x, n) => String(x).padEnd(n);
  console.log(pad('전략', 11) + pad('모드', 12) + pad('최종잔액', 11) + pad('결말', 10) + pad('적자', 5) + pad('도착%', 6) + pad('인물', 6) + '단계 수지 / 외곽·병원 도착');
  rows.forEach((r) => console.log(pad(r.name, 11) + pad(r.mode === 'default' ? '기본' : 'seed ' + r.seed, 12) + pad(r.balance.toLocaleString(), 11) + pad(r.end, 10) + pad(r.deficits, 5) + pad(r.arrival, 6) + pad(r.satisfied, 6) +
    r.phases.map((p) => Math.round(p.total / 1000) + 'k').join(' ') + ' | ' + r.phases.map((p) => p.outer || '-').join(' / ')));
  fs.writeFileSync(path.join(__dirname, '../tests/_econ-review.json'), JSON.stringify(rows, null, 1));
}
module.exports = { play, STRATEGIES, apply };
