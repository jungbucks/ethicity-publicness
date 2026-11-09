/* 단계별 생각 쓰기(2026-11-09 테스터 6번 — ‘AI 없이 끝낸 학생은 뭘 배우나’, 사용자 결정 6-A). 결과 화면 문장 틀 두 개, 비워도 되고 점수·진행과 상관없다.
 *  · 「다음 운행 목표」 아래: 이번에 나는 [kept]을/를 먼저 챙겼다. 그 대신 [lost]이/가 손해를 봤다.
 *  · 「AI라면?」 아래: AI는 [aiWhat]을/를 바꾸자고 했다. 나는 [aiView 같은/다른] 생각이다. 왜냐하면 [aiWhy].
 * 저장: 세션 선택 필드 s.stageNotes[단계] = {kept, lost, aiWhat, aiView:'same'|'diff', aiWhy} — 빈 값은 지운다(예전 저장본엔 없음, SCENARIO_VERSION 그대로).
 * 계획 기록: s.planLog[단계] = {routes:[{num, nodes, buses}], resting} — 결과 화면에서 출발한 계획(draft) 그대로. 엔딩 보고서가 노선을 색 이름으로 부르려고(history.plan엔 노선 번호가 없다). */
(function (root) {
  'use strict';
  var FIELDS = ['kept', 'lost', 'aiWhat', 'aiView', 'aiWhy'], VIEWS = { same: '같은 생각', diff: '다른 생각' }, MAX = 200, EMPTY = '(쓰지 않음)';
  function get(s, phase) {
    var n = (s && s.stageNotes && s.stageNotes[phase]) || {}, o = {};
    FIELDS.forEach(function (f) { o[f] = typeof n[f] === 'string' ? n[f] : ''; });
    return o;
  }
  function set(s, phase, field, value) {
    if (FIELDS.indexOf(field) < 0) throw new Error('unknown field ' + field);
    var v = value == null ? '' : String(value).slice(0, MAX);
    if (field === 'aiView' && !VIEWS[v]) v = '';
    var all = s.stageNotes || {}, n = all[phase] || {};
    if (v.trim()) n[field] = v; else delete n[field];
    if (Object.keys(n).length) all[phase] = n; else delete all[phase];
    if (Object.keys(all).length) s.stageNotes = all; else delete s.stageNotes;
    return all[phase] || null;
  }
  // 받침에 맞는 조사 한 글자. 비었거나 끝 글자가 한글이 아니면 ‘을(를)’ 꼴
  function particle(word, kind) {
    var w = String(word || '').trim(), p = { '을를': ['을', '를'], '이가': ['이', '가'] }[kind], c = w.charCodeAt(w.length - 1);
    if (!p) return '';
    if (!w || !(c >= 0xac00 && c <= 0xd7a3)) return p[0] + '(' + p[1] + ')';
    return (c - 0xac00) % 28 ? p[0] : p[1];
  }
  function blank(v, kind) { var w = String(v || '').trim(); return w ? w + particle(w, kind) : EMPTY; }
  function reason(v) { var w = String(v || '').trim().replace(/[.。]+$/, ''); return w || EMPTY; }
  // 보고서 문장 — 학생이 쓴 것만. 문장 틀 하나가 통째로 비었으면 ‘(쓰지 않음)’ 한 마디
  function sentences(note) {
    var n = note || {}, has = function (keys) { return keys.some(function (k) { return String(n[k] || '').trim(); }); };
    var mine = has(['kept', 'lost']) ? '이번에 나는 ' + blank(n.kept, '을를') + ' 먼저 챙겼다. 그 대신 ' + blank(n.lost, '이가') + ' 손해를 봤다.' : EMPTY;
    var ai = has(['aiWhat', 'aiView', 'aiWhy']) ? 'AI는 ' + blank(n.aiWhat, '을를') + ' 바꾸자고 했다. 나는 ' + (VIEWS[n.aiView] ? VIEWS[n.aiView] + '이다.' : '(고르지 않음).') + ' 왜냐하면 ' + reason(n.aiWhy) + '.' : EMPTY;
    return { mine: mine, ai: ai };
  }
  function routesOf(draft) {
    var buses = (draft && draft.buses) || [];
    return {
      routes: ((draft && draft.routes) || []).filter(function (r) { return r.nodes && r.nodes.length >= 2; }).map(function (r) {
        return { num: r.num, nodes: r.nodes.slice(), buses: buses.filter(function (b) { return b.routeNum === r.num; }).length };
      }),
      resting: buses.filter(function (b) { return b.routeNum == null; }).length
    };
  }
  function logPlan(s, phase, draft) { s.planLog = s.planLog || {}; s.planLog[phase] = routesOf(draft); return s.planLog[phase]; }
  // 보고서용 계획: 기록이 있으면 그대로, 없으면(이 기능 전에 한 단계) history.plan의 버스 노선을 묶는다. 색 번호는 지금 초안에 같은 정류장 노선이 있을 때만
  function planOf(s, h) {
    if (s.planLog && s.planLog[h.phase]) return s.planLog[h.phase];
    var out = [], resting = 0, now = (s.draft && s.draft.routes) || [];
    ((h.plan && h.plan.buses) || []).forEach(function (b) {
      if (!b.route || !b.route.nodes || b.route.nodes.length < 2) { resting++; return; }
      var key = b.route.nodes.join('-'), r = out.filter(function (x) { return x.nodes.join('-') === key; })[0];
      if (r) { r.buses++; return; }
      var same = now.filter(function (x) { return x.nodes && x.nodes.join('-') === key; })[0];
      out.push({ num: same ? same.num : null, nodes: b.route.nodes.slice(), buses: 1 });
    });
    return { routes: out, resting: resting };
  }
  var api = { FIELDS: FIELDS, VIEWS: VIEWS, EMPTY: EMPTY, get: get, set: set, particle: particle, sentences: sentences, logPlan: logPlan, planOf: planOf };
  root.PB = root.PB || {}; root.PB.StageNotes = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
