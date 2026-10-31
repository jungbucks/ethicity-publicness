// fal.ai 큐 API 공통 — 키는 publicness/.env의 FAL_KEY(커밋 금지, .gitignore). 요금이 나간다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = fs.existsSync(path.join(PB, '.env')) ? fs.readFileSync(path.join(PB, '.env'), 'utf8') : '';
const KEY = (env.match(/^FAL_KEY=(.*)$/m) || [])[1]?.trim() || process.env.FAL_KEY;
const H = () => {
  if (!KEY) throw new Error('FAL_KEY 없음: publicness/.env에 FAL_KEY=... 를 넣을 것');
  return { Authorization: 'Key ' + KEY, 'Content-Type': 'application/json' };
};

// 그림을 fal 저장소에 올리고 주소를 돌려준다(trellis는 data URI도 받지만 tripo 등은 주소만 받음)
export async function upload(file) {
  const type = file.endsWith('.webp') ? 'image/webp' : /\.jpe?g$/.test(file) ? 'image/jpeg' : 'image/png';
  const init = await (await fetch('https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3', { method: 'POST', headers: H(), body: JSON.stringify({ file_name: path.basename(file), content_type: type }) })).json();
  if (!init.upload_url) throw new Error('업로드 준비 실패 ' + JSON.stringify(init).slice(0, 200));
  const put = await fetch(init.upload_url, { method: 'PUT', headers: { 'Content-Type': type }, body: fs.readFileSync(file) });
  if (!put.ok) throw new Error('업로드 실패 HTTP ' + put.status);
  return init.file_url;
}

// 큐에 넣고 끝날 때까지 기다려 결과 JSON을 돌려준다
export async function run(endpoint, input, { timeout = 600000 } = {}) {
  const sub = await (await fetch('https://queue.fal.run/' + endpoint, { method: 'POST', headers: H(), body: JSON.stringify(input) })).json();
  if (!sub.request_id) throw new Error('요청 실패 ' + JSON.stringify(sub).slice(0, 300));
  const t0 = Date.now();
  for (;;) {
    await new Promise((r) => setTimeout(r, 4000));
    const st = await (await fetch(sub.status_url, { headers: H() })).json();
    if (st.status === 'COMPLETED') break;
    if (st.error || Date.now() - t0 > timeout) throw new Error('실패/시간 초과 ' + JSON.stringify(st).slice(0, 300));
  }
  const res = await (await fetch(sub.response_url, { headers: H() })).json();
  res._seconds = Math.round((Date.now() - t0) / 1000);
  return res;
}

export async function download(url, out) {
  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  fs.writeFileSync(out, buf);
  return buf.length;
}
