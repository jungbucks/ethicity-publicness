// 원본 PNG(assets/art, git 밖에 보존) → 게임이 실제로 쓰는 .webp 사본. 원본은 그대로 두고 같은 자리에 .webp를 쓴다.
//   node publicness/tools/to-webp.mjs [assets/art/x.png ...] [--q 0.82]
//   파일을 안 주면 USED 목록 전부. 그림 크기(픽셀)는 바꾸지 않는다.
// privacy/tools/to-webp.mjs와 같은 방식: 헤드리스 Edge의 canvas.toDataURL('image/webp')로 인코딩(설치 필요 없음).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/serve.mjs';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 게임 코드(index.html·cutscene·narrative·ui-result·ui-ending)가 불러오는 그림
const USED = ['title-two-stops', 'intro-haneul', 'intro-narae', 'intro-jun', 'intro-village', 'interlude-sol', 'interlude-cheer',
  'portrait-haneul-calm', 'portrait-narae-calm', 'portrait-jun-calm', 'portrait-sol-calm', 'interlude-influencer', 'portrait-jinho-calm'].map((n) => 'assets/art/' + n + '.png');
const args = process.argv.slice(2);
const qi = args.indexOf('--q');
const Q = qi >= 0 ? Number(args.splice(qi, 2)[1]) : 0.82;
const files = args.length ? args.map((a) => a.replace(/\\/g, '/')) : USED;

function edge(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'publicness-webp-'));
  return new Promise((resolve) => {
    execFile(EDGE, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', url],
      { maxBuffer: 512 * 1024 * 1024, timeout: 180000 }, (err, stdout) => {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge가 잠시 잡고 있을 수 있음 */ }
        resolve(stdout || '');
      });
  });
}

const kb = (n) => Math.round(n / 1024).toLocaleString() + 'KB';
let before = 0, after = 0;
const missing = files.filter((f) => !fs.existsSync(path.join(PB, f)));
missing.forEach((f) => { console.error('없음: ' + f); process.exitCode = 1; });
const todo = files.filter((f) => !missing.includes(f));
const server = await startServer(0);
const port = server.address().port;
for (let i = 0; i < todo.length; i += 3) { // 큰 일러스트라 한 번에 3장씩(출력이 너무 커지지 않게)
  const batch = todo.slice(i, i + 3);
  const url = `http://127.0.0.1:${port}/publicness/tools/webp-page.html?q=${Q}&` + batch.map((f) => 'f=' + encodeURIComponent(f)).join('&');
  const m = (await edge(url)).match(/<pre id="webp-out">([\s\S]*?)<\/pre>/);
  if (!m) { console.error('✗ 결과 없음(빈 출력): ' + batch.join(', ')); process.exitCode = 1; continue; }
  for (const r of JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'))) {
    if (r.error) { console.error('✗ ' + r.f + ': ' + r.error); process.exitCode = 1; continue; }
    const src = path.join(PB, r.f), buf = Buffer.from(r.data, 'base64'), size = fs.statSync(src).size;
    fs.writeFileSync(src.replace(/\.png$/, '.webp'), buf);
    before += size; after += buf.length;
    console.log(`✓ ${r.f} ${r.w}×${r.h}: ${kb(size)} → ${kb(buf.length)}`);
  }
}
server.close();
console.log(`\n합계: ${kb(before)} → ${kb(after)} (${before ? Math.round((1 - after / before) * 100) : 0}% 감소)`);
