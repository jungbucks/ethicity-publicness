/* 공정성·포용 개편(2026-11-10) 테스트 공용 도우미. 세션을 단계까지 몰고 가서 정산한다.
 *  playTo(sessionOrConfig, phase, plan) — 설정을 주면 새 기본 세션을 만들고, 세션을 주면 그대로 쓴다. 1~phase 단계를 plan으로 운행·정산하고 phase단계 결과 화면(stage 'result')에 멈춘다(다음 단계는 S.nextPhase로).
 *  runAndFinish(s, plan)               — 지금 단계(plan·reveal 화면)에 plan 노선을 깔고 출발·정산해 history 항목(entry)을 돌려준다. entry 말고 쓰는 곳을 위해 entry.metrics·scores·elder가 들어 있다.
 *  balancedPlan                        — 5단계까지 잔액이 늘어 지급 능력이 되는 계획(F–C–D–A, B–A–G–E, H–A–G, A–I; 8단계 seed 7에서도 계약 종료 없이 끝까지 감).
 *  withF                               — F–C–D–A + B–A–G–E (외곽 F를 잇는다).
 *  withoutF                            — B–A–G–E + A–D (F를 뺀다).
 *  plan 모양: [{ nodes: [...], buses: n }]. 버스는 노선 순서대로 쉬는 버스에 한 대씩 배정하고, 남는 버스는 앞 노선부터 보탠다(노선에 닿지 않는 버스는 쉰다). */
const cfg = require('../js/config.js'), S = require('../js/session.js');
const R = (...ids) => ids;
const balancedPlan = [{ nodes: R('F', 'C', 'D', 'A'), buses: 1 }, { nodes: R('B', 'A', 'G', 'E'), buses: 1 }, { nodes: R('H', 'A', 'G'), buses: 1 }, { nodes: R('A', 'I'), buses: 1 }];
const withF = [{ nodes: R('F', 'C', 'D', 'A'), buses: 1 }, { nodes: R('B', 'A', 'G', 'E'), buses: 1 }];
const withoutF = [{ nodes: R('B', 'A', 'G', 'E'), buses: 1 }, { nodes: R('A', 'D'), buses: 1 }];
function lay(s, plan) {
  S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  const vis = new Set(S.visibleNodeIds(s)), free = () => s.draft.buses.filter((b) => b.routeNum == null);
  plan.forEach((p) => { const nodes = p.nodes.filter((n) => vis.has(n)); if (nodes.length < 2) return; const r = S.addRoute(s, { nodes, stops: nodes.map(() => true) }); for (let i = 0; i < (p.buses || 1) && free().length; i++) S.assign(s, free()[0].id, r.num); });
  const spare = s.draft.routes.filter((r) => r.nodes.length >= 2);
  free().forEach((b, i) => { if (spare.length) S.assign(s, b.id, spare[i % spare.length].num); });
}
function runAndFinish(s, plan) {
  if (s.stage !== 'plan') lay(s, plan); else { s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; }); lay(s, plan); }
  if (!S.startRun(s)) throw new Error('출발 실패: ' + JSON.stringify(S.validate(s)));
  return S.finishRun(s);
}
function playTo(sessionOrConfig, phase, plan) {
  const s = sessionOrConfig && sessionOrConfig.history ? sessionOrConfig : S.create(sessionOrConfig || cfg);
  while (s.history.length < phase) { if (s.history.length) { if (!S.nextPhase(s) || s.stage === 'ending') throw new Error('단계 진행 실패'); } runAndFinish(s, plan); }
  return s;
}
/* finishedSession({petition, elder, whyBoth, plan}) — 기본 세팅 5단계를 plan(기본 balancedPlan)으로 끝까지. 3단계 시작에 청원 답, 4단계 시작에 무임 정책을 넣는다(없으면 안 넣음). */
function finishedSession(o) {
  o = o || {}; const C = require('../js/choices.js'), plan = o.plan || balancedPlan, s = playTo(cfg, 2, plan);
  const why = (k) => (o.whyBoth || o['why_' + k]) ? '이유 ' + k : '';
  S.nextPhase(s); if (o.petition) { C.set(s, 'petition', 'choice', o.petition); if (why('petition')) C.set(s, 'petition', 'why', why('petition')); } runAndFinish(s, plan);
  S.nextPhase(s); if (o.elder) { C.set(s, 'elder', 'choice', o.elder); if (why('elder')) C.set(s, 'elder', 'why', why('elder')); } runAndFinish(s, plan);
  while (s.phase < s.config.phases.length) { S.nextPhase(s); runAndFinish(s, plan); }
  S.nextPhase(s); /* 마지막 단계 뒤 엔딩 — s.end 확정 */
  return s;
}
module.exports = { playTo, runAndFinish, balancedPlan, withF, withoutF, finishedSession };
