/* 필수 선택(2026-11-10): 3단계 청원 답(반영·지금은 어려워요)과 4단계 어르신 무임 정책(유지·폐지).
 * 저장: s.petitionReply = {zone, choice, why?}, s.elderPolicy = {phase:4, choice, why?}. 출발 막기는 UI가 required()로 한다(Session.validate는 건드리지 않는다). */
(function (root) {
  'use strict';
  var MAX = 200;
  var KINDS = {
    petition: { phase: 3, field: 'petitionReply', values: ['reflect', 'not-now'] },
    elder: { phase: 4, field: 'elderPolicy', values: ['keep', 'abolish'] }
  };
  function set(s, kind, key, value) {
    var k = KINDS[kind];
    if (!k || (key !== 'choice' && key !== 'why')) return null;
    var cur = s[k.field] || null, v;
    if (key === 'choice' && k.values.indexOf(value) < 0) return cur;
    if (!cur && key === 'why' && !String(value == null ? '' : value).trim()) return null;
    if (!cur) cur = kind === 'petition' ? { zone: s.fixedPetition ? s.fixedPetition.zone : null } : { phase: k.phase };
    if (key === 'choice') cur.choice = value;
    else {
      v = value == null ? '' : String(value).slice(0, MAX);
      if (v.trim()) cur.why = v; else delete cur.why;
    }
    s[k.field] = cur;
    return cur;
  }
  function required(s) {
    var out = [];
    if (s.phase === KINDS.petition.phase && s.fixedPetition && !(s.petitionReply && s.petitionReply.choice)) out.push('petition');
    if (s.phase === KINDS.elder.phase && s.config && s.config.elderFree && !(s.elderPolicy && s.elderPolicy.choice)) out.push('elder');
    return out;
  }
  var api = { KINDS: KINDS, set: set, required: required };
  root.PB = root.PB || {};
  root.PB.Choices = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
