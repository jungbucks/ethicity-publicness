/*
 * 저장 키
 *   ethicity.player            읽기만(팀 공통) — {"character":"…","nickname":"…"}
 *   ethicity.result.publicness 결말 도달 시 쓰기(팀 공통) — {"game":"publicness","completed":true,"ending":null,"card":"…"}
 *   ethicity.publicness.sound  효과음 끔/켬('0'/'1'). 없으면 켜짐
 *   ethicity.publicness.speed  운행 재생 배속(1·2). 없으면 1, 예전 값 4는 2로 바꿔 둔다
 *   ethicity.publicness.save   진행 자동 저장 {version, savedAt, session} — 시나리오 버전이 다르면 버린다. 뼈대가 깨진 저장본은 이어하기로 주지 않는다(saveState 'broken')
 *   ethicity.publicness.save.broken 깨진 저장본 원문 한 벌 — 새 게임이 덮어쓰기 전에 keepBroken이 옮겨 둔다(화면에서는 읽지 않음)
 *   ethicity.publicness.busHint 첫 버스 끌어 놓기 안내를 봤는지('1') — ui-map-plan.js가 직접 읽고 쓴다
 * 저장소가 막혔거나 손상됐으면 게임은 멈추지 않는다. 진행 저장(writeSave)의 성공 여부는 돌려주고, 화면이 알린다(App.save → #save-status).
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
  // 이 브라우저에 쓸 수 있는지(시작 화면 저장 안내용). 시험 값은 바로 지운다. 용량이 거의 찬 경우처럼 여기서는 되고 실제 저장은 안 될 수도 있다 — 그때는 writeSave가 false
  var PROBE_KEY = 'ethicity.publicness.probe';
  function canSave(s) { try { var st = store(s); if (!st) return false; st.setItem(PROBE_KEY, '1'); st.removeItem(PROBE_KEY); return true; } catch (e) { return false; } }
  /* 저장본 상태(2026-11-10 검토 4번): none = 없음·다른 버전·저장소 막힘 / ok / broken = JSON이 잘렸거나 뼈대가 없음.
   * 뼈대(설정 없이도 볼 수 있는 최소 구조) = session 객체 · history 배열 · draft.routes·draft.buses 배열 · phase 정수 · stage 문자열.
   * valid(save) = 더 깊은 검사(Session.checkSave: stage·phase 범위 등) — 주면 그것까지 통과해야 ok */
  function plain(x) { return !!x && typeof x === 'object' && !Array.isArray(x); }
  function skeleton(d) {
    return plain(d) && Array.isArray(d.history) && plain(d.draft) && Array.isArray(d.draft.routes) && Array.isArray(d.draft.buses) &&
      typeof d.phase === 'number' && d.phase % 1 === 0 && d.phase >= 1 && typeof d.stage === 'string';
  }
  function saveState(version, s, valid) {
    var none = { state: 'none', save: null }, broken = { state: 'broken', save: null }, raw, o;
    try { var st = store(s); raw = st && st.getItem(SAVE_KEY); } catch (e) { return none; }
    if (!raw) return none;
    try { o = JSON.parse(raw); } catch (e) { return broken; }
    if (!plain(o)) return broken;
    if (o.version !== version) return none;
    try { if (!skeleton(o.session) || (valid && !valid(o))) return broken; } catch (e) { return broken; }
    return { state: 'ok', save: o };
  }
  function readSave(version, s, valid) { return saveState(version, s, valid).save; }
  // 깨진 저장본 원문을 따로 남긴다(새 게임이 같은 키에 덮어쓰기 전에). 남길 것이 없거나 못 쓰면 false
  var BROKEN_KEY = SAVE_KEY + '.broken';
  function keepBroken(s) { try { var st = store(s), raw = st && st.getItem(SAVE_KEY); if (!raw) return false; st.setItem(BROKEN_KEY, raw); return true; } catch (e) { return false; } }
  function clearSave(s) { try { var st = store(s); if (st) st.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ } }

  var api = { readPlayer: readPlayer, writeResult: writeResult, readSound: readSound, writeSound: writeSound, readSpeed: readSpeed, writeSpeed: writeSpeed,
    readSave: readSave, saveState: saveState, keepBroken: keepBroken, BROKEN_KEY: BROKEN_KEY, writeSave: writeSave, canSave: canSave, clearSave: clearSave, RESULT_KEY: RESULT_KEY, SOUND_KEY: SOUND_KEY, SPEED_KEY: SPEED_KEY, SAVE_KEY: SAVE_KEY, SPEEDS: SPEEDS };
  root.PB = root.PB || {};
  root.PB.Storage = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
