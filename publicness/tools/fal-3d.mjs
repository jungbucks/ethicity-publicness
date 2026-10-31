// 그림 한 장 → 3D 모델(GLB), fal.ai. 키는 publicness/.env의 FAL_KEY(커밋 금지, .gitignore).
//   node publicness/tools/fal-3d.mjs <입력 그림.png> <출력.glb> [엔드포인트=fal-ai/trellis] [추가 입력 JSON]
//   예) tripo + 삼각형 상한: tripo3d/tripo/v2.5/image-to-3d '{"face_limit":8000,"texture":"standard"}'
// 버스: assets/models/bus-input.png(sheet-bus.png의 비스듬한 앞모습을 잘라 낸 것) → assets/models/bus-trellis.glb → tools/bus-model.mjs
// 구역 건물은 tools/zone-models.mjs가 같은 공통 모듈(tools/fal.mjs)을 쓴다.
// 요금이 나간다(2026-10-23 조회: trellis 0.02달러/회). 응답 JSON은 출력 옆 *-response.json으로 남긴다.
import fs from 'node:fs';
import { upload, run, download } from './fal.mjs';

const [input, output, endpoint = 'fal-ai/trellis', extra = '{}'] = process.argv.slice(2);
if (!input || !output) { console.error('사용법: node publicness/tools/fal-3d.mjs <입력.png> <출력.glb> [엔드포인트] [추가 입력 JSON]'); process.exit(1); }

const res = await run(endpoint, Object.assign({ image_url: await upload(input) }, JSON.parse(extra)));
fs.writeFileSync(output.replace(/\.glb$/, '') + '-response.json', JSON.stringify(res, null, 2));
const url = res.model_mesh?.url || res.model_glb?.url || res.model?.url;
if (!url) { console.error('결과에 모델 주소 없음', JSON.stringify(res).slice(0, 300)); process.exit(1); }
const size = await download(url, output);
console.log(`✓ ${output} ${Math.round(size / 1024)}KB · ${res._seconds}초`);
