// 마을 바탕 그림(assets/art/env-*.png, 로컬 원본) → 게임용 사본.
//   node publicness/tools/env-art.mjs [--size 512] [--q 0.8]
// - 하늘(env-sky)은 CSS 배경이라 assets/art/env-sky.webp로(원래 크기).
// - 바닥 잔디·생활권 타일은 WebGL 텍스처라 file://에서도 쓰이게 data URI로 assets/models/env.js에 담는다(PB.envArt).
//   타일은 이음매 없는 1024 그림을 긴 변 --size(기본 512)로 줄인다(정확히 절반이라 이음매가 그대로 맞는다).
// 인코딩은 to-webp.mjs와 같은 방식(헤드리스 Edge + tools/webp-page.html).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/serve.mjs';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? Number(args[i + 1]) : d; };
const SIZE = opt('--size', 512), Q = opt('--q', 0.8);
const TILES = fs.readdirSync(path.join(PB, 'assets/art')).filter((f) => /^env-(ground|tile-[A-Z])\.png$/.test(f)).sort();

function edge(url) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'publicness-env-'));
  return new Promise((resolve) => {
    execFile(EDGE, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', url],
      { maxBuffer: 512 * 1024 * 1024, timeout: 180000 }, (err, stdout) => {
        try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge가 잠시 잡고 있을 수 있음 */ }
        resolve(stdout || '');
      });
  });
}
async function encode(port, files, size) {
  const url = `http://127.0.0.1:${port}/publicness/tools/webp-page.html?q=${Q}&size=${size}&` + files.map((f) => 'f=' + encodeURIComponent('assets/art/' + f)).join('&');
  const m = (await edge(url)).match(/<pre id="webp-out">([\s\S]*?)<\/pre>/);
  if (!m) throw new Error('결과 없음(빈 출력): ' + files.join(', '));
  const out = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  out.forEach((r) => { if (r.error) throw new Error(r.f + ': ' + r.error); });
  return out;
}

const kb = (n) => Math.round(n / 1024).toLocaleString() + 'KB';
const server = await startServer(0), port = server.address().port;
try {
  const [sky] = await encode(port, ['env-sky.png'], 0);
  const skyBuf = Buffer.from(sky.data, 'base64');
  fs.writeFileSync(path.join(PB, 'assets/art/env-sky.webp'), skyBuf);
  console.log(`✓ env-sky ${sky.w}×${sky.h} → assets/art/env-sky.webp ${kb(skyBuf.length)}`);
  const art = { ground: null, tiles: {} };
  for (let i = 0; i < TILES.length; i += 4) {
    for (const r of await encode(port, TILES.slice(i, i + 4), SIZE)) {
      const name = path.basename(r.f, '.png'), uri = 'data:image/webp;base64,' + r.data;
      if (name === 'env-ground') art.ground = uri; else art.tiles[name.slice(-1)] = uri;
      console.log(`✓ ${name} ${r.w}×${r.h} ${kb(r.data.length * 3 / 4)}`);
    }
  }
  const js = '/* 자동 생성 — tools/env-art.mjs. 3D 바닥 잔디(ground)·생활권 땅 타일(tiles[구역]) webp data URI */\n'
    + '(function (root) { root.PB = root.PB || {}; root.PB.envArt = ' + JSON.stringify(art) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n';
  fs.writeFileSync(path.join(PB, 'assets/models/env.js'), js);
  console.log(`\nassets/models/env.js ${kb(js.length)} (타일 ${Object.keys(art.tiles).join('·')})`);
} finally { server.close(); }
