/* 휴대폰 세로 화면 안내(2026-11-16 사용자 지시): 휴대폰을 세로로 들고 있으면 ‘가로로 돌려 주세요’ 창을 띄운다.
 *  · 뜨는 때 = 터치 기기 + 폭 ≤ 700 + 세로가 더 김(App.phoneMode의 세로 기준과 같은 숫자). 가로로 돌리면 저절로 닫히고, 다시 세로면 다시 뜬다.
 *  · ‘세로로 계속하기’ = 이번 방문 동안 다시 안 띄움(sessionStorage) — 화면 회전이 잠긴 휴대폰에서 갇히지 않게. 세로 배치(body.phone-p)는 그대로 쓸 수 있다.
 *  · 다른 창(컷신·도움말 등 <dialog> showModal) 위에 떠야 해서 이것도 <dialog> showModal — 운행 중이면 ui-run modalOpen()이 재생을 멈춘다.
 *  · 자동 검사(navigator.webdriver)에서는 안 띄운다 — 세로 화면 검사 수십 개가 이 창에 막히지 않게. 검사에서 보려면 ?rotate=1, 끄려면 ?rotate=0.
 */
(function (root) {
  'use strict';
  var doc = root.document, KEY = 'ethicity.publicness.rotateSkip', dlg = null, skipped = false;
  function param() { var m = /[?&]rotate=([01])(&|$)/.exec(root.location.search || ''); return m ? m[1] : null; }
  function touch() { return (root.navigator.maxTouchPoints || 0) > 0 || !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches); }
  function portraitPhone() { var w = root.innerWidth, h = root.innerHeight; return w <= 700 && h > w; }
  function need() {
    var p = param();
    if (skipped || p === '0' || (root.navigator.webdriver && p !== '1')) return false;
    return (p === '1' || touch()) && portraitPhone();
  }
  function build() {
    var d = doc.createElement('dialog');
    d.id = 'rotate-ask'; d.className = 'dialog rotate-ask';
    d.setAttribute('aria-labelledby', 'rotate-ask-h'); d.setAttribute('aria-describedby', 'rotate-ask-p');
    d.innerHTML =
      '<svg class="rotate-ask-pic" viewBox="0 0 96 72" aria-hidden="true" focusable="false">' +
        '<rect class="ra-from" x="10" y="8" width="30" height="54" rx="6"/>' +
        '<rect class="ra-to" x="34" y="34" width="54" height="30" rx="6"/>' +
        '<path class="ra-arrow" d="M48 12c12 0 22 6 26 15"/><path class="ra-arrow" d="M76 16l-1 12-11-4"/>' +
      '</svg>' +
      '<h2 id="rotate-ask-h">휴대폰을 가로로 돌려 주세요</h2>' +
      '<p id="rotate-ask-p">이 게임은 가로 화면에서 지도가 넓게 보여요.</p>' +
      '<p class="rotate-ask-note">화면이 돌아가지 않으면 휴대폰의 ‘화면 자동 회전’을 켜 주세요.</p>' +
      '<div class="row-actions"><button type="button" class="btn" id="rotate-ask-skip">세로로 계속하기</button></div>';
    d.querySelector('#rotate-ask-skip').addEventListener('click', skip);
    d.addEventListener('cancel', function (e) { e.preventDefault(); skip(); }); /* Esc·뒤로 가기 = 세로로 계속하기 */
    doc.body.appendChild(d);
    return d;
  }
  function skip() {
    skipped = true;
    try { root.sessionStorage.setItem(KEY, '1'); } catch (e) { /* 이번 화면에서만 */ }
    sync();
  }
  function sync() {
    if (!doc.body) return;
    var want = need(), open = !!(dlg && dlg.open);
    if (want && !open) {
      dlg = dlg || build();
      try { dlg.showModal(); } catch (e) { dlg.setAttribute('open', ''); }
    } else if (!want && open) dlg.close();
  }
  try { skipped = root.sessionStorage.getItem(KEY) === '1'; } catch (e) { /* 저장소 막힘 = 매번 물음 */ }
  root.addEventListener('resize', sync);
  root.addEventListener('orientationchange', function () { sync(); root.setTimeout(sync, 300); }); /* 일부 브라우저는 회전 직후 창 크기가 아직 옛 값 */
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', sync); else sync();
  root.PB = root.PB || {};
  root.PB.RotateAsk = { sync: sync, need: need, isOpen: function () { return !!(dlg && dlg.open); } };
})(window);
