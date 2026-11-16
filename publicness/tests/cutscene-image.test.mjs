// 컷신 그림 실패 처리(2026-11-14 검토 1번) — img-fallback.js와 cutscene.js를 가짜 DOM에 실제 읽는 순서대로 올려 본다.
//   전: img-fallback이 처리 표시로 dataset.fallback = '1'을 써서, 컷신이 '1'을 예비 그림 이름으로 읽고 assets/art/1을 끝없이 요청 + 그림이 숨겨진 채 다음 컷에도 안 보임.
//   SRC=<폴더>로 다른 js 폴더(예: 고치기 전 사본)를 읽게 할 수 있다(이 검사가 그 버그를 잡는지 확인용).
import test from 'node:test'; import assert from 'node:assert/strict'; import vm from 'node:vm'; import fs from 'node:fs';
const DIR = process.env.SRC ? new URL('file:///' + process.env.SRC.replace(/\\/g, '/').replace(/\/?$/, '/')) : new URL('../js/', import.meta.url);
const read = (f) => fs.readFileSync(new URL(f, DIR), 'utf8');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const LIMIT = 30; // 한 번에 이만큼 넘게 요청하면 반복 요청으로 보고 멈춘다

function world(missingFiles) {
  const requests = [], captured = [], els = {};
  function classList() { const set = new Set(); return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c), toggle: (c, on) => (on ? set.add(c) : set.delete(c)) }; }
  function el(id, tag) {
    const handlers = {}, attrs = {};
    const e = { id, tagName: tag || 'DIV', dataset: {}, style: {}, classList: classList(), hidden: false, textContent: '', alt: '', offsetWidth: 0, open: false, parentNode: null,
      addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, fire: (t, ev) => (handlers[t] || []).forEach((f) => f.call(e, ev || {})),
      getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, hasAttribute: (k) => k in attrs,
      focus() {}, showModal() { e.open = true; }, close() { e.open = false; } };
    return e;
  }
  function image(id, parent) {
    const img = el(id, 'IMG'); img.parentNode = parent || { classList: classList(), replaceChild(span, old) { this.replaced = span; old.parentNode = null; } };
    Object.defineProperty(img, 'src', { get: () => img.getAttribute('src') || '', set(v) {
      img.setAttribute('src', v); requests.push(v);
      if (requests.length > LIMIT) return; // 반복 요청이면 여기서 끊는다(검사가 요청 수로 잡음)
      const file = v.replace(/^assets\/art\//, '');
      img.naturalWidth = missingFiles.has(file) ? 0 : 640; img.complete = true;
      if (missingFiles.has(file)) { const ev = { target: img }; captured.forEach((f) => f(ev)); img.fire('error', ev); } // 실제 순서: document 캡처 → 요소
    } });
    return img;
  }
  const document = { readyState: 'complete', images: [], body: { classList: classList() },
    getElementById: (id) => els[id] || (els[id] = id === 'story-image' ? image(id) : el(id)),
    addEventListener: (t, f, capture) => { if (t === 'error' && capture) captured.push(f); },
    createElement: (tag) => el(null, String(tag).toUpperCase()) };
  const img = document.getElementById('story-image');
  // index.html의 #story-image 속성을 그대로 옮긴다(data-own-fallback이 빠지면 이 검사가 실패하게)
  const tag = html.match(/<img id="story-image"[^>]*>/)[0]; (tag.match(/\sdata-[a-z-]+/g) || []).forEach((a) => img.setAttribute(a.trim(), ''));
  const window = { document, PB: { App: { reducedMotion: () => true }, config: { residents: [{ id: 'haneul', name: '하늘' }] } }, addEventListener() {}, Image: function () { this.src = ''; },
    setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {} };
  const ctx = vm.createContext(Object.assign({ window }, window));
  vm.runInContext(read('img-fallback.js'), ctx); vm.runInContext(read('cutscene.js'), ctx);
  return { PB: window.PB, img, requests, document, image, next: () => document.getElementById('story-next').fire('click'), head: () => document.getElementById('goal-intro-h').textContent, open: () => document.getElementById('goal-intro').open };
}
const shown = (img) => !img.hidden && img.style.display !== 'none' && !img.classList.contains('is-missing');

