/*
 * 배경음악(BGM) — 2026-11-01. 곡은 fal ElevenLabs Music(가사 없음)으로 만든 두 곡:
 *   계획·결과·타이틀·엔딩 = audio/bgm/b2-plan.mp3(잔잔), 운행 = audio/bgm/b3-run.mp3(통통 튀는 곡)
 * 효과음 스위치(#opt-sound)와 따로 #opt-bgm, 저장 키 ethicity.publicness.bgm('1'/'0', 기본 켜짐 — 효과음과 같은 결정). 볼륨 0.14(사용자: 처음 0.3의 절반 미만).
 * 배속(1×·2×)과 무관하게 같은 빠르기. 화면이 바뀌면 0.6초 동안 줄였다 키움(같은 곡이면 이어서). 탭이 숨으면 멈춤.
 * 브라우저는 첫 클릭·키 입력 전에는 소리를 막으므로, 그때 다시 시도한다. App.go를 감싸 화면 이름(data-screen)을 받는다.
 */
(function (root) {
  'use strict';
  var PB = root.PB, KEY = 'ethicity.publicness.bgm', VOL = 0.14, FADE = 600;
  var TRACK = { plan: 'audio/bgm/b2-plan.mp3', run: 'audio/bgm/b3-run.mp3' };
  function trackFor(screen) { return screen === 'run' ? 'run' : 'plan'; }
  var on = read(), audio = null, cur = null, want = null, fadeT = null;
  function read() { try { return root.localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
  function write(v) { try { root.localStorage.setItem(KEY, v ? '1' : '0'); } catch (e) { /* 이번 창에서만 */ } }
  function fadeTo(a, to, ms, done) {
    clearInterval(fadeT); var from = a.volume, t0 = Date.now();
    fadeT = setInterval(function () { var k = Math.min(1, (Date.now() - t0) / ms); a.volume = from + (to - from) * k; if (k >= 1) { clearInterval(fadeT); if (done) done(); } }, 40);
  }
  function play() {
    if (!on || !want || document.hidden) return;
    if (audio && cur === want) { if (audio.paused) { audio.volume = 0; audio.play().then(rise, function () {}); } return; }
    var next = function () {
      if (audio) audio.pause();
      if (!on) return;
      audio = new Audio(TRACK[want]); audio.loop = true; audio.volume = 0; cur = want;
      audio.play().then(rise, function () { /* 첫 입력 전에는 막힘 — 다음 입력에서 다시 */ });
    };
    if (audio && !audio.paused) fadeTo(audio, 0, FADE, next); else next();
  }
  // 재생이 늦게 시작돼도(play() 약속) 그 사이 꺼졌으면 바로 멈춘다
  function rise() { if (!on || document.hidden) { audio.pause(); return; } fadeTo(audio, VOL, FADE); }
  function stop() { clearInterval(fadeT); if (audio) audio.pause(); }
  function scene(screen) { want = trackFor(screen); play(); }
  function set(v) { on = !!v; write(on); var c = document.getElementById('opt-bgm'); if (c) c.checked = on; if (on) play(); else stop(); }
  var go = PB.App.go;
  PB.App.go = function (screen) { var r = go.apply(this, arguments); scene(document.body.getAttribute('data-screen') || screen); return r; };
  ['pointerdown', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { if (!want) want = trackFor(document.body.getAttribute('data-screen')); play(); }, true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { if (audio) audio.pause(); } else play(); });
  var box = document.getElementById('opt-bgm');
  if (box) { box.checked = on; box.addEventListener('change', function (e) { set(e.target.checked); }); }
  PB.Bgm = { set: set, isOn: function () { return on; }, state: function () { return { on: on, want: want, cur: cur, playing: !!(audio && !audio.paused), volume: audio ? audio.volume : 0 }; } };
})(window);
