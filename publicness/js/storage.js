/*
 * 저장 키
 *   ethicity.player            읽기만(팀 공통) — {"character":"…","nickname":"…"}
 *   ethicity.result.publicness 결말 도달 시 쓰기(팀 공통) — {"game":"publicness","completed":true,"ending":null,"card":"…"}
 *   ethicity.publicness.sound  효과음 끔/켬('0'/'1'). 없으면 켜짐
 *   ethicity.publicness.speed  운행 재생 배속(1·2). 없으면 1, 예전 값 4는 2로 바꿔 둔다
 *   ethicity.publicness.save   진행 자동 저장 {version, savedAt, session} — 시나리오 버전이 다르면 버린다
 *   ethicity.publicness.busHint 첫 버스 끌어 놓기 안내를 봤는지('1') — ui-map-plan.js가 직접 읽고 쓴다
 * 저장소가 막혔거나 손상됐으면 조용히 건너뛴다.
 */
(function (root) {
  'use strict';
  var RESULT_KEY = 'ethicity.result.publicness';

  function store(s) {
    if (s) return s;
    try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; } catch (e) { return null; }
  }

  function readPlayer(s) {
    try {
      var st = store(s);
      if (!st) return null;
      var raw = st.getItem('ethicity.player');
      if (!raw) return null;
      var o = JSON.parse(raw);
      if (!o || typeof o.nickname !== 'string' || !o.nickname.trim()) return null;
      return { nickname: o.nickname.trim() };
    } catch (e) { return null; }
  }

  function writeResult(card, s) {
    try {
      var st = store(s);
      if (!st) return false;
      st.setItem(RESULT_KEY, JSON.stringify({ game: 'publicness', completed: true, ending: null, card: card }));
      return true;
    } catch (e) { return false; }
  }

  var SOUND_KEY = 'ethicity.publicness.sound';
  function readSound(s) { try { var st = store(s); return !st || st.getItem(SOUND_KEY) !== '0'; } catch (e) { return true; } }
  function writeSound(on, s) { try { var st = store(s); if (st) st.setItem(SOUND_KEY, on ? '1' : '0'); } catch (e) { /* 기억 못 해도 이번 창에서는 적용 */ } }

  // 고르는 배속은 1·2(2026-10-27 — 4×는 ‘⏭ 다음 결정까지’로 바뀜). 예전에 저장된 4는 2로 바꿔 다시 저장한다
  var SPEED_KEY = 'ethicity.publicness.speed', SPEEDS = [1, 2];
  function readSpeed(s) {
    try {
      var st = store(s); if (!st) return 1;
      var v = Number(st.getItem(SPEED_KEY));
      if (v === 4) { v = 2; try { st.setItem(SPEED_KEY, '2'); } catch (e) { /* 이번 창에서만 2 */ } }
      return SPEEDS.indexOf(v) >= 0 ? v : 1;
    } catch (e) { return 1; }
  }
  function writeSpeed(v, s) { try { var st = store(s); if (st && SPEEDS.indexOf(v) >= 0) st.setItem(SPEED_KEY, String(v)); } catch (e) { /* 이번 창에서만 적용 */ } }

  var SAVE_KEY = 'ethicity.publicness.save';
  function writeSave(data, s) { try { var st = store(s); if (!st) return false; st.setItem(SAVE_KEY, JSON.stringify(data)); return true; } catch (e) { return false; } }
  function readSave(version, s) {
    try { var st = store(s), raw = st && st.getItem(SAVE_KEY); if (!raw) return null; var o = JSON.parse(raw);
      return o && o.version === version && o.session ? o : null; } catch (e) { return null; }
  }
  function clearSave(s) { try { var st = store(s); if (st) st.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ } }

  var api = { readPlayer: readPlayer, writeResult: writeResult, readSound: readSound, writeSound: writeSound, readSpeed: readSpeed, writeSpeed: writeSpeed,
    readSave: readSave, writeSave: writeSave, clearSave: clearSave, RESULT_KEY: RESULT_KEY, SOUND_KEY: SOUND_KEY, SPEED_KEY: SPEED_KEY, SAVE_KEY: SAVE_KEY, SPEEDS: SPEEDS };
  root.PB = root.PB || {};
  root.PB.Storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
