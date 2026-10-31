// 구역(생활권) 건물 3D 모델 만들기 — fal.ai: 그림(nano-banana) → 3D(Tripo, 삼각형 상한) → 게임용 assets/models/zone-<id>.js
//   node publicness/tools/zone-models.mjs image [C D ... | stop-low stop-mid stop-high]   그림만 (assets/models/zone-<id>-input.png)
//   node publicness/tools/zone-models.mjs model [C D ...]   3D만   (assets/models/zone-<id>.glb)
//   node publicness/tools/zone-models.mjs pack  [C D ...]   게임용 (assets/models/zone-<id>.js + zones.js 목록)
// 구역을 안 주면 ZONES 전부. 그림 화풍 기준은 assets/models/zone-style-ref.png(사용자가 고른 밝은 밀집 주거지 그림, 로컬).
// 그림·GLB는 .gitignore(assets/models/*), 커밋하는 건 *.js. 요금이 나간다(그림 0.04달러/장, Tripo는 크레딧 단위).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { upload, run, download } from './fal.mjs';
import { readGlb, packModel, texturePage } from './glb-pack.mjs';

const PB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const M = (f) => path.join(PB, 'assets/models', f);

// what: 구역 설명(영어 프롬프트) · bright: 텍스처 밝기 보정(1=그대로, 클수록 밝게) · rot: y축 회전(앞면이 카메라 쪽)
export const ZONES = {
  A: { name: '기차역', what: 'a small local railway station building: ivory walls, slate-gray gabled roof, a long covered platform canopy along one side, glass entrance doors, a small paved forecourt with a bench and planters. No railway tracks, no trains' },
  B: { name: '밀집 주거지', what: 'a lively dense residential block: eight low-rise villa buildings of clearly different sizes (one 5-story, several 3-4 story, two small 2-story houses), rooftop planters, balconies' },
  C: { name: '대학교', what: 'a small university campus: two or three academic buildings of different heights around a green lawn quad, one building with a classical columned entrance, a few trees and benches' },
  D: { name: '병원·공공서비스', what: 'a friendly community hospital: a white 5-story main building with a simple blue cross pictogram (no letters), a lower public-service office annex with a covered entrance, a small garden' },
  E: { name: '구도심 시장', what: 'an old-town traditional market street: a row of four small two-story shops with colorful fabric awnings (sage, terracotta, sky blue, butter yellow), fruit and vegetable stalls in front, benches and two trees' },
  F: { name: '외곽 마을', what: 'a quiet rural hamlet: two small one-story houses with tiled roofs, a vegetable garden with crop rows, a wooden shed, a few trees and grass' },
  G: { name: '산업·일자리', what: 'a clean small industrial area: two light workshop buildings with sawtooth roofs, a small office building, a cylindrical silo, stacked crates and a loading area' },
  H: { name: '종합운동장', what: 'a compact baseball stadium: an oval of tiered light-gray stands with blue seats open on one side, a bright green field with a tan baseball diamond, four floodlight towers, a scoreboard frame without any numbers' },
  I: { name: '신도시', what: 'a brand-new high-rise apartment complex: three tall modern slender apartment towers of 12 to 15 floors (white and pale mint facades, glass balcony rails, flat roofs), clearly much taller and newer than an old low-rise neighborhood, plus a low glass community center, wide clean plaza, young saplings. No pitched roofs, no small houses' },
  J: { name: '고속버스터미널', what: 'an intercity bus terminal: a long one-story terminal building with large glass windows and a wide flat canopy over three empty bus bays, a small plaza with a bench and a tree. No buses, no vehicles' },
  K: { name: '어린이·노인복지관', what: 'a warm community welfare center for children and seniors: a friendly two-story building with big windows and a green roof edge, a small playground with a slide, a garden with benches' },
  L: { name: '호수공원', what: 'a lake park: two small calm ponds, a lawn with walking paths, a wooden deck by the water, a small gazebo, several round trees and a few conifers' },
  M: { name: '솔잎몰', what: 'a modern shopping mall: a large two-level building with a glass facade, a few rooftop skylights, an entrance plaza with planters and trees' },
  N: { name: '대도시', what: 'a big city district: a cluster of six modern skyscrapers and office towers of very different heights (some very tall), a central plaza with trees' }
};
// 정류장 시설(이용량 등급별). 바닥판·안전선은 게임이 그린다(선택 강조에 씀) — 모델은 그 위의 시설만.
// rot: 벤치·열린 쪽이 화면 앞(+z, 도로 쪽)을 보도록 모델마다 확인한 값(기본 1.5π)
export const STOPS = {
  'stop-low': { kind: 'stop', rot: 0, name: '정류장(적음)', what: 'a simple neighborhood bus stop: one round blue-and-white bus stop sign on a slim gray pole and one small wooden bench with metal legs beside it' },
  'stop-mid': { kind: 'stop', rot: 0, name: '정류장(보통)', what: 'a small one-bay bus shelter: slim gray metal frame, clear glass back panel, flat slate-gray roof, one wooden bench inside, and a round blue-and-white bus stop sign on a pole beside it' },
  'stop-high': { kind: 'stop', name: '정류장(많음)', what: 'a wide two-bay bus shelter: gray metal frame, clear glass back panels, long flat slate-gray roof, two wooden benches inside, a digital arrival board with a blank dark screen on a pole, and a round blue-and-white bus stop sign on a pole' }
};
const ITEMS = Object.assign({}, ZONES, STOPS);
const stem = (id) => ITEMS[id].kind === 'stop' ? id : 'zone-' + id;
const DEFAULT_ROT = Math.PI * 1.5, DEFAULT_BRIGHT = 'auto'; // auto: 텍스처 평균 밝기를 보고 보정(tools/texture-page.html)

