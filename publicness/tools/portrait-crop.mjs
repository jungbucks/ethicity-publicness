// 설정 시트에서 인물 초상(512px 원형, 흰 바탕 — portrait-jinho-calm과 같은 꼴)을 잘라 PNG(원본, 로컬)·WebP(게임용)로 만든다.
//   node publicness/tools/portrait-crop.mjs            → CROPS 전부
// 유나·다은은 따로 그린 초상이 없어 지도·결과·엔딩에서 함께 그린 컷(interlude-cheer)을 확대하거나 이름 글자로 대신했다(2026-10-27 사용자 지시로 교체).
// 자르는 범위는 시트 원본 픽셀 좌표 [x, y, 한 변] — 얼굴이 원의 위쪽 가운데, 어깨까지 오게 눈으로 맞춘 값
import fs from 'node:fs';import path from 'node:path';import {createRequire} from 'node:module';import {fileURLToPath} from 'node:url';import {startServer} from '../tests/serve.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const PB=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const CROPS={ yuna:{ sheet:'sheet-cheer.png', box:[600,21,270] }, daeun:{ sheet:'sheet-cheer.png', box:[892,18,290] } };
const server=await startServer(0),browser=await chromium.launch({channel:'msedge',headless:true});
try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/publicness/index.html`);
 for(const [id,c] of Object.entries(CROPS)){
  const out=await page.evaluate(async ([src,box])=>{const img=await new Promise((ok,no)=>{const i=new Image();i.onload=()=>ok(i);i.onerror=no;i.src=src;});
    const N=512,cv=document.createElement('canvas');cv.width=cv.height=N;const x=cv.getContext('2d');
    x.beginPath();x.arc(N/2,N/2,N/2,0,Math.PI*2);x.closePath();x.clip();x.fillStyle='#fff';x.fillRect(0,0,N,N);
    x.imageSmoothingQuality='high';x.drawImage(img,box[0],box[1],box[2],box[2],0,0,N,N);
    return {png:cv.toDataURL('image/png').split(',')[1],webp:cv.toDataURL('image/webp',0.86).split(',')[1]};},['assets/art/'+c.sheet,c.box]);
  fs.writeFileSync(path.join(PB,`assets/art/portrait-${id}-calm.png`),Buffer.from(out.png,'base64'));
  fs.writeFileSync(path.join(PB,`assets/art/portrait-${id}-calm.webp`),Buffer.from(out.webp,'base64'));
  console.log(`✓ portrait-${id}-calm.png/.webp ← ${c.sheet} ${c.box.join(',')}`);
 }
}finally{await browser.close();server.close();}
