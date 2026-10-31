// fal.ai가 만든 버스 GLB → 게임이 읽는 assets/models/bus.js (PB.busModelData).
//   node publicness/tools/bus-model.mjs [assets/models/bus-trellis.glb]
// 앞=+x(게임의 진행 방향, Trellis 출력은 앞=+z라 y축 +90°)·길이 3.2·바닥 y=0. 압축·텍스처 변환은 tools/glb-pack.mjs.
// GLB·입력 그림은 .gitignore(assets/models/*), 커밋하는 건 bus.js 하나. 노선 색 띠는 런타임(js/model-data.js recolor)에서 칠한다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readGlb, packModel, texturePage } from './glb-pack.mjs';

const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(PB, process.argv[2] || 'assets/models/bus-trellis.glb');
const g = readGlb(src);
const data = packModel(g, { rot: Math.PI / 2, fit: { length: 3.2 }, texture: await texturePage(g.texture, { size: 1024, q: 0.85 }) });
data.source = path.basename(src);
const out = path.join(PB, 'assets/models/bus.js');
fs.writeFileSync(out, '/* 자동 생성 — tools/bus-model.mjs (원본: fal.ai Trellis, ' + data.source + '). 직접 고치지 말 것 */\n' +
  '(function (root) { root.PB = root.PB || {}; root.PB.busModelData = ' + JSON.stringify(data) + '; })(typeof window !== \'undefined\' ? window : globalThis);\n');
const sz = [0, 1, 2].map((k) => (data.posMax[k] - data.posMin[k]).toFixed(2)).join('×');
console.log(`✓ ${path.relative(PB, out)} ${Math.round(fs.statSync(out).size / 1024)}KB · 정점 ${data.vertices} · 삼각형 ${data.triangles} · 크기 ${sz}`);
