// fal.ai 버스 모델(assets/models/bus.js) → 대기 버스·드래그·노선 배지용 평면 그림 assets/art/bus-sprite.webp
//   node publicness/tools/bus-sprite.mjs [size=320]
// 새로 생성하거나 외부 API를 부르지 않는다 — 이미 커밋된 모델을 헤드리스 Edge(swiftshader)로 한 번 그려 투명 여백을 잘라 낸다.
// 결과 크기(w×h)는 그림 비율 그대로라 CSS에서 object-fit 없이 써도 실제 보이는 버스와 클릭 영역이 맞는다.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/serve.mjs';

const require = createRequire(import.meta.url), { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const size = Number(process.argv[2] || 320), server = await startServer(0);
const browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/publicness/tools/bus-sprite.html?size=${size}`);
  const r = JSON.parse(await page.locator('#sprite-out').textContent({ timeout: 60000 }));
  if (r.error) throw new Error('버스 그림 실패: ' + r.error);
  const out = path.join(PB, 'assets/art/bus-sprite.webp');
  fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log(`✓ ${path.relative(PB, out)} ${r.w}×${r.h} · ${Math.round(fs.statSync(out).size / 1024)}KB · 자른 영역 ${r.crop.join(',')}`);
} finally { await browser.close(); server.close(); }
