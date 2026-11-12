/* 그림 대체 표시(2026-11-12 교사 랜덤 모드 검토 1번): 어떤 <img>든 불러오기에 실패하면 깨진 그림 아이콘·빈 흰 원 대신
 *  · 인물 얼굴(assets/art/portrait-<id>-calm.webp) → 이름 첫 글자 동그라미(.img-fallback-initial, 인물 이름은 PB.config에서)
 *  · 그 밖의 그림 → 숨기고 부모에 .img-missing (자리를 차지하던 빈 틀이 남지 않게)
 * 오류 이벤트는 버블링하지 않아서 document에 '캡처'로 한 번 건다 — 앞으로 만드는 그림(인물 칩·지도 핀·결과·엔딩 카드)까지 모두.
 * <head>에서 가장 먼저 읽어, 첫 화면 그림이 이 스크립트보다 먼저 실패하는 일이 없게 한다. 이미 실패한 그림은 sweep()이 다시 본다.
 * 실패한 주소는 PB.ImgFallback.missing에 모은다(검사·보고용). 새 그림은 만들지 않는다 */
(function (root) {
  'use strict';
  var missing = [];
  function residentName(id) {
    var c = root.PB && root.PB.config, list = c ? (c.residents || []).concat((c.challenge && c.challenge.residents) || []) : [];
    var r = list.filter(function (x) { return x.id === id; })[0];
    return r ? r.name : null;
  }
  function fallback(img) {
    if (!img || img.tagName !== 'IMG' || img.dataset.fallback) return;
    img.dataset.fallback = '1';
    var src = img.getAttribute('src') || '';
    if (missing.indexOf(src) < 0) missing.push(src);
    var m = src.match(/portrait-([a-z]+)-calm\.webp$/), parent = img.parentNode;
    if (m && parent) {
      var name = residentName(m[1]) || m[1], span = document.createElement('span');
      span.className = 'img-fallback-initial';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = name.charAt(0);
      parent.replaceChild(span, img);
      return;
    }
    img.hidden = true; img.style.display = 'none';
    if (parent && parent.classList) parent.classList.add('img-missing');
  }
  function onError(e) { var t = e.target; if (t && t.tagName === 'IMG') fallback(t); }
  // 이미 불러오기를 마쳤는데 그림이 비어 있는 것(이 스크립트보다 먼저 실패했거나 이벤트를 놓친 것)
  function sweep() {
    Array.prototype.forEach.call(document.images, function (img) { if (img.complete && img.getAttribute('src') && img.naturalWidth === 0) fallback(img); });
  }
  document.addEventListener('error', onError, true);
  root.addEventListener('load', sweep);
  root.PB = root.PB || {};
  root.PB.ImgFallback = { fallback: fallback, sweep: sweep, missing: missing, residentName: residentName };
})(window);
