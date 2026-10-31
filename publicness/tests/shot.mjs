// 스크린샷: node publicness/tests/shot.mjs <이름> [주소 인자] [폭x높이]
//   예) node publicness/tests/shot.mjs title "" 1280x860
//       node publicness/tests/shot.mjs plan "probe=shot-plan" 1024x768
// 결과: publicness/tests/_shot-<이름>.png (gitignore)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './serve.mjs';

const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [name = 'title', qs = '', size = '1280x860'] = process.argv.slice(2);
const [w, h] = size.split('x');
const out = path.join(path.dirname(fileURLToPath(import.meta.url)), `_shot-${name}.png`);
const server = await startServer(0);
const base = `http://127.0.0.1:${server.address().port}/publicness/`;
const url = qs.startsWith('page:') ? base + qs.slice(5) : base + (qs ? '?' + qs : '');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-shot-'));
const extra = (process.env.EXTRA || '').split(' ').filter(Boolean);
await new Promise((resolve) => execFile(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, `--window-size=${w},${h}`,
  '--hide-scrollbars', '--virtual-time-budget=60000', ...extra, `--screenshot=${out}`, url], { timeout: 120000 }, () => resolve()));
server.close();
console.log(fs.existsSync(out) ? `저장: ${out}` : '스크린샷 실패');