function prompt(z) {
  if (z.kind === 'stop') return [
    'Use the reference image ONLY for the art style: bright cheerful pastel miniature, simple chunky toy-like shapes, clean smooth surfaces, light gray metal, warm wood, soft colors.',
    'Create ONE isolated 3D game-asset of street furniture: ' + z.what + '. Open side and benches face the viewer.',
    'Standing directly with NO ground, NO base slab, NO platform, NO floor, NO curb, NO grass under it.',
    'Three-quarter view from the front-right, camera slightly above, fully visible and centered with generous margin.',
    'Flat, uniform, bright, shadowless ambient lighting like an unlit albedo texture: no cast shadows.',
    'Pure plain white background, no other objects, no people, no vehicles, no text, no letters, no numbers, no logos.'
  ].join('\n');
  return [
    'Use the reference image ONLY for the art style: bright cheerful pastel miniature diorama, simple chunky toy-like shapes, clean smooth surfaces, cream / warm white / soft peach / butter-yellow / pale mint walls, light gray-blue roofs, fresh light green plants, light warm-beige paved base slab.',
    'Create ONE isolated 3D game-asset miniature diorama on one flat square light warm-beige base: ' + z.what + '.',
    'Isometric three-quarter view from the front-right, camera fairly high above, the entire diorama fully visible and centered with generous margin. Roofs and top surfaces must read clearly from above.',
    'Flat, uniform, bright, shadowless ambient lighting like an unlit albedo texture: no cast shadows, no dark sides, no blue shadow tint.',
    'Pure plain white background, no other scenery, no people, no vehicles, no text, no letters, no numbers, no signs with writing, no logos.'
  ].join('\n');
}

async function image(id) {
  const ref = await upload(M('zone-style-ref.png'));
  const res = await run('fal-ai/nano-banana/edit', { prompt: prompt(ITEMS[id]), image_urls: [ref], num_images: 1, output_format: 'png' });
  if (!res.images?.[0]?.url) throw new Error(id + ' 그림 없음 ' + JSON.stringify(res).slice(0, 200));
  await download(res.images[0].url, M(`${stem(id)}-input.png`));
  return `그림 ${res._seconds}초`;
}

