// 검증용 정적 서버: 저장소 루트를 배포 사이트처럼 제공한다(/publicness/ 직접 진입 확인용).
// ?probe=<시나리오> 가 붙으면 index.html에 프로브 스크립트를 끼워 넣는다(원본 파일은 바꾸지 않음).
// 단독 실행: node publicness/tests/serve.mjs [port]
// 제공 범위(2026-11-18 보안 검토 1): 게임 폴더(/publicness/) 안의 index.html과 실행·검사에 쓰는 폴더(js·css·assets·audio·vendor·tests·tools)만.
// 점(.)으로 시작하는 파일·폴더(.env·.gitignore 등)와 개발 문서(docs·CLAUDE.md·README.md)·저장소의 다른 폴더는 404 — 파일을 읽지도 않는다.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const GAME_DIR = 'publicness', SERVED_DIRS = new Set(['js', 'css', 'assets', 'audio', 'vendor', 'tests', 'tools']);
/* root 아래 file을 제공해도 되는가. 경로 조각 하나라도 점으로 시작하면 안 됨(.env·.git 등) */
export function servable(root, file) {
  const rel = path.relative(path.join(root, GAME_DIR), file);
  if (rel === '') return true; /* /publicness/ → index.html */
  if (rel.startsWith('..') || path.isAbsolute(rel)) return false;
  const parts = rel.split(path.sep);
  if (parts.some((x) => x.startsWith('.'))) return false;
  return parts.length === 1 ? parts[0] === 'index.html' : SERVED_DIRS.has(parts[0]);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };

export function startServer(port = 0, opts = {}) {
  const root = opts.root ? path.resolve(opts.root) : ROOT; /* opts.root = 검사용 임시 폴더 */
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let p; try { p = decodeURIComponent(url.pathname); } catch (e) { res.writeHead(400); return res.end(); }
    let file = path.join(root, p);
    if (!file.startsWith(root) || !servable(root, file)) { res.writeHead(404); return res.end('not found'); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }); return res.end(); }
      file = path.join(file, 'index.html');
      if (!servable(root, file)) { res.writeHead(404); return res.end('not found'); }
    }
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
    let body = fs.readFileSync(file);
    if (file.endsWith('index.html') && url.searchParams.get('probe')) {
      body = body.toString('utf8')
        .replace('<meta charset="utf-8">', '<meta charset="utf-8"><script src="tests/probe-pre.js"></script>')
        .replace('</body>', '<script src="tests/probe-post.js"></script></body>');
    }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  });
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const s = await startServer(Number(process.argv[2] || 8080));
  console.log(`http://127.0.0.1:${s.address().port}/publicness/`);
}
