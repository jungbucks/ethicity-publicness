/* 필수 선택(2026-11-10): 3단계 청원 답(반영·지금은 어려워요)과 4단계 어르신 무임 정책(유지·폐지).
 * 저장: s.petitionReply = {zone, choice, why?}, s.elderPolicy = {phase:4, choice, why?}. 출발 막기는 UI가 required()로 한다(Session.validate는 건드리지 않는다).
 *
 * 2026-11-12 교사 랜덤 검토 4번 — 사건 청원도 고정 청원과 같은 흐름:
 *  · 청원 목록 list(s) = 2단계 고정 청원(s.fixedPetition) + 사건으로 생긴 청원(history[n].petition, fixed 아님). 사건 청원은 기본 모드(5단계·시드 42)에는
 *    넣지 않는다 — 기본 모드의 사건·흐름을 바꾸지 말라는 지시(그 모드의 3단계 사건 청원은 전처럼 결과에만 보임).
 *  · 청원이 생긴 다음 단계 계획에서 답한다(반영한다 / 이번엔 못 한다 + 이유). 마지막 단계에 생긴 청원은 답할 단계가 없다.
 *  · 저장: 사건 청원 답 = 새 선택 필드 s.petitionReplies[답하는 단계] = {zone, phase(청원이 생긴 단계), choice, why?}. 고정 청원 답은 예전처럼 s.petitionReply.
 *  · 청원 지표(그 뒤 화면·보고서·금배지가 모두 같은 값) = 하루 끝 기준 ‘그 동네에서 출발해 목적지까지 못 간 이동’ = rideLog[zone].requests − arrived.
 *    금배지 = 측정할 수 있는 청원마다 다음 단계에 줄었거나 0건을 지켰으면(늘거나 같은 0이 아닌 건수면 아직), 여러 번이면 모두. */
(function (root) {
  'use strict';
  var MAX = 200;
  var KINDS = {
    petition: { phase: 3, field: 'petitionReply', values: ['reflect', 'not-now'] },
    elder: { phase: 4, field: 'elderPolicy', values: ['keep', 'abolish'] }
  };
  function eventsOn(s) { return !!s && !!s.mode && s.mode !== 'default'; }
  function phasesOf(s) { return s && s.config && s.config.phases ? s.config.phases.length : Infinity; }
  // 모든 청원(생긴 단계 순). answer = 답하는 단계(마지막 단계에 생긴 청원은 phasesOf 밖 → 답 없음)
  function list(s) {
    var out = [], fp = s && s.fixedPetition;
    if (fp) out.push({ kind: 'fixed', phase: fp.phase, answer: fp.phase + 1, zone: fp.zone, t: fp.t, count: fp.count, total: fp.total, reply: s.petitionReply || null });
    if (eventsOn(s)) (s.history || []).forEach(function (h) {
      var p = h && h.petition; if (!p || p.fixed || (fp && h.phase === fp.phase)) return;
      out.push({ kind: 'event', phase: h.phase, answer: h.phase + 1, zone: p.zone, t: p.t, count: p.count, total: p.total, reply: (s.petitionReplies || {})[h.phase + 1] || null });
    });
    return out.sort(function (a, b) { return a.phase - b.phase; });
  }
  // 이 단계 계획에서 답할 청원(없으면 null)
  function petitionFor(s, phase) {
    if (phase > phasesOf(s)) return null;
    return list(s).filter(function (p) { return p.answer === phase; })[0] || null;
  }
  function get(s, kind) {
    if (kind === 'elder') return s.elderPolicy || null;
    var p = petitionFor(s, s.phase);
    return p ? p.reply : (s.petitionReply || null);
  }
  function set(s, kind, key, value) {
    var k = KINDS[kind];
    if (!k || (key !== 'choice' && key !== 'why')) return null;
    var pf = kind === 'petition' ? petitionFor(s, s.phase) : null, ev = !!pf && pf.kind === 'event';
    var cur = ev ? ((s.petitionReplies || {})[s.phase] || null) : (s[k.field] || null), v;
    if (key === 'choice' && k.values.indexOf(value) < 0) return cur;
    if (!cur && key === 'why' && !String(value == null ? '' : value).trim()) return null;
    if (!cur) cur = ev ? { zone: pf.zone, phase: pf.phase } : kind === 'petition' ? { zone: s.fixedPetition ? s.fixedPetition.zone : null } : { phase: k.phase };
    if (key === 'choice') cur.choice = value;
    else {
      v = value == null ? '' : String(value).slice(0, MAX);
      if (v.trim()) cur.why = v; else delete cur.why;
    }
    if (ev) { s.petitionReplies = s.petitionReplies || {}; s.petitionReplies[s.phase] = cur; }
    else s[k.field] = cur;
    return cur;
  }
  function required(s) {
    var out = [], pf = petitionFor(s, s.phase);
    if (pf && !(pf.reply && pf.reply.choice)) out.push('petition');
    if (s.phase === KINDS.elder.phase && s.config && s.config.elderFree && !(s.elderPolicy && s.elderPolicy.choice)) out.push('elder');
    return out;
  }
  /* 청원 지표 하나(하루 끝 기준): 그 동네에서 출발해 목적지까지 못 간 이동. rideLog가 없는 단계(예전 저장본·아직 안 달린 단계)는 null */
  function logAt(s, phase) { var h = (s.history || []).filter(function (x) { return x.phase === phase; })[0]; return h && h.rideLog ? h.rideLog : null; }
  function missed(s, phase, zone) {
    var log = logAt(s, phase); if (!log) return null;
    var z = log[zone]; return { requests: z ? z.requests : 0, failed: z ? z.requests - z.arrived : 0, rode: z ? z.rode : 0 };
  }
  // 청원 하나의 그 뒤: before(청원이 생긴 단계)·after(답한 다음 단계) · verdict = 'down'|'zero'(0 → 0)|'same'|'up' · ok = 줄었거나 0을 지킴
  function outcome(s, p) {
    var a = missed(s, p.phase, p.zone), b = missed(s, p.answer, p.zone); if (!a || !b) return null;
    var v = b.failed < a.failed ? 'down' : b.failed > a.failed ? 'up' : a.failed === 0 ? 'zero' : 'same';
    return { before: a, after: b, verdict: v, ok: v === 'down' || v === 'zero' };
  }
  // 금배지 판정: 측정할 수 있는 청원이 하나 이상이고 모두 ok
  function badge(s) {
    var rows = list(s).map(function (p) { return outcome(s, p); }).filter(Boolean);
    return rows.length > 0 && rows.every(function (r) { return r.ok; });
  }
  var api = { KINDS: KINDS, set: set, get: get, required: required, list: list, petitionFor: petitionFor, missed: missed, outcome: outcome, badge: badge };
  root.PB = root.PB || {};
  root.PB.Choices = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