async function model(id) {
  // 정류장 시설은 지도에 여러 개 놓이므로 삼각형을 더 적게
  const res = await run('tripo3d/tripo/v2.5/image-to-3d', { image_url: await upload(M(`${stem(id)}-input.png`)), face_limit: ITEMS[id].kind === 'stop' ? 3000 : 8000, texture: 'standard' });
  fs.writeFileSync(M(`${stem(id)}-response.json`), JSON.stringify(res, null, 2));
  if (!res.model_mesh?.url) throw new Error(id + ' 모델 없음 ' + JSON.stringify(res).slice(0, 200));
  const size = await download(res.model_mesh.url, M(`${stem(id)}.glb`));
  return `3D ${res._seconds}초 ${Math.round(size / 1024)}KB`;
}

async function pack(id) {
  const z = ITEMS[id], g = readGlb(M(`${stem(id)}.glb`)), reg = z.kind === 'stop' ? 'stopModelData' : 'zoneModelData';
  const info = {}, tex = await texturePage(g.texture, { bright: z.bright || DEFAULT_BRIGHT, size: 1024, q: 0.8, info });
  const data = packModel(g, { rot: z.rot ?? DEFAULT_ROT, fit: 'unit', texture: tex });
  data.id = id; data.name = z.name;
  const out = M(`${stem(id)}.js`);
  fs.writeFileSync(out, `/* 자동 생성 — tools/zone-models.mjs (fal.ai nano-banana → Tripo). 직접 고치지 말 것 */\n` +
    `(function (root) { root.PB = root.PB || {}; (root.PB.${reg} = root.PB.${reg} || {})[${JSON.stringify(id)}] = ${JSON.stringify(data)}; })(typeof window !== 'undefined' ? window : globalThis);\n`);
  return `팩 ${Math.round(fs.statSync(out).size / 1024)}KB · 정점 ${data.vertices} · 삼각형 ${data.triangles} · 밝기 ${info.mean[0]}→${info.mean[1]}(보정 ${info.bright})`;
}

function writeIndex() {
  const ids = Object.keys(ZONES).filter((id) => fs.existsSync(M(`zone-${id}.js`))), stops = Object.keys(STOPS).filter((id) => fs.existsSync(M(`${id}.js`)));
  fs.writeFileSync(M('zones.js'), `/* 자동 생성 — tools/zone-models.mjs. 모델이 있는 구역·정류장 시설(view3d가 assets/models/zone-<id>.js·stop-<등급>.js를 불러옴) */\n` +
    `(function (root) { root.PB = root.PB || {}; root.PB.zoneModelIds = ${JSON.stringify(ids)}; root.PB.stopModelIds = ${JSON.stringify(stops)}; })(typeof window !== 'undefined' ? window : globalThis);\n`);
  return ids.concat(stops);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const ids = rest.length ? rest : Object.keys(ITEMS);
  const step = { image, model, pack }[cmd];
  if (!step) { console.error('사용법: node publicness/tools/zone-models.mjs image|model|pack [구역...]'); process.exit(1); }
  // fal 호출은 구역끼리 동시에(대기열이라 기다리는 시간이 길다), 팩은 헤드리스 Edge를 쓰니 하나씩
  const results = cmd === 'pack'
    ? await ids.reduce((p, id) => p.then(async (acc) => { try { acc.push(`✓ ${id} ${ITEMS[id].name}: ${await step(id)}`); } catch (e) { acc.push(`✗ ${id}: ${e.message}`); process.exitCode = 1; } return acc; }), Promise.resolve([]))
    : await Promise.all(ids.map(async (id) => { try { return `✓ ${id} ${ITEMS[id].name}: ${await step(id)}`; } catch (e) { process.exitCode = 1; return `✗ ${id}: ${e.message}`; } }));
  results.forEach((r) => console.log(r));
  if (cmd === 'pack') console.log('목록 zones.js:', writeIndex().join(' '));
}
