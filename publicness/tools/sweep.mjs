// 균형 점검(PRD §14): 여러 계획으로 다섯 단계를 돌려 생활권별 도착·대기·재정을 비교한다.
// 실행: node publicness/tools/sweep.mjs  →  콘솔 표 + publicness/docs/sweep-<SCENARIO_VERSION>.md
// 결과는 보고용이다. ‘고장’이 나와도 값을 자동으로 바꾸지 않는다(설계 §9-10).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const cfg = require('../js/config.js');
const G = require('../js/graph.js');
const A = require('../js/advisor.js');
const S = require('../js/session.js');
const M = require('../js/metrics.js');

const R = (s) => { const p = s.split('-'); return { nodes: p.map((x) => x.toUpperCase()), stops: p.map((x) => x === x.toUpperCase()) }; };
const ZONES = G.build(cfg, 5).nodes;

function setPlan(s, routes, offsets) {
  s.draft.routes = []; s.draft.nextNum = 1;
  s.draft.buses.forEach((b, i) => {
    if (!routes[i]) { S.assign(s, b.id, null); return; }
    const r = S.addRoute(s, routes[i]);
    S.assign(s, b.id, r.num); S.setOffset(s, b.id, offsets[i] ?? 0);
  });
}

// strategy(s, phase) 는 계획 화면에서 학생이 하는 일을 흉내 낸다
function play(name, strategy, fourth) {
  const s = S.create(cfg, { mode: 'default' });
  for (let p = 1; p <= 5; p++) {
    S.beginPlan(s);
    strategy(s, p);
    if (fourth && p >= 4 && s.draft.routes.length) S.assign(s,s.owned,s.draft.routes[0].num);
    if (!S.startRun(s)) throw new Error(`${name} ${p}단계 출발 실패: ${S.validate(s).join(' / ')}`);
    S.finishRun(s); S.nextPhase(s);
  }
  const e = S.endingSummary(s);
  return { name: name + (fourth ? ' +후반 증차 배정' : ''), s, e, plans: s.history.map((h) => h.routeIds.join(' ')) };
}

const aiGoal = (goal) => (s) => { S.chooseGoal(s, goal); S.applyRecommendation(s, A.recommendSync(S.revealed(s), goal)); };
const fixed = (routes) => (s) => setPlan(s, routes.map(R), [0, 4, 8]);

// 결정적 난수(테스트와 무관한 단순 LCG)
let seed = 12345;
const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
function randomRoute(g) {
  for (let tries = 0; tries < 50; tries++) {
    let cur = g.nodes[Math.floor(rnd() * g.nodes.length)];
    const nodes = [cur], len = 2 + Math.floor(rnd() * 4);
    while (nodes.length < len) {
      const nb = G.neighbors(g, cur).filter((x) => !nodes.includes(x));
      if (!nb.length) break;
      cur = nb[Math.floor(rnd() * nb.length)]; nodes.push(cur);
    }
    if (nodes.length < 2) continue;
    const stops = nodes.map((_, i) => i === 0 || i === nodes.length - 1 || rnd() < 0.8);
    return { nodes, stops };
  }
  return null;
}
const randomStrategy = () => (s) => setPlan(s, Array.from({length:S.routeLimit(s)},()=>randomRoute(S.graph(s))), []);

const runs = [];
runs.push(play('빈 시작·전 차량 쉬기', s=>s.draft.buses.forEach(b=>S.assign(s,b.id,null)), false));
runs.push(play('예시: F-C-D-A·B-A-G-E·H-A-D-E', fixed(['F-C-D-A', 'B-A-G-E', 'H-A-D-E']), false));
runs.push(play('예시: B-C-D-A·B-A-G-E·H-A-G', fixed(['B-C-D-A', 'B-A-G-E', 'H-A-G']), false));
runs.push(play('예시: F-C-D-A·B-A-G-E·H-A-G', fixed(['F-C-D-A', 'B-A-G-E', 'H-A-G']), false));
runs.push(play('예시: F-C-D-A·H-A-D-E·B-A-G-E', fixed(['F-C-D-A', 'H-A-D-E', 'B-A-G-E']), true));
for (const goal of ['profit', 'time', 'reach']) for (const f of [false, true]) runs.push(play(`AI ${goal} 매번 수락`, aiGoal(goal), f));
for (let k = 0; k < 50; k++) runs.push(play(`무작위 ${k + 1}`, randomStrategy(), k % 2 === 1));

