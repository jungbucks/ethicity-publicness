// 두 점수 검토 — 대표 전략 A~H를 같은 지도·seed·수요에서 끝까지 돌려 재정 건전성·이동 수요 충족을 비교한다.
//   node publicness/tools/score-review.cjs [seed,seed,...]   → 표 출력 + tests/_score-review.json
// A none 무운행 / B center 중심가 집중 / C loop 긴 순환 / D balanced 외곽·병원 균형 / E bal-lease-max 균형 + 임차 한도까지(불필요한 증차)
// F selective 필요한 구간에만 임차 / G block-first 균형에서 왕복 인물·가족의 첫 목적지(H 운동장·L 호수공원)를 빼 귀가 요청을 줄임
// H bank-serve 1~3단계 긴 순환으로 잔액을 쌓은 뒤 균형 + 외곽 노선 임차 증차(회차 적자를 잔액으로 유지) / min-op 1대만 짧은 노선(평가 보류 우회 확인)
// ‘옛 비율’ = 시뮬레이션에서 실제로 생긴 요청 기준 도착률(Metrics.summarize) — 분모가 계획에 따라 달라지는 비교용
const fs = require('fs'), path = require('path');
const cfg = require('../js/config.js'), S = require('../js/session.js'), E = require('./econ-review.cjs'), Scores = require('../js/scores.js');
const route = (ns) => ({ nodes: ns, stops: ns.map(() => true) });
const ST = E.STRATEGIES;
ST['min-op'] = () => [[['B', 'A'], 1]];
ST['block-first'] = (p, s) => ST.balanced(p, s).map(([ns, n, num]) => [ns.filter((id) => id !== 'H' && id !== 'L'), n, num]).filter(([ns]) => ns.length >= 2);
ST['bal-lease-max'] = ST.balanced;
ST['bank-serve'] = (p, s) => (p <= 3 ? ST.loop(p, s) : ST.balanced(p, s));
function leaseInto(s, pick) {
  const n = S.leaseLimit(s);
  for (let i = 0; i < n; i++) { const b = S.lease(s); const r = pick(s); if (b && r && S.canAssign(s, b.id, r.num)) S.assign(s, b.id, r.num); }
}
function apply(s, name) {
  E.apply(s, name === 'bal-lease-max' || name === 'bank-serve' || name === 'block-first' || name === 'min-op' ? (name === 'min-op' || name === 'block-first' ? name : name === 'bank-serve' && s.phase <= 3 ? 'loop' : 'balanced') : name);
  if (name === 'min-op' || name === 'block-first') return;
  if (name === 'bal-lease-max') leaseInto(s, (t) => S.routesInOrder(t)[0]);
  if (name === 'bank-serve' && s.phase > 3) leaseInto(s, (t) => S.routesInOrder(t).filter((r) => r.nodes.indexOf('F') >= 0)[0]);
}
function play(opt, name) {
  const s = S.create(cfg, opt); let gen = 0, arr = 0;
  while (s.stage !== 'ending') {
    S.beginPlan(s); apply(s, name);
    if (S.validate(s).length) throw new Error(name + ' ' + s.phase + ': ' + S.validate(s).join(' / '));
    S.startRun(s); const h = S.finishRun(s); gen += h.metrics.N; arr += h.metrics.arrived;
    S.nextPhase(s);
  }
  const o = S.scoresOverall(s), m = o.mobility, f = o.finance;
  const z = m.worst ? m.worst.id + ' ' + m.worst.missed + '건' : '-';
  return { name, mode: s.mode, seed: s.seed, end: s.end.cause, played: o.from + '~' + o.to, balance: S.balance(s),
    finance: f.score == null ? '보류' : f.score, finStatus: f.status, reserve: f.reserve.amount,
    mobility: m.score, done: m.done, N: m.N, oldRate: Math.floor(100 * arr / gen), oldN: gen,
    outer: m.outer.done + '/' + m.outer.N, essential: m.essential.done + '/' + m.essential.N, worst: z,
    unrealized: (m.reasons.parentFailed || 0) + (m.reasons.lateParent || 0),
    phases: s.history.map((h) => ({ phase: h.phase, fin: h.scores.finance.score, bal: h.scores.finance.balance, res: h.scores.finance.reserve.amount, mob: h.scores.mobility.score, N: h.scores.mobility.N, done: h.scores.mobility.done, genN: h.metrics.N, arrived: h.metrics.arrived, total: Math.round(h.metrics.costs.total) })) };
}
if (require.main === module) {
  const seeds = (process.argv[2] || '7,42,1234').split(',').map(Number), rows = [];
  const names = ['none', 'center', 'loop', 'balanced', 'bal-lease-max', 'selective', 'block-first', 'bank-serve', 'min-op', 'cut-outer'];
  for (const name of names) { rows.push(play({ mode: 'default' }, name)); for (const seed of seeds) rows.push(play({ mode: 'fixed', seed }, name)); }
  const pad = (x, n) => String(x).padEnd(n);
  console.log(pad('전략', 14) + pad('모드', 10) + pad('결말', 9) + pad('단계', 5) + pad('잔액', 10) + pad('재정', 5) + pad('이동', 5) + pad('완료/평가', 11) + pad('옛비율', 7) + pad('외곽', 9) + pad('필수', 9) + pad('미발생', 6) + '최다 누락 · 단계별 재정점수(잔액/기준)');
  rows.forEach((r) => console.log(pad(r.name, 14) + pad(r.mode === 'default' ? '기본' : 's' + r.seed, 10) + pad(r.end, 9) + pad(r.played, 5) + pad(r.balance, 10) + pad(r.finance, 5) + pad(r.mobility, 5) + pad(r.done + '/' + r.N, 11) + pad(r.oldRate, 7) + pad(r.outer, 9) + pad(r.essential, 9) + pad(r.unrealized, 6) + r.worst + ' · ' +
    r.phases.map((p) => (p.fin == null ? '보류' : p.fin) + '(' + Math.round(p.bal / 1000) + 'k/' + Math.round(p.res / 1000) + 'k)').join(' ')));
  // 분모 역전 검사: 같은 모드·seed·단계에서 X가 평가 수요를 더 많이 완료했는데 비율이 더 낮은 쌍(옛 비율 vs 새 점수)
  let oldInv = 0, newInv = 0, sample = null; const key = (r, p) => r.mode + r.seed + '-' + p.phase;
  const by = {}; rows.forEach((r) => r.phases.forEach((p) => (by[key(r, p)] = by[key(r, p)] || []).push({ name: r.name, p })));
  Object.values(by).forEach((list) => list.forEach((x) => list.forEach((y) => {
    if (x.p.done <= y.p.done) return;
    if (x.p.arrived / x.p.genN < y.p.arrived / y.p.genN) { oldInv++; if (!sample) sample = x.name + ' ' + x.p.arrived + '/' + x.p.genN + ' vs ' + y.name + ' ' + y.p.arrived + '/' + y.p.genN + ' (' + x.p.phase + '단계, 평가 완료 ' + x.p.done + ' > ' + y.p.done + ')'; }
    if (x.p.mob < y.p.mob) newInv++;
  })));
  console.log('완료를 더 했는데 비율이 낮아진 쌍 — 옛 비율: ' + oldInv + ' · 새 점수: ' + newInv + (sample ? ' · 예: ' + sample : ''));
  fs.writeFileSync(path.join(__dirname, '../tests/_score-review.json'), JSON.stringify(rows, null, 1));
}
module.exports = { play };
