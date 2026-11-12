// 랜덤(도전) 모드 재정 후보 비교(2026-11-12 교사 랜덤 검토 5번) — 값을 정하지 않고 표만 만든다.
//   node publicness/tools/random-finance-1112.cjs [seed,seed,...] [base,base,...]   → 표 출력 + tests/_random-finance-1112.json
// 조정 손잡이 하나 = config.challenge.finance.basePerBus(기본 지원금, 랜덤 모드만). 보유비(holding)와 효과가 같다:
//   기본 제공 버스 1대의 단계 손익은 (기본 지원 − 보유비)로만 들어가고, 기준 예비비(Scores.reserve)도 (보유비 − 기본 지원)만 본다.
//   그래서 화면 문장(‘쉬는 버스 보유비 n × 20,000원’ 등)을 그대로 두는 기본 지원금 쪽을 고른다.
// 계획(사람이 만든 계획이 아니라 검사용 대본):
//   무난한 계획 = 허브(밀집 주거지 B)를 모든 노선이 지나게 이어 주요 인물의 모든 이동이 갈아타기 1번 안에 이어지고, 대기 버스를 모두 운행, 임차 없음.
//     노선 = 허브 + 각도 순으로 나눈 정류장 묶음(허브에서 가까운 순). 6단계부터 5번 직행 = 허브 + 새 장소 2곳(호수공원·솔잎몰, 없으면 먼 곳), 8단계 6번 광역 = 허브–대도시.
//     버스 = 7호차는 직행, 9호차는 광역, 나머지는 노선 한 바퀴 시간에 비례(노선마다 1대 이상).
//   과한 계획 = 무난한 계획 + 임차 한도(2대)까지 빌려 버스당 한 바퀴가 가장 긴 노선에 더함 — heavyLate = 6~8단계만, heavy = 1단계부터 매 단계.
// 청원·무임 선택: 청원은 모두 ‘반영한다’, 무임은 ‘유지’(재정에는 무임 유지가 더 빡빡한 쪽).
const fs = require('fs'), path = require('path');
const cfg = require('../js/config.js'), S = require('../js/session.js'), G = require('../js/graph.js'), C = require('../js/choices.js'), Q = require('../js/schedule.js');
const SEEDS = (process.argv[2] || '245525538,1,2,3,7').split(',').map(Number);
const BASES = (process.argv[3] || '10000,7000,6000,5000,4000').split(',').map(Number);
const HUB = 'B';

