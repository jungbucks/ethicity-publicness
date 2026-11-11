/* 엔딩 ‘내 운영 보고서’(2026-11-09 테스터 6번, 사용자 결정 — 투명성 편처럼 인쇄·PDF). 화면 그리기는 ui-report.js, 여기는 내용만(순수).
 * 내용: 모드·날짜·끝난 모습 / 단계마다 내 계획(노선 색 이름 + 정류장 + 버스 수) · 이미 계산된 숫자(실제로 생긴 요청의 도착률·못 간 이동 / 평가 대상 이동 수요 충족·못 마친 이동과 사유 / 버스를 탄 사람의 최장 대기·수지·주요 인물 기준 충족)
 *       · 고른 다음 운행 목표 · 문장 틀 답(js/stage-notes.js) / 마지막 소감(finalReflection). 빈 답은 ‘(쓰지 않음)’.
 * AI 제안 내용(aiCards·lastRec)은 넣지 않는다 — 학생이 직접 쓴 것과 실제 결과만. 이름은 여기서 다루지 않는다(화면 입력 칸에만, 저장 안 함). */
(function (root) {
  'use strict';
  function notes() { return (root.PB && root.PB.StageNotes) || (typeof require === 'function' ? require('./stage-notes.js') : null); }
  function lib(name, file) { return (root.PB && root.PB[name]) || (typeof require === 'function' ? require(file) : null); }
  var EMPTY = '(쓰지 않음)';
  function dateText(d) { return d.getFullYear() + '년 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function stamp(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
  function signed(f, n) { return (Math.round(n) > 0 ? '+' : '') + f.won(n); }
  function routeLine(f, r, i) {
    var loop = r.nodes.length > 2 && r.nodes[0] === r.nodes[r.nodes.length - 1], ns = loop ? r.nodes.slice(0, -1) : r.nodes;
    return (r.num != null ? f.route(r.num) : '노선 ' + (i + 1)) + ': ' + ns.map(f.name).join(' → ') + (loop ? ' (순환)' : '') + ' · 버스 ' + r.buses + '대';
  }
  function planLines(s, h, f) {
    var p = notes().planOf(s, h), out = p.routes.map(function (r, i) { return routeLine(f, r, i); });
    if (!out.length) out.push('노선 없음');
    if (p.resting) out.push('대기 버스 ' + p.resting + '대');
    return out;
  }
  /* 평가 대상 이동 수요(2026-11-10 검토 2번). h.scores.mobility를 그대로 옮긴다 — 새로 계산하지 않는다.
   * 못 마친 이동을 세 갈래로: tried = 정류장에 나왔지만 못 마침(노선 없음·만차·운행 종료) · stayHome = 무임 폐지로 집에 머묾 · notStarted = 첫 이동을 못 마치거나 늦어 생기지 않은 돌아오는 이동.
   * 점수 기록이 없는 단계(예전 저장본)·평가할 수요가 없는 단계는 null */
  function evalOf(h) {
    var m = h.scores && h.scores.mobility; if (!m || !m.N) return null;
    var r = m.reasons || {}, n = function (k) { return r[k] || 0; };
    return { N: m.N, done: m.done, score: m.score, missed: m.N - m.done, tried: n('noLink') + n('full') + n('time'), stayHome: n('stayHome'), notStarted: n('parentFailed') + n('lateParent') };
  }
  function missedText(e) {
    var parts = [];
    if (e.tried) parts.push('정류장에 나왔지만 못 마친 이동 ' + e.tried + '건');
    if (e.stayHome) parts.push('무임 폐지로 집에 머문 이동 ' + e.stayHome + '건');
    if (e.notStarted) parts.push('첫 이동을 못 마치거나 늦어서 시작하지 못한 돌아오는 이동 ' + e.notStarted + '건');
    return e.missed + '건' + (e.stayHome || e.notStarted ? ' (' + parts.join(' · ') + ')' : '');
  }
  var SCOPE = '‘실제로 생긴 이동 요청’은 운행 중 정류장에 나온 요청만 세요. ‘평가 대상’은 계획과 상관없이 그날 필요했던 이동을 세서, 버스를 타지 않고 집에 머문 이동과 시작하지 못한 돌아오는 이동도 들어가요. 운행 종료 직전이라 어떤 계획으로도 도착할 수 없는 이동은 평가 대상에서 빼요.';
  function numbers(h, f, e) {
    var m = h.metrics, rs = h.residents || {}, ids = Object.keys(rs).filter(function (id) { return rs[id]; }), ok = ids.filter(function (id) { return rs[id].satisfied; }).length;
    var out = [['실제로 생긴 이동 요청의 도착률', f.rate(m.arrivalRate) + ' (' + m.N + '건 중 ' + m.arrived + '건)'], ['그중 목적지까지 못 간 이동', (m.N - m.arrived) + '건']];
    if (e) out.push(['이동 수요 충족(평가 대상)', e.score + '점 (' + e.N + '건 중 ' + e.done + '건 완료)', 'wide'], ['평가 대상 중 못 마친 이동', missedText(e), 'wide']); /* 셋째 칸 wide = 화면에서 한 줄을 다 씀 */
    out.push(['버스를 탄 사람의 최장 대기', f.duration(m.maxWait)], ['단계 수지', signed(f, m.costs.total)]);
    if (ids.length) out.push(['주요 인물 기준 충족', ids.length + '명 중 ' + ok + '명']);
    return out;
  }
  function endText(s, f, bal) {
    var e = s.end || {};
    var head = e.cause === 'bankrupt' ? '파산 — 학기 말 잔액이 0원 미만이에요' : e.cause === 'contract' ? '운영 계약 종료(' + e.phase + '단계)' : '한 학기 운행을 마쳤어요';
    return head + ' · 누적 잔액 ' + signed(f, bal);
  }
  function logOf(s, phase) { var h = (s.history || []).filter(function (x) { return x.phase === phase; })[0]; return h && h.rideLog ? h.rideLog : null; }
  function why(o) { return o && typeof o.why === 'string' && o.why.trim() ? o.why.trim() : EMPTY; }
  var PET = { reflect: '반영한다', 'not-now': '이번엔 못 한다' }, ELD = { keep: '유지', abolish: '폐지' };
  function choices(s, f) {
    var out = { petition: null, elder: null }, fp = s.fixedPetition, pr = s.petitionReply, ep = s.elderPolicy;
    if (fp && pr && PET[pr.choice]) {
      var a = logOf(s, 2), b = logOf(s, 3), za = a && a[fp.zone], zb = b && b[fp.zone];
      out.petition = fp.phase + '단계 ' + f.name(fp.zone) + ' 주민 청원 · ' + (fp.phase + 1) + '단계 답 → ' + PET[pr.choice] + ' · 이유: ' + why(pr) +
        (za && zb ? ' · 못 간 이동 ' + (za.requests - za.arrived) + '건 → ' + (zb.requests - zb.arrived) + '건' : '');
    }
    if (ep && ELD[ep.choice]) out.elder = (ep.phase || 4) + '단계 어르신 무임승차 ' + ELD[ep.choice] + ' · 이유: ' + why(ep);
    return out;
  }
  /* 금배지 5개(고정 순서). 정책 내용(유지·폐지, 반영·못 함)은 조건에 쓰지 않는다 */
  function badges(s) {
    var cfg = s.config || {}, hist = s.history || [], RL = lib('RideLog', './ride-log.js'), NR = lib('Narrative', './narrative.js'), rx = [];
    try { rx = NR.endingReactions(cfg, hist); } catch (e) { rx = []; }
    var record = hist.some(function (h) {
      if (!h.rideLog) return false;
      var zones = Object.keys(h.rideLog), r = RL.ratios(cfg, h.phase, logOf(s, h.phase - 1), zones);
      return zones.some(function (z) { return r[z] === 0 && h.rideLog[z].rode > 0; });
    });
    var petition = false, fp = s.fixedPetition;
    if (fp) { var a = logOf(s, 2), b = logOf(s, 3), za = a && a[fp.zone], zb = b && b[fp.zone]; petition = !!(za && zb && za.requests > 0 && zb.requests > 0 && (zb.requests - zb.arrived) / zb.requests < (za.requests - za.arrived) / za.requests); }
    var typed = function (o) { return !!(o && typeof o.why === 'string' && o.why.trim()); };
    var reasons = typed(s.elderPolicy) && (!fp || typed(s.petitionReply));
    return [
      { id: 'residents', label: '주요 인물 모두 만족', earned: rx.length > 0 && rx.every(function (r) { return r.satisfied; }) },
      { id: 'petition', label: '청원한 동네의 못 간 이동을 줄였어요', earned: petition },
      { id: 'record', label: '기록이 없던 동네에 탑승 기록을 만들었어요', earned: record },
      { id: 'reasons', label: '두 선택 모두 이유를 적었어요', earned: reasons },
      { id: 'solvent', label: '파산·계약 종료 없이 학기를 마쳤어요', earned: !!(s.end && s.end.cause === 'complete') }
    ];
  }
  function build(s, f) {
    var NT = notes(), phases = (s.config && s.config.phases) || [], hist = s.history || [], bal = hist.reduce(function (a, h) { return a + h.metrics.costs.total; }, 0);
    var mode = s.mode === 'random' ? '랜덤 세팅 · 번호 ' + s.seed : s.mode === 'fixed' ? '지정 세팅 · 번호 ' + s.seed : '기본 세팅';
    var fin = typeof s.finalReflection === 'string' ? s.finalReflection.trim() : '';
    return {
      title: '내 운영 보고서', game: '이번 정류장은… · AI 마을버스 운영단',
      meta: { mode: mode, date: dateText(f.date || new Date()), end: endText(s, f, bal), stages: phases.length + '단계 중 ' + hist.length + '단계 운행' },
      stages: hist.map(function (h) {
        var said = NT.sentences(NT.get(s, h.phase)), pick = (s.choices || {})[h.phase], e = evalOf(h);
        return { phase: h.phase, title: h.phase + '단계 · ' + (phases[h.phase - 1] || ''), plan: planLines(s, h, f), numbers: numbers(h, f, e), eval: e,
          goal: pick && f.choices[pick] ? f.choices[pick] : '(고르지 않음)', mine: said.mine, ai: said.ai };
      }),
      choices: choices(s, f), badges: badges(s), scope: hist.some(evalOf) ? SCOPE : null,
      final: { prompt: '처음과 비교해 누구의 이동을 더 살피게 되었나요?', text: fin || EMPTY }
    };
  }
  // PDF 기본 파일 이름(인쇄하는 동안만 문서 제목으로) — 이름은 저장하지 않는다
  function fileName(name, d) {
    var n = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
    return ['공정성포용성_보고서', n, stamp(d || new Date())].filter(Boolean).join('_');
  }
  var api = { build: build, badges: badges, fileName: fileName, EMPTY: EMPTY };
  root.PB = root.PB || {}; root.PB.Report = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
