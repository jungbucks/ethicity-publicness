// GLB(메쉬·텍스처 하나) → 게임용 압축 데이터. tools/bus-model.mjs·tools/zone-models.mjs 공통.
// 좌표·UV는 Uint16 양자화 base64, 텍스처는 헤드리스 Edge 캔버스로 밝기 보정·축소·webp(data URI) — file://에서도 캔버스가 막히지 않게.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../tests/serve.mjs';

const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const CTOR = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

export function readGlb(file) {
  const glb = fs.readFileSync(file);
  const jsonLen = glb.readUInt32LE(12);
  const j = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binAt = 20 + jsonLen, bin = glb.subarray(binAt + 8, binAt + 8 + glb.readUInt32LE(binAt));
  if (j.meshes.length !== 1 || j.meshes[0].primitives.length !== 1) throw new Error('메쉬·프리미티브가 하나인 GLB만 지원: ' + file);
  if ((j.nodes || []).some((n) => n.matrix || n.rotation || n.scale || n.translation)) throw new Error('노드 변환이 있는 GLB는 미지원: ' + file);
  const prim = j.meshes[0].primitives[0];
  function read(ai) { // byteStride(교차 저장)도 풀어서 꽉 찬 배열로
    const a = j.accessors[ai], bv = j.bufferViews[a.bufferView], Ctor = CTOR[a.componentType], n = COUNT[a.type];
    const size = Ctor.BYTES_PER_ELEMENT, stride = bv.byteStride || n * size, base = (bv.byteOffset || 0) + (a.byteOffset || 0);
    const out = new Ctor(a.count * n), dv = new DataView(bin.buffer, bin.byteOffset);
    const get = { 5121: 'getUint8', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' }[a.componentType];
    for (let i = 0; i < a.count; i++) for (let k = 0; k < n; k++) out[i * n + k] = dv[get](base + i * stride + k * size, true);
    return out;
  }
  const mat = j.materials[prim.material].pbrMetallicRoughness.baseColorTexture;
  const img = j.images[j.textures[mat.index].source], ibv = j.bufferViews[img.bufferView];
  return {
    position: read(prim.attributes.POSITION), uv: read(prim.attributes.TEXCOORD_0), index: read(prim.indices),
    texture: { mime: img.mimeType, bytes: bin.subarray(ibv.byteOffset || 0, (ibv.byteOffset || 0) + ibv.byteLength) }
  };
}

function quantize(arr, dim) {
  const min = Array(dim).fill(Infinity), max = Array(dim).fill(-Infinity);
  arr.forEach((v, i) => { min[i % dim] = Math.min(min[i % dim], v); max[i % dim] = Math.max(max[i % dim], v); });
  const q = new Uint16Array(arr.length);
  arr.forEach((v, i) => { const k = i % dim, r = max[k] - min[k]; q[i] = r ? Math.round((v - min[k]) / r * 65535) : 0; });
  const r6 = (v) => Math.round(v * 1e6) / 1e6;
  return { b64: Buffer.from(q.buffer).toString('base64'), min: min.map(r6), max: max.map(r6) };
}

// rot: y축 회전(라디안). fit: 'unit'(가로·세로 중 긴 쪽 1) 또는 { length }(x 방향 길이). 가운데 정렬, 바닥 y=0
export function packModel(g, { rot = 0, fit = 'unit', texture }) {
  const pos = Float32Array.from(g.position), c = Math.cos(rot), s = Math.sin(rot);
  const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    const x = pos[i], z = pos[i + 2];
    pos[i] = x * c + z * s; pos[i + 2] = -x * s + z * c;
    for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], pos[i + k]); mx[k] = Math.max(mx[k], pos[i + k]); }
  }
  const scale = fit === 'unit' ? 1 / Math.max(mx[0] - mn[0], mx[2] - mn[2]) : fit.length / (mx[0] - mn[0]);
  const ctr = [(mn[0] + mx[0]) / 2, mn[1], (mn[2] + mx[2]) / 2];
  for (let i = 0; i < pos.length; i += 3) for (let k = 0; k < 3; k++) pos[i + k] = (pos[i + k] - ctr[k]) * scale;
  const P = quantize(pos, 3), U = quantize(g.uv, 2), n = pos.length / 3, small = n < 65536;
  const I = small ? Uint16Array.from(g.index) : Uint32Array.from(g.index);
  return {
    vertices: n, triangles: g.index.length / 3,
    posMin: P.min, posMax: P.max, position: P.b64, uvMin: U.min, uvMax: U.max, uv: U.b64,
    indexType: small ? 'u16' : 'u32', index: Buffer.from(I.buffer).toString('base64'), texture
  };
}

// 텍스처 → (밝기 보정·축소) webp data URI. tools/texture-page.html을 헤드리스 Edge로 연다
export async function texturePage(tex, { bright = 1, size = 1024, q = 0.85, info = {} } = {}) {
  const ext = tex.mime === 'image/jpeg' ? 'jpg' : 'png', rel = 'assets/models/_tex-' + process.pid + '.' + ext;
  fs.writeFileSync(path.join(PB, rel), tex.bytes);
  const server = await startServer(0);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'publicness-tex-'));
  try {
    const url = `http://127.0.0.1:${server.address().port}/publicness/tools/texture-page.html?f=${encodeURIComponent(rel)}&bright=${bright}&size=${size}&q=${q}`;
    const dom = await new Promise((resolve) => execFile(EDGE, ['--headless', '--disable-gpu', '--no-first-run', `--user-data-dir=${profile}`, '--virtual-time-budget=60000', '--dump-dom', url],
      { maxBuffer: 256 * 1024 * 1024, timeout: 180000 }, (err, stdout) => resolve(stdout || '')));
    const m = dom.match(/<pre id="tex-out">([\s\S]*?)<\/pre>/);
    if (!m) throw new Error('텍스처 변환 결과 없음');
    const r = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    if (r.error) throw new Error('텍스처 변환 실패: ' + r.error);
    Object.assign(info, { bright: r.bright, mean: r.mean });
    return 'data:image/webp;base64,' + r.data;
  } finally {
    server.close();
    fs.rmSync(path.join(PB, rel), { force: true });
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Edge가 잠시 잡고 있을 수 있음 */ }
  }
}
