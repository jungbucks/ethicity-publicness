// 프로브(앱보다 먼저 실행): 오류 수집 + 시나리오별 저장소 준비 + 빠른 재생
(function () {
  var q = new URLSearchParams(location.search);
  var scenario = q.get('probe');
  window.__probe = { scenario: scenario, errors: [] };
  window.addEventListener('error', function (e) { window.__probe.errors.push('error: ' + e.message); });
  window.addEventListener('unhandledrejection', function (e) { window.__probe.errors.push('rejection: ' + e.reason); });
  var ce = console.error;
  console.error = function () { window.__probe.errors.push('console.error: ' + Array.prototype.join.call(arguments, ' ')); ce.apply(console, arguments); };
  window.__pbFast = true; // 재생 120분을 약 0.6초로(엔진 결과는 같음)

  var OTHER = { 'ethicity.result.privacy': '{"game":"privacy","completed":true,"ending":"A","card":"다른 게임"}' };
  window.__probe.OTHER = OTHER;
  window.__probe.PLAYER = '{"character":"char_03","nickname":"반짝이는 고래"}';
  try {
    localStorage.clear();
    Object.keys(OTHER).forEach(function (k) { localStorage.setItem(k, OTHER[k]); });
    if (scenario === 'xss-nickname') {
      window.__probe.PLAYER = JSON.stringify({ character: 'char_03', nickname: '<img src=x onerror="window.__x=1">' + '가'.repeat(200) });
    }
    localStorage.setItem('ethicity.player', window.__probe.PLAYER);
  } catch (e) { /* 저장소가 막힌 환경 */ }
  if (scenario === 'reduced-motion') window.__pbReduceMotion = true;
  if (scenario === 'webgl-fail') {
    var gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (t) { return /webgl/.test(t) ? null : gc.apply(this, arguments); };
  }
})();