function moderate(s) {
  const g = S.graph(s), phase = s.phase, lim = S.routeLimit(s), xy = (id) => s.config.nodes.find((n) => n.id === id);
  const h = xy(HUB), ch = s.config.challengeApplied, express = ch && phase >= 6, regional = ch && phase >= 8;
  let rest = g.nodes.filter((id) => id !== HUB && id !== 'N');
  const routes = [];
  if (express) {
    let ex = ['L', 'M'].filter((id) => rest.includes(id));
    if (ex.length < 2) ex = ex.concat(rest.filter((id) => !ex.includes(id)).sort((a, b) => dist(b) - dist(a)).slice(0, 2 - ex.length));
    routes.push({ num: 5, nodes: [HUB].concat(order(ex)) }); rest = rest.filter((id) => !ex.includes(id));
  }
  if (regional) routes.push({ num: 6, nodes: [HUB, 'N'] });
  const k = lim - routes.length;
  const ang = (id) => Math.atan2(xy(id).y - h.y, xy(id).x - h.x);
  rest.sort((a, b) => ang(a) - ang(b));
  // 가장 큰 각도 틈에서 시작해 k묶음으로 고르게
  let gap = 0, at = 0; rest.forEach((id, i) => { const n = rest[(i + 1) % rest.length], d = ((ang(n) - ang(id)) + 2 * Math.PI) % (2 * Math.PI) || 2 * Math.PI; if (d > gap) { gap = d; at = (i + 1) % rest.length; } });
  rest = rest.slice(at).concat(rest.slice(0, at));
  const nums = [1, 2, 3, 4, 5, 6].filter((n) => !routes.some((r) => r.num === n));
  for (let i = 0; i < k; i++) { const grp = rest.slice(Math.round(i * rest.length / k), Math.round((i + 1) * rest.length / k)); if (grp.length) routes.push({ num: nums[i], nodes: [HUB].concat(order(grp)) }); }
  function dist(id) { const p = xy(id); return Math.hypot(p.x - h.x, p.y - h.y); }
  function order(ids) { const out = []; let cur = HUB, left = ids.slice(); while (left.length) { left.sort((a, b) => g.time(cur, a) - g.time(cur, b)); cur = left.shift(); out.push(cur); } return out; }
  return routes;
}
function lay(s, routes, leases) {
  S.beginPlan(s); s.draft.routes = []; s.draft.buses = s.draft.buses.filter((b) => !b.leased); s.draft.buses.forEach((b) => { b.routeNum = null; });
  routes.forEach((r) => s.draft.routes.push({ num: r.num, nodes: r.nodes.slice(), stops: r.nodes.map(() => true), autoPlaced: true }));
  const general = s.draft.routes.filter((r) => r.num !== 5 && r.num !== 6), cyc = (r) => Q.routeCycle(S.graph(s), s.config, r.num, r);
  s.draft.buses.forEach((b) => { if (s.config.challengeApplied && b.id === 7 && S.routeByNum(s, 5)) b.routeNum = 5; if (s.config.challengeApplied && b.id === 9 && S.routeByNum(s, 6)) b.routeNum = 6; });
  const free = s.draft.buses.filter((b) => b.routeNum == null && S.canAssign(s, b.id, general[0].num));
  const count = {}; general.forEach((r) => { count[r.num] = 1; });
  for (let i = general.length; i < free.length; i++) { const r = general.slice().sort((a, b) => cyc(b) / count[b.num] - cyc(a) / count[a.num])[0]; count[r.num]++; }
  let i = 0; general.forEach((r) => { for (let n = 0; n < count[r.num] && i < free.length; n++) free[i++].routeNum = r.num; });
  for (let n = 0; n < (leases || 0); n++) { const b = S.lease(s); if (!b) break; const r = general.slice().sort((a, c) => cyc(c) / busesOn(c) - cyc(a) / busesOn(a))[0]; b.routeNum = r.num; }
  function busesOn(r) { return s.draft.buses.filter((b) => b.routeNum === r.num).length; }
}
function answer(s) {
  if (C.petitionFor(s, s.phase)) C.set(s, 'petition', 'choice', 'reflect');
  if (s.phase === 4 && s.config.elderFree) C.set(s, 'elder', 'choice', 'keep');
}
function play(seed, base, kind) {
  const keep = cfg.challenge.finance; cfg.challenge.finance = Object.assign({}, keep, { basePerBus: base });
  try {
    const s = S.create(cfg, { mode: 'random', seed }), rows = [];
    for (;;) {
      const routes = moderate(s); lay(s, routes, kind === 'heavy' || (kind === 'heavyLate' && s.phase >= 6) ? 2 : 0); answer(s);
      const errs = S.validate(s); if (errs.length) throw new Error(seed + ' ' + s.phase + ' ' + errs.join(' / '));
      const tr = S.residentTransfers(s), unserved = S.departChecks(s).residents;
      S.startRun(s); const h = S.finishRun(s);
      const rec = Object.values(h.residents).filter(Boolean);
      rows.push({ phase: s.phase, profit: Math.round(h.metrics.costs.total), balance: Math.round(S.balance(s)), buses: s.draft.buses.length, leased: s.draft.buses.filter((b) => b.leased).length,
        arrived: h.metrics.arrived, N: h.metrics.N, ok: rec.filter((r) => r.satisfied).length + '/' + rec.length, transferWarn: tr.length, unserved: unserved.length, fin: h.scores && h.scores.finance ? h.scores.finance.score : null });
      if (s.end) return { rows, end: s.end };
      S.nextPhase(s); if (s.stage === 'ending') return { rows, end: s.end };
    }
  } finally { cfg.challenge.finance = keep; }
}
module.exports = { moderate, lay, answer, play };
if (require.main !== module) return;
const out = [];
for (const seed of SEEDS) for (const base of BASES) for (const kind of ['moderate', 'heavyLate', 'heavy']) {
  const r = play(seed, base, kind), deficits = r.rows.filter((x) => x.profit < 0), late = deficits.filter((x) => x.phase >= 6).length;
  out.push({ seed, base, kind, rows: r.rows, end: r.end, deficits: deficits.map((x) => x.phase), lateDeficits: late, contractEnded: !!(r.end && r.end.cause === 'contract'), endPhase: r.end ? r.end.phase : null, final: r.rows[r.rows.length - 1].balance });
}
const won = (n) => (n > 0 ? '+' : '') + n.toLocaleString('en-US');
for (const o of out) console.log(`seed ${o.seed} · 기본지원 ${o.base} · ${({ moderate: '무난', heavyLate: '과한(6~8단계 임차 2대)', heavy: '과한(매 단계 임차 2대)' })[o.kind]} | ` + o.rows.map((x) => `${x.phase}:${won(x.profit)}(${won(x.balance)})`).join(' ') + ` | 적자 ${o.deficits.join(',') || '-'} | 계약 종료 ${o.contractEnded ? o.endPhase + '단계' : '아니오'} | 인물 ${o.rows.map((x) => x.ok).join(' ')} | 갈아타기경고 ${o.rows.map((x) => x.transferWarn).join('')}`);
fs.writeFileSync(path.join(__dirname, '..', 'tests', '_random-finance-1112.json'), JSON.stringify(out, null, 1));
