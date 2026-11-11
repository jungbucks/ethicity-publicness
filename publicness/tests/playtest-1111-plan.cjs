/* 2026-11-11 플레이테스트 검사용 ‘무난한 노선’ — tools/econ-review.cjs의 균형(balanced) 기본 5단계 계획과 같다(시드 42에서 단계마다 흑자, 학기 말 잔액 약 23만 원).
 *  PLAN[단계-1] = [[정류장 목록, 버스 수], …]
 *  lay(s)          — 지금 단계 초안에 그 단계 계획을 깐다(노선 번호 1부터, 버스는 쉬는 버스에서 차례로)
 *  playTo(phase, opts) — 기본 세션을 phase단계 결과 화면(stage 'result')까지. opts.petition·opts.elder = 3·4단계 선택(기본 reflect·keep)
 * 브라우저 검사(tests/playtest-1111-browser.mjs)도 같은 PLAN을 쓴다 */
const cfg = require('../js/config.js'), S = require('../js/session.js'), C = require('../js/choices.js');
const PLAN = [
  [[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1]],
  [[['F', 'C', 'B', 'A'], 1], [['D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]],
  [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 1], [['E', 'H', 'A'], 1]],
  [[['F', 'C', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1]],
  [[['F', 'K', 'B', 'A'], 2], [['I', 'D', 'A', 'G'], 2], [['J', 'E', 'H', 'B'], 1], [['B', 'C'], 1]]
];
function lay(s) {
  S.beginPlan(s); s.draft.routes = []; s.draft.buses.forEach((b) => { b.routeNum = null; });
  PLAN[s.phase - 1].forEach(([nodes, n], i) => {
    s.draft.routes.push({ num: i + 1, nodes: nodes.slice(), stops: nodes.map(() => true), autoPlaced: true });
    for (let k = 0; k < n; k++) { const b = s.draft.buses.filter((x) => x.routeNum == null)[0]; if (b) b.routeNum = i + 1; }
  });
}
function playTo(phase, opts) {
  opts = opts || {}; const s = S.create(cfg);
  for (;;) {
    lay(s);
    if (s.phase === 3) C.set(s, 'petition', 'choice', opts.petition || 'reflect');
    if (s.phase === 4) C.set(s, 'elder', 'choice', opts.elder || 'keep');
    if (!S.startRun(s)) throw new Error('출발 실패 ' + s.phase + ': ' + JSON.stringify(S.validate(s)));
    S.finishRun(s);
    if (s.phase >= phase) return s;
    S.nextPhase(s);
  }
}
module.exports = { PLAN, lay, playTo };
