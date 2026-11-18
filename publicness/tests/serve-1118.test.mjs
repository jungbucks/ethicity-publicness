// 2026-11-18 보안 검토 1: 검증용 정적 서버(tests/serve.mjs)는 게임 실행·검사에 쓰는 파일만 제공한다 — 점 파일(.env 등)·개발 문서·저장소의 다른 폴더는 404.
// 가짜 .env는 임시 폴더에만 만들고 끝나면 지운다. 실제 publicness/.env는 읽지도 출력하지도 않는다(응답 상태 코드만 본다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { startServer, servable } from './serve.mjs';

function get(port, p) {
  return new Promise((ok, no) => { http.get({ host: '127.0.0.1', port, path: p }, (res) => { let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { b += c; }); res.on('end', () => ok({ status: res.statusCode, body: b })); }).on('error', no); });
}

test('보안 1: 임시 폴더 — 게임 파일만 200, 가짜 .env·숨김 폴더·개발 문서·바깥 폴더는 404', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pt1118-serve-'));
  const put = (rel, txt) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, txt); };
  const FAKE = 'FAL_KEY=fake-not-a-real-key-1118';
  put('publicness/index.html', '<!doctype html><meta charset="utf-8"><body>game</body>'); put('publicness/js/a.js', 'ok-js'); put('publicness/tests/probe-pre.js', 'ok-probe');
  put('publicness/assets/art/x.webp', 'img'); put('publicness/tools/page.html', 'tool');
  put('publicness/.env', FAKE); put('publicness/.gitignore', '.env'); put('publicness/assets/.secret', FAKE); put('publicness/.git/config', FAKE);
  put('publicness/docs/plan.md', 'dev'); put('publicness/CLAUDE.md', 'dev'); put('publicness/README.md', 'dev'); put('other/secret.txt', FAKE);
  const server = await startServer(0, { root: dir }), port = server.address().port;
  try {
    for (const p of ['/publicness/', '/publicness/index.html', '/publicness/js/a.js', '/publicness/tests/probe-pre.js', '/publicness/assets/art/x.webp', '/publicness/tools/page.html', '/publicness/?probe=x'])
      assert.equal((await get(port, p)).status, 200, p);
    for (const p of ['/publicness/.env', '/publicness/%2eenv', '/publicness/.gitignore', '/publicness/assets/.secret', '/publicness/.git/config', '/publicness/docs/plan.md', '/publicness/CLAUDE.md', '/publicness/README.md',
      '/other/secret.txt', '/publicness/../other/secret.txt', '/publicness/%2e%2e/other/secret.txt', '/publicness/js/..%2f..%2fother/secret.txt', '/publicness/js/%2e%2e/.env', '/']) {
      const r = await get(port, p); assert.equal(r.status === 404 || r.status === 400, true, p + ' → ' + r.status); assert.ok(!r.body.includes('fake-not-a-real-key'), p + ' 본문에 가짜 키 없음');
    }
    assert.equal((await get(port, '/publicness')).status, 301, '/publicness → /publicness/');
  } finally { server.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(fs.existsSync(dir), false, '임시 폴더 지움');
});

test('보안 1: 실제 저장소 서버도 /publicness/.env는 404(상태 코드만 확인, 내용은 읽지 않음)', async () => {
  const server = await startServer(0), port = server.address().port;
  try {
    const env = await get(port, '/publicness/.env'); assert.equal(env.status, 404); assert.equal(env.body, 'not found');
    assert.equal((await get(port, '/publicness/.gitignore')).status, 404);
    assert.equal((await get(port, '/publicness/index.html')).status, 200);
    assert.equal((await get(port, '/publicness/js/config.js')).status, 200);
  } finally { server.close(); }
  assert.equal(servable('/r', path.join('/r', 'publicness', 'tools', '.env')), false);
});
