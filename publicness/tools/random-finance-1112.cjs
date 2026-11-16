// 랜덤(도전) 모드 재정 후보 비교(2026-11-12 교사 랜덤 검토 5번) — 값을 정하지 않고 표만 만든다.
// 지금 값 = config.challenge.finance.basePerBus 8,000원(2026-11-14 검토 2번, 교사 최종 확인 대기). 고른 근거 = 이 도구의 대본만이 아니라 계획 묶음 × 시드 표(README 「랜덤(도전) 재정」):
//   5,000원에서는 아래 '무난' 대본만 계약을 지켰고(150시드 0), AI '소외 지역' 제안 적용은 43%, 예전 기준 균형 계획(tools/econ-review.cjs balanced)은 77%가 계약 종료였다.
//   node publicness/tools/random-finance-1112.cjs [seed,seed,...] [base,base,...]   → 표 출력 + tests/_random-finance-1112.json
//   node publicness/tools/random-finance-1112.cjs bundle [base,base,...] [noai]      → 계획 묶음 × 시드 표(README 표의 출처, AI 계획 포함 약 20분 · noai면 약 3분) + tests/_random-finance-bundle.json
// 조정 손잡이 하나 = config.challenge.finance.basePerBus(기본 지원금, 랜덤 모드만). 보유비(holding)와 효과가 같다:
//   기본 제공 버스 1대의 단계 손익은 (기본 지원 − 보유비)로만 들어가고, 기준 예비비(Scores.reserve)도 (보유비 − 기본 지원)만 본다.
//   그래서 화면 문장(‘쉬는 버스 보유비 n × 20,000원’ 등)을 그대로 두는 기본 지원금 쪽을 고른다.
// 계획(사람이 만든 계획이 아니라 검사용 대본):
//   무난한 계획 = 허브(밀집 주거지 B)를 모든 노선이 지나게 이어 주요 인물의 모든 이동이 갈아타기 1번 안에 이어지고, 대기 버스를 모두 운행, 임차 없음.
//     노선 = 허브 + 각도 순으로 나눈 정류장 묶음(허브에서 가까운 순). 6단계부터 5번 직행 = 허브 + 새 장소 2곳(호수공원·솔잎몰, 없으면 먼 곳), 8단계 6번 광역 = 허브–대도시.
//     버스 = 7호차는 직행, 9호차는 광역, 나머지는 노선 한 바퀴 시간에 비례(노선마다 1대 이상).
//   과한 계획 = 무난한 계획 + 임차 한도(2대)까지 빌려 버스당 한 바퀴가 가장 긴 노선에 더함 — heavyLate = 6~8단계만, heavyMid = 4~8단계, heavy = 1단계부터 매 단계.
// 청원·무임 선택: 청원은 모두 ‘반영한다’, 무임은 ‘유지’(재정에는 무임 유지가 더 빡빡한 쪽).
const fs = require('fs'), path = require('path');
const cfg = require('../js/config.js'), S = require('../js/session.js'), G = require('../js/graph.js'), C = require('../js/choices.js'), Q = require('../js/schedule.js');
const SEEDS = (process.argv[2] || '245525538,1,2,3,7').split(',').map(Number);
const BASES = (process.argv[3] || '10000,8000,7000,6000,5000').split(',').map(Number);
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
      const routes = moderate(s); lay(s, routes, kind === 'heavy' || (kind === 'heavyMid' && s.phase >= 4) || (kind === 'heavyLate' && s.phase >= 6) ? 2 : 0); answer(s);
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
/* ── 계획 묶음 × 시드(2026-11-14 검토 2번) ──
 * 한 계획을 계약 종료와 상관없이 8단계까지 돌려 단계 수지를 적고(trace), 기본 지원금 후보마다 잔액·계약 종료·학기 말 파산을 다시 센다(judge).
 * 단계 수지는 기본 지원금에 선형이다: 수지(B) = 수지(B0) + (B − B0) × 기본 제공 버스 수 — 아래 계획은 모두 잔액·지원금을 보지 않고 짜므로 계획이 달라지지 않는다.
 * 계획: 위 대본(무난·임차 변형) · short2 = 노선마다 허브+2곳 · balanced/loop = tools/econ-review.cjs의 그 전략 · ai-<goal> = 1단계 무난에서 시작해 매 단계 AI 제안(reach 소외 지역 / time 빠른 이동 / profit 수익)을 그대로 적용.
 * 시드 = 교사 시드 245525538 + (100 + 7919·i). */
