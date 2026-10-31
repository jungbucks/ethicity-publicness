// 브라우저 검증: node publicness/tests/run-probes.mjs [시나리오...]
// 정적 서버를 띄우고 헤드리스 Edge로 /publicness/?probe=<시나리오> 를 열어 실제 화면 조작 결과를 수확한다.
// 시나리오 이름 뒤 ?a=b 를 붙이면 주소 인자로 전달된다(예: seed-param?seed=7).
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from './serve.mjs';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// 시나리오별 Edge 추가 인자(3D는 소프트웨어 WebGL 필요)
const EXTRA = { 'stage-3d': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] };
// 앱이 아닌 검사 페이지
const PAGES = { mobile: 'tests/mobile.html' };
const ALL = (process.env.PROBES || ['title', 'seed-param?seed=7', 'newtown-hidden', 'plan-keyboard', 'nonadjacent-blocked', 'cycle-display', 'fourth-bus', 'double-start', 'invalid-draft-ai',
  'run-locked', 'hidden-tab', 'result-table', 'newtown-phase2', 'reduced-motion', 'sound-off-default', 'keyboard-full', 'no3d-full?no3d=1', 'ending-records',
  'result-key', 'xss-nickname', 'random-seed', 'stage-3d', 'webgl-fail', 'a11y', 'mobile'].join(',')).split(',');
const list = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const server = await startServer(0);
const port = server.address().port;

function runEdge(url, profile, extra = []) {
  return new Promise((resolve) => {
    execFile(EDGE, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`,
      '--virtual-time-budget=120000', '--window-size=1280,900', ...extra, '--dump-dom', url], { maxBuffer: 64 * 1024 * 1024, timeout: 180000 },
    (err, stdout) => resolve(stdout || ''));
  });
}

let totalPass = 0, totalFail = 0;
for (const item of list) {
  const [sc, qs] = item.split('?');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'publicness-probe-'));
  const url = PAGES[sc] ? `http://127.0.0.1:${port}/publicness/${PAGES[sc]}` : `http://127.0.0.1:${port}/publicness/?probe=${sc}${qs ? '&' + qs : ''}`;
  const dom = await runEdge(url, profile, EXTRA[sc] || []);
  const m = dom.match(/<pre id="probe-out">([\s\S]*?)<\/pre>/);
  if (!m) { console.log(`✗ ${item}: 결과 없음 (DOM ${dom.length}자)`); totalFail++; continue; }
  const txt = m[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  const r = JSON.parse(txt);
  const errs = r.errors.length;
  totalPass += r.pass.length;
  totalFail += r.fail.length + errs;
  console.log(`${r.fail.length || errs ? '✗' : '✓'} ${item}: 통과 ${r.pass.length} · 실패 ${r.fail.length} · 콘솔 오류 ${errs}`);
  r.fail.forEach((f) => console.log('    - ' + f));
  r.errors.forEach((f) => console.log('    ! ' + f));
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge가 잠시 잡고 있을 수 있음 */ }
}

server.close();
console.log(`\n합계: 통과 ${totalPass} · 실패/오류 ${totalFail}`);
process.exit(totalFail ? 1 : 0);
