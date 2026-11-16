// 본문 글꼴 Pretendard를 게임 폴더에 싣는다(2026-11-14) — Pretendard가 깔리지 않은 PC(학교 Windows = 맑은 고딕)에서 글자가 넓어져 4단계 카드가 잘리던 것의 근본 대책.
// 파일은 npm pretendard@1.3.9 공식 서브셋 그대로(SIL OFL 1.1). 배포 사본에 파일이 빠지면 여기서 걸린다. 실제로 웹 글꼴로 그려지는지는 playtest-1111-browser(begin)가 본다.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

test('pretendard.css: 굵기 넷 → assets/fonts의 woff2, style.css보다 먼저, 본문 굵기는 http(s)에서만 미리 받기, OFL', () => {
  const css = read('css/pretendard.css');
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*font-family:\s*'Pretendard';\s*src:\s*url\('\.\.\/(assets\/fonts\/[^']+\.woff2)'\)\s*format\('woff2'\);\s*font-weight:\s*(\d+);[^}]*font-display:\s*swap/g)];
  assert.deepEqual(faces.map((f) => f[2]), ['400', '600', '700', '800']);
  for (const [, file] of faces) assert.equal(fs.readFileSync(new URL('../' + file, import.meta.url)).subarray(0, 4).toString('latin1'), 'wOF2', file);
  const html = read('index.html'), at = html.indexOf('<link rel="stylesheet" href="css/pretendard.css">');
  assert.ok(at > 0 && at < html.indexOf('href="css/style.css"'), 'pretendard.css가 style.css보다 먼저');
  assert.match(html, /location\.protocol !== 'file:'[^<]*l\.as = 'font'[^<]*l\.href = 'assets\/fonts\/Pretendard-Regular\.subset\.woff2'/);
  assert.match(read('css/style.css'), /--font:\s*Pretendard,/, '글꼴 목록 맨 앞이 Pretendard(뒤쪽 맑은 고딕 등은 2,350자 밖 글자용)');
  const ofl = read('assets/fonts/OFL-Pretendard.txt');
  assert.match(ofl, /Reserved Font Name Pretendard/); assert.match(ofl, /SIL OPEN FONT LICENSE Version 1\.1/i);
  assert.match(read('README.md'), /Pretendard[^\n]*OFL/);
});
