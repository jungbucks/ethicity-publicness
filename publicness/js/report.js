/* 엔딩 ‘내 운영 보고서’(2026-11-09 테스터 6번, 사용자 결정 — 투명성 편처럼 인쇄·PDF). 화면 그리기는 ui-report.js, 여기는 내용만(순수).
 * 내용: 모드·날짜·끝난 모습 / 단계마다 내 계획(노선 색 이름 + 정류장 + 버스 수) · 이미 계산된 숫자(도착률·목적지까지 못 간 이동·최장 대기·수지·주요 인물 기준 충족)
 *       · 고른 다음 운행 목표 · 문장 틀 답(js/stage-notes.js) / 마지막 소감(finalReflection). 빈 답은 ‘(쓰지 않음)’.
 * AI 제안 내용(aiCards·lastRec)은 넣지 않는다 — 학생이 직접 쓴 것과 실제 결과만. 이름은 여기서 다루지 않는다(화면 입력 칸에만, 저장 안 함). */
(function (root) {
  'use strict';
  function notes() { return (root.PB && root.PB.StageNotes) || (typeof require === 'function' ? require('./stage-notes.js') : null); }
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
  function numbers(h, f) {
    var m = h.metrics, rs = h.residents || {}, ids = Object.keys(rs).filter(function (id) { return rs[id]; }), ok = ids.filter(function (id) { return rs[id].satisfied; }).length;
    var out = [['도착률', f.rate(m.arrivalRate) + ' (' + m.N + '건 중 ' + m.arrived + '건)'], ['목적지까지 못 간 이동', (m.N - m.arrived) + '건'], ['최장 대기', f.duration(m.maxWait)], ['단계 수지', signed(f, m.costs.total)]];
    if (ids.length) out.push(['주요 인물 기준 충족', ids.length + '명 중 ' + ok + '명']);
    return out;
  }
  function endText(s, f, bal) {
    var e = s.end || {};
    var head = e.cause === 'bankrupt' ? '파산 — 학기 말 잔액이 0원 미만이에요' : e.cause === 'contract' ? '운영 계약 종료(' + e.phase + '단계)' : '한 학기 운행을 마쳤어요';
    return head + ' · 누적 잔액 ' + signed(f, bal);
  }
  function build(s, f) {
    var NT = notes(), phases = (s.config && s.config.phases) || [], hist = s.history || [], bal = hist.reduce(function (a, h) { return a + h.metrics.costs.total; }, 0);
    var mode = s.mode === 'random' ? '랜덤 세팅 · 번호 ' + s.seed : s.mode === 'fixed' ? '지정 세팅 · 번호 ' + s.seed : '기본 세팅';
    var fin = typeof s.finalReflection === 'string' ? s.finalReflection.trim() : '';
    return {
      title: '내 운영 보고서', game: '이번 정류장은… · AI 마을버스 운영단',
      meta: { mode: mode, date: dateText(f.date || new Date()), end: endText(s, f, bal), stages: phases.length + '단계 중 ' + hist.length + '단계 운행' },
      stages: hist.map(function (h) {
        var said = NT.sentences(NT.get(s, h.phase)), pick = (s.choices || {})[h.phase];
        return { phase: h.phase, title: h.phase + '단계 · ' + (phases[h.phase - 1] || ''), plan: planLines(s, h, f), numbers: numbers(h, f),
          goal: pick && f.choices[pick] ? f.choices[pick] : '(고르지 않음)', mine: said.mine, ai: said.ai };
      }),
      final: { prompt: '처음과 비교해 누구의 이동을 더 살피게 되었나요?', text: fin || EMPTY }
    };
  }
  // PDF 기본 파일 이름(인쇄하는 동안만 문서 제목으로) — 이름은 저장하지 않는다
  function fileName(name, d) {
    var n = String(name || '').trim().replace(/[\\/:*?"<>|\s]+/g, '_');
    return ['공공성_보고서', n, stamp(d || new Date())].filter(Boolean).join('_');
  }
  var api = { build: build, fileName: fileName, EMPTY: EMPTY };
  root.PB = root.PB || {}; root.PB.Report = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
