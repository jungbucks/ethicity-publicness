// 검증용 정적 서버: 저장소 루트를 배포 사이트처럼 제공한다(/publicness/ 직접 진입 확인용).
// ?probe=<시나리오> 가 붙으면 index.html에 프로브 스크립트를 끼워 넣는다(원본 파일은 바꾸지 않음).
// 단독 실행: node publicness/tests/serve.mjs [port]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.md': 'text/plain; charset=utf-8' };

export function startServer(port = 0) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    const p = decodeURIComponent(url.pathname);
    let file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!p.endsWith('/')) { res.writeHead(301, { Location: p + '/' + url.search }); return res.end(); }
      file = path.join(file, 'index.html');
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