const LEASES = { heavy: [1, 2], heavyMid: [4, 2], from5x2: [5, 2], heavyLate: [6, 2], late1: [6, 1], every1: [1, 1] };
function trace(seed, kind) {
  const s = S.create(cfg, { mode: 'random', seed }), rows = [];
  for (;;) {
    if (kind === 'balanced' || kind === 'loop') { S.beginPlan(s); require('./econ-review.cjs').apply(s, kind); }
    else if (/^ai-/.test(kind)) {
      S.beginPlan(s); if (s.phase === 1 || !s.draft.routes.some((r) => r.nodes.length >= 2)) lay(s, moderate(s), 0);
      S.applyRecommendation(s, require('../js/advisor.js').recommendSync(S.revealed(s), kind.slice(3)));
    } else {
      let rs = moderate(s); if (kind === 'short2') rs = rs.map((r) => (r.num >= 5 ? r : { num: r.num, nodes: r.nodes.slice(0, 3) }));
      const L = LEASES[kind]; lay(s, rs, L && s.phase >= L[0] ? L[1] : 0);
    }
    answer(s);
    const errs = S.validate(s); if (errs.length) throw new Error(seed + ' ' + kind + ' ' + s.phase + ' ' + errs.join(' / '));
    S.startRun(s); const h = S.finishRun(s);
    rows.push({ phase: s.phase, profit: h.metrics.costs.total, provided: s.draft.buses.filter((b) => !b.leased).length });
    s.end = null; s.negStreak = 0; /* 계약 종료를 지우고 끝까지 — 판정은 judge가 후보 값마다 */
    S.nextPhase(s); if (s.stage === 'ending') return rows;
  }
}
function judge(rows, B0, B) {
  let bal = 0, streak = 0;
  for (const r of rows) { bal += r.profit + (B - B0) * r.provided; streak = bal < 0 ? streak + 1 : 0; if (streak >= S.NEGATIVE_LIMIT) return { end: 'contract', phase: r.phase, balance: bal }; }
  return { end: S.finalCause(bal), phase: rows.length, balance: bal };
}
module.exports = { moderate, lay, answer, play, trace, judge };
if (require.main !== module) return;
if (process.argv[2] === 'bundle') {
  const rest = process.argv.slice(3), noai = rest.indexOf('noai') >= 0, B0 = cfg.challenge.finance.basePerBus; /* 순서 무관: bundle [값,값,…] [noai] */
  const bases = (rest.filter((a) => /^\d/.test(a))[0] || '5000,6000,7000,7500,8000,9000,10000').split(',').map(Number);
  const KINDS = [['moderate', "도구 '무난'(허브 방사형)", 150], ['balanced', "예전 기준 균형 계획(econ-review 'balanced')", 60], ['short2', '노선마다 허브+2곳', 150], ['ai-reach', "AI '소외 지역' 제안 매 단계", 60], ['ai-time', "AI '빠른 이동' 제안 매 단계", 40], ['ai-profit', "AI '수익' 제안 매 단계", 40], ['loop', '긴 순환 1개', 20],
    ['late1', '무난 + 6~8단계 1대 임차', 150], ['heavyLate', '무난 + 6~8단계 2대 임차', 150], ['from5x2', '무난 + 5~8단계 2대 임차', 150], ['heavyMid', '무난 + 4~8단계 2대 임차', 150], ['every1', '무난 + 매 단계 1대 임차', 150], ['heavy', '무난 + 매 단계 2대 임차', 150]].filter((k) => !noai || !/^ai-/.test(k[0]));
  const all = [], cell = (o) => o.contract + (o.early ? '(초' + o.early + ')' : '') + (o.bankrupt ? '+' + o.bankrupt : '');
  console.log('칸 = 계약 종료한 시드 수(초n = 그중 3단계까지 끝난 수)+학기 말 파산 수 · 기준 값 ' + B0 + '원으로 돌려 후보 값마다 다시 셈');
  console.log('| 계획(시드 수) | ' + bases.map((b) => b.toLocaleString('en-US') + '원').join(' | ') + ' |'); console.log('|---|' + bases.map(() => '---').join('|') + '|');
  for (const [kind, name, n] of KINDS) {
    const seeds = [245525538]; for (let i = 0; i < n; i++) seeds.push(100 + i * 7919);
    const runs = seeds.map((seed) => ({ seed, rows: trace(seed, kind) }));
    const stats = bases.map((B) => { const o = { base: B, contract: 0, early: 0, bankrupt: 0, teacher: null }; runs.forEach((r) => { const j = judge(r.rows, B0, B); if (j.end === 'contract') { o.contract++; if (j.phase <= 3) o.early++; } else if (j.end === 'bankrupt') o.bankrupt++; if (r.seed === 245525538) o.teacher = j.end + (j.end === 'contract' ? '@' + j.phase : ''); }); return o; });
    all.push({ kind, name, seeds: seeds.length, stats });
    console.log('| ' + name + ' (' + seeds.length + ') | ' + stats.map(cell).join(' | ') + ' |');
  }
  fs.writeFileSync(path.join(__dirname, '..', 'tests', '_random-finance-bundle.json'), JSON.stringify({ B0, bases, kinds: all }, null, 1));
  return;
}
const out = [];
for (const seed of SEEDS) for (const base of BASES) for (const kind of ['moderate', 'heavyLate', 'heavyMid', 'heavy']) {
  const r = play(seed, base, kind), deficits = r.rows.filter((x) => x.profit < 0), late = deficits.filter((x) => x.phase >= 6).length;
  out.push({ seed, base, kind, rows: r.rows, end: r.end, deficits: deficits.map((x) => x.phase), lateDeficits: late, contractEnded: !!(r.end && r.end.cause === 'contract'), bankrupt: !!(r.end && r.end.cause === 'bankrupt'), endPhase: r.end ? r.end.phase : null, final: r.rows[r.rows.length - 1].balance });
}
const won = (n) => (n > 0 ? '+' : '') + n.toLocaleString('en-US');
for (const o of out) console.log(`seed ${o.seed} · 기본지원 ${o.base} · ${({ moderate: '무난', heavyLate: '과한(6~8단계 임차 2대)', heavyMid: '과한(4~8단계 임차 2대)', heavy: '과한(매 단계 임차 2대)' })[o.kind]} | ` + o.rows.map((x) => `${x.phase}:${won(x.profit)}(${won(x.balance)})`).join(' ') + ` | 적자 ${o.deficits.join(',') || '-'} | 계약 종료 ${o.contractEnded ? o.endPhase + '단계' : o.bankrupt ? '아니오(학기 말 파산)' : '아니오'} | 인물 ${o.rows.map((x) => x.ok).join(' ')} | 갈아타기경고 ${o.rows.map((x) => x.transferWarn).join('')}`);
fs.writeFileSync(path.join(__dirname, '..', 'tests', '_random-finance-1112.json'), JSON.stringify(out, null, 1));