const pct = (r) => (r == null ? '  -' : String(Math.round(r * 100)).padStart(3));
function rowOf(run) {
  const z = run.e.zones;
  const avgRate = (id) => { const h = z[id].history.filter((x) => x.N > 0); return h.length ? h.reduce((s, x) => s + x.rate, 0) / h.length : null; };
  const maxWait = (id) => Math.max(...z[id].history.map((x) => x.maxWait));
  return { name: run.name, rates: Object.fromEntries(ZONES.map((id) => [id, avgRate(id)])), waits: Object.fromEntries(ZONES.map((id) => [id, maxWait(id)])), balance: run.e.finance.balance,
    subtitles: ZONES.map((id) => z[id].subtitle.kind[0]).join('') };
}
const rows = runs.map(rowOf);

// 고장 판정
const dominates = (a, b) => ZONES.every((id) => (a.rates[id] ?? 0) >= (b.rates[id] ?? 0) && a.waits[id] <= b.waits[id]) && a.balance >= b.balance;
const dominant = rows.filter((a) => rows.every((b) => a === b || dominates(a, b)));
const aiRuns = ['profit', 'time', 'reach'].map((g) => runs.find((r) => r.name === `AI ${g} 매번 수락`));
const sameAI = [0, 1, 2, 3, 4].every((p) => new Set(aiRuns.map((r) => r.plans[p])).size === 1);
const base1 = runs[1].s.history[0].metrics.zones;
const noTension = Object.values(base1).filter((z) => z.N > 0).every((z) => z.rate >= 0.95);
const broken = [
  ['① 늘 우월한 계획', dominant.length > 0, dominant.map((d) => d.name).join(', ') || '없음'],
  ['② 세 AI 목표가 모든 단계에서 같은 계획', sameAI, sameAI ? '같음' : '다름'],
  ['③ 첫 예시 계획 1단계 전 지역 도착 95% 이상', noTension, Object.entries(base1).map(([k, v]) => k + pct(v.rate)).join(' ')]
];

const lines = [];
lines.push(`# 균형 점검 ${cfg.SCENARIO_VERSION} (seed ${cfg.defaultSeed}, 계획 ${runs.length}종)`, '');
lines.push('## 고장 판정 (참이면 사용자 보고 후 대기 — 값 자동 변경 없음)', '');
broken.forEach(([k, v, d]) => lines.push(`- ${v ? '⚠️ 참' : '✓ 거짓'} ${k} — ${d}`));
lines.push('', '## 계획별 요약 (생활권 평균 도착률% / 최장 대기초, 누적 잔액, 소제목 s=안정 i=개선 r=과제)', '');
lines.push('| 계획 | ' + ZONES.join(' | ') + ' | 잔액 | 소제목 |');
lines.push('|---|' + ZONES.map(() => '---').join('|') + '|---|---|');
rows.forEach((r) => lines.push(`| ${r.name} | ` + ZONES.map((id) => `${pct(r.rates[id])}/${r.waits[id]}`).join(' | ') + ` | ${r.balance.toLocaleString()} | ${r.subtitles} |`));
lines.push('', '## AI 목표별 단계 계획', '');
aiRuns.forEach((r) => lines.push(`- ${r.name}: ` + r.plans.map((p, i) => `${i + 1}) ${p}`).join(' · ')));
const out = lines.join('\n');
console.log(out.split('\n').slice(0, 8).join('\n'));
console.log(`... (전체 표 ${rows.length}행)`);
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'docs');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, `sweep-${cfg.SCENARIO_VERSION}.md`), out + '\n');
console.log(`저장: publicness/docs/sweep-${cfg.SCENARIO_VERSION}.md`);