test('컷 그림 하나가 없을 때: 그 컷만 그림 자리를 비우고 한 번만 요청, 다음 컷 그림은 보인다', () => {
  const w = world(new Set(['intro-haneul.webp'])); let done = 0;
  w.PB.Cutscene.play('intro', () => { done++; });
  assert.equal(w.head(), '하늘');
  assert.deepEqual(w.requests, ['assets/art/intro-haneul.webp'], '다시 요청하지 않는다(전: assets/art/1을 끝없이)');
  assert.ok(w.img.classList.contains('is-missing'), '그림 자리만 비움'); assert.equal(w.img.hidden, false); assert.notEqual(w.img.style.display, 'none');
  assert.equal(w.img.alt, '일러스트를 불러오지 못했어요. 대사를 읽고 계속할 수 있습니다.');
  assert.deepEqual(Array.from(w.PB.ImgFallback.missing), ['assets/art/intro-haneul.webp'], '없는 그림 주소는 적어 둔다');
  w.next(); // 나래 — 그림 있음
  assert.equal(w.head(), '나래'); assert.equal(w.img.getAttribute('src'), 'assets/art/intro-narae.webp'); assert.ok(shown(w.img), '다음 컷 그림은 보인다');
  assert.equal(w.img.alt, '나래의 하루');
  w.next(); w.next(); w.next(); assert.equal(done, 1, '끝까지 넘어간다'); assert.equal(w.open(), false);
  assert.equal(w.requests.length, 4); assert.ok(!w.requests.some((r) => /\/1$/.test(r)));
});

test('예비 그림이 있는 컷: 예비 그림으로 한 번 바꾸고, 그것도 없으면 그림 자리를 비운 채 넘어간다', () => {
  const a = world(new Set(['interlude-cheer.webp']));
  a.PB.Cutscene.play('baseball', () => {});
  assert.deepEqual(a.requests, ['assets/art/interlude-cheer.webp', 'assets/art/intro-village.webp']);
  assert.ok(shown(a.img)); assert.equal(a.img.alt, '솔잎마을 전경 · 새 인물 일러스트 준비 중');
  a.next(); assert.equal(a.head(), '다은 · 야구 팬'); assert.equal(a.requests.length, 4); assert.ok(shown(a.img), '둘째 컷도 예비 그림이 보인다');

  const b = world(new Set(['interlude-cheer.webp', 'intro-village.webp'])); let done = 0;
  b.PB.Cutscene.play('baseball', () => { done++; });
  assert.deepEqual(b.requests, ['assets/art/interlude-cheer.webp', 'assets/art/intro-village.webp'], '예비 그림까지 실패해도 요청은 두 번');
  assert.ok(b.img.classList.contains('is-missing')); assert.equal(b.img.alt, '일러스트를 불러오지 못했어요. 대사를 읽고 계속할 수 있습니다.');
  b.next(); assert.equal(b.head(), '다은 · 야구 팬'); assert.equal(b.requests.length, 4);
  b.next(); assert.equal(done, 1, '대사를 읽고 끝까지 넘어간다');
  // 같은 요소로 다음 장면: 그림이 있으면 다시 보인다
  b.PB.Cutscene.play('sol', () => {}); assert.equal(b.img.getAttribute('src'), 'assets/art/interlude-sol.webp'); assert.ok(shown(b.img));
});

test('컷신 밖의 그림은 전처럼 대체: 인물 얼굴 = 이름 첫 글자, 그 밖 = 숨김(처리 표시는 imgFallbackDone)', () => {
  const w = world(new Set(['portrait-haneul-calm.webp', 'env-sky.webp']));
  const face = w.image('f'); face.src = 'assets/art/portrait-haneul-calm.webp';
  assert.equal(face.parentNode, null, '얼굴 그림은 글자 동그라미로 바뀜'); assert.equal(face.dataset.imgFallbackDone, '1'); assert.equal(face.dataset.fallback, undefined, '컷신이 쓰던 키는 건드리지 않는다');
  const other = w.image('o'); const parent = other.parentNode; other.src = 'assets/art/env-sky.webp';
  assert.equal(other.hidden, true); assert.equal(other.style.display, 'none'); assert.ok(parent.classList.contains('img-missing'));
  assert.match(html, /<img id="story-image"[^>]*\sdata-own-fallback/, '컷신 그림은 스스로 대체한다는 표시');
});
